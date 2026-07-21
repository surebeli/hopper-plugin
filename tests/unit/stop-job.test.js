// HOPPER-6: `--stop` + Windows-safe PID verification.
// Anchor: tests/unit/stop-job.test.js

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { stopBackgroundJob, readFrontmatter, writeFrontmatter } from '../../cli/src/background.js';
import { verifyPidImage } from '../../cli/src/subprocess.js';
import { readProgressEvents } from '../../cli/src/progress.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const DISPATCH = join(REPO_ROOT, 'cli', 'bin', 'hopper-dispatch');
const DEAD_PID = 999999;  // not alive → no real process is ever signalled

function makeHopper() {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-stop-'));
  const hopperDir = join(tmp, '.hopper');
  mkdirSync(join(hopperDir, 'handoffs'), { recursive: true });
  return { tmp, hopperDir };
}

function seedInProgress(hopperDir, taskId, extra = {}) {
  const outputMdPath = join(hopperDir, 'handoffs', `${taskId}-output.md`);
  writeFrontmatter(outputMdPath, {
    task_id: taskId,
    adapter: 'codex',
    status: 'in-progress',
    pid: DEAD_PID,
    start_time: new Date(Date.now() - 5000).toISOString(),
    mode: 'background',
    terminal_event_emitted: false,
    _body: '',
    ...extra,
  });
  return outputMdPath;
}

function runCli(args, hopperDir) {
  try {
    const stdout = execFileSync(process.execPath, [DISPATCH, ...args], {
      env: { ...process.env, HOPPER_DIR: hopperDir },
      stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf-8',
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err) {
    return {
      stdout: err.stdout ? err.stdout.toString() : '',
      stderr: err.stderr ? err.stderr.toString() : '',
      exitCode: err.status,
    };
  }
}

// ─── stopBackgroundJob ────────────────────────────────────────────────

test('HOPPER-6: stopBackgroundJob marks in-progress job cancelled + emits terminal event', () => {
  const { tmp, hopperDir } = makeHopper();
  try {
    const outputMdPath = seedInProgress(hopperDir, 'T-STOP');
    const res = stopBackgroundJob(hopperDir, 'T-STOP');
    assert.equal(res.ok, true);
    assert.equal(res.status, 'cancelled');
    assert.equal(res.killed, false);        // dead PID → nothing to kill

    const fm = readFrontmatter(outputMdPath);
    assert.equal(fm.status, 'cancelled');
    assert.equal(fm.phase, 'cancelled');
    assert.equal(fm.terminal_event_emitted, true);
    assert.equal(fm.process_cleanup, 'not-needed');
    assert.equal(fm.process_cleanup_attempted, false);
    assert.ok(fm.end_time);
    assert.match(fm._body, /## Stopped \(user --stop\)/);

    const events = readProgressEvents({ hopperDir, taskId: 'T-STOP' });
    const terminal = events.find((e) => e.terminal);
    assert.ok(terminal, 'a terminal progress event must be written');
    assert.equal(terminal.status, 'cancelled');
    assert.equal(terminal.process_cleanup, 'not-needed');
    assert.equal(terminal.process_cleanup_attempted, false);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('HOPPER-6: stopBackgroundJob records a completed tree cleanup for an owned node child', async () => {
  const { tmp, hopperDir } = makeHopper();
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 60_000)'], {
    stdio: 'ignore',
    windowsHide: true,
  });
  try {
    await new Promise((resolve, reject) => {
      child.once('spawn', resolve);
      child.once('error', reject);
    });
    const outputMdPath = seedInProgress(hopperDir, 'T-STOP-OWNED', { pid: child.pid });

    const res = stopBackgroundJob(hopperDir, 'T-STOP-OWNED');
    assert.equal(res.ok, true);
    assert.equal(res.killed, true);
    assert.equal(res.processCleanup.status, 'succeeded');
    assert.ok(res.processCleanup.method);

    const fm = readFrontmatter(outputMdPath);
    assert.equal(fm.process_cleanup, 'succeeded');
    assert.equal(fm.process_cleanup_attempted, true);
    assert.ok(fm.process_cleanup_method);

    const terminal = readProgressEvents({ hopperDir, taskId: 'T-STOP-OWNED' }).find((event) => event.terminal);
    assert.equal(terminal.process_cleanup, 'succeeded');
    assert.equal(terminal.process_cleanup_attempted, true);
    assert.ok(terminal.process_cleanup_method);

    await new Promise((resolve) => child.once('close', resolve));
  } finally {
    try { child.kill('SIGKILL'); } catch (_) {}
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('HOPPER-6: stopBackgroundJob is a no-op on an already-terminal job', () => {
  const { tmp, hopperDir } = makeHopper();
  try {
    seedInProgress(hopperDir, 'T-DONE', { status: 'done' });
    const res = stopBackgroundJob(hopperDir, 'T-DONE');
    assert.equal(res.ok, false);
    assert.equal(res.already, true);
    assert.equal(res.status, 'done');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('HOPPER-6: stopBackgroundJob reports a missing task cleanly', () => {
  const { tmp, hopperDir } = makeHopper();
  try {
    const res = stopBackgroundJob(hopperDir, 'T-NOPE');
    assert.equal(res.ok, false);
    assert.match(res.reason, /no output file/i);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ─── verifyPidImage (Windows PID-reuse guard) ─────────────────────────

test('HOPPER-6: verifyPidImage matches the running node process', () => {
  // The test runner itself is node → its image must match the 'node' needle.
  assert.equal(verifyPidImage(process.pid, { expectImageIncludes: 'node' }), 'match');
});

test('HOPPER-6: verifyPidImage returns unknown for invalid/absent pids', () => {
  assert.equal(verifyPidImage(0), 'unknown');
  assert.equal(verifyPidImage(DEAD_PID), 'unknown');
});

test('HOPPER-6: verifyPidImage flags a mismatched expected image', () => {
  const verdict = verifyPidImage(process.pid, { expectImageIncludes: 'definitely-not-this-binary' });
  // Either a clear mismatch, or unknown if the platform tool was unavailable.
  assert.ok(verdict === 'mismatch' || verdict === 'unknown');
});

// ─── CLI --stop ───────────────────────────────────────────────────────

test('HOPPER-6: --stop cancels a running job (exit 0)', () => {
  const { tmp, hopperDir } = makeHopper();
  try {
    const outputMdPath = seedInProgress(hopperDir, 'T-CLI-STOP');
    const r = runCli(['--stop', 'T-CLI-STOP'], hopperDir);
    assert.equal(r.exitCode, 0, r.stderr);
    assert.match(r.stdout, /=== STOPPED T-CLI-STOP ===/);
    assert.match(r.stdout, /Status:\s+cancelled/);
    assert.equal(readFrontmatter(outputMdPath).status, 'cancelled');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('HOPPER-6: --stop on an already-terminal job exits 0 with a note', () => {
  const { tmp, hopperDir } = makeHopper();
  try {
    seedInProgress(hopperDir, 'T-CLI-DONE', { status: 'done' });
    const r = runCli(['--stop', 'T-CLI-DONE'], hopperDir);
    assert.equal(r.exitCode, 0);
    assert.match(r.stdout, /already terminal/i);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('HOPPER-6: --stop on a missing task exits 1', () => {
  const { tmp, hopperDir } = makeHopper();
  try {
    const r = runCli(['--stop', 'T-MISSING'], hopperDir);
    assert.equal(r.exitCode, 1);
    assert.match(r.stderr, /no output file/i);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('HOPPER-6: --stop without a task-id exits 2', () => {
  const { tmp, hopperDir } = makeHopper();
  try {
    const r = runCli(['--stop'], hopperDir);
    assert.equal(r.exitCode, 2);
    assert.match(r.stderr, /--stop requires a task-id/i);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
