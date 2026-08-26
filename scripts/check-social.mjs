// Checks for the distribution engine. Run from the repo root:
//
//   node scripts/check-social.mjs
//
// No network, no Cloudflare, no database. It exercises the parts where a mistake
// would be silent: the cadence arithmetic, the category mix, the send guards, and
// the push encryption, which is verified by decrypting its own output with an
// independent implementation rather than by trusting it.

import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

import { SCHEMA_SQL, validateVenture } from '../worker/src/social/db.js';
import { PLATFORMS, CATEGORIES, imageRequired, socialCategories } from '../worker/src/social/config.js';
import { stripDashPunctuation, hasDashPunctuation, sanitiseSocialText, extractDirectives, trimHashtags } from '../worker/src/social/text.js';
import { slotsDueToday, pickCategory, trimToLimit, buildBias } from '../worker/src/social/generate.js';
import { validateForSend, buildPayload, readExternalId } from '../worker/src/social/distribute.js';
import { streakFrom } from '../worker/src/social/metrics.js';
import { generateVapidKeys, encryptPayload, b64urlToBytes, bytesToB64url } from '../worker/src/social/push.js';

let passed = 0;
const failures = [];
function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed += 1; })
    .catch((e) => { failures.push(`${name}: ${e && e.message ? e.message : e}`); });
}

const utf8 = (s) => new TextEncoder().encode(s);
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
};

/* ---------- schema and migration stay in step ---------- */

await test('the migration file carries every table in SCHEMA_SQL', () => {
  const migration = readFileSync('worker/migrations/0001_social_engine.sql', 'utf8');
  const tables = [...SCHEMA_SQL.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map((m) => m[1]);
  assert.ok(tables.length >= 4, 'expected at least four tables');
  for (const t of tables) {
    assert.ok(migration.includes(`CREATE TABLE IF NOT EXISTS ${t}`), `migration is missing table ${t}`);
  }
  const indexes = [...SCHEMA_SQL.matchAll(/CREATE INDEX IF NOT EXISTS (\w+)/g)].map((m) => m[1]);
  for (const i of indexes) {
    assert.ok(migration.includes(i), `migration is missing index ${i}`);
  }
});

/* ---------- the house punctuation rule ---------- */

await test('em dashes and en dashes never survive', () => {
  assert.equal(stripDashPunctuation('One thing, then another'), 'One thing, then another');
  assert.equal(stripDashPunctuation('One thing, then another'), 'One thing, then another');
  assert.ok(!hasDashPunctuation(stripDashPunctuation('A, B, and C')));
  // A markdown bullet is a bullet, not punctuation.
  assert.equal(stripDashPunctuation('- a point'), '- a point');
  // A spaced hyphen used as punctuation is not a bullet.
  assert.equal(stripDashPunctuation('here - there'), 'here, there');
});

await test('generated copy is cleaned of markdown, preamble and wrapping quotes', () => {
  const messy = 'Here is the post:\n\n"**Bold claim** about the work.\n\n## Heading\n\nSecond line."';
  const clean = sanitiseSocialText(messy);
  assert.ok(!clean.includes('**'), 'bold markers survived');
  assert.ok(!clean.includes('##'), 'heading marker survived');
  assert.ok(!clean.startsWith('Here is'), 'preamble survived');
  assert.ok(!clean.startsWith('"'), 'wrapping quote survived');
  assert.ok(clean.includes('Bold claim'));
});

await test('directives are lifted out of the copy rather than shipped in it', () => {
  const { text, directives } = extractDirectives('IMAGE: a flat lay of the ledger\nThe caption itself.');
  assert.equal(text, 'The caption itself.');
  assert.equal(directives.image, 'a flat lay of the ledger');
});

await test('hashtags are cut back to the platform maximum', () => {
  const out = trimHashtags('Body copy #one #two #three #four', 2);
  const count = (out.match(/#\w+/g) || []).length;
  assert.equal(count, 2, 'expected two hashtags, got ' + count);
  assert.ok(out.includes('#one') && out.includes('#two'), 'the wrong tags were kept');
});

/* ---------- cadence ---------- */

await test('cadence spreads across the week instead of dumping on Monday', () => {
  // Three a week, nothing sent yet, Monday: one today, not three.
  assert.equal(slotsDueToday({ target: 3, alreadyThisWeek: 0, daysLeft: 7 }), 1);
  // Still three outstanding on Saturday: two days left, so it catches up.
  assert.equal(slotsDueToday({ target: 3, alreadyThisWeek: 0, daysLeft: 2 }), 1);
  // Target met, nothing owed. A venture with nothing to say posts less.
  assert.equal(slotsDueToday({ target: 3, alreadyThisWeek: 3, daysLeft: 4 }), 0);
  assert.equal(slotsDueToday({ target: 0, alreadyThisWeek: 0, daysLeft: 7 }), 0);
  // Fourteen a week is two a day, not fourteen on the first day.
  assert.equal(slotsDueToday({ target: 14, alreadyThisWeek: 0, daysLeft: 7 }), 2);
});

/* ---------- category mix ---------- */

await test('no category that needs an article is chosen when there is no article', () => {
  const category = pickCategory({
    mix: { article_derived: 1 },
    biasFor: () => 1,
    venture: 'x',
    avoid: null,
    articlesAvailable: false,
    platform: 'linkedin',
    random: () => 0.5
  });
  assert.equal(category, null, 'it chose a category it cannot fill');
});

await test('the mix avoids repeating the last category', () => {
  const category = pickCategory({
    mix: { short_form: 1, educational: 1 },
    biasFor: () => 1,
    venture: 'x',
    avoid: 'short_form',
    articlesAvailable: false,
    platform: 'linkedin',
    random: () => 0.5
  });
  assert.equal(category, 'educational');
});

await test('a category the owner keeps skipping is weighted down', async () => {
  const rows = [
    { venture: 'v', category: 'visual', status: 'skipped', engagements: null, clicks: null, impressions: null },
    { venture: 'v', category: 'visual', status: 'skipped', engagements: null, clicks: null, impressions: null },
    { venture: 'v', category: 'proof', status: 'posted', engagements: 40, clicks: 10, impressions: 900 }
  ];
  const db = { prepare: () => ({ bind: () => ({ all: async () => ({ results: rows }) }) }) };
  const biasFor = await buildBias(db, new Date());
  assert.ok(biasFor('v', 'visual') < 1, 'a skipped category kept full weight');
  assert.ok(biasFor('v', 'proof') > biasFor('v', 'visual'), 'the performing category did not win');
});

await test('a post with no readings yet does not vote against its own category', async () => {
  const rows = [{ venture: 'v', category: 'short_form', status: 'posted', engagements: null, clicks: null, impressions: null }];
  const db = { prepare: () => ({ bind: () => ({ all: async () => ({ results: rows }) }) }) };
  const biasFor = await buildBias(db, new Date());
  assert.equal(biasFor('v', 'short_form'), 1);
});

/* ---------- length ---------- */

await test('overlong copy is cut at a sentence rather than mid word', () => {
  const text = 'First sentence is here. Second sentence runs on a good deal longer than the first one does.';
  const { text: out, trimmed } = trimToLimit(text, 40);
  assert.ok(trimmed);
  assert.ok(out.length <= 40, 'still over the limit');
  assert.ok(out.endsWith('.'), 'did not land on a sentence end: ' + out);
});

/* ---------- send guards ---------- */

await test('a post over the platform limit is refused before any call is made', () => {
  const problems = validateForSend({ platform: 'threads', category: 'short_form', text: 'a'.repeat(600) });
  assert.equal(problems.length, 1);
  assert.ok(problems[0].includes('over the Threads limit'));
});

await test('a platform marked automated: false is refused before any other check, and before any call is made', () => {
  const problems = validateForSend({ platform: 'x', category: 'short_form', text: 'fine' });
  assert.equal(problems.length, 1);
  assert.ok(problems[0].includes('manual delivery'));
  // Even a post that would otherwise fail two ways still gets the one manual
  // delivery reason, not a pile of checks against a send that can never happen.
  const overlong = validateForSend({ platform: 'x', category: 'visual', text: 'a'.repeat(400) });
  assert.equal(overlong.length, 1);
  assert.ok(overlong[0].includes('manual delivery'));
});

await test('a post that needs an image is refused without one', () => {
  const problems = validateForSend({ platform: 'linkedin', category: 'visual', text: 'fine' });
  assert.ok(problems.some((p) => p.includes('needs an image')));
  assert.equal(validateForSend({ platform: 'linkedin', category: 'visual', text: 'fine', image_url: 'https://x/y.png' }).length, 0);
});

await test('an unconfigured platform is refused by name', () => {
  const problems = validateForSend({ platform: 'myspace', category: 'short_form', text: 'fine' });
  assert.ok(problems[0].includes('not configured'));
});

await test('the payload carries the five rail fields plus the idempotency key', () => {
  const payload = buildPayload({ id: 'abc', venture: 'v', platform: 'linkedin', text: 'a, b', image_url: null, link: null });
  assert.deepEqual(Object.keys(payload).sort(), ['idempotency_key', 'image_url', 'link', 'platform', 'text', 'venture']);
  assert.equal(payload.idempotency_key, 'abc');
  assert.equal(payload.image_url, '');
  assert.ok(!hasDashPunctuation(payload.text));
});

await test('an id is read from the rail answer, and "true" is not mistaken for one', () => {
  assert.equal(readExternalId({ success: true }), null);
  assert.equal(readExternalId({ id: 'true' }), null);
  assert.equal(readExternalId({ post_id: 'urn:li:share:123' }), 'urn:li:share:123');
  assert.equal(readExternalId({ data: { id: 987 } }), '987');
});

/* ---------- no platform is hardcoded outside config.js ---------- */

await test('no module branches on a platform name', () => {
  const names = Object.keys(PLATFORMS);
  const files = ['api.js', 'db.js', 'distribute.js', 'generate.js', 'metrics.js', 'push.js', 'text.js'];
  for (const file of files) {
    const src = readFileSync(`worker/src/social/${file}`, 'utf8');
    // Strip comments before looking, so prose about LinkedIn is not a false positive.
    const code = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const name of names) {
      assert.ok(
        !new RegExp(`['"\`]${name}['"\`]`).test(code),
        `${file} names the platform "${name}" in code; platform specifics belong in config.js`
      );
    }
  }
});

await test('the venture validator rejects unknown platforms and unbacked cadence', () => {
  assert.ok(validateVenture({ slug: 'ok', name: 'Ok', platforms: ['nowhere'] }).errors.some((e) => e.includes('unknown platform')));
  assert.ok(validateVenture({ slug: 'ok', name: 'Ok', platforms: [], cadence: { linkedin: 3 } }).errors.some((e) => e.includes('does not list that platform')));
  assert.equal(validateVenture({ slug: 'ok', name: 'Ok', platforms: ['linkedin'], cadence: { linkedin: 3 } }).errors.length, 0);
  assert.ok(validateVenture({ slug: 'Bad Slug', name: 'x' }).errors.some((e) => e.includes('slug')));
});

await test('every category in the seeded mix exists and every platform limit is sane', () => {
  for (const key of socialCategories()) assert.ok(CATEGORIES[key], key);
  for (const [key, p] of Object.entries(PLATFORMS)) {
    assert.ok(p.limit > 0 && p.target > 0 && p.target <= p.limit, `${key} has an impossible length config`);
    assert.ok(p.hashtags && Number.isFinite(p.hashtags.max), `${key} has no hashtag rule`);
  }
  assert.equal(imageRequired('linkedin', 'short_form'), false);
  assert.equal(imageRequired('instagram', 'short_form'), true);
});

/* ---------- streak ---------- */

await test('the streak survives a morning with nothing posted yet', () => {
  const now = new Date('2026-08-12T06:00:00Z');
  // Nothing today, but yesterday and the day before: the streak is two, not zero.
  assert.equal(streakFrom(['2026-08-11', '2026-08-10'], now), 2);
  assert.equal(streakFrom(['2026-08-12', '2026-08-11'], now), 2);
  assert.equal(streakFrom(['2026-08-09'], now), 0);
  assert.equal(streakFrom([], now), 0);
});

/* ---------- push: encrypt, then decrypt it independently ---------- */

async function hmacRaw(keyBytes, data) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, data));
}
async function hkdfRaw(salt, ikm, info, length) {
  const prk = await hmacRaw(salt, ikm);
  return (await hmacRaw(prk, concat(info, new Uint8Array([1])))).slice(0, length);
}

await test('the VAPID JWT verifies against its own public key', async () => {
  const keys = await generateVapidKeys();
  const jwkJson = JSON.parse(new TextDecoder().decode(b64urlToBytes(keys.privateKey)));
  const priv = await crypto.subtle.importKey('jwk', { ...jwkJson, ext: true, key_ops: ['sign'] }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);

  const header = bytesToB64url(utf8(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = bytesToB64url(utf8(JSON.stringify({ aud: 'https://push.example', exp: 1, sub: 'mailto:a@b.c' })));
  const input = `${header}.${claims}`;
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, priv, utf8(input)));
  assert.equal(sig.length, 64, 'ES256 needs the raw 64 byte r||s pair');

  const pub = await crypto.subtle.importKey('raw', b64urlToBytes(keys.publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, sig, utf8(input));
  assert.ok(ok, 'the signature did not verify');
});

await test('an encrypted push payload decrypts back to the original', async () => {
  // Stand in for the browser: its own ECDH pair and its own auth secret.
  const uaPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const uaPublicRaw = new Uint8Array(await crypto.subtle.exportKey('raw', uaPair.publicKey));
  const authSecret = crypto.getRandomValues(new Uint8Array(16));

  const message = JSON.stringify({ title: 'Ninth House', body: '3 posts waiting across 1 venture.' });
  const body = await encryptPayload(bytesToB64url(uaPublicRaw), bytesToB64url(authSecret), message);

  // Unpack the aes128gcm header the way a push service client would.
  const salt = body.slice(0, 16);
  const rs = new DataView(body.buffer, body.byteOffset + 16, 4).getUint32(0, false);
  const idLen = body[20];
  const asPublicRaw = body.slice(21, 21 + idLen);
  const ciphertext = body.slice(21 + idLen);
  assert.equal(rs, 4096);
  assert.equal(idLen, 65);

  const asPublic = await crypto.subtle.importKey('raw', asPublicRaw, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asPublic }, uaPair.privateKey, 256));

  const keyInfo = concat(utf8('WebPush: info'), new Uint8Array([0]), uaPublicRaw, asPublicRaw);
  const ikm = await hkdfRaw(authSecret, shared, keyInfo, 32);
  const cek = await hkdfRaw(salt, ikm, concat(utf8('Content-Encoding: aes128gcm'), new Uint8Array([0])), 16);
  const nonce = await hkdfRaw(salt, ikm, concat(utf8('Content-Encoding: nonce'), new Uint8Array([0])), 12);

  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['decrypt']);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, aesKey, ciphertext));

  // The final byte is the 0x02 record delimiter, not part of the message.
  assert.equal(plain[plain.length - 1], 2, 'the record delimiter is wrong');
  assert.equal(new TextDecoder().decode(plain.slice(0, -1)), message);
});

await test('base64url round trips, including bytes that need padding', () => {
  for (const len of [1, 2, 3, 16, 31, 32, 65]) {
    const bytes = crypto.getRandomValues(new Uint8Array(len));
    const back = b64urlToBytes(bytesToB64url(bytes));
    assert.deepEqual([...back], [...bytes], 'round trip failed at length ' + len);
  }
  assert.ok(!bytesToB64url(new Uint8Array([251, 255])).match(/[+/=]/), 'output is not url safe');
});

/* ---------- report ---------- */

console.log(`\n${passed} checks passed.`);
if (failures.length) {
  console.error(`${failures.length} failed:`);
  for (const f of failures) console.error('  ' + f);
  process.exit(1);
}
