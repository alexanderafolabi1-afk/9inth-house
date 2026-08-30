// The admin API behind desk.html.
//
// Every route here is authenticated. There is no read only route and no public
// route: an endpoint that fires posts and answers to anyone who finds the URL is
// a defect, not a convenience. Authentication is the same bearer session token
// the rest of the admin uses (see mintSession/requireSession in
// worker/src/auth.js): the browser signs in once with the owner's password,
// the Worker hands back a signed token in the response body, and desk.html
// attaches it as an Authorization header on every call after that. Not a
// cookie: desk.html lives on 9thpoint.com and this Worker answers on its own
// workers.dev address, and a cookie set across those two is a cross-site
// cookie no matter how it is configured, which mobile Safari does not
// reliably keep. A bearer header has no such policy to run into. If
// SESSION_SECRET is missing, sessions cannot be verified and every route
// here declines, closed by default, rather than falling open.
//
// The session token is the only credential the admin ever holds. It cannot
// reach Anthropic, GitHub or the Make endpoint directly: those secrets stay on
// the Worker and the admin only ever asks the Worker to act.

import { PLATFORMS, CATEGORIES, SENDABLE, platformKeys, isPlatform } from './config.js';
import {
  hasStore, ensureSchema, seedVentures, listVentures, upsertVenture, getVenture,
  listPosts, getPost, setStatus, updatePostText, schedulePost, dueScheduled,
  savePushSub, deletePushSub,
  recordFeedback, feedbackFor, repeatedReasons
} from './db.js';
import { publishPost } from './distribute.js';
import { factsFor, recentChanges, putFact, runFactsSweep, DEFAULT_STALE_HOURS } from './facts.js';
import { SENDABLE as PENDING_STATUSES } from './config.js';
import { credentialDeliveries, credentialStatusFor, writeCredentialsFor } from './senders/index.js';
import { getWebhookUrl, setWebhookUrl, describeWebhookUrl } from '../n8n.js';
import { getAnthropicKey, setAnthropicKey, anthropicKeyStatus, describeAnthropicKey } from '../aikey.js';
import { runGeneration } from './generate.js';
import { ingestMetrics, ventureSummary } from './metrics.js';
import { getVapidKeys, pushConfigured, notifyOwner } from './push.js';
import { sanitiseSocialText, hasDashPunctuation, stripDashPunctuation } from './text.js';
import { requireSession, getOrCreateN8nToken, regenerateN8nToken } from '../auth.js';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

// One place decides who may call this API from a browser. Anything not on the
// list gets no CORS headers at all, which is what a browser needs in order to
// refuse the response. Exported because desk.html calls this Worker on its
// own workers.dev address, a genuinely cross-origin request from
// 9thpoint.com's point of view, so every route in the Worker needs these
// headers available, not only the ones under /social; index.js applies this
// same function to everything it answers, see the fetch wrapper there.
export function allowedOrigins(env) {
  const raw = env.DESK_ORIGIN || 'https://9thpoint.com,https://www.9thpoint.com';
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

export function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const headers = { 'Vary': 'Origin' };
  if (origin && allowedOrigins(env).includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    // Authorization is what carries the bearer session token (see
    // mintSession/requireSession in auth.js); without it listed here a
    // cross-origin request could not send that header at all. X-NH-Method
    // and X-NH-Body are for the method-tunnel fallback in desk.html's
    // engine(), still kept as a second line of defence and needing these
    // allowed if it is ever the one that ends up firing. No credentials
    // header: nothing here is a cookie, so there is nothing that needs one.
    headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type, X-NH-Method, X-NH-Body';
    headers['Access-Control-Max-Age'] = '86400';
  }
  return headers;
}

function json(request, env, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...corsHeaders(request, env) }
  });
}

async function readJson(request) {
  try {
    const body = await request.json();
    return body && typeof body === 'object' ? body : {};
  } catch (e) {
    return {};
  }
}

// Sent when a route needs storage and there is none, so the admin can say what to
// do about it instead of showing an unexplained failure.
function noStore(request, env) {
  return json(request, env, {
    ok: false,
    storage: false,
    error: 'Storage is not connected yet. Create the D1 database, add the binding to worker/wrangler.toml, then use Prepare storage. See worker/README.md.'
  }, 503);
}

/* ---------- the router ---------- */

export function isSocialRoute(pathname) {
  return pathname === '/social' || pathname.startsWith('/social/');
}

export async function handleSocial(request, env, ctx, { ask, gatherArticles }) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/social';

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  }

  if (!(await requireSession(request, env))) {
    // The same answer whether the session is missing, expired, or SESSION_SECRET
    // was never set, so nothing here reports on the Worker's own configuration
    // to a stranger.
    return json(request, env, { ok: false, error: 'Not signed in.' }, 401);
  }

  const db = env.DB;
  // Routes that touch the queue need the database. Credentials and settings do
  // not, and must not be gated on it: they live in KV, and locking the screens
  // that configure the house behind the database means a house that cannot be
  // configured on the day the database is the thing that is wrong. The Anthropic
  // key is the sharpest case, since nothing in the house can think without it.
  const noStoreNeeded = [
    '/social/push/keys', '/social/selfcheck',
    '/social/n8n-token', '/social/n8n-token/regenerate',
    '/social/anthropic-key', '/social/credentials', '/social/n8n-webhook'
  ];
  const needsStore = !noStoreNeeded.includes(path);
  if (needsStore && !hasStore(env)) return noStore(request, env);

  const body = request.method === 'POST' ? await readJson(request) : {};

  try {
    switch (`${request.method} ${path}`) {
      /* ---- setup ---- */

      case 'POST /social/migrate': {
        await ensureSchema(db);
        const seeded = await seedVentures(db);
        return json(request, env, { ok: true, seeded, message: seeded ? 'Storage prepared and the first venture seeded.' : 'Storage prepared.' });
      }

      case 'GET /social/selfcheck': {
        // Proves the configuration rather than asserting it, including the dash
        // rule, which is checked against a string that deliberately breaks it.
        const probe = stripDashPunctuation('One thing, then, another, and a third');
        return json(request, env, {
          ok: true,
          storage: hasStore(env),
          makeWebhook: Boolean(env.MAKE_WEBHOOK_URL),
          push: await pushConfigured(env),
          n8n: Boolean(env.LOGIN_ATTEMPTS),
          emailFallback: Boolean(env.NOTIFY_EMAIL_WEBHOOK),
          metricsWebhook: Boolean(env.METRICS_WEBHOOK_URL),
          anthropic: Boolean(await getAnthropicKey(env)),
          loginRateLimit: Boolean(env.LOGIN_ATTEMPTS),
          platforms: platformKeys(),
          dashRuleHolds: !hasDashPunctuation(probe),
          allowedOrigins: allowedOrigins(env)
        });
      }

      /* ---- the queue ---- */

      case 'GET /social/queue': {
        const statuses = (url.searchParams.get('status') || 'queued,approved,scheduled,failed,posting').split(',');
        const posts = await listPosts(db, { statuses, limit: Number(url.searchParams.get('limit')) || 100 });
        const ventures = await listVentures(db, {});
        const summary = await ventureSummary(db, {});
        return json(request, env, {
          ok: true,
          storage: true,
          posts,
          ventures,
          summary,
          // The admin renders limits and labels from this, so it never carries its
          // own copy of anything platform specific.
          platforms: PLATFORMS,
          categories: CATEGORIES,
          vapidPublicKey: (await getVapidKeys(env))?.publicKey || null,
          makeReady: Boolean(env.MAKE_WEBHOOK_URL)
        });
      }

      case 'GET /social/posted': {
        const posts = await listPosts(db, { statuses: ['posted', 'skipped'], limit: Number(url.searchParams.get('limit')) || 60 });
        return json(request, env, { ok: true, posts });
      }

      /* ---- one card at a time ---- */

      case 'POST /social/approve':
      case 'POST /social/retry': {
        if (!body.id) return json(request, env, { ok: false, error: 'no post id was given' }, 400);
        const post = await getPost(db, body.id);
        if (!post) return json(request, env, { ok: false, error: 'that post no longer exists' }, 404);
        const result = await publishPost(env, db, post, { sendable: SENDABLE });
        return json(request, env, { ok: result.ok, ...result, post: await getPost(db, body.id) }, result.ok ? 200 : 409);
      }

      case 'POST /social/approve-all': {
        const requested = Array.isArray(body.ids) ? body.ids : null;
        const pool = requested
          ? (await Promise.all(requested.map((id) => getPost(db, id)))).filter(Boolean)
          : await listPosts(db, { statuses: ['queued', 'approved'], limit: 100 });

        // Each publish is one outbound call, and a Worker request has a subrequest
        // ceiling. Twenty five at a time keeps a large morning inside it, and the
        // answer says what is left so the admin can send the rest.
        const batch = pool.slice(0, 25);
        const results = [];
        for (const post of batch) {
          const r = await publishPost(env, db, post, { sendable: SENDABLE });
          results.push({ id: post.id, ok: r.ok, reason: r.reason || '' });
        }
        return json(request, env, {
          ok: true,
          sent: results.filter((r) => r.ok).length,
          failed: results.filter((r) => !r.ok).length,
          remaining: Math.max(0, pool.length - batch.length),
          results
        });
      }

      case 'POST /social/skip': {
        if (!body.id) return json(request, env, { ok: false, error: 'no post id was given' }, 400);
        // Read before the status changes, so the reason can be filed against the
        // persona and venture that actually produced it rather than against a
        // bare id nobody can trace later.
        const skipped = await getPost(db, body.id);
        const ok = await setStatus(db, body.id, 'skipped');
        // A skip is the strongest signal in the system, so it is kept rather than
        // deleted: generation reads it back as a negative weight on that category.
        // The reason, where one was given, is worth more than the skip itself,
        // and is recorded whether or not it is empty so the weighting stays
        // honest about how often a verdict came with no explanation.
        if (ok) {
          await recordFeedback(db, {
            itemKind: 'social_post',
            itemId: body.id,
            persona: body.persona || (skipped && skipped.persona) || null,
            venture: skipped ? skipped.venture : null,
            category: skipped ? skipped.category : null,
            verdict: 'rejected',
            reason: body.reason || ''
          });
        }
        return json(request, env, { ok, error: ok ? '' : 'that post has already gone out and cannot be skipped' }, ok ? 200 : 409);
      }

      // The reject reason for anything in the admin that is not a queued post:
      // a docket item, a prospect, a scoring change, a facts sheet correction.
      // One route rather than one per surface, so a new surface inherits the
      // mechanism instead of quietly shipping without it.
      case 'POST /social/feedback': {
        if (!body.itemKind || !body.itemId) {
          return json(request, env, { ok: false, error: 'itemKind and itemId are both required' }, 400);
        }
        await recordFeedback(db, {
          itemKind: body.itemKind,
          itemId: body.itemId,
          persona: body.persona,
          venture: body.venture,
          category: body.category,
          verdict: body.verdict || 'rejected',
          reason: body.reason || ''
        });
        return json(request, env, { ok: true }, 201);
      }

      // What a persona is shown before it writes for this venture again, and
      // the reasons given more than once, which Section 7 acts on without
      // waiting for a full sample.
      case 'GET /social/feedback': {
        const persona = url.searchParams.get('persona') || undefined;
        const venture = url.searchParams.get('venture') || undefined;
        return json(request, env, {
          ok: true,
          recent: await feedbackFor(db, { persona, venture }),
          repeated: await repeatedReasons(db, { venture })
        });
      }

      case 'POST /social/unskip': {
        if (!body.id) return json(request, env, { ok: false, error: 'no post id was given' }, 400);
        const ok = await setStatus(db, body.id, 'queued');
        return json(request, env, { ok, error: ok ? '' : 'that post cannot be returned to the queue' }, ok ? 200 : 409);
      }

      case 'POST /social/text': {
        if (!body.id) return json(request, env, { ok: false, error: 'no post id was given' }, 400);
        const cleaned = sanitiseSocialText(String(body.text || ''));
        if (!cleaned) return json(request, env, { ok: false, error: 'the post cannot be left empty' }, 400);
        const post = await getPost(db, body.id);
        if (!post) return json(request, env, { ok: false, error: 'that post no longer exists' }, 404);
        const limit = PLATFORMS[post.platform] ? PLATFORMS[post.platform].limit : 3000;
        if (cleaned.length > limit) {
          return json(request, env, { ok: false, error: `that is ${cleaned.length} characters and the limit is ${limit}` }, 400);
        }
        const ok = await updatePostText(db, body.id, cleaned);
        return json(request, env, { ok, text: cleaned, error: ok ? '' : 'that post has already gone out and cannot be edited' }, ok ? 200 : 409);
      }

      case 'POST /social/image': {
        if (!body.id) return json(request, env, { ok: false, error: 'no post id was given' }, 400);
        const raw = String(body.image_url || '').trim();
        if (raw && !/^https:\/\/[^\s]+$/i.test(raw)) {
          return json(request, env, { ok: false, error: 'the image address must be a full https link' }, 400);
        }
        const res = await db.prepare('UPDATE posts SET image_url = ?, updated_at = ? WHERE id = ? AND status != \'posted\'')
          .bind(raw || null, new Date().toISOString(), body.id).run();
        const ok = (res && res.meta ? res.meta.changes : 0) === 1;
        return json(request, env, { ok, error: ok ? '' : 'that post cannot be changed now' }, ok ? 200 : 409);
      }

      case 'POST /social/schedule': {
        if (!body.id) return json(request, env, { ok: false, error: 'no post id was given' }, 400);
        const when = new Date(body.when);
        if (!body.when || Number.isNaN(when.getTime())) {
          return json(request, env, { ok: false, error: 'that is not a time I can read' }, 400);
        }
        const ok = await schedulePost(db, body.id, when.toISOString());
        return json(request, env, { ok, scheduled_for: when.toISOString(), error: ok ? '' : 'that post has already gone out' }, ok ? 200 : 409);
      }

      /* ---- generation, run by hand ---- */

      case 'POST /social/generate': {
        if (!(await getAnthropicKey(env))) return json(request, env, { ok: false, error: 'No Anthropic key is stored yet. Open the desk Settings, find the Anthropic key panel, and paste one in.' }, 503);
        const articles = typeof gatherArticles === 'function' ? await gatherArticles(env) : [];
        const result = await runGeneration(env, db, { ask, articles, now: new Date() });
        return json(request, env, { ok: true, created: result.created.length, notes: result.notes, posts: result.created });
      }

      /* ---- the sweep, run by hand as well as on the cron ---- */

      case 'POST /social/sweep': {
        const due = await dueScheduled(db, new Date().toISOString(), 25);
        const results = [];
        for (const post of due) {
          const r = await publishPost(env, db, post, { sendable: SENDABLE });
          results.push({ id: post.id, ok: r.ok, reason: r.reason || '' });
        }
        return json(request, env, { ok: true, due: due.length, sent: results.filter((r) => r.ok).length, results });
      }

      /* ---- metrics ---- */

      case 'POST /social/metrics': {
        const rows = Array.isArray(body.metrics) ? body.metrics : (Array.isArray(body) ? body : []);
        const result = await ingestMetrics(db, rows);
        return json(request, env, { ok: true, ...result });
      }

      /* ---- the registry ---- */

      case 'GET /social/ventures': {
        return json(request, env, { ok: true, ventures: await listVentures(db, {}), platforms: PLATFORMS, categories: CATEGORIES });
      }

      case 'POST /social/ventures': {
        // This is how a venture is added. No deploy, no code change, no help.
        try {
          const saved = await upsertVenture(db, body);
          return json(request, env, { ok: true, venture: saved });
        } catch (e) {
          return json(request, env, { ok: false, error: String(e && e.message ? e.message : e) }, 400);
        }
      }

      case 'POST /social/ventures/active': {
        const venture = await getVenture(db, String(body.slug || ''));
        if (!venture) return json(request, env, { ok: false, error: 'no venture with that slug' }, 404);
        const saved = await upsertVenture(db, { ...venture, active: body.active === false ? 0 : 1 });
        return json(request, env, { ok: true, venture: saved });
      }

      /* ---- notifications ---- */

      case 'POST /social/push/keys': {
        // getVapidKeys generates and stores a pair in KV the first time this
        // is called with none there yet, and returns the same pair on every
        // call after that. The private key never leaves the Worker: only
        // the public one, which is what the browser needs to subscribe, is
        // returned here.
        const keys = await getVapidKeys(env);
        if (!keys) {
          return json(request, env, { ok: false, error: 'LOGIN_ATTEMPTS is not bound, so there is nowhere to store notification keys. See worker/README.md.' }, 503);
        }
        return json(request, env, { ok: true, publicKey: keys.publicKey });
      }

      // The token n8n's HTTP Request node authenticates with, against the
      // separate bearer-authenticated /n8n/* routes in index.js, not this
      // API's own session-token authentication. Generated and stored in KV
      // the first time this is called, same as VAPID keys above, so there is
      // nothing to set up in the Cloudflare dashboard: sign in, open
      // Settings, copy the token into n8n.
      case 'GET /social/n8n-token': {
        const token = await getOrCreateN8nToken(env);
        if (!token) {
          return json(request, env, { ok: false, error: 'LOGIN_ATTEMPTS is not bound, so there is nowhere to store an n8n token. See worker/README.md.' }, 503);
        }
        return json(request, env, { ok: true, token });
      }

      // Rotates the token, invalidating whatever n8n currently has configured.
      case 'POST /social/n8n-token/regenerate': {
        const token = await regenerateN8nToken(env);
        if (!token) {
          return json(request, env, { ok: false, error: 'LOGIN_ATTEMPTS is not bound, so there is nowhere to store an n8n token. See worker/README.md.' }, 503);
        }
        return json(request, env, { ok: true, token });
      }

      // Credentials for the deliveries that post directly rather than through
      // the rail. Routed on the delivery name, never on a platform name, so
      // this file stays free of platform specifics and a future direct sender
      // gets a settings screen without an edit here.
      //
      // Read only, and deliberately partial: a sender reports whether it holds
      // a credential and enough to recognise it, never the credential. An
      // endpoint that handed back a posting token would undo the point of
      // keeping it out of the repository.
      case 'GET /social/credentials': {
        const out = {};
        for (const name of credentialDeliveries()) {
          out[name] = await credentialStatusFor(env, name);
        }
        return json(request, env, { ok: true, deliveries: out });
      }

      // Writes them. An empty token is refused rather than stored, because
      // storing one would quietly disable posting on that delivery and read as
      // a successful save.
      case 'POST /social/credentials': {
        const delivery = String(body.delivery || '');
        if (!credentialDeliveries().includes(delivery)) {
          return json(request, env, { ok: false, error: `"${delivery}" is not a delivery that holds credentials` }, 400);
        }
        if (!String(body.token || '').trim()) {
          return json(request, env, { ok: false, error: 'An access token is required. Paste the one from the platform, it is not something to invent.' }, 400);
        }
        const authors = String(body.authors || '').trim();
        if (authors) {
          try {
            const parsed = JSON.parse(authors);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
          } catch (e) {
            return json(request, env, { ok: false, error: 'The per venture page list has to be a JSON object, for example {"glotemp":"urn:li:organization:123"}. Leave it empty to post every venture as the same page.' }, 400);
          }
        }
        const written = await writeCredentialsFor(env, delivery, {
          token: body.token,
          authors,
          defaultAuthor: body.defaultAuthor,
          version: body.version
        });
        if (!written) {
          return json(request, env, { ok: false, error: 'LOGIN_ATTEMPTS is not bound, so there is nowhere to store credentials. See worker/README.md.' }, 503);
        }
        return json(request, env, { ok: true, status: await credentialStatusFor(env, delivery) });
      }

      // The key every partner in the house runs on. Read only, and never the
      // key itself: whether one is held and its last four characters, which is
      // enough to see a rotation took without handing a browser something that
      // can spend money.
      // The sheet, with every entry's provenance attached. This is what the
      // owner reads to sanity check a number without re-deriving it himself.
      case 'GET /social/facts': {
        const venture = url.searchParams.get('venture') || undefined;
        const ventures = venture ? [{ slug: venture }] : await listVentures(db, { activeOnly: false });
        const sheets = {};
        for (const v of ventures) sheets[v.slug] = await factsFor(db, v.slug);
        return json(request, env, { ok: true, sheets, changes: await recentChanges(db, { venture }) });
      }

      // A correction made by hand. Goes through the same putFact as the live
      // refresh, so it is logged as a change like any other and triggers the
      // same re-check of anything pending against it.
      case 'POST /social/facts': {
        if (!body.venture || !body.key || !String(body.value || '').trim()) {
          return json(request, env, { ok: false, error: 'venture, key and value are all required' }, 400);
        }
        const outcome = await putFact(db, {
          venture: body.venture, key: body.key, value: body.value,
          sourceUrl: body.source_url || 'set by hand in the admin'
        });
        return json(request, env, { ok: true, ...outcome, facts: await factsFor(db, body.venture) });
      }

      // The sweep, on demand. The same run the shift does, so what the owner
      // triggers here and what happens overnight cannot drift apart.
      case 'POST /social/facts/sweep': {
        const ventures = await listVentures(db, { activeOnly: true });
        const report = await runFactsSweep(env, db, {
          ask,
          ventures,
          staleHours: Number(body.staleHours) || DEFAULT_STALE_HOURS,
          refreshFirst: body.refresh !== false,
          listPosts,
          PENDING_STATUSES
        });
        return json(request, env, { ok: true, report });
      }

      case 'GET /social/anthropic-key': {
        return json(request, env, { ok: true, status: await anthropicKeyStatus(env) });
      }

      // Checked before it is stored. A key with a stray line break, or half
      // copied, or from another service, otherwise looks saved and then fails
      // hours later on a shift nobody is watching.
      case 'POST /social/anthropic-key': {
        const key = String(body.key || '');
        const check = describeAnthropicKey(key);
        if (!check.ok) {
          return json(request, env, { ok: false, error: check.problems.join(' ') }, 400);
        }
        const written = await setAnthropicKey(env, key);
        if (!written) {
          return json(request, env, { ok: false, error: 'LOGIN_ATTEMPTS is not bound, so there is nowhere to store the key. See worker/README.md.' }, 503);
        }
        return json(request, env, { ok: true, status: await anthropicKeyStatus(env), warnings: check.warnings });
      }

      // The address the engine tells n8n things on, as opposed to the token
      // n8n uses to call the engine. Kept out of the repository because this
      // repository is public and a webhook address published to everyone is a
      // way in for anyone.
      case 'GET /social/n8n-webhook': {
        const url = await getWebhookUrl(env);
        return json(request, env, { ok: true, url, check: describeWebhookUrl(url) });
      }

      // Saved with its warnings rather than instead of them, so an address that
      // will not work is not stored silently as though it will. Only an
      // unreadable address is refused; the rest is the owner's call.
      case 'POST /social/n8n-webhook': {
        const url = String(body.url || '');
        const check = describeWebhookUrl(url);
        if (!check.ok) {
          return json(request, env, { ok: false, error: check.problems.join(' ') }, 400);
        }
        const written = await setWebhookUrl(env, url);
        if (!written) {
          return json(request, env, { ok: false, error: 'LOGIN_ATTEMPTS is not bound, so there is nowhere to store the address. See worker/README.md.' }, 503);
        }
        return json(request, env, { ok: true, url: url.trim(), check });
      }

      case 'POST /social/push/subscribe': {
        const endpoint = String(body.endpoint || '');
        const keys = body.keys || {};
        if (!/^https:\/\//.test(endpoint) || !keys.p256dh || !keys.auth) {
          return json(request, env, { ok: false, error: 'that subscription is incomplete' }, 400);
        }
        await savePushSub(db, { endpoint, p256dh: String(keys.p256dh), auth: String(keys.auth) });
        return json(request, env, { ok: true });
      }

      case 'POST /social/push/unsubscribe': {
        await deletePushSub(db, String(body.endpoint || ''));
        return json(request, env, { ok: true });
      }

      case 'POST /social/push/test': {
        const result = await notifyOwner(env, db, {
          title: 'Ninth House',
          body: 'Notifications are working. This is the only test you will get.',
          url: '/desk.html#queue'
        });
        return json(request, env, { ok: result.channel !== 'none', ...result });
      }

      default:
        return json(request, env, { ok: false, error: 'no such route' }, 404);
    }
  } catch (e) {
    // Never echo a secret. Everything thrown in here is either our own message or
    // a D1 error, neither of which carries a credential.
    const message = String(e && e.message ? e.message : e).slice(0, 300);
    console.error('Social API failed on ' + path + ': ' + message);
    return json(request, env, { ok: false, error: message }, 500);
  }
}
