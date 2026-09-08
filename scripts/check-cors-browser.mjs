// The complement to check-cors.mjs: that script proves the real Worker
// sends the right Access-Control-Allow-Origin header for a real HTTP
// request. This script proves the thing that actually matters on a phone:
// that a real browser, holding a real page whose origin genuinely is
// https://9thpoint.com (or https://www.9thpoint.com), completes a real
// fetch() to the real Worker without throwing, and that a browser at some
// other origin genuinely gets refused. Every previous CORS fix passed a
// header-level test and still failed in the browser, so this one drives an
// actual Chromium and lets its own CORS engine decide, preflight included.
//
// It does not fake anything to get there. It cannot reach the public
// internet's real 9thpoint.com from an arbitrary sandbox, and it should not
// try to (this must not depend on, or touch, production DNS or the
// production Worker). Instead it tells Chromium's own network stack, via
// the standard --host-resolver-rules flag, to resolve exactly those two
// hostnames to a local page server for the lifetime of this one browser
// process only; nothing outside that process's DNS view is touched, and no
// request or response is ever intercepted or synthesised; every byte,
// including the preflight, goes over a real loopback TLS socket to a real
// server and back through Chromium's real CORS algorithm. The Worker on
// the other end is the real committed code, started the same way
// check-cors.mjs starts it. Run this against the real production origin
// instead by setting CORS_TEST_WORKER_BASE to the real Worker URL and
// removing the --host-resolver-rules-driven redirection (see
// resolveHomePage below) if a fully live check is ever wanted; the default
// here is deliberately hermetic so it is safe to run in CI on every push.
//
// Setup (one-time): npm install, then npx playwright install chromium
// (skipped automatically if a compatible Chromium is already on disk, e.g.
// PLAYWRIGHT_BROWSERS_PATH in this environment).
// Run from the repo root: node scripts/check-cors-browser.mjs
//
// Needs to bind TCP port 443 locally (so the test page's own origin has no
// ":port" suffix: https://9thpoint.com and https://9thpoint.com:9443 are
// different origins to a browser), which needs root or CAP_NET_BIND_SERVICE.
// That is a real requirement, not a shortcut: a passing run that quietly
// skipped this instead would be exactly the kind of test this file exists
// to replace.

import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import https from 'node:https';

import { KNOWN_DESK_ORIGINS } from '../worker/src/origins.js';

const WORKER_DIR = new URL('../worker/', import.meta.url).pathname;
const WORKER_PORT = 18887 + (process.pid % 400);
const PAGE_PORT = 443;

let failures = 0;
function check(label, cond, detail) {
  if (cond) console.log('PASS', label);
  else { console.log('FAIL', label, detail !== undefined ? JSON.stringify(detail) : ''); failures++; }
}

async function startWorker() {
  console.log(`Starting the real Worker under wrangler dev on https://localhost:${WORKER_PORT} (this can take up to a minute on a cold cache)...`);
  const child = spawn('npx', ['wrangler', 'dev', '--port', String(WORKER_PORT), '--local-protocol', 'https'], {
    cwd: WORKER_DIR,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', (d) => { output += d.toString(); });
  child.stderr.on('data', (d) => { output += d.toString(); });
  const start = Date.now();
  while (Date.now() - start < 60000) {
    if (/Ready on https/.test(output)) return child;
    if (child.exitCode !== null) throw new Error('wrangler dev exited before it was ready:\n' + output.slice(-2000));
    await sleep(300);
  }
  try { process.kill(-child.pid, 'SIGKILL'); } catch (e) { /* already gone */ }
  throw new Error('wrangler dev never reported ready:\n' + output.slice(-2000));
}

function stopWorker(child) {
  if (child && child.pid) {
    try { process.kill(-child.pid, 'SIGKILL'); } catch (e) { /* already gone */ }
  }
}

// A throwaway self-signed cert covering the hostnames this test needs to
// serve a page under. Real production TLS is irrelevant here: what is
// being tested is what Chromium does with the Origin header and the
// Worker's CORS response, not certificate validity, so --ignore-
// certificate-errors is used on the browser side instead of trying to get
// a real chain for made-up-for-this-run hostnames. node:crypto has no
// built-in X.509 cert generation, so this shells out to openssl, which is
// present on essentially every Linux dev/CI image this is likely to run on.
async function generateCertFiles(dir, hostnames) {
  const keyPath = path.join(dir, 'key.pem');
  const certPath = path.join(dir, 'cert.pem');
  const cnfPath = path.join(dir, 'san.cnf');
  const altNames = hostnames.map((h, i) => `DNS.${i + 1} = ${h}`).join('\n');
  await writeFile(cnfPath, `
[req]
distinguished_name = req_distinguished_name
x509_extensions = v3_req
prompt = no
[req_distinguished_name]
CN = cors-browser-test
[v3_req]
subjectAltName = @alt_names
[alt_names]
${altNames}
`);
  await new Promise((resolve, reject) => {
    const p = spawn('openssl', [
      'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
      '-keyout', keyPath, '-out', certPath,
      '-days', '1', '-config', cnfPath
    ]);
    let err = '';
    p.stderr.on('data', (d) => { err += d.toString(); });
    p.on('close', (code) => code === 0 ? resolve() : reject(new Error('openssl failed: ' + err)));
  });
  return { keyPath, certPath };
}

async function startPageServer(keyPath, certPath) {
  const [key, cert] = await Promise.all([readFile(keyPath), readFile(certPath)]);
  const server = https.createServer({ key, cert }, (req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<!doctype html><title>check-cors-browser</title>');
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PAGE_PORT, '127.0.0.1', resolve);
  });
  return server;
}

async function main() {
  const stranger = 'not-the-real-site.example';
  const allHostnames = [...KNOWN_DESK_ORIGINS.map((o) => new URL(o).hostname), stranger];

  const workDir = await mkdtemp(path.join(tmpdir(), 'cors-browser-test-'));
  let workerChild;
  let pageServer;
  let browser;
  try {
    const { chromium } = await import('playwright');
    const { keyPath, certPath } = await generateCertFiles(workDir, allHostnames);
    [workerChild, pageServer] = await Promise.all([startWorker(), startPageServer(keyPath, certPath)]);

    const resolverRules = allHostnames.map((h) => `MAP ${h} 127.0.0.1`).join(',');
    const proxyBypass = [...allHostnames, 'localhost', '127.0.0.1'].join(',');

    const launchArgs = {
      args: [
        '--ignore-certificate-errors',
        `--host-resolver-rules=${resolverRules}`,
        `--proxy-bypass-list=${proxyBypass}`,
        '--proxy-server=direct://'
      ]
    };
    if (process.env.PLAYWRIGHT_CHROMIUM_PATH) launchArgs.executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
    try {
      browser = await chromium.launch(launchArgs);
    } catch (e) {
      // Some environments (this one included) ship a pre-installed Chromium
      // at a fixed path that a freshly npm-installed Playwright does not
      // resolve to by default. Fall back to searching the browsers dir
      // Playwright itself would have used, before giving up.
      const browsersDir = process.env.PLAYWRIGHT_BROWSERS_PATH;
      if (!browsersDir) throw e;
      const { execSync } = await import('node:child_process');
      const found = execSync(`find "${browsersDir}" -maxdepth 3 -iname chrome -type f 2>/dev/null | head -1`).toString().trim();
      if (!found) throw e;
      browser = await chromium.launch({ ...launchArgs, executablePath: found });
    }

    const WORKER_BASE = `https://localhost:${WORKER_PORT}`;

    async function requestFrom(hostname) {
      const page = await browser.newPage();
      try {
        await page.goto(`https://${hostname}/check-cors-browser.html`, { timeout: 10000 });
        const actualOrigin = await page.evaluate(() => location.origin);
        const result = await page.evaluate(async (base) => {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 8000);
          try {
            const res = await fetch(base + '/auth/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ password: 'not-the-real-password' }),
              cache: 'no-store',
              signal: ctrl.signal
            });
            clearTimeout(timer);
            return { threw: false, status: res.status };
          } catch (e) {
            clearTimeout(timer);
            return { threw: true, name: e.name, message: e.message };
          }
        }, WORKER_BASE);
        return { actualOrigin, result };
      } finally {
        await page.close();
      }
    }

    for (const origin of KNOWN_DESK_ORIGINS) {
      const hostname = new URL(origin).hostname;
      const outcome = await requestFrom(hostname);
      check(`A real Chromium page whose origin genuinely is ${origin} sees itself as that origin`, outcome.actualOrigin === origin, outcome.actualOrigin);
      check(`A real cross-origin fetch (preflight + POST) from ${origin} to the real Worker does not throw`, outcome.result.threw === false, outcome.result);
    }

    const strangerOutcome = await requestFrom(stranger);
    check(`A real Chromium page at an origin never granted access (https://${stranger}) is genuinely refused by the browser's own CORS enforcement (fetch throws)`, strangerOutcome.result.threw === true, strangerOutcome.result);
  } finally {
    if (browser) await browser.close();
    if (pageServer) pageServer.close();
    stopWorker(workerChild);
    await rm(workDir, { recursive: true, force: true });
  }
}

try {
  await main();
} catch (e) {
  console.log('FAIL the browser CORS check itself threw:', e && e.stack || e);
  failures++;
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
