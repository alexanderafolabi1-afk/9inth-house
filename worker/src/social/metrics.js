// Metrics capture, and the numbers the admin puts on screen.
//
// An honest note about where readings come from. The Make rail publishes; it does
// not report back. So this engine does not pretend to know an impression count it
// was never given. There are exactly two ways a number gets in here:
//
//   1. Pushed in, by an authenticated POST to /social/metrics. A Make scenario on
//      a schedule, or the owner, hands over readings per post.
//   2. Pulled in, if METRICS_WEBHOOK_URL is set. The daily cron posts the list of
//      published items and reads back whatever that endpoint knows.
//
// If neither is configured, the metrics table stays empty, the admin says so
// plainly, and generation carries on unbiased. Nothing is ever invented.

import { postsNeedingMetrics, recordMetrics, metricsWindow, listVentures, ventureStats, postedDays } from './db.js';

export async function captureMetrics(env, db, { now = new Date(), windowDays = 30 } = {}) {
  const hook = env.METRICS_WEBHOOK_URL;
  if (!hook) return { captured: 0, reason: 'METRICS_WEBHOOK_URL is not set, so readings only arrive when they are pushed in' };

  const since = new Date(now.getTime() - windowDays * 864e5).toISOString();
  const posts = await postsNeedingMetrics(db, since, 50);
  if (!posts.length) return { captured: 0, reason: 'nothing has been published inside the window' };

  let res;
  try {
    res = await fetch(hook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        posts: posts.map((p) => ({
          post_id: p.id,
          external_id: p.external_id || null,
          venture: p.venture,
          platform: p.platform,
          posted_at: p.posted_at
        }))
      }),
      signal: AbortSignal.timeout(20000)
    });
  } catch (e) {
    return { captured: 0, reason: 'the metrics endpoint could not be reached: ' + String(e && e.message ? e.message : e).slice(0, 160) };
  }

  if (!res.ok) return { captured: 0, reason: `the metrics endpoint answered ${res.status}` };

  let body;
  try { body = await res.json(); } catch (e) { return { captured: 0, reason: 'the metrics endpoint did not answer with JSON' }; }

  const rows = Array.isArray(body) ? body : (Array.isArray(body.metrics) ? body.metrics : []);
  const known = new Set(posts.map((p) => p.id));
  let captured = 0;

  for (const row of rows) {
    const id = row && (row.post_id || row.id);
    // Only readings for posts we actually asked about, so a malformed or hostile
    // response cannot write rows against arbitrary ids.
    if (!id || !known.has(id)) continue;
    if (row.impressions === undefined && row.engagements === undefined && row.clicks === undefined) continue;
    await recordMetrics(db, id, row);
    captured += 1;
  }

  return { captured, considered: posts.length };
}

// Accepts readings pushed in from outside. Returns how many were written and why
// any were refused, so a misconfigured scenario is visible rather than silent.
export async function ingestMetrics(db, rows) {
  const list = Array.isArray(rows) ? rows : [];
  let written = 0;
  const refused = [];
  for (const row of list) {
    const id = row && (row.post_id || row.id);
    if (!id) { refused.push('a row arrived with no post id'); continue; }
    const exists = await db.prepare('SELECT id FROM posts WHERE id = ?').bind(id).first();
    if (!exists) { refused.push(`no post with id ${String(id).slice(0, 40)}`); continue; }
    if (row.impressions === undefined && row.engagements === undefined && row.clicks === undefined) {
      refused.push(`row for ${String(id).slice(0, 40)} carried no numbers`);
      continue;
    }
    await recordMetrics(db, id, row);
    written += 1;
  }
  return { written, refused };
}

function startOfIsoWeek(now) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d;
}

// Consecutive days with something actually published, counted backwards. A day
// with nothing yet does not break the streak until it is over, so opening the
// admin in the morning does not show the streak already lost.
export function streakFrom(days, now) {
  const set = new Set(days);
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (!set.has(day.toISOString().slice(0, 10))) day.setUTCDate(day.getUTCDate() - 1);
  let streak = 0;
  while (set.has(day.toISOString().slice(0, 10))) {
    streak += 1;
    day.setUTCDate(day.getUTCDate() - 1);
  }
  return streak;
}

// Per venture: the streak, what has gone out this week against the weekly target,
// and which category is actually earning its place.
export async function ventureSummary(db, { now = new Date() } = {}) {
  const ventures = await listVentures(db, {});
  const weekStart = startOfIsoWeek(now).toISOString();
  const monthStart = new Date(now.getTime() - 30 * 864e5).toISOString();

  const weekRows = await ventureStats(db, weekStart);
  const days = await postedDays(db, new Date(now.getTime() - 120 * 864e5).toISOString());
  const perf = await metricsWindow(db, monthStart);

  return ventures.map((v) => {
    const target = Object.values(v.cadence || {}).reduce((n, x) => n + (Number(x) || 0), 0);

    let posted = 0;
    let waiting = 0;
    for (const r of weekRows) {
      if (r.venture !== v.slug) continue;
      if (r.status === 'posted') posted += Number(r.n) || 0;
      if (r.status === 'queued' || r.status === 'approved' || r.status === 'scheduled') waiting += Number(r.n) || 0;
    }

    // Engagement first. Where nothing has reported yet, fall back to volume and
    // say so, rather than presenting a guess as a measurement.
    const byCategory = new Map();
    for (const r of perf) {
      if (r.venture !== v.slug || r.status !== 'posted') continue;
      const reported = r.engagements !== null || r.clicks !== null;
      const prev = byCategory.get(r.category) || { score: 0, n: 0, reported: 0 };
      prev.n += 1;
      if (reported) {
        prev.score += (Number(r.engagements) || 0) + (Number(r.clicks) || 0);
        prev.reported += 1;
      }
      byCategory.set(r.category, prev);
    }

    let best = null;
    let basis = null;
    const reportedEntries = [...byCategory.entries()].filter(([, s]) => s.reported > 0);
    if (reportedEntries.length) {
      basis = 'engagement';
      best = reportedEntries.sort((a, b) => (b[1].score / b[1].reported) - (a[1].score / a[1].reported))[0][0];
    } else if (byCategory.size) {
      basis = 'volume';
      best = [...byCategory.entries()].sort((a, b) => b[1].n - a[1].n)[0][0];
    }

    return {
      slug: v.slug,
      name: v.name,
      active: v.active,
      weeklyTarget: target,
      postedThisWeek: posted,
      waiting,
      streak: streakFrom(days.filter((d) => d.venture === v.slug).map((d) => d.day), now),
      bestCategory: best,
      bestCategoryBasis: basis
    };
  });
}
