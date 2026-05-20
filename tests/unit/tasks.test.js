// Unit tests for tasks.js (T-PLUGIN-03)
// Anchor: tests/unit/tasks.test.js

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { verifyFrameAntiPersona, composePrompt, loadTaskFrame, listTaskTypes } from '../../cli/src/tasks.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('verifyFrameAntiPersona accepts task-shape frame', () => {
  const frame = `
# Task-type: spec-write

## Purpose
Produce a written specification.

## Input shape
- Goal statement
- Prior context

## Output shape
Markdown spec with TDD acceptance.
`;
  const result = verifyFrameAntiPersona(frame);
  assert.ok(result.ok, `Expected ok, got hits: ${JSON.stringify(result.hits)}`);
  assert.equal(result.hits.length, 0);
});

test('verifyFrameAntiPersona rejects "you are a" persona', () => {
  const frame = 'You are a senior architect responsible for design.';
  const result = verifyFrameAntiPersona(frame);
  assert.equal(result.ok, false);
  assert.ok(result.hits.some((h) => /you are a/i.test(h)));
});

test('verifyFrameAntiPersona rejects "act as" persona', () => {
  const frame = 'Act as a code reviewer and find bugs.';
  const result = verifyFrameAntiPersona(frame);
  assert.equal(result.ok, false);
});

test('verifyFrameAntiPersona rejects "think like" persona', () => {
  const frame = 'Think like a security auditor when reviewing this.';
  const result = verifyFrameAntiPersona(frame);
  assert.equal(result.ok, false);
});

test('verifyFrameAntiPersona rejects "as the critic" identity assertion', () => {
  const frame = 'As the Critic, your job is to find problems.';
  const result = verifyFrameAntiPersona(frame);
  assert.equal(result.ok, false);
});

test('verifyFrameAntiPersona allows neutral verbs', () => {
  const frame = 'Review the changes. Find bugs. Be adversarial. Be thorough.';
  const result = verifyFrameAntiPersona(frame);
  assert.ok(result.ok);
});

test('composePrompt joins frame + spec with separator', () => {
  const frame = '# Frame\nDo X.';
  const spec = 'Task: build Y.';
  const out = composePrompt(frame, spec);
  assert.match(out, /Frame/);
  assert.match(out, /Task spec/);
  assert.match(out, /build Y/);
});

test('loadTaskFrame loads existing frame file', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-tasks-test-'));
  try {
    mkdirSync(join(tmp, 'tasks'));
    writeFileSync(join(tmp, 'tasks', 'demo-type.md'), '# Test frame\n\nContent here.');
    const content = await loadTaskFrame(tmp, 'demo-type');
    assert.match(content, /Test frame/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('loadTaskFrame throws on missing frame with helpful error', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-tasks-test-'));
  try {
    mkdirSync(join(tmp, 'tasks'));
    await assert.rejects(
      () => loadTaskFrame(tmp, 'missing-type'),
      /not found.*missing-type/,
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('loadTaskFrame throws on empty frame', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-tasks-test-'));
  try {
    mkdirSync(join(tmp, 'tasks'));
    writeFileSync(join(tmp, 'tasks', 'empty.md'), '   \n\n   ');
    await assert.rejects(() => loadTaskFrame(tmp, 'empty'), /empty/i);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('listTaskTypes returns sorted task-type names', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-tasks-test-'));
  try {
    mkdirSync(join(tmp, 'tasks'));
    writeFileSync(join(tmp, 'tasks', 'code-impl.md'), '# x');
    writeFileSync(join(tmp, 'tasks', 'spec-write.md'), '# y');
    writeFileSync(join(tmp, 'tasks', 'not-a-frame.txt'), 'ignore'); // .txt should be ignored
    const types = await listTaskTypes(tmp);
    assert.deepEqual(types.sort(), ['code-impl', 'spec-write']);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('listTaskTypes returns empty array if tasks dir missing', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-tasks-test-'));
  try {
    const types = await listTaskTypes(tmp);
    assert.deepEqual(types, []);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
