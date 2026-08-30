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

// The five fields the rail expects, and nothing invented. The idempotency key
// rides along as a sixth so a Make branch can dedupe on it too if it ever wants
// to; the rail ignores fields it does not read.
export function buildPayload(post) {
  return {
    venture: post.venture,
    platform: post.platform,
    text: stripDashPunctuation(String(post.text || '')),
    image_url: post.image_url || '',
    link: post.link || '',
    idempotency_key: post.id
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
  const endpoint = env.MAKE_WEBHOOK_URL;
  if (!endpoint) {
    return { ok: false, reason: 'MAKE_WEBHOOK_URL is not set on the Worker, so there is nowhere to publish to' };
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
