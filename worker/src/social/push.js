// Web push, sent by the Worker itself.
//
// No third party push service and no library: VAPID signing (RFC 8292) and
// payload encryption (RFC 8291, aes128gcm) both run on WebCrypto, which the
// Workers runtime provides. The owner gets told the batch is waiting without
// opening anything, which is the whole point of the morning notification.
//
// Keys live in secrets, never in the repo:
//   VAPID_PUBLIC_KEY   the base64url public key, also handed to the browser
//   VAPID_PRIVATE_KEY  the matching private key
//   VAPID_SUBJECT      mailto: address or site URL, required by the spec
//
// Generate a pair with the authenticated route POST /social/push/keys, which
// returns both values ready to paste into wrangler secret put. The private key is
// returned once and never stored by the Worker.

import { listPushSubs, deletePushSub, notePushResult } from './db.js';

/* ---------- small encodings ---------- */

const utf8 = (s) => new TextEncoder().encode(s);

export function bytesToB64url(bytes) {
  let bin = '';
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlToBytes(str) {
  const s = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = s + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concat(...parts) {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

/* ---------- HKDF, the two steps written out ---------- */

async function hmac(keyBytes, data) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, data));
}

// Extract then expand. Every length asked for here is 32 bytes or fewer, so a
// single expand round is always enough and the counter is a constant 0x01.
async function hkdf(salt, ikm, info, length) {
  const prk = await hmac(salt, ikm);
  const expanded = await hmac(prk, concat(info, new Uint8Array([1])));
  return expanded.slice(0, length);
}

/* ---------- keys ---------- */

// Returns a fresh pair for the owner to store as secrets. Called by the
// authenticated setup route; the private half is never persisted here.
export async function generateVapidKeys() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const rawPublic = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  return {
    publicKey: bytesToB64url(rawPublic),
    // The private key travels as base64url encoded JWK, which imports cleanly on
    // every runtime and avoids the raw scalar guesswork.
    privateKey: bytesToB64url(utf8(JSON.stringify({ kty: 'EC', crv: 'P-256', d: jwk.d, x: jwk.x, y: jwk.y })))
  };
}

// Accepts either form of private key: base64url encoded JWK JSON, which is what
// the setup route hands out, or a bare base64url 32 byte scalar as produced by
// the common web push tooling. The bare form needs the public key to supply the
// x and y coordinates.
async function importVapidPrivateKey(privateKeyStr, publicKeyStr) {
  const bytes = b64urlToBytes(privateKeyStr);
  let jwk = null;

  try {
    const maybe = JSON.parse(new TextDecoder().decode(bytes));
    if (maybe && maybe.kty === 'EC' && maybe.d) jwk = maybe;
  } catch (e) {
    jwk = null;
  }

  if (!jwk) {
    if (bytes.length !== 32) throw new Error('VAPID_PRIVATE_KEY is not a JWK and is not a 32 byte key');
    const pub = b64urlToBytes(publicKeyStr);
    if (pub.length !== 65 || pub[0] !== 4) throw new Error('VAPID_PUBLIC_KEY must be a 65 byte uncompressed point');
    jwk = {
      kty: 'EC',
      crv: 'P-256',
      d: bytesToB64url(bytes),
      x: bytesToB64url(pub.slice(1, 33)),
      y: bytesToB64url(pub.slice(33, 65))
    };
  }

  return await crypto.subtle.importKey(
    'jwk',
    { ...jwk, ext: true, key_ops: ['sign'] },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
}

export function pushConfigured(env) {
  return Boolean(env && env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT);
}

/* ---------- VAPID authorization ---------- */

async function vapidHeader(env, endpoint) {
  const aud = new URL(endpoint).origin;
  const header = { typ: 'JWT', alg: 'ES256' };
  const claims = {
    aud,
    // Twelve hours, comfortably inside the twenty four hour ceiling the spec sets.
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: env.VAPID_SUBJECT
  };
  const signingInput = `${bytesToB64url(utf8(JSON.stringify(header)))}.${bytesToB64url(utf8(JSON.stringify(claims)))}`;
  const key = await importVapidPrivateKey(env.VAPID_PRIVATE_KEY, env.VAPID_PUBLIC_KEY);
  // WebCrypto returns the raw r||s pair, which is exactly what JWS ES256 wants.
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, utf8(signingInput)));
  const jwt = `${signingInput}.${bytesToB64url(sig)}`;
  return `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`;
}

/* ---------- payload encryption ---------- */

const RECORD_SIZE = 4096;
// The body must fit one record: the record holds the plaintext, a one byte
// padding delimiter and the sixteen byte GCM tag.
const MAX_PLAINTEXT = RECORD_SIZE - 16 - 1;

export async function encryptPayload(p256dhB64, authB64, plaintextStr) {
  const uaPublicBytes = b64urlToBytes(p256dhB64);
  const authSecret = b64urlToBytes(authB64);
  if (uaPublicBytes.length !== 65) throw new Error('subscription key is not a 65 byte uncompressed point');

  const plaintext = utf8(plaintextStr);
  if (plaintext.length > MAX_PLAINTEXT) throw new Error('push payload is too long for one record');

  const uaPublic = await crypto.subtle.importKey(
    'raw', uaPublicBytes, { name: 'ECDH', namedCurve: 'P-256' }, false, []
  );
  const ephemeral = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', ephemeral.publicKey));

  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: uaPublic }, ephemeral.privateKey, 256)
  );

  // RFC 8291 section 3.3: the shared secret is bound to both public keys before
  // it becomes key material, which is what stops a swapped key going unnoticed.
  const keyInfo = concat(utf8('WebPush: info'), new Uint8Array([0]), uaPublicBytes, asPublic);
  const ikm = await hkdf(authSecret, shared, keyInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, concat(utf8('Content-Encoding: aes128gcm'), new Uint8Array([0])), 16);
  const nonce = await hkdf(salt, ikm, concat(utf8('Content-Encoding: nonce'), new Uint8Array([0])), 12);

  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  // 0x02 is the delimiter that marks this as the final record.
  const record = concat(plaintext, new Uint8Array([2]));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, aesKey, record)
  );

  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, RECORD_SIZE, false);

  // salt, record size, key id length, ephemeral public key, then the record.
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, ciphertext);
}

/* ---------- sending ---------- */

async function sendToSubscription(env, sub, payloadStr) {
  const body = await encryptPayload(sub.p256dh, sub.auth, payloadStr);
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      'TTL': '86400',
      'Urgency': 'normal',
      'Authorization': await vapidHeader(env, sub.endpoint)
    },
    body,
    signal: AbortSignal.timeout(15000)
  });
  return res;
}

// Sends one notification to every stored subscription.
//
// A subscription the push service has retired answers 404 or 410, and is deleted
// rather than retried forever. Anything else counts a failure against it, and
// five consecutive failures takes it out of rotation.
export async function sendPushToAll(env, db, { title, body, url, tag }) {
  if (!pushConfigured(env)) return { sent: 0, failed: 0, reason: 'push keys are not configured' };

  const subs = await listPushSubs(db);
  if (!subs.length) return { sent: 0, failed: 0, reason: 'nobody is subscribed to notifications yet' };

  const payload = JSON.stringify({ title, body, url: url || '/desk.html#queue', tag: tag || 'nh-queue' });
  let sent = 0;
  let failed = 0;

  for (const sub of subs) {
    try {
      const res = await sendToSubscription(env, sub, payload);
      if (res.status === 404 || res.status === 410) {
        await deletePushSub(db, sub.endpoint);
        failed += 1;
        continue;
      }
      if (res.ok || res.status === 201) {
        await notePushResult(db, sub.endpoint, true);
        sent += 1;
      } else {
        await notePushResult(db, sub.endpoint, false);
        failed += 1;
      }
    } catch (e) {
      await notePushResult(db, sub.endpoint, false);
      failed += 1;
    }
  }

  return { sent, failed };
}

// The fallback, and only the fallback. Used when push is not configured, nobody
// has granted permission, or every subscription failed. It posts to a webhook the
// owner points at whatever sends their email, so no mail provider credentials
// enter this Worker.
export async function notifyByEmail(env, { title, body }) {
  const hook = env.NOTIFY_EMAIL_WEBHOOK;
  if (!hook) return { ok: false, reason: 'NOTIFY_EMAIL_WEBHOOK is not set, so there is no email fallback' };
  try {
    const res = await fetch(hook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject: title, message: body, source: 'ninth-house-engine' }),
      signal: AbortSignal.timeout(15000)
    });
    return { ok: res.ok, reason: res.ok ? '' : `the email webhook answered ${res.status}` };
  } catch (e) {
    return { ok: false, reason: String(e && e.message ? e.message : e).slice(0, 200) };
  }
}

// Push first, email only if push reached nobody.
export async function notifyOwner(env, db, note) {
  const push = await sendPushToAll(env, db, note);
  if (push.sent > 0) return { channel: 'push', ...push };
  const email = await notifyByEmail(env, note);
  return { channel: email.ok ? 'email' : 'none', push, email };
}
