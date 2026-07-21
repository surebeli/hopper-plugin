// --check-model: assertion-style, zero-spawn pre-dispatch model check.
// Anchor: tests/unit/model-check.test.js
//
// Covers the pure decision function (cli/src/model-check.js) directly with
// fabricated knownGood/catalog fixtures — no cache I/O, no vendor subprocess,
// so this suite is single-file-runnable and stable under vendor/version drift
// (per AGENTS.md gotcha: prefer narrow `node --test <file>` checks; avoid the
// full `npm test` / progress-watch hang pitfall for a touched slice like this).

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { evaluateModelCheck, detectSplicedEffort, CHECK_MODEL_EXIT } from '../../cli/src/model-check.js';

// ─── three-tier verdict + exit codes ───

test('verified: a knownGood model returns verdict=verified, exit 0', () => {
  const r = evaluateModelCheck('codex', 'gpt-5.5', ['gpt-5.5', 'gpt-5.4'], ['gpt-5.5', 'gpt-5.4', 'gpt-9-preview']);
  assert.equal(r.verdict, 'verified');
  assert.equal(r.exitCode, 0);
  assert.equal(r.exitCode, CHECK_MODEL_EXIT.verified);
  assert.equal(r.normalized, 'gpt-5.5');
  assert.deepEqual(r.verifiedList, ['gpt-5.5', 'gpt-5.4']);
  assert.equal(r.selector_valid, 'verified');
  assert.equal(r.runtime_attestation, 'not-run');
});

test('verified wins even when the SAME model also happens to be in the catalog', () => {
  const r = evaluateModelCheck('codex', 'gpt-5.5', ['gpt-5.5'], ['gpt-5.5', 'gpt-9-preview']);
  assert.equal(r.verdict, 'verified');
  assert.equal(r.exitCode, 0);
});

test('catalog-only: a probed-but-not-verified model returns verdict=catalog-only, exit 2 (synthetic fixture)', () => {
  // Fabricated cache: codex's probe catalog lists a model the static knownGood
  // list has not promoted — this is the synthetic stand-in for the live
  // "bundled catalog lists it, but an old CLI 400s on dispatch" scenario, kept
  // as a fixture so the test does not depend on live vendor/CLI-version state.
  const knownGood = ['gpt-5.5', 'gpt-5.4'];
  const catalog = ['gpt-5.5', 'gpt-5.4', 'gpt-9-preview-unverified'];
  const r = evaluateModelCheck('codex', 'gpt-9-preview-unverified', knownGood, catalog);
  assert.equal(r.verdict, 'catalog-only');
  assert.equal(r.exitCode, 2);
  assert.equal(r.exitCode, CHECK_MODEL_EXIT['catalog-only']);
  assert.ok(r.hint.some((h) => /NOT on the verified list/.test(h)));
  assert.ok(r.hint.some((h) => /400/.test(h)), 'hint explains catalog != dispatch-time acceptance');
  assert.equal(r.selector_valid, 'catalog-only');
  assert.equal(r.runtime_attestation, 'not-run');
});

test('not-found: neither verified nor catalog has it (cache present), exit 1', () => {
  const r = evaluateModelCheck('codex', 'totally-bogus-model', ['gpt-5.5'], ['gpt-5.5', 'gpt-5.4']);
  assert.equal(r.verdict, 'not-found');
  assert.equal(r.exitCode, 1);
  assert.equal(r.exitCode, CHECK_MODEL_EXIT['not-found']);
  assert.equal(r.cacheMissing, false);
  assert.ok(r.hint.some((h) => h.includes('Verified:')));
  assert.ok(r.hint.some((h) => h.includes('Catalog')));
  assert.equal(r.selector_valid, 'not-found');
  assert.equal(r.runtime_attestation, 'not-run');
});

// ─── V4 normalization reuse (req #3: normalize BEFORE matching) ───

test('normalization: uppercase / dash-insensitive input matches the canonical knownGood entry', () => {
  const r = evaluateModelCheck('codex', 'GPT-5.5', ['gpt-5.5', 'gpt-5.4'], ['gpt-5.5']);
  assert.equal(r.normalized, 'gpt-5.5');
  assert.equal(r.verdict, 'verified');
  assert.equal(r.exitCode, 0);
});

test('normalization: a provider-prefixed bare-slug vendor input still resolves (codex strips the prefix)', () => {
  const r = evaluateModelCheck('codex', 'openai-codex/gpt-5.5', ['gpt-5.5'], null);
  assert.equal(r.normalized, 'gpt-5.5');
  assert.equal(r.verdict, 'verified');
});

test('normalization: unknown model passes through unchanged (no confident fuzzy match)', () => {
  const r = evaluateModelCheck('codex', 'gpt-6-nonexistent', ['gpt-5.5', 'gpt-5.4'], ['gpt-5.5']);
  assert.equal(r.normalized, 'gpt-6-nonexistent');
  assert.equal(r.verdict, 'not-found');
});

// ─── cache-missing degradation (req #4) ───

test('cache-missing: catalog=null degrades to knownGood-only check and flags cacheMissing', () => {
  const r = evaluateModelCheck('codex', 'gpt-5.5', ['gpt-5.5'], null);
  assert.equal(r.cacheMissing, true);
  assert.equal(r.verdict, 'verified'); // still verified — knownGood alone is enough
  assert.equal(r.exitCode, 0);
});

test('cache-missing + not-found: says so explicitly and suggests --probe, does not claim a catalog search happened', () => {
  const r = evaluateModelCheck('codex', 'never-probed-model', ['gpt-5.5'], null);
  assert.equal(r.cacheMissing, true);
  assert.equal(r.verdict, 'not-found');
  assert.equal(r.exitCode, 1);
  assert.ok(r.hint.some((h) => /probe cache missing/.test(h)));
  assert.ok(r.hint.some((h) => /--probe codex/.test(h)));
  assert.deepEqual(r.catalog, [], 'no catalog to report when cache is missing');
});

test('cache-missing is distinct from an empty-but-present catalog', () => {
  const missing = evaluateModelCheck('codex', 'x', ['gpt-5.5'], null);
  const empty = evaluateModelCheck('codex', 'x', ['gpt-5.5'], []);
  assert.equal(missing.cacheMissing, true);
  assert.equal(empty.cacheMissing, false);
});

// ─── effort spliced into the model name (req #3 dedicated error) ───

test('detectSplicedEffort: recognizes all five reasoning levels glued onto a tail, case-insensitively', () => {
  assert.equal(detectSplicedEffort('gpt-5.5-xhigh'), 'xhigh');
  assert.equal(detectSplicedEffort('gpt-5.5-HIGH'), 'high');
  assert.equal(detectSplicedEffort('gpt-5.5-medium'), 'medium');
  assert.equal(detectSplicedEffort('gpt-5.5-low'), 'low');
  assert.equal(detectSplicedEffort('gpt-5.5-minimal'), 'minimal');
  assert.equal(detectSplicedEffort('gpt-5.5'), null);
  assert.equal(detectSplicedEffort('grok-build'), null);
});

test('effort-spliced: gpt-5.5-xhigh gets a dedicated verdict + exit 1, hint suggests --reasoning split', () => {
  const r = evaluateModelCheck('codex', 'gpt-5.5-xhigh', ['gpt-5.5', 'gpt-5.4'], ['gpt-5.5']);
  assert.equal(r.verdict, 'effort-spliced');
  assert.equal(r.exitCode, 1);
  assert.equal(r.exitCode, CHECK_MODEL_EXIT['effort-spliced']);
  assert.equal(r.splicedEffort, 'xhigh');
  assert.ok(r.hint.some((h) => h.includes('--model gpt-5.5 --reasoning xhigh')));
  assert.equal(r.selector_valid, 'effort-spliced');
  assert.equal(r.runtime_attestation, 'not-run');
});

test('effort-spliced: fires even when the probe cache is missing (checked before the cache-missing not-found path)', () => {
  const r = evaluateModelCheck('codex', 'gpt-5.5-high', ['gpt-5.5'], null);
  assert.equal(r.verdict, 'effort-spliced');
  assert.equal(r.splicedEffort, 'high');
});

test('effort-spliced guard: never overrides a genuine verified/catalog match ending in a reasoning word', () => {
  // Fabricated edge case: a hypothetical vendor really does ship a model whose
  // literal name ends in one of the reasoning words. The dedicated splice
  // error must NOT shadow a real match.
  const verifiedCase = evaluateModelCheck('agy', 'weird-model-high', ['weird-model-high'], null);
  assert.equal(verifiedCase.verdict, 'verified');
  const catalogCase = evaluateModelCheck('agy', 'weird-model-high', [], ['weird-model-high']);
  assert.equal(catalogCase.verdict, 'catalog-only');
});

// ─── input hygiene ───

test('input hygiene: empty/whitespace knownGood + catalog never throw', () => {
  assert.doesNotThrow(() => evaluateModelCheck('codex', 'gpt-5.5', [], []));
  assert.doesNotThrow(() => evaluateModelCheck('codex', 'gpt-5.5', undefined, undefined));
  const r = evaluateModelCheck('codex', '  gpt-5.5  ', ['gpt-5.5'], null);
  assert.equal(r.verdict, 'verified', 'leading/trailing whitespace is trimmed before matching');
});

// ─── zero-spawn source scan (mirrors tests/unit/discovery.test.js + vendor-probe.test.js) ───

test('model-check.js source contains no spawn/exec call site (zero-spawn --check-model)', async () => {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { dirname, resolve, join } = await import('node:path');
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const REPO_ROOT = resolve(__dirname, '..', '..');
  const src = readFileSync(join(REPO_ROOT, 'cli', 'src', 'model-check.js'), 'utf-8');
  const noComments = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const noStrings = noComments.replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""').replace(/`[^`]*`/g, '``');
  const noImports = noStrings.replace(/^\s*import\s*\{[^}]*\}\s*from[^;\n]+;?/gm, '');
  assert.ok(!/\bspawn\s*\(/.test(noImports), 'model-check.js: contains spawn() call site');
  assert.ok(!/\bexec(Sync|FileSync|File)?\s*\(/.test(noImports), 'model-check.js: contains exec/execSync/execFile call site');
});
