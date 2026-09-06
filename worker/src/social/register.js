// The Glotemp wave campaign's own target register: import, the four-wave
// gate, the per-city rival lock, and the live slot that starts and ends the
// fourteen day window. Kept apart from outreach.js, which is the general
// compose and rule-checking engine every campaign shares; this module is
// the register-specific data and discipline the wave campaign brief asked
// for, and it calls into outreach.js and owners.js rather than duplicating
// either.

import { nowIso } from './db.js';
import { checkOutreachRules } from './outreach.js';
import { signatureBlock } from './owners.js';
import { registerCampaignCopy, REGISTER_CAMPAIGN_VERTICALS } from './seeds/glotemp-register-campaign.js';

/* ---------- CSV parsing ---------- */

// A plain RFC4180 reader: quoted fields, doubled quotes inside them, commas
// and newlines respected inside a quote. This alone resolves any field that
// was quoted correctly in the source. It cannot resolve a field that was
// never quoted at all, which is a different fault and repaired separately
// below, because no parser can recover information the source never
// recorded about where a field was meant to end.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const s = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') { inQuotes = true; continue; }
    if (c === ',') { row.push(field); field = ''; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

// A row that came in with unquoted commas inside one field reads as extra
// columns: the Naples fault, named in the brief, is exactly this. Rather
// than guess which extra column is the overflow, the overflow is merged
// back into the named column, since that is the one place in this register
// a board name is long enough to plausibly contain a comma. Any row still
// the wrong length after this is reported rather than guessed at further.
export function repairOverflowRows(rows, headerLen, mergeColumnIndex) {
  const repaired = [];
  const stillWrong = [];
  for (const row of rows) {
    if (row.length === headerLen) { repaired.push(row); continue; }
    if (row.length > headerLen) {
      const overflow = row.length - headerLen;
      const before = row.slice(0, mergeColumnIndex);
      const merged = row.slice(mergeColumnIndex, mergeColumnIndex + overflow + 1).map((s) => String(s).trim()).join(', ');
      const after = row.slice(mergeColumnIndex + overflow + 1);
      const fixed = [...before, merged, ...after];
      if (fixed.length === headerLen) { repaired.push(fixed); continue; }
    }
    stillWrong.push(row);
  }
  return { rows: repaired, stillWrong };
}

/* ---------- register rows ---------- */

const REQUIRED_HEADERS = ['city', 'vertical'];

// The register's own row shape, one level above the raw CSV. Anything the
// header does not name comes through empty rather than undefined, so every
// downstream check can read a field without asking first whether it exists.
export function rowsFromParsedCsv(rows, { venture = 'glotemp', wave = 0 } = {}) {
  if (!rows.length) return { records: [], errors: ['The file has no rows.'] };
  const header = rows[0].map((h) => String(h || '').trim().toLowerCase());
  const errors = [];
  for (const h of REQUIRED_HEADERS) {
    if (!header.includes(h)) errors.push(`The register is missing a required column: "${h}".`);
  }
  if (errors.length) return { records: [], errors };

  const idx = (name) => header.indexOf(name);
  const at = (row, name) => { const i = idx(name); return i === -1 ? '' : String(row[i] || '').trim(); };

  const records = rows.slice(1).map((row) => ({
    venture,
    city: at(row, 'city'),
    country: at(row, 'country'),
    organisation: at(row, 'organisation') || at(row, 'board_name') || at(row, 'board'),
    vertical: at(row, 'vertical').toLowerCase(),
    language: (at(row, 'language') || 'en').toLowerCase(),
    wave: Number(at(row, 'wave')) || wave,
    food_url: at(row, 'food_url'),
    pulse_url: at(row, 'pulse_url'),
    dmo_contact: at(row, 'dmo_contact'),
    operator_email_if_public: at(row, 'operator_email_if_public')
  }));
  return { records, errors: [] };
}

// City and vertical together, lower cased: the same organisation is one row
// whether it sells food or rooms, but the same city can hold both a
// restaurant row and a hotel row without colliding.
function registerKey(r) {
  return `${String(r.city || '').trim().toLowerCase()}::${String(r.vertical || '').trim().toLowerCase()}`;
}

// Deduplicates by that key, keeping the first occurrence and reporting every
// one dropped, so a duplicate like the Reykjavik row named in the brief is
// removed rather than silently overwritten and just as silently missed.
export function dedupeRegisterRows(records) {
  const seen = new Set();
  const kept = [];
  const dropped = [];
  for (const r of records) {
    const key = registerKey(r);
    if (seen.has(key)) { dropped.push(r); continue; }
    seen.add(key);
    kept.push(r);
  }
  return { kept, dropped };
}

const KNOWN_BAD_URL_HOSTS = [
  // Named faults from the brief: a misspelling that resolves to nothing, and
  // a hotel domain the owner has said is wrong. Neither is guessed at with a
  // corrected URL; the field is dropped and the row routes another way,
  // exactly as the brief says to do with Tallahassee.
  { pattern: /foursasons\.com/i, note: 'Misspelled domain (foursasons.com). The field is dropped rather than sent broken.' },
  { pattern: /hoteldulal\.com/i, note: 'Wrong domain for Hotel Duval. The field is dropped; route through the Visit Tallahassee form instead.' }
];

// Syntax first, then the brief's two named faults by exact match, then a
// live reachability check where a fetch implementation is available (the
// Worker has one; the in-process tests below stub it, since a unit test
// reaching the real internet would be a different kind of test entirely).
export async function checkUrl(url, { fetchImpl } = {}) {
  const trimmed = String(url || '').trim();
  if (!trimmed) return { ok: true, note: '', empty: true };
  let parsed;
  try { parsed = new URL(trimmed); } catch (e) { return { ok: false, note: 'Not a valid URL.' }; }
  if (!/^https?:$/.test(parsed.protocol)) return { ok: false, note: 'Not an http or https URL.' };

  for (const bad of KNOWN_BAD_URL_HOSTS) {
    if (bad.pattern.test(parsed.hostname)) return { ok: false, note: bad.note };
  }

  const fetcher = fetchImpl || (typeof fetch === 'function' ? fetch : null);
  if (!fetcher) return { ok: true, note: 'Not checked: no fetch available in this environment.', unchecked: true };
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetcher(trimmed, { method: 'GET', redirect: 'follow', signal: ctrl.signal });
    clearTimeout(timer);
    if (res.status >= 400) return { ok: false, note: `Answered ${res.status}.` };
    return { ok: true, note: '' };
  } catch (e) {
    return { ok: false, note: 'Could not be reached: ' + (e && e.message ? e.message : String(e)) };
  }
}

/* ---------- import ---------- */

export async function upsertRegisterRow(db, row) {
  const id = row.id || `${String(row.city || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${String(row.vertical || '').trim().toLowerCase()}`;
  const ts = nowIso();
  await db.prepare(`
    INSERT INTO city_register (
      id, venture, city, country, organisation, vertical, language, wave,
      food_url, pulse_url, dmo_contact, operator_email_if_public,
      resolved_contact_email, contact_source, route_type, form_url,
      url_check_ok, url_check_note, status, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      venture = excluded.venture, city = excluded.city, country = excluded.country,
      organisation = excluded.organisation, vertical = excluded.vertical,
      language = excluded.language, wave = excluded.wave,
      food_url = excluded.food_url, pulse_url = excluded.pulse_url,
      dmo_contact = excluded.dmo_contact, operator_email_if_public = excluded.operator_email_if_public,
      resolved_contact_email = excluded.resolved_contact_email, contact_source = excluded.contact_source,
      route_type = excluded.route_type, form_url = excluded.form_url,
      url_check_ok = excluded.url_check_ok, url_check_note = excluded.url_check_note,
      status = excluded.status, notes = excluded.notes, updated_at = excluded.updated_at
  `).bind(
    id, row.venture || 'glotemp', row.city, row.country || '', row.organisation || '',
    row.vertical, row.language || 'en', Number(row.wave) || 0,
    row.food_url || '', row.pulse_url || '', row.dmo_contact || '', row.operator_email_if_public || '',
    row.resolved_contact_email || '', row.contact_source || '', row.route_type || '', row.form_url || '',
    row.url_check_ok ? 1 : 0, row.url_check_note || '', row.status || 'pending', row.notes || '',
    row.created_at || ts, ts
  ).run();
  await ensureRivalLock(db, row.city);
  return id;
}

// Section 5's routing decision. A public email wins outright over anything
// else, since it needs no research. A dmo_contact that already reads as an
// address is taken as one. Everything left with "use form" language, or a
// bare URL and nothing else, is a form route. Everything else has no route
// yet and is reported as such rather than guessed at.
export function decideRoute(row) {
  const publicEmail = String(row.operator_email_if_public || '').trim();
  if (publicEmail && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(publicEmail)) {
    return { route_type: 'email', resolved_contact_email: publicEmail, contact_source: 'operator_email_if_public' };
  }
  const resolved = String(row.resolved_contact_email || '').trim();
  if (resolved) return { route_type: 'email', resolved_contact_email: resolved, contact_source: row.contact_source || 'researched' };

  const dmo = String(row.dmo_contact || '').trim();
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(dmo)) {
    return { route_type: 'email', resolved_contact_email: dmo, contact_source: 'dmo_contact' };
  }
  if (/^https?:\/\//i.test(dmo)) return { route_type: 'form', form_url: dmo };
  if (/\bform\b/i.test(dmo) && (row.pulse_url || row.food_url)) {
    return { route_type: 'form', form_url: row.pulse_url || row.food_url };
  }
  return { route_type: 'none' };
}

// The full pipeline: parse, repair known overflow, dedupe, decide a route,
// check every link, and only then write to the table. Nothing here invents
// a contact address; decideRoute reads what the register already says, and
// the actual research step (finding a real address the register does not
// yet have) is section 5's agent step, run separately against rows this
// import leaves at route_type "none".
export async function importRegisterCsv(db, text, { venture = 'glotemp', wave = 0, mergeColumnHint = 'organisation', fetchImpl } = {}) {
  const raw = parseCsv(text);
  if (!raw.length) return { imported: 0, errors: ['The file is empty.'] };
  const headerLen = raw[0].length;
  const mergeIndex = Math.max(0, raw[0].map((h) => String(h).trim().toLowerCase()).indexOf(mergeColumnHint));
  const { rows: repaired, stillWrong } = repairOverflowRows(raw.slice(1), headerLen, mergeIndex);
  const { records, errors } = rowsFromParsedCsv([raw[0], ...repaired], { venture, wave });
  if (errors.length) return { imported: 0, errors };

  const { kept, dropped } = dedupeRegisterRows(records);

  let imported = 0;
  const urlIssues = [];
  for (const r of kept) {
    const foodCheck = await checkUrl(r.food_url, { fetchImpl });
    const pulseCheck = await checkUrl(r.pulse_url, { fetchImpl });
    if (!foodCheck.ok) { urlIssues.push({ city: r.city, field: 'food_url', note: foodCheck.note }); r.food_url = ''; }
    if (!pulseCheck.ok) { urlIssues.push({ city: r.city, field: 'pulse_url', note: pulseCheck.note }); r.pulse_url = ''; }

    const routed = decideRoute(r);
    const urlsOk = foodCheck.ok && pulseCheck.ok;
    await upsertRegisterRow(db, {
      ...r,
      ...routed,
      url_check_ok: urlsOk,
      url_check_note: [foodCheck.note, pulseCheck.note].filter(Boolean).join(' '),
      status: routed.route_type === 'none' ? 'no_route' : 'pending'
    });
    imported++;
  }

  return {
    imported,
    duplicatesRemoved: dropped.map((r) => `${r.city} (${r.vertical})`),
    rowsStillMisaligned: stillWrong.length,
    urlIssues,
    errors: []
  };
}

export async function listRegisterRows(db, { wave, status, venture, vertical, limit = 500 } = {}) {
  const where = [];
  const binds = [];
  if (wave != null) { where.push('wave = ?'); binds.push(Number(wave)); }
  if (status) { where.push('status = ?'); binds.push(String(status)); }
  if (venture) { where.push('venture = ?'); binds.push(String(venture)); }
  if (vertical) { where.push('vertical = ?'); binds.push(String(vertical)); }
  const { results } = await db.prepare(
    `SELECT * FROM city_register ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY wave, city LIMIT ?`
  ).bind(...binds, Math.min(Number(limit) || 500, 1000)).all();
  return results || [];
}

export async function getRegisterRow(db, id) {
  return await db.prepare('SELECT * FROM city_register WHERE id = ?').bind(id).first();
}

// Section 5's third part: how much of the register is actually sendable.
export async function routeSplitReport(db, { venture = 'glotemp' } = {}) {
  const rows = await listRegisterRows(db, { venture, limit: 1000 });
  const report = { total: rows.length, email: 0, form: 0, none: 0 };
  for (const r of rows) {
    if (r.route_type === 'email') report.email++;
    else if (r.route_type === 'form') report.form++;
    else report.none++;
  }
  return report;
}

/* ---------- the four-wave gate ---------- */

export const WAVES = [1, 2, 3, 4];
// A row is done with, one way or another, once it is in one of these. A row
// still "pending" or "no_route" is unfinished business and holds its wave
// open.
const WAVE_TERMINAL_STATUSES = ['sent', 'rejected', 'suppressed'];

export async function waveComplete(db, wave, { venture = 'glotemp' } = {}) {
  const row = await db.prepare(
    `SELECT COUNT(*) AS n FROM city_register WHERE venture = ? AND wave = ? AND status NOT IN (${WAVE_TERMINAL_STATUSES.map(() => '?').join(',')})`
  ).bind(venture, wave, ...WAVE_TERMINAL_STATUSES).first();
  return Number(row && row.n) === 0;
}

// The lowest wave that still has open rows. A wave with no rows at all is
// treated as already complete, since there is nothing in it to gate on.
export async function currentWave(db, { venture = 'glotemp' } = {}) {
  for (const w of WAVES) {
    const { results } = await db.prepare('SELECT id FROM city_register WHERE venture = ? AND wave = ? LIMIT 1').bind(venture, w).all();
    if (!results || !results.length) continue;
    if (!(await waveComplete(db, w, { venture }))) return w;
  }
  return null;
}

// The actual gate: is this row's wave the one currently allowed to send.
// Wave 0 (unassigned) is never gated, since it is not part of the ordered
// campaign.
export async function waveAllowsRow(db, row) {
  if (!row.wave) return { ok: true };
  const active = await currentWave(db, { venture: row.venture });
  if (active === null || row.wave <= active) return { ok: true };
  return { ok: false, reason: `Wave ${row.wave} cannot send yet. Wave ${active} is not finished.` };
}

/* ---------- the per-city rival lock ---------- */

// Every city starts locked, the moment it enters the register, so the
// absence of a row here is never mistaken for permission. Idempotent: an
// existing lock is never reopened by importing the same city again.
export async function ensureRivalLock(db, city) {
  const ts = nowIso();
  await db.prepare(
    `INSERT INTO rival_locks (city, locked, updated_at) VALUES (?, 1, ?) ON CONFLICT(city) DO NOTHING`
  ).bind(city, ts).run();
}

export async function isRivalLocked(db, city) {
  const row = await db.prepare('SELECT locked FROM rival_locks WHERE city = ?').bind(city).first();
  return !row || Number(row.locked) === 1;
}

export async function releaseRivalLock(db, city, note) {
  const ts = nowIso();
  await db.prepare(
    `INSERT INTO rival_locks (city, locked, released_at, released_note, updated_at) VALUES (?, 0, ?, ?, ?)
     ON CONFLICT(city) DO UPDATE SET locked = 0, released_at = excluded.released_at, released_note = excluded.released_note, updated_at = excluded.updated_at`
  ).bind(city, ts, String(note || ''), ts).run();
}

export async function relockRival(db, city, note) {
  const ts = nowIso();
  await db.prepare(
    `UPDATE rival_locks SET locked = 1, released_at = NULL, released_note = ?, updated_at = ? WHERE city = ?`
  ).bind(String(note || ''), ts, city).run();
}

/* ---------- live slots and the fourteen day window ---------- */

const WINDOW_DAYS = 14;

// The one report the owner produces, turned into everything it has to do:
// the city has a live name, the rival lock lifts, and the window clock
// starts. The lock lifting is "pending his approval to actually send", per
// the brief, which this leaves as it already reads: unlocking a city
// permits a rival draft to be composed and queued, and every draft still
// waits on the owner's own approve.
export async function recordLiveSlot(db, { city, vertical, name, url, note }) {
  const id = `slot-${String(city).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`;
  const start = new Date();
  const end = new Date(start.getTime() + WINDOW_DAYS * 86400000);
  await db.prepare(
    `INSERT INTO live_slots (id, city, vertical, name, url, window_start, window_end, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)`
  ).bind(id, city, vertical, name, url, start.toISOString(), end.toISOString(), nowIso()).run();
  await releaseRivalLock(db, city, note || `Live slot recorded for ${name}.`);
  return { id, windowStart: start.toISOString(), windowEnd: end.toISOString() };
}

export async function listLiveSlots(db, { status } = {}) {
  const where = status ? 'WHERE status = ?' : '';
  const binds = status ? [status] : [];
  const { results } = await db.prepare(`SELECT * FROM live_slots ${where} ORDER BY window_end`).bind(...binds).all();
  return results || [];
}

// Told before each expires, per section 6: a slot within the warning window
// that has not already been flagged. Marking it notified is a separate
// step (markSlotNotified) so a shift that reads this twice does not repeat
// the warning every time it runs.
export async function expiringLiveSlots(db, withinDays = 2) {
  const cutoff = new Date(Date.now() + withinDays * 86400000).toISOString();
  const { results } = await db.prepare(
    `SELECT * FROM live_slots WHERE status = 'active' AND window_end <= ? AND notified_expiring = 0 ORDER BY window_end`
  ).bind(cutoff).all();
  return results || [];
}

export async function markSlotNotified(db, id) {
  await db.prepare('UPDATE live_slots SET notified_expiring = 1 WHERE id = ?').bind(id).run();
}

// Run on a shift: nothing runs past its term silently, so a slot whose
// window has actually closed is moved to expired here rather than left
// active until somebody happens to notice.
export async function sweepExpiredSlots(db) {
  const nowStr = nowIso();
  const res = await db.prepare(`UPDATE live_slots SET status = 'expired' WHERE status = 'active' AND window_end <= ?`).bind(nowStr).run();
  return (res && res.meta && res.meta.changes) || 0;
}

/* ---------- composing a register campaign message ---------- */

// Every gate the brief specifies, checked in the order that makes the
// reason clearest: wave order first (nothing else matters if the wave has
// not opened), the rival lock second, the route third (nothing to compose
// against with no address or form), the owner fourth, then the copy itself
// and the standing rules, checked last on the complete body exactly as
// every other campaign in this house does it.
export async function composeRegisterMessage(db, row, { owner } = {}) {
  const blockers = [];

  const wave = await waveAllowsRow(db, row);
  if (!wave.ok) blockers.push(wave.reason);

  if (await isRivalLocked(db, row.city)) {
    blockers.push(`${row.city} is rival-locked. No message referencing a neighbouring venue may be generated until the owner confirms a first name is live there and releases the lock.`);
  }

  if (row.route_type === 'form') {
    if (!row.form_url) blockers.push('This row routes through a form but has no form URL recorded.');
  } else if (row.route_type !== 'email' || !row.resolved_contact_email) {
    blockers.push(`No send route for ${row.organisation || row.city}. Research a published contact address before this can be drafted.`);
  }

  if (!owner) blockers.push('No outreach owner is assigned for Glotemp yet. Assign one in Settings before this can be sent under anybody\'s name.');

  if (!REGISTER_CAMPAIGN_VERTICALS.includes(row.vertical)) {
    blockers.push(`"${row.vertical}" is not a register campaign vertical. It is one of: ${REGISTER_CAMPAIGN_VERTICALS.join(', ')}.`);
  }

  if (blockers.length) return { ok: false, blockers };

  const copy = registerCampaignCopy({
    vertical: row.vertical,
    language: row.language,
    city: row.city,
    foodUrl: row.food_url,
    pulseUrl: row.pulse_url
  });

  const stillOpen = [...new Set(copy.body.match(/\{[A-Za-z_][A-Za-z_ ]{1,30}\}/g) || [])];
  if (stillOpen.length) {
    return { ok: false, blockers: [`These are still unfilled and would go out as written: ${stillOpen.join(', ')}.`] };
  }

  const signature = signatureBlock(owner, { ventureLabel: 'Glotemp', locale: row.country, named: false });
  const body = copy.body.trimEnd() + '\n\n' + signature;

  const wordCount = body.split(/\s+/).filter(Boolean).length;
  if (wordCount > 120) blockers.push(`It runs to ${wordCount} words. The rule is under 120.`);

  const findings = checkOutreachRules(body, 'register_wave');
  if (findings.length) blockers.push(...findings.map((f) => f.finding));

  if (blockers.length) return { ok: false, blockers };

  return {
    ok: true,
    draft: {
      to: row.route_type === 'email' ? row.resolved_contact_email : '',
      formUrl: row.route_type === 'form' ? row.form_url : '',
      deliveryType: row.route_type,
      subject: copy.subject,
      body
    },
    warnings: copy.languageNote ? [copy.languageNote] : [],
    translated: copy.translated
  };
}
