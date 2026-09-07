// The Backpack's ledger, the Board's numbers, and the targets both read
// against: what closed, who gets credit for it, and how full the bag is
// against what the owner set.
//
// Attribution is read, not asked. A deal can be pointed at the specific
// sent message that produced it (source_message_id); that message already
// carries a sending identity (see api.js's compose routes, which now
// default identity to the venture's assigned outreach owner rather than
// leaving it blank), and the identity resolves to a partner id through the
// same roster desk.html shows. Only when nothing on record names a partner
// does the owner set one by hand, and only when neither happens is a deal
// left, honestly, unattributed.

import { nowIso } from './db.js';
import { partnerIdForName } from './partners.js';
import { toGbp, DEAL_TIERS } from './seeds/deal-tiers.js';
import { streakFrom } from './metrics.js';

function monthBounds(month) {
  // 'YYYY-MM', defaulting to the current month. Bounds are plain string
  // comparison against closed_date ('YYYY-MM-DD'), which sorts correctly
  // without ever parsing a date.
  const m = /^\d{4}-\d{2}$/.test(month || '') ? month : nowIso().slice(0, 7);
  return { month: m, start: `${m}-01`, end: `${m}-32` };
}

export async function recordDeal(db, input) {
  const venture = String(input.venture || '').trim().toLowerCase();
  if (!venture) throw new Error('A deal needs a venture.');
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('A deal needs a positive amount.');
  const currency = String(input.currency || 'GBP').trim().toUpperCase();
  const closedDate = /^\d{4}-\d{2}-\d{2}$/.test(input.closedDate || '') ? input.closedDate : nowIso().slice(0, 10);

  let partnerId = '';
  let attribution = 'unattributed';
  const sourceMessageId = String(input.sourceMessageId || '').trim();
  const manualPartnerId = String(input.partnerId || '').trim();

  if (manualPartnerId) {
    // A manual choice is still the owner overriding, per section 2, and it
    // always wins: it is what he is telling the house when the chain either
    // does not apply (a deal from somewhere else entirely) or is wrong.
    partnerId = manualPartnerId;
    attribution = 'manual';
  } else if (sourceMessageId) {
    const msg = await db.prepare('SELECT identity FROM outreach_messages WHERE id = ?').bind(sourceMessageId).first();
    const resolved = msg ? partnerIdForName(msg.identity) : '';
    if (resolved) { partnerId = resolved; attribution = 'auto'; }
  }

  const ts = nowIso();
  const id = 'deal-' + crypto.randomUUID();
  await db.prepare(`
    INSERT INTO deals (id, venture, city, organisation, tier_label, amount, currency, amount_gbp, partner_id, attribution, source_message_id, closed_date, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, venture, String(input.city || '').trim(), String(input.organisation || '').trim(),
    String(input.tierLabel || '').trim(), amount, currency, toGbp(amount, currency),
    partnerId, attribution, sourceMessageId, closedDate, String(input.notes || '').trim(), ts, ts
  ).run();

  return await db.prepare('SELECT * FROM deals WHERE id = ?').bind(id).first();
}

export async function deleteDeal(db, id) {
  await db.prepare('DELETE FROM deals WHERE id = ?').bind(id).run();
}

export async function listDeals(db, { venture, month, limit = 500 } = {}) {
  const where = [];
  const binds = [];
  if (venture) { where.push('venture = ?'); binds.push(String(venture)); }
  if (month) {
    const { start, end } = monthBounds(month);
    where.push('closed_date >= ? AND closed_date < ?');
    binds.push(start, end);
  }
  const { results } = await db.prepare(
    `SELECT * FROM deals ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY closed_date DESC, created_at DESC LIMIT ?`
  ).bind(...binds, Math.min(Number(limit) || 500, 1000)).all();
  return results || [];
}

// Candidate messages for the "which message closed this" picker: recent
// sent mail for the venture, newest first, with whatever identity was on
// it at send time. Organisation comes from the joined prospect where one
// exists (City Pin, SetPostGo); a register-wave row has no prospects row
// to join, so its own city and vertical fill the label instead.
export async function attributionCandidates(db, { venture, limit = 20 } = {}) {
  const where = ["m.status = 'sent'"];
  const binds = [];
  if (venture) { where.push('m.venture = ?'); binds.push(String(venture)); }
  const { results } = await db.prepare(
    `SELECT m.id, m.venture, m.city, m.vertical, m.identity, m.sent_at, p.organisation
       FROM outreach_messages m LEFT JOIN prospects p ON p.id = m.prospect_id
      WHERE ${where.join(' AND ')}
      ORDER BY m.sent_at DESC LIMIT ?`
  ).bind(...binds, Math.min(Number(limit) || 20, 100)).all();
  return (results || []).map((r) => ({
    id: r.id,
    venture: r.venture,
    label: r.organisation || [r.city, r.vertical].filter(Boolean).join(' · ') || r.id,
    identity: r.identity || '',
    sentAt: r.sent_at
  }));
}

/* ---------- the Backpack: this month's total against the target ---------- */

export async function monthSummary(db, { month } = {}) {
  const bounds = monthBounds(month);
  const deals = await listDeals(db, { month });
  const totalGbp = deals.reduce((s, d) => s + Number(d.amount_gbp || 0), 0);
  const byVenture = {};
  const byPartner = {};
  for (const d of deals) {
    byVenture[d.venture] = (byVenture[d.venture] || 0) + Number(d.amount_gbp || 0);
    const key = d.partner_id || 'unattributed';
    byPartner[key] = (byPartner[key] || 0) + Number(d.amount_gbp || 0);
  }
  // Pace needs to be computed somewhere every viewer agrees on, rather than
  // separately in however many browsers have the desk open, so it is done
  // here rather than left to the client's own clock.
  const [y, mo] = bounds.month.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const today = new Date();
  const isCurrentMonth = bounds.month === today.toISOString().slice(0, 7);
  const daysElapsed = isCurrentMonth ? today.getUTCDate() : daysInMonth;
  const daysRemaining = Math.max(0, daysInMonth - daysElapsed);

  return {
    month: bounds.month, totalGbp: Math.round(totalGbp * 100) / 100, byVenture, byPartner, deals,
    daysInMonth, daysElapsed, daysRemaining
  };
}

/* ---------- targets ---------- */

const FIRM_KEY = 'firm';
const DEFAULT_FIRM_TARGET_GBP = 50000;

export async function seedDefaultTargets(db) {
  const existing = await db.prepare('SELECT scope_key FROM targets WHERE scope_key = ?').bind(FIRM_KEY).first();
  if (existing) return;
  await setTarget(db, { scopeType: 'firm', ref: '', amountGbp: DEFAULT_FIRM_TARGET_GBP });
}

function scopeKeyFor(scopeType, ref) {
  if (scopeType === 'firm') return FIRM_KEY;
  if (scopeType === 'venture') return `venture:${String(ref || '').trim().toLowerCase()}`;
  if (scopeType === 'partner') return `partner:${String(ref || '').trim().toLowerCase()}`;
  throw new Error(`"${scopeType}" is not a target scope. It is one of: firm, venture, partner.`);
}

export async function setTarget(db, { scopeType, ref, amountGbp }) {
  const amount = Number(amountGbp);
  if (!Number.isFinite(amount) || amount < 0) throw new Error('A target needs a whole, non negative amount.');
  const key = scopeKeyFor(scopeType, ref);
  if (scopeType !== 'firm' && !String(ref || '').trim()) throw new Error(`A ${scopeType} target needs a ${scopeType} to set it against.`);
  await db.prepare(`
    INSERT INTO targets (scope_key, scope_type, ref, amount_gbp, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(scope_key) DO UPDATE SET amount_gbp = excluded.amount_gbp, updated_at = excluded.updated_at
  `).bind(key, scopeType, String(ref || '').trim().toLowerCase(), amount, nowIso()).run();
  return await getTargets(db);
}

export async function getTargets(db) {
  const { results } = await db.prepare('SELECT * FROM targets').bind().all();
  const rows = results || [];
  const firmRow = rows.find((r) => r.scope_type === 'firm');
  const ventures = {};
  const partners = {};
  for (const r of rows) {
    if (r.scope_type === 'venture') ventures[r.ref] = r.amount_gbp;
    if (r.scope_type === 'partner') partners[r.ref] = r.amount_gbp;
  }
  return {
    firmGbp: firmRow ? firmRow.amount_gbp : DEFAULT_FIRM_TARGET_GBP,
    ventures,
    partners
  };
}

/* ---------- the Board: effort and outcome, per partner ---------- */

// A partner appears on the Board the moment either side of the ledger
// names them: a message sent under their identity, or a deal credited to
// them. Nineteen rows of mostly zero for partners who have never touched
// outreach would bury the ones actually working it, so nobody with neither
// is listed at all.
export async function boardStats(db, { month } = {}) {
  const { start, end } = monthBounds(month);

  const { results: sentRows } = await db.prepare(
    `SELECT identity, substr(sent_at, 1, 10) AS day, replied_at
       FROM outreach_messages
      WHERE status = 'sent' AND identity != '' AND sent_at >= ? AND sent_at < ?`
  ).bind(start, end).all();

  const { results: dealRows } = await db.prepare(
    `SELECT partner_id, amount_gbp, closed_date FROM deals
      WHERE partner_id != '' AND closed_date >= ? AND closed_date < ?`
  ).bind(start, end).all();

  // Streak reads every day this partner has ever sent or closed, not only
  // this month, the same way ventureSummary's streak looks back 120 days
  // rather than stopping at the calendar month boundary; a streak that
  // resets every 1st would not be a streak.
  const { results: allSentDays } = await db.prepare(
    `SELECT identity, substr(sent_at, 1, 10) AS day FROM outreach_messages
      WHERE status = 'sent' AND identity != '' AND sent_at >= ?`
  ).bind(new Date(Date.now() - 120 * 86400000).toISOString()).all();
  const { results: allDealDays } = await db.prepare(
    `SELECT partner_id, closed_date AS day FROM deals
      WHERE partner_id != '' AND closed_date >= ?`
  ).bind(new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10)).all();

  const byName = new Map(); // identity string -> stats, folded into partner ids at the end
  for (const r of sentRows || []) {
    const s = byName.get(r.identity) || { sent: 0, replies: 0 };
    s.sent += 1;
    if (r.replied_at) s.replies += 1;
    byName.set(r.identity, s);
  }

  const byPartnerId = new Map();
  for (const [identity, s] of byName) {
    const id = partnerIdForName(identity);
    if (!id) continue;
    byPartnerId.set(id, { ...s, dealsClosed: 0, dealsValueGbp: 0 });
  }
  for (const d of dealRows || []) {
    const cur = byPartnerId.get(d.partner_id) || { sent: 0, replies: 0, dealsClosed: 0, dealsValueGbp: 0 };
    cur.dealsClosed += 1;
    cur.dealsValueGbp += Number(d.amount_gbp || 0);
    byPartnerId.set(d.partner_id, cur);
  }

  const daysById = new Map();
  for (const r of allSentDays || []) {
    const id = partnerIdForName(r.identity);
    if (!id) continue;
    if (!daysById.has(id)) daysById.set(id, new Set());
    daysById.get(id).add(r.day);
  }
  for (const r of allDealDays || []) {
    if (!daysById.has(r.partner_id)) daysById.set(r.partner_id, new Set());
    daysById.get(r.partner_id).add(r.day);
  }

  const now = new Date();
  const rows = [...byPartnerId.entries()].map(([id, s]) => ({
    id,
    sent: s.sent,
    replies: s.replies,
    replyRate: s.sent ? Math.round((s.replies / s.sent) * 1000) / 10 : 0,
    dealsClosed: s.dealsClosed,
    dealsValueGbp: Math.round(s.dealsValueGbp * 100) / 100,
    streak: streakFrom([...(daysById.get(id) || [])], now)
  }));

  rows.sort((a, b) => b.dealsValueGbp - a.dealsValueGbp || b.sent - a.sent);
  return rows;
}
