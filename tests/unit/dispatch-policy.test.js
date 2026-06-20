// Dispatch policy: layered sandbox defaults + web-search auto-enable by task-type.
// Anchor: tests/unit/dispatch-policy.test.js

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { resolveAdapterOptsForTask } from '../../cli/src/dispatch.js';
import { resolveDefaultSandbox, ALLOWED_DISPATCH_FLAGS, READ_ONLY_DEFAULT_TASK_TYPES, WEB_SEARCH_TASK_TYPES } from '../../cli/src/validation.js';
import { codexAdapter } from '../../cli/src/vendors/codex.js';

function withEnv(key, value, fn) {
  const prev = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  try { return fn(); } finally {
    if (prev === undefined) delete process.env[key];
    else process.env[key] = prev;
  }
}

const resolvedOf = (taskType, brief = 'do the thing') => ({ task: { taskType, brief }, taskSpec: '' });

// ─── sandbox precedence ──────────────────────────────────────────────

test('policy: review/research task-types default to read-only sandbox', () => {
  for (const t of ['code-review-adversarial', 'code-review-acceptance', 'prd-research', 'market-research']) {
    assert.equal(resolveAdapterOptsForTask(resolvedOf(t)).sandbox, 'read-only', `${t} should default read-only`);
  }
});

test('policy: implementation task-types keep the full-access product default', () => {
  assert.equal(resolveAdapterOptsForTask(resolvedOf('code-impl')).sandbox, 'danger-full-access');
});

test('policy: explicit --sandbox always wins over the task-type default', () => {
  const o = resolveAdapterOptsForTask(resolvedOf('prd-research'), { sandbox: 'danger-full-access' });
  assert.equal(o.sandbox, 'danger-full-access');
});

test('policy: read-only task TEXT still downgrades an implementation task', () => {
  assert.equal(resolveAdapterOptsForTask(resolvedOf('code-impl', 'a read-only audit of X')).sandbox, 'read-only');
});

test('policy: HOPPER_DEFAULT_SANDBOX flips the global baseline but not the read-only task-types', () => {
  withEnv('HOPPER_DEFAULT_SANDBOX', 'workspace-write', () => {
    assert.equal(resolveAdapterOptsForTask(resolvedOf('code-impl')).sandbox, 'workspace-write', 'baseline flips');
    assert.equal(resolveAdapterOptsForTask(resolvedOf('prd-research')).sandbox, 'read-only', 'research still read-only (more specific)');
  });
});

// ─── web-search auto-enable ──────────────────────────────────────────

test('policy: research task-types auto-enable webSearch; others do not', () => {
  assert.equal(resolveAdapterOptsForTask(resolvedOf('prd-research')).webSearch, true);
  assert.equal(resolveAdapterOptsForTask(resolvedOf('market-research')).webSearch, true);
  assert.equal(resolveAdapterOptsForTask(resolvedOf('code-impl')).webSearch, undefined);
});

test('policy: an explicit webSearch decision is respected (auto does not override)', () => {
  // user passed --web-search on a non-research task → stays true
  assert.equal(resolveAdapterOptsForTask(resolvedOf('code-impl'), { webSearch: true }).webSearch, true);
});

// ─── validation surface ──────────────────────────────────────────────

test('policy: --web-search is an allowed bare dispatch flag', () => {
  assert.ok(ALLOWED_DISPATCH_FLAGS.includes('--web-search'));
});

test('policy: resolveDefaultSandbox reads HOPPER_DEFAULT_SANDBOX, ignores junk', () => {
  assert.equal(resolveDefaultSandbox(), 'danger-full-access');
  withEnv('HOPPER_DEFAULT_SANDBOX', 'read-only', () => assert.equal(resolveDefaultSandbox(), 'read-only'));
  withEnv('HOPPER_DEFAULT_SANDBOX', 'bogus-mode', () => assert.equal(resolveDefaultSandbox(), 'danger-full-access'));
});

test('policy: the read-only + web-search task-type sets are consistent', () => {
  for (const t of WEB_SEARCH_TASK_TYPES) {
    assert.ok(READ_ONLY_DEFAULT_TASK_TYPES.includes(t), `${t} web-search type should also be read-only by default`);
  }
});

// ─── codex web-search flag (the load-bearing --search fix) ───────────

test('policy: codex forwards webSearch as --search (not the deprecated web_search_cached)', () => {
  const on = codexAdapter.args('x', { webSearch: true });
  assert.ok(on.includes('--search'), 'webSearch → --search (live)');
  assert.ok(!on.join(' ').includes('web_search_cached'), 'must not use the deprecated no-op flag');
  const off = codexAdapter.args('x', {});
  assert.ok(!off.includes('--search'), 'no --search without webSearch');
});
