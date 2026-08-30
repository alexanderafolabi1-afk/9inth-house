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

export { VISIT_DUBAI_GUARDRAILS };


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
    id: 'no_unfilled_placeholder',
    test: (t) => /\[[A-Za-z][A-Za-z ]{1,30}\]/.test(t),
    finding: 'The signature block still has placeholders in it. Fill in the name, title, phone and address before this goes.'
  },
  {
    id: 'no_hype',
    test: (t) => /\b(game changer|revolutionary|unlock|unleash|supercharge|cutting edge|world class|best in class|synergy)\b/i.test(t),
    finding: 'It reaches for hype instead of saying something specific.'
  }
];

// Checked before the owner is asked to approve anything, so a message that
// breaks a standing rule never reaches him looking finished.
export function checkOutreachRules(text) {
  const body = String(text || '');
  return OUTREACH_RULES.filter((r) => r.test(body)).map((r) => ({ id: r.id, finding: r.finding }));
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
