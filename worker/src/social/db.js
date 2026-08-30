// Storage for the distribution engine, on Cloudflare D1.
//
// The binding is optional on purpose. This Worker also runs the autopilot and the
// blog job, and it auto deploys from main, so a binding pointing at a database
// that does not exist yet would fail every deploy and take the rest of the engine
// down with it. Instead every social entry point checks hasStore(env) first and
// says plainly that storage is not configured. Nothing throws, nothing else breaks.
//
// SCHEMA_SQL below is the canonical schema. worker/migrations/0001_social_engine.sql
// carries the same statements for anyone applying it with the wrangler CLI, and
// scripts/check-social.mjs fails if the two ever drift apart.

import { platformKeys, socialCategories } from './config.js';
import { SEED_VENTURES } from './seed.js';

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS ventures (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  site_url TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  positioning TEXT NOT NULL DEFAULT '',
  audience TEXT NOT NULL DEFAULT '',
  tone TEXT NOT NULL DEFAULT '',
  banned_language TEXT NOT NULL DEFAULT '',
  platforms TEXT NOT NULL DEFAULT '[]',
  cadence TEXT NOT NULL DEFAULT '{}',
  category_mix TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  venture TEXT NOT NULL,
  platform TEXT NOT NULL,
  category TEXT NOT NULL,
  text TEXT NOT NULL,
  image_url TEXT,
  link TEXT,
  source_article TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  scheduled_for TEXT,
  posted_at TEXT,
  external_id TEXT,
  error TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_posts_status ON posts (status);
CREATE INDEX IF NOT EXISTS idx_posts_venture ON posts (venture);
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts (created_at);
CREATE INDEX IF NOT EXISTS idx_posts_scheduled ON posts (status, scheduled_for);

CREATE TABLE IF NOT EXISTS metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id TEXT NOT NULL,
  impressions INTEGER,
  engagements INTEGER,
  clicks INTEGER,
  captured_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_metrics_post ON metrics (post_id);
CREATE INDEX IF NOT EXISTS idx_metrics_captured ON metrics (captured_at);

CREATE TABLE IF NOT EXISTS reference_examples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_type TEXT NOT NULL,
  name TEXT NOT NULL,
  -- Held verbatim. The register and the structure are the standard, and a
  -- summary of a register is not a register.
  body TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reference_type ON reference_examples (campaign_type);

CREATE TABLE IF NOT EXISTS prospects (
  id TEXT PRIMARY KEY,
  venture TEXT NOT NULL,
  campaign_type TEXT NOT NULL DEFAULT 'need_led',
  organisation TEXT NOT NULL,
  -- The named human and the route to them. A prospect with no named human is
  -- not reachable and scores accordingly.
  contacts TEXT NOT NULL DEFAULT '[]',
  locale TEXT NOT NULL DEFAULT '',
  -- The three things Section 4 requires before anything is written: what they
  -- do, what is missing, why now. Nothing is written until all three are here.
  research TEXT NOT NULL DEFAULT '{}',
  -- Why the score is what it is, kept beside it. A score with no reasoning
  -- cannot be argued with, and the owner's rejections need something to correct.
  evidence TEXT NOT NULL DEFAULT '[]',
  score INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'researching',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_prospects_venture ON prospects (venture, status);
CREATE INDEX IF NOT EXISTS idx_prospects_org ON prospects (organisation);

CREATE TABLE IF NOT EXISTS outreach_messages (
  id TEXT PRIMARY KEY,
  prospect_id TEXT NOT NULL,
  venture TEXT NOT NULL,
  campaign_type TEXT NOT NULL,
  identity TEXT NOT NULL DEFAULT '',
  to_addresses TEXT NOT NULL DEFAULT '',
  cc_addresses TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  -- The owner's own wording for whatever was corrected, kept beside the
  -- version that obeys the house rules, so an automatic correction is visible
  -- rather than silent. Currently a subject line whose em dash was resolved.
  original_wording TEXT NOT NULL DEFAULT '',
  locale_note TEXT NOT NULL DEFAULT '',
  rule_findings TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'awaiting_approval',
  send_after TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_status ON outreach_messages (status, send_after);

CREATE TABLE IF NOT EXISTS suppression (
  email TEXT PRIMARY KEY,
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS venture_facts (
  venture TEXT NOT NULL,
  fact_key TEXT NOT NULL,
  fact_value TEXT NOT NULL,
  -- Where the value came from, so a number in a deliverable can be traced back
  -- to the page that stated it rather than to whoever last remembered it.
  source_url TEXT NOT NULL DEFAULT '',
  -- When this entry was last checked against that source. Updated on every
  -- check, whether or not the value moved, because "checked today and
  -- unchanged" and "not checked since June" are different things.
  verified_at TEXT NOT NULL,
  -- When the value itself last moved, which is what the change trigger reads.
  updated_at TEXT NOT NULL,
  PRIMARY KEY (venture, fact_key)
);

CREATE INDEX IF NOT EXISTS idx_facts_verified ON venture_facts (verified_at);

CREATE TABLE IF NOT EXISTS fact_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venture TEXT NOT NULL,
  fact_key TEXT NOT NULL,
  old_value TEXT NOT NULL DEFAULT '',
  new_value TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT '',
  noticed_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fact_changes_noticed ON fact_changes (noticed_at);

CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- What was rejected. Deliberately not constrained to posts: the same table
  -- carries a rejected docket item, a rejected prospect, a rejected scoring
  -- change or a rejected facts sheet correction, because the owner's reason is
  -- worth the same in every case and a second parallel store would guarantee
  -- one of them gets forgotten.
  item_kind TEXT NOT NULL,
  item_id TEXT NOT NULL,
  -- Who wrote the thing. This is the whole point: a reason filed against an
  -- item teaches nobody, a reason filed against the persona that wrote it is
  -- read back before that persona writes for the same venture again.
  persona TEXT,
  venture TEXT,
  category TEXT,
  verdict TEXT NOT NULL DEFAULT 'rejected',
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_feedback_persona ON feedback (persona, venture);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback (created_at);

CREATE TABLE IF NOT EXISTS push_subs (
  endpoint TEXT PRIMARY KEY,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_ok TEXT,
  fail_count INTEGER NOT NULL DEFAULT 0
);
`;

export function hasStore(env) {
  return Boolean(env && env.DB && typeof env.DB.prepare === 'function');
}

export async function ensureSchema(db) {
  // D1 will not take several statements in one prepare, so they are split and run
  // in a batch. Every statement is IF NOT EXISTS, so this is safe to call on
  // every boot and safe to call twice.
  const statements = SCHEMA_SQL
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => db.prepare(s));
  await db.batch(statements);
}

export const nowIso = () => new Date().toISOString();

/* ---------- ventures ---------- */

export async function seedVentures(db) {
  let added = 0;
  for (const v of SEED_VENTURES) {
    const existing = await db.prepare('SELECT slug FROM ventures WHERE slug = ?').bind(v.slug).first();
    if (existing) continue;
    await upsertVenture(db, v);
    added += 1;
  }
  return added;
}

function parseJson(value, fallback) {
  try {
    const out = JSON.parse(value);
    return out === null || out === undefined ? fallback : out;
  } catch (e) {
    return fallback;
  }
}

function rowToVenture(row) {
  if (!row) return null;
  return {
    slug: row.slug,
    name: row.name,
    site_url: row.site_url || '',
    active: Number(row.active) === 1,
    positioning: row.positioning || '',
    audience: row.audience || '',
    tone: row.tone || '',
    banned_language: row.banned_language || '',
    platforms: parseJson(row.platforms, []),
    cadence: parseJson(row.cadence, {}),
    category_mix: parseJson(row.category_mix, {}),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export async function listVentures(db, { activeOnly = false } = {}) {
  const sql = activeOnly
    ? 'SELECT * FROM ventures WHERE active = 1 ORDER BY slug'
    : 'SELECT * FROM ventures ORDER BY slug';
  const { results } = await db.prepare(sql).all();
  return (results || []).map(rowToVenture);
}

export async function getVenture(db, slug) {
  const row = await db.prepare('SELECT * FROM ventures WHERE slug = ?').bind(slug).first();
  return rowToVenture(row);
}

// Validates against the platform config rather than a hardcoded list, so a
// platform added to config.js is immediately allowed here with no edit.
export function validateVenture(input) {
  const errors = [];
  const slug = String(input.slug || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(slug)) errors.push('slug must be lower case letters, numbers and hyphens');
  if (!String(input.name || '').trim()) errors.push('name is required');

  const allowedPlatforms = platformKeys();
  const platforms = Array.isArray(input.platforms) ? input.platforms : [];
  for (const p of platforms) {
    if (!allowedPlatforms.includes(p)) errors.push(`unknown platform "${p}"`);
  }

  const cadence = input.cadence && typeof input.cadence === 'object' ? input.cadence : {};
  for (const [p, n] of Object.entries(cadence)) {
    if (!allowedPlatforms.includes(p)) errors.push(`cadence names unknown platform "${p}"`);
    if (!Number.isFinite(Number(n)) || Number(n) < 0 || Number(n) > 70) errors.push(`cadence for "${p}" must be between 0 and 70 posts a week`);
  }

  const allowedCategories = socialCategories();
  const mix = input.category_mix && typeof input.category_mix === 'object' ? input.category_mix : {};
  for (const [c, w] of Object.entries(mix)) {
    if (!allowedCategories.includes(c)) errors.push(`unknown category "${c}"`);
    if (!Number.isFinite(Number(w)) || Number(w) < 0) errors.push(`weight for "${c}" must be zero or more`);
  }

  // A venture with a cadence on a platform it does not list would generate posts
  // nobody asked for, which is the padding the brief rules out.
  for (const p of Object.keys(cadence)) {
    if (Number(cadence[p]) > 0 && !platforms.includes(p)) errors.push(`cadence set for "${p}" but the venture does not list that platform`);
  }

  return { errors, slug };
}

export async function upsertVenture(db, input) {
  const { errors, slug } = validateVenture(input);
  if (errors.length) throw new Error('Venture rejected: ' + errors.join('; '));
  const ts = nowIso();
  await db.prepare(`
    INSERT INTO ventures (slug, name, site_url, active, positioning, audience, tone, banned_language, platforms, cadence, category_mix, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(slug) DO UPDATE SET
      name = excluded.name,
      site_url = excluded.site_url,
      active = excluded.active,
      positioning = excluded.positioning,
      audience = excluded.audience,
      tone = excluded.tone,
      banned_language = excluded.banned_language,
      platforms = excluded.platforms,
      cadence = excluded.cadence,
      category_mix = excluded.category_mix,
      updated_at = excluded.updated_at
  `).bind(
    slug,
    String(input.name || '').trim(),
    String(input.site_url || '').trim(),
    input.active === false || input.active === 0 ? 0 : 1,
    String(input.positioning || ''),
    String(input.audience || ''),
    String(input.tone || ''),
    String(input.banned_language || ''),
    JSON.stringify(Array.isArray(input.platforms) ? input.platforms : []),
    JSON.stringify(input.cadence && typeof input.cadence === 'object' ? input.cadence : {}),
    JSON.stringify(input.category_mix && typeof input.category_mix === 'object' ? input.category_mix : {}),
    ts,
    ts
  ).run();
  return await getVenture(db, slug);
}

/* ---------- posts ---------- */

export async function insertPost(db, post) {
  const ts = nowIso();
  const id = post.id || crypto.randomUUID();
  await db.prepare(`
    INSERT INTO posts (id, venture, platform, category, text, image_url, link, source_article, status, scheduled_for, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    post.venture,
    post.platform,
    post.category,
    post.text,
    post.image_url || null,
    post.link || null,
    post.source_article || null,
    post.status || 'queued',
    post.scheduled_for || null,
    post.notes || null,
    ts,
    ts
  ).run();
  return id;
}

export async function getPost(db, id) {
  return await db.prepare('SELECT * FROM posts WHERE id = ?').bind(id).first();
}

export async function listPosts(db, { status, statuses, venture, since, limit = 200 } = {}) {
  const where = [];
  const binds = [];
  if (status) { where.push('status = ?'); binds.push(status); }
  if (Array.isArray(statuses) && statuses.length) {
    where.push(`status IN (${statuses.map(() => '?').join(',')})`);
    binds.push(...statuses);
  }
  if (venture) { where.push('venture = ?'); binds.push(venture); }
  if (since) { where.push('created_at >= ?'); binds.push(since); }
  const sql = `SELECT * FROM posts ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC, id LIMIT ?`;
  binds.push(Math.min(Number(limit) || 200, 500));
  const { results } = await db.prepare(sql).bind(...binds).all();
  return results || [];
}

// The whole of the idempotency guarantee sits in this one statement.
//
// A double tap, a retried request or two tabs at once all race to the same row.
// The UPDATE is conditional on the row still being in a sendable state, so
// exactly one caller can move it to "posting" and only that caller gets
// changes === 1. Everyone else is told the row is already claimed and fires
// nothing. A row that is already "posted" can never be claimed again.
export async function claimForSend(db, id, sendableStatuses) {
  const placeholders = sendableStatuses.map(() => '?').join(',');
  const res = await db.prepare(
    `UPDATE posts SET status = 'posting', error = NULL, updated_at = ? WHERE id = ? AND status IN (${placeholders})`
  ).bind(nowIso(), id, ...sendableStatuses).run();
  const changes = res && res.meta ? res.meta.changes : 0;
  return changes === 1;
}

// Puts a claimed row back if the send never happened, so a claim can never
// strand a post in "posting" with no way for the owner to retry it.
export async function releaseClaim(db, id, status, error) {
  await db.prepare('UPDATE posts SET status = ?, error = ?, updated_at = ? WHERE id = ? AND status = \'posting\'')
    .bind(status, error ? String(error).slice(0, 500) : null, nowIso(), id).run();
}

// Records a failure on a row that was never claimed, which is what happens when a
// post is rejected before any rail call is made. A posted row is never touched.
export async function markFailed(db, id, error) {
  await db.prepare('UPDATE posts SET status = \'failed\', error = ?, updated_at = ? WHERE id = ? AND status != \'posted\'')
    .bind(error ? String(error).slice(0, 500) : null, nowIso(), id).run();
}

export async function markPosted(db, id, externalId) {
  const ts = nowIso();
  await db.prepare('UPDATE posts SET status = \'posted\', posted_at = ?, external_id = ?, error = NULL, updated_at = ? WHERE id = ?')
    .bind(ts, externalId || null, ts, id).run();
}

export async function setStatus(db, id, status) {
  const res = await db.prepare('UPDATE posts SET status = ?, updated_at = ? WHERE id = ? AND status != \'posted\'')
    .bind(status, nowIso(), id).run();
  return (res && res.meta ? res.meta.changes : 0) === 1;
}

export async function updatePostText(db, id, text) {
  const res = await db.prepare('UPDATE posts SET text = ?, updated_at = ? WHERE id = ? AND status != \'posted\'')
    .bind(text, nowIso(), id).run();
  return (res && res.meta ? res.meta.changes : 0) === 1;
}

export async function schedulePost(db, id, whenIso) {
  const res = await db.prepare('UPDATE posts SET status = \'scheduled\', scheduled_for = ?, updated_at = ? WHERE id = ? AND status != \'posted\'')
    .bind(whenIso, nowIso(), id).run();
  return (res && res.meta ? res.meta.changes : 0) === 1;
}

export async function dueScheduled(db, nowIsoStr, limit = 25) {
  const { results } = await db.prepare(
    'SELECT * FROM posts WHERE status = \'scheduled\' AND scheduled_for IS NOT NULL AND scheduled_for <= ? ORDER BY scheduled_for LIMIT ?'
  ).bind(nowIsoStr, limit).all();
  return results || [];
}

export async function postsNeedingMetrics(db, sinceIso, limit = 50) {
  const { results } = await db.prepare(
    'SELECT * FROM posts WHERE status = \'posted\' AND posted_at >= ? ORDER BY posted_at DESC LIMIT ?'
  ).bind(sinceIso, limit).all();
  return results || [];
}

/* ---------- metrics ---------- */

// One row per capture, never an update, so a trend stays visible instead of being
// flattened into whatever the last reading happened to be.
export async function recordMetrics(db, postId, { impressions, engagements, clicks }) {
  const num = (v) => (v === null || v === undefined || v === '' ? null : Math.max(0, Math.round(Number(v) || 0)));
  await db.prepare('INSERT INTO metrics (post_id, impressions, engagements, clicks, captured_at) VALUES (?, ?, ?, ?, ?)')
    .bind(postId, num(impressions), num(engagements), num(clicks), nowIso()).run();
}

// The latest capture per post inside the window, joined to the post so category
// and venture come with it. This is what generation reads to bias its choices.
export async function metricsWindow(db, sinceIso) {
  const { results } = await db.prepare(`
    SELECT p.id, p.venture, p.category, p.platform, p.status,
           m.impressions, m.engagements, m.clicks, m.captured_at
    FROM posts p
    LEFT JOIN metrics m ON m.id = (
      SELECT id FROM metrics WHERE post_id = p.id ORDER BY captured_at DESC, id DESC LIMIT 1
    )
    WHERE p.created_at >= ?
  `).bind(sinceIso).all();
  return results || [];
}

/* ---------- counting, for cadence and for the admin ---------- */

export async function countSince(db, { venture, platform, sinceIso, statuses }) {
  const placeholders = statuses.map(() => '?').join(',');
  const row = await db.prepare(
    `SELECT COUNT(*) AS n FROM posts WHERE venture = ? AND platform = ? AND created_at >= ? AND status IN (${placeholders})`
  ).bind(venture, platform, sinceIso, ...statuses).first();
  return row ? Number(row.n) || 0 : 0;
}

export async function ventureStats(db, sinceIso) {
  const { results } = await db.prepare(`
    SELECT venture, status, category, COUNT(*) AS n
    FROM posts WHERE created_at >= ?
    GROUP BY venture, status, category
  `).bind(sinceIso).all();
  return results || [];
}

// Posting streak in whole days, counted backwards from today, where a day counts
// if anything at all was actually posted on it.
export async function postedDays(db, sinceIso) {
  const { results } = await db.prepare(
    'SELECT venture, substr(posted_at, 1, 10) AS day FROM posts WHERE status = \'posted\' AND posted_at >= ? GROUP BY venture, day'
  ).bind(sinceIso).all();
  return results || [];
}

/* ---------- push subscriptions ---------- */

export async function savePushSub(db, { endpoint, p256dh, auth }) {
  await db.prepare(`
    INSERT INTO push_subs (endpoint, p256dh, auth, created_at, fail_count)
    VALUES (?, ?, ?, ?, 0)
    ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, fail_count = 0
  `).bind(endpoint, p256dh, auth, nowIso()).run();
}

export async function listPushSubs(db) {
  const { results } = await db.prepare('SELECT * FROM push_subs WHERE fail_count < 5').all();
  return results || [];
}

export async function deletePushSub(db, endpoint) {
  await db.prepare('DELETE FROM push_subs WHERE endpoint = ?').bind(endpoint).run();
}

export async function notePushResult(db, endpoint, ok) {
  if (ok) {
    await db.prepare('UPDATE push_subs SET last_ok = ?, fail_count = 0 WHERE endpoint = ?').bind(nowIso(), endpoint).run();
  } else {
    await db.prepare('UPDATE push_subs SET fail_count = fail_count + 1 WHERE endpoint = ?').bind(endpoint).run();
  }
}


/* ---------- rejection reasons ---------- */

// Stored whether or not the owner typed anything. A reject with no reason is
// still a verdict worth counting, and recording it the same way keeps the
// weighting honest: a reason carries more than a bare no, but a bare no is not
// nothing.
export async function recordFeedback(db, { itemKind, itemId, persona, venture, category, verdict, reason }) {
  await db.prepare(
    `INSERT INTO feedback (item_kind, item_id, persona, venture, category, verdict, reason, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    String(itemKind || 'unknown'),
    String(itemId || ''),
    persona ? String(persona) : null,
    venture ? String(venture) : null,
    category ? String(category) : null,
    String(verdict || 'rejected'),
    String(reason || '').slice(0, 2000),
    nowIso()
  ).run();
}

// What a persona is shown before it writes again. Narrowed to the venture it is
// about to work on, because a reason given about one venture is often wrong
// advice about another, and ordered newest first so a recent correction
// outweighs an old one.
export async function feedbackFor(db, { persona, venture, limit = 12 }) {
  const where = ['reason != \'\''];
  const binds = [];
  if (persona) { where.push('persona = ?'); binds.push(String(persona)); }
  if (venture) { where.push('venture = ?'); binds.push(String(venture)); }
  const res = await db.prepare(
    `SELECT item_kind, venture, category, verdict, reason, created_at
       FROM feedback WHERE ${where.join(' AND ')}
      ORDER BY created_at DESC LIMIT ?`
  ).bind(...binds, Math.min(Number(limit) || 12, 50)).all();
  return (res && res.results) || [];
}

// Reasons that have been given more than once for the same venture and content
// type. Section 7 treats a repeated stated reason as enough to act on without
// waiting for the sample size a silent no reply would need, so this is what
// that rule reads.
export async function repeatedReasons(db, { venture, minCount = 2 }) {
  const res = await db.prepare(
    `SELECT persona, venture, category, reason, COUNT(*) AS times, MAX(created_at) AS last_at
       FROM feedback
      WHERE reason != '' ${venture ? 'AND venture = ?' : ''}
      GROUP BY persona, venture, category, lower(trim(reason))
     HAVING times >= ?
      ORDER BY times DESC, last_at DESC LIMIT 20`
  ).bind(...(venture ? [String(venture)] : []), Number(minCount) || 2).all();
  return (res && res.results) || [];
}
