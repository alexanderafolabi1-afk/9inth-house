// Regression guard for the bug this exists because of: a phone failing to
// sign in to the desk with "Could not reach the house", while every
// server-side and unit-level test of the CORS logic kept passing.
//
// The actual defect was not in corsHeaders()/allowedOrigins() (worker/src/
// social/api.js): those are correct in isolation, and a plain call to them
// with the right Origin returns the right header, every time. The defect
// only showed up once the real Worker was actually running, under the real
// wrangler.toml, answering a real HTTP request: a stray Cloudflare
// `[[routes]]` binding whose zone_name exactly matched the apex origin
// (https://9thpoint.com, no www) caused the Worker's own runtime to
// substitute a different Access-Control-Allow-Origin value for that one
// origin specifically, which is exactly the origin the installed PWA
// actually sends. No unit test of a pure function could ever have caught
// that, because the bug was in the interaction between wrangler.toml and
// the runtime, not in any function's logic.
//
// So this test does not import corsHeaders and call it directly. It boots
// the real Worker with `wrangler dev`, against the real, committed
// wrangler.toml, and sends real HTTP requests carrying a real Origin
// header, the same way a browser does for a cross-origin fetch: an OPTIONS
// preflight, then the actual request, checking that Access-Control-
// Allow-Origin on BOTH exactly matches what was sent, for every origin
// DESK_ORIGIN actually lists, and that an origin not on the list gets no
// such header at all (proving this has not been "fixed" by going
// permissive). A CORS-compliant browser is deterministic about the rest:
// a mismatched or missing Access-Control-Allow-Origin is a guaranteed
// fetch() rejection in every engine (Chromium, WebKit/Safari, Gecko) alike,
// so checking the header is checking the thing a real cross-origin browser
// request actually depends on.
//
// Run from the repo root: node scripts/check-cors.mjs
// Needs `npx wrangler` to be able to run (network access on first use, to
// fetch the CLI; no Cloudflare account or login required for `wrangler dev`
// against local-only bindings).

import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const WORKER_DIR = new URL('../worker/', import.meta.url).pathname;
const PORT = 18787 + (process.pid % 500); // spread out to dodge a leftover listener on a re-run

let failures = 0;
function check(label, cond, detail) {
  if (cond) console.log('PASS', label);
  else { console.log('FAIL', label, detail !== undefined ? JSON.stringify(detail) : ''); failures++; }
}

console.log(`Starting the real Worker under wrangler dev on port ${PORT} (this can take up to a minute on a cold cache)...`);

const child = spawn('npx', ['wrangler', 'dev', '--port', String(PORT), '--local-protocol', 'http'], {
  cwd: WORKER_DIR,
  detached: true, // its own process group, so every child it spawns (workerd) can be killed together
  stdio: ['ignore', 'pipe', 'pipe']
});

let output = '';
child.stdout.on('data', (d) => { output += d.toString(); });
child.stderr.on('data', (d) => { output += d.toString(); });

function stop() {
  if (child.pid) {
    try { process.kill(-child.pid, 'SIGKILL'); } catch (e) { /* already gone */ }
  }
}
process.on('exit', stop);

async function waitForReady(timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (/Ready on http/.test(output)) return true;
    if (child.exitCode !== null) return false; // it died before ever becoming ready
    await sleep(300);
  }
  return false;
}

const ready = await waitForReady(60000);
if (!ready) {
  console.log('The Worker never reported ready. Last output:\n' + output.slice(-2000));
  stop();
  process.exit(1);
}

const BASE = `http://localhost:${PORT}`;

async function corsRequest(method, origin) {
  const headers = { Origin: origin };
  if (method === 'OPTIONS') headers['Access-Control-Request-Method'] = 'POST';
  else headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + '/auth/login', {
    method,
    headers,
    body: method === 'OPTIONS' ? undefined : JSON.stringify({ password: 'not-a-real-password' })
  });
  return { status: res.status, allowOrigin: res.headers.get('access-control-allow-origin') };
}

try {
  // The two origins DESK_ORIGIN actually names in wrangler.toml. Read from
  // there rather than hardcoded twice, so this test fails loudly if the
  // configured origins and this test's expectations ever drift apart.
  const wranglerToml = await (await import('node:fs/promises')).readFile(WORKER_DIR + 'wrangler.toml', 'utf8');
  const match = wranglerToml.match(/DESK_ORIGIN\s*=\s*"([^"]+)"/);
  const configuredOrigins = match ? match[1].split(',').map((s) => s.trim()) : ['https://9thpoint.com', 'https://www.9thpoint.com'];
  check('wrangler.toml actually pins DESK_ORIGIN (not left to the code default)', Boolean(match), wranglerToml.slice(0, 200));

  for (const origin of configuredOrigins) {
    const preflight = await corsRequest('OPTIONS', origin);
    check(`OPTIONS preflight for ${origin}: Access-Control-Allow-Origin exactly matches the request's Origin`, preflight.allowOrigin === origin, preflight);

    const actual = await corsRequest('POST', origin);
    check(`POST for ${origin}: Access-Control-Allow-Origin exactly matches the request's Origin on the real response too, not only the preflight`, actual.allowOrigin === origin, actual);
  }

  // The negative case: an origin never granted this in DESK_ORIGIN must get
  // no Access-Control-Allow-Origin header at all, on both the preflight and
  // the real response. A CORS-compliant browser refuses to hand a fetch()
  // caller anything under this condition, so an absent header here is what
  // keeps this Worker from being callable by an arbitrary site.
  const strangerOrigin = 'https://not-the-real-site.example';
  const strangerPreflight = await corsRequest('OPTIONS', strangerOrigin);
  check('An unlisted origin gets no Access-Control-Allow-Origin on the preflight (this has not just been made permissive)', !strangerPreflight.allowOrigin, strangerPreflight);
  const strangerActual = await corsRequest('POST', strangerOrigin);
  check('An unlisted origin gets no Access-Control-Allow-Origin on the real response either', !strangerActual.allowOrigin, strangerActual);
} catch (e) {
  console.log('FAIL the CORS check itself threw:', e && e.stack || e);
  failures++;
}

stop();
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
