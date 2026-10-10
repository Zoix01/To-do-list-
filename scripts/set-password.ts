// Hashes your app password and stores it where the Worker can read it.
//   npm run set-password            → Cloudflare Worker secret PASSWORD_HASH (deployed app)
//   npm run set-password -- --local → .dev.vars (local development only)
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { hashPassword } from '../src/worker/password.ts';

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(question);
    if (!stdin.isTTY) {
      // Piped input: read one line.
      let data = '';
      stdin.setEncoding('utf8');
      stdin.on('data', (chunk) => (data += chunk));
      // Some shells (Windows PowerShell) prepend a byte-order mark to piped text.
      stdin.on('end', () => resolve(data.replace(/^﻿/, '').split(/\r?\n/)[0] ?? ''));
      return;
    }
    let value = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (chars: string) => {
      for (const char of chars) {
        if (char === '\r' || char === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (char === '\u0003') {
          process.stdout.write('\n');
          process.exit(130);
        }
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else value += char;
      }
    };
    stdin.on('data', onData);
  });
}

const local = process.argv.includes('--local');

const password = await promptHidden('New password: ');
if (password.length < 8) {
  console.error('Use at least 8 characters.');
  process.exit(1);
}
if (process.stdin.isTTY && (await promptHidden('Repeat password: ')) !== password) {
  console.error('The passwords do not match.');
  process.exit(1);
}

const hash = await hashPassword(password);

if (local) {
  const file = '.dev.vars';
  const line = `PASSWORD_HASH="${hash}"`;
  const lines = existsSync(file)
    ? readFileSync(file, 'utf8')
        .split(/\r?\n/)
        .filter((l) => l && !l.startsWith('PASSWORD_HASH='))
    : [];
  writeFileSync(file, [...lines, line].join('\n') + '\n');
  console.log(`Saved to ${file}. Restart "npm run dev" to use it.`);
} else {
  console.log('Uploading PASSWORD_HASH as a Worker secret…');
  const result = spawnSync('npx', ['wrangler', 'secret', 'put', 'PASSWORD_HASH'], {
    input: hash,
    stdio: ['pipe', 'inherit', 'inherit'],
    shell: process.platform === 'win32',
  });
  process.exit(result.status ?? 1);
}
