// Regression guard: fails the build if a live credential shape shows up in a
// client-side file. Run from the repo root:
//
//   node scripts/check-secrets.mjs
//
// Scoped to everything the browser can fetch, not the whole repo: worker/ is
// server-side, where env.SECRET_NAME references are correct and expected,
// never a literal value. scripts/ is a Node-only dev tool, also excluded for
// the same reason (it reads secrets from process.env, never holds one).
//
// This is a shape check, not a proof of absence: it catches a key pasted back
// in by mistake, not a determined attempt to hide one.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const EXCLUDED_DIRS = ['worker/', 'scripts/', '.git/'];
const BINARY_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.ico', '.woff', '.woff2', '.ttf', '.otf', '.webp', '.avif']);

const PATTERNS = [
  { name: 'Anthropic API key', re: /sk-ant-[A-Za-z0-9_-]{20,}/ },
  { name: 'GitHub personal access token (classic)', re: /ghp_[A-Za-z0-9]{36}/ },
  { name: 'GitHub fine-grained token', re: /github_pat_[A-Za-z0-9_]{22,}/ },
  { name: 'AWS access key ID', re: /AKIA[0-9A-Z]{16}/ },
  { name: 'Google API key', re: /AIza[0-9A-Za-z_-]{35}/ },
  { name: 'Slack token', re: /xox[baprs]-[0-9A-Za-z-]{10,}/ },
  { name: 'Make.com webhook URL', re: /hooks\.make\.com\/[A-Za-z0-9]+/ },
  { name: 'private key block', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ }
];

function trackedFiles() {
  const out = execFileSync('git', ['ls-files'], { encoding: 'utf8', cwd: new URL('..', import.meta.url) });
  return out.split('\n').filter(Boolean);
}

function isExcluded(path) {
  if (EXCLUDED_DIRS.some((dir) => path.startsWith(dir))) return true;
  const dot = path.lastIndexOf('.');
  if (dot >= 0 && BINARY_EXTENSIONS.has(path.slice(dot).toLowerCase())) return true;
  return false;
}

function scan() {
  const root = new URL('../', import.meta.url);
  const findings = [];
  for (const path of trackedFiles()) {
    if (isExcluded(path)) continue;
    let text;
    try {
      text = readFileSync(new URL(path, root), 'utf8');
    } catch (e) {
      continue; // not readable as text (a genuinely binary asset with no listed extension, or a symlink)
    }
    const lines = text.split('\n');
    for (const { name, re } of PATTERNS) {
      for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(re);
        if (match) {
          findings.push({ path, line: i + 1, name, snippet: match[0].slice(0, 12) + '…' });
        }
      }
    }
  }
  return findings;
}

const findings = scan();
if (findings.length) {
  console.error('check-secrets: found what looks like a live credential in a client-side file.\n');
  for (const f of findings) {
    console.error(`  ${f.path}:${f.line}  ${f.name}  (${f.snippet})`);
  }
  console.error('\nMove it into a Worker secret (wrangler secret put ...) and reference it as env.NAME server-side only.');
  process.exit(1);
} else {
  console.log('check-secrets: clean. No known credential shape found in client-side files.');
}
