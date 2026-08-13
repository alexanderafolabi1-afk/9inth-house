// One-time, local helper: turns a chosen password into the value for
// wrangler secret put ADMIN_PASSWORD_HASH. Run from the repo root:
//
//   node scripts/hash-password.mjs
//
// Never writes anywhere, never touches the repo, never logs the password
// itself. The format (pbkdf2$<iterations>$<salt>$<hash>) is exactly what
// worker/src/auth.js verifies against, using the same algorithm
// (PBKDF2-HMAC-SHA256) Node's crypto and the Workers runtime's crypto.subtle
// both implement identically for the same inputs.

import { randomBytes, pbkdf2Sync } from 'node:crypto';

const ITERATIONS = 210000;
const KEY_LENGTH = 32; // 256 bits

function readHiddenPassword(promptText) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      reject(new Error('This needs an interactive terminal (run it directly, not piped).'));
      return;
    }
    process.stdout.write(promptText);
    process.stdin.resume();
    process.stdin.setRawMode(true);
    process.stdin.setEncoding('utf8');
    let value = '';
    const onData = (char) => {
      if (char === '') { // Ctrl-C
        cleanup();
        process.stdout.write('\n');
        process.exit(130);
      }
      if (char === '\r' || char === '\n') {
        cleanup();
        process.stdout.write('\n');
        resolve(value);
        return;
      }
      if (char === '' || char === '\b') { // backspace
        value = value.slice(0, -1);
        return;
      }
      value += char;
    };
    function cleanup() {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener('data', onData);
    }
    process.stdin.on('data', onData);
  });
}

const password = await readHiddenPassword('Choose the admin password: ');
const confirm = await readHiddenPassword('Type it again to confirm: ');

if (!password) {
  console.error('Empty password. Nothing written, try again.');
  process.exit(1);
}
if (password !== confirm) {
  console.error('Those did not match. Nothing written, try again.');
  process.exit(1);
}

const salt = randomBytes(16);
const hash = pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, 'sha256');
const stored = `pbkdf2$${ITERATIONS}$${salt.toString('base64url')}$${hash.toString('base64url')}`;

console.log('\nADMIN_PASSWORD_HASH value (this is not the password itself, safe to paste into wrangler):\n');
console.log(stored);
console.log('\nSet it with:\n\n  cd worker && npx wrangler secret put ADMIN_PASSWORD_HASH\n\nand paste the value above when prompted.');
