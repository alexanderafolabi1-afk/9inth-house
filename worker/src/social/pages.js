// Which LinkedIn company page each venture posts to.
//
// This exists because the posting rail moved. The Worker's own LinkedIn sender
// holds an access token and resolves the page itself; Make holds the connection
// instead, so the Worker never sees a token and its only job is to tell Make
// which page a claimed post belongs to. That is a different piece of
// information from a credential, and keeping it in its own store means the
// page map does not depend on a token nobody is going to give this Worker.
//
// Stored in KV and settable from the desk, for the reason everything else in
// this house is: a value only settable from a dashboard the owner cannot reach
// is a value that never gets set.

const KV_KEY = 'linkedin:pages:v1';

// Confirmed by the owner against the live Make connection using LinkedIn's own
// RPC, on 6 September 2026. Seeded rather than left empty so the rail works on
// the first call, and overridable from the desk like any other setting.
export const KNOWN_PAGES = {
  '9thpoint': 'urn:li:organization:137094462'
};

// A URN naming an organisation, which is the only shape a company page post can
// be authored by. A member URN here would be a post to a person's own feed
// under the firm's name, which is why the shape is checked rather than trusted.
export function describePageUrn(raw) {
  const value = String(raw || '').trim();
  if (!value) return { ok: false, problem: 'No page URN was given.' };
  if (/^urn:li:person:/.test(value)) {
    return { ok: false, problem: 'That is a member URN. A company page post has to be authored by an organisation, so this needs to be urn:li:organization:NNN.' };
  }
  if (!/^urn:li:organization:\d+$/.test(value)) {
    return { ok: false, problem: `"${value}" is not a LinkedIn organisation URN. It reads urn:li:organization: followed by the numeric page id.` };
  }
  return { ok: true, value };
}

export async function readPages(env) {
  const stored = {};
  if (env && env.LOGIN_ATTEMPTS) {
    try {
      const raw = await env.LOGIN_ATTEMPTS.get(KV_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) Object.assign(stored, parsed);
      }
    } catch (e) {
      // A malformed map must not take the known pages down with it.
    }
  }
  // Stored wins, so a correction from the desk overrides the seeded value
  // without anyone needing a deploy.
  return { ...KNOWN_PAGES, ...stored };
}

export async function pageFor(env, venture) {
  const pages = await readPages(env);
  return pages[String(venture || '').trim().toLowerCase()] || '';
}

export async function writePage(env, venture, urn) {
  if (!env || !env.LOGIN_ATTEMPTS) return false;
  const slug = String(venture || '').trim().toLowerCase();
  if (!slug) return false;
  let stored = {};
  try {
    const raw = await env.LOGIN_ATTEMPTS.get(KV_KEY);
    if (raw) stored = JSON.parse(raw) || {};
  } catch (e) {
    stored = {};
  }
  stored[slug] = String(urn).trim();
  await env.LOGIN_ATTEMPTS.put(KV_KEY, JSON.stringify(stored));
  return true;
}
