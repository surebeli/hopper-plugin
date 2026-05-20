// Unit tests for queue.js (T-PLUGIN-02)
// Anchor: tests/unit/queue.test.js
//
// Uses Node's built-in test runner (node 18+). No external deps.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { parseQueueContent, findEligibleTask, summarizeQueue } from '../../cli/src/queue.js';

const SAMPLE_QUEUE_V2 = `
# Test queue

## Tasks

| ID | Task-type | Status | Depends | Priority | Brief |
|----|-----------|--------|---------|----------|-------|
| T-PLUGIN-00 | spec-blindspot-hunt | done | | high | Phase 0 spike |
| T-PLUGIN-01 | code-impl | pending | T-PLUGIN-00 | normal | Repo init |
| T-PLUGIN-02 | code-impl | in-progress | T-PLUGIN-01 | normal | Queue parser |
`;

const SAMPLE_QUEUE_V1_LEGACY = `
## Tasks

| ID | Role | Status | Depends | Brief |
|----|------|--------|---------|-------|
| T-OLD-01 | builder | done | | Old-school role-based task |
`;

test('parseQueueContent extracts v2 schema task rows', () => {
  const rows = parseQueueContent(SAMPLE_QUEUE_V2);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].id, 'T-PLUGIN-00');
  assert.equal(rows[0].taskType, 'spec-blindspot-hunt');
  assert.equal(rows[0].status, 'done');
  assert.equal(rows[1].id, 'T-PLUGIN-01');
  assert.equal(rows[1].status, 'pending');
  assert.deepEqual(rows[1].depends, ['T-PLUGIN-00']);
  assert.equal(rows[1].priority, 'normal');
});

test('parseQueueContent falls back to Role column if Task-type absent (v1 legacy)', () => {
  const rows = parseQueueContent(SAMPLE_QUEUE_V1_LEGACY);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'T-OLD-01');
  assert.equal(rows[0].taskType, 'builder'); // Fell back to Role since no Task-type
});

test('parseQueueContent treats Task-type as canonical when both present', () => {
  const both = `
| ID | Task-type | Role | Status | Depends | Brief |
|----|-----------|------|--------|---------|-------|
| T-X | code-impl | builder | pending | | Both columns |
`;
  const rows = parseQueueContent(both);
  assert.equal(rows[0].taskType, 'code-impl', 'Task-type should win over Role');
});

test('parseQueueContent ignores non-table content', () => {
  const noisy = `
# Some heading

Random prose. Should be ignored.

| ID | Task-type | Status | Depends | Brief |
|----|-----------|--------|---------|-------|
| T-A | code-impl | pending | | test |

More prose afterward.

## Activity log

- some log entry
`;
  const rows = parseQueueContent(noisy);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'T-A');
});

test('parseQueueContent defaults priority to normal if missing', () => {
  const noPrio = `
| ID | Task-type | Status | Depends | Brief |
|----|-----------|--------|---------|-------|
| T-A | code-impl | pending | | test |
`;
  const rows = parseQueueContent(noPrio);
  assert.equal(rows[0].priority, 'normal');
});

test('parseQueueContent parses comma-separated dependencies', () => {
  const q = `
| ID | Task-type | Status | Depends | Brief |
|----|-----------|--------|---------|-------|
| T-A | code-impl | pending | T-B, T-C, T-D | test |
`;
  const rows = parseQueueContent(q);
  assert.deepEqual(rows[0].depends, ['T-B', 'T-C', 'T-D']);
});

test('findEligibleTask returns task when pending + deps done', () => {
  const rows = parseQueueContent(SAMPLE_QUEUE_V2);
  const { task, reason } = findEligibleTask(rows, 'T-PLUGIN-01');
  assert.ok(task);
  assert.equal(task.id, 'T-PLUGIN-01');
  assert.equal(reason, null);
});

test('findEligibleTask rejects non-pending status', () => {
  const rows = parseQueueContent(SAMPLE_QUEUE_V2);
  const { task, reason } = findEligibleTask(rows, 'T-PLUGIN-00');
  assert.equal(task, null);
  assert.match(reason, /status is 'done'/);
});

test('findEligibleTask rejects in-progress status', () => {
  const rows = parseQueueContent(SAMPLE_QUEUE_V2);
  const { task, reason } = findEligibleTask(rows, 'T-PLUGIN-02');
  assert.equal(task, null);
  assert.match(reason, /status is 'in-progress'/);
});

test('findEligibleTask rejects when dep not done', () => {
  const q = `
| ID | Task-type | Status | Depends | Brief |
|----|-----------|--------|---------|-------|
| T-A | code-impl | pending | | A |
| T-B | code-impl | pending | T-A | B |
`;
  const rows = parseQueueContent(q);
  const { task, reason } = findEligibleTask(rows, 'T-B');
  assert.equal(task, null);
  assert.match(reason, /dependency T-A status is 'pending'/);
});

test('findEligibleTask returns clear error for unknown task', () => {
  const rows = parseQueueContent(SAMPLE_QUEUE_V2);
  const { task, reason } = findEligibleTask(rows, 'T-NONEXISTENT');
  assert.equal(task, null);
  assert.match(reason, /not found in queue/);
});

test('summarizeQueue counts by status', () => {
  const rows = parseQueueContent(SAMPLE_QUEUE_V2);
  const s = summarizeQueue(rows);
  assert.equal(s.total, 3);
  assert.equal(s.done, 1);
  assert.equal(s.pending, 1);
  assert.equal(s['in-progress'], 1);
});
