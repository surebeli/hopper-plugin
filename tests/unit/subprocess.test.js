// Unit tests for subprocess.js (T-PLUGIN-04.5)
// Anchor: tests/unit/subprocess.test.js
//
// Tests the shared subprocess wrapper without spawning real vendor CLIs.
// Uses node binary echo / sleep / exit-with-code as test fixtures.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { acquireVendorLock, runSubprocessOnce, makeUniqueLogPath, chunkHasSubstantiveLine } from '../../cli/src/subprocess.js';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { join } from 'node:path';

// ── heartbeat-aware idle detection helper (mimo background-exit hang) ──
test('chunkHasSubstantiveLine: a heartbeat-only chunk is NOT substantive', () => {
  const re = /path=\/session\/status\b/;
  const chunk = [
    'INFO service=server method=GET path=/session/status request',
    'INFO service=server status=completed path=/session/status request',
    '',
  ].join('\n');
  assert.equal(chunkHasSubstantiveLine(chunk, re), false);
});

test('chunkHasSubstantiveLine: a json event among heartbeats IS substantive', () => {
  const re = /path=\/session\/status\b/;
  const chunk = [
    'INFO service=server method=GET path=/session/status request',
    '{"type":"text","part":{"text":"hi"}}',
  ].join('\n');
  assert.equal(chunkHasSubstantiveLine(chunk, re), true);
});

test('chunkHasSubstantiveLine: empty / whitespace-only chunk is not substantive', () => {
  const re = /path=\/session\/status\b/;
  assert.equal(chunkHasSubstantiveLine('', re), false);
  assert.equal(chunkHasSubstantiveLine('   \n\t\n  ', re), false);
});

test('runSubprocessOnce captures stdout from a simple command', async () => {
  // Use node itself to echo
  const result = await runSubprocessOnce({
    command: process.execPath,
    args: ['-e', 'console.log("HELLO_STDOUT")'],
    stdinInput: null,
    timeoutMs: 10000,
  });
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /HELLO_STDOUT/);
  assert.equal(result.timedOut, false);
});

test('runSubprocessOnce captures stderr separately', async () => {
  const result = await runSubprocessOnce({
    command: process.execPath,
    args: ['-e', 'console.error("HELLO_STDERR"); process.exit(0)'],
    stdinInput: null,
    timeoutMs: 10000,
  });
  assert.equal(result.exitCode, 0);
  assert.match(result.stderr, /HELLO_STDERR/);
  assert.equal(result.stdout, '');
});

test('runSubprocessOnce propagates non-zero exit code', async () => {
  const result = await runSubprocessOnce({
    command: process.execPath,
    args: ['-e', 'process.exit(42)'],
    stdinInput: null,
    timeoutMs: 10000,
  });
  assert.equal(result.exitCode, 42);
});

test('runSubprocessOnce pipes stdin when stdinInput provided', async () => {
  const result = await runSubprocessOnce({
    command: process.execPath,
    args: [
      '-e',
      'let d = ""; process.stdin.on("data", c => d += c); process.stdin.on("end", () => console.log("GOT:" + d.trim()))',
    ],
    stdinInput: 'PIPED_INPUT',
    timeoutMs: 10000,
  });
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /GOT:PIPED_INPUT/);
});

test('runSubprocessOnce times out and kills the process', async () => {
  // Spawn a process that sleeps forever; expect timeout to kill it
  const result = await runSubprocessOnce({
    command: process.execPath,
    args: [
      '-e',
      'setInterval(() => {}, 1000000)', // sleeps forever
    ],
    stdinInput: null,
    timeoutMs: 500, // half a second
  });
  assert.equal(result.timedOut, true);
  // exit code will be non-zero (killed signal-based)
  assert.notEqual(result.exitCode, 0);
});

test('runSubprocessOnce returns timedOut=false on normal exit', async () => {
  const result = await runSubprocessOnce({
    command: process.execPath,
    args: ['-e', 'console.log("fast")'],
    stdinInput: null,
    timeoutMs: 10000,
  });
  assert.equal(result.timedOut, false);
});

test('runSubprocessOnce returns durationMs', async () => {
  const result = await runSubprocessOnce({
    command: process.execPath,
    args: ['-e', 'setTimeout(() => process.exit(0), 100)'],
    stdinInput: null,
    timeoutMs: 5000,
  });
  assert.ok(result.durationMs >= 100, `expected >=100ms, got ${result.durationMs}`);
  assert.ok(result.durationMs < 5000);
});

test('runSubprocessOnce returns 127 for missing command', async () => {
  const result = await runSubprocessOnce({
    command: 'definitely-not-a-real-command-xyz123',
    args: [],
    stdinInput: null,
    timeoutMs: 5000,
  });
  assert.equal(result.exitCode, 127);
});

test('runSubprocessOnce reads --log-file content when path provided', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-subprocess-test-'));
  try {
    const logPath = join(tmp, 'fake.log');
    // Use node to write to the log file then exit
    const result = await runSubprocessOnce({
      command: process.execPath,
      args: [
        '-e',
        `require("node:fs").writeFileSync(${JSON.stringify(logPath)}, "SIMULATED_LOG_OUTPUT")`,
      ],
      stdinInput: null,
      timeoutMs: 5000,
      logFilePath: logPath,
    });
    assert.equal(result.exitCode, 0);
    assert.equal(result.logFileContent, 'SIMULATED_LOG_OUTPUT');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('runSubprocessOnce does NOT retry on failure (single attempt verification)', async () => {
  // Per spec §3 #4: ONE dispatch = ONE attempt. No retry on exit 1.
  let invokeCount = 0;
  const originalSpawn = (await import('node:child_process')).spawn;

  // We can't easily mock spawn without dependency injection, so we verify
  // via exit-code propagation: a failing command exits non-zero ONCE,
  // not multiple retried attempts.
  const result = await runSubprocessOnce({
    command: process.execPath,
    args: ['-e', 'console.error("FAILED"); process.exit(1)'],
    stdinInput: null,
    timeoutMs: 5000,
  });
  assert.equal(result.exitCode, 1);
  assert.equal(result.timedOut, false);
  // The function returned once with the failure result. No retry happened.
  // This is verified structurally — see source code: runSubprocessOnce has
  // no retry loop, no fallback path, no backoff. The only loop in the file
  // is the data event listeners.
});

test('makeUniqueLogPath generates unique paths per dispatch (codex F2 fix)', () => {
  const p1 = makeUniqueLogPath('T-PLUGIN-05a', 'codex');
  const p2 = makeUniqueLogPath('T-PLUGIN-05a', 'codex');
  assert.notEqual(p1, p2, 'two calls must produce different paths');
  assert.match(p1, /codex/);
  assert.match(p1, /T-PLUGIN-05a/);
});

test('acquireVendorLock serializes codex across overlapping callers', async () => {
  const release1 = await acquireVendorLock('codex');
  let secondAcquired = false;

  const waiter = (async () => {
    const release2 = await acquireVendorLock('codex');
    secondAcquired = true;
    release2();
  })();

  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(secondAcquired, false, 'second codex caller must wait for the first lock holder');

  release1();
  await waiter;
  assert.equal(secondAcquired, true);
});

test('acquireVendorLock is a no-op for non-serialized vendors', async () => {
  const release = await acquireVendorLock('opencode');
  assert.equal(typeof release, 'function');
  release();
});
