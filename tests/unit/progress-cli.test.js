// Progress CLI tests for hopper-dispatch --progress.
// Anchor: tests/unit/progress-cli.test.js

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { writeFrontmatter } from '../../cli/src/background.js';
import { appendProgressEvent } from '../../cli/src/progress.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..', '..');
const DISPATCH = join(REPO_ROOT, 'cli', 'bin', 'hopper-dispatch');

function setup() {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-progress-cli-'));
  const hopperDir = join(tmp, '.hopper');
  mkdirSync(join(hopperDir, 'handoffs'), { recursive: true });
  return { tmp, hopperDir };
}

function runProgress(hopperDir, taskId) {
  return spawnSync(process.execPath, [DISPATCH, '--progress', taskId], {
    env: { ...process.env, HOPPER_DIR: hopperDir },
    encoding: 'utf-8',
  });
}

function runResult(hopperDir, taskId) {
  return spawnSync(process.execPath, [DISPATCH, '--result', taskId], {
    env: { ...process.env, HOPPER_DIR: hopperDir },
    encoding: 'utf-8',
  });
}

function event(message, phase = 'running') {
  return {
    vendor: 'codex',
    phase,
    kind: 'finding',
    message,
    source: 'runner',
    terminal: false,
  };
}

test('--progress prints current phase, paths, and the last five progress events', () => {
  const { tmp, hopperDir } = setup();
  try {
    const taskId = 'T-PROGRESS-A';
    const outputPath = join(hopperDir, 'handoffs', `${taskId}-output.md`);
    writeFrontmatter(outputPath, {
      task_id: taskId,
      adapter: 'codex',
      status: 'in-progress',
      phase: 'running',
      pid: 123,
      start_time: new Date(Date.now() - 60_000).toISOString(),
      last_progress_at: '2026-05-22T01:02:03.000Z',
      last_progress: 'event 6',
      progress_seq: 6,
      progress_log: `./${taskId}-progress.log`,
      raw_log: `./${taskId}-output.log`,
      mode: 'background',
      _body: '',
    });

    for (let i = 1; i <= 6; i++) {
      appendProgressEvent({ hopperDir, taskId, event: event(`event ${i}`) });
    }

    const result = runProgress(hopperDir, taskId);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Task:\s+T-PROGRESS-A/);
    assert.match(result.stdout, /Status:\s+in-progress/);
    assert.match(result.stdout, /Phase:\s+running/);
    assert.match(result.stdout, /Last progress:\s+event 6/);
    assert.match(result.stdout, /Recent events/);
    assert.ok(!result.stdout.includes('event 1'), result.stdout);
    assert.match(result.stdout, /event 2/);
    assert.match(result.stdout, /event 6/);
    assert.match(result.stdout, /T-PROGRESS-A-output\.md/);
    assert.match(result.stdout, /T-PROGRESS-A-output\.log/);
    assert.match(result.stdout, /T-PROGRESS-A-progress\.log/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('--progress prints terminal event details for completed task', () => {
  const { tmp, hopperDir } = setup();
  try {
    const taskId = 'T-PROGRESS-DONE';
    const outputPath = join(hopperDir, 'handoffs', `${taskId}-output.md`);
    writeFrontmatter(outputPath, {
      task_id: taskId,
      adapter: 'codex',
      status: 'done',
      phase: 'done',
      start_time: '2026-05-22T01:00:00.000Z',
      end_time: '2026-05-22T01:02:00.000Z',
      duration_ms: 120000,
      exit_code: 0,
      last_progress: 'Task completed successfully.',
      progress_seq: 1,
      terminal_event_emitted: true,
      mode: 'background',
      _body: '',
    });
    appendProgressEvent({
      hopperDir,
      taskId,
      event: {
        vendor: 'codex',
        phase: 'done',
        kind: 'terminal',
        message: 'Task completed successfully.',
        source: 'runner',
        terminal: true,
        status: 'done',
        duration_ms: 120000,
        exit_code: 0,
        adapter_status: 'success',
      },
    });

    const result = runProgress(hopperDir, taskId);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Status:\s+done/);
    assert.match(result.stdout, /Terminal:\s+yes/);
    assert.match(result.stdout, /Task completed successfully\./);
    assert.match(result.stdout, /adapter_status=success/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('--progress exits 1 for missing task', () => {
  const { tmp, hopperDir } = setup();
  try {
    const result = runProgress(hopperDir, 'T-NO-SUCH');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /no output file/i);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('--progress exits 2 for invalid task id', () => {
  const { tmp, hopperDir } = setup();
  try {
    const result = runProgress(hopperDir, '../bad');
    assert.equal(result.status, 2);
    assert.match(result.stderr, /invalid|unsafe|path traversal|task.id/i);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('--progress and --result render the same event-first crash-window diagnosis', () => {
  const { tmp, hopperDir } = setup();
  try {
    const taskId = 'T-PROGRESS-CANONICAL';
    const outputPath = join(hopperDir, 'handoffs', `${taskId}-output.md`);
    writeFileSync(outputPath, `---\ntask_id: ${taskId}\nstatus: in-progress\n---\n# body\n`, 'utf-8');
    appendProgressEvent({
      hopperDir, taskId,
      event: { vendor: 'codex', phase: 'done', kind: 'terminal', message: 'event-first done', source: 'runner', terminal: true, status: 'done' },
    });
    const progress = runProgress(hopperDir, taskId);
    const result = runResult(hopperDir, taskId);
    assert.equal(progress.status, 0, progress.stderr);
    assert.match(progress.stdout, /Status:\s+finalizing/);
    assert.match(progress.stdout, /event-first done/);
    assert.match(result.stdout, /FINALIZING/);
    assert.match(result.stdout, /event-first done/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('--progress prints recent valid events even when the existing handoff has no frontmatter', () => {
  const { tmp, hopperDir } = setup();
  try {
    const taskId = 'T-PROGRESS-BAD-HANDOFF';
    writeFileSync(join(hopperDir, 'handoffs', `${taskId}-output.md`), 'broken handoff body\n', 'utf-8');
    appendProgressEvent({ hopperDir, taskId, event: event('still useful') });
    const result = runProgress(hopperDir, taskId);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Status:\s+unknown/);
    assert.match(result.stdout, /still useful/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
