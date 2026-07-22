// Background dispatch E2E tests (Phase 5a, spec v2.1.0 §14)
// Anchor: tests/integration/background-e2e.test.js
//
// Scope (per Phase 5a):
// These tests cover spawnDetached's contract WITHOUT actually spawning a
// real vendor adapter — that would require shimming the vendor command
// onto PATH, which is fragile cross-platform (especially Windows PATHEXT
// semantics).
//
// What IS tested here:
//   1. spawnDetached preflight refuses when output.md is already in-progress
//      with an alive PID (concurrent-dispatch protection — spec §14.4)
//   2. spawnDetached writes initial frontmatter with status=in-progress + start_time
//   3. spawnDetached records PID in frontmatter after spawn returns
//   4. The returned descriptor matches the on-disk frontmatter
//   5. Stdin-piping rejected for background mode (spec §14 stdin handling)
//
// The "runner spawns vendor EXACTLY ONCE" property is verified by code
// inspection (the `// *** THE single spawn ***` line in cli/bin/hopper-runner)
// PLUS the existing single-spawn counter tests in:
//   - tests/unit/subprocess-spawn-count.test.js (runSubprocessOnce)
//   - tests/integration/execute-dispatch-e2e.test.js (executeWithAdapter)
// Together these prove single-spawn at the layers that matter; runner just
// composes them.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  spawnDetached, readFrontmatter, writeFrontmatter, isAlive,
} from '../../cli/src/background.js';
import { killProcessTree } from '../../cli/src/subprocess.js';
import { cleanupAfterPidExit, removeWithRetries, waitForPidExit } from '../helpers/wait-for-pid-exit.js';
import { mkdtempSync, mkdirSync, rmSync, existsSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..', '..');
const RUNNER_PATH = join(REPO_ROOT, 'cli', 'bin', 'hopper-runner');

function setup() {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-bg-spawn-'));
  const hopperDir = join(tmp, '.hopper');
  mkdirSync(join(hopperDir, 'handoffs'), { recursive: true });
  return { tmp, hopperDir };
}

function makeFakeRunner(tmp, sleepMs = 50) {
  const runnerPath = join(tmp, 'fake-runner.js');
  writeFileSync(runnerPath, `setTimeout(() => process.exit(0), ${sleepMs});\n`, 'utf-8');
  return runnerPath;
}

// spawnDetached anchors the detached runner's CWD to `tmp` (the repo root that
// owns .hopper/). On Windows a live process's CWD cannot be rmdir'd (EBUSY), so
// every real child must be reaped before a bounded retry removes the temp repo.
async function cleanup(tmp, pid, { pidExitObserved = false } = {}) {
  await cleanupAfterPidExit(tmp, pid, {
    pidExitObserved,
    isAlive,
    kill: killProcessTree,
    remove: removeWithRetries,
  });
}

test('observed PID exit skips fallback kill even if the PID appears reused', async () => {
  const { tmp } = setup();
  let aliveChecks = 0;
  let killCalls = 0;
  await cleanupAfterPidExit(tmp, 4242, {
    pidExitObserved: true,
    isAlive: () => { aliveChecks += 1; return true; },
    kill: () => { killCalls += 1; },
    remove: removeWithRetries,
  });
  assert.equal(aliveChecks, 0, 'an observed exit must not re-check a potentially reused PID');
  assert.equal(killCalls, 0, 'an observed exit must never taskkill a potentially reused PID');
  assert.equal(existsSync(tmp), false);
});

test('spawnDetached refuses when output.md status=in-progress + alive PID (concurrent protection)', () => {
  const { tmp, hopperDir } = setup();
  try {
    const outputMdPath = join(hopperDir, 'handoffs', 'T-busy-output.md');
    writeFrontmatter(outputMdPath, {
      task_id: 'T-busy',
      adapter: 'codex',
      status: 'in-progress',
      pid: process.pid,                    // self → always alive
      start_time: new Date().toISOString(),
      _body: '',
    });

    assert.throws(
      () => spawnDetached({
        hopperDir,
        taskId: 'T-busy',
        adapterName: 'codex',
        adapterArgv: ['exec', 'test prompt'],
        runnerPath: RUNNER_PATH,
      }),
      /Refusing dispatch.*already running/i,
      'spawnDetached must throw EALREADYRUNNING when an in-progress + alive job exists'
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('spawnDetached writes initial in-progress frontmatter + PID + start_time', async () => {
  const { tmp, hopperDir } = setup();
  let result;
  let pidExitObserved = false;
  try {
    // Use a fake runner so this infrastructure test never starts a real vendor
    // CLI or holds a global vendor lock that can interfere with parallel tests.
    const fakeRunner = makeFakeRunner(tmp);

    // Catch: spawnDetached may throw if it can't write frontmatter (it should
    // not throw on the spawn itself unless the runner script is missing).
    try {
      result = spawnDetached({
        hopperDir,
        taskId: 'T-spawn-seed',
        adapterName: 'codex',
        adapterArgv: ['exec', 'noop', '-s', 'read-only'],
        runnerPath: fakeRunner,
      });
    } catch (err) {
      // Spawn itself shouldn't fail; if it did, dump for diagnosis
      assert.fail(`spawnDetached threw: ${err.message}`);
    }

    assert.ok(result.pid > 0, 'spawnDetached must return a positive PID');
    assert.ok(result.outputMdPath.endsWith('T-spawn-seed-output.md'));
    assert.ok(result.logPath.endsWith('T-spawn-seed-output.log'));
    assert.match(result.startTime, /^\d{4}-\d{2}-\d{2}T/);

    // Read initial frontmatter (note: runner may already be running and could
    // flip status; read quickly)
    const fm = readFrontmatter(result.outputMdPath);
    assert.equal(fm.task_id, 'T-spawn-seed');
    assert.equal(fm.adapter, 'codex');
    assert.ok(['in-progress', 'failed', 'done'].includes(fm.status),
      `status must be one of expected; got ${fm.status}`);
    assert.equal(fm.mode, 'background');
    assert.ok(fm.start_time);
    assert.ok(fm.log);
    assert.match(fm.log, /\.log$/);
    assert.equal(fm.phase, 'starting');
    assert.equal(fm.last_progress, 'Background task queued.');
    assert.equal(fm.progress_seq, 1);
    assert.equal(fm.progress_log, './T-spawn-seed-progress.log');
    assert.equal(fm.raw_log, './T-spawn-seed-output.log');
    assert.equal(fm.vendor_session_id, null);
    assert.equal(fm.terminal_event_emitted, false);
    assert.ok(fm.last_progress_at);
    assert.ok(existsSync(result.outputMdPath.replace(/-output\.md$/, '-progress.log')),
      'background dispatch must create a progress log sidecar');

    // PID assertion: either the wrapper PID we recorded (if frontmatter
    // patch raced and won) OR null (if runner finished and flipped before
    // we patched). Both are acceptable.
    if (fm.status === 'in-progress') {
      assert.ok(fm.pid > 0, 'in-progress state must have a PID');
    }

    await waitForPidExit(result.pid, { isAlive });
    pidExitObserved = true;
  } finally {
    await cleanup(tmp, result?.pid, { pidExitObserved });
  }
});

test('spawnDetached: re-running after the first completes is allowed (no false-positive lock)', async () => {
  const { tmp, hopperDir } = setup();
  let result;
  let pidExitObserved = false;
  try {
    const outputMdPath = join(hopperDir, 'handoffs', 'T-rerun-output.md');

    // Simulate previous completed run
    writeFrontmatter(outputMdPath, {
      task_id: 'T-rerun',
      adapter: 'codex',
      status: 'done',
      pid: 999999,
      start_time: new Date(Date.now() - 60000).toISOString(),
      end_time: new Date(Date.now() - 30000).toISOString(),
      exit_code: 0,
      duration_ms: 30000,
      mode: 'background',
      _body: '',
    });

    // Now dispatch again — preflight should ALLOW (status != in-progress)
    try {
      result = spawnDetached({
        hopperDir,
        taskId: 'T-rerun',
        adapterName: 'codex',
        adapterArgv: ['exec', 'noop'],
        runnerPath: makeFakeRunner(tmp),
      });
    } catch (err) {
      assert.fail(`spawnDetached should allow re-dispatch after done; got: ${err.message}`);
    }

    assert.ok(result.pid > 0);

    // New frontmatter should show in-progress (re-seeded)
    const fm = readFrontmatter(result.outputMdPath);
    assert.notEqual(fm.start_time, new Date(Date.now() - 60000).toISOString(),
      'start_time must be refreshed for the new dispatch');

    // Wait for fake runner exit so we don't leave a child process behind
    await waitForPidExit(result.pid, { isAlive });
    pidExitObserved = true;
  } finally {
    await cleanup(tmp, result?.pid, { pidExitObserved });
  }
});

test('spawnDetached refuses stdin-piping adapter (spec §14 — no stdin in background mode)', () => {
  const { tmp, hopperDir } = setup();
  try {
    assert.throws(
      () => spawnDetached({
        hopperDir,
        taskId: 'T-stdin',
        adapterName: 'codex',
        adapterArgv: [],
        runnerPath: RUNNER_PATH,
        stdinInput: 'some prompt that needs stdin',
      }),
      /background.*stdin|stdinMode/i,
      'background mode must reject stdin-piping adapters'
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('spawnDetached path-traversal: rejects unsafe task-id BEFORE writing anything', () => {
  const { tmp, hopperDir } = setup();
  try {
    assert.throws(
      () => spawnDetached({
        hopperDir,
        taskId: '../escape',
        adapterName: 'codex',
        adapterArgv: [],
        runnerPath: RUNNER_PATH,
      }),
      /unsafe characters|task-id|path traversal/i,
      'spawnDetached must validate task-id before any FS operation'
    );

    // Nothing should have been written
    assert.equal(existsSync(join(hopperDir, 'handoffs', '..', 'escape-output.md')), false);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ─── codex Phase 5 audit F1-F7 regression tests ────────────────────────

test('F3 atomic lock: concurrent spawnDetached on SAME task — second refuses', () => {
  const { tmp, hopperDir } = setup();
  try {
    // Plant a sentinel lockfile so the second call sees EEXIST
    const lockPath = join(hopperDir, 'handoffs', 'T-lock-test.dispatching');
    writeFileSync(lockPath, `pid=${process.pid}\nts=${Date.now()}\n`, 'utf-8');

    assert.throws(
      () => spawnDetached({
        hopperDir,
        taskId: 'T-lock-test',
        adapterName: 'codex',
        adapterArgv: ['exec', 'noop'],
        runnerPath: RUNNER_PATH,
      }),
      /already running|already.*dispatched|lock/i,
      'second concurrent dispatch must refuse via lockfile'
    );

    // Lock should still exist (we didn't acquire it; the first holder owns it)
    assert.ok(existsSync(lockPath), 'lockfile must remain for first holder');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('F3 atomic lock: stale lockfile (>60s) is reclaimed', async () => {
  const { tmp, hopperDir } = setup();
  let result;
  let pidExitObserved = false;
  try {
    const lockPath = join(hopperDir, 'handoffs', 'T-stale-lock.dispatching');
    // Create lockfile + backdate mtime to 2 minutes ago
    writeFileSync(lockPath, `pid=99999\nts=${Date.now() - 120_000}\n`, 'utf-8');
    const oldT = (Date.now() - 120_000) / 1000;
    utimesSync(lockPath, oldT, oldT);

    // spawnDetached should reclaim the stale lock and proceed
    try {
      result = spawnDetached({
        hopperDir,
        taskId: 'T-stale-lock',
        adapterName: 'codex',
        adapterArgv: ['exec', 'noop'],
        runnerPath: makeFakeRunner(tmp),
      });
    } catch (err) {
      assert.fail(`stale lock should be reclaimed; got: ${err.message}`);
    }
    assert.ok(result.pid > 0);
    // Let the detached runner exit so it releases tmp as its CWD before cleanup.
    await waitForPidExit(result.pid, { isAlive });
    pidExitObserved = true;
  } finally {
    await cleanup(tmp, result?.pid, { pidExitObserved });
  }
});

test('F2 + F3: spawnDetached releases lock after PID seeded', async () => {
  const { tmp, hopperDir } = setup();
  let result;
  let pidExitObserved = false;
  try {
    result = spawnDetached({
      hopperDir,
      taskId: 'T-lock-release',
      adapterName: 'codex',
      adapterArgv: ['exec', 'noop'],
      runnerPath: makeFakeRunner(tmp),
      adapterOpts: { reasoning: 'xhigh' },  // F2: opts propagation test
    });

    // After spawnDetached returns, lock should be GONE.
    // (Race: runner may finish so fast that frontmatter is already
    // 'done' or 'failed' before our final check. Either way, lock
    // must not exist.)
    const lockPath = join(hopperDir, 'handoffs', 'T-lock-release.dispatching');
    assert.equal(existsSync(lockPath), false,
      'lockfile must be deleted after PID is seeded into frontmatter');

    // PID is in frontmatter (either as the runner PID OR null if the runner
    // already flipped the frontmatter to 'done' before our PID-patch landed)
    const fm = readFrontmatter(result.outputMdPath);
    assert.ok(fm.pid === result.pid || fm.pid === null || fm.status !== 'in-progress',
      `PID expected ${result.pid}; got ${fm.pid} with status ${fm.status}`);

    await waitForPidExit(result.pid, { isAlive });
    pidExitObserved = true;
  } finally {
    await cleanup(tmp, result?.pid, { pidExitObserved });
  }
});
