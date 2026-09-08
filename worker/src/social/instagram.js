// Glotemp on Instagram: the city's own language first, and every surface the
// platform gives away.
//
// Two decisions sit behind this file.
//
// The first is language. The register has known what each city speaks since the
// day it was imported, in city_register.language, normalised to a code. Up to
// now that knowledge only ever reached outreach email. A post about Lisbon
// written in English is a post about Lisbon addressed to somebody who does not
// live there, and Instagram's distribution is local before it is anything else.
// So the city's language leads and English follows as a second post rather than
// replacing it. The English one is not a translation: it is the same reading,
// said the way a visiting audience would say it.
//
// The second is that Instagram is not one surface. That part is settled in
// config.js, where the Reel, the carousel, the still and the Story are four
// platform keys with four specs. This file does not repeat those specs; it
// decides which city, which surface and which language each slot is owed, and
// hands the platform's own spec through untouched.
//
// Nothing here posts anything. It decides what should exist.

import { PLATFORMS, platformFamily } from './config.js';
import { normaliseLanguage } from './register.js';

/* ---------- the surfaces ---------- */

// Order matters and is not alphabetical. Reels lead because they are the only
// Instagram surface still shown to people who do not already follow, and a
// register trying to grow needs that more than it needs a fourth post to the
// people it already has. Stories close because they are gone in a day.
export const IG_SURFACE_ORDER = ['instagram_reel', 'instagram_carousel', 'instagram', 'instagram_story'];

// The platforms this file plans for: the declared order above, intersected with
// what config.js actually holds, so deleting a surface from config cannot leave
// a dangling key here and adding one cannot be silently forgotten either.
export function igPlatforms() {
  const family = platformFamily('instagram');
  const known = IG_SURFACE_ORDER.filter((k) => family.includes(k));
  const extra = family.filter((k) => !known.includes(k));
  return [...known, ...extra];
}

export function isIgPlatform(key) {
  return Boolean(PLATFORMS[key] && PLATFORMS[key].parent === 'instagram');
}

/* ---------- language ---------- */

// The house writes in these. Anything else in the register falls back to English
// and says so. Kept deliberately short: a language on this list is a promise
// that what goes out has been read by somebody who reads it, and a longer list
// bought by dropping that promise would be worth less than this one.
export const IG_LANGUAGES = {
  en: { label: 'English', endonym: 'English' },
  es: { label: 'Spanish', endonym: 'Espanol' },
  el: { label: 'Greek', endonym: 'Ellinika' },
  hr: { label: 'Croatian', endonym: 'Hrvatski' },
  nl: { label: 'Dutch', endonym: 'Nederlands' },
  is: { label: 'Icelandic', endonym: 'Islenska' },
  fr: { label: 'French', endonym: 'Francais' },
  ja: { label: 'Japanese', endonym: 'Nihongo' }
};

export function isSupportedLanguage(code) {
  return Object.prototype.hasOwnProperty.call(IG_LANGUAGES, String(code || '').toLowerCase());
}

// What a city actually gets written in, and the honest answer when the register
// names a language the house cannot check. An unsupported language does not
// quietly become English: it becomes English with the gap recorded on the row,
// so the hole is visible on the desk instead of invisible everywhere.
export function languageFor(cityRow) {
  const raw = (cityRow && cityRow.language) || 'en';
  const code = normaliseLanguage(raw);
  if (isSupportedLanguage(code)) {
    return { code, label: IG_LANGUAGES[code].label, supported: true };
  }
  const where = (cityRow && cityRow.city) ? cityRow.city : 'this city';
  return {
    code: 'en',
    label: 'English',
    supported: false,
    requested: code,
    note: `The register has ${where} down as ${raw}, which the house does not write in yet. Written in English, and the gap is recorded rather than hidden.`
  };
}

/* ---------- what a city is owed ---------- */

// The city's own language leads and English follows. English is a second post,
// never a replacement: dropping the local one because an English one exists is
// exactly the habit that makes a register feel like it is broadcasting at a
// city rather than from it.
//
// A city that already speaks English gets one post per surface rather than the
// same post twice, which is the only case where the pair collapses.
export function postsForCity(cityRow, platforms = igPlatforms()) {
  const language = languageFor(cityRow);
  const city = String((cityRow && cityRow.city) || '').trim();
  const country = String((cityRow && cityRow.country) || '').trim();
  const pulse_url = String((cityRow && cityRow.pulse_url) || '').trim();
  const out = [];
  for (const platform of platforms) {
    if (!isIgPlatform(platform)) continue;
    out.push({
      city,
      country,
      pulse_url,
      platform,
      surface: PLATFORMS[platform].surface,
      language: language.code,
      lead: true,
      languageNote: language.note || null
    });
    if (language.code !== 'en') {
      out.push({
        city,
        country,
        pulse_url,
        platform,
        surface: PLATFORMS[platform].surface,
        language: 'en',
        lead: false,
        languageNote: null
      });
    }
  }
  return out;
}

// One slot's worth of instruction, handed to the writer whole rather than
// summarised. Same reason the outreach reference is held verbatim: the spec is
// the standard, and a paraphrase of a spec is a different spec.
export function briefFor({ city, country, platform, language, lead }) {
  const spec = PLATFORMS[platform];
  if (!spec || spec.parent !== 'instagram') return null;
  const lang = IG_LANGUAGES[language] || IG_LANGUAGES.en;
  const place = country ? `${city}, ${country}` : city;
  const lines = [
    `SURFACE: ${spec.label}. ${spec.guidance}`,
    `REACHES: ${spec.reach}.`,
    city ? `CITY: ${place}. Write about this city and no other.` : '',
    language === 'en'
      ? 'LANGUAGE: English.'
      : `LANGUAGE: ${lang.label}. Write the whole thing in ${lang.label}, the way somebody who lives in ${city} would write it. This is not a translation of an English post: it is the post, written first in the language of the place. Do not append an English version underneath, and do not explain in English what it says.`,
    lead
      ? 'This is the lead post for this city and this surface.'
      : 'This is the English companion to the local post. It carries the same reading for a visiting audience, in its own words. It is never a translation of the local one, and it never refers to it.',
    spec.slides ? `SLIDES: between ${spec.slides.min} and ${spec.slides.max}.` : '',
    spec.ephemeral ? 'This is gone in twenty four hours. Write it to be answered, not archived.' : ''
  ];
  return lines.filter(Boolean).join('\n');
}

/* ---------- the pool ---------- */

// Where the rota gets its cities from.
//
// The register holds one row per organisation per vertical, so a city with a
// hotel row, a restaurant row and a board row appears three times. That shape is
// right for outreach, where each row is a separate letter, and wrong here, where
// three rows about Athens are one city to post about. Collapsed to one entry per
// city, keeping the first row's language and country and the first pulse link
// any of them carries, so a post can point at the city's own page.
//
// The order the register returns, wave then city, is kept: a wave is a
// deliberate ordering by the owner and reordering it here would quietly
// overrule him.
export function cityPool(registerRows) {
  const seen = new Map();
  for (const row of registerRows || []) {
    if (!row || !row.city) continue;
    const key = String(row.city).trim().toLowerCase();
    if (!key) continue;
    if (!seen.has(key)) {
      seen.set(key, {
        city: String(row.city).trim(),
        country: String(row.country || '').trim(),
        language: row.language || 'en',
        pulse_url: String(row.pulse_url || '').trim(),
        wave: Number(row.wave) || 0
      });
      continue;
    }
    // A later row can still supply the link the first one lacked.
    const held = seen.get(key);
    if (!held.pulse_url && row.pulse_url) held.pulse_url = String(row.pulse_url).trim();
    if (!held.country && row.country) held.country = String(row.country).trim();
  }
  return [...seen.values()];
}

// Where the rota had got to. One key, read and written by the generator, so the
// queue continues across a deploy instead of restarting at the first city.
export const IG_CURSOR_KEY = 'instagram_rota_cursor';

/* ---------- the rota ---------- */

function gcd(a, b) {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) { const t = x % y; x = y; y = t; }
  return x;
}

// The day's surfaces, in the order they will actually be written.
//
// Taken one at a time from each surface that still owes something, rather than
// all of one surface and then all of the next, so a day that owes two Reels and
// two Stories alternates them instead of front loading the feed with a pair.
export function interleave(slotsByPlatform, order = igPlatforms()) {
  const left = new Map();
  for (const platform of order) {
    const n = Math.max(0, Math.trunc(Number(slotsByPlatform[platform]) || 0));
    if (n > 0) left.set(platform, n);
  }
  const out = [];
  while (left.size) {
    for (const platform of [...left.keys()]) {
      out.push(platform);
      const n = left.get(platform) - 1;
      if (n > 0) left.set(platform, n); else left.delete(platform);
    }
  }
  return out;
}

// How far the city pointer moves between one day and the next.
//
// The obvious answer is "by however many slots the day used", and it is wrong in
// a way that only shows up weeks later. If the day is always the same length,
// every city lands on the same surface it landed on last time, for ever: with
// four surfaces, three slots each, and a wave of twelve cities, one city is the
// Reel and never anything else, and nobody notices because each individual day
// looks perfectly varied.
//
// So the pointer is nudged forward by the smallest extra step that makes the
// daily advance coprime with the number of cities, which is exactly the
// condition for every city to eventually reach every surface. Searched for
// rather than hard coded, because the right nudge depends on how many cities
// are in the register that morning, and that changes.
export function dailyAdvance(dayLength, cityCount) {
  if (dayLength <= 0 || cityCount <= 0) return dayLength;
  let step = dayLength;
  // Terminates inside cityCount tries: one value in any run of that many
  // consecutive integers is congruent to 1 modulo cityCount, and 1 is coprime
  // with everything.
  while (gcd(step, cityCount) !== 1) step += 1;
  return step;
}

// One day of Instagram, planned whole.
//
// Aggressive and consistent was the instruction, so this is a rota rather than a
// burst: every city takes its turn in order, the surface changes every slot, and
// across a full cycle every city has been every surface.
//
// The cursor is carried in and out rather than derived from the date. A missed
// morning, a redeploy or a second run before lunch therefore continues the queue
// instead of resetting it and handing the same three cities another turn.
// slotsByPlatform counts posts, not cities. A city that does not speak English
// produces a pair, the local post and its English companion, and both are real
// posts that both take a place in the week's cadence. Pairs are never split to
// hit a number exactly: a surface owed three posts will take a fourth rather
// than send a Greek post with no companion, and the following day's spread
// notices the overshoot and gives that surface less.
export function dayPlan(cityRows, slotsByPlatform, { cursor = 0, order = igPlatforms() } = {}) {
  const cities = (cityRows || []).filter((c) => c && c.city);
  const start = Number.isFinite(cursor) ? Math.max(0, Math.trunc(cursor)) : 0;
  const sequence = interleave(slotsByPlatform, order.filter(isIgPlatform));
  if (!cities.length || !sequence.length) return { planned: [], cursor: start };

  const planned = [];
  const filled = {};
  let used = 0;
  for (const platform of sequence) {
    const owed = Math.max(0, Math.trunc(Number(slotsByPlatform[platform]) || 0));
    if ((filled[platform] || 0) >= owed) continue;
    const city = cities[(start + used) % cities.length];
    used += 1;
    const pair = postsForCity(city, [platform]);
    for (const post of pair) planned.push(post);
    filled[platform] = (filled[platform] || 0) + pair.length;
  }

  return { planned, cursor: start + dailyAdvance(used, cities.length) };
}
