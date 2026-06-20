import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { resolveDispatch, resolveAdhocDispatch } from '../../cli/src/dispatch.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function scaffoldMinimal(root) {
  const hopperDir = join(root, '.hopper');
  mkdirSync(join(hopperDir, 'tasks'), { recursive: true });
  mkdirSync(join(hopperDir, 'handoffs'), { recursive: true });
  writeFileSync(join(hopperDir, 'queue.md'), `## Tasks

| ID | Task-type | Status | Brief |
|----|-----------|--------|-------|
| T-1 | code-impl | pending | do it |
`);
  writeFileSync(join(hopperDir, 'AGENTS.md'), `## Task-type → vendor default preference

| Task-type | Default vendor | Why |
|---|---|---|
| code-impl | codex | x |
`);
  writeFileSync(join(hopperDir, 'tasks', 'code-impl.md'), '# Frame\nImplement.');
  writeFileSync(join(hopperDir, 'handoffs', 'leader-tasklist.md'), '## T-1\nSpec body.');
  return hopperDir;
}

test('resolveDispatch injects the constitution when GOVERNANCE.md present', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-disp-'));
  try {
    const hopperDir = scaffoldMinimal(tmp);
    mkdirSync(join(hopperDir, 'governance'), { recursive: true });
    writeFileSync(join(hopperDir, 'governance', 'core.md'), 'GOVERNANCE CONSTITUTION');
    writeFileSync(join(hopperDir, 'GOVERNANCE.md'), '- **Constitution**: .hopper/governance/core.md\n');
    const r = await resolveDispatch({ hopperDir, taskId: 'T-1' });
    assert.ok(r.composedPrompt.startsWith('GOVERNANCE CONSTITUTION'),
      `expected constitution prefix, got: ${r.composedPrompt.slice(0, 40)}`);
    assert.match(r.composedPrompt, /## Task spec/);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test('resolveDispatch composes without governance when GOVERNANCE.md absent', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-disp-'));
  try {
    const hopperDir = scaffoldMinimal(tmp);
    const r = await resolveDispatch({ hopperDir, taskId: 'T-1' });
    assert.ok(r.composedPrompt.startsWith('# Frame'),
      `expected frame prefix, got: ${r.composedPrompt.slice(0, 20)}`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test('resolveAdhocDispatch: queue-less dispatch (brief = spec; --vendor wins; validates inputs)', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-disp-'));
  try {
    const hopperDir = scaffoldMinimal(tmp);
    const r = await resolveAdhocDispatch({ hopperDir, taskType: 'code-impl', brief: 'do the ad-hoc thing', id: 'adhoc-1' });
    assert.equal(r.task.id, 'adhoc-1');
    assert.equal(r.task.taskType, 'code-impl');
    assert.equal(r.vendor, 'codex', 'defaults to the AGENTS.md preference');
    assert.equal(r.taskSpec, 'do the ad-hoc thing', 'brief becomes the spec');
    assert.ok(r.composedPrompt.includes('do the ad-hoc thing'), 'spec composed into the prompt');

    const overridden = await resolveAdhocDispatch({ hopperDir, taskType: 'code-impl', brief: 'x', id: 'adhoc-2', vendorOverride: 'grok' });
    assert.equal(overridden.vendor, 'grok', '--vendor overrides the routed vendor');

    await assert.rejects(() => resolveAdhocDispatch({ hopperDir, taskType: 'code-impl', brief: '', id: 'adhoc-3' }), /non-empty --brief/);
    await assert.rejects(() => resolveAdhocDispatch({ hopperDir, taskType: 'BAD TYPE', brief: 'x', id: 'adhoc-4' }), /Invalid --task-type/);
    await assert.rejects(() => resolveAdhocDispatch({ hopperDir, taskType: 'code-impl', brief: 'x', id: '../escape' }), /unsafe characters|task-id/);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test('resolveDispatch: vendorOverride (--vendor) wins over the AGENTS.md routing', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-disp-'));
  try {
    const hopperDir = scaffoldMinimal(tmp);
    const def = await resolveDispatch({ hopperDir, taskId: 'T-1' });
    assert.equal(def.vendor, 'codex', 'default routes to codex per AGENTS.md');
    const overridden = await resolveDispatch({ hopperDir, taskId: 'T-1', vendorOverride: 'grok' });
    assert.equal(overridden.vendor, 'grok', '--vendor overrides the routed vendor');
    // governance + composition still key on the (overridden) vendor, not the default
    assert.ok(overridden.composedPrompt.startsWith('# Frame'));
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});
