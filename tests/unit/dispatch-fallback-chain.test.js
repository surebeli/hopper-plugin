// Batch 2: --reasoning / --model fallback chains inside resolveAdapterOptsForTask
// (the single chokepoint every dispatch path — sync/background/adhoc/swarm — flows
// through), plus the effort-clamp visibility notice and the sentinel->real-name
// resolution that must reach argv + output.md frontmatter.
// Anchor: tests/unit/dispatch-fallback-chain.test.js
//
// See tests/unit/policy.test.js for the underlying pure-parser coverage and
// tests/unit/setup-policy-lint.test.js for the --setup lint warnings.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { resolveAdapterOptsForTask } from '../../cli/src/dispatch.js';

function withEnv(key, value, fn) {
  const prev = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  try { return fn(); } finally {
    if (prev === undefined) delete process.env[key];
    else process.env[key] = prev;
  }
}

const resolvedWith = (vendor, taskType, policy) => ({
  task: { taskType, brief: 'demo' },
  taskSpec: '',
  vendor,
  policy: policy || { effortPolicy: '', modelRule: '' },
});

// ─── --reasoning fallback chain priority ───

test('reasoning chain: explicit --reasoning flag wins over everything else', () => {
  const resolved = resolvedWith('grok', 'code-review-adversarial', { effortPolicy: 'medium', modelRule: '' });
  const out = resolveAdapterOptsForTask(resolved, { reasoning: 'low' });
  assert.equal(out.reasoning, 'low');
  assert.ok(!out.policyNotices.some((n) => n.includes('Effort policy')), 'flag present — policy cell must not even be consulted for a notice');
});

test('reasoning chain: single-token Effort policy resolves when no flag is passed', () => {
  const resolved = resolvedWith('codex', 'prd-research', { effortPolicy: 'medium', modelRule: '' });
  const out = resolveAdapterOptsForTask(resolved, {});
  assert.equal(out.reasoning, 'medium');
  assert.ok(out.policyNotices.some((n) => n.includes("Effort policy (task-type 'prd-research'): medium")));
});

test('reasoning chain: per-vendor table selects the entry matching the resolved vendor', () => {
  const policy = { effortPolicy: 'codex:xhigh, grok:high', modelRule: '' };
  assert.equal(resolveAdapterOptsForTask(resolvedWith('codex', 'code-review-adversarial', policy), {}).reasoning, 'xhigh');
  assert.equal(resolveAdapterOptsForTask(resolvedWith('grok', 'code-review-adversarial', policy), {}).reasoning, 'high');
});

test('reasoning chain: unbound Effort policy (OOB / vendor not named) falls through silently to HOPPER_DEFAULT_REASONING', () => {
  withEnv('HOPPER_DEFAULT_REASONING', 'medium', () => {
    const oob = resolveAdapterOptsForTask(resolvedWith('codex', 'code-impl', { effortPolicy: '(bind per project)', modelRule: '' }), {});
    assert.equal(oob.reasoning, 'medium');
    assert.equal(oob.policyNotices.length, 0, 'OOB is silent — not an error, no notice');

    const notNamed = resolveAdapterOptsForTask(resolvedWith('kimi', 'code-review-adversarial', { effortPolicy: 'codex:xhigh, grok:high', modelRule: '' }), {});
    assert.equal(notNamed.reasoning, 'medium', 'kimi not in the per-vendor table -> falls through');
  });
});

test('reasoning chain: no policy at all -> HOPPER_DEFAULT_REASONING, else the xhigh product default', () => {
  withEnv('HOPPER_DEFAULT_REASONING', undefined, () => {
    const out = resolveAdapterOptsForTask(resolvedWith('codex', 'code-impl', null), {});
    assert.equal(out.reasoning, 'xhigh');
  });
  withEnv('HOPPER_DEFAULT_REASONING', 'low', () => {
    const out = resolveAdapterOptsForTask(resolvedWith('codex', 'code-impl', null), {});
    assert.equal(out.reasoning, 'low');
  });
});

test('reasoning chain: unparseable Effort policy falls through AND emits a notice (does not silently vanish)', () => {
  const out = resolveAdapterOptsForTask(resolvedWith('codex', 'code-impl', { effortPolicy: 'not-a-real-level', modelRule: '' }), {});
  assert.equal(out.reasoning, 'xhigh', 'falls through to the product default');
  assert.ok(out.policyNotices.some((n) => n.includes('unparseable')));
});

// ─── effort clamp visibility (req #2) ───

test('clamp visibility: grok resolving to xhigh (default) prints the exact clamp notice', () => {
  const out = resolveAdapterOptsForTask(resolvedWith('grok', 'code-impl', null), {});
  assert.equal(out.reasoning, 'xhigh', 'the RESOLVED value is untouched — the vendor adapter still does the actual clamp at args() time');
  assert.ok(out.policyNotices.includes('effort xhigh → clamped to high (grok max)'));
});

test('clamp visibility: no notice when the resolved level is already in the vendor enum', () => {
  const out = resolveAdapterOptsForTask(resolvedWith('grok', 'code-impl', null), { reasoning: 'medium' });
  assert.ok(!out.policyNotices.some((n) => n.includes('clamped')));
});

test('clamp visibility: no notice for a vendor that ignores --reasoning entirely (kimi)', () => {
  const out = resolveAdapterOptsForTask(resolvedWith('kimi', 'code-impl', null), {});
  assert.ok(!out.policyNotices.some((n) => n.includes('clamped')));
});

// ─── --model fallback chain + verified-latest sentinel ───

test('model chain: explicit --model flag wins; still goes through V4 normalization', () => {
  const out = resolveAdapterOptsForTask(resolvedWith('codex', 'code-impl', { effortPolicy: '', modelRule: 'verified-latest' }), { model: 'GPT-5.5' });
  assert.equal(out.model, 'gpt-5.5', 'normalized; Model rule cell ignored because a flag was given');
  assert.ok(!out.policyNotices.some((n) => n.includes('Model rule')));
});

test('model chain: Model rule verified-latest resolves to the vendor knownGood[0] REAL name', () => {
  const out = resolveAdapterOptsForTask(resolvedWith('codex', 'code-impl', { effortPolicy: '', modelRule: 'verified-latest' }), {});
  assert.equal(out.model, 'gpt-5.6-sol', 'codex knownGood[0] after the batch-2 reorder');
  assert.ok(out.policyNotices.some((n) => n.includes("Model rule (task-type 'code-impl'): verified-latest")));
  assert.ok(out.policyNotices.some((n) => n.includes("model sentinel 'verified-latest' → gpt-5.6-sol (codex knownGood[0])")));
});

test('model chain: sentinel resolution is vendor-scoped (grok gets its own knownGood[0])', () => {
  const out = resolveAdapterOptsForTask(resolvedWith('grok', 'code-impl', { effortPolicy: '', modelRule: 'verified-latest' }), {});
  // ISSUE-grok-model-line-rotation-stale-knownGood.md: grok-build retired
  // ("unknown model id") between 2026-06-02 and 2026-07-16; knownGood[0]
  // moved to grok-4.5 (V-verified 2026-07-18 live micro-test).
  assert.equal(out.model, 'grok-4.5');
});

test('model chain: unbound Model rule (OOB) falls through silently to vendor CLI default (--model omitted)', () => {
  const out = resolveAdapterOptsForTask(resolvedWith('codex', 'code-impl', { effortPolicy: '', modelRule: '(bind per project)' }), {});
  assert.equal(out.model, undefined);
  assert.equal(out.policyNotices.length, 0);
});

test('model chain: unparseable Model rule (unknown sentinel) falls through WITH a notice, never forwarded as a literal --model', () => {
  const out = resolveAdapterOptsForTask(resolvedWith('codex', 'code-impl', { effortPolicy: '', modelRule: 'not-a-real-sentinel' }), {});
  assert.equal(out.model, undefined, 'must NOT forward the garbage string as a literal --model value');
  assert.ok(out.policyNotices.some((n) => n.includes('unrecognized sentinel')));
});

test('model chain: sentinel with no usable knownGood[0] (placeholder) omits --model with a notice, never forwards the placeholder', () => {
  // opencode's knownGood[0] is the documentation placeholder '<provider>/<model>'.
  const out = resolveAdapterOptsForTask(resolvedWith('opencode', 'code-impl', { effortPolicy: '', modelRule: 'verified-latest' }), {});
  assert.equal(out.model, undefined);
  assert.ok(out.policyNotices.some((n) => n.includes('no resolvable knownGood[0]')));
});

test('model+reasoning chain: no resolved/vendor object at all never throws (back-compat with pre-batch-2 callers)', () => {
  assert.doesNotThrow(() => resolveAdapterOptsForTask({ task: { taskType: 'code-impl' } }, {}));
  assert.doesNotThrow(() => resolveAdapterOptsForTask(undefined, {}));
});

// ─── policyNotices is print-time metadata, not a real adapter opt ───

test('policyNotices is non-enumerable: invisible to JSON.stringify and object-spread (never leaks into argv/env forwarding)', () => {
  const out = resolveAdapterOptsForTask(resolvedWith('codex', 'code-impl', { effortPolicy: '', modelRule: 'verified-latest' }), {});
  assert.ok(Array.isArray(out.policyNotices) && out.policyNotices.length > 0, 'directly readable right after the call');
  assert.equal(JSON.stringify(out).includes('policyNotices'), false, 'must not appear in the JSON blob forwarded to the background runner via env');
  const spread = { ...out };
  assert.equal(Object.prototype.hasOwnProperty.call(spread, 'policyNotices'), false, 'must not survive an object spread (background/sync build effectiveOpts this way)');
});

// ─── static regression guard: the frontmatter/output.md model-field wiring bug ───

test('regression guard: cli/bin/hopper-dispatch --write path threads the RESOLVED model, not the raw --model flag, into writeOutput()', () => {
  // req #3: output.md frontmatter must record the resolved REAL name (e.g. a
  // verified-latest sentinel resolved to a concrete model), not the sentinel
  // literal a raw `adapterOpts.model` would still carry. This is a static
  // source guard (mirrors the zero-spawn source-scan pattern in discovery.test.js)
  // against reintroducing `model: adapterOpts.model` at the writeOutput call site.
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const REPO_ROOT = resolve(__dirname, '..', '..');
  const src = readFileSync(join(REPO_ROOT, 'cli', 'bin', 'hopper-dispatch'), 'utf-8');
  const writeOutputCall = src.match(/writeOutput\(\{[^}]*\}\)/)[0];
  assert.match(writeOutputCall, /model:\s*effectiveAdapterOpts\.model/, `writeOutput() call must pass effectiveAdapterOpts.model (the resolved value), got: ${writeOutputCall}`);
  assert.doesNotMatch(writeOutputCall, /model:\s*adapterOpts\.model\b/, 'must not regress to the pre-resolution raw flag value');
});
