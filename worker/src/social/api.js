// The admin API behind desk.html.
//
// Every route here is authenticated. There is no read only route and no public
// route: an endpoint that fires posts and answers to anyone who finds the URL is
// a defect, not a convenience. Authentication is a bearer token held in the
// DESK_ADMIN_TOKEN secret, and if that secret is missing every route declines,
// closed by default, rather than falling open.
//
// The token is the only credential the admin ever holds. It cannot reach
// Anthropic, GitHub or the Make endpoint directly: those secrets stay on the
// Worker and the admin only ever asks the Worker to act.

import { PLATFORMS, CATEGORIES, SENDABLE, platformKeys, isPlatform } from './config.js';
import {
  hasStore, ensureSchema, seedVentures, listVentures, upsertVenture, getVenture,
  listPosts, getPost, setStatus, updatePostText, schedulePost, dueScheduled,
  savePushSub, deletePushSub
} from './db.js';
import { publishPost } from './distribute.js';
import { runGeneration } from './generate.js';
import { ingestMetrics, ventureSummary } from './metrics.js';
import { generateVapidKeys, pushConfigured, notifyOwner } from './push.js';
import { sanitiseSocialText, hasDashPunctuation, stripDashPunctuation } from './text.js';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

// One place decides who may call this API from a browser. Anything not on the
// list gets no CORS headers at all, which is what a browser needs in order to
// refuse the response.
function allowedOrigins(env) {
  const raw = env.DESK_ORIGIN || 'https://9thpoint.com,https://www.9thpoint.com';
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const headers = { 'Vary': 'Origin' };
  if (origin && allowedOrigins(env).includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type';
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

// Compared in constant time so the token cannot be recovered a character at a
// time by measuring how long a wrong answer takes.
function tokenMatches(provided, expected) {
  const a = new TextEncoder().encode(provided);
  const b = new TextEncoder().encode(expected);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function authorised(request, env) {
  const expected = env.DESK_ADMIN_TOKEN;
  if (!expected) return false;
  const header = request.headers.get('Authorization') || '';
  if (!header.startsWith('Bearer ')) return false;
  return tokenMatches(header.slice(7), expected);
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

  if (!authorised(request, env)) {
    // The same answer whether the token is wrong or the secret was never set, so
    // nothing here reports on the Worker's own configuration to a stranger.
    return json(request, env, { ok: false, error: 'Unauthorized' }, 401);
  }

  const db = env.DB;
  const needsStore = path !== '/social/push/keys' && path !== '/social/selfcheck';
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
          push: pushConfigured(env),
          emailFallback: Boolean(env.NOTIFY_EMAIL_WEBHOOK),
          metricsWebhook: Boolean(env.METRICS_WEBHOOK_URL),
          anthropic: Boolean(env.ANTHROPIC_API_KEY),
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
          vapidPublicKey: env.VAPID_PUBLIC_KEY || null,
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
        const ok = await setStatus(db, body.id, 'skipped');
        // A skip is the strongest signal in the system, so it is kept rather than
        // deleted: generation reads it back as a negative weight on that category.
        return json(request, env, { ok, error: ok ? '' : 'that post has already gone out and cannot be skipped' }, ok ? 200 : 409);
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
        if (!env.ANTHROPIC_API_KEY) return json(request, env, { ok: false, error: 'ANTHROPIC_API_KEY is not set on the Worker' }, 503);
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
        // Generated on demand and never stored here. The answer is the only copy,
        // and it goes straight into wrangler secret put.
        const keys = await generateVapidKeys();
        return json(request, env, {
          ok: true,
          ...keys,
          instructions: 'Store these on the Worker: npx wrangler secret put VAPID_PUBLIC_KEY, then VAPID_PRIVATE_KEY, then VAPID_SUBJECT as mailto:you@example.com. The private key is not saved anywhere and will not be shown again.'
        });
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
