// Schema validation tests (codex final strict audit P1 — Category A)
// Anchor: tests/unit/schema-validation.test.js
//
// Per audit finding: previously `output.js` suggested `failure-detected` as a
// queue status, but the .hopper/queue.md schema only allows {pending,
// in-progress, done, failed, removed}. The parser mapped unknown statuses to
// `pending`, which re-eligibilized failed tasks. These tests lock down the
// schema-status contract end-to-end.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  LEGAL_QUEUE_STATUSES,
  isLegalQueueStatus,
  TASK_TYPE_PATTERN,
  validateTaskType,
} from '../../cli/src/validation.js';
import { mapDispatchStatusToQueueStatus } from '../../cli/src/output.js';
import { loadTaskFrame } from '../../cli/src/tasks.js';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ─── Queue status contract ────────────────────────────────────────────

test('LEGAL_QUEUE_STATUSES enumerates exactly the 5 spec-allowed values', () => {
  assert.deepEqual(
    [...LEGAL_QUEUE_STATUSES].sort(),
    ['done', 'failed', 'in-progress', 'pending', 'removed'],
  );
});

test('mapDispatchStatusToQueueStatus always returns a LEGAL queue status', () => {
  for (const dispatchStatus of ['success', 'auth-fail', 'timeout', 'permission-fail', 'unknown-fail', 'foo-bar']) {
    const mapped = mapDispatchStatusToQueueStatus(dispatchStatus);
    assert.ok(isLegalQueueStatus(mapped),
      `mapDispatchStatusToQueueStatus("${dispatchStatus}") returned "${mapped}" which is NOT a legal queue status. Legal: ${LEGAL_QUEUE_STATUSES.join(', ')}.`);
  }
});

test('mapDispatchStatusToQueueStatus: success → done', () => {
  assert.equal(mapDispatchStatusToQueueStatus('success'), 'done');
});

test('mapDispatchStatusToQueueStatus: every failure → "failed" (not "failure-detected")', () => {
  // Per audit P1: previous mapping was "failure-detected" which is illegal.
  for (const s of ['auth-fail', 'timeout', 'permission-fail', 'unknown-fail']) {
    assert.equal(mapDispatchStatusToQueueStatus(s), 'failed',
      `failure status "${s}" must map to legal "failed" (not "failure-detected")`);
  }
});

// ─── task-type validation ─────────────────────────────────────────────

test('TASK_TYPE_PATTERN accepts canonical kebab-case names', () => {
  for (const t of ['code-impl', 'spec-write', 'code-review-adversarial', 'sidecar-polish', 'spec-blindspot-hunt', 't1', 'abc-123']) {
    assert.ok(TASK_TYPE_PATTERN.test(t), `should accept "${t}"`);
  }
});

test('TASK_TYPE_PATTERN rejects path-traversal attempts', () => {
  for (const bad of ['../escape', 'foo/bar', 'foo\\bar', '..', '.', '../etc/passwd', 'a..b', 'UPPER', '', '1abc']) {
    assert.ok(!TASK_TYPE_PATTERN.test(bad), `should reject "${bad}"`);
  }
});

test('validateTaskType throws on path-traversal', () => {
  assert.throws(() => validateTaskType('../escape'));
  assert.throws(() => validateTaskType('foo/bar'));
  assert.throws(() => validateTaskType('a..b'), /\.\./);
});

test('validateTaskType throws on non-string', () => {
  for (const v of [null, undefined, 123, {}]) {
    assert.throws(() => validateTaskType(v));
  }
});

test('loadTaskFrame: rejects path-traversal taskType BEFORE any file read', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-tasktype-attack-'));
  try {
    const hopperDir = join(tmp, '.hopper');
    mkdirSync(join(hopperDir, 'tasks'), { recursive: true });
    // Plant a legitimate frame so we know the dir exists
    writeFileSync(join(hopperDir, 'tasks', 'safe.md'), '# safe frame');
    // Plant an "attack target" outside .hopper/tasks/ that we MUST NOT load
    writeFileSync(join(tmp, 'secret.md'), 'sensitive content');

    // Try several attacks
    for (const evil of ['../secret', '../../secret', '..\\secret', '/etc/passwd']) {
      await assert.rejects(
        loadTaskFrame(hopperDir, evil),
        /unsafe|path traversal|task-type/i,
        `loadTaskFrame must reject "${evil}"`
      );
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('loadTaskFrame: accepts canonical task-type', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-tasktype-ok-'));
  try {
    const hopperDir = join(tmp, '.hopper');
    mkdirSync(join(hopperDir, 'tasks'), { recursive: true });
    writeFileSync(join(hopperDir, 'tasks', 'code-impl.md'), '# code-impl frame\n\nSome body.');

    const content = await loadTaskFrame(hopperDir, 'code-impl');
    assert.match(content, /code-impl frame/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
