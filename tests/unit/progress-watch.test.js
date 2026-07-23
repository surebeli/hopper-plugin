// Progress watcher CLI tests for hopper-dispatch --watch-events.
// Anchor: tests/unit/progress-watch.test.js

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
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

function markTerminal(hopperDir, taskId, status = 'done', seq = 1, overrides = {}) {
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
    ...overrides,
  });
}

function spawnWatchEvents(hopperDir, args = ['--watch-events', '--once'], extraEnv = {}) {
  const child = spawn(process.execPath, [DISPATCH, ...args], {
    env: { ...process.env, HOPPER_NOTIFY: '0', HOPPER_DIR: hopperDir, ...extraEnv },
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

function createFakeNotifier(tmp, { exitCode = 0 } = {}) {
  const bin = join(tmp, 'fake-bin');
  mkdirSync(bin, { recursive: true });
  const recordPath = join(tmp, 'notify-record.jsonl');
  const helperPath = join(bin, 'fake-notifier.js');
  writeFileSync(helperPath, [
    "import { appendFileSync } from 'node:fs';",
    "const record = process.env.HOPPER_NOTIFY_RECORD;",
    "if (record) appendFileSync(record, `${JSON.stringify({ argv: process.argv.slice(2) })}\\n`, 'utf-8');",
    "process.exit(Number(process.env.HOPPER_FAKE_NOTIFY_EXIT || '0'));",
  ].join('\n'));

  if (process.platform === 'win32') {
    writeFileSync(join(bin, 'powershell.cmd'), `@echo off\r\n"${process.execPath}" "${helperPath}" %*\r\n`);
  } else {
    const command = process.platform === 'darwin' ? 'osascript' : 'notify-send';
    writeFileSync(join(bin, command), `#!/bin/sh\nexec "${process.execPath}" "${helperPath}" "$@"\n`);
    chmodSync(join(bin, command), 0o755);
  }

  return {
    recordPath,
    env: {
      HOPPER_NOTIFY: '1',
      HOPPER_NOTIFY_RECORD: recordPath,
      HOPPER_FAKE_NOTIFY_EXIT: String(exitCode),
      PATH: `${bin}${delimiter}${process.env.PATH || ''}`,
    },
  };
}

function readNotifyRecord(recordPath) {
  if (!existsSync(recordPath)) return [];
  return readFileSync(recordPath, 'utf-8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
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

test('--watch-events is a quiet no-op outside hopper workspaces', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-progress-watch-no-workspace-'));
  try {
    const env = { ...process.env, HOPPER_NOTIFY: '0' };
    delete env.HOPPER_DIR;

    const result = spawnSync(process.execPath, [DISPATCH, '--watch-events', '--once'], {
      cwd: tmp,
      env,
      encoding: 'utf-8',
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, '');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('--watch-events still reports an explicitly invalid HOPPER_DIR', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-progress-watch-bad-env-'));
  try {
    const result = spawnSync(process.execPath, [DISPATCH, '--watch-events', '--once'], {
      cwd: tmp,
      env: { ...process.env, HOPPER_NOTIFY: '0', HOPPER_DIR: join(tmp, 'missing-hopper') },
      encoding: 'utf-8',
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /no \.hopper\/ directory found/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('workspace-bound commands still fail outside hopper workspaces', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-progress-watch-status-no-workspace-'));
  try {
    const env = { ...process.env, HOPPER_NOTIFY: '0' };
    delete env.HOPPER_DIR;

    const result = spawnSync(process.execPath, [DISPATCH, '--status'], {
      cwd: tmp,
      env,
      encoding: 'utf-8',
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /no \.hopper\/ directory found/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

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
      assert.match(event.at, /^\d{4}-\d{2}-\d{2}T/);
      assert.deepEqual(Object.keys(event).sort(), ['adapter_diagnostic_code', 'at', 'phase', 'recovered_output', 'recovered_output_source', 'recovered_output_state', 'seq', 'status', 'task_id', 'type', 'vendor']);
      assert.equal(event.adapter_diagnostic_code, 'none');
      assert.equal(event.recovered_output, false);
      assert.equal(event.recovered_output_state, 'no-text');
      assert.equal(event.recovered_output_source, 'none');
    }
    assert.equal(await waitForExit(first.child), 0, first.stderr());
    assert.equal(await waitForExit(second.child), 0, second.stderr());
  } finally {
    if (first) stop(first.child);
    if (second) stop(second.child);
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('--watch-events forwards only the closed recovered-output projection', async () => {
  const { tmp, hopperDir } = setup();
  const taskId = 'T-WATCH-RECOVERED';
  const rawSentinel = 'WATCH_EVENTS_RAW_SECRET_C:\\private\\output.log';
  let watcher;
  try {
    writeTask(hopperDir, taskId);
    writeFileSync(join(hopperDir, 'handoffs', `${taskId}-output.log`), rawSentinel, 'utf-8');
    watcher = spawnWatchEvents(hopperDir);

    await delay(800);
    markTerminal(hopperDir, taskId, 'failed', 2, {
      recovered_output: true,
      recovered_output_state: 'unknown-completeness',
      recovered_output_source: 'event-stream',
    });

    const line = await waitFor(() => watcher.lines[0], 'recovered terminal JSONL');
    const event = JSON.parse(line);
    assert.equal(event.status, 'failed');
    assert.equal(event.recovered_output, true);
    assert.equal(event.recovered_output_state, 'unknown-completeness');
    assert.equal(event.recovered_output_source, 'event-stream');
    assert.doesNotMatch(JSON.stringify(event), new RegExp(rawSentinel));
    assert.doesNotMatch(JSON.stringify(event), /output\.log|terminalMarker|prompt/i);
    assert.equal(await waitForExit(watcher.child), 0, watcher.stderr());
  } finally {
    if (watcher) stop(watcher.child);
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

test('--watch-events baselines a pre-existing terminal backlog (no replay) but still emits NEW transitions', async () => {
  // Regression: a (re)started monitor must NOT re-fire the whole handoffs/ backlog each session
  // (the spam the Claude Code monitor produced). Tasks already terminal at start are baselined.
  const { tmp, hopperDir } = setup();
  let watcher;
  try {
    writeTask(hopperDir, 'T-OLD-1'); markTerminal(hopperDir, 'T-OLD-1', 'done', 1);
    writeTask(hopperDir, 'T-OLD-2'); markTerminal(hopperDir, 'T-OLD-2', 'failed', 3);

    watcher = spawnWatchEvents(hopperDir, ['--watch-events']);
    await delay(1200);
    assert.equal(watcher.lines.length, 0, `backlog must not be replayed; got: ${watcher.lines.join('\n')}`);

    // A NEW terminal transition after the watcher started MUST still emit (the watcher's real job).
    writeTask(hopperDir, 'T-NEW'); markTerminal(hopperDir, 'T-NEW', 'done', 1);
    const line = await waitFor(() => watcher.lines[0], 'new terminal line');
    assert.equal(JSON.parse(line).task_id, 'T-NEW');
    assert.equal(watcher.lines.length, 1);
  } finally {
    if (watcher) stop(watcher.child);
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('--watch-events --replay DOES emit the pre-existing terminal backlog (opt-in to the old behavior)', async () => {
  const { tmp, hopperDir } = setup();
  let watcher;
  try {
    writeTask(hopperDir, 'T-OLD-A'); markTerminal(hopperDir, 'T-OLD-A', 'done', 1);
    writeTask(hopperDir, 'T-OLD-B'); markTerminal(hopperDir, 'T-OLD-B', 'failed', 2);

    watcher = spawnWatchEvents(hopperDir, ['--watch-events', '--replay']);
    await waitFor(() => watcher.lines.length >= 2, 'replayed backlog');
    const ids = watcher.lines.map((l) => JSON.parse(l).task_id).sort();
    assert.deepEqual(ids, ['T-OLD-A', 'T-OLD-B']);
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

test('terminal event triggers one OS notify attempt', async () => {
  const { tmp, hopperDir } = setup();
  const taskId = 'T-WATCH-NOTIFY';
  const { runWatchEvents } = await import(pathToFileURL(DISPATCH).href);
  const lines = [];
  const notifications = [];
  let cleanup;
  try {
    writeTask(hopperDir, taskId);
    cleanup = runWatchEvents(hopperDir, {
      notifyFn: async (payload) => { notifications.push(payload); return { ok: true }; },
      writeLine: (line) => lines.push(line),
      exitFn: () => {},
    });

    await delay(800);
    markTerminal(hopperDir, taskId, 'done', 4);

    await waitFor(() => lines[0] && notifications.length === 1, 'terminal JSONL and notify call');

    assert.equal(JSON.parse(lines[0]).task_id, taskId);
    assert.equal(notifications[0].title, 'hopper: T-WATCH-NOTIFY');
    assert.match(notifications[0].message, /codex/);
    assert.match(notifications[0].message, /done/);

    markTerminal(hopperDir, taskId, 'done', 4);
    await delay(1200);
    assert.equal(notifications.length, 1);
  } finally {
    if (cleanup) cleanup();
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('notify failure does not block stdout JSONL output', async () => {
  const { tmp, hopperDir } = setup();
  const taskId = 'T-WATCH-NOTIFY-FAIL';
  const { runWatchEvents } = await import(pathToFileURL(DISPATCH).href);
  const lines = [];
  let exitCode = null;
  let cleanup;
  try {
    writeTask(hopperDir, taskId);
    cleanup = runWatchEvents(hopperDir, {
      once: true,
      notifyFn: async () => { throw new Error('notify boom'); },
      writeLine: (line) => lines.push(line),
      exitFn: (code) => { exitCode = code; },
    });

    await delay(800);
    markTerminal(hopperDir, taskId, 'failed', 5);

    const line = await waitFor(() => lines[0], 'terminal JSONL despite notify failure');
    assert.equal(JSON.parse(line).status, 'failed');
    await waitFor(() => exitCode === 0 ? true : null, 'watcher once cleanup');
    assert.equal(exitCode, 0);
  } finally {
    if (cleanup) cleanup();
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('HOPPER_NOTIFY=0 keeps watcher JSONL but skips notifier spawn', async () => {
  const { tmp, hopperDir } = setup();
  const taskId = 'T-WATCH-NOTIFY-OFF';
  const fake = createFakeNotifier(tmp);
  let watcher;
  try {
    writeTask(hopperDir, taskId);
    watcher = spawnWatchEvents(hopperDir, ['--watch-events', '--once'], {
      ...fake.env,
      HOPPER_NOTIFY: '0',
    });

    await delay(800);
    markTerminal(hopperDir, taskId, 'done', 6);

    const line = await waitFor(() => watcher.lines[0], 'terminal JSONL with notify disabled');
    assert.equal(JSON.parse(line).task_id, taskId);
    assert.equal(await waitForExit(watcher.child), 0, watcher.stderr());
    await delay(200);
    assert.deepEqual(readNotifyRecord(fake.recordPath), []);
  } finally {
    if (watcher) stop(watcher.child);
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('--watch renders only canonical status data and never raw log bytes', () => {
  const { tmp, hopperDir } = setup();
  const taskId = 'T-WATCH-NO-RAW';
  const rawSentinel = 'WATCH_RAW_SECRET_C:\\private\\output.log';
  try {
    writeTask(hopperDir, taskId, {
      status: 'failed', phase: 'failed', terminal_event_emitted: true,
      adapter_diagnostic_code: 'adapter-auth-failed',
    });
    writeFileSync(join(hopperDir, 'handoffs', `${taskId}-output.log`), rawSentinel, 'utf-8');
    const result = spawnSync(process.execPath, [DISPATCH, '--watch', taskId], {
      env: { ...process.env, HOPPER_NOTIFY: '0', HOPPER_DIR: hopperDir },
      encoding: 'utf-8', timeout: 2000,
    });
    assert.equal(result.status, 1, result.error?.message || result.stderr);
    assert.match(result.stdout, /Adapter diagnostic: adapter-auth-failed/);
    assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, new RegExp(rawSentinel));
    assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /output\.log/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('watch and watch-events use their distinct terminal predicates', async () => {
  const { isWatchTerminalFrontmatter, isWatchEventsTerminalFrontmatter } = await import(pathToFileURL(DISPATCH).href);
  for (const status of ['done', 'failed', 'timeout', 'cancelled', 'orphaned']) {
    assert.equal(isWatchTerminalFrontmatter({ status, terminal_event_emitted: true }), true, `${status} is terminal for --watch`);
    assert.equal(isWatchTerminalFrontmatter({ status, terminal_event_emitted: false }), true, `${status} legacy fallback exits --watch`);
    assert.equal(isWatchEventsTerminalFrontmatter({ status, terminal_event_emitted: true }), true, `${status} emits a watch event`);
    assert.equal(isWatchEventsTerminalFrontmatter({ status, terminal_event_emitted: false }), false, `${status} without event marker stays silent`);
  }
  for (const status of ['in-progress', 'unknown', '']) {
    assert.equal(isWatchTerminalFrontmatter({ status, terminal_event_emitted: true }), false, `${status} is not terminal for --watch`);
    assert.equal(isWatchEventsTerminalFrontmatter({ status, terminal_event_emitted: true }), false, `${status} is not terminal for --watch-events`);
  }

});

test('--watch exits for legacy terminal frontmatter without terminal_event_emitted', () => {
  const { tmp, hopperDir } = setup();
  const taskId = 'T-WATCH-LEGACY-TERMINAL';
  try {
    writeTask(hopperDir, taskId, {
      status: 'cancelled', phase: 'cancelled', terminal_event_emitted: false,
      duration_ms: 12, exit_code: null,
    });
    const result = spawnSync(process.execPath, [DISPATCH, '--watch', taskId], {
      env: { ...process.env, HOPPER_NOTIFY: '0', HOPPER_DIR: hopperDir },
      encoding: 'utf-8',
      timeout: 2000,
    });
    assert.equal(result.status, 1, result.error?.message || result.stderr);
    assert.match(result.stdout, /Status:\s+cancelled/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('--watch-events does not emit legacy terminal frontmatter without terminal_event_emitted', async () => {
  const { tmp, hopperDir } = setup();
  const taskId = 'T-WATCH-EVENTS-LEGACY';
  const { runWatchEvents } = await import(pathToFileURL(DISPATCH).href);
  const lines = [];
  let cleanup;
  try {
    writeTask(hopperDir, taskId, { status: 'failed', phase: 'failed', terminal_event_emitted: false });
    cleanup = runWatchEvents(hopperDir, {
      replay: true,
      notifyFn: async () => { throw new Error('legacy frontmatter must not notify'); },
      writeLine: (line) => lines.push(line),
      exitFn: () => {},
    });
    assert.deepEqual(lines, []);
  } finally {
    if (cleanup) cleanup();
    rmSync(tmp, { recursive: true, force: true });
  }
});
