// agy adapter quirks tests (T-PLUGIN-05e silent auth-fail detection)
// Anchor: tests/unit/vendors-agy-quirks.test.js
//
// Per codex v2.0.3 audit F2: agy exits 0 + empty stdout when not OAuth-authed.
// Adapter MUST detect this via --log-file inspection. These tests verify the
// classification taxonomy works.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { agyAdapter, stripAgyGlog } from '../../cli/src/vendors/agy.js';

// agy 1.0.12 non-TTY --print drop: in BACKGROUND the runner folds stdout+stderr into one log,
// so an answer-less run yields a non-empty raw.stdout FULL of Go-klog diagnostics. The adapter
// must strip glog and NOT false-succeed on glog-only output (the actual answer is never emitted).
const AGY_GLOG_SAMPLE = [
  'I0625 23:01:44.139735 43904 input_loop.go:518] Auth done received, triggering experiment refresh',
  'I0625 23:01:44.388982 43904 http_helpers.go:199] URL: https://daily-cloudcode-pa.googleapis.com/v1internal:streamGenerateContent',
  'I0625 23:01:44.629432 43904 server.go:851] Stream goroutine exited',
  'I0625 23:01:44.629964 43904 server.go:2313] Language server shutting down',
].join('\n');

test('stripAgyGlog: removes Go-klog lines, keeps real answer text', () => {
  assert.equal(stripAgyGlog(AGY_GLOG_SAMPLE), '', 'glog-only input has no answer');
  assert.equal(stripAgyGlog(`${AGY_GLOG_SAMPLE}\nA:INHEAD_AGY\nB:INMID_AGY`), 'A:INHEAD_AGY\nB:INMID_AGY');
  assert.equal(stripAgyGlog('plain answer'), 'plain answer');
  assert.equal(stripAgyGlog(''), '');
});

test('stripAgyGlog: preserves interior blank lines (multi-paragraph answers keep their breaks)', () => {
  const ans = `${AGY_GLOG_SAMPLE}\nParagraph one.\n\nParagraph two.`;
  assert.equal(stripAgyGlog(ans), 'Paragraph one.\n\nParagraph two.');
});

test('agy parseResult: a real answer is NOT misrouted to timeout/permission by glog sub-call noise', () => {
  // The failure branches match over the combined log; an answer-bearing run whose glog merely
  // mentions a sub-call "context deadline exceeded" must still be success (gated on hasStdout).
  const r = agyAdapter.parseResult({
    exitCode: 0,
    stdout: `I0625 12:00:00.000000 1 tool.go:1] tool call: context deadline exceeded\nTHE REAL ANSWER`,
    stderr: '',
    timedOut: false,
    durationMs: 8000,
    logFileContent: 'I0625 12:00:00.000000 1 tool.go:1] tool call: context deadline exceeded',
  });
  assert.equal(r.status, 'success');
  assert.equal(r.text, 'THE REAL ANSWER');
});

test('agy parseResult: BACKGROUND glog-only output (no answer) is NOT a false success — exit 0 + auth ok → unknown-fail', () => {
  // Reproduces the live finding: agy authed + ran, the runner captured only glog (the answer was
  // dropped on the non-TTY stdout). Must surface the limitation, not report empty "success".
  const result = agyAdapter.parseResult({
    exitCode: 0,
    stdout: `${AGY_GLOG_SAMPLE}\nI0625 23:01:44.000000 43904 printmode.go:166] Print mode: silent auth succeeded`,
    stderr: '',
    timedOut: false,
    durationMs: 12886,
    logFileContent: 'I0625 printmode.go:166] Print mode: silent auth succeeded',
  });
  assert.equal(result.status, 'unknown-fail');
  assert.match(result.error, /no answer text|interactive TUI|non-TTY/i);
});

test('agy parseResult: BACKGROUND glog + a real answer line → success with the cleaned answer only', () => {
  const result = agyAdapter.parseResult({
    exitCode: 0,
    stdout: `${AGY_GLOG_SAMPLE}\nA:INHEAD_AGY\nB:INMID_AGY\nC:OUTTAIL_AGY`,
    stderr: '',
    timedOut: false,
    durationMs: 9000,
    logFileContent: 'I normal log',
  });
  assert.equal(result.status, 'success');
  assert.equal(result.text, 'A:INHEAD_AGY\nB:INMID_AGY\nC:OUTTAIL_AGY', 'glog stripped from the answer');
});

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

test('agy parseResult: detects "deadline exceeded" as timeout (when NO answer was produced)', () => {
  // No answer text (empty/glog-only stdout) + a deadline in the log → timeout. (With a real
  // answer present the run is success — see the "not misrouted by glog sub-call noise" test.)
  const result = agyAdapter.parseResult({
    exitCode: 0,
    stdout: '',
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

test('agy parseResult: does not treat toolPermission bookkeeping as permission-fail', () => {
  const result = agyAdapter.parseResult({
    exitCode: 0,
    stdout: 'HOPPER_AGY_OK',
    stderr: '',
    timedOut: false,
    durationMs: 5000,
    logFileContent: 'I cli_setting_manager.go:66] CLI settings initialized: permissions=<nil>, toolPermission=request-review',
  });
  assert.equal(result.status, 'success');
  assert.equal(result.text, 'HOPPER_AGY_OK');
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
  assert.match(result.error, /no answer text/i);
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

test('agy parseResult: exit 0 + stdout wins over early auth warnings when silent auth recovers', () => {
  const result = agyAdapter.parseResult({
    exitCode: 0,
    stdout: 'HOPPER_AGY_OK',
    stderr: '',
    timedOut: false,
    durationMs: 5000,
    logFileContent: [
      'E log.go:398] Failed to get OAuth token: error getting token source: You are not logged into Antigravity.',
      'I printmode.go:166] Print mode: silent auth succeeded',
    ].join('\n'),
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
