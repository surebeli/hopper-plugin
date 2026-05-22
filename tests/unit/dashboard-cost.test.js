import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import { parseCostLogContent } from '../../dashboard/server/lib/cost.js';
import { createCostRouter } from '../../dashboard/server/routes/cost.js';

function closeServer(server) {
  return new Promise((resolveClose) => server.close(resolveClose));
}

test('parseCostLogContent parses estimated tokens and dollars', () => {
  const result = parseCostLogContent([
    '| Date | Task | Role | Model | Tokens In/Out | Approx $ | Tier | Notes |',
    '|------|------|------|-------|---------------|----------|------|-------|',
    '| 2026-05-22 | T-WEB-06 | sidequest-executor | codex-gpt-5.5 | ~12,000/~4,500 | ~$0.18 | sub | done |',
  ].join('\n'));

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].tokensIn, 12000);
  assert.equal(result.rows[0].tokensOut, 4500);
  assert.equal(result.rows[0].approxUsd, 0.18);
  assert.equal(result.rows[0].vendor, 'codex');
});

test('parseCostLogContent aggregates by inferred vendor', () => {
  const result = parseCostLogContent([
    '| Date | Task | Task-type | Model | Tokens In/Out | Approx $ | Tier | Notes |',
    '|------|------|-----------|-------|---------------|----------|------|-------|',
    '| 2026-05-20 | T-1 | code-impl | codex GPT-5 | ~100/~20 | ~$0.10 | sub | ok |',
    '| 2026-05-20 | T-2 | code-impl | kimi-thinking | 200/30 | $0.20 | sub | ok |',
    '| 2026-05-20 | T-3 | code-impl | codex-gpt-5.5 | 50/10 | $0.05 | sub | ok |',
  ].join('\n'));

  assert.deepEqual(result.totals, { rows: 3, tokensIn: 350, tokensOut: 60, approxUsd: 0.35 });
  assert.deepEqual(result.byVendor.find((row) => row.vendor === 'codex'), {
    vendor: 'codex',
    tokensIn: 150,
    tokensOut: 30,
    approxUsd: 0.15,
    count: 2,
  });
});

test('parseCostLogContent tolerates old audit rows and missing optional columns', () => {
  const result = parseCostLogContent([
    '| Date | Trigger | Model | Tokens | Approx $ | Notes |',
    '|------|---------|-------|--------|----------|-------|',
    '| 2026-05-20 | Spec review | codex GPT-5 xhigh | ~58000 | ~$0.55 | verdict |',
    '| 2026-05-20 | Short row | claude-opus-4-7 | n/a | $0 marginal |',
  ].join('\n'));

  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].tokensIn, 58000);
  assert.equal(result.rows[0].tokensOut, 0);
  assert.equal(result.rows[1].approxUsd, 0);
  assert.equal(result.rows[1].notes, '');
});

test('cost route returns parsed COST-LOG.md', async () => {
  const root = mkdtempSync(join(tmpdir(), 'hopper-dashboard-cost-'));
  const hopperDir = join(root, '.hopper');
  mkdirSync(hopperDir);
  writeFileSync(
    join(hopperDir, 'COST-LOG.md'),
    [
      '| Date | Task | Role | Model | Tokens In/Out | Approx $ | Tier | Notes |',
      '|------|------|------|-------|---------------|----------|------|-------|',
      '| 2026-05-22 | T-WEB-07 | sidequest-executor | codex-gpt-5.5 | 10/5 | $0.01 | sub | parsed |',
    ].join('\n'),
  );
  const app = express();
  app.use('/api/cost', createCostRouter({ hopperDir }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolveListen) => server.once('listening', resolveListen));
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/cost`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.rows[0].task, 'T-WEB-07');
    assert.equal(body.totals.tokensIn, 10);
    assert.equal(body.byVendor[0].vendor, 'codex');
  } finally {
    await closeServer(server);
  }
});
