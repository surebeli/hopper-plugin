// Vendor readiness aggregator ("setup"/"doctor").
// Anchor: tests/unit/setup.test.js

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { buildVendorReadiness, summarizeReadiness, sandboxControl, webSearchSupport, formatModelDrift } from '../../cli/src/setup.js';
import { reconcileModels } from '../../cli/src/model-normalize.js';
import { listAdapters, getAdapter } from '../../cli/src/vendors/index.js';
import { getVendorCache, setVendorCache } from '../../cli/src/cache.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('setup: buildVendorReadiness returns one well-formed row per registered vendor', async () => {
  const rows = await buildVendorReadiness();
  assert.equal(rows.length, listAdapters().length);
  for (const r of rows) {
    assert.equal(typeof r.name, 'string');
    assert.equal(typeof r.installed, 'boolean');
    assert.ok(['ok', true, false].includes(r.authOk) || typeof r.authOk === 'boolean');
    assert.ok(['argv', 'full', 'native', '?'].includes(r.sandboxControl), `${r.name} sandboxControl`);
    assert.ok(['yes', 'manual', 'no', '?'].includes(r.webSearch), `${r.name} webSearch`);
    assert.ok('models' in r && 'capsStaleAfter' in r);
  }
});

test('setup: sandboxControl is full for codex (always full-access), native for kimi (both not argv-downgradable)', () => {
  // codex has no read-only scenario: its -s sandbox is broken on Windows so it always
  // emits the bypass flag → 'full' (pins full-access). kimi carries no sandbox flag → 'native'.
  assert.equal(sandboxControl(getAdapter('codex')), 'full');
  assert.equal(sandboxControl(getAdapter('kimi')), 'native');
});

test('setup: web-search readiness reflects per-adapter capability (T3)', () => {
  for (const v of ['codex', 'claude', 'grok', 'kimi']) {
    assert.equal(webSearchSupport(getAdapter(v)), 'yes', `${v} headless web search (hopper-enabled)`);
  }
  assert.equal(webSearchSupport(getAdapter('copilot')), 'manual', 'copilot: full-access only; read-only token unverified');
  assert.equal(webSearchSupport(getAdapter('mimo')), 'manual', 'mimo: possible via env, not auto-forwarded');
  assert.equal(webSearchSupport(getAdapter('opencode')), 'no', 'opencode: config-gated, not headless out of the box');
  assert.equal(webSearchSupport(getAdapter('agy')), 'no');
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

// ─── V3 renderer: formatModelDrift (pure; the runSetup drift line) ───

test('formatModelDrift: OK row with suppression explains the gap accurately', () => {
  const kg = ['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.3-codex', 'gpt-5.3-codex-spark'];
  const live = ['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.3-codex', 'gpt-5.2', 'codex-auto-review'];
  const rec = { applicable: true, ...reconcileModels('codex', kg, live, ['gpt-5.3-codex-spark', 'codex-auto-review', 'gpt-5.2']) };
  const out = formatModelDrift({ name: 'codex', modelsLive: live, modelReconcile: rec });
  assert.equal(out.verdict, 'OK');
  assert.match(out.detail, /4 of 6 live model\(s\) match defaults/);
  assert.match(out.detail, /2 expected-divergence suppressed \(driftExpected\)/);
});

test('formatModelDrift: DRIFT row lists NEW + STALE; n/a passes the reason; no-rec is a dash', () => {
  const drift = formatModelDrift({ name: 'mimo', modelsLive: ['a', 'b'], modelReconcile: { applicable: true, matched: ['a'], missingFromLive: ['x'], newOnLive: ['b'], expectedSuppressed: [] } });
  assert.equal(drift.verdict, 'DRIFT');
  assert.match(drift.detail, /NEW live model\(s\) absent from defaults: b/);
  assert.match(drift.detail, /STALE default\(s\) not in live catalog: x/);
  const na = formatModelDrift({ name: 'claude', modelsLive: [], modelReconcile: { applicable: false, reason: 'no live model-enumeration command (introspection: partial)' } });
  assert.equal(na.verdict, 'n/a');
  assert.match(na.detail, /introspection: partial/);
  assert.deepEqual(formatModelDrift({ name: 'x', modelReconcile: null }), { verdict: '—', detail: '' });
});

test('formatModelDrift: duplicate-tail defaults never yield a negative/over-100% count', () => {
  // pathological: two knownGood entries match the same single live model.
  const rec = { applicable: true, ...reconcileModels('codex', ['openai/gpt-5.5', 'gpt-5.5'], ['gpt-5.5'], []) };
  const out = formatModelDrift({ name: 'codex', modelsLive: ['gpt-5.5'], modelReconcile: rec });
  assert.equal(out.verdict, 'OK');
  assert.match(out.detail, /1 of 1 live model\(s\) match defaults/, 'live-side count stays sane (not "2 of 1")');
  assert.ok(!/-\d/.test(out.detail), 'no negative count leaks into the output');
});

// ─── V3: doctor --deep live model enumeration + reconcile (injected probe, no spawn) ───

test('V3 deep: a genuinely-live (introspection:full) catalog reconciles against knownGood', async () => {
  const fakeProbe = async () => ({ introspection_supported: 'full', models: ['gpt-5.5', 'GPT-5.4', 'gpt-6-new'], models_source: 'fake' });
  const rows = await buildVendorReadiness({ only: 'codex', deep: true, persist: false, probeFn: fakeProbe });
  const rec = rows[0].modelReconcile;
  assert.equal(rec.applicable, true);
  assert.ok(rec.matched.includes('gpt-5.5') && rec.matched.includes('gpt-5.4'), 'case-insensitive live match');
  assert.ok(rec.missingFromLive.includes('gpt-5.4-mini'), 'a default missing from the live catalog is STALE');
  assert.deepEqual(rec.newOnLive, ['gpt-6-new'], 'a live model absent from defaults is NEW');
  assert.deepEqual(rows[0].modelsLive, ['gpt-5.5', 'GPT-5.4', 'gpt-6-new']);
});

test('V3 deep: codex driftExpected suppresses Pro-only/internal noise; OK until a genuinely-new model appears', async () => {
  // Real codex knownGood + driftExpected, with a live catalog mirroring the bundled list.
  const liveBundled = ['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.3-codex', 'gpt-5.2', 'codex-auto-review'];
  const okProbe = async () => ({ introspection_supported: 'full', models: liveBundled, models_source: 'codex debug models --bundled' });
  const ok = await buildVendorReadiness({ only: 'codex', deep: true, persist: false, probeFn: okProbe });
  assert.equal(ok[0].modelReconcile.applicable, true);
  assert.deepEqual(ok[0].modelReconcile.missingFromLive, [], 'spark (Pro-only) not flagged STALE');
  assert.deepEqual(ok[0].modelReconcile.newOnLive, [], 'gpt-5.2/codex-auto-review suppressed as expected');

  const newProbe = async () => ({ introspection_supported: 'full', models: [...liveBundled, 'gpt-6'], models_source: 'codex debug models --bundled' });
  const drift = await buildVendorReadiness({ only: 'codex', deep: true, persist: false, probeFn: newProbe });
  assert.deepEqual(drift[0].modelReconcile.newOnLive, ['gpt-6'], 'a genuinely-new model still surfaces as NEW');
});

test('V3 deep: introspection:partial with a non-empty STATIC list is n/a — NOT false drift (claude/kimi shape)', async () => {
  // The regression the review caught: claude returns introspection 'partial' with 4
  // static aliases; reconciling against its 9-entry knownGood would falsely flag 5 STALE.
  const fakeProbe = async () => ({ introspection_supported: 'partial', models: ['sonnet', 'opus', 'haiku', 'fable'], models_source: 'static aliases (no catalog command)' });
  const rows = await buildVendorReadiness({ only: 'claude', deep: true, persist: false, probeFn: fakeProbe });
  assert.equal(rows[0].modelReconcile.applicable, false, 'a static/partial list must not be reconciled');
  assert.match(rows[0].modelReconcile.reason, /introspection: partial|no live model-enumeration/);
});

test('V3 deep: introspection:none reports n/a (no false "missing")', async () => {
  const fakeProbe = async () => ({ introspection_supported: 'none', models: [], models_source: 'no enumeration command' });
  const rows = await buildVendorReadiness({ only: 'agy', deep: true, persist: false, probeFn: fakeProbe });
  assert.equal(rows[0].modelReconcile.applicable, false);
  assert.match(rows[0].modelReconcile.reason, /introspection: none|no live model-enumeration/);
});

test('V3 deep: a live catalog but a PLACEHOLDER knownGood (opencode sentinel) is n/a', async () => {
  const fakeProbe = async () => ({ introspection_supported: 'full', models: ['anthropic/claude-opus-4.8', 'openai/gpt-5.5'], models_source: 'opencode models' });
  const rows = await buildVendorReadiness({ only: 'opencode', deep: true, persist: false, probeFn: fakeProbe });
  assert.equal(rows[0].modelReconcile.applicable, false, 'sentinel knownGood (`<provider>/<model>`) must not be reconciled');
  assert.match(rows[0].modelReconcile.reason, /placeholder|no hardcoded knownGood/);
});

test('V3 deep: a probe that throws degrades to applicable:false (never blocks the report)', async () => {
  const fakeProbe = async () => { throw new Error('boom'); };
  const rows = await buildVendorReadiness({ only: 'grok', deep: true, persist: false, probeFn: fakeProbe });
  assert.equal(rows[0].modelReconcile.applicable, false);
  assert.match(rows[0].modelReconcile.reason, /probe failed: boom/);
  assert.equal(rows[0].modelsLive, null);
});

test('V3 shallow: non-deep doctor never enumerates (probeFn is not called)', async () => {
  let called = false;
  const rows = await buildVendorReadiness({ only: 'codex', deep: false, probeFn: async () => { called = true; return { introspection_supported: 'full', models: [] }; } });
  assert.equal(called, false, 'shallow doctor must not spawn/enumerate');
  assert.ok(rows[0].modelReconcile == null, 'no reconcile attached without --deep');
});

test('V3 deep: persist gate — true writes the live catalog to cache; false suppresses the write', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-setup-cache-'));
  const oldEnv = process.env.HOPPER_CACHE_DIR;
  process.env.HOPPER_CACHE_DIR = tmp;
  try {
    const fakeProbe = async () => ({ introspection_supported: 'full', models: ['gpt-5.5', 'gpt-6'], models_source: 'fake' });
    // persist:false → no cache file written
    await buildVendorReadiness({ only: 'codex', deep: true, persist: false, probeFn: fakeProbe });
    assert.equal(getVendorCache('codex'), null, 'persist:false must not write the cache');
    // persist:true → cache reflects the live catalog
    await buildVendorReadiness({ only: 'codex', deep: true, persist: true, probeFn: fakeProbe });
    const cached = getVendorCache('codex');
    assert.ok(cached && Array.isArray(cached.models), 'persist:true writes a cache entry');
    assert.deepEqual(cached.models, ['gpt-5.5', 'gpt-6']);
  } finally {
    if (oldEnv === undefined) delete process.env.HOPPER_CACHE_DIR; else process.env.HOPPER_CACHE_DIR = oldEnv;
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('V3 deep: a non-live (partial) probe never clobbers an existing cache entry', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-setup-cache2-'));
  const oldEnv = process.env.HOPPER_CACHE_DIR;
  process.env.HOPPER_CACHE_DIR = tmp;
  try {
    // seed a good prior cache entry
    setVendorCache('claude', { models: ['sonnet', 'opus'], introspection_supported: 'partial', probed_at: '2020-01-01T00:00:00.000Z' });
    const fakeProbe = async () => ({ introspection_supported: 'partial', models: ['sonnet', 'opus', 'haiku', 'fable'], models_source: 'static' });
    await buildVendorReadiness({ only: 'claude', deep: true, persist: true, probeFn: fakeProbe });
    const cached = getVendorCache('claude');
    assert.equal(cached.probed_at, '2020-01-01T00:00:00.000Z', 'a partial/static probe must not refresh the cache timestamp');
    assert.deepEqual(cached.models, ['sonnet', 'opus'], 'a partial/static probe must not overwrite cached models');
  } finally {
    if (oldEnv === undefined) delete process.env.HOPPER_CACHE_DIR; else process.env.HOPPER_CACHE_DIR = oldEnv;
    rmSync(tmp, { recursive: true, force: true });
  }
});
