// agy adapter edge-case tests (codex Phase 2 audit F2 fix)
// Anchor: tests/unit/vendors-agy-edge-cases.test.js
//
// Covers F2 gaps: stderr-only auth, missing log, mixed signals.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { agyAdapter } from '../../cli/src/vendors/agy.js';

test('agy parseResult: stderr-only auth error (missing log) classified as auth-fail', () => {
  const result = agyAdapter.parseResult({
    exitCode: 0,
    stdout: '',
    stderr: 'You are not logged into Antigravity\n',
    timedOut: false,
    durationMs: 500,
    // logFileContent intentionally undefined (log file unwritable / missing)
  });
  assert.equal(result.status, 'auth-fail',
    'auth pattern in stderr alone must trigger auth-fail');
  assert.match(result.error, /log-file content was missing/i,
    'error must annotate that log was missing');
});

test('agy parseResult: missing log + clean stderr + empty stdout → unknown-fail with annotation', () => {
  const result = agyAdapter.parseResult({
    exitCode: 0,
    stdout: '',
    stderr: '',
    timedOut: false,
    durationMs: 1000,
    // logFileContent undefined
  });
  assert.equal(result.status, 'unknown-fail');
  // Adapter writes "log-file content was missing" (with hyphen, matches the CLI flag name)
  assert.match(result.error, /log[- ]?file.*missing/i,
    'error must annotate that log was missing (hyphen or space variant)');
});

test('agy parseResult: empty log + empty stderr + empty stdout → unknown-fail without missing-log note', () => {
  const result = agyAdapter.parseResult({
    exitCode: 0,
    stdout: '',
    stderr: '',
    timedOut: false,
    durationMs: 1000,
    logFileContent: '', // distinct from undefined (log file exists but empty)
  });
  assert.equal(result.status, 'unknown-fail');
  // Should NOT include missing-log annotation because logFileContent === '' (empty but present)
  assert.ok(!/log[- ]?file.*missing/i.test(result.error || ''),
    'empty-string log should NOT trigger missing-log annotation');
});

test('agy parseResult: auth pattern in log AND deadline pattern → auth wins (first match order)', () => {
  // Per current implementation order: auth check is FIRST in the regex chain.
  // This is intentional — auth fail is the cause; timeout is the symptom.
  const result = agyAdapter.parseResult({
    exitCode: 0,
    stdout: '',
    stderr: '',
    timedOut: false,
    durationMs: 10000,
    logFileContent: 'You are not logged into Antigravity\nsome time later: deadline exceeded',
  });
  assert.equal(result.status, 'auth-fail',
    'when both auth and deadline patterns present, auth (root cause) wins');
});

test('agy parseResult: stderr has deadline but log has auth → auth still wins (combined signal)', () => {
  const result = agyAdapter.parseResult({
    exitCode: 0,
    stdout: '',
    stderr: 'context deadline exceeded',
    timedOut: false,
    durationMs: 10000,
    logFileContent: 'E You are not logged into Antigravity',
  });
  assert.equal(result.status, 'auth-fail',
    'combined log+stderr — auth pattern in either source wins');
});

test('agy parseResult: success path unaffected by log+stderr handling change', () => {
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
