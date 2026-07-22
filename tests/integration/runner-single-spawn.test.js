// Runner single-spawn counter test (spec v2.1.0 §14.6 MANDATED)
// Anchor: tests/integration/runner-single-spawn.test.js
//
// Per spec §14.6 last paragraph: "Counter-tests in tests/integration/ MUST
// exist proving (1) hopper-runner spawns vendor exactly once per dispatch,
// (2) Failed dispatch does NOT re-spawn (counter stays at 1), (3) Watching
// a job does not respawn it."
//
// Approach: PATH-shim a fake "opencode" binary in a temp dir, prepend to PATH,
// then invoke hopper-runner with adapter=opencode. Counter file proves single
// spawn. We intentionally avoid codex here because codex is globally serialized
// by hopper-codex.lock; tests killed mid-run can otherwise block unrelated cases.
//
// **Windows skip rationale**: on Windows, child_process.spawn with no
// shell:true tries .exe/.cmd/.bat extensions but CreateProcessW cannot
// directly execute .cmd/.bat files — they require cmd.exe wrapper.
// Forcing shell:true in production runner would introduce shell-parsing
// issues with vendor argv (security regression). So the counter test
// runs on POSIX only.
//
// **Windows equivalent**: source-code inspection test (always runs) asserts
// the runner contains exactly one spawn() call AND no retry/fallback
// constructs. Together with cross-platform background.js + existing
// execute-dispatch-e2e.test.js single-spawn proofs, the spec §14.6
// invariant is verified on all platforms.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, statSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFrontmatter, writeFrontmatter } from '../../cli/src/background.js';
import { readProgressEvents } from '../../cli/src/progress.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..', '..');
const RUNNER_PATH = join(REPO_ROOT, 'cli', 'bin', 'hopper-runner');

/**
 * Spawn the runner with a fake vendor that increments a counter file.
 * We use the existing 'opencode' adapter name + shim node-executable on PATH.
 *
 * Cross-platform note: on Windows, spawn looks for codex.exe / codex.cmd /
 * codex.bat per PATHEXT. We write codex.cmd on Win, plain codex (chmod +x)
 * on Unix.
 */
async function runRunnerWithFakeVendor({ taskId, hopperDir, counterFile, killCounterFile = null, exitCode = 0, sleepMs = 0, extraEnv = {} }) {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-runner-fake-'));
  try {
    const isWin = platform() === 'win32';
    const shimDir = join(tmp, 'shim');
    mkdirSync(shimDir);

    // Fake "opencode" command: increments counter, prints OK to stdout, exits with given code.
    // sleepMs lets timeout tests exercise runner killProcessTree without waiting
    // for a real vendor adapter's production timeout.
    const fakeScript = join(tmp, 'fake-vendor.js');
    writeFileSync(fakeScript, `
      const fs = require('node:fs');
      const file = ${JSON.stringify(counterFile)};
      const cur = fs.existsSync(file) ? parseInt(fs.readFileSync(file, 'utf-8')) : 0;
      fs.writeFileSync(file, String(cur + 1));
      console.log(JSON.stringify({ type: 'text', part: { type: 'text', text: 'FAKE_VENDOR_OK invocation ' + (cur + 1) } }));
      console.log(JSON.stringify({ type: 'step_finish', part: { type: 'step-finish', reason: 'stop' } }));
      const sleepMs = ${sleepMs};
      if (sleepMs > 0) {
        setTimeout(() => process.exit(${exitCode}), sleepMs);
      } else {
        process.exit(${exitCode});
      }
    `, 'utf-8');

    // Create shim: 'opencode' on PATH → node fakeScript
    const shimName = isWin ? 'opencode.cmd' : 'opencode';
    const shimPath = join(shimDir, shimName);
    if (isWin) {
      writeFileSync(shimPath, `@echo off\r\nnode "${fakeScript.replace(/\\/g, '\\\\')}" %*\r\n`, 'utf-8');
      if (killCounterFile) {
        const fakeTaskkillScript = join(tmp, 'fake-taskkill.js');
        writeFileSync(fakeTaskkillScript, `
          const fs = require('node:fs');
          const file = ${JSON.stringify(killCounterFile)};
          const cur = fs.existsSync(file) ? parseInt(fs.readFileSync(file, 'utf-8')) : 0;
          fs.writeFileSync(file, String(cur + 1));
        `, 'utf-8');
        writeFileSync(
          join(shimDir, 'taskkill.cmd'),
          `@echo off\r\nnode "${fakeTaskkillScript.replace(/\\/g, '\\\\')}" %*\r\n`,
          'utf-8',
        );
      }
    } else {
      writeFileSync(shimPath, `#!/usr/bin/env bash\nexec node "${fakeScript}" "$@"\n`, 'utf-8');
      chmodSync(shimPath, 0o755);
    }

    const outputMdPath = join(hopperDir, 'handoffs', `${taskId}-output.md`);
    const logPath = outputMdPath.replace(/\.md$/, '.log');

    // Seed frontmatter (normally spawnDetached does this)
    writeFrontmatter(outputMdPath, {
      task_id: taskId,
      adapter: 'opencode',
      status: 'in-progress',
      pid: null,
      start_time: new Date().toISOString(),
      end_time: null,
      exit_code: null,
      duration_ms: null,
      mode: 'background',
      log: `./${taskId}-output.log`,
      _body: '',
    });

    // Build path with shim first
    const pathSep = isWin ? ';' : ':';
    const childEnv = {
      ...process.env,
      ...extraEnv,
      PATH: shimDir + pathSep + (process.env.PATH || ''),
      HOPPER_RUNNER_INVOKED: '1',
    };

    // Run runner synchronously (not detached — this is a test)
    await new Promise((resolveP, rejectP) => {
      const child = spawn(process.execPath, [
        RUNNER_PATH,
        '--task-id', taskId,
        '--hopper-dir', hopperDir,
        '--adapter', 'opencode',
        '--output-md', outputMdPath,
        '--log', logPath,
        '--',
        // opencode adapter argv shape is irrelevant to the fake shim, but keep
        // it plausible for diagnostics.
        'run', 'test prompt', '--format', 'json',
      ], {
        env: childEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const timer = setTimeout(() => { child.kill('SIGKILL'); rejectP(new Error('runner timeout')); }, 15000);
      child.on('exit', () => { clearTimeout(timer); resolveP(); });
      child.on('error', (err) => { clearTimeout(timer); rejectP(err); });
    });

    return { outputMdPath, logPath };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

async function runRunnerWithAdapter({ taskId, hopperDir, adapterName, adapterArgv = [] }) {
  const outputMdPath = join(hopperDir, 'handoffs', `${taskId}-output.md`);
  const logPath = outputMdPath.replace(/\.md$/, '.log');
  writeFrontmatter(outputMdPath, {
    task_id: taskId,
    adapter: adapterName,
    status: 'in-progress',
    pid: null,
    start_time: new Date().toISOString(),
    end_time: null,
    exit_code: null,
    duration_ms: null,
    mode: 'background',
    log: `./${taskId}-output.log`,
    _body: '',
  });

  const result = await new Promise((resolveP, rejectP) => {
    const child = spawn(process.execPath, [
      RUNNER_PATH,
      '--task-id', taskId,
      '--hopper-dir', hopperDir,
      '--adapter', adapterName,
      '--output-md', outputMdPath,
      '--log', logPath,
      '--',
      ...adapterArgv,
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      rejectP(new Error('runner timeout'));
    }, 15000);
    child.on('exit', (code, signal) => {
      clearTimeout(timer);
      resolveP({ code, signal, stderr });
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      rejectP(err);
    });
  });

  return { outputMdPath, logPath, result };
}

test('hopper-runner spawns vendor EXACTLY ONCE on success (spec §14.6)', { skip: platform() === 'win32' ? 'PATH-shim .cmd cannot be executed by CreateProcessW; covered by code-inspection test' : false }, async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-runner-once-success-'));
  try {
    const hopperDir = join(tmp, '.hopper');
    mkdirSync(join(hopperDir, 'handoffs'), { recursive: true });
    const counterFile = join(tmp, 'counter.txt');

    const { outputMdPath } = await runRunnerWithFakeVendor({
      taskId: 'T-once-success',
      hopperDir,
      counterFile,
      exitCode: 0,
    });

    const finalCount = parseInt(readFileSync(counterFile, 'utf-8'));
    assert.equal(finalCount, 1,
      `hopper-runner MUST spawn vendor EXACTLY ONCE per dispatch; counter == ${finalCount}. ` +
      `Spec §14.6 single-spawn invariant violated if > 1.`);

    const fm = readFrontmatter(outputMdPath);
    assert.equal(fm.status, 'done', `status must flip to 'done' after vendor exits 0`);
    assert.equal(fm.exit_code, 0);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('hopper-runner spawns vendor EXACTLY ONCE on failure (no retry; spec §3 #4 + §14.6)', { skip: platform() === 'win32' ? 'PATH-shim .cmd not executable on Windows; covered by code-inspection test' : false }, async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-runner-once-fail-'));
  try {
    const hopperDir = join(tmp, '.hopper');
    mkdirSync(join(hopperDir, 'handoffs'), { recursive: true });
    const counterFile = join(tmp, 'counter.txt');

    const { outputMdPath } = await runRunnerWithFakeVendor({
      taskId: 'T-once-fail',
      hopperDir,
      counterFile,
      exitCode: 7,                 // non-zero → adapter classifies as fail
    });

    const finalCount = parseInt(readFileSync(counterFile, 'utf-8'));
    assert.equal(finalCount, 1,
      `hopper-runner MUST NOT retry on failure; counter == ${finalCount}. ` +
      `If > 1, retry logic exists somewhere in runner chain. Spec §3 #4 violated.`);

    const fm = readFrontmatter(outputMdPath);
    assert.equal(fm.status, 'failed', `non-zero exit must flip status to 'failed'`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('hopper-runner appends exactly one terminal progress event on success', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-runner-terminal-success-'));
  try {
    const hopperDir = join(tmp, '.hopper');
    mkdirSync(join(hopperDir, 'handoffs'), { recursive: true });
    const counterFile = join(tmp, 'counter.txt');

    const { outputMdPath } = await runRunnerWithFakeVendor({
      taskId: 'T-terminal-success',
      hopperDir,
      counterFile,
      exitCode: 0,
    });

    const fm = readFrontmatter(outputMdPath);
    assert.equal(fm.status, 'done');
    assert.equal(fm.phase, 'done');
    assert.equal(fm.terminal_event_emitted, true);
    assert.equal(fm.progress_seq, 1);
    assert.equal(fm.last_progress, 'Task completed successfully.');

    const events = readProgressEvents({ hopperDir, taskId: 'T-terminal-success' });
    assert.equal(events.length, 1);
    assert.equal(events[0].terminal, true);
    assert.equal(events[0].kind, 'terminal');
    assert.equal(events[0].source, 'runner');
    assert.equal(events[0].status, 'done');
    assert.equal(events[0].adapter_status, 'success');
    assert.equal(events[0].exit_code, 0);
    assert.equal(typeof events[0].duration_ms, 'number');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('hopper-runner appends exactly one terminal progress event on failed vendor result', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-runner-terminal-failed-'));
  try {
    const hopperDir = join(tmp, '.hopper');
    mkdirSync(join(hopperDir, 'handoffs'), { recursive: true });
    const counterFile = join(tmp, 'counter.txt');

    const { outputMdPath } = await runRunnerWithFakeVendor({
      taskId: 'T-terminal-failed',
      hopperDir,
      counterFile,
      exitCode: 7,
    });

    const fm = readFrontmatter(outputMdPath);
    assert.equal(fm.status, 'failed');
    assert.equal(fm.phase, 'failed');
    assert.equal(fm.terminal_event_emitted, true);
    assert.equal(fm.progress_seq, 1);
    assert.equal(fm.last_progress, 'Task failed.');

    const events = readProgressEvents({ hopperDir, taskId: 'T-terminal-failed' });
    assert.equal(events.length, 1);
    assert.equal(events[0].terminal, true);
    assert.equal(events[0].status, 'failed');
    assert.equal(events[0].adapter_status, 'unknown-fail');
    assert.equal(events[0].exit_code, 7);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('hopper-runner appends exactly one timeout terminal progress event', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-runner-terminal-timeout-'));
  try {
    const hopperDir = join(tmp, '.hopper');
    mkdirSync(join(hopperDir, 'handoffs'), { recursive: true });
    const counterFile = join(tmp, 'counter.txt');

    const { outputMdPath } = await runRunnerWithFakeVendor({
      taskId: 'T-terminal-timeout',
      hopperDir,
      counterFile,
      exitCode: 0,
      sleepMs: 2000,
      extraEnv: { HOPPER_TEST_ONLY_TIMEOUT_MS: '500' },
    });

    const finalCount = parseInt(readFileSync(counterFile, 'utf-8'));
    assert.equal(finalCount, 1, 'timeout path must not retry or respawn vendor');

    const fm = readFrontmatter(outputMdPath);
    assert.equal(fm.status, 'failed');
    assert.equal(fm.phase, 'timeout');
    assert.equal(fm.adapter_status, 'timeout');
    assert.equal(fm.timed_out, true);
    assert.equal(fm.timeout_reason, 'ceiling');
    assert.equal(fm.process_cleanup, 'succeeded');
    assert.equal(fm.terminal_event_emitted, true);
    assert.equal(fm.progress_seq, 1);
    assert.equal(fm.last_progress, 'Task timed out.');

    const events = readProgressEvents({ hopperDir, taskId: 'T-terminal-timeout' });
    assert.equal(events.length, 1);
    assert.equal(events[0].terminal, true);
    assert.equal(events[0].status, 'failed');
    assert.equal(events[0].phase, 'timeout');
    assert.equal(events[0].adapter_status, 'timeout');
    assert.equal(events[0].timed_out, true);
    assert.equal(events[0].timeout_reason, 'ceiling');
    assert.equal(events[0].process_cleanup, 'succeeded');
    assert.equal(events[0].message, 'Task timed out.');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('hopper-runner timeout arbitration is first-wins and kills the vendor tree exactly once', { skip: platform() !== 'win32' ? 'taskkill PATH shim is Windows-specific' : false }, async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-runner-timeout-first-wins-'));
  try {
    const hopperDir = join(tmp, '.hopper');
    mkdirSync(join(hopperDir, 'handoffs'), { recursive: true });
    const counterFile = join(tmp, 'vendor-counter.txt');
    const killCounterFile = join(tmp, 'kill-counter.txt');

    const { outputMdPath } = await runRunnerWithFakeVendor({
      taskId: 'T-timeout-first-wins',
      hopperDir,
      counterFile,
      killCounterFile,
      exitCode: 0,
      // The taskkill shim intentionally does not terminate the vendor. Its
      // startup output is observed by the first 1s poll; the second poll then
      // crosses the 500ms idle budget after the 1s ceiling already fired.
      sleepMs: 3000,
      extraEnv: {
        HOPPER_TEST_ONLY_TIMEOUT_MS: '1000',
        HOPPER_IDLE_TIMEOUT_MS: '500',
      },
    });

    assert.equal(parseInt(readFileSync(killCounterFile, 'utf-8')), 1,
      'the first timeout must clear its peer before a second process-tree kill');

    const fm = readFrontmatter(outputMdPath);
    assert.equal(fm.timeout_reason, 'ceiling', 'the first timeout cause must remain authoritative');
    assert.equal(fm.process_cleanup, 'succeeded', 'the first cleanup result must remain authoritative');

    const events = readProgressEvents({ hopperDir, taskId: 'T-timeout-first-wins' });
    assert.equal(events.filter((event) => event.terminal).length, 1,
      'timeout terminalization must remain idempotent');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ─── Idle watchdog vs. end-buffered vendor output (ISSUE-grok-claude-buffered-output-idle-falsekill) ──
//
// Root cause: grok/claude spawn with `--output-format json`, which BUFFERS all
// output and writes stdout exactly ONCE, at process exit (cli/src/vendors/grok.js
// args()/parseResult() comments; cli/src/vendors/claude.js args()/parseResult()
// comments). The idle watchdog above (idlePoll setInterval) resets its silence
// clock ONLY on log-FILE-size growth (statSync polling of the shared vendor
// log) — for a vendor that never grows the log until it is already done, idle
// degenerates into an unconditional kill ~idleMs after spawn. Real kills were
// observed at 185053ms / 605213ms for idleMs=180000 / 600000 — one ~5s poll
// tick past idleMs, every time.
//
// Fix: grok/claude adapters now declare `bufferedOutput: true`; hopper-runner
// skips arming the idle poll entirely when the resolved adapter sets that flag,
// leaving only the absolute ceiling timeout as the safety net (mirrors the
// existing `idleHeartbeatRe` adapter-declared-hook precedent for mimo, above).
//
// Test A proves the FAILURE MODE this fix corrects (using an adapter that does
// NOT declare bufferedOutput). Test B proves the FIX (using the real grok
// adapter, which now declares bufferedOutput: true). Placed beside the timeout
// test above (closest-matching existing suite/helper shape) rather than in a
// separate file, so the integration run's concurrent-file count stays the same.

/**
 * Spawn hopper-runner against a PATH-shimmed fake vendor binary that mimics an
 * END-BUFFERED CLI (grok/claude's `--output-format json` shape): it stays
 * completely silent for `silentMs`, then writes ONE final blob to stdout and
 * exits 0. Silence before that point produces ZERO log growth, exactly like
 * the real vendors.
 */
async function runRunnerWithBufferedStub({
  taskId,
  hopperDir,
  adapterName,
  command,
  silentMs,
  answerText,
  extraEnv = {},
  inspectAfterMs = null,
  promptText = 'test prompt',
  preseedLog = '',
}) {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-runner-buffered-'));
  try {
    const isWin = platform() === 'win32';
    const shimDir = join(tmp, 'shim');
    mkdirSync(shimDir);

    // The stub NEVER writes/exits before `silentMs` — no interim flush, no
    // partial line, matching a truly end-buffered vendor.
    const fakeScript = join(tmp, 'fake-vendor.js');
    writeFileSync(fakeScript, `
      setTimeout(() => {
        process.stdout.write(${JSON.stringify(answerText)});
        process.exit(0);
      }, ${silentMs});
    `, 'utf-8');

    const shimPath = join(shimDir, isWin ? `${command}.cmd` : command);
    if (isWin) {
      writeFileSync(shimPath, `@echo off\r\n"${process.execPath}" "${fakeScript}" %*\r\n`, 'utf-8');
    } else {
      writeFileSync(shimPath, `#!/usr/bin/env bash\nexec "${process.execPath}" "${fakeScript}" "$@"\n`, 'utf-8');
      chmodSync(shimPath, 0o755);
    }

    const outputMdPath = join(hopperDir, 'handoffs', `${taskId}-output.md`);
    const logPath = outputMdPath.replace(/\.md$/, '.log');
    writeFrontmatter(outputMdPath, {
      task_id: taskId,
      adapter: adapterName,
      status: 'in-progress',
      pid: null,
      start_time: new Date().toISOString(),
      end_time: null,
      exit_code: null,
      duration_ms: null,
      mode: 'background',
      phase: 'starting',
      terminal_event_emitted: false,
      log: `./${taskId}-output.log`,
      _body: '',
    });
    if (preseedLog) writeFileSync(logPath, preseedLog, 'utf-8');

    const childEnv = {
      ...process.env,
      ...extraEnv,
      PATH: shimDir + (isWin ? ';' : ':') + (process.env.PATH || ''),
      HOPPER_RUNNER_INVOKED: '1',
    };

    let interim = null;
    let interimError = null;
    const result = await new Promise((resolveP, rejectP) => {
      const child = spawn(process.execPath, [
        RUNNER_PATH,
        '--task-id', taskId,
        '--hopper-dir', hopperDir,
        '--adapter', adapterName,
        '--output-md', outputMdPath,
        '--log', logPath,
        '--',
        // Argv content is irrelevant — the shim ignores it and always runs
        // fakeScript, but keep it plausible for diagnostics.
        '-p', promptText, '--output-format', 'json',
      ], {
        env: childEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stderr = '';
      child.stderr.on('data', (c) => { stderr += c.toString(); });
      let inspectTimer = null;
      if (Number.isFinite(inspectAfterMs) && inspectAfterMs >= 0) {
        inspectTimer = setTimeout(() => {
          inspectTimer = null;
          try {
            interim = {
              frontmatter: readFrontmatter(outputMdPath),
              events: readProgressEvents({ hopperDir, taskId }),
            };
          } catch (err) {
            interimError = err;
          }
        }, inspectAfterMs);
      }
      const timer = setTimeout(() => { child.kill('SIGKILL'); rejectP(new Error('runner timeout')); }, 15000);
      child.on('exit', (code, signal) => {
        clearTimeout(timer);
        if (inspectTimer) clearTimeout(inspectTimer);
        resolveP({ code, signal, stderr });
      });
      child.on('error', (err) => {
        clearTimeout(timer);
        if (inspectTimer) clearTimeout(inspectTimer);
        rejectP(err);
      });
    });
    if (interimError) throw interimError;

    return { outputMdPath, logPath, result, interim };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

test('Test A (repro): NO bufferedOutput — end-buffered stub is falsely idle-killed before it can ever write', { skip: platform() === 'win32' ? 'PATH-shim .cmd not executable on Windows; covered by Test B + hopper-runner code inspection' : false }, async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-runner-idle-repro-'));
  try {
    const hopperDir = join(tmp, '.hopper');
    mkdirSync(join(hopperDir, 'handoffs'), { recursive: true });

    // 'opencode' is a real registered adapter that does NOT declare
    // bufferedOutput (nor idleHeartbeatRe) — the pre-fix shape shared by
    // grok/claude before this fix. silentMs=60000 guarantees the stub's
    // scheduled write+exit never fires inside this test's window, so the ONLY
    // thing that can end this process is the runner's own idle-kill.
    const { outputMdPath, logPath, result } = await runRunnerWithBufferedStub({
      taskId: 'T-idle-repro',
      hopperDir,
      adapterName: 'opencode',
      command: 'opencode',
      silentMs: 60000,
      answerText: JSON.stringify({ text: 'never delivered — killed first' }),
      extraEnv: { HOPPER_IDLE_TIMEOUT_MS: '500' },
    });

    assert.notEqual(result.code, 0, 'an idle-killed run must not exit 0');

    const fm = readFrontmatter(outputMdPath);
    assert.equal(fm.status, 'failed', 'idle kill must be classified failed');
    assert.equal(fm.phase, 'timeout');
    assert.equal(fm.timed_out, true);
    // Only HOPPER_IDLE_TIMEOUT_MS was overridden — ceilingMs stays at its normal
    // >=30min floor (resolveDispatchTimeouts / CEILING_FLOOR_MS). A kill this
    // fast (well under this test's 15s harness cap) can ONLY be the idle poll;
    // the ceiling timer literally cannot fire for another ~1800s. That is what
    // unambiguously proves the *idle-timeout* reason (hopper-runner does not
    // surface the internal 'idle'|'ceiling' string anywhere externally).
    assert.ok(fm.duration_ms < 10000, `expected a fast idle kill, got duration_ms=${fm.duration_ms}`);

    // The decisive assertion: the vendor was killed before it ever got a chance
    // to write its single trailing blob (scheduled for silentMs=60000, far
    // beyond the idle kill) — so the raw log the runner opened for it is still
    // exactly 0 bytes, exactly like the real grok/claude false-kill.
    assert.ok(existsSync(logPath), 'log file must exist (opened by the runner for the vendor fds)');
    assert.equal(statSync(logPath).size, 0, 'pre-kill log must be 0 bytes — the end-buffered vendor never got to write');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('Test B (fix): bufferedOutput:true (real grok adapter) — idle poll is never armed, so the same stub shape completes naturally and is parsed as success', { skip: platform() === 'win32' ? 'PATH-shim .cmd not executable on Windows' : false }, async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-runner-idle-fix-'));
  try {
    const hopperDir = join(tmp, '.hopper');
    mkdirSync(join(hopperDir, 'handoffs'), { recursive: true });

    // Same stub SHAPE as Test A (silent, then a single trailing write + exit 0)
    // — but silentMs=2500 is now LARGER than idleMs=500 below, so under the
    // PRE-FIX behavior this run would ALSO have been idle-killed before its
    // natural exit (same failure as Test A). Dispatched through the REAL grok
    // adapter (declares bufferedOutput: true after this fix), exercising the
    // actual production capability flag rather than a test double. The answer
    // shape satisfies grok's real parseResult(): a bare {text, stopReason} JSON
    // object (see cli/src/vendors/grok.js extractGrokText()).
    const { outputMdPath, logPath, result } = await runRunnerWithBufferedStub({
      taskId: 'T-idle-fix',
      hopperDir,
      adapterName: 'grok',
      command: 'grok',
      silentMs: 2500,
      answerText: JSON.stringify({ text: 'GROK_BUFFERED_ANSWER', stopReason: 'stop' }),
      extraEnv: { HOPPER_IDLE_TIMEOUT_MS: '500' },
    });

    assert.equal(result.code, 0, 'a natural success must exit 0');
    assert.match(result.stderr, /idle watchdog disabled \(bufferedOutput vendor\)/,
      'runner must emit the diagnosable status line for a bufferedOutput adapter');

    const fm = readFrontmatter(outputMdPath);
    assert.equal(fm.status, 'done', 'bufferedOutput vendor must complete naturally, not be idle-killed');
    assert.equal(fm.adapter_status, 'success');
    assert.notEqual(fm.timed_out, true);
    assert.ok(fm.duration_ms >= 2500, `must have run to its natural ~2500ms completion, got duration_ms=${fm.duration_ms}`);

    // Output was actually PARSED (not just "didn't crash"): grok's parseResult
    // extracts .text from the trailing JSON object, and the runner embeds the
    // parsed answer into output.md's "Vendor output (parsed)" section.
    const md = readFileSync(outputMdPath, 'utf-8');
    assert.match(md, /GROK_BUFFERED_ANSWER/, 'the parsed vendor answer must be embedded in output.md');
    assert.ok(statSync(logPath).size > 0, 'the raw log DOES eventually hold the single trailing write (post-completion)');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('buffered vendor emits non-sensitive process-alive liveness without extending the ceiling', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-runner-buffered-liveness-'));
  try {
    const hopperDir = join(tmp, '.hopper');
    mkdirSync(join(hopperDir, 'handoffs'), { recursive: true });
    const promptSecret = 'PROMPT_SECRET_MUST_NOT_ENTER_PROGRESS';
    const outputSecret = 'OUTPUT_SECRET_MUST_NOT_ENTER_PROGRESS';

    const { outputMdPath, result, interim } = await runRunnerWithBufferedStub({
      taskId: 'T-buffered-liveness',
      hopperDir,
      adapterName: 'grok',
      command: 'grok',
      silentMs: 60000,
      answerText: JSON.stringify({ text: 'never delivered before ceiling', stopReason: 'stop' }),
      promptText: promptSecret,
      preseedLog: outputSecret,
      inspectAfterMs: 1000,
      extraEnv: {
        HOPPER_TEST_ONLY_LIVENESS_INTERVAL_MS: '100',
        HOPPER_TEST_ONLY_TIMEOUT_MS: '2500',
      },
    });

    assert.ok(interim, 'must capture the runner before terminalization');
    assert.equal(interim.frontmatter.status, 'in-progress');
    assert.equal(interim.frontmatter.phase, 'running', 'liveness advances starting → running');
    assert.equal(interim.frontmatter.last_stream_event, 'process_alive');

    const liveness = interim.events.filter((event) => event.kind === 'process_alive');
    assert.ok(liveness.length >= 1, 'silent buffered process must emit a throttled liveness event');
    assert.ok(liveness.every((event) => event.last_stream_event === 'process_alive'));
    assert.ok(liveness.every((event) => event.message === 'Vendor process is still running.'));
    assert.ok(liveness.every((event) => event.source === 'runner' && event.terminal === false));
    const safeLivenessKeys = [
      'kind', 'last_stream_event', 'last_update', 'message', 'phase', 'seq', 'source', 'task_id', 'terminal', 'ts', 'vendor',
    ];
    assert.ok(liveness.every((event) => JSON.stringify(Object.keys(event).sort()) === JSON.stringify(safeLivenessKeys)),
      'process_alive events must contain only canonical lifecycle/timestamp/sequence fields');
    for (const forbidden of ['raw_chunk', 'stdout', 'stderr', 'prompt', 'byte_count', 'log_path', 'account', 'model', 'provider']) {
      assert.ok(liveness.every((event) => !Object.prototype.hasOwnProperty.call(event, forbidden)),
        `process_alive must not expose raw-derived field ${forbidden}`);
    }
    const interimProtocol = JSON.stringify({ frontmatter: interim.frontmatter, events: liveness });
    assert.doesNotMatch(interimProtocol, new RegExp(promptSecret));
    assert.doesNotMatch(interimProtocol, new RegExp(outputSecret));

    assert.notEqual(result.code, 0, 'liveness must not extend the absolute ceiling');
    const finalFm = readFrontmatter(outputMdPath);
    assert.equal(finalFm.phase, 'timeout');
    assert.equal(finalFm.timeout_reason, 'ceiling');

    const finalEvents = readProgressEvents({ hopperDir, taskId: 'T-buffered-liveness' });
    const terminalEvents = finalEvents.filter((event) => event.terminal);
    assert.equal(terminalEvents.length, 1);
    const terminalSeq = terminalEvents[0].seq;
    assert.ok(finalEvents.filter((event) => event.kind === 'process_alive').every((event) => event.seq < terminalSeq),
      'no liveness event may trail terminalization');

    const eventCountAtTerminal = finalEvents.length;
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
    assert.equal(readProgressEvents({ hopperDir, taskId: 'T-buffered-liveness' }).length, eventCountAtTerminal,
      'terminalization must clear the liveness timer');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('process-alive liveness timer requires buffered output or adapter capability and clears on close/error', () => {
  const runner = readFileSync(RUNNER_PATH, 'utf-8');
  assert.match(runner, /const emitsProcessAliveLiveness\s*=\s*bufferedOutput\s*\|\|\s*adapter\?\.liveness\?\.processAlive\s*===\s*true/,
    'non-buffered adapters must explicitly opt in to process-alive liveness');
  assert.match(runner, /bufferedLivenessTimer\s*=\s*emitsProcessAliveLiveness\s*\?\s*setInterval/,
    'the timer must be gated by the unified buffered-or-capability predicate');

  const closeStart = runner.indexOf("vendor.on('close'");
  const errorStart = runner.indexOf("vendor.on('error'", closeStart);
  assert.ok(closeStart >= 0 && errorStart > closeStart);
  assert.match(runner.slice(closeStart, errorStart), /clearInterval\(bufferedLivenessTimer\)/);
  assert.match(runner.slice(errorStart), /clearInterval\(bufferedLivenessTimer\)/);
});

test('hopper-runner early fail appends one terminal progress event when frontmatter exists', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-runner-terminal-early-fail-'));
  try {
    const hopperDir = join(tmp, '.hopper');
    mkdirSync(join(hopperDir, 'handoffs'), { recursive: true });

    const { outputMdPath, result } = await runRunnerWithAdapter({
      taskId: 'T-terminal-early-fail',
      hopperDir,
      adapterName: 'missing-vendor',
    });

    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /missing-vendor/);

    const fm = readFrontmatter(outputMdPath);
    assert.equal(fm.status, 'failed');
    assert.equal(fm.phase, 'failed');
    assert.equal(fm.terminal_event_emitted, true);
    assert.equal(fm.progress_seq, 1);

    const events = readProgressEvents({ hopperDir, taskId: 'T-terminal-early-fail' });
    assert.equal(events.length, 1);
    assert.equal(events[0].terminal, true);
    assert.equal(events[0].status, 'failed');
    assert.match(events[0].message, /missing-vendor/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ─── Code-inspection counter tests (cross-platform, including Windows) ──

test('hopper-runner source contains EXACTLY ONE spawn() call (Windows + POSIX)', () => {
  const src = readFileSync(RUNNER_PATH, 'utf-8');
  // Count non-comment lines containing 'spawn('
  const lines = src.split('\n').filter(l => !/^\s*\/\//.test(l));
  const spawnLines = lines.filter(l => /\bspawn\s*\(/.test(l));
  assert.equal(spawnLines.length, 1,
    `hopper-runner must contain EXACTLY ONE spawn() call; found ${spawnLines.length}. ` +
    `Spec §14.6 single-spawn invariant requires this. Lines: ${spawnLines.join(' | ')}`);
});

test('hopper-runner source contains NO retry/fallback/orchestration constructs (Windows + POSIX)', () => {
  const src = readFileSync(RUNNER_PATH, 'utf-8');
  const forbidden = [
    /while\b.*\bspawn\b/i,
    /for\b.*\bspawn\b/i,
    /retry/i,
    /backoff/i,
    /fallback/i,
    /circuit.break/i,
    /consensus/i,
    /round.?robin/i,
    /vendor.on\(.error.*\bspawn\b/i,                       // no respawn on error
  ];
  // The runner has the word "retry" once in a comment about NOT retrying.
  // Strip comments + string literals before checking.
  const stripped = src
    .replace(/\/\/[^\n]*/g, '')       // strip line comments
    .replace(/\/\*[\s\S]*?\*\//g, '') // strip block comments
    .replace(/'[^']*'/g, "''")        // strip single-quoted
    .replace(/"[^"]*"/g, '""')        // strip double-quoted
    .replace(/`[^`]*`/g, '``');       // strip template literals
  for (const pat of forbidden) {
    assert.ok(!pat.test(stripped),
      `hopper-runner code contains forbidden pattern ${pat}; spec §3 #4 violated`);
  }
});

test('background.js spawnDetached source contains EXACTLY ONE spawn() call (Windows + POSIX)', () => {
  const bgPath = join(REPO_ROOT, 'cli', 'src', 'background.js');
  const src = readFileSync(bgPath, 'utf-8');
  const lines = src.split('\n').filter(l => !/^\s*\/\//.test(l));
  const spawnLines = lines.filter(l => /\bspawn\s*\(/.test(l));
  assert.equal(spawnLines.length, 1,
    `background.js must contain EXACTLY ONE spawn() call (the runner spawn); found ${spawnLines.length}.`);
});

test('OpenCode plugin source has NO retry/fallback patterns (Windows + POSIX)', () => {
  const pluginPath = join(REPO_ROOT, 'hosts', 'opencode', 'plugins', 'hopper-async.ts');
  const src = readFileSync(pluginPath, 'utf-8');
  // Strip comments only (keep string literals so we can still grep for hook names)
  const noComments = src
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  // Also strip strings for retry-pattern check (so prose comments mentioning retry don't trip)
  const code = noComments
    .replace(/'[^']*'/g, "''")
    .replace(/"[^"]*"/g, '""')
    .replace(/`[^`]*`/g, '``');
  assert.ok(!/while\b.*hopper_dispatch/i.test(code),
    'OpenCode plugin shim must not have while-loop around tool execution');
  assert.ok(!/catch\s*\([^)]*\)\s*\{[^}]*hopper_dispatch/i.test(code),
    'OpenCode plugin shim must not catch + retry tool execution');
  assert.doesNotMatch(noComments, /prompt_async/);
  assert.match(noComments, /host!=vendor|host != vendor/i);
});

test('runner-direct invocation: vendor spawn count visible in counter file', { skip: platform() === 'win32' ? 'PATH-shim .cmd not executable on Windows; covered by code-inspection test' : false }, async () => {
  // Additional defense: simulate "user invokes runner 3 times in a row" —
  // each invocation should spawn its own single vendor, so total = 3.
  // This proves no cross-invocation respawn / spurious chaining.
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-runner-multi-'));
  try {
    const hopperDir = join(tmp, '.hopper');
    mkdirSync(join(hopperDir, 'handoffs'), { recursive: true });
    const counterFile = join(tmp, 'counter.txt');

    for (let i = 0; i < 3; i++) {
      await runRunnerWithFakeVendor({
        taskId: `T-multi-${i}`,
        hopperDir,
        counterFile,
        exitCode: 0,
      });
    }

    const finalCount = parseInt(readFileSync(counterFile, 'utf-8'));
    assert.equal(finalCount, 3,
      `3 separate dispatches must produce 3 vendor spawns; got ${finalCount}.`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
