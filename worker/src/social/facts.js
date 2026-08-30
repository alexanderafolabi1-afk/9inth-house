// The facts sheet, and the sweep that keeps it honest.
//
// This exists because a LinkedIn post was rejected for stating SetPostGo
// numbers that could no longer be trusted: the product had moved on since
// whatever the copy was drafted against. That is not an outreach problem and it
// is not one persona's problem. Any persona, on any venture, any time it states
// a number, a feature, a coverage figure or a comparison, is at risk of
// restating something it half remembers from a prior draft or from training.
//
// The rule this enforces: a persona states a number because the sheet says it,
// or it does not state a number at all.
//
// The sheet is not trusted at rest either. A stored fact is only as good as the
// last time it was checked against the live source, so every entry carries when
// that was, and the refresh below fetches the venture's own site and diffs what
// it finds against what is held.

import { nowIso } from './db.js';

// Daily, per venture, plus an immediate re-check whenever a sheet actually
// changes.
//
// Daily because these are marketing facts, not market data: a pricing tier or a
// supported profession count changes on the scale of weeks, and refetching every
// site on every shift would spend four times the requests to learn the same
// thing four times. The change trigger is what makes daily safe, since the cost
// of being a few hours behind is paid only once, at the moment the sheet moves,
// and everything pending is re-checked immediately rather than waiting for its
// own staleness clock.
export const REFRESH_INTERVAL_HOURS = 24;

// How old a pending item's last check may be before it is re-checked on the way
// to being shown. Editable from the admin; this is the default.
export const DEFAULT_STALE_HOURS = 24;

function hoursSince(iso) {
  if (!iso) return Infinity;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return Infinity;
  return (Date.now() - t) / 3600000;
}

/* ---------- reading and writing the sheet ---------- */

export async function factsFor(db, venture) {
  const { results } = await db.prepare(
    `SELECT fact_key, fact_value, source_url, verified_at, updated_at
       FROM venture_facts WHERE venture = ? ORDER BY fact_key`
  ).bind(String(venture)).all();
  return results || [];
}

// What a persona is given. Every line carries the date it was last checked, so
// the model can see for itself that a figure is a month old rather than being
// handed a bare number with the provenance stripped off.
export function factsBlock(facts) {
  if (!facts || !facts.length) {
    return [
      'FACTS SHEET: empty.',
      'There are no verified facts for this venture yet, so you may not state a single number, price, count, coverage figure or comparison. Write about what the venture does, not how much of it there is.'
    ].join('\n');
  }
  const lines = facts.map((f) => {
    const age = hoursSince(f.verified_at);
    const when = Number.isFinite(age)
      ? `last checked ${age < 24 ? 'today' : Math.floor(age / 24) + ' days ago'}`
      : 'never checked';
    return `- ${f.fact_key}: ${f.fact_value} (${when})`;
  });
  return [
    'FACTS SHEET. These are the only numbers, prices, counts, coverage figures and comparisons you may state:',
    ...lines,
    '',
    'You may not state any figure that is not on this list, and you may not restate one from memory in a different form. If the sheet does not carry what you want to say, say something that does not need a number.'
  ].join('\n');
}

// Written with the source and the moment it was verified, because a stored
// number with no provenance is exactly the thing that caused the rejection this
// module exists to prevent. A value that has not changed still updates
// verified_at: it was checked, and knowing that is the point.
export async function putFact(db, { venture, key, value, sourceUrl }) {
  const existing = await db.prepare(
    'SELECT fact_value FROM venture_facts WHERE venture = ? AND fact_key = ?'
  ).bind(String(venture), String(key)).first();

  const changed = existing && String(existing.fact_value) !== String(value);
  const isNew = !existing;

  await db.prepare(
    `INSERT INTO venture_facts (venture, fact_key, fact_value, source_url, verified_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(venture, fact_key) DO UPDATE SET
       fact_value = excluded.fact_value,
       source_url = excluded.source_url,
       verified_at = excluded.verified_at,
       updated_at = CASE WHEN venture_facts.fact_value != excluded.fact_value
                         THEN excluded.updated_at ELSE venture_facts.updated_at END`
  ).bind(String(venture), String(key), String(value), String(sourceUrl || ''), nowIso(), nowIso()).run();

  if (changed || isNew) {
    await db.prepare(
      `INSERT INTO fact_changes (venture, fact_key, old_value, new_value, source_url, noticed_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(
      String(venture), String(key),
      existing ? String(existing.fact_value) : '',
      String(value), String(sourceUrl || ''), nowIso()
    ).run();
  }
  return { changed: Boolean(changed), isNew };
}

export async function recentChanges(db, { venture, limit = 20 } = {}) {
  const { results } = await db.prepare(
    `SELECT venture, fact_key, old_value, new_value, source_url, noticed_at
       FROM fact_changes ${venture ? 'WHERE venture = ?' : ''}
      ORDER BY noticed_at DESC LIMIT ?`
  ).bind(...(venture ? [String(venture)] : []), Math.min(Number(limit) || 20, 100)).all();
  return results || [];
}

/* ---------- refreshing from the live source ---------- */

// Strips a fetched page down to something a model can read without spending the
// whole context on markup. Deliberately crude: the aim is the visible words and
// the numbers among them, not a faithful rendering.
export function readableText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

// The model is asked for facts as strict pairs, and anything that is not a pair
// is dropped rather than guessed at. A malformed answer must leave the sheet
// exactly as it was: a bad refresh that half updates the sheet is worse than one
// that does nothing, because the half that landed now carries a fresh
// verified_at and looks trustworthy.
export function parseFacts(raw) {
  let text = String(raw || '').trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  let parsed;
  try { parsed = JSON.parse(text); } catch (e) { return []; }
  if (!parsed || typeof parsed !== 'object') return [];
  const list = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.facts) ? parsed.facts : []);
  const out = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const key = String(item.key || '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
    const value = String(item.value == null ? '' : item.value).trim();
    if (!key || !value) continue;
    if (value.length > 400) continue;
    out.push({ key, value: value.slice(0, 400) });
  }
  return out.slice(0, 30);
}

// Fetches the venture's own site and updates the sheet from it.
//
// Never throws at the caller: a venture whose site is down must not stop the
// other ventures being refreshed, and must not take a shift down with it.
export async function refreshVentureFacts(env, db, venture, ask) {
  const url = venture.site_url;
  if (!url) return { venture: venture.slug, skipped: true, reason: 'no site url on the venture' };

  let text = '';
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'NinthHouseFactsSheet/1.0' } });
    if (!res.ok) return { venture: venture.slug, skipped: true, reason: `the site answered ${res.status}` };
    text = readableText(await res.text()).slice(0, 12000);
  } catch (e) {
    return { venture: venture.slug, skipped: true, reason: 'the site could not be fetched: ' + String(e && e.message ? e.message : e).slice(0, 120) };
  }
  if (text.length < 80) return { venture: venture.slug, skipped: true, reason: 'the page carried almost no readable text' };

  let raw = '';
  try {
    raw = await ask(
      [
        'You read a company web page and extract only the checkable facts it states about itself: prices and tiers, counts, coverage, supported categories, the feature list, and any comparison it makes.',
        'Return JSON only, in the form {"facts":[{"key":"pricing_entry_tier","value":"9 USD a month"}]}.',
        'Keys are lowercase with underscores. Values are short and literal.',
        'Extract only what the page actually says. If the page does not state a number, do not produce one. An empty list is a correct answer.',
        'Never infer, never round, never carry anything over from what you already believe about this company.'
      ].join('\n'),
      `Page for ${venture.name} at ${url}:\n\n${text}`,
      900
    );
  } catch (e) {
    return { venture: venture.slug, skipped: true, reason: 'the facts could not be read: ' + String(e && e.message ? e.message : e).slice(0, 120) };
  }

  const facts = parseFacts(raw);
  if (!facts.length) return { venture: venture.slug, skipped: true, reason: 'nothing checkable was found on the page' };

  const changes = [];
  for (const f of facts) {
    const { changed, isNew } = await putFact(db, { venture: venture.slug, key: f.key, value: f.value, sourceUrl: url });
    if (changed || isNew) changes.push({ key: f.key, value: f.value, isNew });
  }
  return { venture: venture.slug, checked: facts.length, changed: changes.length, changes };
}

/* ---------- the sweep ---------- */

// Asks whether a piece of pending copy still agrees with the sheet.
//
// It reports rather than rewrites. A sweep that quietly corrected the numbers
// and re-served the copy as though nothing had happened would hide exactly the
// thing the owner needs to see before he approves it.
export async function checkClaims(ask, { text, facts, ventureName }) {
  if (!text || !text.trim()) return { ok: true, discrepancies: [] };
  if (!facts || !facts.length) {
    // With no sheet there is nothing to check against. Any figure in the copy is
    // unverifiable rather than wrong, and is reported as such.
    const hasFigure = /\d/.test(text);
    return hasFigure
      ? { ok: false, discrepancies: [{ claim: 'a figure appears in this copy', problem: 'there is no verified facts sheet for this venture yet, so nothing in it can be confirmed' }] }
      : { ok: true, discrepancies: [] };
  }

  let raw = '';
  try {
    raw = await ask(
      [
        `You check one piece of marketing copy for ${ventureName} against a sheet of verified facts.`,
        'Report only claims that CONTRADICT the sheet, or figures the sheet does not carry at all. A claim that agrees with the sheet is not a finding.',
        'Do not comment on tone, style, length or wording. Only factual accuracy.',
        'Return JSON only: {"discrepancies":[{"claim":"what the copy says","problem":"what the sheet says instead"}]}.',
        'An empty list is the correct answer when the copy states nothing checkable.'
      ].join('\n'),
      `FACTS SHEET:\n${factsBlock(facts)}\n\nCOPY:\n${text}`,
      700
    );
  } catch (e) {
    // A failed check must not read as a pass. Unknown is reported as unknown.
    return { ok: false, unchecked: true, discrepancies: [{ claim: 'this copy was not checked', problem: 'the check itself failed: ' + String(e && e.message ? e.message : e).slice(0, 120) }] };
  }

  let text2 = raw.trim();
  const fence = text2.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text2 = fence[1].trim();
  let parsed;
  try { parsed = JSON.parse(text2); } catch (e) { return { ok: false, unchecked: true, discrepancies: [{ claim: 'this copy was not checked', problem: 'the check did not come back readable' }] }; }
  const list = Array.isArray(parsed && parsed.discrepancies) ? parsed.discrepancies : [];
  const discrepancies = list
    .filter((d) => d && (d.claim || d.problem))
    .map((d) => ({ claim: String(d.claim || '').slice(0, 300), problem: String(d.problem || '').slice(0, 300) }))
    .slice(0, 10);
  return { ok: discrepancies.length === 0, discrepancies };
}

// A flagged item is held out of the sending statuses and told why.
//
// Moved to draft rather than failed: failed means the send was attempted and did
// not work, and the retry button picks it up. This never reached a send and must
// not be retried into one, it needs writing again.
export async function flagForRedraft(db, post, discrepancies) {
  const note = 'Held by the accuracy sweep. '
    + discrepancies.map((d) => `The copy says "${d.claim}", but ${d.problem}.`).join(' ')
    + ' Rewrite it against the current facts sheet.';
  await db.prepare(
    `UPDATE posts SET status = 'draft', notes = ?, updated_at = ? WHERE id = ?`
  ).bind(note.slice(0, 2000), nowIso(), post.id).run();
  return note;
}

// Refreshes every active venture, then re-checks what is pending.
//
// Two triggers, as the brief sets out. Staleness: anything whose last check is
// older than the threshold is re-checked before it is shown again. Change: the
// moment a sheet moves, everything still pending for that venture is re-checked
// immediately, whatever its age, because the thing that made it wrong has just
// happened and waiting out a clock would serve the owner a figure that is known
// to be stale.
export async function runFactsSweep(env, db, { ask, ventures, staleHours = DEFAULT_STALE_HOURS, refreshFirst = true, listPosts, PENDING_STATUSES }) {
  const report = { refreshed: [], changedVentures: [], checked: 0, flagged: [], unchecked: 0, skipped: [] };

  if (refreshFirst) {
    for (const v of ventures) {
      const outcome = await refreshVentureFacts(env, db, v, ask);
      report.refreshed.push(outcome);
      if (outcome.skipped) report.skipped.push(outcome);
      if (outcome.changed) report.changedVentures.push(v.slug);
    }
  }

  for (const v of ventures) {
    const facts = await factsFor(db, v.slug);
    const pending = await listPosts(db, { statuses: PENDING_STATUSES, venture: v.slug, limit: 200 });
    const ventureChanged = report.changedVentures.includes(v.slug);

    for (const post of pending) {
      // The change trigger overrides the staleness clock entirely.
      const lastLooked = post.updated_at || post.created_at;
      if (!ventureChanged && hoursSince(lastLooked) < staleHours) continue;

      const verdict = await checkClaims(ask, { text: post.text, facts, ventureName: v.name });
      report.checked += 1;
      if (verdict.unchecked) { report.unchecked += 1; continue; }
      if (!verdict.ok) {
        const note = await flagForRedraft(db, post, verdict.discrepancies);
        report.flagged.push({ id: post.id, venture: v.slug, platform: post.platform, note });
      }
    }
  }
  return report;
}
