// House punctuation law, in one place.
//
// The prompts ask the model never to use em dashes, en dashes or spaced hyphens
// as punctuation. This catches whatever slips through anyway, before it is
// written to a file, stored in the queue, or handed to the distribution rail.
// Every string the system produces goes through here. That is the rule.

// Processed line by line so a leading "- " markdown bullet marker is never
// mistaken for punctuation and turned into a comma.
export function stripDashPunctuation(input = '') {
  const lines = String(input || '').split('\n').map((line) => {
    const bulletMatch = line.match(/^(\s*-\s+)([\s\S]*)$/);
    const prefix = bulletMatch ? bulletMatch[1] : '';
    let rest = bulletMatch ? bulletMatch[2] : line;
    rest = rest.replace(/\s*[—–]\s*/g, ', '); // em dash, en dash
    rest = rest.split(' - ').join(', '); // spaced hyphen used as punctuation
    return prefix + rest;
  });
  let out = lines.join('\n');
  out = out.replace(/ {2,}/g, ' '); // collapse any double spaces left behind
  out = out.replace(/(^|[>\n])[ \t]*,[ \t]*/g, '$1'); // no leading comma right after a tag, newline or start
  out = out.replace(/,\s*([.,!?])/g, '$1'); // avoid doubled punctuation like ", ."
  return out;
}

// True when a string still carries a dash used as punctuation. Used by the
// self check route so the rule is provable rather than assumed.
export function hasDashPunctuation(input = '') {
  const s = String(input || '');
  if (/[—–]/.test(s)) return true;
  return s.split('\n').some((line) => {
    const rest = line.replace(/^(\s*-\s+)/, '');
    return rest.includes(' - ');
  });
}

// Social copy arrives from a language model, which means it sometimes arrives
// wearing markdown it was never asked for, or wrapped in quotation marks, or
// with a "Here is the post:" preamble in front of it. This takes all of that off
// and applies the dash rule last, so nothing reintroduces one.
export function sanitiseSocialText(input = '') {
  let out = String(input || '').replace(/\r\n/g, '\n').trim();

  // A preamble the model was not asked for, only when it is the whole first line.
  out = out.replace(/^(here is|here's|sure[,.]?|certainly[,.]?)[^\n]{0,80}:\s*\n+/i, '');

  // Markdown that has no meaning on a social platform.
  out = out.replace(/^\s*#{1,6}\s+/gm, '');
  out = out.replace(/\*\*([\s\S]+?)\*\*/g, '$1');
  out = out.replace(/(^|\s)\*([^*\n]+)\*(?=\s|$)/g, '$1$2');
  out = out.replace(/^\s*```[a-z]*\s*$/gim, '');

  // A whole post wrapped in quotes, which reads as a quotation rather than a post.
  if (/^["“][\s\S]+["”]$/.test(out)) out = out.slice(1, -1).trim();

  out = out.replace(/\n{3,}/g, '\n\n');
  out = out.split('\n').map((l) => l.replace(/[ \t]+$/, '')).join('\n');

  return stripDashPunctuation(out).trim();
}

// Pulls a directive line such as "IMAGE: a flat lay of ..." or "SHOT: ..." out of
// the copy, so the instruction reaches the admin as a note instead of shipping to
// the platform as body text. Returns { text, directives }.
export function extractDirectives(input = '', labels = ['IMAGE', 'SHOT', 'ALT']) {
  const keep = [];
  const directives = {};
  for (const line of String(input || '').split('\n')) {
    const m = line.match(/^\s*([A-Z]{3,6})\s*:\s*(.+)$/);
    if (m && labels.includes(m[1])) {
      directives[m[1].toLowerCase()] = m[2].trim();
      continue;
    }
    keep.push(line);
  }
  return { text: keep.join('\n').replace(/\n{3,}/g, '\n\n').trim(), directives };
}

// Hashtags are counted rather than trusted, because a platform cap is a real
// constraint and the model treats it as a suggestion.
export function trimHashtags(input = '', max = 3) {
  const tags = String(input || '').match(/(^|\s)#[\w][\w-]*/g) || [];
  if (tags.length <= max) return String(input || '');
  let out = String(input || '');
  // Drop from the end backwards, which is where the padding always is.
  for (const tag of tags.slice(max).reverse()) {
    const at = out.lastIndexOf(tag);
    if (at >= 0) out = out.slice(0, at) + out.slice(at + tag.length);
  }
  return out.replace(/[ \t]{2,}/g, ' ').replace(/\s+$/, '');
}
