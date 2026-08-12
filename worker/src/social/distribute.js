// The only thing in the house that publishes.
//
// Everything goes through one Make.com webhook. The Worker never talks to
// LinkedIn, X or Instagram itself, holds no platform credentials, and contains no
// conditional on a platform name. The rail routes on the platform field, so an
// extra branch inside Make is the entire cost of adding a platform.
//
// The endpoint is never written down in this repo. It comes from the
// MAKE_WEBHOOK_URL secret at runtime.

import { PLATFORMS, SENDABLE, imageRequired } from './config.js';
import { claimForSend, releaseClaim, markPosted, markFailed } from './db.js';
import { stripDashPunctuation } from './text.js';

// Checks the row can actually be delivered before a claim is taken, so a post
// that was always going to be rejected does not burn a rail call and does not
// sit in an in flight state while it fails.
export function validateForSend(post) {
  const problems = [];
  const platform = PLATFORMS[post.platform];

  if (!platform) {
    problems.push(`platform "${post.platform}" is not configured in worker/src/social/config.js`);
    return problems;
  }

  const text = String(post.text || '').trim();
  if (!text) problems.push('the post has no text');
  if (text.length > platform.limit) {
    problems.push(`${text.length} characters is over the ${platform.label} limit of ${platform.limit}, edit it shorter before sending`);
  }
  if (imageRequired(post.platform, post.category) && !String(post.image_url || '').trim()) {
    problems.push(`${platform.label} needs an image for this kind of post, add an image URL before sending`);
  }
  return problems;
}

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

// Publishes exactly once.
//
// The row is claimed with a conditional UPDATE before anything is sent, so a
// double tap, a flaky connection that retries, or two open tabs cannot produce
// two posts: only the caller that wins the claim reaches the fetch. A row that is
// already posted can never be claimed, and so can never be sent twice.
//
// Returns { ok, status, reason, externalId, alreadyPosted, skipped }.
export async function publishPost(env, db, post, { sendable = SENDABLE } = {}) {
  if (!post) return { ok: false, reason: 'that post no longer exists' };
  if (post.status === 'posted') {
    return { ok: true, alreadyPosted: true, externalId: post.external_id || null, reason: 'already posted, nothing sent' };
  }

  const endpoint = env.MAKE_WEBHOOK_URL;
  if (!endpoint) {
    return { ok: false, reason: 'MAKE_WEBHOOK_URL is not set on the Worker, so there is nowhere to publish to' };
  }

  const problems = validateForSend(post);
  if (problems.length) {
    // Recorded as a failure because it did fail to publish, and the reason says
    // exactly what to change. The retry button in the admin picks it up again.
    // No claim was taken, so this is a plain write rather than a release.
    await markFailed(db, post.id, problems.join('; '));
    return { ok: false, reason: problems.join('; ') };
  }

  const claimed = await claimForSend(db, post.id, sendable);
  if (!claimed) {
    // Someone else already has it, or it is not in a state that may be sent.
    return { ok: false, skipped: true, reason: 'that post is already being sent or has already gone' };
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
    const reason = 'the distribution rail could not be reached: ' + String(e && e.message ? e.message : e).slice(0, 200);
    await releaseClaim(db, post.id, 'failed', reason);
    return { ok: false, reason };
  }

  if (!res.ok) {
    const reason = `the rail answered ${res.status}: ${bodyText.slice(0, 200) || 'no detail given'}`;
    await releaseClaim(db, post.id, 'failed', reason);
    return { ok: false, status: res.status, reason };
  }

  let parsed = null;
  try { parsed = JSON.parse(bodyText); } catch (e) { parsed = null; }

  const externalId = readExternalId(parsed);
  await markPosted(db, post.id, externalId);
  return { ok: true, status: res.status, externalId };
}
