// Output.md writer tests (T-PLUGIN-06)
// Anchor: tests/unit/output-writer.test.js

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  writeOutput,
  renderOutputMarkdown,
  suggestQueueEdit,
  suggestCostEdit,
  mapDispatchStatusToQueueStatus,
} from '../../cli/src/output.js';
import { mkdtempSync, readFileSync, existsSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function makeDispatchResult(overrides = {}) {
  return {
    task: {
      id: 'T-PLUGIN-XX',
      taskType: 'code-impl',
      status: 'pending',
      depends: [],
      priority: 'normal',
      brief: 'Test brief.',
      vendor: null,
      ...(overrides.task || {}),
    },
    vendor: overrides.vendor || 'codex',
    output: {
      text: 'hello world',
      status: 'success',
      ...(overrides.output || {}),
    },
    raw: {
      exitCode: 0,
      stdout: 'hello world\n',
      stderr: '',
      timedOut: false,
      durationMs: 1234,
      ...(overrides.raw || {}),
    },
  };
}

test('renderOutputMarkdown: success case has all required sections', () => {
  const result = makeDispatchResult();
  const md = renderOutputMarkdown(result);
  assert.match(md, /^# T-PLUGIN-XX — code-impl Output \(codex\)$/m);
  assert.match(md, /## Summary/);
  assert.match(md, /## Vendor execution metadata/);
  assert.match(md, /## Output text/);
  assert.match(md, /## Acceptance verification/);
  assert.match(md, /## Suggested protocol edits/);
  assert.match(md, /## Open questions/);
  assert.match(md, /## Commit/);
  assert.match(md, /Status: \*\*success\*\* \[OK\]/);
  assert.match(md, /Duration: 1234ms/);
  assert.match(md, /Exit: 0/);
});

test('renderOutputMarkdown: failure case includes Error context section', () => {
  const result = makeDispatchResult({
    output: { text: '', status: 'auth-fail', error: 'kimi: HTTP 402 membership' },
    raw: { exitCode: 0, stdout: '', stderr: 'auth error from server', timedOut: false, durationMs: 500 },
  });
  const md = renderOutputMarkdown(result);
  assert.match(md, /Status: \*\*auth-fail\*\* \[FAIL\]/);
  assert.match(md, /## Error context/);
  assert.match(md, /kimi: HTTP 402 membership/);
  assert.match(md, /Stderr excerpt:/);
  assert.match(md, /auth error from server/);
});

test('renderOutputMarkdown: timed-out case is annotated', () => {
  const result = makeDispatchResult({
    output: { text: '', status: 'timeout', error: 'exceeded 300s' },
    raw: { exitCode: -1, stdout: '', stderr: '', timedOut: true, durationMs: 300000 },
  });
  const md = renderOutputMarkdown(result);
  assert.match(md, /\(TIMED OUT\)/);
});

test('renderOutputMarkdown: long output text is truncated with notice', () => {
  const longText = 'A'.repeat(5000);  // > 4096 truncation threshold
  const result = makeDispatchResult({ output: { text: longText, status: 'success' } });
  const md = renderOutputMarkdown(result);
  assert.match(md, /\[truncated, \d+ chars omitted\]/);
  // First 4096 chars should be present
  assert.ok(md.includes('A'.repeat(4096)));
  // Full 5000 chars should NOT be present
  assert.ok(!md.includes('A'.repeat(5000)));
});

test('renderOutputMarkdown: empty output text shows (empty) placeholder', () => {
  const result = makeDispatchResult({ output: { text: '', status: 'unknown-fail', error: 'nothing emitted' } });
  const md = renderOutputMarkdown(result);
  assert.match(md, /\(empty\)/);
});

test('mapDispatchStatusToQueueStatus: success → done', () => {
  assert.equal(mapDispatchStatusToQueueStatus('success'), 'done');
});

test('mapDispatchStatusToQueueStatus: every other status → failure-detected', () => {
  for (const status of ['auth-fail', 'timeout', 'permission-fail', 'unknown-fail']) {
    assert.equal(mapDispatchStatusToQueueStatus(status), 'failure-detected',
      `${status} should map to failure-detected`);
  }
});

test('suggestQueueEdit: includes task ID, both statuses, and handoff path', () => {
  const task = { id: 'T-99', status: 'pending', vendor: 'codex' };
  const edit = suggestQueueEdit(task, { status: 'success' });
  assert.match(edit, /T-99/);
  assert.match(edit, /'pending' -> 'done'/);
  assert.match(edit, /\.hopper\/handoffs\/T-99-output\.md/);
});

test('suggestQueueEdit: on failure maps to failure-detected', () => {
  const task = { id: 'T-99', status: 'pending', vendor: null };
  const edit = suggestQueueEdit(task, { status: 'auth-fail' });
  assert.match(edit, /'pending' -> 'failure-detected'/);
  assert.match(edit, /AGENTS\.md/, 'mentions AGENTS.md when task.vendor is null (resolved from)');
});

test('suggestCostEdit: produces a markdown table row', () => {
  const task = { id: 'T-42', taskType: 'code-review-adversarial' };
  const result = {
    output: { status: 'success', text: 'OK' },
    raw: { durationMs: 7500 },
  };
  const row = suggestCostEdit(task, 'kimi', result.output, result.raw);
  // Should be a single markdown table row
  assert.match(row, /^\|/);
  assert.match(row, /\|\s*T-42\s*\|/);
  assert.match(row, /\|\s*code-review-adversarial\s*\|/);
  assert.match(row, /\|\s*kimi\s*\|/);
  assert.match(row, /success/);
  assert.match(row, /7\.5s/);
});

test('suggestCostEdit: failure includes error excerpt', () => {
  const task = { id: 'T-42', taskType: 'code-impl' };
  const row = suggestCostEdit(task, 'agy',
    { status: 'auth-fail', error: 'agy is not OAuth-authed.\nFix it.' },
    { durationMs: 300 });
  assert.match(row, /auth-fail/);
  assert.match(row, /error=/);
  // Newlines in error should be replaced with spaces
  assert.ok(!row.includes('\n'), 'error excerpt must not introduce newlines into the row');
});

test('writeOutput: creates file at .hopper/handoffs/<task-id>-output.md', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-out-write-'));
  try {
    const hopperDir = join(tmp, '.hopper');
    mkdirSync(hopperDir, { recursive: true });

    const result = makeDispatchResult();
    const written = await writeOutput({ hopperDir, dispatchResult: result });

    assert.ok(existsSync(written.path), 'output.md file must exist');
    assert.equal(written.overwritten, false);
    const content = readFileSync(written.path, 'utf-8');
    assert.match(content, /^# T-PLUGIN-XX/);

    // Returned edits should be non-empty strings
    assert.ok(written.queueEdit.length > 20);
    assert.ok(written.costEdit.length > 20);
    assert.match(written.queueEdit, /T-PLUGIN-XX/);
    assert.match(written.costEdit, /^\|/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('writeOutput: refuses to overwrite without force=true', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-out-noforce-'));
  try {
    const hopperDir = join(tmp, '.hopper');
    const handoffs = join(hopperDir, 'handoffs');
    mkdirSync(handoffs, { recursive: true });
    writeFileSync(join(handoffs, 'T-PLUGIN-XX-output.md'), 'PRE-EXISTING', 'utf-8');

    const result = makeDispatchResult();
    await assert.rejects(
      writeOutput({ hopperDir, dispatchResult: result }),
      /already exists/,
      'must reject when file exists and force not set'
    );

    // Verify file was NOT overwritten
    const content = readFileSync(join(handoffs, 'T-PLUGIN-XX-output.md'), 'utf-8');
    assert.equal(content, 'PRE-EXISTING');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('writeOutput: overwrites when force=true and reports overwritten=true', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-out-force-'));
  try {
    const hopperDir = join(tmp, '.hopper');
    const handoffs = join(hopperDir, 'handoffs');
    mkdirSync(handoffs, { recursive: true });
    writeFileSync(join(handoffs, 'T-PLUGIN-XX-output.md'), 'PRE-EXISTING', 'utf-8');

    const result = makeDispatchResult();
    const written = await writeOutput({ hopperDir, dispatchResult: result, force: true });

    assert.equal(written.overwritten, true);
    const content = readFileSync(written.path, 'utf-8');
    assert.notEqual(content, 'PRE-EXISTING');
    assert.match(content, /^# T-PLUGIN-XX/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('writeOutput: throws clear error when task.id missing', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-out-nope-'));
  try {
    const hopperDir = join(tmp, '.hopper');
    mkdirSync(hopperDir, { recursive: true });

    const badResult = { task: { taskType: 'foo' }, vendor: 'codex', output: {}, raw: {} };
    await assert.rejects(
      writeOutput({ hopperDir, dispatchResult: badResult }),
      /task\.id is required/,
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('writeOutput: creates handoffs/ dir if missing', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-out-mkdir-'));
  try {
    const hopperDir = join(tmp, '.hopper');
    // intentionally do NOT create handoffs/
    mkdirSync(hopperDir, { recursive: true });

    const result = makeDispatchResult();
    const written = await writeOutput({ hopperDir, dispatchResult: result });
    assert.ok(existsSync(written.path));
    assert.ok(existsSync(join(hopperDir, 'handoffs')));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
