import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const TOOL = resolve('tools/dogfood-snapshot.mjs');

function setup() {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-dogfood-snapshot-'));
  const hopperDir = join(tmp, '.hopper');
  mkdirSync(join(hopperDir, 'handoffs'), { recursive: true });
  return { tmp, hopperDir };
}

function writeOutput(hopperDir, taskId, fields, body = '') {
  const merged = fields.progress_log === null ? fields : { progress_log: `${taskId}-progress.log`, ...fields };
  const lines = ['---', ...Object.entries(merged).filter(([, value]) => value !== null).map(([key, value]) => `${key}: ${value}`), '---', body];
  writeFileSync(join(hopperDir, 'handoffs', `${taskId}-output.md`), lines.join('\n'), 'utf-8');
}

function writeProgress(hopperDir, taskId, content) {
  writeFileSync(join(hopperDir, 'handoffs', `${taskId}-progress.log`), content, 'utf-8');
}

function runSnapshot({ hopperDir, args = [], cwd = process.cwd() }) {
  const env = hopperDir === undefined ? process.env : { ...process.env, HOPPER_DIR: hopperDir };
  const result = spawnSync(process.execPath, [TOOL, ...args], { cwd, env, encoding: 'utf-8' });
  assert.equal(result.status, 0, result.stderr);
  return { result, json: JSON.parse(result.stdout) };
}

test('snapshot reports blocker signals from mixed telemetry fixture', () => {
  const { tmp, hopperDir } = setup();
  try {
    writeOutput(hopperDir, 'T-CODEX', { task_id: 'T-CODEX', adapter: 'codex', status: 'done', terminal_event_emitted: true });
    writeProgress(hopperDir, 'T-CODEX', '{"seq":1,"terminal":true}\n');
    writeOutput(hopperDir, 'T-KIMI', { task_id: 'T-KIMI', adapter: 'kimi', status: 'orphaned' });
    writeProgress(hopperDir, 'T-KIMI', '{"seq":1}\n');
    writeOutput(hopperDir, 'T-OPEN', { task_id: 'T-OPEN', adapter: 'opencode', status: 'done', terminal_event_emitted: true });
    writeProgress(hopperDir, 'T-OPEN', '');

    const { json } = runSnapshot({ hopperDir });
    assert.equal(json.totals.tasks, 3);
    assert.equal(json.totals.by_vendor.codex, 1);
    assert.equal(json.totals.by_vendor.kimi, 1);
    assert.equal(json.totals.by_vendor.opencode, 1);
    assert.equal(json.totals.tasks_v1_aware, 3);
    assert.equal(json.signals.partial_write_orphans, 1);
    assert.equal(json.signals.non_codex_no_terminal, 1);
    assert.equal(json.signals.empty_progress_log_with_done, 1);
    assert.equal(json.blocker, true);
    assert.match(json.blocker_reasons[0], /T-OPEN/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('snapshot stays clean for terminal-emitted done tasks without rotate', () => {
  const { tmp, hopperDir } = setup();
  try {
    for (const [taskId, adapter] of [['T-CODEX', 'codex'], ['T-KIMI', 'kimi']]) {
      writeOutput(hopperDir, taskId, { task_id: taskId, adapter, status: 'done', terminal_event_emitted: true });
      writeProgress(hopperDir, taskId, '{"seq":1,"terminal":true}\n');
    }
    const { json } = runSnapshot({ hopperDir });
    assert.equal(json.blocker, false);
    assert.deepEqual(json.signals, {
      partial_write_orphans: 0,
      rotate_triggered: 0,
      non_codex_no_terminal: 0,
      empty_progress_log_with_done: 0,
    });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('--append writes Markdown entry with vendor counts', () => {
  const { tmp, hopperDir } = setup();
  try {
    writeOutput(hopperDir, 'T-CODEX', { task_id: 'T-CODEX', adapter: 'codex', status: 'done', terminal_event_emitted: true });
    writeProgress(hopperDir, 'T-CODEX', '{"seq":1,"terminal":true}\n');
    const out = join(tmp, 'snapshot.md');
    runSnapshot({ hopperDir, args: ['--append', out] });
    const markdown = readFileSync(out, 'utf-8');
    assert.match(markdown, /## Snapshot /);
    assert.match(markdown, /Total tasks: 1 \(codex: 1, kimi: 0, opencode: 0, copilot: 0, agy: 0, grok: 0, unknown: 0\)/);
    assert.match(markdown, /Empty progress\.log w\/ done: 0/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('heterogeneity: host_native vs adapter classifies het/hom/host-unknown and computes rate', () => {
  const { tmp, hopperDir } = setup();
  try {
    // heterogeneous: dispatched from a codex host to a kimi vendor
    writeOutput(hopperDir, 'T-HET', { task_id: 'T-HET', adapter: 'kimi', status: 'done', terminal_event_emitted: true, host_native: 'codex' });
    writeProgress(hopperDir, 'T-HET', '{"seq":1,"terminal":true}\n');
    // homogeneous: opencode host dispatching to opencode vendor
    writeOutput(hopperDir, 'T-HOM', { task_id: 'T-HOM', adapter: 'opencode', status: 'done', terminal_event_emitted: true, host_native: 'opencode' });
    writeProgress(hopperDir, 'T-HOM', '{"seq":1,"terminal":true}\n');
    // host-unknown: standalone CLI, no host_native (omitted)
    writeOutput(hopperDir, 'T-STD', { task_id: 'T-STD', adapter: 'codex', status: 'done', terminal_event_emitted: true });
    writeProgress(hopperDir, 'T-STD', '{"seq":1,"terminal":true}\n');

    const { json } = runSnapshot({ hopperDir });
    assert.equal(json.heterogeneity.heterogeneous, 1);
    assert.equal(json.heterogeneity.homogeneous, 1);
    assert.equal(json.heterogeneity.host_unknown, 1);
    assert.equal(json.heterogeneity.rate, 0.5, 'rate = het / (het + hom); host-unknown excluded from denominator');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('heterogeneity: rate is null when no host-tagged tasks exist', () => {
  const { tmp, hopperDir } = setup();
  try {
    writeOutput(hopperDir, 'T-STD', { task_id: 'T-STD', adapter: 'codex', status: 'done', terminal_event_emitted: true });
    writeProgress(hopperDir, 'T-STD', '{"seq":1,"terminal":true}\n');
    const { json } = runSnapshot({ hopperDir });
    assert.equal(json.heterogeneity.rate, null);
    assert.equal(json.heterogeneity.host_unknown, 1);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('heterogeneity: host_native literal "null" counts as host-unknown', () => {
  const { tmp, hopperDir } = setup();
  try {
    // background.js writes host_native: null literally when HOPPER_HOST_VENDOR unset
    writeOutput(hopperDir, 'T-NULL', { task_id: 'T-NULL', adapter: 'codex', status: 'done', terminal_event_emitted: true, host_native: 'null' });
    writeProgress(hopperDir, 'T-NULL', '{"seq":1,"terminal":true}\n');
    const { json } = runSnapshot({ hopperDir });
    assert.equal(json.heterogeneity.host_unknown, 1);
    assert.equal(json.heterogeneity.heterogeneous, 0);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('pre-v1.0 tasks stay visible in totals but do not trigger signals', () => {
  const { tmp, hopperDir } = setup();
  try {
    writeOutput(hopperDir, 'T-OLD', { task_id: 'T-OLD', adapter: 'copilot', status: 'done', progress_log: null });
    writeOutput(hopperDir, 'T-V1', { task_id: 'T-V1', adapter: 'opencode', status: 'done', terminal_event_emitted: true });
    writeProgress(hopperDir, 'T-V1', '');
    const { json } = runSnapshot({ hopperDir });
    assert.equal(json.totals.tasks, 2);
    assert.equal(json.totals.tasks_v1_aware, 1);
    assert.equal(json.totals.by_vendor.copilot, 1);
    assert.equal(json.signals.non_codex_no_terminal, 0);
    assert.equal(json.signals.empty_progress_log_with_done, 1);
    assert.deepEqual(json.blocker_reasons, ['T-V1: status=done but progress.log is missing or empty']);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('corrupt frontmatter is graceful and counted as unknown vendor', () => {
  const { tmp, hopperDir } = setup();
  try {
    writeFileSync(join(hopperDir, 'handoffs', 'T-BAD-output.md'), 'adapter: codex\nstatus: done\n', 'utf-8');
    const { json } = runSnapshot({ hopperDir });
    assert.equal(json.totals.tasks, 1);
    assert.equal(json.totals.by_vendor.unknown, 1);
    assert.equal(json.blocker, false);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('missing .hopper still outputs zero snapshot', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-dogfood-missing-'));
  try {
    const { json } = runSnapshot({ hopperDir: join(tmp, '.hopper-missing') });
    assert.equal(json.hopper_dir, 'not found');
    assert.equal(json.totals.tasks, 0);
    assert.equal(json.signals.empty_progress_log_with_done, 0);
    assert.equal(json.blocker, false);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
