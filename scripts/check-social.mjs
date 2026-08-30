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
import { senderFor } from '../worker/src/social/senders/index.js';
import { stripDashPunctuation, hasDashPunctuation, sanitiseSocialText, extractDirectives, trimHashtags } from '../worker/src/social/text.js';
import { slotsDueToday, pickCategory, trimToLimit, buildBias } from '../worker/src/social/generate.js';
import { validateForSend, buildPayload, readExternalId } from '../worker/src/social/distribute.js';
import { streakFrom } from '../worker/src/social/metrics.js';
import { generateVapidKeys, encryptPayload, b64urlToBytes, bytesToB64url } from '../worker/src/social/push.js';
import { checkOutreachRules, researchGate, MESSAGE_STATUSES } from '../worker/src/social/outreach.js';
import { VISIT_DUBAI_EMAIL_BODY, VISIT_DUBAI_SUBJECT, VISIT_DUBAI_TO, VISIT_DUBAI_CC, VISIT_DUBAI_PROSPECT } from '../worker/src/social/seeds/visit-dubai.js';

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
  // The generic machinery. Two files are deliberately absent and must stay
  // absent: senders/index.js is the registry that maps a delivery name to an
  // adapter, and senders/linkedin.js is an adapter whose whole job is to know
  // one platform. Both sit on the same footing as config.js. Everything here
  // routes on data and must never learn which platform it is carrying.
  const files = [
    'api.js', 'db.js', 'distribute.js', 'generate.js', 'metrics.js', 'push.js', 'text.js',
    'senders/webhook.js'
  ];
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

// A missing import is not a syntax error, so node --check passes and the name is
// simply undefined until the line runs. Where that line sits inside a try/catch,
// as the sweep does, the failure is swallowed and the feature silently never
// happens. This catches it at check time instead.
await test('every worker module imports every name it uses at module scope', async () => {
  const files = [
    'worker/src/index.js', 'worker/src/aikey.js', 'worker/src/n8n.js', 'worker/src/auth.js',
    'worker/src/social/facts.js', 'worker/src/social/generate.js', 'worker/src/social/api.js',
    'worker/src/social/db.js', 'worker/src/social/distribute.js'
  ];
  for (const f of files) {
    await import('../' + f);
  }
});

await test('the facts sheet refuses to invent, and reports rather than rewrites', async () => {
  const { parseFacts, factsBlock, readableText, checkClaims } = await import('../worker/src/social/facts.js');

  // Junk in must not become a fact.
  assert.equal(parseFacts('not json at all').length, 0);
  assert.equal(parseFacts('{"facts":[{"key":"","value":"x"}]}').length, 0);
  assert.equal(parseFacts('{"facts":[{"key":"tiers","value":""}]}').length, 0);
  // A fenced answer is still read, since models wrap JSON in fences.
  assert.equal(parseFacts('```json\n{"facts":[{"key":"Entry Tier","value":"9 USD"}]}\n```')[0].key, 'entry_tier');

  // Markup never reaches the model as markup.
  assert.ok(!readableText('<script>bad()</script><p>Ninety professions</p>').includes('bad'));
  assert.ok(readableText('<p>Ninety&nbsp;professions</p>').includes('Ninety professions'));

  // With no sheet, a figure is unverifiable rather than silently allowed.
  const noSheet = await checkClaims(null, { text: 'We support 89 professions.', facts: [], ventureName: 'X' });
  assert.equal(noSheet.ok, false, 'a figure with no sheet should not pass');
  const noSheetNoNumber = await checkClaims(null, { text: 'We help small businesses post.', facts: [], ventureName: 'X' });
  assert.equal(noSheetNoNumber.ok, true, 'prose with no figure needs no sheet');

  // A check that throws is reported as unchecked, never as a pass.
  const broken = await checkClaims(() => { throw new Error('model down'); }, {
    text: 'We support 89 professions.', facts: [{ fact_key: 'professions', fact_value: '89', verified_at: new Date().toISOString() }], ventureName: 'X'
  });
  assert.equal(broken.ok, false, 'a failed check must not read as a pass');
  assert.equal(broken.unchecked, true);

  // The block a persona is given names its own emptiness rather than going quiet.
  assert.ok(factsBlock([]).includes('may not state a single number'));
  assert.ok(factsBlock([{ fact_key: 'professions', fact_value: '89', verified_at: new Date().toISOString() }]).includes('89'));
});

await test('every platform resolves to a sender that exists', () => {
  for (const [key, platform] of Object.entries(PLATFORMS)) {
    const { name, sender } = senderFor(platform);
    assert.ok(sender, `platform "${key}" asks for delivery "${name}", which has no sender in senders/index.js`);
    assert.equal(typeof sender.send, 'function', `the "${name}" sender has no send function`);
  }
});

await test('distribute.js no longer holds the rail endpoint or builds its payload', () => {
  const src = readFileSync('worker/src/social/distribute.js', 'utf8');
  const code = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!code.includes('MAKE_WEBHOOK_URL'), 'the rail endpoint belongs to the webhook sender, not to distribute.js');
  assert.ok(code.includes('senderFor'), 'distribute.js should pick its delivery through senderFor');
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

/* ---------- outreach: the rules the owner set, checked rather than remembered ---------- */

// The Visit Dubai pack is the standard for founding partner outreach, and it is
// going to a government tourism body. Every one of these is a thing the owner
// wrote down as forbidden. A guard here is worth more than a note in a file
// nobody reads before editing a seed at speed.
await test('nothing outbound in the Visit Dubai pack carries an em dash', () => {
  assert.ok(!hasDashPunctuation(VISIT_DUBAI_EMAIL_BODY), 'the body has an em dash');
  assert.ok(!hasDashPunctuation(VISIT_DUBAI_SUBJECT), 'the subject has an em dash');
  assert.ok(!hasDashPunctuation(VISIT_DUBAI_TO + ' ' + VISIT_DUBAI_CC), 'an address has an em dash');
});

// The one finding it does carry is its own signature block, which arrived with
// [Full name] and [Title] still in it. That is caught here on purpose rather
// than quietly filled in with a guess at who is signing.
await test('the Visit Dubai pack breaks no standing rule except its unfilled signature', () => {
  const findings = checkOutreachRules(VISIT_DUBAI_EMAIL_BODY);
  assert.deepEqual(findings.map((f) => f.id), ['no_unfilled_placeholder'], 'the standard breaks a rule it should not');
});

await test('the placeholder rule catches a signature block and leaves real prose alone', () => {
  const caught = (t) => checkOutreachRules(t).some((f) => f.id === 'no_unfilled_placeholder');
  assert.ok(caught('With respect,\n\n[Full name]\n[Title]'), 'an unfilled name went through');
  assert.ok(caught('Reply to [email] and we will follow your process.'), 'an unfilled address went through');
  assert.ok(!caught('With respect,\n\nAlexander Afolabi\nAdvertising and partnerships'), 'a filled signature was flagged');
});

await test('leadership is not on the Visit Dubai send list, and the pricing is the owner\'s', () => {
  const addressed = (VISIT_DUBAI_TO + ',' + VISIT_DUBAI_CC).toLowerCase();
  assert.ok(!/kazim|almarri/.test(addressed), 'the pack opens with leadership, which the owner forbade');
  assert.ok(!/kazim|almarri/i.test(VISIT_DUBAI_EMAIL_BODY), 'the letter addresses leadership by name');
  assert.ok(VISIT_DUBAI_EMAIL_BODY.includes('USD 160,000'), 'the published rate has moved');
  assert.ok(VISIT_DUBAI_EMAIL_BODY.includes('USD 96,000'), 'the founding rate has moved');
  assert.ok(!/USD 15,000/.test(VISIT_DUBAI_EMAIL_BODY), 'it opens at a price the owner ruled out');
});

await test('the research gate refuses a prospect that cannot answer all three questions', () => {
  assert.equal(researchGate(VISIT_DUBAI_PROSPECT).ready, true, 'the seeded prospect should pass its own gate');
  const thin = { research: { what_they_do: 'A tourism board.', why_now: '' } };
  const gate = researchGate(thin);
  assert.equal(gate.ready, false, 'a prospect with no answer to why now was let through');
  assert.deepEqual(gate.missing.sort(), ['what_is_missing', 'why_now']);
});

await test('a message status cannot become something the rest of the code does not know', () => {
  assert.ok(MESSAGE_STATUSES.includes('sent'));
  assert.ok(!MESSAGE_STATUSES.includes('delivered'), 'an unknown status is in the allowed list');
});

/* ---------- report ---------- */

console.log(`\n${passed} checks passed.`);
if (failures.length) {
  console.error(`${failures.length} failed:`);
  for (const f of failures) console.error('  ' + f);
  process.exit(1);
}
