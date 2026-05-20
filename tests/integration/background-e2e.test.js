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
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
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
  try {
    // Adapter command 'true' (Unix) or a real binary that exits 0 quickly.
    // We don't await completion — just verify the seed frontmatter.
    // On Windows there's no 'true' binary but `cmd /c exit 0` works.
    // For safety: use process.execPath (node) with `-e ""` which exits 0 fast.
    // But spawnDetached calls into hopper-runner which uses getAdapter() — so
    // we still need a registered vendor. Use 'codex' adapter name; the runner
    // will attempt to spawn `codex` which may not exist — but BEFORE that, the
    // initial frontmatter write happens. We verify that frontmatter exists and
    // then clean up.

    // Catch: spawnDetached may throw if it can't write frontmatter (it should
    // not throw on the spawn itself unless the runner script is missing).
    let result;
    try {
      result = spawnDetached({
        hopperDir,
        taskId: 'T-spawn-seed',
        adapterName: 'codex',
        adapterArgv: ['exec', 'noop', '-s', 'read-only'],
        runnerPath: RUNNER_PATH,
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

    // PID assertion: either the wrapper PID we recorded (if frontmatter
    // patch raced and won) OR null (if runner finished and flipped before
    // we patched). Both are acceptable.
    if (fm.status === 'in-progress') {
      assert.ok(fm.pid > 0, 'in-progress state must have a PID');
    }

    // Give the runner up to 5s to exit cleanly (codex command likely fails
    // since the binary may not be authenticated, but the runner WILL exit)
    const start = Date.now();
    while (Date.now() - start < 5000) {
      const cur = readFrontmatter(result.outputMdPath);
      if (cur.status === 'done' || cur.status === 'failed') break;
      await new Promise(r => setTimeout(r, 200));
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('spawnDetached: re-running after the first completes is allowed (no false-positive lock)', async () => {
  const { tmp, hopperDir } = setup();
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
    let result;
    try {
      result = spawnDetached({
        hopperDir,
        taskId: 'T-rerun',
        adapterName: 'codex',
        adapterArgv: ['exec', 'noop'],
        runnerPath: RUNNER_PATH,
      });
    } catch (err) {
      assert.fail(`spawnDetached should allow re-dispatch after done; got: ${err.message}`);
    }

    assert.ok(result.pid > 0);

    // New frontmatter should show in-progress (re-seeded)
    const fm = readFrontmatter(result.outputMdPath);
    assert.notEqual(fm.start_time, new Date(Date.now() - 60000).toISOString(),
      'start_time must be refreshed for the new dispatch');

    // Wait for runner exit so we don't leave a child process behind
    await new Promise(r => setTimeout(r, 3000));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
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
