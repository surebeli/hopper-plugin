// Background dispatch infrastructure tests (Phase 5a, spec v2.1.0 §14)
// Anchor: tests/unit/background.test.js
//
// Covers cli/src/background.js: frontmatter parser/writer, isAlive,
// hoursSince, preflightDispatch, listInProgressJobs, reapStaleJobs.
// spawnDetached itself is covered by tests/integration/background-e2e.test.js.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  readFrontmatter, writeFrontmatter,
  isAlive, hoursSince,
  preflightDispatch, listInProgressJobs, reapStaleJobs,
  ORPHAN_CEILING_HOURS,
} from '../../cli/src/background.js';
import { readProgressEvents } from '../../cli/src/progress.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function makeTmpHopper() {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-bg-'));
  const hopperDir = join(tmp, '.hopper');
  mkdirSync(join(hopperDir, 'handoffs'), { recursive: true });
  return { tmp, hopperDir };
}

// ─── readFrontmatter / writeFrontmatter ──────────────────────────────

test('readFrontmatter parses minimal valid frontmatter', () => {
  const { tmp } = makeTmpHopper();
  try {
    const path = join(tmp, 'x.md');
    writeFileSync(path, '---\ntask_id: T-X\nstatus: done\npid: 1234\n---\nBody here\n', 'utf-8');
    const fm = readFrontmatter(path);
    assert.equal(fm.task_id, 'T-X');
    assert.equal(fm.status, 'done');
    assert.equal(fm.pid, 1234);
    assert.equal(typeof fm.pid, 'number');
    assert.match(fm._body, /^Body here/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('readFrontmatter handles null / true / false / numbers', () => {
  const { tmp } = makeTmpHopper();
  try {
    const path = join(tmp, 'x.md');
    writeFileSync(path, '---\na: null\nb: true\nc: false\nd: 42\ne: ~\n---\n', 'utf-8');
    const fm = readFrontmatter(path);
    assert.equal(fm.a, null);
    assert.equal(fm.b, true);
    assert.equal(fm.c, false);
    assert.equal(fm.d, 42);
    assert.equal(fm.e, null);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('readFrontmatter handles quoted strings', () => {
  const { tmp } = makeTmpHopper();
  try {
    const path = join(tmp, 'x.md');
    writeFileSync(path, '---\nmsg: "hello: world"\nplain: hello\n---\n', 'utf-8');
    const fm = readFrontmatter(path);
    assert.equal(fm.msg, 'hello: world');
    assert.equal(fm.plain, 'hello');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('readFrontmatter returns _body=full text when no frontmatter', () => {
  const { tmp } = makeTmpHopper();
  try {
    const path = join(tmp, 'x.md');
    writeFileSync(path, 'just text\n', 'utf-8');
    const fm = readFrontmatter(path);
    assert.equal(fm._body, 'just text\n');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('readFrontmatter remains compatible with old background output without progress fields', () => {
  const { tmp } = makeTmpHopper();
  try {
    const path = join(tmp, 'x.md');
    writeFileSync(path, [
      '---',
      'task_id: T-old',
      'adapter: codex',
      'status: in-progress',
      'pid: 123',
      'mode: background',
      '---',
      '# old output',
      '',
    ].join('\n'), 'utf-8');

    const fm = readFrontmatter(path);
    assert.equal(fm.task_id, 'T-old');
    assert.equal(fm.status, 'in-progress');
    assert.equal(fm.last_progress_at, undefined);
    assert.equal(fm.last_progress, undefined);
    assert.equal(fm.progress_seq, undefined);
    assert.equal(fm.progress_log, undefined);
    assert.equal(fm.raw_log, undefined);
    assert.equal(fm.vendor_session_id, undefined);
    assert.equal(fm.terminal_event_emitted, undefined);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('writeFrontmatter writes atomically + roundtrips', () => {
  const { tmp } = makeTmpHopper();
  try {
    const path = join(tmp, 'x.md');
    const fm = {
      task_id: 'T-RT',
      status: 'in-progress',
      pid: 12345,
      start_time: '2026-05-21T12:00:00.000Z',
      _body: '# Body\n\nMore content\n',
    };
    writeFrontmatter(path, fm);
    const got = readFrontmatter(path);
    assert.equal(got.task_id, 'T-RT');
    assert.equal(got.status, 'in-progress');
    assert.equal(got.pid, 12345);
    assert.equal(got.start_time, '2026-05-21T12:00:00.000Z');
    assert.equal(got._body, '# Body\n\nMore content\n');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('writeFrontmatter quotes strings containing colons or special chars', () => {
  const { tmp } = makeTmpHopper();
  try {
    const path = join(tmp, 'x.md');
    writeFrontmatter(path, { msg: 'hello: world', _body: '' });
    const got = readFrontmatter(path);
    assert.equal(got.msg, 'hello: world');
    // Verify the raw file has quoted form
    const raw = readFileSync(path, 'utf-8');
    assert.match(raw, /msg: "hello: world"/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('writeFrontmatter no leftover tmp file', () => {
  const { tmp } = makeTmpHopper();
  try {
    const path = join(tmp, 'x.md');
    writeFrontmatter(path, { task_id: 'T-1', _body: '' });
    assert.ok(existsSync(path));
    assert.ok(!existsSync(path + '.tmp'));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ─── isAlive ──────────────────────────────────────────────────────────

test('isAlive returns true for self (process.pid)', () => {
  assert.ok(isAlive(process.pid));
});

test('isAlive returns false for null / undefined / 0 / -1', () => {
  assert.equal(isAlive(null), false);
  assert.equal(isAlive(undefined), false);
  assert.equal(isAlive(0), false);
  assert.equal(isAlive(-1), false);
});

test('isAlive returns false for a PID that almost certainly does not exist', () => {
  // PID 999999 is beyond typical max on macOS (~99999); on Linux/Windows may
  // technically exist but extremely unlikely. The point is the function
  // doesn't throw and returns a bool.
  const r = isAlive(999999);
  assert.equal(typeof r, 'boolean');
  assert.equal(r, false);
});

// ─── hoursSince ───────────────────────────────────────────────────────

test('hoursSince returns ~0 for current ISO timestamp', () => {
  const now = new Date().toISOString();
  const h = hoursSince(now);
  assert.ok(h >= 0 && h < 0.01, `expected ~0, got ${h}`);
});

test('hoursSince returns ~25 for a 25h-old timestamp', () => {
  const past = new Date(Date.now() - 25 * 3.6e6).toISOString();
  const h = hoursSince(past);
  assert.ok(h >= 24.9 && h <= 25.1, `expected ~25, got ${h}`);
});

test('hoursSince returns Infinity for null / undefined / invalid', () => {
  assert.equal(hoursSince(null), Infinity);
  assert.equal(hoursSince(undefined), Infinity);
  assert.equal(hoursSince('not-a-date'), Infinity);
});

// ─── preflightDispatch ───────────────────────────────────────────────

test('preflightDispatch ok when output.md does not exist', () => {
  const { tmp, hopperDir } = makeTmpHopper();
  try {
    const r = preflightDispatch(join(hopperDir, 'handoffs', 'T-new-output.md'));
    assert.equal(r.ok, true);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('preflightDispatch ok when status=done (overwrite OK)', () => {
  const { tmp, hopperDir } = makeTmpHopper();
  try {
    const path = join(hopperDir, 'handoffs', 'T-prev-output.md');
    writeFrontmatter(path, { task_id: 'T-prev', status: 'done', _body: '' });
    const r = preflightDispatch(path);
    assert.equal(r.ok, true);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('preflightDispatch REFUSES when status=in-progress + PID alive + age <24h', () => {
  const { tmp, hopperDir } = makeTmpHopper();
  try {
    const path = join(hopperDir, 'handoffs', 'T-running-output.md');
    writeFrontmatter(path, {
      task_id: 'T-running',
      status: 'in-progress',
      pid: process.pid,            // self → alive
      start_time: new Date().toISOString(),
      _body: '',
    });
    const r = preflightDispatch(path);
    assert.equal(r.ok, false);
    assert.match(r.reason, /already running/i);
    assert.match(r.reason, new RegExp(String(process.pid)));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('preflightDispatch re-classifies stale (>24h) in-progress as orphaned + allows dispatch', () => {
  const { tmp, hopperDir } = makeTmpHopper();
  try {
    const path = join(hopperDir, 'handoffs', 'T-stale-output.md');
    writeFrontmatter(path, {
      task_id: 'T-stale',
      status: 'in-progress',
      pid: process.pid,
      start_time: new Date(Date.now() - 25 * 3.6e6).toISOString(),  // 25h ago
      _body: '',
    });
    const r = preflightDispatch(path);
    assert.equal(r.ok, true);
    const fm = readFrontmatter(path);
    assert.equal(fm.status, 'orphaned', '25h-old in-progress must be reclassified');
    assert.equal(fm.phase, 'orphaned');
    assert.equal(fm.terminal_event_emitted, true);
    assert.equal(fm.progress_seq, 1);

    const events = readProgressEvents({ hopperDir, taskId: 'T-stale' });
    assert.equal(events.length, 1);
    assert.equal(events[0].terminal, true);
    assert.equal(events[0].kind, 'terminal');
    assert.equal(events[0].phase, 'orphaned');
    assert.equal(events[0].status, 'orphaned');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('preflightDispatch re-classifies in-progress + dead-PID as orphaned + allows dispatch', () => {
  const { tmp, hopperDir } = makeTmpHopper();
  try {
    const path = join(hopperDir, 'handoffs', 'T-deadpid-output.md');
    writeFrontmatter(path, {
      task_id: 'T-deadpid',
      status: 'in-progress',
      pid: 999999,                          // not alive
      start_time: new Date().toISOString(), // recent
      _body: '',
    });
    const r = preflightDispatch(path);
    assert.equal(r.ok, true);
    const fm = readFrontmatter(path);
    assert.equal(fm.status, 'orphaned');
    assert.equal(fm.phase, 'orphaned');
    assert.equal(fm.terminal_event_emitted, true);

    const events = readProgressEvents({ hopperDir, taskId: 'T-deadpid' });
    assert.equal(events.length, 1);
    assert.equal(events[0].terminal, true);
    assert.equal(events[0].status, 'orphaned');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ─── listInProgressJobs ───────────────────────────────────────────────

test('listInProgressJobs returns empty when no handoffs/', () => {
  const { tmp, hopperDir } = makeTmpHopper();
  try {
    rmSync(join(hopperDir, 'handoffs'), { recursive: true });
    assert.deepEqual(listInProgressJobs(hopperDir), []);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('listInProgressJobs filters by status=in-progress only', () => {
  const { tmp, hopperDir } = makeTmpHopper();
  try {
    const h = join(hopperDir, 'handoffs');
    writeFrontmatter(join(h, 'T-1-output.md'), {
      task_id: 'T-1', adapter: 'kimi', status: 'in-progress',
      pid: process.pid, start_time: new Date().toISOString(), _body: '',
    });
    writeFrontmatter(join(h, 'T-2-output.md'), {
      task_id: 'T-2', adapter: 'codex', status: 'done', _body: '',
    });
    writeFrontmatter(join(h, 'T-3-output.md'), {
      task_id: 'T-3', adapter: 'opencode', status: 'failed', _body: '',
    });

    const jobs = listInProgressJobs(hopperDir);
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].task_id, 'T-1');
    assert.equal(jobs[0].adapter, 'kimi');
    assert.equal(jobs[0].alive, true);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ─── reapStaleJobs ────────────────────────────────────────────────────

test('reapStaleJobs flips stale + dead-PID jobs to orphaned', () => {
  const { tmp, hopperDir } = makeTmpHopper();
  try {
    const h = join(hopperDir, 'handoffs');
    // Stale (25h old, alive pid)
    writeFrontmatter(join(h, 'T-stale-output.md'), {
      task_id: 'T-stale', adapter: 'kimi', status: 'in-progress',
      pid: process.pid, start_time: new Date(Date.now() - 25 * 3.6e6).toISOString(), _body: '',
    });
    // Dead PID, recent
    writeFrontmatter(join(h, 'T-dead-output.md'), {
      task_id: 'T-dead', adapter: 'codex', status: 'in-progress',
      pid: 999999, start_time: new Date().toISOString(), _body: '',
    });
    // Alive + recent → should NOT be reaped
    writeFrontmatter(join(h, 'T-fresh-output.md'), {
      task_id: 'T-fresh', adapter: 'opencode', status: 'in-progress',
      pid: process.pid, start_time: new Date().toISOString(), _body: '',
    });

    const reaped = reapStaleJobs(hopperDir);
    assert.deepEqual(reaped.sort(), ['T-dead', 'T-stale'].sort());

    assert.equal(readFrontmatter(join(h, 'T-stale-output.md')).status, 'orphaned');
    assert.equal(readFrontmatter(join(h, 'T-dead-output.md')).status, 'orphaned');
    assert.equal(readFrontmatter(join(h, 'T-fresh-output.md')).status, 'in-progress',
      'fresh + alive must not be reaped');

    for (const taskId of ['T-stale', 'T-dead']) {
      const events = readProgressEvents({ hopperDir, taskId });
      assert.equal(events.length, 1, `${taskId} must get one terminal event`);
      assert.equal(events[0].terminal, true);
      assert.equal(events[0].status, 'orphaned');
      assert.equal(readFrontmatter(join(h, `${taskId}-output.md`)).terminal_event_emitted, true);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('reapStaleJobs is idempotent for terminal orphan events', () => {
  const { tmp, hopperDir } = makeTmpHopper();
  try {
    const h = join(hopperDir, 'handoffs');
    writeFrontmatter(join(h, 'T-reap-once-output.md'), {
      task_id: 'T-reap-once',
      adapter: 'codex',
      status: 'in-progress',
      pid: 999999,
      start_time: new Date().toISOString(),
      _body: '',
    });

    assert.deepEqual(reapStaleJobs(hopperDir), ['T-reap-once']);
    assert.deepEqual(reapStaleJobs(hopperDir), []);

    const events = readProgressEvents({ hopperDir, taskId: 'T-reap-once' });
    assert.equal(events.length, 1);
    assert.equal(events[0].terminal, true);
    assert.equal(events[0].status, 'orphaned');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('reapStaleJobs returns empty when no in-progress jobs', () => {
  const { tmp, hopperDir } = makeTmpHopper();
  try {
    assert.deepEqual(reapStaleJobs(hopperDir), []);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('ORPHAN_CEILING_HOURS exported as 24', () => {
  assert.equal(ORPHAN_CEILING_HOURS, 24);
});
