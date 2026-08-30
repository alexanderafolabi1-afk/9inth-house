// The Anthropic key, and why it does not live in the Cloudflare dashboard.
//
// Everything the house needs at runtime has moved into KV: the session secret,
// the VAPID push keys, the n8n token, the LinkedIn credentials. The reason each
// time was the same, and it applies here more than anywhere. Setting a
// Cloudflare secret needs a terminal or a dashboard the owner does not have, so
// a value that can only be set that way is a feature that cannot be used.
//
// This one was the most expensive instance of it. Every partner in the house
// reads this key: the four daily shifts, the Night Press, the Author Desk media
// pack, the social generation, and every button on the desk. With it unset, all
// of that failed, and the shifts failed quietly on their own schedule with
// nobody watching the logs.
//
// Unlike the session secret and the n8n token, this cannot be generated here.
// It comes from Anthropic, so the desk has to be able to put it in. A Worker
// secret still wins where one is set, so an existing deployment is untouched.

const KEY_KV_KEY = 'anthropic:api_key:v1';

export async function getAnthropicKey(env) {
  if (env.ANTHROPIC_API_KEY) return String(env.ANTHROPIC_API_KEY);
  if (!env.LOGIN_ATTEMPTS) return '';
  return (await env.LOGIN_ATTEMPTS.get(KEY_KV_KEY)) || '';
}

export async function setAnthropicKey(env, key) {
  if (!env.LOGIN_ATTEMPTS) return false;
  const trimmed = String(key || '').trim();
  if (!trimmed) {
    await env.LOGIN_ATTEMPTS.delete(KEY_KV_KEY);
    return true;
  }
  await env.LOGIN_ATTEMPTS.put(KEY_KV_KEY, trimmed);
  return true;
}

// What the desk may see. Never the key: only whether one is held and its last
// four characters, which is enough to tell one key from another after a
// rotation without handing back something that can spend money.
export async function anthropicKeyStatus(env) {
  const key = await getAnthropicKey(env);
  return {
    set: Boolean(key),
    tail: key ? key.slice(-4) : '',
    source: env.ANTHROPIC_API_KEY ? 'worker secret' : (key ? 'stored on the worker' : 'not set')
  };
}

// Caught before it is stored rather than at the next shift. A key pasted with
// the label attached, or half copied, or from the wrong provider, all look like
// a saved key and then fail hours later where nobody is watching.
export function describeAnthropicKey(raw) {
  const value = String(raw || '').trim();
  if (!value) return { ok: false, problems: ['Paste the key from the Anthropic console. It is not something to invent.'], warnings: [] };

  const problems = [];
  const warnings = [];

  if (/\s/.test(value)) {
    problems.push('That contains a space or a line break, so something extra was copied with it. Take the key on its own.');
  }
  if (!value.startsWith('sk-ant-')) {
    warnings.push('Anthropic keys normally begin with "sk-ant-". This one does not, so check it is the right key and not one from another service.');
  }
  if (value.length < 40) {
    warnings.push('That is shorter than an Anthropic key usually is, so it may have been cut off when copied.');
  }
  return { ok: problems.length === 0, problems, warnings };
}
