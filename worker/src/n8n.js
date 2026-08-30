// The outbound half of the n8n integration.
//
// n8n already talks to this Worker: it pulls the queue from /n8n/queue, pushes
// finished copy back to /n8n/queue/push, and triggers a batch with
// /n8n/generate, all authenticated with a bearer token held in KV. That
// direction works from anywhere, needs no open port and no fixed address, and
// is the reason it was built that way.
//
// This file is the other direction, for the cases where the house wants to tell
// n8n something rather than wait to be asked: a batch was written, a media pack
// was rebuilt. It is optional. Nothing here failing can stop a shift.

// Where the address lives. Not in this repository, and not in wrangler.toml,
// for a reason worth stating plainly: this repository is public. An address
// committed here is an address published to everyone, and a webhook that
// accepts anything anyone sends it is a way into the house. It is set from the
// desk instead, kept in KV beside the session secret and the n8n token, the
// same as everything else the house needs at runtime.
const WEBHOOK_KV_KEY = 'n8n:webhook_url:v1';

export async function getWebhookUrl(env) {
  if (env.N8N_WEBHOOK_URL) return String(env.N8N_WEBHOOK_URL);
  if (!env.LOGIN_ATTEMPTS) return '';
  return (await env.LOGIN_ATTEMPTS.get(WEBHOOK_KV_KEY)) || '';
}

export async function setWebhookUrl(env, url) {
  if (!env.LOGIN_ATTEMPTS) return false;
  const trimmed = String(url || '').trim();
  if (!trimmed) {
    await env.LOGIN_ATTEMPTS.delete(WEBHOOK_KV_KEY);
    return true;
  }
  await env.LOGIN_ATTEMPTS.put(WEBHOOK_KV_KEY, trimmed);
  return true;
}

// Says what is wrong with an address before it is saved, rather than leaving
// the owner to work out why nothing arrives.
//
// The port rule is the one that matters and it is not ours: a Worker cannot
// make a subrequest to a non standard port on a host outside its own zone.
// Ports 80 and 443 work, 5678 does not, and no amount of code here changes
// that. An n8n on a custom port has to be reached through something answering
// on 443, which a Cloudflare Tunnel does for free and which also removes the
// open port and the changing home address at the same time.
//
// Only an unparseable address is refused outright. The rest are returned as
// warnings, because they are the owner's call to make and a saved address that
// warns is more useful than a rejected one that explains nothing.
export function describeWebhookUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) return { ok: true, empty: true, problems: [], warnings: [] };

  let url;
  try {
    url = new URL(value);
  } catch (e) {
    return { ok: false, problems: ['That is not a web address the engine can read.'], warnings: [] };
  }

  const problems = [];
  const warnings = [];

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    problems.push(`The engine can only call http or https addresses, not ${url.protocol.replace(':', '')}.`);
  }

  const port = url.port;
  if (port && port !== '80' && port !== '443') {
    warnings.push(
      `Port ${port} will not be reachable. A Worker can only call ports 80 and 443 on an address outside its own zone, ` +
      'so this will never arrive however long it is left. Put n8n behind a hostname answering on 443, for example with a ' +
      'Cloudflare Tunnel, which is free and also closes the open port.'
    );
  }

  if (url.protocol === 'http:') {
    warnings.push('This address is not encrypted, so everything sent to it travels in the clear and can be read in transit. Use https.');
  }

  // A bare address rather than a name. Home connections are handed a new one
  // periodically, and when that happens posting stops with no warning and
  // nothing in the queue explaining why.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(url.hostname)) {
    warnings.push('This is a numeric address rather than a hostname. If it belongs to a home or office connection it will change without notice, and delivery will stop silently when it does.');
  }

  return { ok: problems.length === 0, empty: false, problems, warnings };
}

// Tells n8n something happened. Never throws, never blocks the caller's
// response, and never turns a successful shift into a failed one: the house
// generating its copy is the real work, and n8n hearing about it is a
// courtesy. A failure is returned for the log and nothing else.
export async function forwardToN8n(env, event, payload) {
  const endpoint = await getWebhookUrl(env);
  if (!endpoint) return { ok: false, skipped: true, reason: 'no n8n webhook address is set, so nothing was forwarded' };

  const check = describeWebhookUrl(endpoint);
  if (!check.ok) return { ok: false, skipped: true, reason: check.problems.join(' ') };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Lets an n8n workflow tell one kind of message from another without
        // reading the body, and lets it drop a repeat if the same event
        // arrives twice.
        'X-NH-Event': event,
        'Idempotency-Key': `${event}:${payload && payload.run_id ? payload.run_id : Date.now()}`
      },
      body: JSON.stringify({ event, sent_at: new Date().toISOString(), ...payload }),
      // Short on purpose. This is a notification, and the desk is waiting on
      // the response that triggered it; a slow or dead endpoint must not hold
      // that open. The Worker's own CPU budget is not spent waiting, but the
      // request is, and the owner should not sit watching a spinner because a
      // home server is asleep.
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 200);
      return { ok: false, status: res.status, reason: `n8n answered ${res.status}. ${detail}` };
    }
    return { ok: true, status: res.status };
  } catch (e) {
    const message = String(e && e.message ? e.message : e);
    // The specific failure an unreachable port produces, named so it is not
    // mistaken for the endpoint being down.
    const portHint = /^\d+$/.test(new URL(endpoint).port || '') && !['80', '443'].includes(new URL(endpoint).port)
      ? ' A Worker cannot reach a non standard port on an outside address, which is the likely cause here rather than n8n being down.'
      : '';
    return { ok: false, reason: 'n8n could not be reached: ' + message.slice(0, 200) + portHint };
  }
}
