// The only thing in the house that publishes.
//
// It decides that a post goes out exactly once, and nothing else. How it goes
// out belongs to a sender in ./senders, chosen by the delivery name on the
// platform's config entry, so this file still contains no conditional on a
// platform name and never learns which platform it is sending.
//
// Two deliveries exist today. The Make rail, which is metered per call, and a
// direct sender that talks to the platform itself and costs nothing per post.
// Adding another means a file in ./senders and one word in config.js.
//
// No endpoint or credential is written down in this repo. Senders read what they
// need from Worker secrets at runtime.

import { PLATFORMS, SENDABLE, imageRequired } from './config.js';
import { claimForSend, releaseClaim, markPosted, markFailed } from './db.js';
import { senderFor } from './senders/index.js';

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

  // A platform with no branch on the rail is queued for the copy alone. Approve
  // must never reach the webhook for it, so this is checked and returned before
  // any other validation, and well before the fetch further down.
  if (platform.automated === false) {
    problems.push(`${platform.label} is manual delivery: copy this text and post it yourself, it is never sent through the automated rail`);
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

// Both moved to the webhook sender, where they belong, and re-exported so
// existing callers and tests keep working unchanged.
export { buildPayload, readExternalId } from './senders/webhook.js';

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

  const { name: deliveryName, sender } = senderFor(PLATFORMS[post.platform]);
  if (!sender) {
    return { ok: false, reason: `no sender is configured for delivery "${deliveryName}", so there is nowhere to publish to` };
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

  // Past this point the row is claimed, so every exit has to release it or mark
  // it posted. The sender never touches the database itself, which is what keeps
  // send-exactly-once decided here and only here, whichever delivery is used.
  let result;
  try {
    result = await sender.send(env, post);
  } catch (e) {
    const reason = 'the send failed unexpectedly: ' + String(e && e.message ? e.message : e).slice(0, 200);
    await releaseClaim(db, post.id, 'failed', reason);
    return { ok: false, reason };
  }

  if (!result || !result.ok) {
    const reason = (result && result.reason) || 'the send failed for no stated reason';
    await releaseClaim(db, post.id, 'failed', reason);
    return { ok: false, status: result && result.status, reason };
  }

  const externalId = result.externalId || null;
  await markPosted(db, post.id, externalId);
  return { ok: true, status: result.status, externalId };
}
