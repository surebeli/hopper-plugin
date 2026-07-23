// Vendor-preset feedback fixes (2026-06-15): grok permission-mode/effort/fail-fast,
// --check --compat probe, and result model metadata.
// Anchor: tests/unit/vendor-preset-fixes.test.js

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { grokAdapter } from '../../cli/src/vendors/grok.js';
import { kimiAdapter } from '../../cli/src/vendors/kimi.js';
import { codexAdapter } from '../../cli/src/vendors/codex.js';
import { copilotAdapter, clampCopilotEffort } from '../../cli/src/vendors/copilot.js';
import { opencodeAdapter } from '../../cli/src/vendors/opencode.js';
import { listAdapters } from '../../cli/src/vendors/index.js';
import { compatCheckForAdapter } from '../../cli/src/vendor-compat.js';
import { renderOutputMarkdown } from '../../cli/src/output.js';

function withEnv(key, value, fn) {
  const prev = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  try { return fn(); } finally {
    if (prev === undefined) delete process.env[key];
    else process.env[key] = prev;
  }
}

// ─── Grok args: permission-mode + effort + escape hatch ───────────────

test('grok args: headless adds --permission-mode bypassPermissions + --always-approve', () => {
  const argv = grokAdapter.args('p', { background: true });
  const i = argv.indexOf('--permission-mode');
  assert.ok(i >= 0 && argv[i + 1] === 'bypassPermissions');
  assert.ok(argv.includes('--always-approve'));
});

test('grok args: --effort is forwarded only when --reasoning is set (opt-in)', () => {
  const without = grokAdapter.args('p', { background: true });
  assert.ok(!without.includes('--effort'), 'no --effort without opts.reasoning');
  const withR = grokAdapter.args('p', { background: true, reasoning: 'high' });
  const i = withR.indexOf('--effort');
  assert.ok(i >= 0 && withR[i + 1] === 'high', '--effort high when reasoning=high');
});

test('grok args: HOPPER_GROK_PERMISSION_MODE overrides the mode', () => {
  withEnv('HOPPER_GROK_PERMISSION_MODE', 'dontAsk', () => {
    const argv = grokAdapter.args('p', { background: true });
    const i = argv.indexOf('--permission-mode');
    assert.equal(argv[i + 1], 'dontAsk');
  });
});

test('grok args: HOPPER_GROK_PERMISSION_MODE="" omits --permission-mode (keeps --always-approve)', () => {
  withEnv('HOPPER_GROK_PERMISSION_MODE', '', () => {
    const argv = grokAdapter.args('p', { background: true });
    assert.ok(!argv.includes('--permission-mode'));
    assert.ok(argv.includes('--always-approve'));
  });
});

// ─── Grok parseResult: fail-fast instead of silent empty result ───────

test('grok parseResult: stopReason "Cancelled" is a failure, not silent success', () => {
  const r = grokAdapter.parseResult({
    exitCode: 0,
    stdout: JSON.stringify({ text: '', stopReason: 'Cancelled', sessionId: 's', requestId: 'r' }),
    stderr: '',
    timedOut: false,
    durationMs: 100,
  });
  assert.notEqual(r.status, 'success');
  assert.equal(r.error, 'adapter-protocol-invalid');
  assert.equal(r.diagnosticCode, 'adapter-protocol-invalid');
});

test('grok parseResult: valid trailing JSON succeeds despite unrelated MCP authentication warning', () => {
  const r = grokAdapter.parseResult({
    exitCode: 0,
    stdout: 'MCP hawk-agent: authenticate to continue\n' + JSON.stringify({ text: 'GROK_ANSWER', stopReason: 'EndTurn' }),
    stderr: 'MCP hawk-agent: authenticate to continue',
    timedOut: false,
    durationMs: 100,
  });
  assert.equal(r.status, 'success');
  assert.equal(r.text, 'GROK_ANSWER');

  const citationTail = grokAdapter.parseResult({
    exitCode: 0,
    stdout: 'Answer\n[1] citation',
    stderr: '',
    timedOut: false,
    durationMs: 100,
  });
  assert.equal(citationTail.status, 'unknown-fail');
  assert.equal(citationTail.text, '');
  assert.equal(citationTail.error, 'adapter-protocol-invalid');
  assert.equal(citationTail.diagnosticCode, 'adapter-protocol-invalid');
});

test('grok parseResult: exit 0 cancelled empty result plus auth warning remains auth-fail', () => {
  const r = grokAdapter.parseResult({
    exitCode: 0,
    stdout: JSON.stringify({ text: '', stopReason: 'Cancelled' }),
    stderr: 'worker quit with fatal: Auth(AuthorizationRequired)',
    timedOut: false,
    durationMs: 100,
  });
  assert.equal(r.status, 'auth-fail');
});

test('grok parseResult: nonzero AuthorizationRequired / Transport channel closed → auth-fail', () => {
  const r = grokAdapter.parseResult({
    exitCode: 1,
    stdout: '',
    stderr: 'worker quit with fatal: Transport channel closed, when Auth(AuthorizationRequired)',
    timedOut: false,
    durationMs: 100,
  });
  assert.equal(r.status, 'auth-fail');
});

test('grok parseResult: exit 0 with empty text → fail-fast (no usable result)', () => {
  const r = grokAdapter.parseResult({
    exitCode: 0,
    stdout: JSON.stringify({ text: '' }),
    stderr: '',
    timedOut: false,
    durationMs: 100,
  });
  assert.equal(r.status, 'unknown-fail');
});

test('grok parseResult: valid text still succeeds (no false positive)', () => {
  const r = grokAdapter.parseResult({
    exitCode: 0,
    stdout: JSON.stringify({ text: 'GROK_ANSWER', stopReason: 'stop', usage: { total_tokens: 9 } }),
    stderr: '',
    timedOut: false,
    durationMs: 100,
  });
  assert.equal(r.status, 'success');
  assert.equal(r.text, 'GROK_ANSWER');
});

// ─── compatFlags + --check --compat probe ─────────────────────────────

test('grok and kimi declare compatFlags for the --compat probe', () => {
  assert.ok(Array.isArray(grokAdapter.compatFlags) && grokAdapter.compatFlags.includes('--permission-mode'));
  assert.ok(Array.isArray(kimiAdapter.compatFlags) && kimiAdapter.compatFlags.includes('--prompt'));
});

test('compatCheckForAdapter throws on unknown vendor', () => {
  assert.throws(() => compatCheckForAdapter('nope-vendor'), /No vendor adapter registered/);
});

test('compatCheckForAdapter returns a well-formed result for every registered vendor', () => {
  for (const name of listAdapters()) {
    const c = compatCheckForAdapter(name);
    assert.equal(c.name, name);
    assert.equal(typeof c.ran, 'boolean');
    if (c.ran) {
      assert.ok(Array.isArray(c.present));
      assert.ok(Array.isArray(c.missing));
    } else {
      assert.ok(typeof c.reason === 'string' && c.reason.length > 0);
    }
  }
});

// ─── Result model metadata (point 5) ──────────────────────────────────

function fakeDispatch() {
  return {
    task: { id: 'T-MM', taskType: 'code-impl', brief: 'b' },
    vendor: 'grok',
    output: { status: 'success', text: 'hi' },
    raw: { exitCode: 0, timedOut: false, durationMs: 5, stdout: '', stderr: '' },
  };
}

test('renderOutputMarkdown records an explicit resolved model', () => {
  const { task, vendor, output, raw } = fakeDispatch();
  const md = renderOutputMarkdown({ task, vendor, output, raw, model: 'grok-build' });
  assert.match(md, /Resolved model: `grok-build`/);
});

test('renderOutputMarkdown labels an omitted model as the vendor default', () => {
  const { task, vendor, output, raw } = fakeDispatch();
  const md = renderOutputMarkdown({ task, vendor, output, raw });
  assert.match(md, /Resolved model: `\(vendor default\)`/);
});

// ─── ISSUE-codex-vendor-model-effort: cross-vendor model + effort forwarding ───

test('codex args: forwards -m only when opts.model is set (opt-in)', () => {
  const without = codexAdapter.args('p', {});
  assert.ok(!without.includes('-m'), 'no -m without opts.model');
  const withM = codexAdapter.args('p', { model: 'gpt-5.4-mini' });
  const i = withM.indexOf('-m');
  assert.ok(i >= 0 && withM[i + 1] === 'gpt-5.4-mini', '-m <model> forwarded verbatim');
});

test('copilot clampCopilotEffort maps the 5-level scale to copilot {low,medium,high}', () => {
  assert.equal(clampCopilotEffort('minimal'), 'low');
  assert.equal(clampCopilotEffort('low'), 'low');
  assert.equal(clampCopilotEffort('medium'), 'medium');
  assert.equal(clampCopilotEffort('high'), 'high');
  assert.equal(clampCopilotEffort('xhigh'), 'high');   // canonical default clamps down
  assert.equal(clampCopilotEffort('max'), 'max');      // unknown passes through (server validates)
  assert.equal(clampCopilotEffort(''), null);          // explicit empty omits
  assert.equal(clampCopilotEffort(undefined), null);
});

test('copilot args: --effort defaults to high (xhigh clamped); medium stays medium', () => {
  const def = copilotAdapter.args('p', { reasoning: 'xhigh' });
  const i = def.indexOf('--effort');
  assert.ok(i >= 0 && def[i + 1] === 'high', 'xhigh default clamps to --effort high');
  const med = copilotAdapter.args('p', { reasoning: 'medium' });
  assert.equal(med[med.indexOf('--effort') + 1], 'medium');
});

test('copilot args: HOPPER_COPILOT_EFFORT overrides (raw passthrough; "" omits)', () => {
  withEnv('HOPPER_COPILOT_EFFORT', 'max', () => {
    const argv = copilotAdapter.args('p', { reasoning: 'xhigh' });
    assert.equal(argv[argv.indexOf('--effort') + 1], 'max', 'raw env value passes through');
  });
  withEnv('HOPPER_COPILOT_EFFORT', '', () => {
    const argv = copilotAdapter.args('p', { reasoning: 'xhigh' });
    assert.ok(!argv.includes('--effort'), 'empty env omits --effort');
  });
});

test('opencode args: --variant is opt-in via HOPPER_OPENCODE_VARIANT only', () => {
  const without = opencodeAdapter.args('p', { reasoning: 'xhigh' });
  assert.ok(!without.includes('--variant'), 'no --variant by default (arbitrary provider models)');
  withEnv('HOPPER_OPENCODE_VARIANT', 'high', () => {
    const argv = opencodeAdapter.args('p', { reasoning: 'xhigh' });
    assert.equal(argv[argv.indexOf('--variant') + 1], 'high');
  });
});
