// The Make.com rail, which is now one delivery among others rather than the only
// way anything leaves the house.
//
// Lifted out of distribute.js unchanged in behaviour: same payload, same
// idempotency header, same reading of whatever the rail hands back. It knows no
// platform names, because the rail routes on the platform field itself.
//
// The endpoint is never written down in this repo. It comes from the
// MAKE_WEBHOOK_URL secret at runtime.

import { stripDashPunctuation } from '../text.js';
import { PLATFORMS } from '../config.js';
import { getMakeWebhookUrl, describeMakeWebhookUrl } from '../../makehook.js';

// The five fields the rail expects, and nothing invented. The idempotency key
// rides along as a sixth so a Make branch can dedupe on it too if it ever wants
// to; the rail ignores fields it does not read.
//
// Four more ride along for the same reason. media_type is the value Instagram's
// own media container takes, REELS or CAROUSEL or STORIES, read straight off the
// platform's config entry, so a Make branch maps a field instead of holding its
// own table of which platform key means which kind of upload. city and language
// are there for a branch that wants to route by them, or simply to make an
// execution log legible when something goes wrong at three in the morning.
// A carousel is several pictures, and the queue has always held one image_url.
//
// Rather than a second column and a second box on the desk, the one box takes
// several addresses, one per line or separated by commas, and they come out
// here as a list in the order they were typed, which is the order the slides
// will be in. A single address still produces a list of one, so nothing that
// only ever had one image behaves differently.
export function imageUrls(post) {
  return String(post.image_url || '')
    .split(/[\s,]+/)
    .map((u) => u.trim())
    .filter((u) => /^https?:\/\//i.test(u));
}

export function buildPayload(post) {
  const spec = PLATFORMS[post.platform] || {};
  const urls = imageUrls(post);
  return {
    venture: post.venture,
    platform: post.platform,
    text: stripDashPunctuation(String(post.text || '')),
    // Kept exactly as it was for every branch already reading it: the first
    // address, or the empty string. Nothing on the rail has to change to keep
    // working.
    image_url: urls[0] || post.image_url || '',
    // The whole list, for the one branch that needs more than one.
    image_urls: urls,
    link: post.link || '',
    idempotency_key: post.id,
    media_type: spec.mediaKind || '',
    surface: spec.surface || '',
    city: post.city || '',
    language: post.language || 'en'
  };
}

// Pulls whatever the rail hands back that looks like a platform post id, without
// insisting on any particular shape. The live rail currently answers
// {"success":true} and carries no id, in which case external_id stays null.
export function readExternalId(body) {
  if (!body || typeof body !== 'object') return null;
  const candidates = ['external_id', 'post_id', 'postId', 'id', 'urn', 'activity_id', 'permalink', 'url'];
  for (const key of candidates) {
    const v = body[key];
    if (typeof v === 'string' && v.trim() && v.trim().toLowerCase() !== 'true') return v.trim().slice(0, 300);
    if (typeof v === 'number') return String(v);
  }
  // One level down, since Make branches often answer { data: { id } }.
  for (const key of ['data', 'result', 'response']) {
    if (body[key] && typeof body[key] === 'object') {
      const nested = readExternalId(body[key]);
      if (nested) return nested;
    }
  }
  return null;
}

export async function send(env, post) {
  // Read through the same accessor the desk writes to, so an address set from
  // Settings works immediately and an address already on the Worker keeps
  // working untouched. This used to read env.MAKE_WEBHOOK_URL alone, which
  // meant the rail could only ever be pointed somewhere from the Cloudflare
  // dashboard.
  const endpoint = await getMakeWebhookUrl(env);
  if (!endpoint) {
    return { ok: false, reason: 'No distribution rail address is set, so there is nowhere to publish to. Set it in the desk Settings, under the distribution rail.' };
  }
  const check = describeMakeWebhookUrl(endpoint);
  if (!check.ok) {
    return { ok: false, reason: 'The distribution rail address cannot be used: ' + check.problems.join(' ') };
  }

  let res;
  let bodyText = '';
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Belt and braces alongside the claim: if the rail or anything in front of
        // it honours this header, a retried request collapses into one post there
        // too rather than relying on our claim alone.
        'Idempotency-Key': post.id
      },
      body: JSON.stringify(buildPayload(post)),
      signal: AbortSignal.timeout(20000)
    });
    bodyText = await res.text();
  } catch (e) {
    return { ok: false, reason: 'the distribution rail could not be reached: ' + String(e && e.message ? e.message : e).slice(0, 200) };
  }

  if (!res.ok) {
    return { ok: false, status: res.status, reason: `the rail answered ${res.status}: ${bodyText.slice(0, 200) || 'no detail given'}` };
  }

  let parsed = null;
  try { parsed = JSON.parse(bodyText); } catch (e) { parsed = null; }
  return { ok: true, status: res.status, externalId: readExternalId(parsed) };
}
