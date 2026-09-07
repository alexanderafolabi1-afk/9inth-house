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

// Two distinct faults land here, both reported rather than guessed at
// beyond what is safe to assume.
//
// Overflow: a row that came in with unquoted commas inside one field reads
// as extra columns. The Naples fault named in the brief is exactly this,
// and the overflow is merged back into the named column, since that is the
// one place in this register a name is long enough to plausibly contain a
// comma.
//
// Underflow: a row shorter than the header. Found in the register actually
// supplied, not named in the brief: every row was short by one field, in
// the trailing block of optional columns (photo, status, agent, the two
// window dates, notes), which reads as an export that trims empty trailing
// columns rather than a fault in any one row. Padded with empty strings at
// the end, and only up to a small shortfall (three fields), since a row
// missing more than that is not this pattern and is reported instead of
// guessed at.
export function repairOverflowRows(rows, headerLen, mergeColumnIndex) {
  // What a row actually looks like when nothing about it has gone wrong.
  // Almost always equal to headerLen, but a source that trims trailing
  // empty columns produces a shorter shape on every row uniformly, and
  // overflow has to be measured against that real shape: measured against
  // the full header instead, a row with an embedded-comma fault is
  // undercounted by exactly the gap every other row already has, and one
  // piece of the overflowing field is lost rather than merged back in.
  const counts = new Map();
  for (const row of rows) counts.set(row.length, (counts.get(row.length) || 0) + 1);
  let normalLen = headerLen;
  let best = 0;
  for (const [len, n] of counts.entries()) {
    if (len <= headerLen && n > best) { best = n; normalLen = len; }
  }

  const padTo = (arr, len) => (arr.length < len ? [...arr, ...Array(len - arr.length).fill('')] : arr);

  const repaired = [];
  const stillWrong = [];
  const padded = [];
  for (const row of rows) {
    if (row.length === headerLen) { repaired.push(row); continue; }

    if (row.length > normalLen) {
      const overflow = row.length - normalLen;
      const before = row.slice(0, mergeColumnIndex);
      const merged = row.slice(mergeColumnIndex, mergeColumnIndex + overflow + 1).map((s) => String(s).trim()).join(', ');
      const after = row.slice(mergeColumnIndex + overflow + 1);
      const fixed = padTo([...before, merged, ...after], headerLen);
      if (fixed.length === headerLen) { repaired.push(fixed); padded.push(row[0]); continue; }
    }

    if (row.length < headerLen && headerLen - row.length <= 3) {
      repaired.push(padTo(row, headerLen));
      padded.push(row[0]);
      continue;
    }

    stillWrong.push(row);
  }
  return { rows: repaired, stillWrong, padded };
}

/* ---------- register rows ---------- */

// Recognised under either name: the placeholder header shape this importer
// was built against before the real register existed, and the actual
// export's own names once it arrived. Both are read the same way, so
// nothing about the import logic below has to know which one it got.
const HEADER_ALIASES = {
  city: ['city', 'city_name'],
  country: ['country'],
  vertical: ['vertical', 'who_pays_first'],
  language: ['language'],
  wave: ['wave'],
  food_url: ['food_url', 'glotemp_food_url'],
  pulse_url: ['pulse_url', 'glotemp_pulse_url'],
  dmo_contact: ['dmo_contact'],
  operator_email_if_public: ['operator_email_if_public'],
  board_name: ['organisation', 'board_name', 'board', 'dmo_or_board_name'],
  board_url: ['dmo_or_board_url'],
  operator_name: ['operator_name'],
  operator_url: ['operator_url'],
  notes: ['notes', 'why_they_pay']
};

// The export's language column names a language, not a code, and the sign
// off and the copy both key on the short code. Anything not listed falls
// through to the raw value lower cased, so an unrecognised language does
// not silently become English; it is treated as its own value and the copy
// system's own fallback to the English source text still applies.
const LANGUAGE_NAME_TO_CODE = {
  english: 'en', spanish: 'es', greek: 'el', croatian: 'hr', dutch: 'nl',
  icelandic: 'is', french: 'fr', japanese: 'ja'
};

// Country names, the same way. Only the ones the sign-off actually branches
// on need to resolve to a code; everything else keeps its name; owners.js
// falls back to "Kind regards" for anything it does not recognise, which is
// the correct default for a market with no closing convention named yet.
const COUNTRY_NAME_TO_CODE = {
  'united states': 'US', iceland: 'IS', croatia: 'HR', spain: 'ES', greece: 'GR', malta: 'MT',
  'curaçao': 'CW', curacao: 'CW', aruba: 'AW', 'french polynesia': 'PF',
  'united kingdom': 'GB', france: 'FR', japan: 'JP', 'united arab emirates': 'AE'
};

export function normaliseLanguage(value) {
  const v = String(value || 'en').trim().toLowerCase();
  return LANGUAGE_NAME_TO_CODE[v] || v;
}

export function normaliseCountry(value) {
  const v = String(value || '').trim().toLowerCase();
  return COUNTRY_NAME_TO_CODE[v] || String(value || '').trim();
}

// "club" is not one of the three verticals the owner's copy covers, but the
// register carries it (Pacha Ibiza, Scorpios Mykonos, Tootsie's Nashville).
// A club is closest in shape to a restaurant row: one venue, a quiet
// fourteen day placement, the same food_url field. Flagged rather than
// silent, since this is a judgement call the copy itself never made.
export function templateVerticalFor(vertical) {
  return vertical === 'club' ? 'restaurant' : vertical;
}

const REQUIRED_CANONICAL = ['city', 'vertical'];

// The register's own row shape, one level above the raw CSV. Anything the
// header does not name comes through empty rather than undefined, so every
// downstream check can read a field without asking first whether it exists.
export function rowsFromParsedCsv(rows, { venture = 'glotemp', wave = 0 } = {}) {
  if (!rows.length) return { records: [], errors: ['The file has no rows.'] };
  const header = rows[0].map((h) => String(h || '').trim().toLowerCase());

  // Resolve each canonical field to whichever alias is actually present.
  const columnFor = {};
  for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
    const found = aliases.find((a) => header.includes(a));
    if (found) columnFor[canonical] = header.indexOf(found);
  }

  const errors = [];
  for (const c of REQUIRED_CANONICAL) {
    if (columnFor[c] === undefined) errors.push(`The register is missing a required column. None of these were found: ${HEADER_ALIASES[c].join(', ')}.`);
  }
  if (errors.length) return { records: [], errors };

  const at = (row, canonical) => {
    const i = columnFor[canonical];
    return i === undefined ? '' : String(row[i] || '').trim();
  };

  const records = rows.slice(1).map((row) => {
    const vertical = at(row, 'vertical').toLowerCase();
    // A board is contacted as the board; everything else is contacted as
    // the named operator, since "who_pays_first" names a business, not the
    // destination marketing organisation, for every vertical but board.
    const organisation = vertical === 'board'
      ? (at(row, 'board_name') || at(row, 'operator_name'))
      : (at(row, 'operator_name') || at(row, 'board_name'));
    // The organisation's own site, never Glotemp's page about them: a board
    // is contacted at its board_url, everything else at the operator's own
    // url, mirroring exactly how the organisation name itself is chosen
    // above.
    const organisationUrl = vertical === 'board'
      ? (at(row, 'board_url') || at(row, 'operator_url'))
      : (at(row, 'operator_url') || at(row, 'board_url'));
    return {
      venture,
      city: at(row, 'city'),
      country: normaliseCountry(at(row, 'country')),
      organisation,
      organisation_url: organisationUrl,
      vertical,
      language: normaliseLanguage(at(row, 'language')),
      wave: Number(at(row, 'wave')) || wave,
      food_url: at(row, 'food_url'),
      pulse_url: at(row, 'pulse_url'),
      dmo_contact: at(row, 'dmo_contact'),
      operator_email_if_public: at(row, 'operator_email_if_public'),
      notes: at(row, 'notes')
    };
  });
  return { records, errors: [] };
}

// The brief's own send order, section 3, encoded here because the register
// itself carries no wave column: waves one, two and four are a fixed list
// of named cities, and wave three is a separate list (the Florida window)
// applied by importFloridaWindow below, not by name matching here.
export const WAVE_CITY_LISTS = {
  1: ['Ibiza', 'Santorini', 'Mykonos', 'Palma de Mallorca', 'Malta', 'Key West', 'Naples', 'Dubrovnik', 'Aruba', 'Curaçao', 'Curacao'],
  2: ['Savannah', 'Charleston', 'Asheville', 'Scottsdale', 'Tampa', 'Jacksonville'],
  4: ['London', 'New York', 'Paris', 'Tokyo', 'Dubai'],
  // Owner's decision: the cities the register carried but the brief's four
  // waves never named. Sent after wave four, same gating as every other
  // wave, rather than left out of the sequence indefinitely.
  5: ['Austin', 'Bora Bora', 'Boston', 'Denver', 'Nashville', 'New Orleans', 'Portland', 'Reykjavik', 'San Diego', 'Seattle']
};

export function waveForCity(city) {
  const c = String(city || '').trim().toLowerCase();
  for (const [wave, list] of Object.entries(WAVE_CITY_LISTS)) {
    if (list.some((name) => name.toLowerCase() === c)) return Number(wave);
  }
  return 0;
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

// Section 5.1's research pass, run against the register as actually
// supplied and recorded here, keyed by city and vertical the same way the
// register itself is, so re-importing the same file does not lose it. A
// city this table has no entry for is simply left wherever decideRoute put
// it; nothing here is guessed, every address was found published on the
// organisation's own site, a named PR agency of record, or an official
// board contact page, and is applied only where the register did not
// already carry a better one.
//
// Nineteen of the thirty five resolved to a real address this way; the
// other sixteen kept their form route, several against a more specific
// page than the register's own organisation_url named (recorded in note
// rather than as an email, since a page is not an address).
const KNOWN_RESEARCH = {
  'curaçao|hotel': { email: 'reservations@baoase.com', source: 'Baoase Luxury Resort\'s own site, general reservations address; no dedicated press contact found.' },
  'ibiza|club': { email: 'collaborations@pacha.com', source: 'Pacha Ibiza\'s own site, partnerships and collaborations address.' },
  'key west|hotel': { email: 'PIERHOUSERESORT@MAYFIELDPR.COM', source: 'Mayfield Group, Pier House Resort\'s PR agency of record.' },
  'mykonos|club': { email: 'press@scorpios.com', source: 'Scorpios Mykonos\'s own site, press contact.' },
  'palma de mallorca|board': { email: 'palmainfo@palma.es', source: 'Fundació Turisme Palma\'s published general tourism contact.' },
  'charleston|restaurant': { email: 'ndg@sprouthouseagency.com', source: 'Sprout House Agency, Husk\'s PR agency of record.' },
  'jacksonville|board': { email: 'amestdagh@visitjacksonville.com', source: 'Visit Jacksonville\'s own site: Andrea Mestdagh, media and content creator contact, named and published.' },
  'scottsdale|hotel': { email: 'PHXLCInfo@marriott.com', source: 'The Phoenician\'s published general resort contact. A named marketing director, Georgina Lucas, is on the press page with no address published.' },
  'orlando|hotel': { email: 'grandelakesleads@marriott.com', source: 'Grande Lakes\'s published sales contact. Media inquiries are handled by The Brandman Agency; the agency\'s named contact has no published address.' },
  'tallahassee|board': { email: 'Kerri.Post@VisitTallahassee.com', source: 'Visit Tallahassee\'s own site: Kerri Post, Executive Director of Tourism Development, named and published as the partnerships contact.' },
  'new york|board': { email: 'jngo@nyctourism.com', source: 'NYC Tourism + Conventions\'s own site: Julia Ngo, Director of Media, named and published.' },
  'paris|board': { email: 'f.guitard@parisinfo.com', source: 'Office du Tourisme et des Congrès de Paris\'s own press site: Fiona Guitard, named press contact, published alongside a second named contact, Maryline Piel.' },
  'tokyo|board': { email: 'mediasupport@tcvb.or.jp', source: 'Tokyo Convention & Visitors Bureau\'s own site, overseas media support address.' },
  'austin|restaurant': { email: 'franklinbbq@gmail.com', source: 'Franklin Barbecue\'s own published general address; no dedicated press contact found.' },
  'bora bora|hotel': { email: 'borabora.liaison@stregis.com', source: 'The St. Regis Bora Bora Resort\'s own published property contact address.' },
  'denver|restaurant': { email: 'jen@riojadenver.com', source: 'Rioja\'s own site: Jennifer Jasinski, Executive Chef and Owner, named and published.' },
  'new orleans|restaurant': { email: 'commanderspalace@beccapr.com', source: 'Becca PR, Commander\'s Palace\'s PR agency of record.' },
  'portland|restaurant': { email: 'info@lepigeon.com', source: 'Le Pigeon\'s own published general address; no dedicated press contact found.' },
  'reykjavik|board': { email: 'hulda.gunnarsdottir@reykjavik.is', source: 'Visit Reykjavík\'s own site: Hulda Gunnarsdóttir, Media Representative of Reykjavík City, named and published.' }
};

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
      food_url, pulse_url, dmo_contact, operator_email_if_public, organisation_url,
      resolved_contact_email, contact_source, route_type, form_url,
      url_check_ok, url_check_note, status, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      venture = excluded.venture, city = excluded.city, country = excluded.country,
      organisation = excluded.organisation, vertical = excluded.vertical,
      language = excluded.language, wave = excluded.wave,
      food_url = excluded.food_url, pulse_url = excluded.pulse_url,
      dmo_contact = excluded.dmo_contact, operator_email_if_public = excluded.operator_email_if_public,
      organisation_url = excluded.organisation_url,
      resolved_contact_email = excluded.resolved_contact_email, contact_source = excluded.contact_source,
      route_type = excluded.route_type, form_url = excluded.form_url,
      url_check_ok = excluded.url_check_ok, url_check_note = excluded.url_check_note,
      status = excluded.status, notes = excluded.notes, updated_at = excluded.updated_at
  `).bind(
    id, row.venture || 'glotemp', row.city, row.country || '', row.organisation || '',
    row.vertical, row.language || 'en', Number(row.wave) || 0,
    row.food_url || '', row.pulse_url || '', row.dmo_contact || '', row.operator_email_if_public || '',
    row.organisation_url || '',
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
  // "use form on board URL" names where the form lives: the organisation's
  // own site, never a Glotemp page about them. Falling back to food_url or
  // pulse_url here would open our own city page instead of the board's, so
  // organisation_url is the only fallback used.
  if (/\bform\b/i.test(dmo) && row.organisation_url) {
    return { route_type: 'form', form_url: row.organisation_url };
  }
  return { route_type: 'none' };
}

// The full pipeline: parse, repair known overflow, dedupe, decide a route,
// check every link, and only then write to the table. Nothing here invents
// a contact address; decideRoute reads what the register already says, and
// the actual research step (finding a real address the register does not
// yet have) is section 5's agent step, run separately against rows this
// import leaves at route_type "none".
export async function importRegisterCsv(db, text, { venture = 'glotemp', wave = 0, mergeColumnHint, fetchImpl } = {}) {
  const raw = parseCsv(text);
  if (!raw.length) return { imported: 0, errors: ['The file is empty.'] };
  const headerLen = raw[0].length;
  const header = raw[0].map((h) => String(h).trim().toLowerCase());
  // Resolved against whichever alias for the name column the header
  // actually carries, the same way every other field is, rather than a
  // single hardcoded name: the real register calls it dmo_or_board_name,
  // not organisation, and a literal string match against the wrong header
  // silently merges overflow into column zero instead of refusing to guess.
  const nameAlias = mergeColumnHint || HEADER_ALIASES.board_name.find((a) => header.includes(a));
  const mergeIndex = nameAlias ? Math.max(0, header.indexOf(nameAlias)) : 0;
  const { rows: repaired, stillWrong, padded } = repairOverflowRows(raw.slice(1), headerLen, mergeIndex);
  const { records, errors } = rowsFromParsedCsv([raw[0], ...repaired], { venture, wave });
  if (errors.length) return { imported: 0, errors };

  const { kept, dropped } = dedupeRegisterRows(records);

  let imported = 0;
  const urlIssues = [];
  for (const r of kept) {
    // The register carries no wave column of its own; the brief's four-wave
    // order is a fixed list of named cities, applied here. An explicit wave
    // already on the row (a hand edit, or the import options) is never
    // overridden by it.
    if (!r.wave) r.wave = waveForCity(r.city);
    const foodCheck = await checkUrl(r.food_url, { fetchImpl });
    const pulseCheck = await checkUrl(r.pulse_url, { fetchImpl });
    if (!foodCheck.ok) { urlIssues.push({ city: r.city, field: 'food_url', note: foodCheck.note }); r.food_url = ''; }
    if (!pulseCheck.ok) { urlIssues.push({ city: r.city, field: 'pulse_url', note: pulseCheck.note }); r.pulse_url = ''; }

    let routed = decideRoute(r);
    // The research pass wins over a bare form route: a real address found
    // and recorded is always better than the fallback of opening a page and
    // hoping. It never overrides a route the register itself already gave
    // as an email; a public address the organisation published to the
    // register is at least as good as one found by searching for it.
    const known = KNOWN_RESEARCH[`${String(r.city || '').trim().toLowerCase()}|${String(r.vertical || '').trim().toLowerCase()}`];
    if (known && routed.route_type !== 'email') {
      routed = { route_type: 'email', resolved_contact_email: known.email, contact_source: known.source };
    }
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
    rowsPadded: padded.length,
    urlIssues,
    errors: []
  };
}

// Wave three, section 3: "Florida hotels for the 19 November window", a
// separate list rather than a column on the main register. Four of its
// eight cities (Tampa, Jacksonville, Key West, Naples) are already named in
// wave one or two, and are not double-booked into a third wave on top of
// that: the conflict is reported rather than resolved silently, since which
// wave actually owns that organisation's one contact is the owner's call.
// The remaining four (Miami, Orlando, Fort Lauderdale, Tallahassee) are
// genuinely new to the ordered campaign and are assigned wave three,
// against the row the main register import already created for them.
// The owner's decision on the four cities the window shares with wave one
// or two: contacted twice, not skipped. Kept in their original wave for
// the first touch, and a second row created here for the window itself,
// linked back to the first by follow_up_of. composeRegisterMessage refuses
// the second touch until MIN_SECOND_TOUCH_DAYS have passed since the first
// was actually sent, and it composes as a follow-up that references the
// first message rather than the flat first-touch copy, once that copy is
// approved (see registerFollowUpCopy).
export async function importFloridaWindowCsv(db, text, { venture = 'glotemp' } = {}) {
  const raw = parseCsv(text);
  if (!raw.length) return { assigned: [], secondTouch: [], notFound: [], errors: ['The file is empty.'] };
  const header = raw[0].map((h) => String(h).trim().toLowerCase());
  const idx = (name) => header.indexOf(name);
  const at = (row, name) => { const i = idx(name); return i === -1 ? '' : String(row[i] || '').trim(); };

  const assigned = [];
  const secondTouch = [];
  const notFound = [];
  const ts = nowIso();

  for (const row of raw.slice(1)) {
    const city = at(row, 'city_name');
    const vertical = at(row, 'who_pays_first').toLowerCase();
    if (!city || !vertical) continue;
    const id = `${city.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${vertical}`;
    const existing = await getRegisterRow(db, id);
    if (!existing) { notFound.push(`${city} (${vertical})`); continue; }

    const note = [
      at(row, 'window_product') && `Florida window product: ${at(row, 'window_product')}.`,
      at(row, 'suggested_band') && `Suggested band: ${at(row, 'suggested_band')}.`,
      at(row, 'window_end') && `Send by ${at(row, 'window_end')}.`,
      at(row, 'why_this_city')
    ].filter(Boolean).join(' ');

    if (existing.wave === 1 || existing.wave === 2) {
      const touchId = `${id}-nov-touch`;
      await upsertRegisterRow(db, {
        id: touchId,
        venture: existing.venture,
        city: existing.city,
        country: existing.country,
        organisation: existing.organisation,
        organisation_url: existing.organisation_url,
        vertical: existing.vertical,
        language: existing.language,
        wave: 3,
        food_url: existing.food_url,
        pulse_url: existing.pulse_url,
        dmo_contact: existing.dmo_contact,
        operator_email_if_public: existing.operator_email_if_public,
        resolved_contact_email: existing.resolved_contact_email,
        contact_source: existing.contact_source,
        route_type: existing.route_type,
        form_url: existing.form_url,
        url_check_ok: existing.url_check_ok,
        status: existing.route_type === 'none' ? 'no_route' : 'pending',
        notes: note,
        created_at: ts
      });
      await db.prepare('UPDATE city_register SET follow_up_of = ? WHERE id = ?').bind(existing.id, touchId).run();
      secondTouch.push(`${city} (second touch, follows the wave ${existing.wave} message, minimum ${MIN_SECOND_TOUCH_DAYS} days after it is sent)`);
      continue;
    }

    await db.prepare('UPDATE city_register SET wave = 3, notes = ?, updated_at = ? WHERE id = ?').bind(note, ts, id).run();
    assigned.push(city);
  }

  return { assigned, secondTouch, notFound, errors: [] };
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

export const WAVES = [1, 2, 3, 4, 5];
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
// The owner's rule on the four cities contacted twice: minimum three weeks
// between the two touches.
export const MIN_SECOND_TOUCH_DAYS = 21;

// How long since the row this one follows up on was actually sent, in
// whole days, or null if it has not been sent yet at all. Read from
// outreach_messages directly rather than trusted from the register, since
// the register only knows what it was told and a message can be approved
// without yet being sent.
export async function daysSinceSent(db, registerRowId) {
  const row = await db.prepare(
    `SELECT sent_at FROM outreach_messages WHERE prospect_id = ? AND status = 'sent' ORDER BY sent_at DESC LIMIT 1`
  ).bind(registerRowId).first();
  if (!row || !row.sent_at) return null;
  return (Date.now() - new Date(row.sent_at).getTime()) / 86400000;
}

export async function composeRegisterMessage(db, row, { owner } = {}) {
  const blockers = [];

  const wave = await waveAllowsRow(db, row);
  if (!wave.ok) blockers.push(wave.reason);

  if (row.follow_up_of) {
    const days = await daysSinceSent(db, row.follow_up_of);
    if (days === null) {
      blockers.push('This is a second touch, and the first message to this organisation has not been recorded as sent yet.');
    } else if (days < MIN_SECOND_TOUCH_DAYS) {
      blockers.push(`Only ${Math.floor(days)} day${Math.floor(days) === 1 ? '' : 's'} since the first message. A second touch needs at least ${MIN_SECOND_TOUCH_DAYS} days.`);
    }
  }

  if (await isRivalLocked(db, row.city)) {
    blockers.push(`${row.city} is rival-locked. No message referencing a neighbouring venue may be generated until the owner confirms a first name is live there and releases the lock.`);
  }

  if (row.route_type === 'form') {
    if (!row.form_url) blockers.push('This row routes through a form but has no form URL recorded.');
  } else if (row.route_type !== 'email' || !row.resolved_contact_email) {
    blockers.push(`No send route for ${row.organisation || row.city}. Research a published contact address before this can be drafted.`);
  }

  if (!owner) blockers.push('No outreach owner is assigned for Glotemp yet. Assign one in Settings before this can be sent under anybody\'s name.');

  // A club (Pacha Ibiza, Scorpios Mykonos) is not one of the three verticals
  // the copy covers, and is sent on the restaurant shape: one venue, the
  // same food_url field, the closest fit of the three. templateVerticalFor
  // makes that mapping explicit rather than the row silently taking on a
  // vertical it does not actually have; row.vertical itself is untouched,
  // so reporting and filtering still see "club" for what it is.
  const templateVertical = templateVerticalFor(row.vertical);
  if (!REGISTER_CAMPAIGN_VERTICALS.includes(templateVertical)) {
    blockers.push(`"${row.vertical}" has no register campaign template. Templates exist for: ${REGISTER_CAMPAIGN_VERTICALS.join(', ')} (club uses the restaurant template).`);
  }

  // A second touch is never sent on the first-touch copy: it would read as
  // a cold approach, which is exactly what the owner said not to do. It
  // waits for its own approved copy, the same as it waited for its own
  // sign-off before being written at all.
  if (row.follow_up_of && !blockers.length) {
    blockers.push('This is a second touch. It has no approved follow-up copy yet, and is not sent on the first-touch template.');
  }

  if (blockers.length) return { ok: false, blockers };

  const copy = registerCampaignCopy({
    vertical: templateVertical,
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
