// POSIX process-group cleanup integration + production spawn contract.
// The real signal test is intentionally skipped on Windows: Windows cleanup
// uses taskkill /T /F and cannot validate negative-PID process-group semantics.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { platform } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { killProcessTree } from '../../cli/src/subprocess.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

test('POSIX cleanup terminates a detached process group with negative-PID SIGKILL', {
  skip: platform() === 'win32'
    ? 'requires POSIX negative-PID process-group signaling; Windows uses taskkill /T /F'
    : false,
}, async () => {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 60_000)'], {
    detached: true,
    stdio: 'ignore',
  });

  try {
    await new Promise((resolveSpawn, rejectSpawn) => {
      child.once('spawn', resolveSpawn);
      child.once('error', rejectSpawn);
    });

    const cleanup = killProcessTree(child.pid, false);
    assert.equal(cleanup.status, 'succeeded');
    assert.equal(cleanup.method, 'process-group SIGKILL');

    await new Promise((resolveClose, rejectClose) => {
      const timer = setTimeout(() => rejectClose(new Error('detached process group did not close')), 5000);
      child.once('close', () => {
        clearTimeout(timer);
        resolveClose();
      });
    });
  } finally {
    try { process.kill(-child.pid, 'SIGKILL'); } catch (_) {}
  }
});

test('production POSIX vendor spawns opt into detached process groups', () => {
  const runner = readFileSync(join(REPO_ROOT, 'cli', 'bin', 'hopper-runner'), 'utf-8');
  const subprocess = readFileSync(join(REPO_ROOT, 'cli', 'src', 'subprocess.js'), 'utf-8');

  assert.match(runner, /detached:\s*!isWindows/);
  assert.match(subprocess, /detached:\s*!isWindows/);
});
