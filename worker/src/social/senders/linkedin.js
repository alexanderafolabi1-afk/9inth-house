// Posts to LinkedIn directly, with no rail in between.
//
// This is a platform adapter, so unlike the rest of the engine it is allowed to
// know what LinkedIn is. Everything generic stays generic: distribute.js picks a
// sender by the delivery name on the platform's config entry and never mentions
// this file or this platform. Adding a second direct platform means another file
// beside this one and one word in config.js, not an edit to the machinery.
//
// Why direct rather than through Make. The rail charges an operation per hop and
// the free allowance is small enough that a normal posting week exhausts it, so
// the rail was the binding constraint on how often the house could speak. Talking
// to LinkedIn from here costs nothing per post and removes a moving part.
//
// Credentials are read at runtime and never written down here. Nothing in this
// file is specific to one account.

const API = 'https://api.linkedin.com/rest';

// LinkedIn requires a dated version header on every REST call and rejects the
// request outright without one. Pinned rather than floating, so a change in
// their API is a deliberate edit here after reading their changelog, never a
// silent shift under a running house. Overridable from the desk so it can be
// moved without a deploy if a version is retired at short notice.
const DEFAULT_VERSION = '202508';

// Where the credentials live, and why they are not Cloudflare secrets.
//
// Everything else the house needs at runtime moved into KV and out of the
// dashboard, because setting a Cloudflare secret means a terminal or a
// dashboard the owner does not have, and a value that cannot be set is a
// feature that cannot be used. The session secret and the n8n token both went
// this way. LinkedIn follows them, with one difference: those two are generated
// here, and this one comes from LinkedIn, so the desk has to be able to put it
// in. See the LinkedIn panel in the desk Settings.
//
// A Worker secret still wins if one is set, so an existing deployment that has
// one keeps working untouched.
const CREDENTIALS_KV_KEY = 'linkedin:credentials:v1';

export async function readCredentials(env) {
  const fromEnv = {
    token: env.LINKEDIN_ACCESS_TOKEN || '',
    authors: env.LINKEDIN_AUTHORS || '',
    defaultAuthor: env.LINKEDIN_DEFAULT_AUTHOR || '',
    version: env.LINKEDIN_API_VERSION || ''
  };
  if (fromEnv.token) return fromEnv;
  if (!env.LOGIN_ATTEMPTS) return fromEnv;
  const raw = await env.LOGIN_ATTEMPTS.get(CREDENTIALS_KV_KEY);
  if (!raw) return fromEnv;
  try {
    const stored = JSON.parse(raw);
    return {
      token: stored.token || '',
      authors: stored.authors || '',
      defaultAuthor: stored.defaultAuthor || '',
      version: stored.version || ''
    };
  } catch (e) {
    // A corrupt value must not read as a valid empty one that silently posts
    // nowhere. Treated as absent, which the caller reports plainly.
    return fromEnv;
  }
}

export async function writeCredentials(env, next) {
  if (!env.LOGIN_ATTEMPTS) return false;
  await env.LOGIN_ATTEMPTS.put(CREDENTIALS_KV_KEY, JSON.stringify({
    token: String(next.token || '').trim(),
    authors: String(next.authors || '').trim(),
    defaultAuthor: String(next.defaultAuthor || '').trim(),
    version: String(next.version || '').trim()
  }));
  return true;
}

// What the desk is allowed to see. Never the token itself: only whether one is
// held, and enough of a fingerprint to tell one token from another after a
// rotation. A read only endpoint that hands back a posting credential would
// undo the point of keeping it out of the repo.
export async function credentialStatus(env) {
  const c = await readCredentials(env);
  return {
    tokenSet: Boolean(c.token),
    tokenTail: c.token ? String(c.token).slice(-4) : '',
    authors: c.authors || '',
    defaultAuthor: c.defaultAuthor || '',
    version: c.version || DEFAULT_VERSION
  };
}

function headers(creds, extra) {
  return Object.assign({
    Authorization: `Bearer ${creds.token}`,
    'LinkedIn-Version': creds.version || DEFAULT_VERSION,
    'X-Restli-Protocol-Version': '2.0.0'
  }, extra || {});
}

// Which page or profile a venture posts as.
//
// authors is a JSON object of venture slug to URN, so a venture is added from
// the desk rather than by a deploy. defaultAuthor covers the single page case
// and is used for any venture the map does not name. A venture with neither is
// refused rather than posted under whichever page happened to be first, because
// putting one venture's copy on another venture's page is worse than not
// posting it.
export function resolveAuthor(creds, venture) {
  let map = {};
  if (creds.authors) {
    try {
      const parsed = JSON.parse(creds.authors);
      if (parsed && typeof parsed === 'object') map = parsed;
    } catch (e) {
      // A malformed map must not silently fall back to the default author, or
      // one venture's post goes out under another venture's name. Treated as
      // no map at all only when there is also no default, which is refused
      // below; where a default exists this is still safe because the default
      // is a deliberate single page setup.
      map = {};
    }
  }
  const urn = String(map[venture] || creds.defaultAuthor || '').trim();
  if (!urn) return null;
  // Accept a bare id or a full URN, so neither form is a silent failure.
  if (/^urn:li:(organization|person):/.test(urn)) return urn;
  if (/^\d+$/.test(urn)) return `urn:li:organization:${urn}`;
  return null;
}

// LinkedIn escapes a small set of characters in commentary as a hard rule, and
// answers 422 rather than posting if they are left raw. Applied last, after all
// house text rules have run, so it never changes what the copy says.
export function escapeCommentary(text) {
  return String(text == null ? '' : text).replace(/[(){}[\]<>@|~_*]/g, (c) => '\\' + c);
}

// A link is carried in the commentary rather than as a structured article,
// because LinkedIn builds the preview card from the first URL it finds and a
// structured article would need the same URL twice.
export function buildCommentary(post) {
  const text = String(post.text || '').trim();
  const link = String(post.link || '').trim();
  if (!link || text.includes(link)) return escapeCommentary(text);
  return escapeCommentary(text + '\n\n' + link);
}

export function buildPostBody(post, author, imageUrn) {
  const body = {
    author,
    commentary: buildCommentary(post),
    visibility: 'PUBLIC',
    distribution: {
      feedDistribution: 'MAIN_FEED',
      targetEntities: [],
      thirdPartyDistributionChannels: []
    },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false
  };
  if (imageUrn) {
    body.content = { media: { id: imageUrn } };
  }
  return body;
}

// LinkedIn returns the new post's URN in a header rather than in the body, and
// on some paths returns no body at all. Read from both, header first.
export function readPostUrn(res, parsedBody) {
  const fromHeader = res && res.headers && res.headers.get ? res.headers.get('x-restli-id') : null;
  if (fromHeader && String(fromHeader).trim()) return String(fromHeader).trim().slice(0, 300);
  if (parsedBody && typeof parsedBody === 'object') {
    for (const key of ['id', 'urn']) {
      const v = parsedBody[key];
      if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 300);
    }
  }
  return null;
}

// Turns a LinkedIn failure into something the owner can act on, rather than a
// status code sitting in the queue. The distinction that matters most is an
// expired token, because that is the one failure that will affect every post
// until a person does something about it.
export function describeFailure(status, bodyText) {
  const detail = String(bodyText || '').slice(0, 200);
  if (status === 401) {
    return 'LinkedIn rejected the credentials: the access token has expired or been revoked. A new token has to be issued before anything can post. ' + detail;
  }
  if (status === 403) {
    return 'LinkedIn refused the post: the token is valid but does not carry permission to post as this page. Check the app has the community management product and the page grants it. ' + detail;
  }
  if (status === 422) {
    return 'LinkedIn rejected the content itself, usually an unescaped character or an author that does not match the token. ' + detail;
  }
  if (status === 429) {
    return 'LinkedIn is rate limiting this app, so the post was not sent. It can be retried later. ' + detail;
  }
  return `LinkedIn answered ${status}: ` + (detail || 'no detail given');
}

// Three legged upload: ask for a slot, put the bytes, then reference the URN in
// the post. Only reached for a post that actually carries an image.
async function uploadImage(creds, author, imageUrl) {
  const init = await fetch(`${API}/images?action=initializeUpload`, {
    method: 'POST',
    headers: headers(creds, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ initializeUploadRequest: { owner: author } }),
    signal: AbortSignal.timeout(20000)
  });
  const initText = await init.text();
  if (!init.ok) {
    throw new Error('the image upload could not be started. ' + describeFailure(init.status, initText));
  }
  let parsed;
  try { parsed = JSON.parse(initText); } catch (e) { parsed = null; }
  const value = parsed && parsed.value ? parsed.value : null;
  if (!value || !value.uploadUrl || !value.image) {
    throw new Error('LinkedIn accepted the upload request but did not return somewhere to put the image');
  }

  const source = await fetch(imageUrl, { signal: AbortSignal.timeout(20000) });
  if (!source.ok) {
    throw new Error(`the image at ${imageUrl} could not be fetched, it answered ${source.status}`);
  }
  const bytes = await source.arrayBuffer();

  const put = await fetch(value.uploadUrl, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${creds.token}` },
    body: bytes,
    signal: AbortSignal.timeout(30000)
  });
  if (!put.ok) {
    throw new Error('the image was rejected on upload. ' + describeFailure(put.status, await put.text()));
  }
  return value.image;
}

// The sender contract every delivery in senders/index.js implements:
// (env, post) => { ok, status, externalId, reason }.
//
// It never touches the database. Claiming, marking posted and marking failed all
// stay in distribute.js, so idempotency is decided in exactly one place no
// matter which delivery a platform uses.
export async function send(env, post) {
  const creds = await readCredentials(env);
  if (!creds.token) {
    return { ok: false, reason: 'no LinkedIn access token is stored yet. Open the desk Settings, find the LinkedIn panel, and paste one in' };
  }
  const author = resolveAuthor(creds, post.venture);
  if (!author) {
    return {
      ok: false,
      reason: `no LinkedIn page is set for "${post.venture}". Add it in the desk Settings, under the LinkedIn panel, either against this venture by name or as the page every venture posts as`
    };
  }

  let imageUrn = null;
  const imageUrl = String(post.image_url || '').trim();
  if (imageUrl) {
    try {
      imageUrn = await uploadImage(creds, author, imageUrl);
    } catch (e) {
      return { ok: false, reason: String(e && e.message ? e.message : e).slice(0, 300) };
    }
  }

  let res;
  let bodyText = '';
  try {
    res = await fetch(`${API}/posts`, {
      method: 'POST',
      headers: headers(creds, {
        'Content-Type': 'application/json',
        // LinkedIn dedupes on this for a period, so a retry that crosses with a
        // success collapses into one post there as well as here.
        'X-RestLi-Method': 'create'
      }),
      body: JSON.stringify(buildPostBody(post, author, imageUrn)),
      signal: AbortSignal.timeout(20000)
    });
    bodyText = await res.text();
  } catch (e) {
    return { ok: false, reason: 'LinkedIn could not be reached: ' + String(e && e.message ? e.message : e).slice(0, 200) };
  }

  if (!res.ok) {
    return { ok: false, status: res.status, reason: describeFailure(res.status, bodyText) };
  }

  let parsed = null;
  try { parsed = bodyText ? JSON.parse(bodyText) : null; } catch (e) { parsed = null; }
  return { ok: true, status: res.status, externalId: readPostUrn(res, parsed) };
}
