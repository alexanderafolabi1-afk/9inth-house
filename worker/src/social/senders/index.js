// The senders, keyed by the delivery name on a platform's config entry.
//
// This file and the adapters beside it are the only places in the engine
// allowed to name a platform, on the same footing as config.js. Everything else
// stays generic: distribute.js looks a sender up by delivery name and never
// learns which platform it is talking to, so adding a platform that posts
// directly is a file here and one word in config.js, never an edit to the
// machinery.
//
// Every sender is (env, post) => { ok, status, externalId, reason }, and none of
// them touch the database. Claiming a row, marking it posted and marking it
// failed all stay in distribute.js, so a post can be sent exactly once no matter
// which delivery carries it.

import * as linkedin from './linkedin.js';
import * as webhook from './webhook.js';

export const SENDERS = {
  webhook,
  linkedin
};

// The delivery used by any platform that does not name one. Everything went
// through the Make rail before direct senders existed, so that stays the
// default and no existing platform entry needs changing.
export const DEFAULT_DELIVERY = 'webhook';

export function senderFor(platform) {
  const name = (platform && platform.delivery) || DEFAULT_DELIVERY;
  return { name, sender: SENDERS[name] || null };
}

// The deliveries that hold credentials of their own, and can therefore be set
// up from the desk. Discovered by asking each sender whether it implements the
// pair, rather than listed here, so api.js can offer a credentials screen for
// any future direct sender without naming it or being edited at all.
export function credentialDeliveries() {
  return Object.keys(SENDERS).filter((name) => {
    const s = SENDERS[name];
    return s && typeof s.credentialStatus === 'function' && typeof s.writeCredentials === 'function';
  });
}

// What the desk may see about one delivery's credentials. Never the secret
// itself: each sender decides what is safe to show, and none of them return a
// value that could post on the owner's behalf.
export async function credentialStatusFor(env, name) {
  const s = SENDERS[name];
  if (!s || typeof s.credentialStatus !== 'function') return null;
  return s.credentialStatus(env);
}

export async function writeCredentialsFor(env, name, next) {
  const s = SENDERS[name];
  if (!s || typeof s.writeCredentials !== 'function') return false;
  return s.writeCredentials(env, next);
}
