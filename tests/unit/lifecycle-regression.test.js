// Completion and classification regressions reconstructed from the 2026-07-21
// Hopper incidents. Fixtures deliberately contain only protocol fields.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import * as progress from '../../cli/src/progress.js';
import * as subprocess from '../../cli/src/subprocess.js';

import { getAdapter } from '../../cli/src/vendors/index.js';

const OPENCODE_STOP_STREAM = [
  JSON.stringify({ type: 'step_start', part: { type: 'step-start' } }),
  JSON.stringify({ type: 'text', part: { type: 'text', text: 'COMPLETE' } }),
  JSON.stringify({
    type: 'step_finish',
    part: { type: 'step-finish', reason: 'stop' },
  }),
].join('\n');

test('opencode recognizes a nested step_finish/step-finish stop as authoritative completion', () => {
  const result = getAdapter('opencode').parseResult({
    exitCode: 0,
    stdout: OPENCODE_STOP_STREAM,
    stderr: '',
    timedOut: false,
    durationMs: 25,
  });

  assert.equal(result.status, 'success');
  assert.equal(result.text, 'COMPLETE');
});

test('opencode accepts an authoritative reasonless step_finish with usable text', () => {
  const result = getAdapter('opencode').parseResult({
    exitCode: 0,
    stdout: [
      JSON.stringify({ type: 'text', part: { type: 'text', text: 'REASONLESS_COMPLETE' } }),
      JSON.stringify({ type: 'step_finish', part: { type: 'step-finish' } }),
    ].join('\n'),
    stderr: '',
    timedOut: false,
    durationMs: 25,
  });

  assert.equal(result.status, 'success');
  assert.equal(result.text, 'REASONLESS_COMPLETE');
});

test('opencode accepts message.completed with usable assistant text', () => {
  const result = getAdapter('opencode').parseResult({
    exitCode: 0,
    stdout: [
      JSON.stringify({ type: 'message.part.delta', delta: 'MESSAGE_' }),
      JSON.stringify({ type: 'message.part.delta', delta: 'COMPLETE' }),
      JSON.stringify({ type: 'message.completed' }),
    ].join('\n'),
    stderr: '',
    timedOut: false,
    durationMs: 25,
  });

  assert.equal(result.status, 'success');
  assert.equal(result.text, 'MESSAGE_COMPLETE');
});

test('opencode accepts an explicit successful result envelope with usable text', () => {
  const result = getAdapter('opencode').parseResult({
    exitCode: 0,
    stdout: JSON.stringify({
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: 'RESULT_COMPLETE',
    }),
    stderr: '',
    timedOut: false,
    durationMs: 25,
  });

  assert.equal(result.status, 'success');
  assert.equal(result.text, 'RESULT_COMPLETE');
});

test('opencode rejects a tool_calls step boundary with only partial text', () => {
  const result = getAdapter('opencode').parseResult({
    exitCode: 0,
    stdout: [
      JSON.stringify({ type: 'text', part: { type: 'text', text: 'PARTIAL_TOOL_TEXT' } }),
      JSON.stringify({ type: 'step_finish', part: { type: 'step-finish', reason: 'tool_calls' } }),
    ].join('\n'),
    stderr: '',
    timedOut: false,
    durationMs: 25,
  });

  assert.equal(result.status, 'unknown-fail');
  assert.match(result.error, /completion/i);
});

test('opencode rejects explicit error and cancelled result envelopes', () => {
  const rejected = [
    { type: 'result', subtype: 'error', is_error: true, result: 'ERROR_PARTIAL' },
    { type: 'result', status: 'cancelled', is_error: false, result: 'CANCELLED_PARTIAL' },
  ];

  for (const envelope of rejected) {
    const result = getAdapter('opencode').parseResult({
      exitCode: 0,
      stdout: JSON.stringify(envelope),
      stderr: '',
      timedOut: false,
      durationMs: 25,
    });
    assert.equal(result.status, 'unknown-fail', JSON.stringify(envelope));
    assert.match(result.error, /completion/i);
  }
});

test('opencode does not report exit 0 with no completion evidence as success', () => {
  const result = getAdapter('opencode').parseResult({
    exitCode: 0,
    stdout: JSON.stringify({ type: 'text', part: { type: 'text', text: 'partial' } }),
    stderr: '',
    timedOut: false,
    durationMs: 25,
  });

  assert.equal(result.status, 'unknown-fail');
  assert.match(result.error, /completion/i);
});

test('opencode does not treat an empty clean exit as a successful task', () => {
  const result = getAdapter('opencode').parseResult({
    exitCode: 0,
    stdout: '',
    stderr: '',
    timedOut: false,
    durationMs: 25,
  });

  assert.equal(result.status, 'unknown-fail');
  assert.match(result.error, /completion/i);
});

test('claude authoritative success result wins over unrelated auth-shaped log text', () => {
  const result = getAdapter('claude').parseResult({
    exitCode: 0,
    stdout: [
      'warning: ANTHROPIC_API_KEY takes precedence over another auth source',
      JSON.stringify({
        type: 'result',
        subtype: 'success',
        is_error: false,
        stop_reason: 'end_turn',
        result: 'AUTHORITATIVE_RESULT',
      }),
    ].join('\n'),
    stderr: '',
    timedOut: false,
    durationMs: 25,
  });

  assert.equal(result.status, 'success');
  assert.equal(result.text, 'AUTHORITATIVE_RESULT');
});

test('claude still classifies a real authentication error as auth-fail', () => {
  const result = getAdapter('claude').parseResult({
    exitCode: 1,
    stdout: '',
    stderr: 'authentication_failed: please run login',
    timedOut: false,
    durationMs: 25,
  });

  assert.equal(result.status, 'auth-fail');
});

test('runner waits for child close before reading the final file-backed stream', () => {
  const testDir = dirname(fileURLToPath(import.meta.url));
  const runner = readFileSync(resolve(testDir, '..', '..', 'cli', 'bin', 'hopper-runner'), 'utf-8');

  assert.match(runner, /vendor\.on\('close', \(code, signal\) =>/);
  assert.doesNotMatch(runner, /vendor\.on\('exit', \(code, signal\) =>/);
});

test('stream lifecycle extraction records only safe event metadata', () => {
  assert.equal(typeof progress.findLatestVendorProgressEvent, 'function');

  const event = progress.findLatestVendorProgressEvent([
    JSON.stringify({ type: 'text', part: { text: 'do not copy this model output' } }),
    JSON.stringify({ type: 'step_finish', part: { type: 'step-finish', reason: 'stop' } }),
  ].join('\n'));

  assert.deepEqual(event, { event: 'step_finish', reason: 'stop' });

  const testDir = dirname(fileURLToPath(import.meta.url));
  const runner = readFileSync(resolve(testDir, '..', '..', 'cli', 'bin', 'hopper-runner'), 'utf-8');
  assert.match(runner, /findLatestVendorProgressEvent/);
  assert.match(runner, /appendVendorHeartbeat/);
});

test('progress events preserve lifecycle metadata', async () => {
  const tmp = process.env.TEMP || process.env.TMP || '.';
  const hopperDir = `${tmp}/hopper-lifecycle-progress-${process.pid}-${Date.now()}`;
  try {
    const event = progress.appendProgressEvent({
      hopperDir,
      taskId: 'T-life-progress',
      event: {
        vendor: 'opencode',
        phase: 'running',
        kind: 'heartbeat',
        message: 'Vendor step_finish (stop).',
        source: 'runner',
        terminal: false,
        last_stream_event: 'step_finish',
        last_reason: 'stop',
        last_update: '2026-07-21T00:00:00.000Z',
      },
    });

    assert.equal(event.last_stream_event, 'step_finish');
    assert.equal(event.last_reason, 'stop');
    assert.equal(event.last_update, '2026-07-21T00:00:00.000Z');
  } finally {
    // This probe is intentionally best-effort; the behavior under test is the JSONL schema.
    try { (await import('node:fs')).rmSync(hopperDir, { recursive: true, force: true }); } catch (_) {}
  }
});

test('progress events preserve timeout cleanup diagnostics', async () => {
  const tmp = process.env.TEMP || process.env.TMP || '.';
  const hopperDir = `${tmp}/hopper-timeout-progress-${process.pid}-${Date.now()}`;
  try {
    const event = progress.appendProgressEvent({
      hopperDir,
      taskId: 'T-timeout-progress',
      event: {
        vendor: 'opencode',
        phase: 'timeout',
        kind: 'terminal',
        message: 'Task timed out.',
        source: 'runner',
        terminal: true,
        timeout_reason: 'idle',
        process_cleanup: 'succeeded',
      },
    });

    assert.equal(event.timeout_reason, 'idle');
    assert.equal(event.process_cleanup, 'succeeded');
  } finally {
    try { (await import('node:fs')).rmSync(hopperDir, { recursive: true, force: true }); } catch (_) {}
  }
});

test('process-tree cleanup reports whether a cleanup attempt was needed', () => {
  assert.deepEqual(subprocess.killProcessTree(0, true), {
    status: 'not-requested',
    method: null,
  });
});
