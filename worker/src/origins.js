// Which browser origins may call this Worker cross-origin, and why the
// admin's own two real origins can never depend on getting that right.
//
// This used to be a single wrangler.toml `[vars]` line, DESK_ORIGIN, read
// with a hardcoded fallback if it was absent. That looked safe: absent
// falls back to the right value. What it did not protect against was
// present but wrong, whether from a stale deploy, an environment scoped
// differently than expected, or a Cloudflare dashboard variable that
// stopped matching what shipped in the repo without anything here able to
// see it happen. Any of those looks identical from the outside to a
// correctly configured Worker: a browser gets no Access-Control-Allow-
// Origin header, and every fetch from the real admin fails before it ever
// reaches a route, reporting as "cannot reach the house" for a right
// password and a wrong one alike. That is what actually happened, more
// than once.
//
// The fix is the same one this house already applies to the session
// secret, the Anthropic key, the n8n webhook and the VAPID keys: the two
// origins the admin has ever really lived at (see KNOWN_DESK_ORIGINS
// below) ship inside the Worker's own code, so accepting them can never
// depend on a deploy actually syncing a separate variable. Anything beyond
// that, a staging domain, a future move, is additive only, set from the
// desk and held in KV, the same as everything else the house needs at
// runtime and cannot afford a dashboard field for. Nothing here can ever
// end up refusing 9thpoint.com or www.9thpoint.com: there is no path,
// through Settings, through KV, through a stale env var, through anything,
// that subtracts from this list rather than adding to it.

// The CNAME file names 9thpoint.com as the canonical domain; the www
// variant is kept for whichever way a link or a bookmark happens to point.
export const KNOWN_DESK_ORIGINS = ['https://9thpoint.com', 'https://www.9thpoint.com'];

const EXTRA_ORIGINS_KV_KEY = 'desk:extra_origins:v1';

export async function extraOrigins(env) {
  if (!env || !env.LOGIN_ATTEMPTS) return [];
  try {
    const raw = await env.LOGIN_ATTEMPTS.get(EXTRA_ORIGINS_KV_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((o) => typeof o === 'string' && o) : [];
  } catch (e) {
    return [];
  }
}

// A bare origin: scheme, host, optional port, nothing else. No path, no
// trailing slash, no query, since a browser's Origin header is never any
// of those and an entry that could not match one would silently do
// nothing.
export function describeOrigin(raw) {
  const value = String(raw || '').trim().replace(/\/+$/, '');
  const problems = [];
  if (!value) { problems.push('An origin is required.'); return { ok: false, problems, value }; }
  let url;
  try { url = new URL(value); } catch (e) { problems.push(`"${value}" is not a web address.`); return { ok: false, problems, value }; }
  if (url.protocol !== 'https:') problems.push('Only https:// origins are accepted. A browser never sends an insecure one for this admin.');
  if (url.pathname !== '/' && url.pathname !== '') problems.push('An origin has no path. Give the scheme and host only, e.g. https://example.com.');
  if (url.search || url.hash) problems.push('An origin has no query string or fragment.');
  const normalised = `${url.protocol}//${url.host}`;
  return { ok: problems.length === 0, problems, value: normalised };
}

export async function setExtraOrigins(env, origins) {
  if (!env || !env.LOGIN_ATTEMPTS) throw new Error('LOGIN_ATTEMPTS is not bound, so there is nowhere to remember this.');
  const list = Array.isArray(origins) ? origins : [];
  const normalised = [];
  for (const o of list) {
    const check = describeOrigin(o);
    if (!check.ok) throw new Error(check.problems.join(' '));
    normalised.push(check.value);
  }
  const deduped = [...new Set(normalised)];
  await env.LOGIN_ATTEMPTS.put(EXTRA_ORIGINS_KV_KEY, JSON.stringify(deduped));
  return deduped;
}

// The legacy path: a wrangler.toml DESK_ORIGIN var, or one set by hand on
// the Cloudflare dashboard, if either is ever still present. Read, never
// required, and never able to replace KNOWN_DESK_ORIGINS below, only add
// to it, so a stale or wrong value here degrades to a no-op rather than a
// lockout.
function legacyEnvOrigins(env) {
  const raw = env && env.DESK_ORIGIN;
  if (!raw) return [];
  return String(raw).split(',').map((s) => s.trim()).filter(Boolean);
}

export async function allowedOrigins(env) {
  const extra = await extraOrigins(env);
  const legacy = legacyEnvOrigins(env);
  return [...new Set([...KNOWN_DESK_ORIGINS, ...extra, ...legacy])];
}
