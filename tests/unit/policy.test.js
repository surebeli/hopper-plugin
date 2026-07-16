// Batch 2: Effort policy / Model rule cell parsing + effort clamp visibility.
// Anchor: tests/unit/policy.test.js
//
// Pure-function tests for cli/src/policy.js — no I/O, no vendor subprocess.
// Consumed by dispatch.js (--reasoning / --model fallback chains) and setup.js
// (--setup "Task-type policy" lint). See tests/unit/dispatch-fallback-chain.test.js
// for the integration-level (resolveAdapterOptsForTask) coverage, and
// tests/unit/setup-policy-lint.test.js for the --setup lint warnings.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  isOobCell, parseEffortPolicyCell, parseModelRuleCell, resolveVerifiedLatest,
  genericClampEffort, computeEffortClamp, MODEL_SENTINELS, ALLOWED_REASONING_LEVELS,
} from '../../cli/src/policy.js';
import { ALLOWED_REASONING } from '../../cli/src/validation.js';

test('ALLOWED_REASONING_LEVELS stays byte-identical to validation.js ALLOWED_REASONING', () => {
  // policy.js deliberately duplicates the vocabulary instead of importing
  // validation.js (keeps it dependency-free of CLI-flag concerns) — this test
  // is the tripwire that catches the two drifting apart.
  assert.deepEqual(ALLOWED_REASONING_LEVELS, ALLOWED_REASONING);
});

test('isOobCell: parenthesized cells are OOB; everything else is not', () => {
  assert.equal(isOobCell('(bind per project)'), true);
  assert.equal(isOobCell('  (bind per project)  '), true, 'leading/trailing whitespace tolerated');
  assert.equal(isOobCell('medium'), false);
  assert.equal(isOobCell(''), false);
  assert.equal(isOobCell(undefined), false);
});

// ─── Effort policy: two accepted forms ───

test('parseEffortPolicyCell: single-token form resolves regardless of vendor', () => {
  assert.deepEqual(parseEffortPolicyCell('medium', 'codex'), { status: 'ok', value: 'medium' });
  assert.deepEqual(parseEffortPolicyCell('medium', ''), { status: 'ok', value: 'medium' }, 'vendor-agnostic — no vendor needed');
  assert.deepEqual(parseEffortPolicyCell('  XHIGH  ', 'grok'), { status: 'ok', value: 'xhigh' }, 'case/whitespace tolerant');
});

test('parseEffortPolicyCell: per-vendor table form selects the matching vendor entry', () => {
  const cell = 'codex:xhigh, grok:high';
  assert.deepEqual(parseEffortPolicyCell(cell, 'codex'), { status: 'ok', value: 'xhigh' });
  assert.deepEqual(parseEffortPolicyCell(cell, 'grok'), { status: 'ok', value: 'high' });
});

test('parseEffortPolicyCell: per-vendor table not naming this vendor -> unbound (not an error)', () => {
  const cell = 'codex:xhigh, grok:high';
  assert.deepEqual(parseEffortPolicyCell(cell, 'kimi'), { status: 'unbound', value: null });
  assert.deepEqual(parseEffortPolicyCell(cell, ''), { status: 'unbound', value: null }, 'no vendor bound yet — cannot select an entry');
});

test('parseEffortPolicyCell: OOB / empty cell -> unbound', () => {
  assert.deepEqual(parseEffortPolicyCell('(bind per project)', 'codex'), { status: 'unbound', value: null });
  assert.deepEqual(parseEffortPolicyCell('', 'codex'), { status: 'unbound', value: null });
  assert.deepEqual(parseEffortPolicyCell(undefined, 'codex'), { status: 'unbound', value: null });
});

test('parseEffortPolicyCell: malformed content -> unparseable (falls through with a notice, per dispatch.js)', () => {
  assert.equal(parseEffortPolicyCell('bananas', 'codex').status, 'unparseable');
  assert.equal(parseEffortPolicyCell('codex:not-a-level', 'codex').status, 'unparseable', 'level must be in ALLOWED_REASONING_LEVELS');
  assert.equal(parseEffortPolicyCell('codex:xhigh, garbage', 'codex').status, 'unparseable', 'one malformed pair invalidates the whole table (no partial-parse guessing)');
  assert.equal(parseEffortPolicyCell(':xhigh', 'codex').status, 'unparseable', 'empty vendor token');
});

// ─── Model rule: sentinel-only column ───

test('parseModelRuleCell: recognizes the verified-latest sentinel', () => {
  assert.deepEqual(parseModelRuleCell('verified-latest'), { status: 'ok', sentinel: 'verified-latest' });
  assert.deepEqual(parseModelRuleCell('`verified-latest`'), { status: 'ok', sentinel: 'verified-latest' }, 'backticks stripped');
});

test('parseModelRuleCell: OOB / empty -> unbound', () => {
  assert.deepEqual(parseModelRuleCell('(bind per project)'), { status: 'unbound', sentinel: null });
  assert.deepEqual(parseModelRuleCell(''), { status: 'unbound', sentinel: null });
  assert.deepEqual(parseModelRuleCell(undefined), { status: 'unbound', sentinel: null });
});

test('parseModelRuleCell: unrecognized value -> unparseable (references a non-existent sentinel)', () => {
  assert.deepEqual(parseModelRuleCell('verifed-latst'), { status: 'unparseable', sentinel: null });
  assert.deepEqual(parseModelRuleCell('gpt-5.5'), { status: 'unparseable', sentinel: null }, 'a literal model id is not a recognized sentinel');
  assert.equal(MODEL_SENTINELS.includes('verified-latest'), true);
});

// ─── verified-latest resolution (knownGood[0] convention) ───

test('resolveVerifiedLatest: returns knownGood[0]', () => {
  assert.equal(resolveVerifiedLatest(['gpt-5.6-sol', 'gpt-5.5']), 'gpt-5.6-sol');
  assert.equal(resolveVerifiedLatest(['grok-build', 'grok-composer-2.5-fast']), 'grok-build');
});

test('resolveVerifiedLatest: empty / placeholder knownGood -> null (never forward a placeholder as a real --model)', () => {
  assert.equal(resolveVerifiedLatest([]), null);
  assert.equal(resolveVerifiedLatest(null), null);
  assert.equal(resolveVerifiedLatest(['<provider>/<model>']), null, 'opencode-style documentation placeholder');
});

// ─── Effort clamp (visibility, req #2) ───

test('genericClampEffort: reproduces grok/copilot private clamp behavior without a vendor-specific function', () => {
  const threeLevel = ['low', 'medium', 'high'];
  assert.equal(genericClampEffort('xhigh', threeLevel), 'high');
  assert.equal(genericClampEffort('minimal', threeLevel), 'low');
  assert.equal(genericClampEffort('medium', threeLevel), 'medium', 'already in range -> unchanged');
});

test('genericClampEffort: empty knownGood (vendor ignores reasoning) -> null, not "everything out of range"', () => {
  assert.equal(genericClampEffort('xhigh', []), null);
  assert.equal(genericClampEffort('xhigh', undefined), null);
});

test('computeEffortClamp: exact demo string for the xhigh->high grok clamp', () => {
  const r = computeEffortClamp('grok', 'xhigh', ['low', 'medium', 'high']);
  assert.equal(r.inRange, false);
  assert.equal(r.clamped, 'high');
  assert.equal(r.notice, 'effort xhigh → clamped to high (grok max)');
});

test('computeEffortClamp: low-end clamp labels "min" not "max"', () => {
  const r = computeEffortClamp('grok', 'minimal', ['low', 'medium', 'high']);
  assert.equal(r.clamped, 'low');
  assert.equal(r.notice, 'effort minimal → clamped to low (grok min)');
});

test('computeEffortClamp: in-range -> no notice', () => {
  const r = computeEffortClamp('codex', 'xhigh', ['minimal', 'low', 'medium', 'high', 'xhigh']);
  assert.equal(r.inRange, true);
  assert.equal(r.notice, null);
});

test('computeEffortClamp: vendor with empty reasoningArg.knownGood (kimi/opencode/agy/claude) -> no notice', () => {
  const r = computeEffortClamp('kimi', 'xhigh', []);
  assert.equal(r.inRange, true);
  assert.equal(r.notice, null);
});

test('computeEffortClamp: no requested level -> no notice (nothing to clamp)', () => {
  assert.deepEqual(computeEffortClamp('grok', null, ['low', 'medium', 'high']), { inRange: true, clamped: null, notice: null });
  assert.deepEqual(computeEffortClamp('grok', undefined, ['low', 'medium', 'high']), { inRange: true, clamped: null, notice: null });
});
