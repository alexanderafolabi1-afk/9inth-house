// Who signs a venture's outreach, and how a message closes.
//
// A message signed by nobody is not from a legacy business, it is from a
// machine. The owner's rule is that every message ends with the sending
// partner's real name, their role, the venture, and the sending address, so
// the recipient knows who wrote to them. Which partner owns which venture is
// set from the desk, in outreach_owners (see db.js), never hardcoded here:
// the two are kept apart deliberately, the same way the postal address and
// the Anthropic key are, so a value that could only be set from a dashboard
// the owner cannot reach is not a value this file depends on.

export async function listOutreachOwners(db) {
  const { results } = await db.prepare('SELECT * FROM outreach_owners ORDER BY venture').bind().all();
  return results || [];
}

export async function getOutreachOwner(db, venture) {
  const row = await db.prepare('SELECT * FROM outreach_owners WHERE venture = ?')
    .bind(String(venture || '').trim().toLowerCase()).first();
  return row || null;
}

// Glotemp's owner, read from the partner roster this house already has
// rather than invented for this: Sipho Dlamini, Head of Partnerships & PR,
// is the one partner whose own defined remit names Glotemp outreach
// directly (worker/src/index.js's persona roster: "Glotemp is your most
// open door: city partnerships, sponsors, and the campus and student
// contributor layer"), and the city mandate itself names him as owning the
// approach. No other partner's remit mentions Glotemp outreach at all.
// Seeded once, only when nothing is assigned yet, so it never overwrites a
// change made from Settings; the admin remains the one place this is
// actually changed afterwards.
export async function seedDefaultOwners(db) {
  const existing = await getOutreachOwner(db, 'glotemp');
  if (existing) return;
  await setOutreachOwner(db, {
    venture: 'glotemp',
    name: 'Sipho Dlamini',
    role: 'Head of Partnerships & PR',
    email: 'marketing@glo-temp.com'
  });
}

export function describeOutreachOwner(input) {
  const name = String((input && input.name) || '').trim();
  const role = String((input && input.role) || '').trim();
  const email = String((input && input.email) || '').trim();
  const problems = [];
  if (!name) problems.push('A name is required. A message signed by nobody reads as sent by a machine.');
  if (!role) problems.push('A role is required, so the recipient knows the standing of who wrote to them.');
  if (!email) problems.push('A sending address is required.');
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) problems.push('That does not look like an email address.');
  return { ok: problems.length === 0, problems, value: { name, role, email } };
}

export async function setOutreachOwner(db, { venture, name, role, email }) {
  const check = describeOutreachOwner({ name, role, email });
  if (!check.ok) throw new Error(check.problems.join(' '));
  const key = String(venture || '').trim().toLowerCase();
  if (!key) throw new Error('A venture is required to assign an outreach owner.');
  await db.prepare(
    `INSERT INTO outreach_owners (venture, name, role, email, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(venture) DO UPDATE SET name = excluded.name, role = excluded.role, email = excluded.email, updated_at = excluded.updated_at`
  ).bind(key, check.value.name, check.value.role, check.value.email, new Date().toISOString()).run();
  return getOutreachOwner(db, key);
}

/* ---------- the sign-off ---------- */

// Gulf and other formal international markets, where the closing carries
// weight independent of whether a name was ever found. UK is here too: the
// owner's own rule names it explicitly.
const FORMAL_LOCALES = ['AE', 'SA', 'QA', 'KW', 'BH', 'OM', 'GB', 'UK'];

// Spanish-language markets. Several of the City Pin Tier A cities sit in
// these countries (Medellin, Cartagena, Oaxaca), so the closing has to speak
// the market natively even where the body of a house-authored template
// stays in English; a translated sign-off on an English letter is still
// wrong, but an English sign-off on a Spanish-speaking recipient is the one
// this file can actually fix without translating the whole template.
const SPANISH_LOCALES = ['ES', 'MX', 'AR', 'CO', 'CL', 'PE', 'UY', 'PY', 'BO', 'EC', 'VE', 'CR', 'PA', 'GT', 'HN', 'SV', 'NI', 'DO', 'CU'];

// Markets the register campaign added, each with its own native valediction
// rather than an English one appended to a translated letter. Keyed by
// country, the same as every other locale group here, so a future campaign
// into any of these markets inherits the right closing without having to
// know this list exists.
const NATIVE_SIGN_OFFS = {
  GR: 'Με εκτίμηση', HR: 'S poštovanjem',
  NL: 'Met vriendelijke groet', AW: 'Met vriendelijke groet', CW: 'Met vriendelijke groet',
  IS: 'Með kveðju', FR: 'Cordialement', JP: 'よろしくお願いいたします'
};

// The one rule the brief names as flatly wrong: "With respect" reads oddly
// in English and has no place in a proper closing. Never produced here.
export function signOffFor({ locale, named = false, thanksOwed = false, warm = false } = {}) {
  const loc = String(locale || '').trim().toUpperCase();
  if (SPANISH_LOCALES.includes(loc)) return warm ? 'Un cordial saludo' : 'Atentamente';
  if (NATIVE_SIGN_OFFS[loc]) return NATIVE_SIGN_OFFS[loc];
  if (thanksOwed) return 'With thanks';
  if (FORMAL_LOCALES.includes(loc)) return named ? 'Yours sincerely' : 'Yours faithfully';
  return 'Kind regards';
}

// The full block: a real sign-off, then the partner who actually owns this
// venture's outreach, their role, the venture, and the address it was sent
// from. Every field comes from outreach_owners; there is no default that
// papers over a missing one, since a placeholder here is exactly the failure
// section 1 exists to stop.
export function signatureBlock(owner, { ventureLabel, locale, named, thanksOwed, warm } = {}) {
  const signOff = signOffFor({ locale, named, thanksOwed, warm });
  return [
    `${signOff},`,
    '',
    owner.name,
    owner.role,
    ventureLabel || owner.venture,
    owner.email
  ].join('\n');
}
