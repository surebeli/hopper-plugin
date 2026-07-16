// Batch 2: --setup "Task-type policy" lint (buildTaskTypePolicyReport).
// Anchor: tests/unit/setup-policy-lint.test.js
//
// Covers the two required warning classes (effort out-of-range; Model rule
// referencing a non-existent sentinel), the bound/unbound/unparseable status
// vocabulary per column, and the "skip when no .hopper/" behavior.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildTaskTypePolicyReport } from '../../cli/src/setup.js';

async function withHopperDir(agentsMd, taskTypeFiles, fn) {
  const root = mkdtempSync(join(tmpdir(), 'hopper-policy-lint-'));
  try {
    mkdirSync(join(root, 'tasks'), { recursive: true });
    for (const t of taskTypeFiles) writeFileSync(join(root, 'tasks', `${t}.md`), `# ${t}\n`);
    writeFileSync(join(root, 'AGENTS.md'), agentsMd);
    // AWAIT before cleanup — fn is async and does file I/O against `root`;
    // returning the promise without awaiting it would let the `finally`
    // rmSync race ahead and delete the fixture before fn ever reads it.
    return await fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const TABLE = (rows) => [
  '## Task-type → vendor default preference',
  '',
  '| Task-type | Default vendor | Effort policy | Model rule |',
  '|---|---|---|---|',
  ...rows,
  '',
].join('\n');

test('skips with a reason when hopperDir is null (no .hopper/ workspace)', async () => {
  const report = await buildTaskTypePolicyReport(null);
  assert.equal(report.applicable, false);
  assert.match(report.reason, /no \.hopper\/ workspace/);
  assert.deepEqual(report.rows, []);
  assert.deepEqual(report.warnings, []);
});

test('skips with a reason when no task-type frames exist', async () => {
  await withHopperDir(TABLE(['| `code-impl` | codex | medium | verified-latest |']), [], async (root) => {
    const report = await buildTaskTypePolicyReport(root);
    assert.equal(report.applicable, false);
    assert.match(report.reason, /no task-type frames/);
  });
});

test('reports bound/unbound status per column for a fully-bound row', async () => {
  const agentsMd = TABLE(['| `code-impl` | codex | medium | verified-latest |']);
  await withHopperDir(agentsMd, ['code-impl'], async (root) => {
    const report = await buildTaskTypePolicyReport(root);
    assert.equal(report.applicable, true);
    const row = report.rows.find((r) => r.taskType === 'code-impl');
    assert.equal(row.vendor, 'codex');
    assert.equal(row.vendorStatus, 'bound');
    assert.equal(row.effortStatus, 'bound');
    assert.equal(row.effortValue, 'medium');
    assert.equal(row.modelStatus, 'bound');
    assert.equal(report.warnings.length, 0);
  });
});

test('reports unbound for an OOB vendor / effort / model-rule row (not an error)', async () => {
  const agentsMd = TABLE(['| `code-impl` | (bind per project) | (bind per project) | (bind per project) |']);
  await withHopperDir(agentsMd, ['code-impl'], async (root) => {
    const { rows, warnings } = await buildTaskTypePolicyReport(root);
    const row = rows[0];
    assert.equal(row.vendorStatus, 'unbound');
    assert.equal(row.effortStatus, 'unbound');
    assert.equal(row.modelStatus, 'unbound');
    assert.equal(warnings.length, 0, 'unbound is not a warning condition');
  });
});

// ─── Warning class 1: effort out-of-range ───

test('WARNS when a bound vendor\'s Effort policy value exceeds its reasoning enum', async () => {
  // grok's reasoningArg.knownGood is low|medium|high — xhigh is out of range.
  const agentsMd = TABLE(['| `code-review-adversarial` | grok | xhigh | verified-latest |']);
  await withHopperDir(agentsMd, ['code-review-adversarial'], async (root) => {
    const { rows, warnings } = await buildTaskTypePolicyReport(root);
    assert.equal(rows[0].effortStatus, 'bound');
    assert.equal(rows[0].effortValue, 'xhigh');
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /\[code-review-adversarial\] Effort policy 'xhigh' exceeds vendor 'grok'/);
    assert.match(warnings[0], /low\|medium\|high/);
  });
});

test('does NOT warn when the Effort policy value is within the vendor enum', async () => {
  const agentsMd = TABLE(['| `code-review-adversarial` | grok | high | verified-latest |']);
  await withHopperDir(agentsMd, ['code-review-adversarial'], async (root) => {
    const { warnings } = await buildTaskTypePolicyReport(root);
    assert.equal(warnings.length, 0);
  });
});

test('does NOT warn for a vendor whose reasoningArg.knownGood is empty (kimi ignores --reasoning entirely)', async () => {
  const agentsMd = TABLE(['| `code-impl` | kimi | xhigh | verified-latest |']);
  await withHopperDir(agentsMd, ['code-impl'], async (root) => {
    const { rows, warnings } = await buildTaskTypePolicyReport(root);
    assert.equal(rows[0].effortValue, 'xhigh');
    assert.equal(warnings.length, 0, 'kimi has no reasoning enum to exceed — not applicable, not a false alarm');
  });
});

test('per-vendor Effort policy table: only warns for the entry matching the BOUND vendor', async () => {
  // grok:xhigh is out of range, but grok is not the bound vendor here (codex is,
  // and codex's 5-level enum accepts xhigh) — only the actually-bound vendor's
  // entry should be checked.
  const agentsMd = TABLE(['| `code-review-adversarial` | codex | codex:xhigh, grok:xhigh | verified-latest |']);
  await withHopperDir(agentsMd, ['code-review-adversarial'], async (root) => {
    const { rows, warnings } = await buildTaskTypePolicyReport(root);
    assert.equal(rows[0].effortValue, 'xhigh');
    assert.equal(warnings.length, 0, 'codex accepts xhigh — the inert grok:xhigh entry must not false-warn');
  });
});

// ─── Warning class 2: Model rule references a non-existent sentinel ───

test('WARNS when Model rule references an unrecognized sentinel', async () => {
  const agentsMd = TABLE(['| `prd-research` | codex | medium | not-a-real-sentinel |']);
  await withHopperDir(agentsMd, ['prd-research'], async (root) => {
    const { rows, warnings } = await buildTaskTypePolicyReport(root);
    assert.equal(rows[0].modelStatus, 'unparseable');
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /\[prd-research\] Model rule 'not-a-real-sentinel' references an unrecognized sentinel/);
    assert.match(warnings[0], /verified-latest/);
  });
});

test('does NOT warn for the recognized verified-latest sentinel', async () => {
  const agentsMd = TABLE(['| `prd-research` | codex | medium | verified-latest |']);
  await withHopperDir(agentsMd, ['prd-research'], async (root) => {
    const { warnings } = await buildTaskTypePolicyReport(root);
    assert.equal(warnings.length, 0);
  });
});

test('both warning classes can fire together for the same task-type', async () => {
  const agentsMd = TABLE(['| `code-review-adversarial` | grok | xhigh | some-typo |']);
  await withHopperDir(agentsMd, ['code-review-adversarial'], async (root) => {
    const { warnings } = await buildTaskTypePolicyReport(root);
    assert.equal(warnings.length, 2);
    assert.ok(warnings.some((w) => w.includes('exceeds vendor')));
    assert.ok(warnings.some((w) => w.includes('unrecognized sentinel')));
  });
});

test('multiple task-types are all reported, one row each', async () => {
  const agentsMd = TABLE([
    '| `code-impl` | codex | medium | verified-latest |',
    '| `prd-research` | (bind per project) | medium | verified-latest |',
  ]);
  await withHopperDir(agentsMd, ['code-impl', 'prd-research'], async (root) => {
    const { rows } = await buildTaskTypePolicyReport(root);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map((r) => r.taskType).sort(), ['code-impl', 'prd-research']);
  });
});
