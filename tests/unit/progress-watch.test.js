// Progress watcher CLI tests for hopper-dispatch --watch-events.
// Anchor: tests/unit/progress-watch.test.js

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

import { readFrontmatter, writeFrontmatter } from '../../cli/src/background.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..', '..');
const DISPATCH = join(REPO_ROOT, 'cli', 'bin', 'hopper-dispatch');

function setup() {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-progress-watch-'));
  const hopperDir = join(tmp, '.hopper');
  mkdirSync(join(hopperDir, 'handoffs'), { recursive: true });
  return { tmp, hopperDir };
}

function outputPath(hopperDir, taskId) {
  return join(hopperDir, 'handoffs', `${taskId}-output.md`);
}

function writeTask(hopperDir, taskId, overrides = {}) {
  const path = outputPath(hopperDir, taskId);
  writeFrontmatter(path, {
    task_id: taskId,
    adapter: 'codex',
    status: 'in-progress',
    phase: 'running',
    start_time: '2026-05-22T01:00:00.000Z',
    last_progress: 'running',
    progress_seq: 0,
    progress_log: `./${taskId}-progress.log`,
    raw_log: `./${taskId}-output.log`,
    terminal_event_emitted: false,
    mode: 'background',
    _body: '',
    ...overrides,
  });
  return path;
}

function markTerminal(hopperDir, taskId, status = 'done', seq = 1) {
  const path = outputPath(hopperDir, taskId);
  const fm = readFrontmatter(path);
  writeFrontmatter(path, {
    ...fm,
    status,
    phase: status,
    end_time: '2026-05-22T01:01:00.000Z',
    duration_ms: 60000,
    last_progress: `Task ${status}.`,
    last_progress_at: '2026-05-22T01:01:00.000Z',
    progress_seq: seq,
    terminal_event_emitted: true,
    _body: fm._body || '',
  });
}

function spawnWatchEvents(hopperDir, args = ['--watch-events', '--once']) {
  const child = spawn(process.execPath, [DISPATCH, ...args], {
    env: { ...process.env, HOPPER_DIR: hopperDir },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.setEncoding('utf-8');
  child.stderr.setEncoding('utf-8');

  const lines = [];
  let stdoutBuffer = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk;
    let nl = stdoutBuffer.indexOf('\n');
    while (nl !== -1) {
      const line = stdoutBuffer.slice(0, nl).trim();
      if (line) lines.push(line);
      stdoutBuffer = stdoutBuffer.slice(nl + 1);
      nl = stdoutBuffer.indexOf('\n');
    }
  });
  child.stderr.on('data', (chunk) => { stderr += chunk; });

  return {
    child,
    lines,
    stderr: () => stderr,
  };
}

async function waitFor(predicate, describe, timeoutMs = 6000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = predicate();
    if (value) return value;
    await delay(25);
  }
  throw new Error(`Timed out waiting for ${describe}`);
}

async function waitForExit(child, timeoutMs = 6000) {
  if (child.exitCode !== null) return child.exitCode;
  return await Promise.race([
    new Promise((resolve) => child.once('exit', (code) => resolve(code))),
    delay(timeoutMs).then(() => {
      throw new Error('Timed out waiting for watcher exit');
    }),
  ]);
}

function stop(child) {
  if (child.exitCode === null && !child.killed) child.kill();
}

test('two --watch-events subscribers both receive terminal event JSONL', async () => {
  const { tmp, hopperDir } = setup();
  const taskId = 'T-WATCH-TWO';
  let first;
  let second;
  try {
    writeTask(hopperDir, taskId);
    first = spawnWatchEvents(hopperDir);
    second = spawnWatchEvents(hopperDir);

    await delay(800);
    markTerminal(hopperDir, taskId, 'done', 1);

    const firstLine = await waitFor(() => first.lines[0], 'first watcher line');
    const secondLine = await waitFor(() => second.lines[0], 'second watcher line');
    const firstEvent = JSON.parse(firstLine);
    const secondEvent = JSON.parse(secondLine);

    for (const event of [firstEvent, secondEvent]) {
      assert.equal(event.type, 'hopper.task.terminal');
      assert.equal(event.task_id, taskId);
      assert.equal(event.status, 'done');
      assert.equal(event.phase, 'done');
      assert.equal(event.vendor, 'codex');
      assert.equal(event.seq, 1);
      assert.match(event.output_md, /T-WATCH-TWO-output\.md$/);
      assert.match(event.progress_log, /T-WATCH-TWO-progress\.log$/);
      assert.match(event.raw_log, /T-WATCH-TWO-output\.log$/);
    }
    assert.equal(await waitForExit(first.child), 0, first.stderr());
    assert.equal(await waitForExit(second.child), 0, second.stderr());
  } finally {
    if (first) stop(first.child);
    if (second) stop(second.child);
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('single --watch-events subscriber does not duplicate one terminal event', async () => {
  const { tmp, hopperDir } = setup();
  const taskId = 'T-WATCH-DEDUP';
  let watcher;
  try {
    writeTask(hopperDir, taskId);
    watcher = spawnWatchEvents(hopperDir, ['--watch-events']);

    await delay(800);
    markTerminal(hopperDir, taskId, 'failed', 7);
    await waitFor(() => watcher.lines[0], 'first terminal line');

    markTerminal(hopperDir, taskId, 'failed', 7);
    await delay(1200);

    assert.equal(watcher.lines.length, 1, watcher.lines.join('\n'));
    const event = JSON.parse(watcher.lines[0]);
    assert.equal(event.status, 'failed');
    assert.equal(event.seq, 7);
  } finally {
    if (watcher) stop(watcher.child);
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('--watch-events --once exits after first terminal event from atomic frontmatter write', async () => {
  const { tmp, hopperDir } = setup();
  const taskId = 'T-WATCH-ONCE';
  let watcher;
  try {
    writeTask(hopperDir, taskId);
    watcher = spawnWatchEvents(hopperDir);

    await delay(800);
    markTerminal(hopperDir, taskId, 'orphaned', 3);

    await waitFor(() => watcher.lines[0], 'once watcher line');
    assert.equal(await waitForExit(watcher.child), 0, watcher.stderr());
    assert.equal(watcher.lines.length, 1);
    assert.equal(JSON.parse(watcher.lines[0]).status, 'orphaned');
  } finally {
    if (watcher) stop(watcher.child);
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('--watch-events implementation uses fs.watchFile over output.md only', () => {
  const source = readFileSync(DISPATCH, 'utf-8');
  assert.match(source, /watchFile\(/);
  assert.doesNotMatch(source, /fs\.watch\(/);
  assert.doesNotMatch(source, /chokidar/i);
  assert.doesNotMatch(source, /watchFile\([^)]*progress/i);
});
