// Where the distribution rail's address lives.
//
// This was the last runtime value in the house that could only be set from the
// Cloudflare dashboard. It read `env.MAKE_WEBHOOK_URL` and nothing else, the
// desk showed "the distribution rail is not configured, set MAKE_WEBHOOK_URL"
// with no field to set it in, and an owner who could not reach the dashboard
// had no way to make the house publish at all. Every other runtime value the
// engine needs, the session secret, the n8n token and address, the Anthropic
// key, the postal address, the LinkedIn credentials, was moved into KV and
// behind a desk field for exactly that reason. This is that same move.
//
// The environment variable still wins where it is set, so an account that
// already has one keeps working through a deploy with nothing to do. KV is
// where a new one is written, and where the desk reads and writes.
//
// Not committed here, and not in wrangler.toml, for the reason the n8n address
// is not either: this repository is public, and a webhook that accepts whatever
// it is sent is a way into the house.

const MAKE_KV_KEY = 'make:webhook_url:v1';

export async function getMakeWebhookUrl(env) {
  if (env && env.MAKE_WEBHOOK_URL) return String(env.MAKE_WEBHOOK_URL);
  if (!env || !env.LOGIN_ATTEMPTS) return '';
  return (await env.LOGIN_ATTEMPTS.get(MAKE_KV_KEY)) || '';
}

export async function setMakeWebhookUrl(env, url) {
  if (!env || !env.LOGIN_ATTEMPTS) return false;
  const trimmed = String(url || '').trim();
  if (!trimmed) {
    await env.LOGIN_ATTEMPTS.delete(MAKE_KV_KEY);
    return true;
  }
  await env.LOGIN_ATTEMPTS.put(MAKE_KV_KEY, trimmed);
  return true;
}

// Whether the rail can publish at all, and where the address it would use came
// from. The source matters: an address set on the dashboard cannot be changed
// from the desk, so the desk has to say so rather than offering a field that
// silently loses to an environment variable.
export async function makeWebhookStatus(env) {
  const fromEnv = Boolean(env && env.MAKE_WEBHOOK_URL);
  const stored = (!fromEnv && env && env.LOGIN_ATTEMPTS)
    ? (await env.LOGIN_ATTEMPTS.get(MAKE_KV_KEY)) || ''
    : '';
  return {
    configured: fromEnv || Boolean(stored),
    source: fromEnv ? 'worker' : (stored ? 'desk' : 'none'),
    // Enough to recognise which hook is set without printing the address,
    // since anyone holding it can post as the house.
    hint: describeMakeWebhookUrl(fromEnv ? String(env.MAKE_WEBHOOK_URL) : stored).hint,
    editable: !fromEnv && Boolean(env && env.LOGIN_ATTEMPTS)
  };
}

// Says what is wrong with an address before it is saved.
//
// Make's own hooks are always https on 443, so the port rule that bites the
// n8n address cannot bite here. What can go wrong instead is pasting the wrong
// thing entirely: the scenario's page in the Make editor rather than the hook
// address, which looks similar enough at a glance and would never receive a
// single post.
export function describeMakeWebhookUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) return { ok: true, empty: true, problems: [], warnings: [], hint: '' };

  let url;
  try {
    url = new URL(value);
  } catch (e) {
    return { ok: false, empty: false, problems: ['That is not a web address the engine can read.'], warnings: [], hint: '' };
  }

  const problems = [];
  const warnings = [];

  if (url.protocol !== 'https:') {
    problems.push('The rail address must be https. Everything sent to it is the house speaking in public, and it travels in the clear otherwise.');
  }
  if (url.port && url.port !== '443') {
    problems.push(`Port ${url.port} cannot be reached. A Worker only calls 80 and 443 on an address outside its own zone.`);
  }

  // The two addresses that are not a hook, named rather than left to fail
  // silently at three in the morning with nothing in the queue explaining why.
  if (/(^|\.)make\.com$/i.test(url.hostname) && !/^\/[A-Za-z0-9]/.test(url.pathname)) {
    problems.push('That is a Make page rather than a webhook address. The hook address is the one shown on the webhook module itself.');
  }
  if (/\/scenarios?\//i.test(url.pathname) || url.pathname.includes('/edit')) {
    problems.push('That is the scenario editor address, not the webhook the scenario listens on. Open the webhook module and copy the address it shows.');
  }
  if (!/hook\./i.test(url.hostname) && /make\.com$/i.test(url.hostname)) {
    warnings.push('A Make hook address normally begins hook. followed by the region, for example hook.eu1.make.com. Check this is the address the webhook module shows.');
  }

  // The last few characters only. Enough to tell one hook from another on the
  // desk, useless to anyone who reads it over a shoulder.
  const tail = url.pathname.replace(/\/+$/, '').split('/').pop() || '';
  const hint = tail ? `${url.hostname}/...${tail.slice(-6)}` : url.hostname;

  return { ok: problems.length === 0, empty: false, problems, warnings, hint };
}
