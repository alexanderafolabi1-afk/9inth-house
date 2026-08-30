// Generation, on the dawn cron.
//
// Works out what each active venture owes today from its own cadence, writes the
// copy, and queues it. It publishes nothing: everything lands as status "queued"
// and waits for the owner. That separation is the point of the whole pipeline.
//
// The prompt is assembled from the venture row, so a SetPostGo post and a Lyrion
// Atelier post are written from different positioning, audience, tone and banned
// language. There is no generic house voice here to fall back on.

import { PLATFORMS, CATEGORIES, imageRequired } from './config.js';
import { sanitiseSocialText, extractDirectives, trimHashtags } from './text.js';
import { listVentures, insertPost, countSince, metricsWindow, listPosts } from './db.js';
import { factsFor, factsBlock } from './facts.js';

// Statuses that mean the slot is already accounted for this week. A skipped or
// failed row does not count as delivered, so the cadence is not quietly reduced
// by the owner declining something.
const COUNTS_AS_FILLED = ['queued', 'approved', 'scheduled', 'posting', 'posted'];

function startOfIsoWeek(now) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  // getUTCDay puts Sunday at 0; the ISO week starts on Monday.
  const shift = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - shift);
  return d;
}

function daysLeftInIsoWeek(now) {
  const shift = (now.getUTCDay() + 6) % 7; // 0 on Monday, 6 on Sunday
  return 7 - shift;
}

// How many posts this venture and platform owe today.
//
// Spread rather than dumped: what is still outstanding is divided across the days
// left in the week, so a target of three does not all arrive on Monday, and a
// venture with nothing left to say this week is given nothing to pad with.
export function slotsDueToday({ target, alreadyThisWeek, daysLeft }) {
  const outstanding = Math.max(0, Math.round(target) - alreadyThisWeek);
  if (outstanding <= 0) return 0;
  const perDayCeiling = Math.max(1, Math.ceil(target / 7));
  return Math.min(outstanding, perDayCeiling, Math.ceil(outstanding / Math.max(1, daysLeft)));
}

// Turns the last thirty days into a multiplier per venture and category.
//
// What performed gets weighted up. What the owner skipped gets weighted down,
// because a skip is the clearest signal in the system: it is the one case where a
// human looked at the thing and declined to put their name on it.
export async function buildBias(db, now) {
  const since = new Date(now.getTime() - 30 * 864e5).toISOString();
  const rows = await metricsWindow(db, since);

  const engaged = new Map();  // venture|category -> { total, n }
  const skipped = new Map();  // venture|category -> count

  for (const r of rows) {
    const key = `${r.venture}|${r.category}`;
    if (r.status === 'skipped') {
      skipped.set(key, (skipped.get(key) || 0) + 1);
      continue;
    }
    if (r.status !== 'posted') continue;
    // Absent metrics are absent, not zero. A post with no reading yet simply does
    // not vote, rather than voting against its own category.
    if (r.engagements === null && r.clicks === null && r.impressions === null) continue;
    const score = (Number(r.engagements) || 0) + (Number(r.clicks) || 0);
    const prev = engaged.get(key) || { total: 0, n: 0 };
    engaged.set(key, { total: prev.total + score, n: prev.n + 1 });
  }

  // Average score across everything that did report, used as the baseline a
  // category is measured against.
  let grandTotal = 0;
  let grandN = 0;
  for (const { total, n } of engaged.values()) { grandTotal += total; grandN += n; }
  const baseline = grandN > 0 ? grandTotal / grandN : 0;

  return function biasFor(venture, category) {
    const key = `${venture}|${category}`;
    let bias = 1;
    const e = engaged.get(key);
    if (e && e.n > 0 && baseline > 0) {
      const avg = e.total / e.n;
      // Held between a half and double, so one lucky post cannot take over the
      // whole mix and one quiet week cannot retire a category outright.
      bias = Math.min(2, Math.max(0.5, avg / baseline));
    }
    const s = skipped.get(key) || 0;
    if (s > 0) bias = bias / (1 + s * 0.5);
    return bias;
  };
}

// Weighted pick with a deterministic tie break, avoiding whatever this venture
// and platform produced last so no venture drifts into a single category.
export function pickCategory({ mix, biasFor, venture, avoid, articlesAvailable, platform, random = Math.random }) {
  const entries = Object.entries(mix)
    .filter(([category, weight]) => {
      if (!CATEGORIES[category] || !CATEGORIES[category].social) return false;
      if (Number(weight) <= 0) return false;
      // Nothing that needs an article when there is no article left to cut from.
      if (CATEGORIES[category].requiresArticle && !articlesAvailable) return false;
      return true;
    })
    .map(([category, weight]) => [category, Number(weight) * biasFor(venture, category)]);

  if (!entries.length) return null;

  // Prefer something other than last time, but never refuse to post over it.
  const fresh = entries.filter(([c]) => c !== avoid);
  const pool = fresh.length ? fresh : entries;

  const total = pool.reduce((n, [, w]) => n + w, 0);
  if (total <= 0) return pool[0][0];
  let roll = random() * total;
  for (const [category, weight] of pool) {
    roll -= weight;
    if (roll <= 0) return category;
  }
  return pool[pool.length - 1][0];
}

function buildSystemPrompt(venture, platform, category, factsText) {
  const p = PLATFORMS[platform];
  const c = CATEGORIES[category];
  return [
    `You write social copy for ${venture.name}, one venture inside the Ninth House portfolio. You are writing as the venture, not as an agency describing it.`,
    '',
    // The sheet comes before the positioning deliberately. A persona that reads
    // the pitch first and the permitted numbers second tends to write the pitch
    // it remembers and reach for a figure to match; this way the figures it is
    // allowed are the first thing it has.
    factsText || '',
    factsText ? '' : '',
    `POSITIONING: ${venture.positioning}`,
    `AUDIENCE: ${venture.audience}`,
    `TONE: ${venture.tone}`,
    venture.banned_language ? `NEVER USE THESE WORDS OR PHRASES: ${venture.banned_language}` : '',
    '',
    `PLATFORM: ${p.label}. ${p.guidance}`,
    `LENGTH: aim for about ${p.target} characters. The hard ceiling is ${p.limit} and copy over it is rejected, so stay under it.`,
    `HASHTAGS: at most ${p.hashtags.max}, ${p.hashtags.style}. Fewer is better than the maximum.`,
    '',
    `THIS POST IS: ${c.label}. ${c.guidance}`,
    imageRequired(platform, category)
      ? 'An image is required. Give one line beginning "IMAGE:" describing the image to be made, then the caption. Do not invent a URL.'
      : '',
    '',
    'HARD RULES:',
    'Never use em dashes, en dashes, or a hyphen surrounded by spaces as punctuation. Use commas, colons and full stops.',
    'Never invent a client, a testimonial, a case study, a statistic or a result. If you have not been given a number, do not use one.',
    'Every number, price, count, coverage figure and comparison must come from the facts sheet above, word for word in substance. Not from memory, not from an earlier draft, not from what you believe about this company.',
    'Never promise a timescale or a price that is not in the brief.',
    'Do not open with a question, and do not close by asking for comments.',
    'Return the post copy only. No preamble, no explanation, no markdown, no surrounding quotation marks.'
  ].filter(Boolean).join('\n');
}

function buildUserPrompt({ venture, category, article, today }) {
  const lines = [`Today is ${today}. Write one ${CATEGORIES[category].label.toLowerCase()} post for ${venture.name}.`];
  if (CATEGORIES[category].requiresArticle && article) {
    lines.push('', 'It derives from this published article. Take one argument out of it rather than summarising the whole thing, and let the link carry the rest.');
    lines.push(`ARTICLE TITLE: ${article.title}`);
    if (article.meta) lines.push(`ARTICLE SUMMARY: ${article.meta}`);
    lines.push(`ARTICLE URL: ${article.url}`);
  } else {
    lines.push('', 'There is no article behind this one. Write it from the positioning above, and make it useful on its own.');
  }
  if (venture.site_url) lines.push('', `The venture site is ${venture.site_url}.`);
  return lines.join('\n');
}

// Cuts overlong copy back to the last full sentence that fits, rather than
// shipping a post that ends mid word or letting the platform reject it at send.
export function trimToLimit(text, limit) {
  const s = String(text || '');
  if (s.length <= limit) return { text: s, trimmed: false };
  const cut = s.slice(0, limit);
  const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('.\n'), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  const at = lastStop > limit * 0.5 ? lastStop + 1 : cut.lastIndexOf(' ');
  return { text: cut.slice(0, at > 0 ? at : limit).trim(), trimmed: true };
}

// Which articles are available to cut from, newest first, excluding anything this
// venture has already derived a post from.
async function availableArticles(db, venture, articles) {
  const mine = (articles || []).filter((a) => !a.venture || a.venture === venture.slug);
  if (!mine.length) return [];
  const recent = await listPosts(db, { venture: venture.slug, limit: 200 });
  const used = new Set(recent.map((r) => r.source_article).filter(Boolean));
  return mine.filter((a) => !used.has(a.url));
}

/* ---------- the job ---------- */

export async function runGeneration(env, db, { ask, articles = [], now = new Date(), maxPosts = 12 } = {}) {
  const ventures = await listVentures(db, { activeOnly: true });
  const biasFor = await buildBias(db, now);
  const weekStart = startOfIsoWeek(now).toISOString();
  const daysLeft = daysLeftInIsoWeek(now);
  const today = now.toISOString().slice(0, 10);

  const created = [];
  const notes = [];

  for (const venture of ventures) {
    // Loaded once per venture rather than once per post: the sheet cannot move
    // in the middle of a run, and reading it per slot would be the same query
    // several times over for the same answer.
    const ventureFacts = factsBlock(await factsFor(db, venture.slug));
    const openArticles = await availableArticles(db, venture, articles);
    let articleCursor = 0;
    let lastCategory = null;

    for (const platform of venture.platforms) {
      if (!PLATFORMS[platform]) {
        notes.push(`${venture.slug} lists platform "${platform}", which is not configured, so it was skipped`);
        continue;
      }
      const target = Number(venture.cadence[platform] || 0);
      if (target <= 0) continue;

      const alreadyThisWeek = await countSince(db, {
        venture: venture.slug, platform, sinceIso: weekStart, statuses: COUNTS_AS_FILLED
      });
      const slots = slotsDueToday({ target, alreadyThisWeek, daysLeft });

      for (let i = 0; i < slots; i++) {
        if (created.length >= maxPosts) {
          notes.push(`stopped at the ceiling of ${maxPosts} posts for one run, the rest will be picked up tomorrow`);
          break;
        }

        const category = pickCategory({
          mix: venture.category_mix,
          biasFor,
          venture: venture.slug,
          avoid: lastCategory,
          articlesAvailable: articleCursor < openArticles.length,
          platform
        });
        if (!category) {
          notes.push(`${venture.slug} has no usable category mix, so nothing was generated for ${platform}`);
          break;
        }

        const article = CATEGORIES[category].requiresArticle ? openArticles[articleCursor] : null;
        if (article) articleCursor += 1;

        let raw;
        try {
          raw = await ask(
            buildSystemPrompt(venture, platform, category, ventureFacts),
            buildUserPrompt({ venture, category, article, today }),
            700
          );
        } catch (e) {
          notes.push(`${venture.slug} on ${platform}: generation failed, ${String(e && e.message ? e.message : e).slice(0, 160)}`);
          continue;
        }

        const cleaned = sanitiseSocialText(raw);
        const { text: withoutDirectives, directives } = extractDirectives(cleaned);
        const capped = trimHashtags(withoutDirectives, PLATFORMS[platform].hashtags.max);
        const { text, trimmed } = trimToLimit(capped, PLATFORMS[platform].limit);

        if (!text) {
          notes.push(`${venture.slug} on ${platform}: the model returned nothing usable`);
          continue;
        }

        const noteParts = [];
        if (directives.image) noteParts.push('IMAGE: ' + directives.image);
        if (directives.shot) noteParts.push('SHOT: ' + directives.shot);
        if (directives.alt) noteParts.push('ALT: ' + directives.alt);
        if (trimmed) noteParts.push('Trimmed to fit the platform limit, read it before approving.');
        if (imageRequired(platform, category)) noteParts.push('This one cannot be sent until an image URL is added.');

        const id = await insertPost(db, {
          venture: venture.slug,
          platform,
          category,
          text,
          link: article ? article.url : (venture.site_url || null),
          source_article: article ? article.url : null,
          notes: noteParts.length ? noteParts.join('\n') : null,
          status: 'queued'
        });

        created.push({ id, venture: venture.slug, platform, category });
        lastCategory = category;
      }
    }
  }

  return { created, notes, ventures: new Set(created.map((c) => c.venture)).size };
}
