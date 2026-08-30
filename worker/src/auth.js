// Session auth for the desk admin. One owner, one password.
//
// The password itself is never stored: only a PBKDF2 hash, kept as a value in
// the LOGIN_ATTEMPTS KV namespace (see PASSWORD_HASH_KV_KEY below), in the
// same "$" delimited format this file writes and reads. There is no secret
// to set in the Cloudflare dashboard for this: the very first person to open
// desk.html chooses the password there, on a "Create your password" screen,
// and this file hashes and stores it. See hashPassword/getStoredPasswordHash
// below, and worker/src/index.js's POST /auth/setup for the one-time claim.
//
// The session is a stateless, signed cookie rather than a server-side
// session store, so login does not depend on D1 being provisioned: it is a
// timestamp, HMAC-signed with the SESSION_SECRET secret, and verified by
// recomputing the signature. There is nothing to look up and nothing that
// can leak from a database, only a secret that must not leak.
//
// Login attempts are rate limited and locked out per IP using the
// LOGIN_ATTEMPTS KV binding. If that binding is absent, login is refused
// outright rather than left unlimited: closed by default, the same rule
// worker/src/social/api.js already applies to D1.

const COOKIE_NAME = 'nh_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

// Chosen against the Workers CPU budget, not against a recommendation sheet.
//
// The Workers Free plan allows 10 ms of CPU per HTTP request. Waiting on KV or
// the network does not count, so on this Worker essentially the whole budget is
// this one derivation. At 210000 iterations it measures about 35 ms, three and a
// half times over, and the result is not a slow login but no login at all: the
// request is killed for exceeding resources, and a route set to fail open then
// behaves as though no Worker existed and hands the request to the origin. The
// origin here is a static host, which refuses POST outright, so the desk saw a
// bare 404 on "Create your password" while the far cheaper GET that draws the
// same screen kept working. That asymmetry is the signature of this fault.
//
// 25000 measures about 4.5 ms on the whole signed-in path, derivation and
// session cookie together, which leaves better than double headroom for a
// slower edge CPU. It is a real reduction in resistance to an offline attack on
// a stolen hash, and it is a deliberate trade: the hash lives in KV rather than
// anywhere public, login is rate limited and locked out per IP, and there is
// one owner. A count the plan cannot execute protects nothing, because it never
// runs.
//
// On the Workers Paid plan the limit is 30 seconds rather than 10 ms, and this
// single number is the only thing to raise. verifyPassword reads the iteration
// count out of each stored hash rather than assuming this constant, so raising
// it never invalidates an existing password; that password keeps its old count
// until it is next changed.
const PBKDF2_ITERATIONS = 25000;

// The most expensive stored hash this Worker will agree to verify.
//
// verifyPassword takes its iteration count from the stored hash rather than
// from the constant above, which is what lets an existing password survive a
// change to that constant. The other edge of that is the trap this exists to
// close: a hash written at a count the plan cannot execute can never be
// verified, so every sign in attempt is killed mid-derivation and the desk is
// locked permanently, against the owner as much as anyone. Worse, it does not
// present as a locked door: the request dies and falls through to the site
// host, so the screen shows a bare 404 and nothing anywhere says why.
//
// Anchored to PBKDF2_ITERATIONS deliberately, so that raising that constant on
// a paid plan raises this with it. Left as a bare number, raising the write
// count above a fixed ceiling would make this Worker reject the very hashes it
// had just written, and the desk would reset itself on the next sign in.
const MAX_VERIFIABLE_ITERATIONS = Math.max(40000, PBKDF2_ITERATIONS);

// A deliberate, time boxed window in which the password can be set again from
// the first run screen, even though a usable one is already stored.
//
// This is the recovery path for a password nobody knows: the hash lives in KV
// with no way to reach it from the desk, and the alternative is an owner locked
// out of their own house with no route back that does not involve the Cloudflare
// dashboard. It is armed by PASSWORD_RESET_UNTIL in wrangler.toml, so opening it
// requires the ability to commit to this repository and deploy, which is the
// proof of ownership. There is deliberately no endpoint, no button and no header
// that can open it, because any of those could be reached by whoever found the
// address first.
//
// It closes by itself. The value is a timestamp, not a boolean, so a window left
// open by an unreverted commit still expires rather than standing open forever.
// A missing, empty, malformed or past value all mean closed.
export function passwordResetOpen(env) {
  const until = env && env.PASSWORD_RESET_UNTIL;
  if (!until) return false;
  const at = Date.parse(String(until).trim());
  if (!Number.isFinite(at)) return false;
  return Date.now() < at;
}

// Whether a stored hash can be checked at all on this plan, asked before any
// derivation is attempted rather than discovered by being killed part way
// through one. A false answer means nobody can sign in with it, the owner
// included, so the callers treat it as no usable password rather than as a
// wrong one: see /auth/session and /auth/setup in index.js, where it reopens
// the first run screen so a new password can be set over the dead one.
export function hashIsVerifiable(stored) {
  if (!stored) return false;
  const parts = String(stored).trim().split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = Number(parts[1]);
  if (!Number.isFinite(iterations) || iterations <= 0) return false;
  return iterations <= MAX_VERIFIABLE_ITERATIONS;
}
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_SECONDS = 15 * 60;
const ATTEMPTS_TTL_SECONDS = 60 * 60;

function b64urlEncode(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str) {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/* ---------- password hashing ---------- */

// Format: pbkdf2$<iterations>$<salt base64url>$<hash base64url>
// Produced and verified entirely on this side now (see hashPassword below);
// nothing outside the Worker ever needs to write or read this format.
async function derivePbkdf2(password, salt, iterations) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    keyMaterial,
    256
  );
  return new Uint8Array(bits);
}

// The KV key the password hash lives under, in the LOGIN_ATTEMPTS namespace
// (there is no dedicated namespace for it; one owner, one hash, does not
// justify provisioning another binding). Versioned the same way attemptsKey
// is below, so a future format change can be rolled out by bumping this
// string rather than migrating a stored value in place.
const PASSWORD_HASH_KV_KEY = 'admin:password_hash:v1';

async function generateSalt(bytes = 16) {
  return crypto.getRandomValues(new Uint8Array(bytes));
}

// Same format and same PBKDF2 parameters verifyPassword expects, so a hash
// produced here is indistinguishable from one that would have come from the
// old wrangler-secret workflow.
export async function hashPassword(password) {
  const salt = await generateSalt();
  const hash = await derivePbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64urlEncode(salt)}$${b64urlEncode(hash)}`;
}

// null means "no password has ever been set" as much as it means "KV is not
// bound" - both are treated as needing first-run setup by the caller, since
// there is nothing to sign in against either way.
export async function getStoredPasswordHash(env) {
  if (!env.LOGIN_ATTEMPTS) return null;
  return env.LOGIN_ATTEMPTS.get(PASSWORD_HASH_KV_KEY);
}

export async function setStoredPasswordHash(env, hash) {
  await env.LOGIN_ATTEMPTS.put(PASSWORD_HASH_KV_KEY, hash);
}

export async function verifyPassword(password, stored) {
  if (!password || !stored) return false;
  // A secret pasted into the dashboard can pick up a trailing newline or a
  // stray space; trimmed here rather than trusted, so a paste artifact reads
  // as a wrong password instead of crashing the request.
  const parts = String(stored).trim().split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = Number(parts[1]);
  if (!Number.isFinite(iterations) || iterations <= 0) return false;
  // Refused before the derivation rather than during it. Attempting this is
  // what killed the request and produced the unexplained 404; callers are
  // expected to have asked hashIsVerifiable first and routed the owner to set
  // a new password, so reaching here means a path that did not, and returning
  // false is the safe end of it.
  if (iterations > MAX_VERIFIABLE_ITERATIONS) return false;
  // b64urlDecode calls atob, which throws on anything that is not valid
  // base64url rather than returning a value, so a malformed stored hash (the
  // same paste artifact case) is caught here and treated as a login that
  // cannot succeed, not as a server error.
  try {
    const salt = b64urlDecode(parts[2]);
    const expected = b64urlDecode(parts[3]);
    const actual = await derivePbkdf2(password, salt, iterations);
    return constantTimeEqual(actual, expected);
  } catch (e) {
    return false;
  }
}

/* ---------- session cookie ---------- */

async function hmacKey(env) {
  if (!env.SESSION_SECRET) return null;
  return crypto.subtle.importKey(
    'raw', new TextEncoder().encode(env.SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']
  );
}

export async function mintSession(env) {
  const key = await hmacKey(env);
  if (!key) return null;
  const exp = Date.now() + SESSION_MAX_AGE * 1000;
  const payload = b64urlEncode(new TextEncoder().encode(JSON.stringify({ exp })));
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return `${payload}.${b64urlEncode(new Uint8Array(sig))}`;
}

async function verifySessionToken(token, env) {
  if (!token || typeof token !== 'string') return false;
  const key = await hmacKey(env);
  if (!key) return false;
  const dot = token.indexOf('.');
  if (dot < 0) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  let valid = false;
  try {
    valid = await crypto.subtle.verify('HMAC', key, b64urlDecode(sig), new TextEncoder().encode(payload));
  } catch (e) {
    return false;
  }
  if (!valid) return false;
  try {
    const { exp } = JSON.parse(new TextDecoder().decode(b64urlDecode(payload)));
    return typeof exp === 'number' && exp > Date.now();
  } catch (e) {
    return false;
  }
}

function readCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

// True only when the request carries a signature-valid, unexpired session
// cookie. Every admin route calls this; nothing here trusts the front end.
export async function requireSession(request, env) {
  const token = readCookie(request, COOKIE_NAME);
  return verifySessionToken(token, env);
}

// Path scoped to /api: the cookie is never needed on, or sent with, a plain
// page load, only on calls to the admin API.
export function sessionCookie(token) {
  return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/api; Max-Age=${SESSION_MAX_AGE}`;
}

export function clearedSessionCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/api; Max-Age=0`;
}

/* ---------- login rate limiting ---------- */

export function rateLimitConfigured(env) {
  return Boolean(env.LOGIN_ATTEMPTS);
}

// Versioned so any lockout already recorded under the old key is simply
// never read again the moment this changes: an instant, clean reset of every
// current lockout without touching KV directly or waiting one out.
function attemptsKey(ip) {
  return `fail:v2:${ip}`;
}

// Checked before the password is even looked at, so a locked-out IP never
// pays for a PBKDF2 derivation and never gets a timing signal either.
export async function checkLockout(env, ip) {
  const raw = await env.LOGIN_ATTEMPTS.get(attemptsKey(ip));
  if (!raw) return { locked: false };
  let state;
  try {
    state = JSON.parse(raw);
  } catch (e) {
    return { locked: false };
  }
  if (state.lockedUntil && state.lockedUntil > Date.now()) {
    return { locked: true, retryAfterSeconds: Math.ceil((state.lockedUntil - Date.now()) / 1000) };
  }
  return { locked: false };
}

export async function recordFailure(env, ip) {
  const key = attemptsKey(ip);
  const raw = await env.LOGIN_ATTEMPTS.get(key);
  let state = { count: 0 };
  if (raw) {
    try { state = JSON.parse(raw); } catch (e) { state = { count: 0 }; }
  }
  state.count = (state.count || 0) + 1;
  if (state.count >= LOCKOUT_THRESHOLD) {
    state.lockedUntil = Date.now() + LOCKOUT_SECONDS * 1000;
  }
  await env.LOGIN_ATTEMPTS.put(key, JSON.stringify(state), { expirationTtl: ATTEMPTS_TTL_SECONDS });
}

export async function resetAttempts(env, ip) {
  await env.LOGIN_ATTEMPTS.delete(attemptsKey(ip));
}
