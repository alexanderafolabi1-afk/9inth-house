// Outreach: campaigns, the reference standard, prospects and prepared messages.
//
// The rule this file exists to enforce is the owner's: a message is written for
// one named person, from research on that person and that organisation. Not a
// template with the fields swapped. The repository already held five such
// templates in outreach.md, which is exactly what this supersedes.
//
// A reference example is the standard for a campaign type, held verbatim. The
// Visit Dubai pack is the first: it sets the structure, the register, the length
// and how the proposition is framed for founding partner outreach, and every
// later message of that type is written against it rather than against a
// remembered impression of it. More can be added per campaign type from the
// admin, since the owner has said there will be more.

import { nowIso } from './db.js';
import {
  VISIT_DUBAI_EMAIL_BODY, VISIT_DUBAI_SUBJECT, VISIT_DUBAI_SUBJECT_ORIGINAL,
  VISIT_DUBAI_TO, VISIT_DUBAI_CC, VISIT_DUBAI_GUARDRAILS, VISIT_DUBAI_PROSPECT,
  VISIT_DUBAI_SEND_AFTER
} from './seeds/visit-dubai.js';

import {
  CITY_PIN_SKUS, CITY_PIN_FLOOR_USD, CITY_PIN_VERTICALS, TIER_A_CITIES,
  CITY_PIN_RESEARCH_HARD, CITY_PIN_RESEARCH_SOFT,
  CITY_PIN_EMAIL_SOURCES, CITY_PIN_EMAIL_SOURCES_REFUSED, CITY_PIN_GUARDRAILS,
  CITY_PIN_FOOD_EMAIL, CITY_PIN_FOOD_SUBJECT, CITY_PIN_NIGHT_EMAIL, CITY_PIN_NIGHT_SUBJECT,
  CITY_PIN_ROOM_EMAIL, CITY_PIN_ROOM_SUBJECT, CITY_PIN_TOUR_EMAIL, CITY_PIN_TOUR_SUBJECT,
  CITY_PIN_FOLLOW_UP_DAY_3, CITY_PIN_FOLLOW_UP_DAY_7, CITY_PIN_CADENCE,
  CITY_PIN_QUOTA, CITY_PIN_VOICE, CITY_PIN_PRODUCT, CITY_PIN_LINES,
  CITY_PIN_SKIP, TIER_B_SIGNALS, CITY_PIN_VERTICALS_CLOSED, CITY_PIN_ON_REPLY
} from './seeds/city-pin.js';

export { VISIT_DUBAI_GUARDRAILS, CITY_PIN_GUARDRAILS };
export {
  CITY_PIN_SKUS, CITY_PIN_FLOOR_USD, CITY_PIN_VERTICALS, TIER_A_CITIES,
  CITY_PIN_RESEARCH_HARD, CITY_PIN_RESEARCH_SOFT, CITY_PIN_EMAIL_SOURCES,
  CITY_PIN_CADENCE, CITY_PIN_QUOTA, CITY_PIN_VOICE, CITY_PIN_PRODUCT,
  CITY_PIN_LINES, CITY_PIN_SKIP, TIER_B_SIGNALS, CITY_PIN_VERTICALS_CLOSED,
  CITY_PIN_ON_REPLY
};


// The two Glotemp campaign types, kept apart deliberately. Founding partner
// sells participation in something being built; need led sells a solution to
// something already broken. Collapsing them into one would produce a message
// that does neither, since the first has to be honest that the thing is new and
// the second must not lead with that at all.
export const CAMPAIGN_TYPES = {
  founding_partner: {
    label: 'Founding partner',
    guidance: 'Sells participation in something being built. It may say the arrangement is a first and will not repeat, because that is true and checkable. It must never imply an installed base, a peer list or a track record that does not exist.'
  },
  need_led: {
    label: 'Need led',
    guidance: 'Sells a solution to a problem the organisation visibly already has. The problem must be evidenced from their own public material, never assumed. It does not open by announcing that the product is new.'
  },
  // The deliberate opposite of founding partner. That one waits on six
  // signatures; this one is sized to be decided alone, by an operator who needs
  // covers on Thursday, and it is meant to close inside the week.
  city_pin: {
    label: 'City pin',
    guidance: 'Sells a named lock on one city and one vertical for 90 days to a single operator. Never the homepage, never a partnership of record. One offer, one city, one vertical, one price. The rival is a type and a direction, never a name. Priced at 490, 790 or 1900 with a floor of 390.'
  }
};

export function isCampaignType(key) {
  return Object.prototype.hasOwnProperty.call(CAMPAIGN_TYPES, key);
}

/* ---------- the standing rules every message is checked against ---------- */

// The owner's rules, encoded rather than described, so a message can be checked
// against them before he ever sees it. Each returns a finding when broken.
//
// These are not style preferences. Every one of them is a thing that would
// damage the house if it went out: a phone ask he has forbidden, a fabricated
// relationship, a price nobody authorised, or an approach to a person he has
// explicitly said not to open with.
export const OUTREACH_RULES = [
  {
    id: 'no_call_ask',
    test: (t) => /\b(hop on a|jump on a|quick call|phone call|video call|zoom|google meet|teams call|give me a ring|call you)\b/i.test(t),
    finding: 'It asks for a call. Every next step stays in writing.'
  },
  {
    id: 'no_stacking',
    test: (t) => /\b(and also|as well as that,|we also offer|in addition we)\b/i.test(t),
    finding: 'It stacks a second proposition. One proposition per message.'
  },
  {
    id: 'no_false_urgency',
    test: (t) => /\b(act now|limited time only|only \d+ (spots|places) left|last chance|hurry|expires in \d+ hours|final call)\b/i.test(t),
    finding: 'It manufactures urgency. A real deadline the house has set is allowed; an invented one is not.'
  },
  {
    id: 'no_fake_proof',
    test: (t) => /\b(join \d+\+? (?:other )?(?:brands|companies|boards|clients)|trusted by \d+|used by thousands|everyone is)\b/i.test(t),
    finding: 'It claims social proof the house cannot evidence.'
  },
  {
    id: 'no_invented_connection',
    test: (t) => /\b(our mutual (friend|contact|connection)|we met at|as we discussed|following our conversation|per our chat)\b/i.test(t),
    finding: 'It implies a relationship or a prior conversation that does not exist.'
  },
  {
    id: 'no_exclamation',
    test: (t) => /!/.test(t),
    finding: 'It uses an exclamation mark. The house does not manufacture enthusiasm.'
  },
  {
    id: 'no_begging',
    test: (t) => /\b(just wondering if|sorry to bother|i know you'?re busy|any chance you could|would love to pick your brain|hoping you might)\b/i.test(t),
    finding: 'The register slips into apology. Confident and unhurried, never begging.'
  },
  {
    // The Visit Dubai pack arrived with [Full name], [Title], [direct phone]
    // and [email] still in the signature block. Sending that to a government
    // body is the single most embarrassing way this could fail, and it is the
    // easiest one to miss on a phone at seven in the morning.
    // Braces as well as brackets: the City Pin master emails are templates
    // carrying {City} and {Trading name}, and an unfilled brace reaching an
    // operator is the same failure as an unfilled signature reaching a ministry.
    id: 'no_unfilled_placeholder',
    test: (t) => /\[[A-Za-z][A-Za-z ]{1,30}\]/.test(t) || /\{[A-Za-z][A-Za-z ]{1,30}\}/.test(t),
    finding: 'It still has placeholders in it. Fill every one of them from the research before this goes.'
  },
  {
    // The brief bans emoji outright. Mechanical, so it is checked rather than
    // trusted, and it catches the pictographic ranges rather than punctuation.
    id: 'no_emoji',
    test: (t) => /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u.test(t),
    finding: 'It uses an emoji. The house does not.'
  },
  {
    id: 'no_hollow_opener',
    test: (t) => /\b(hope this (email )?finds you well|hope (you'?re|you are) (doing )?well|hope all is well|trust this finds you)\b/i.test(t),
    finding: 'It opens with a pleasantry that says nothing. Open on the city.'
  },
  {
    // Rival language is a direction, never a name and never an injury. "Your
    // neighbour will" is allowed; "your neighbour is dying" is the line.
    id: 'no_disparagement',
    test: (t) => /\b(is dying|are dying|is struggling|are struggling|going under|unlike (them|their)|better than (them|theirs)|they cannot compete|their food is|nobody goes there)\b/i.test(t),
    finding: 'It disparages a competitor. The rival is a direction, never an injury and never a name.'
  },
  {
    // Distinct from invented urgency: this is inventing scarcity of our own
    // inventory, which is the specific lie the brief calls out.
    id: 'no_fake_inventory_scarcity',
    test: (t) => /\b(only \d+ (seats?|slots?|spots?|places?) (left|remaining) on the (homepage|instrument|site)|\d+ spots? left on the homepage)\b/i.test(t),
    finding: 'It invents scarcity of our own inventory. The real constraint is one exclusive per vertical per city, and that is enough.'
  },
  {
    // The DET conversation is open and unclosed. Implying otherwise to a
    // restaurant in Lisbon would be a lie told to make a small sale. Scoped,
    // because the letter to Visit Dubai itself obviously names them.
    id: 'no_unearned_partner_claim',
    campaigns: ['city_pin', 'need_led'],
    test: (t) => /\b(visit dubai|dubai corporation for tourism|\bDET\b)\b/i.test(t),
    finding: 'It mentions the Dubai conversation, which is open and unclosed. It cannot be used as proof to anyone.'
  },
  {
    id: 'no_hype',
    test: (t) => /\b(game changer|revolutionary|unlock|unleash|supercharge|cutting edge|world class|best in class|synergy)\b/i.test(t),
    finding: 'It reaches for hype instead of saying something specific.'
  }
];

// Checked before the owner is asked to approve anything, so a message that
// breaks a standing rule never reaches him looking finished.
//
// A rule with no campaigns list applies to everything, which is the default and
// the right one: a rule that has to be opted into is a rule that gets forgotten
// on the next campaign. Only a rule that would be wrong somewhere names where
// it applies.
export function checkOutreachRules(text, campaignType) {
  const body = String(text || '');
  return OUTREACH_RULES
    .filter((r) => !r.campaigns || (campaignType && r.campaigns.includes(campaignType)))
    .filter((r) => r.test(body))
    .map((r) => ({ id: r.id, finding: r.finding }));
}

// Section 4's research gate. A message is not written until all three are
// evidenced, and a prospect that cannot answer them is parked for more research
// rather than written to on assumption.
export const RESEARCH_REQUIRED = ['what_they_do', 'what_is_missing', 'why_now'];

export function researchGate(prospect) {
  const research = (prospect && prospect.research) || {};
  const missing = RESEARCH_REQUIRED.filter((k) => !String(research[k] || '').trim());
  return { ready: missing.length === 0, missing };
}

/* ---------- the City Pin gates ---------- */

// Nine fields, weighted. The four that are the message itself can never be
// missing. For the other five the owner's rule is that two missing means do not
// send, which is applied literally: one gap is a thin lead, two is a guess.
export function cityPinGate(prospect) {
  const r = (prospect && prospect.research) || {};
  const has = (k) => Boolean(String(r[k] || '').trim());
  const missingHard = CITY_PIN_RESEARCH_HARD.filter((f) => !has(f.key));
  const missingSoft = CITY_PIN_RESEARCH_SOFT.filter((f) => !has(f.key));
  const reasons = [];
  for (const f of missingHard) reasons.push(`${f.label} is missing, and nothing can be written without it.`);
  if (missingSoft.length >= 2) {
    reasons.push(`${missingSoft.length} of the five research fields are empty: ${missingSoft.map((f) => f.label.toLowerCase()).join(', ')}. Two gaps is a guess. Research the next lead and come back to this one.`);
  }
  return { ready: reasons.length === 0, reasons, missingHard, missingSoft };
}

// Where the address came from, checked rather than assumed. What separates a
// public business inbox from a scraped one is not the domain: a small kitchen
// that lists its own free-mail address on its own site has published a business
// inbox, and a pattern-guessed address at a company domain has not. So this
// asks who published it, and refuses the answers that mean nobody did.
export function checkEmailProvenance(prospect) {
  const r = (prospect && prospect.research) || {};
  const source = String(r.email_source || '').trim().toLowerCase();
  const email = String(r.public_email || '').trim();
  if (!email) return { ok: false, problem: 'There is no public email on this lead.' };
  if (!source) {
    return { ok: false, problem: 'Nothing records where this address was published. Name the source: their own site, Google Business, Instagram bio, TripAdvisor, or a municipal guide.' };
  }
  if (CITY_PIN_EMAIL_SOURCES_REFUSED.includes(source)) {
    return { ok: false, problem: `This address is recorded as "${source}", which means nobody published it. Bought, guessed and scraped addresses are not contacted.` };
  }
  if (!Object.prototype.hasOwnProperty.call(CITY_PIN_EMAIL_SOURCES, source)) {
    return { ok: false, problem: `"${source}" is not a source the house recognises. Use one of: ${Object.keys(CITY_PIN_EMAIL_SOURCES).join(', ')}.` };
  }
  return { ok: true, source, published: CITY_PIN_EMAIL_SOURCES[source] };
}

// The offer itself. An agent may discount within reason and may not invent a
// product, and the difference between those two is a number.
export function checkCityPinOffer({ sku, priceUsd } = {}) {
  const problems = [];
  const spec = CITY_PIN_SKUS[sku];
  if (!spec) {
    problems.push(`"${sku}" is not a City Pin product. It is one of: ${Object.keys(CITY_PIN_SKUS).join(', ')}.`);
    return { ok: false, problems };
  }
  const price = Number(priceUsd);
  if (!Number.isFinite(price) || price <= 0) problems.push('No price was set on this offer.');
  else if (price < CITY_PIN_FLOOR_USD) {
    problems.push(`USD ${price} is below the floor of USD ${CITY_PIN_FLOOR_USD}. Below the floor this is not a discount, it is a different product, and that is not an agent's to invent.`);
  }
  const warnings = [];
  if (spec && Number.isFinite(price) && price < spec.priceUsd && price >= CITY_PIN_FLOOR_USD) {
    warnings.push(`Discounted from the USD ${spec.priceUsd} list price for ${spec.label}.`);
  }
  if (spec && spec.leadWith === false) {
    warnings.push('The 12 month anchor is not led with. It is offered when they ask what a year costs.');
  }
  return { ok: problems.length === 0, problems, warnings, spec };
}

// The master emails all open by saying the city is already live. That sentence
// is either true or it is a false claim made to a stranger who is about to be
// invoiced, and the brief allows a lead whose city is only planned, so the two
// have to be reconciled somewhere. Here.
export function checkCityIsLive(prospect) {
  const r = (prospect && prospect.research) || {};
  const live = r.city_is_live;
  if (live === true || live === 'true' || live === 'yes') return { ok: true };
  return {
    ok: false,
    problem: `${r.city || 'This city'} is not confirmed live on glo-temp.com. Every master email opens by saying the city already has a public pulse, and sending that to an operator who can check in one click is a false claim. Stand the city page up first, or write an opening that does not claim it.`
  };
}

// One exclusive per vertical per city, honoured across every agent and every
// day, because the whole 790 SKU is worth nothing the first time it is sold
// twice. Keyed on city and vertical alone for exactly that reason.
export async function exclusiveHolder(db, city, vertical) {
  const row = await db.prepare(
    `SELECT city, vertical, prospect_id, organisation, sold_at FROM exclusives
      WHERE city = ? AND vertical = ?`
  ).bind(normaliseKey(city), normaliseKey(vertical)).first();
  return row || null;
}

export async function claimExclusive(db, { city, vertical, prospectId, organisation }) {
  const held = await exclusiveHolder(db, city, vertical);
  if (held) {
    if (held.prospect_id === String(prospectId)) return { ok: true, alreadyOurs: true, held };
    return { ok: false, held, problem: `The ${vertical} exclusive on ${city} is already held by ${held.organisation}. There is one per vertical per city, and selling it twice would end the only thing that makes it worth 790.` };
  }
  await db.prepare(
    'INSERT INTO exclusives (city, vertical, prospect_id, organisation, sold_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(normaliseKey(city), normaliseKey(vertical), String(prospectId), String(organisation || ''), nowIso()).run();
  return { ok: true, alreadyOurs: false };
}

export async function releaseExclusive(db, city, vertical) {
  await db.prepare('DELETE FROM exclusives WHERE city = ? AND vertical = ?')
    .bind(normaliseKey(city), normaliseKey(vertical)).run();
}

export async function openSlots(db, cities = TIER_A_CITIES) {
  const { results } = await db.prepare('SELECT city, vertical FROM exclusives').bind().all();
  const taken = new Set((results || []).map((r) => `${r.city}|${r.vertical}`));
  const verticals = Object.keys(CITY_PIN_VERTICALS);
  const out = [];
  for (const city of cities) {
    const free = verticals.filter((v) => !taken.has(`${normaliseKey(city)}|${normaliseKey(v)}`));
    if (free.length) out.push({ city, open: free });
  }
  return out;
}

function normaliseKey(v) {
  return String(v || '').trim().toLowerCase();
}

/* ---------- composing a City Pin draft ---------- */

const CITY_PIN_TEMPLATES = {
  food: { subject: CITY_PIN_FOOD_SUBJECT, body: CITY_PIN_FOOD_EMAIL },
  night: { subject: CITY_PIN_NIGHT_SUBJECT, body: CITY_PIN_NIGHT_EMAIL },
  rooms: { subject: CITY_PIN_ROOM_SUBJECT, body: CITY_PIN_ROOM_EMAIL },
  tours: { subject: CITY_PIN_TOUR_SUBJECT, body: CITY_PIN_TOUR_EMAIL },
  // The hybrid sells on the same tonight logic as food, so it opens the same way.
  fashion_food: { subject: CITY_PIN_FOOD_SUBJECT, body: CITY_PIN_FOOD_EMAIL }
};

// Twenty a day is only possible if the filling is mechanical and the refusing is
// automatic. This does both: it fills the template from the research, and it
// refuses on every gate the owner set rather than producing something that looks
// finished and is not.
//
// It returns a draft or it returns why not. It never returns a draft with a gap
// papered over, because a papered gap is what reaches an operator who can check
// it in one click.
export function composeCityPin(prospect, { sku = 'pin_90', priceUsd, agentName, neighbourhood, street } = {}) {
  const blockers = [];
  const warnings = [];
  const r = (prospect && prospect.research) || {};

  const gate = cityPinGate(prospect);
  if (!gate.ready) blockers.push(...gate.reasons);

  const provenance = checkEmailProvenance(prospect);
  if (!provenance.ok) blockers.push(provenance.problem);

  const live = checkCityIsLive(prospect);
  if (!live.ok) blockers.push(live.problem);

  const vertical = String(r.vertical || '').trim().toLowerCase();
  if (CITY_PIN_VERTICALS_CLOSED[vertical]) {
    blockers.push(`${vertical} is closed this week. ${CITY_PIN_VERTICALS_CLOSED[vertical]}`);
  }
  const template = CITY_PIN_TEMPLATES[vertical];
  if (!template) {
    blockers.push(`There is no City Pin email for "${vertical}". The verticals in play are ${Object.keys(CITY_PIN_TEMPLATES).join(', ')}.`);
  }

  const spec = CITY_PIN_SKUS[sku];
  const price = priceUsd == null ? (spec ? spec.priceUsd : undefined) : Number(priceUsd);
  const offer = checkCityPinOffer({ sku, priceUsd: price });
  if (!offer.ok) blockers.push(...offer.problems);
  warnings.push(...offer.warnings);

  if (vertical === 'tours' && !String(r.seasonal_hook || '').trim()) {
    blockers.push('A tour desk email opens on the spike. Without a hook inside 45 days there is nothing to open on.');
  }
  if (vertical === 'fashion_food' && !String(r.booking_url || '').trim()) {
    blockers.push('The fashion and food hybrid is only sold with a booking or shop URL.');
  }

  if (blockers.length) return { ok: false, blockers, warnings };

  const fills = {
    '{First name}': String(r.owner_first_name || '').trim(),
    '{City}': String(r.city || '').trim(),
    '{Trading name}': String(r.business_name || '').trim(),
    '{Vertical}': (CITY_PIN_VERTICALS[vertical] || {}).label || vertical,
    '{Seasonal hook}': String(r.seasonal_hook || '').trim(),
    '{Neighbourhood}': String(neighbourhood || r.neighbourhood || '').trim(),
    '{Street or barrio}': String(street || r.street || neighbourhood || r.neighbourhood || '').trim(),
    '{Agent name}': String(agentName || '').trim()
  };

  let body = template.body;
  let subject = template.subject;

  // No name, no salutation. Inventing a greeting is worse than opening on the
  // city, which is what the register wants anyway.
  if (!fills['{First name}']) {
    body = body.replace(/^\{First name\},\n\n/, '');
    warnings.push('No owner first name was found, so it opens on the city rather than inventing a greeting.');
  }

  for (const [token, value] of Object.entries(fills)) {
    if (!value) continue;
    body = body.split(token).join(value);
    subject = subject.split(token).join(value);
  }

  // The templates quote 490 and 790. If the agent priced it differently, the
  // figures in the body have to move with it, or the email contradicts the
  // invoice that follows it.
  if (spec && price !== spec.priceUsd) {
    body = body.split(`USD ${spec.priceUsd}`).join(`USD ${price}`);
    warnings.push(`The body figure was moved from USD ${spec.priceUsd} to USD ${price} to match the offer.`);
  }

  const findings = checkOutreachRules(body, 'city_pin');
  const stillOpen = (body.match(/\{[A-Za-z][A-Za-z ]{1,30}\}/g) || []);
  if (stillOpen.length) {
    return {
      ok: false,
      warnings,
      blockers: [`These are still unfilled and would go out as written: ${[...new Set(stillOpen)].join(', ')}.`]
    };
  }

  return {
    ok: true,
    warnings,
    findings,
    draft: {
      subject,
      body,
      to: String(r.public_email || '').trim(),
      city: String(r.city || '').trim(),
      vertical,
      sku,
      priceUsd: price,
      emailPublishedAt: provenance.published,
      words: body.split(/\s+/).filter(Boolean).length
    }
  };
}

/* ---------- prospects, messages and the suppression list ---------- */

// Honoured absolutely and across every venture and identity, which is why it is
// keyed on the address alone and never on the venture. Someone who asked the
// house to stop hearing from it did not mean one brand of it.
export async function isSuppressed(db, email) {
  const row = await db.prepare('SELECT email FROM suppression WHERE email = ?')
    .bind(String(email || '').trim().toLowerCase()).first();
  return Boolean(row);
}

export async function suppress(db, email, reason) {
  await db.prepare(
    'INSERT OR REPLACE INTO suppression (email, reason, created_at) VALUES (?, ?, ?)'
  ).bind(String(email || '').trim().toLowerCase(), String(reason || '').slice(0, 500), nowIso()).run();
}

// Cross venture duplicate protection. The same organisation must not be
// approached twice in a month from two different ventures, which from the
// recipient's side would read as one company that does not talk to itself.
export const DUPLICATE_WINDOW_DAYS = 30;

export async function recentlyApproached(db, organisation, withinDays = DUPLICATE_WINDOW_DAYS) {
  const since = new Date(Date.now() - withinDays * 86400000).toISOString();
  const { results } = await db.prepare(
    `SELECT m.id, m.venture, m.status, m.created_at, p.organisation
       FROM outreach_messages m JOIN prospects p ON p.id = m.prospect_id
      WHERE lower(p.organisation) = ? AND m.created_at >= ? AND m.status IN ('sent','approved','scheduled')
      ORDER BY m.created_at DESC`
  ).bind(String(organisation || '').trim().toLowerCase(), since).all();
  return results || [];
}

// Distinct from recentlyApproached on purpose. That one guards the approval and
// so only counts what actually went or is about to. This guards the drafting,
// and so counts anything still alive: at thirty researched leads and twenty
// sends a morning, the same kitchen turning up twice in one agent's block is
// not a hypothetical, and two letters from the same house in one week reads
// worse than none.
export async function recentlyDrafted(db, organisation, withinDays = DUPLICATE_WINDOW_DAYS) {
  const since = new Date(Date.now() - withinDays * 86400000).toISOString();
  const { results } = await db.prepare(
    `SELECT m.id, m.venture, m.status, m.created_at
       FROM outreach_messages m JOIN prospects p ON p.id = m.prospect_id
      WHERE lower(p.organisation) = ? AND m.created_at >= ? AND m.status != 'rejected'
      ORDER BY m.created_at DESC`
  ).bind(String(organisation || '').trim().toLowerCase(), since).all();
  return results || [];
}

export async function listReferences(db, campaignType) {
  const { results } = await db.prepare(
    `SELECT id, campaign_type, name, body, notes, created_at FROM reference_examples
      ${campaignType ? 'WHERE campaign_type = ?' : ''} ORDER BY created_at DESC`
  ).bind(...(campaignType ? [String(campaignType)] : [])).all();
  return results || [];
}

export async function addReference(db, { campaignType, name, body, notes }) {
  await db.prepare(
    `INSERT INTO reference_examples (campaign_type, name, body, notes, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(String(campaignType), String(name), String(body), String(notes || ''), nowIso()).run();
}

// What an agent is given before it writes. The reference is handed over whole
// rather than summarised: the structure and the register are the standard, and a
// summary of a register is not a register.
export function referenceBlock(references, campaignType) {
  const t = CAMPAIGN_TYPES[campaignType];
  if (!references || !references.length) {
    return `CAMPAIGN TYPE: ${t ? t.label : campaignType}. ${t ? t.guidance : ''}\n\nThere is no reference example for this campaign type yet, so match the house register described in the rules below and keep it short.`;
  }
  const ref = references[0];
  return [
    `CAMPAIGN TYPE: ${t ? t.label : campaignType}. ${t ? t.guidance : ''}`,
    '',
    'REFERENCE STANDARD. This is the standard for this campaign type. Take from it the structure, the register, the length and the way the proposition is framed. Do not take its content: every fact in it belongs to the organisation it was written for, and reusing any of it for a different recipient would be the template habit this replaces.',
    '',
    ref.body,
    '',
    'END OF REFERENCE.'
  ].join('\n');
}

export async function listProspects(db, { venture, status, limit = 100 } = {}) {
  const where = [];
  const binds = [];
  if (venture) { where.push('venture = ?'); binds.push(String(venture)); }
  if (status) { where.push('status = ?'); binds.push(String(status)); }
  const { results } = await db.prepare(
    `SELECT * FROM prospects ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY score DESC, created_at DESC LIMIT ?`
  ).bind(...binds, Math.min(Number(limit) || 100, 300)).all();
  return (results || []).map((r) => ({
    ...r,
    research: safeJson(r.research, {}),
    evidence: safeJson(r.evidence, []),
    contacts: safeJson(r.contacts, [])
  }));
}

export async function listMessages(db, { status, venture, limit = 100 } = {}) {
  const where = [];
  const binds = [];
  if (status) { where.push('m.status = ?'); binds.push(String(status)); }
  if (venture) { where.push('m.venture = ?'); binds.push(String(venture)); }
  const { results } = await db.prepare(
    `SELECT m.*, p.organisation, p.contacts, p.research FROM outreach_messages m
       LEFT JOIN prospects p ON p.id = m.prospect_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY m.send_after ASC, m.created_at DESC LIMIT ?`
  ).bind(...binds, Math.min(Number(limit) || 100, 300)).all();
  return (results || []).map((r) => ({
    ...r,
    contacts: safeJson(r.contacts, []),
    research: safeJson(r.research, {}),
    rule_findings: safeJson(r.rule_findings, [])
  }));
}

function safeJson(raw, fallback) {
  if (raw == null) return fallback;
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch (e) { return fallback; }
}

/* ---------- seeding the reference standard and the first message ---------- */

// Idempotent, like every other seed here: it can only ever create what does not
// exist, so it is safe on every shift and every deploy.
// Anything whose hour has come and which the owner has not yet dealt with. The
// dawn shift asks for this so the morning notification can name it, and the desk
// asks for it so the same thing is at the top of the queue when he opens it.
//
// Nothing here sends. There is no email rail in this house: this is the list of
// what is prepared, past its hour, and waiting on a human. Saying "due" and
// meaning "sent" is the one confusion this whole surface exists to prevent.
export async function dueMessages(db, now = new Date()) {
  const { results } = await db.prepare(
    `SELECT m.id, m.venture, m.subject, m.status, m.send_after, p.organisation
       FROM outreach_messages m LEFT JOIN prospects p ON p.id = m.prospect_id
      WHERE m.status IN ('awaiting_approval','approved')
        AND m.send_after IS NOT NULL AND m.send_after <= ?
      ORDER BY m.send_after ASC`
  ).bind(now.toISOString()).all();
  return results || [];
}

// One place that decides what a status may become, so a route cannot invent a
// state the rest of the file does not understand.
export const MESSAGE_STATUSES = ['awaiting_approval', 'approved', 'rejected', 'sent'];

export async function setMessageStatus(db, id, status) {
  if (!MESSAGE_STATUSES.includes(status)) throw new Error(`"${status}" is not a message status`);
  const at = nowIso();
  await db.prepare(
    'UPDATE outreach_messages SET status = ?, sent_at = CASE WHEN ? = \'sent\' THEN ? ELSE sent_at END, updated_at = ? WHERE id = ?'
  ).bind(status, status, at, at, String(id)).run();
}

export async function seedOutreach(db, { sendAfter } = {}) {
  const created = { reference: false, prospect: false, message: false };

  const existingRef = await db.prepare(
    'SELECT id FROM reference_examples WHERE campaign_type = ? AND name = ?'
  ).bind('founding_partner', 'Visit Dubai').first();
  if (!existingRef) {
    await addReference(db, {
      campaignType: 'founding_partner',
      name: 'Visit Dubai',
      body: VISIT_DUBAI_EMAIL_BODY,
      notes: 'Set by the owner as the standard for founding partner outreach. Take the structure, the register, the length and the framing. Never the facts.'
    });
    created.reference = true;
  }

  const prospectId = 'visit-dubai';
  const existingProspect = await db.prepare('SELECT id FROM prospects WHERE id = ?').bind(prospectId).first();
  if (!existingProspect) {
    const p = VISIT_DUBAI_PROSPECT;
    await db.prepare(
      `INSERT INTO prospects (id, venture, campaign_type, organisation, contacts, locale, research, evidence, score, status, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      prospectId, p.venture, p.campaign_type, p.organisation,
      JSON.stringify(p.contacts), p.locale,
      JSON.stringify(p.research), JSON.stringify(p.evidence),
      // Scored at the top because every signal the brief asks for is present and
      // evidenced: visible budget, a named route to a human, live timing, and a
      // pain the venture directly answers.
      95, 'ready', 'Supplied by the owner as the first founding partner approach.',
      nowIso(), nowIso()
    ).run();
    created.prospect = true;
  }

  // The four City Pin master emails, held as reference standards for their
  // campaign type. Unlike the Visit Dubai letter these are templates rather
  // than a finished letter, so an agent fills them from research rather than
  // taking their shape, and the placeholder rule is what stops a half filled
  // one being approved.
  const CITY_PIN_REFERENCES = [
    { name: 'City Pin, food', subject: CITY_PIN_FOOD_SUBJECT, body: CITY_PIN_FOOD_EMAIL, notes: 'The first email for a restaurant. 110 to 160 words. One city, one ask, one price, one reply instruction.' },
    { name: 'City Pin, night', subject: CITY_PIN_NIGHT_SUBJECT, body: CITY_PIN_NIGHT_EMAIL, notes: 'For a club, cocktail room or live house. Not a stadium.' },
    { name: 'City Pin, rooms', subject: CITY_PIN_ROOM_SUBJECT, body: CITY_PIN_ROOM_EMAIL, notes: 'For a motel, casa, riad, pension or a host with three or more listings in one city.' },
    { name: 'City Pin, tour desk', subject: CITY_PIN_TOUR_SUBJECT, body: CITY_PIN_TOUR_EMAIL, notes: 'For an owner operated desk. Needs a spike inside 45 days to open on.' },
    { name: 'City Pin, day three', subject: 'Re: the first subject', body: CITY_PIN_FOLLOW_UP_DAY_3, notes: 'Sixty words. The exclusive is still open.' },
    { name: 'City Pin, day seven', subject: 'Re: the first subject', body: CITY_PIN_FOLLOW_UP_DAY_7, notes: 'Forty words, and the last one. After this the file is let go.' }
  ];
  created.cityPinReferences = 0;
  for (const ref of CITY_PIN_REFERENCES) {
    const exists = await db.prepare(
      'SELECT id FROM reference_examples WHERE campaign_type = ? AND name = ?'
    ).bind('city_pin', ref.name).first();
    if (exists) continue;
    await addReference(db, {
      campaignType: 'city_pin',
      name: ref.name,
      body: ref.body,
      notes: `Subject: ${ref.subject}. ${ref.notes}`
    });
    created.cityPinReferences += 1;
  }

  const messageId = 'visit-dubai-founding-01';
  const existingMessage = await db.prepare('SELECT id FROM outreach_messages WHERE id = ?').bind(messageId).first();
  if (!existingMessage) {
    const findings = checkOutreachRules(VISIT_DUBAI_EMAIL_BODY);
    await db.prepare(
      `INSERT INTO outreach_messages
        (id, prospect_id, venture, campaign_type, identity, to_addresses, cc_addresses, subject, body, original_wording, locale_note, rule_findings, status, send_after, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      messageId, prospectId, 'glotemp', 'founding_partner', '',
      VISIT_DUBAI_TO, VISIT_DUBAI_CC,
      VISIT_DUBAI_SUBJECT, VISIT_DUBAI_EMAIL_BODY,
      VISIT_DUBAI_SUBJECT_ORIGINAL,
      'Gulf English, formal. Addressed to a government tourism body, so the register stays deferential without being deferential about the price.',
      JSON.stringify(findings),
      'awaiting_approval',
      sendAfter || VISIT_DUBAI_SEND_AFTER,
      nowIso(), nowIso()
    ).run();
    created.message = true;
  }
  return created;
}
