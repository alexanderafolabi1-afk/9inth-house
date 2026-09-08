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

// Every address in this file passes through here first.
//
// describeMakeWebhookUrl has always trimmed before validating, and the readers
// did not, which is a disagreement with real consequences. An address pasted
// with a trailing newline, which is what copying out of a Make panel tends to
// give you, validated clean and was then handed to fetch with the newline still
// on it. Worse, a value that is nothing but whitespace read as set: the status
// below reported the rail configured and not editable, so the desk hid the
// field, and the owner was left looking at a rail that could never publish and
// no way to correct it.
//
// One accessor, one answer, and whitespace only is the same as nothing.
function tidy(value) {
  return String(value === undefined || value === null ? '' : value).trim();
}

export async function getMakeWebhookUrl(env) {
  const fromEnv = tidy(env && env.MAKE_WEBHOOK_URL);
  if (fromEnv) return fromEnv;
  if (!env || !env.LOGIN_ATTEMPTS) return '';
  // Trimmed on the way out as well as the way in: setMakeWebhookUrl has always
  // trimmed before storing, but a value written by hand or by an older version
  // has not necessarily been through it.
  return tidy(await env.LOGIN_ATTEMPTS.get(MAKE_KV_KEY));
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
  // Trimmed, so an environment variable holding nothing but whitespace counts
  // as absent rather than as an address. Untrimmed it read as set, which made
  // the rail look configured, marked it not editable, and hid the only field
  // that could have fixed it.
  const fromEnv = tidy(env && env.MAKE_WEBHOOK_URL);
  const stored = (!fromEnv && env && env.LOGIN_ATTEMPTS)
    ? tidy(await env.LOGIN_ATTEMPTS.get(MAKE_KV_KEY))
    : '';
  return {
    configured: Boolean(fromEnv || stored),
    source: fromEnv ? 'worker' : (stored ? 'desk' : 'none'),
    // Enough to recognise which hook is set without printing the address,
    // since anyone holding it can post as the house.
    hint: describeMakeWebhookUrl(fromEnv || stored).hint,
    editable: !fromEnv && Boolean(env && env.LOGIN_ATTEMPTS)
  };
}

// How much of the address the desk is allowed to show.
//
// The point of a hint is to tell one hook from another at a glance, and the
// last few characters do that. The trap is that "the last few characters" of a
// short secret is the whole secret: a six character token printed six
// characters at a time is not a hint, it is the credential, and anyone holding
// a Make hook address can post as the house with it.
//
// So the tail is shown only when withholding the rest still leaves something
// worth withholding. A real Make hook token is thirty two characters, so the
// threshold costs nothing in practice and closes the case where a short or
// wrong value would otherwise be printed in full. Below it the host alone is
// the hint, which still says which Make region is configured.
const HINT_TAIL = 6;
const HINT_MIN_SECRET = 16;

export function hintFor(url) {
  const tail = url.pathname.replace(/\/+$/, '').split('/').pop() || '';
  if (tail.length < HINT_MIN_SECRET) return url.hostname;
  return `${url.hostname}/...${tail.slice(-HINT_TAIL)}`;
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

  return { ok: problems.length === 0, empty: false, problems, warnings, hint: hintFor(url) };
}
