// agy adapter quirks tests (T-PLUGIN-05e silent auth-fail detection)
// Anchor: tests/unit/vendors-agy-quirks.test.js
//
// Per codex v2.0.3 audit F2: agy exits 0 + empty stdout when not OAuth-authed.
// Adapter MUST detect this via --log-file inspection. These tests verify the
// classification taxonomy works.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { agyAdapter } from '../../cli/src/vendors/agy.js';

test('agy parseResult: detects "not logged into Antigravity" as auth-fail', () => {
  const result = agyAdapter.parseResult({
    exitCode: 0,
    stdout: '',
    stderr: '',
    timedOut: false,
    durationMs: 1000,
    logFileContent: 'E log.go:398] You are not logged into Antigravity.\nlots of more spam\n',
  });
  assert.equal(result.status, 'auth-fail');
  assert.match(result.error, /OAuth/i);
  assert.match(result.error, /Run.*agy/);
});

test('agy parseResult: detects "Failed to get OAuth token" as auth-fail', () => {
  const result = agyAdapter.parseResult({
    exitCode: 0,
    stdout: '',
    stderr: '',
    timedOut: false,
    durationMs: 800,
    logFileContent: 'E server.go:604] Failed to get OAuth token: error getting token source\n',
  });
  assert.equal(result.status, 'auth-fail');
});

test('agy parseResult: detects "error getting token source" as auth-fail', () => {
  const result = agyAdapter.parseResult({
    exitCode: 0,
    stdout: '',
    stderr: '',
    timedOut: false,
    durationMs: 500,
    logFileContent: 'W log_context.go:117] error getting token source: foo bar baz\n',
  });
  assert.equal(result.status, 'auth-fail');
});

test('agy parseResult: detects "deadline exceeded" as timeout', () => {
  const result = agyAdapter.parseResult({
    exitCode: 0,
    stdout: 'partial response',
    stderr: '',
    timedOut: false,
    durationMs: 300_000,
    logFileContent: 'E context deadline exceeded while waiting for response\n',
  });
  assert.equal(result.status, 'timeout');
  assert.match(result.error, /print-timeout/);
});

test('agy parseResult: detects "permission" as permission-fail', () => {
  const result = agyAdapter.parseResult({
    exitCode: 0,
    stdout: '',
    stderr: '',
    timedOut: false,
    durationMs: 100,
    logFileContent: 'E permission denied accessing model X\n',
  });
  assert.equal(result.status, 'permission-fail');
});

test('agy parseResult: empty stdout without error pattern → unknown-fail', () => {
  const result = agyAdapter.parseResult({
    exitCode: 0,
    stdout: '',
    stderr: '',
    timedOut: false,
    durationMs: 1000,
    logFileContent: 'I some normal info log lines that contain no error patterns\n',
  });
  assert.equal(result.status, 'unknown-fail');
  assert.match(result.error, /empty output/i);
});

test('agy parseResult: exit 0 + non-empty stdout + no error pattern = success', () => {
  const result = agyAdapter.parseResult({
    exitCode: 0,
    stdout: 'HOPPER_AGY_OK',
    stderr: '',
    timedOut: false,
    durationMs: 5000,
    logFileContent: 'I normal log',
  });
  assert.equal(result.status, 'success');
  assert.equal(result.text, 'HOPPER_AGY_OK');
});

test('agy parseResult: hard timeout flag wins over log content', () => {
  const result = agyAdapter.parseResult({
    exitCode: -1,
    stdout: '',
    stderr: '',
    timedOut: true,
    durationMs: 360_000,
    logFileContent: 'E not logged into Antigravity', // even with auth-fail in log, timedOut wins
  });
  assert.equal(result.status, 'timeout');
});

test('agy parseResult: exit 127 = binary not found, regardless of log', () => {
  const result = agyAdapter.parseResult({
    exitCode: 127,
    stdout: '',
    stderr: 'agy: command not found',
    timedOut: false,
    durationMs: 10,
  });
  assert.equal(result.status, 'permission-fail');
  assert.match(result.error, /agy install/);
});

test('agy adapter args includes log-file path when provided', () => {
  const argv = agyAdapter.args('test prompt', { logFile: '/tmp/test-log.txt' });
  assert.ok(argv.includes('--log-file'));
  assert.ok(argv.includes('/tmp/test-log.txt'));
});

test('agy adapter args omits log-file when not provided', () => {
  const argv = agyAdapter.args('test prompt', {});
  assert.ok(!argv.includes('--log-file'));
});

test('agy adapter prepareLog generates unique paths per call (no stale-log per codex F2)', () => {
  const h1 = agyAdapter.prepareLog('T-A', 'agy');
  const h2 = agyAdapter.prepareLog('T-A', 'agy');
  assert.notEqual(h1.logPath, h2.logPath);
});
