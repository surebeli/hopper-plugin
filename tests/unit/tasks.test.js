// Unit tests for tasks.js (T-PLUGIN-03)
// Anchor: tests/unit/tasks.test.js

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { verifyFrameAntiPersona, composePrompt, loadTaskFrame, listTaskTypes, EXECUTION_MODE_GUARDRAIL } from '../../cli/src/tasks.js';
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

test('composePrompt leads with the execution guardrail, then frame + spec', () => {
  const frame = '# Frame\nDo X.';
  const spec = 'Task: build Y.';
  const out = composePrompt(frame, spec);
  // Locked shape: guardrail, ---, frame, ---, ## Task spec, spec, trailing newline.
  assert.equal(out, `${EXECUTION_MODE_GUARDRAIL}\n\n---\n\n# Frame\nDo X.\n\n---\n\n## Task spec\n\nTask: build Y.\n`);
});

test('composePrompt with governance: guardrail, then constitution then overlay, then frame + spec', () => {
  const frame = '# Frame\nDo X.';
  const spec = 'Task: build Y.';
  const out = composePrompt(frame, spec, {
    governance: { constitution: 'CONSTITUTION TEXT', overlay: 'OVERLAY TEXT' },
  });
  assert.equal(
    out,
    `${EXECUTION_MODE_GUARDRAIL}\n\n---\n\nCONSTITUTION TEXT\n\n---\n\nOVERLAY TEXT\n\n---\n\n# Frame\nDo X.\n\n---\n\n## Task spec\n\nTask: build Y.\n`
  );
});

test('composePrompt with constitution but empty overlay omits the overlay block (guardrail still leads)', () => {
  const out = composePrompt('F', 'S', { governance: { constitution: 'C', overlay: '' } });
  assert.equal(out, `${EXECUTION_MODE_GUARDRAIL}\n\n---\n\nC\n\n---\n\nF\n\n---\n\n## Task spec\n\nS\n`);
});

test('composePrompt with governance null still leads with the guardrail', () => {
  const out = composePrompt('F', 'S', { governance: null });
  assert.equal(out, `${EXECUTION_MODE_GUARDRAIL}\n\n---\n\nF\n\n---\n\n## Task spec\n\nS\n`);
});

test('EXECUTION_MODE_GUARDRAIL: leads the handoff and forbids orchestration / re-dispatch / clarifying questions', () => {
  const g = EXECUTION_MODE_GUARDRAIL.toLowerCase();
  assert.match(g, /do not re-?dispatch|delegate/, 'forbids re-dispatch/delegation');
  assert.match(g, /skill\.md|orchestrat|superpowers/, 'forbids adopting local orchestration skills');
  assert.match(g, /do not ask|clarifying question|no reply will come/, 'forbids clarifying questions');
  assert.match(g, /execut/, 'pins the executor role');
  // Must be the very first block (vendor reads top-down before wandering into local files).
  const out = composePrompt('FRAME', 'SPEC', { governance: { constitution: 'C', overlay: 'O' } });
  assert.ok(out.startsWith(EXECUTION_MODE_GUARDRAIL), 'guardrail must lead the composed handoff');
});
