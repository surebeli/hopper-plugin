// Runner single-spawn counter test (spec v2.1.0 §14.6 MANDATED)
// Anchor: tests/integration/runner-single-spawn.test.js
//
// Per spec §14.6 last paragraph: "Counter-tests in tests/integration/ MUST
// exist proving (1) hopper-runner spawns vendor exactly once per dispatch,
// (2) Failed dispatch does NOT re-spawn (counter stays at 1), (3) Watching
// a job does not respawn it."
//
// Approach: PATH-shim a fake "codex" binary in a temp dir, prepend to PATH,
// then invoke hopper-runner with adapter=codex. Counter file proves single
// spawn.
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
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, chmodSync } from 'node:fs';
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
 * We use the existing 'codex' adapter name + shim node-executable on PATH.
 *
 * Cross-platform note: on Windows, spawn looks for codex.exe / codex.cmd /
 * codex.bat per PATHEXT. We write codex.cmd on Win, plain codex (chmod +x)
 * on Unix.
 */
async function runRunnerWithFakeVendor({ taskId, hopperDir, counterFile, exitCode = 0, extraEnv = {} }) {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-runner-fake-'));
  try {
    const isWin = platform() === 'win32';
    const shimDir = join(tmp, 'shim');
    mkdirSync(shimDir);

    // Fake "codex" command: increments counter, prints OK to stdout, exits with given code
    const fakeScript = join(tmp, 'fake-vendor.js');
    writeFileSync(fakeScript, `
      const fs = require('node:fs');
      const file = ${JSON.stringify(counterFile)};
      const cur = fs.existsSync(file) ? parseInt(fs.readFileSync(file, 'utf-8')) : 0;
      fs.writeFileSync(file, String(cur + 1));
      console.log('FAKE_VENDOR_OK invocation ' + (cur + 1));
      process.exit(${exitCode});
    `, 'utf-8');

    // Create shim: 'codex' on PATH → node fakeScript
    const shimName = isWin ? 'codex.cmd' : 'codex';
    const shimPath = join(shimDir, shimName);
    if (isWin) {
      writeFileSync(shimPath, `@echo off\r\nnode "${fakeScript.replace(/\\/g, '\\\\')}" %*\r\n`, 'utf-8');
    } else {
      writeFileSync(shimPath, `#!/usr/bin/env bash\nexec node "${fakeScript}" "$@"\n`, 'utf-8');
      chmodSync(shimPath, 0o755);
    }

    const outputMdPath = join(hopperDir, 'handoffs', `${taskId}-output.md`);
    const logPath = outputMdPath.replace(/\.md$/, '.log');

    // Seed frontmatter (normally spawnDetached does this)
    writeFrontmatter(outputMdPath, {
      task_id: taskId,
      adapter: 'codex',
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
        '--adapter', 'codex',
        '--output-md', outputMdPath,
        '--log', logPath,
        '--',
        // codex adapter argv: exec <prompt> -s read-only -c reasoning=medium
        'exec', 'test prompt', '-s', 'read-only', '-c', 'model_reasoning_effort="medium"',
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
  // OpenCode plugin should NOT retry on session.error
  assert.ok(!/while\b.*prompt_async/i.test(code),
    'OpenCode plugin must not have while-loop around prompt_async');
  assert.ok(!/catch\s*\([^)]*\)\s*\{[^}]*prompt_async/i.test(code),
    'OpenCode plugin must not catch + retry prompt_async');
  // session.error handler must exist (string-preserved check)
  assert.match(noComments, /session\.error/);
  // Verify prompt_async appears (code-level) but in limited number of sites
  const promptAsyncMatches = (noComments.match(/prompt_async/g) || []).length;
  // Tool description + invocation + maybe in error message = up to 6
  assert.ok(promptAsyncMatches <= 8,
    `OpenCode plugin: too many prompt_async occurrences (${promptAsyncMatches}); check for retry pattern`);
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
