// Vendor readiness aggregator ("setup"/"doctor").
// Anchor: tests/unit/setup.test.js

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { buildVendorReadiness, summarizeReadiness, sandboxControl, webSearchSupport } from '../../cli/src/setup.js';
import { listAdapters, getAdapter } from '../../cli/src/vendors/index.js';

test('setup: buildVendorReadiness returns one well-formed row per registered vendor', async () => {
  const rows = await buildVendorReadiness();
  assert.equal(rows.length, listAdapters().length);
  for (const r of rows) {
    assert.equal(typeof r.name, 'string');
    assert.equal(typeof r.installed, 'boolean');
    assert.ok(['ok', true, false].includes(r.authOk) || typeof r.authOk === 'boolean');
    assert.ok(['argv', 'native', '?'].includes(r.sandboxControl), `${r.name} sandboxControl`);
    assert.ok(['yes', 'no', '?'].includes(r.webSearch), `${r.name} webSearch`);
    assert.ok('models' in r && 'capsStaleAfter' in r);
  }
});

test('setup: sandboxControl is argv for codex, native for kimi (not argv-downgradable)', () => {
  assert.equal(sandboxControl(getAdapter('codex')), 'argv');
  assert.equal(sandboxControl(getAdapter('kimi')), 'native');
});

test('setup: web-search support is yes only for codex (point-2 routing gate)', () => {
  assert.equal(webSearchSupport(getAdapter('codex')), 'yes');
  for (const v of ['kimi', 'opencode', 'copilot', 'grok', 'mimo', 'claude', 'agy']) {
    assert.equal(webSearchSupport(getAdapter(v)), 'no', `${v} must not plumb web-search yet`);
  }
});

test('setup: only-filter restricts to a single vendor', async () => {
  const rows = await buildVendorReadiness({ only: 'codex' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'codex');
  assert.equal(rows[0].webSearch, 'yes');
});

test('setup: capsStale uses the injected clock (deterministic)', async () => {
  const future = await buildVendorReadiness({ only: 'codex', now: new Date('2099-01-01') });
  assert.equal(future[0].capsStale, true, 'a far-future now makes capability metadata stale');
  const past = await buildVendorReadiness({ only: 'codex', now: new Date('2000-01-01') });
  assert.equal(past[0].capsStale, false, 'a past now keeps it fresh');
});

test('setup: summarizeReadiness rolls up ready/notInstalled/authMissing/capsStale', async () => {
  const rows = await buildVendorReadiness({ now: new Date('2000-01-01') });
  const sum = summarizeReadiness(rows);
  assert.equal(sum.total, rows.length);
  assert.ok(sum.ready <= sum.total);
  assert.ok(Array.isArray(sum.notInstalled) && Array.isArray(sum.authMissing) && Array.isArray(sum.capsStale));
  assert.equal(sum.capsStale.length, 0, 'no vendor is stale against a year-2000 clock');
});
