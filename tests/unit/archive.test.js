// Unit tests for handoff archival (cli/src/archive.js).
// Anchor: tests/unit/archive.test.js

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { planArchive, runArchive, findArchivedOutputMd, ARTIFACT_SUFFIXES } from '../../cli/src/archive.js';

function setup() {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-archive-'));
  const hopperDir = join(tmp, '.hopper');
  const handoffDir = join(hopperDir, 'handoffs');
  mkdirSync(handoffDir, { recursive: true });
  return { tmp, hopperDir, handoffDir };
}

// Write a task's full artifact set with the given frontmatter.
function mkTask(handoffDir, id, { status = 'done', pid = null, endTime = '2026-06-01T00:00:00.000Z', extras = ['-output.log', '-progress.log'] } = {}) {
  const fm = [
    '---',
    `task_id: ${id}`,
    'adapter: codex',
    `status: ${status}`,
    pid != null ? `pid: ${pid}` : 'pid: null',
    `end_time: "${endTime}"`,
    'terminal_event_emitted: true',
    '---',
    `# ${id}`,
    'body text',
  ].join('\n');
  writeFileSync(join(handoffDir, `${id}-output.md`), fm);
  for (const s of extras) writeFileSync(join(handoffDir, `${id}${s}`), `${id}${s} content`);
}

const NOW = Date.parse('2026-06-26T00:00:00.000Z');

test('planArchive: terminal tasks are eligible; pending/in-progress are skipped', () => {
  const { tmp, hopperDir, handoffDir } = setup();
  try {
    mkTask(handoffDir, 'T-DONE', { status: 'done' });
    mkTask(handoffDir, 'T-FAIL', { status: 'failed' });
    mkTask(handoffDir, 'T-RUNNING', { status: 'in-progress', pid: null });
    mkTask(handoffDir, 'T-PENDING', { status: 'pending' });
    const { eligible, skipped } = planArchive(hopperDir, { now: NOW, isAliveFn: () => false });
    assert.deepEqual(eligible.map((e) => e.taskId).sort(), ['T-DONE', 'T-FAIL']);
    const reasons = Object.fromEntries(skipped.map((s) => [s.taskId, s.reason]));
    assert.equal(reasons['T-RUNNING'], 'not-terminal');
    assert.equal(reasons['T-PENDING'], 'not-terminal');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test('planArchive: a task whose runner PID is ALIVE is never archived', () => {
  const { tmp, hopperDir, handoffDir } = setup();
  try {
    mkTask(handoffDir, 'T-ALIVE', { status: 'done', pid: 4242 });
    const { eligible, skipped } = planArchive(hopperDir, { now: NOW, isAliveFn: (p) => p === 4242 });
    assert.equal(eligible.length, 0);
    assert.equal(skipped.find((s) => s.taskId === 'T-ALIVE').reason, 'runner-alive');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test('planArchive: --older-than keeps recent terminal tasks, archives old ones', () => {
  const { tmp, hopperDir, handoffDir } = setup();
  try {
    mkTask(handoffDir, 'T-OLD', { status: 'done', endTime: '2026-06-01T00:00:00.000Z' });   // 25 days
    mkTask(handoffDir, 'T-RECENT', { status: 'done', endTime: '2026-06-25T00:00:00.000Z' }); // 1 day
    const { eligible, skipped } = planArchive(hopperDir, { olderThanDays: 7, now: NOW, isAliveFn: () => false });
    assert.deepEqual(eligible.map((e) => e.taskId), ['T-OLD']);
    assert.equal(skipped.find((s) => s.taskId === 'T-RECENT').reason, 'too-recent');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test('planArchive: --keep N retains the N most-recently-finished tasks', () => {
  const { tmp, hopperDir, handoffDir } = setup();
  try {
    mkTask(handoffDir, 'T-1', { endTime: '2026-06-01T00:00:00.000Z' });
    mkTask(handoffDir, 'T-2', { endTime: '2026-06-10T00:00:00.000Z' });
    mkTask(handoffDir, 'T-3', { endTime: '2026-06-20T00:00:00.000Z' });
    const { eligible } = planArchive(hopperDir, { keep: 1, now: NOW, isAliveFn: () => false });
    // keep the newest (T-3); archive the rest
    assert.deepEqual(eligible.map((e) => e.taskId).sort(), ['T-1', 'T-2']);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test('planArchive: --only-status filters to the named statuses', () => {
  const { tmp, hopperDir, handoffDir } = setup();
  try {
    mkTask(handoffDir, 'T-DONE', { status: 'done' });
    mkTask(handoffDir, 'T-FAIL', { status: 'failed' });
    const { eligible } = planArchive(hopperDir, { statuses: ['failed'], now: NOW, isAliveFn: () => false });
    assert.deepEqual(eligible.map((e) => e.taskId), ['T-FAIL']);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test('runArchive: moves the full artifact SET and never touches shared/non-task files', () => {
  const { tmp, hopperDir, handoffDir } = setup();
  try {
    mkTask(handoffDir, 'T-DONE', { status: 'done', extras: ['-output.log', '-progress.log', '-output-raw.txt', '-prompt.md'] });
    // shared files that must survive
    writeFileSync(join(handoffDir, 'leader-tasklist.md'), 'specs');
    writeFileSync(join(handoffDir, 'notes_vlreq-msg.txt'), 'misc');
    const res = runArchive(hopperDir, { now: NOW, isAliveFn: () => false, dateLabel: '2026-06-26' });
    assert.equal(res.archivedCount, 1);
    assert.equal(res.fileCount, 5);
    // moved out of handoffs/
    for (const s of ARTIFACT_SUFFIXES) assert.ok(!existsSync(join(handoffDir, `T-DONE${s}`)), `T-DONE${s} should be gone`);
    // present in archive
    for (const s of ARTIFACT_SUFFIXES) assert.ok(existsSync(join(hopperDir, 'archive', '2026-06-26', `T-DONE${s}`)), `T-DONE${s} archived`);
    // shared files untouched
    assert.ok(existsSync(join(handoffDir, 'leader-tasklist.md')));
    assert.ok(existsSync(join(handoffDir, 'notes_vlreq-msg.txt')));
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test('runArchive: id-prefix collision is impossible — each task sweeps ONLY its own set (T-1 vs T-10)', () => {
  const { tmp, hopperDir, handoffDir } = setup();
  try {
    mkTask(handoffDir, 'T-1', { status: 'done' });  // both terminal → both archived
    mkTask(handoffDir, 'T-10', { status: 'done' });
    const res = runArchive(hopperDir, { now: NOW, isAliveFn: () => false, dateLabel: '2026-06-26' });
    const t1 = res.moved.find((m) => m.taskId === 'T-1');
    // exact-suffix selection: T-1's set is all `T-1-*` and contains NO `T-10-*` file
    assert.ok(t1.files.length > 0 && t1.files.every((f) => f.startsWith('T-1-')), `T-1 set: ${t1.files}`);
    assert.ok(!t1.files.some((f) => f.startsWith('T-10-')), 'T-1 must not sweep T-10 files');
    for (const id of ['T-1', 'T-10']) {
      assert.ok(existsSync(join(hopperDir, 'archive', '2026-06-26', `${id}-output.md`)), `${id} archived`);
      assert.ok(!existsSync(join(handoffDir, `${id}-output.md`)), `${id} removed from handoffs`);
    }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test('runArchive: --keep N >= eligible count retains ALL (archives none) — does not wipe handoffs', () => {
  const { tmp, hopperDir, handoffDir } = setup();
  try {
    mkTask(handoffDir, 'T-1', { status: 'done' });
    mkTask(handoffDir, 'T-2', { status: 'done' });
    const res = runArchive(hopperDir, { keep: 5, now: NOW, isAliveFn: () => false, dateLabel: '2026-06-26' });
    assert.equal(res.archivedCount, 0, 'keep>=eligible must archive nothing');
    assert.ok(existsSync(join(handoffDir, 'T-1-output.md')) && existsSync(join(handoffDir, 'T-2-output.md')));
    assert.ok(!existsSync(join(hopperDir, 'archive')), 'no archive dir created when nothing archived');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test('runArchive: never overwrites a set already archived under the same date', () => {
  const { tmp, hopperDir, handoffDir } = setup();
  try {
    mkTask(handoffDir, 'T-1', { status: 'done' });
    runArchive(hopperDir, { now: NOW, isAliveFn: () => false, dateLabel: '2026-06-26' });
    // re-create the same id and archive again same day → must be skipped, archived copy preserved
    mkTask(handoffDir, 'T-1', { status: 'done', extras: ['-output.log'] });
    const res2 = runArchive(hopperDir, { now: NOW, isAliveFn: () => false, dateLabel: '2026-06-26' });
    assert.equal(res2.archivedCount, 0);
    assert.equal(res2.skipped.find((s) => s.taskId === 'T-1').reason, 'already-archived-today');
    assert.ok(existsSync(join(handoffDir, 'T-1-output.md')), 'the new copy stays in handoffs (not lost)');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test('runArchive --dry-run moves nothing', () => {
  const { tmp, hopperDir, handoffDir } = setup();
  try {
    mkTask(handoffDir, 'T-DONE', { status: 'done' });
    const res = runArchive(hopperDir, { dryRun: true, now: NOW, isAliveFn: () => false, dateLabel: '2026-06-26' });
    assert.equal(res.archivedCount, 1);
    assert.ok(existsSync(join(handoffDir, 'T-DONE-output.md')), 'dry-run must not move');
    assert.ok(!existsSync(join(hopperDir, 'archive')), 'dry-run must not create archive dir');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test('findArchivedOutputMd: locates an archived task (newest date dir first)', () => {
  const { tmp, hopperDir, handoffDir } = setup();
  try {
    mkTask(handoffDir, 'T-DONE', { status: 'done' });
    runArchive(hopperDir, { now: NOW, isAliveFn: () => false, dateLabel: '2026-06-26' });
    const found = findArchivedOutputMd(hopperDir, 'T-DONE');
    assert.ok(found, 'archived output.md must be found');
    assert.equal(found, join(hopperDir, 'archive', '2026-06-26', 'T-DONE-output.md'));
    assert.equal(findArchivedOutputMd(hopperDir, 'NOPE'), null);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});
