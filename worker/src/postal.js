// The house's postal address, held in KV and set from the desk.
//
// CAN-SPAM requires a valid physical postal address in every commercial email,
// and Canada and Australia both require the sender to be identifiable. Sixteen
// of every twenty SetPostGo sends go to those three countries, so this is not a
// nicety, it is the thing that makes the campaign lawful.
//
// It lives in KV and is set from the desk for the same reason every other
// secret in this house does: a value that can only be set from a dashboard the
// owner cannot reach is a value that never gets set.

const KEY = 'house:postal_address:v1';

export async function readPostalAddress(env) {
  if (!env || !env.LOGIN_ATTEMPTS) return '';
  try {
    return (await env.LOGIN_ATTEMPTS.get(KEY)) || '';
  } catch (e) {
    return '';
  }
}

export async function writePostalAddress(env, address) {
  if (!env || !env.LOGIN_ATTEMPTS) return false;
  await env.LOGIN_ATTEMPTS.put(KEY, String(address).trim());
  return true;
}

// Checked before it is stored rather than after an email has gone out with it.
// A post box on its own is accepted by CAN-SPAM only when it is registered to
// the sender, which is not something this can verify, so it warns rather than
// refuses. Everything here is about catching the address that was pasted half
// finished, which is what actually happens.
export function describePostalAddress(raw) {
  const value = String(raw || '').trim();
  const problems = [];
  const warnings = [];
  if (!value) {
    problems.push('An address is required. Every commercial email to the United States has to carry one.');
    return { ok: false, problems, warnings };
  }
  if (value.length < 12) problems.push('That is too short to be a postal address anyone could deliver to.');
  if (!/\d/.test(value)) warnings.push('There is no number in it, which is unusual for a deliverable address.');
  if (!/[A-Za-z]{3}/.test(value)) problems.push('There is no street or town in it.');
  if (/\n/.test(value) && value.split('\n').filter((l) => l.trim()).length > 5) {
    warnings.push('That is longer than a footer usually carries. Five lines is plenty.');
  }
  if (/^\s*(p\.?\s*o\.?\s*box|post office box)/i.test(value)) {
    warnings.push('A post box counts under CAN-SPAM only if it is registered to the sender with the postal service.');
  }
  return { ok: problems.length === 0, problems, warnings, value };
}
