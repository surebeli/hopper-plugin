// Vendor contract conformance tests (Phase 2)
// Anchor: tests/unit/vendors-contract.test.js
//
// Verifies all 5 vendor adapters conform to the VendorAdapter contract from
// cli/src/types.js. Catches drift in adapter shape without invoking vendors.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { listAdapters, getAdapter } from '../../cli/src/vendors/index.js';

const VENDORS = ['codex', 'kimi', 'opencode', 'copilot', 'agy', 'grok'];

test('registry lists exactly the 6 functional vendors', () => {
  const names = listAdapters().sort();
  assert.deepEqual(names, [...VENDORS].sort(),
    `expected ${VENDORS.join(',')}; got ${names.join(',')}`);
});

for (const name of VENDORS) {
  test(`${name} adapter implements full VendorAdapter contract`, () => {
    const a = getAdapter(name);
    assert.equal(typeof a.name, 'string', `${name}: name`);
    assert.equal(a.name, name, `${name}: name matches registry key`);
    assert.equal(typeof a.command, 'string', `${name}: command`);
    assert.equal(typeof a.args, 'function', `${name}: args is function`);
    assert.equal(typeof a.envPreflight, 'function', `${name}: envPreflight is function`);
    assert.equal(typeof a.timeoutMs, 'function', `${name}: timeoutMs is function`);
    assert.equal(typeof a.parseResult, 'function', `${name}: parseResult is function`);
  });

  test(`${name} adapter args() returns string array`, () => {
    const a = getAdapter(name);
    const argv = a.args('test prompt', {});
    assert.ok(Array.isArray(argv), `${name}: args() must return array`);
    for (const arg of argv) {
      assert.equal(typeof arg, 'string', `${name}: every arg must be string; got ${typeof arg}`);
    }
  });

  test(`${name} adapter timeoutMs() returns positive number`, () => {
    const a = getAdapter(name);
    const t = a.timeoutMs({});
    assert.equal(typeof t, 'number');
    assert.ok(t > 0, `${name}: timeoutMs must be > 0; got ${t}`);
    assert.ok(t < 1_800_000, `${name}: timeoutMs must be < 30 min sanity; got ${t}`);
  });

  test(`${name} adapter envPreflight() returns {ok, missing}`, () => {
    const a = getAdapter(name);
    const result = a.envPreflight();
    assert.equal(typeof result.ok, 'boolean', `${name}: preflight.ok must be boolean`);
    assert.ok(Array.isArray(result.missing), `${name}: preflight.missing must be array`);
  });

  test(`${name} adapter parseResult() handles timeout case`, () => {
    const a = getAdapter(name);
    const result = a.parseResult({
      exitCode: -1,
      stdout: '',
      stderr: '',
      timedOut: true,
      durationMs: 30000,
    });
    assert.equal(result.status, 'timeout', `${name}: timeout case must map to status='timeout'`);
  });

  test(`${name} adapter parseResult() handles command-not-found (exit 127)`, () => {
    const a = getAdapter(name);
    const result = a.parseResult({
      exitCode: 127,
      stdout: '',
      stderr: '',
      timedOut: false,
      durationMs: 50,
    });
    assert.equal(result.status, 'permission-fail', `${name}: 127 must map to permission-fail`);
    assert.ok(/not found|install/i.test(result.error || ''), `${name}: error must mention install`);
  });

  test(`${name} adapter parseResult() handles success (exit 0 + stdout)`, () => {
    const a = getAdapter(name);
    const result = a.parseResult({
      exitCode: 0,
      stdout: 'HELLO_RESPONSE',
      stderr: '',
      timedOut: false,
      durationMs: 200,
    });
    assert.equal(result.status, 'success', `${name}: 0+stdout must map to success`);
    assert.match(result.text, /HELLO_RESPONSE/);
  });
}

test('codex adapter args() builds expected invocation', () => {
  const a = getAdapter('codex');
  const argv = a.args('test prompt', { reasoning: 'high' });
  assert.ok(argv.includes('exec'));
  assert.ok(argv.includes('-s'));
  assert.ok(argv.includes('-c'));
  assert.ok(argv.some((a) => a.includes('model_reasoning_effort="high"')));
  assert.ok(argv.includes('test prompt'));
});

test('kimi adapter args() includes --afk for headless', () => {
  const a = getAdapter('kimi');
  const argv = a.args('test', {});
  assert.ok(argv.includes('-p'));
  assert.ok(argv.includes('--afk'));
  assert.ok(argv.includes('--print'));
  assert.ok(argv.includes('--final-message-only'));
});

test('opencode adapter args() uses run subcommand', () => {
  const a = getAdapter('opencode');
  const argv = a.args('test', {});
  assert.equal(argv[0], 'run');
});

test('copilot adapter surfaces GH_TOKEN warning when no env token present', () => {
  // Per codex Phase 2 audit F1: preflight is now SOFT-WARN (ok=true) when no
  // env token, because gh CLI auth cache can be a fallback. The warning text
  // must still mention GH_TOKEN so the user knows what to set.
  const saved = process.env.GH_TOKEN;
  const savedAlt = process.env.GITHUB_TOKEN;
  const savedCopilot = process.env.COPILOT_GITHUB_TOKEN;
  delete process.env.GH_TOKEN;
  delete process.env.GITHUB_TOKEN;
  delete process.env.COPILOT_GITHUB_TOKEN;
  try {
    const a = getAdapter('copilot');
    const result = a.envPreflight();
    assert.equal(result.ok, true, 'soft-warn: ok=true even without env token (gh CLI may cover)');
    assert.ok(result.missing.some((m) => /GH_TOKEN/i.test(m)),
      'warning text must mention GH_TOKEN so user can fix it');
  } finally {
    if (saved !== undefined) process.env.GH_TOKEN = saved;
    if (savedAlt !== undefined) process.env.GITHUB_TOKEN = savedAlt;
    if (savedCopilot !== undefined) process.env.COPILOT_GITHUB_TOKEN = savedCopilot;
  }
});

test('agy adapter has prepareLog() method (codex F2 silent-fail detection)', () => {
  const a = getAdapter('agy');
  assert.equal(typeof a.prepareLog, 'function', 'agy must have prepareLog');
  const hint = a.prepareLog('T-test', 'agy');
  assert.equal(typeof hint.logPath, 'string');
  assert.match(hint.logPath, /agy/);
});

test('agy adapter args() includes --dangerously-skip-permissions for headless', () => {
  const a = getAdapter('agy');
  const argv = a.args('test', {});
  assert.ok(argv.includes('--dangerously-skip-permissions'));
});

test('grok adapter args() builds headless json invocation with explicit default model', () => {
  const a = getAdapter('grok');
  const argv = a.args('test prompt', {});
  assert.ok(argv.includes('-p'));
  assert.ok(argv.includes('test prompt'));
  assert.ok(argv.includes('--output-format'));
  assert.ok(argv.includes('json'));
  assert.ok(argv.includes('--no-auto-update'));
  // Always passes explicit -m (avoids retired-slug grok-4.3 billing redirect)
  assert.ok(argv.includes('-m'));
  assert.ok(argv.includes('grok-build-0.1'), 'default model must be grok-build-0.1');
  // --always-approve only in background mode (else agent hangs per tool call)
  assert.ok(!argv.includes('--always-approve'), 'no --always-approve in sync mode');
  const bg = a.args('test', { background: true });
  assert.ok(bg.includes('--always-approve'), '--always-approve required for background');
  // honors explicit --model override
  const custom = a.args('test', { model: 'grok-4.3' });
  assert.ok(custom.includes('grok-4.3') && !custom.includes('grok-build-0.1'));
});

test('grok adapter parseResult() detects auth-fail from unauthorized signal', () => {
  const a = getAdapter('grok');
  const result = a.parseResult({
    exitCode: 1,
    stdout: '',
    stderr: 'Error: unauthorized (401) — set XAI_API_KEY',
    timedOut: false,
    durationMs: 120,
  });
  assert.equal(result.status, 'auth-fail');
  assert.match(result.error || '', /XAI_API_KEY/);
});

test('grok adapter parseResult() extracts text from --output-format json object', () => {
  const a = getAdapter('grok');
  const result = a.parseResult({
    exitCode: 0,
    stdout: JSON.stringify({ text: 'GROK_ANSWER', usage: { total_tokens: 42 } }),
    stderr: '',
    timedOut: false,
    durationMs: 200,
  });
  assert.equal(result.status, 'success');
  assert.equal(result.text, 'GROK_ANSWER');
  assert.deepEqual(result.usage, { total_tokens: 42 });
});

test('grok adapter envPreflight() never checks GROK_API_KEY (third-party collision)', () => {
  const savedXai = process.env.XAI_API_KEY;
  const savedGrok = process.env.GROK_API_KEY;
  delete process.env.XAI_API_KEY;
  process.env.GROK_API_KEY = 'should-be-ignored';
  try {
    const a = getAdapter('grok');
    const result = a.envPreflight();
    assert.equal(result.ok, true, 'soft-warn ok=true');
    // GROK_API_KEY set but XAI_API_KEY absent → must still warn (does not treat GROK_API_KEY as auth)
    assert.ok(result.missing.some((m) => /XAI_API_KEY/.test(m)),
      'must guide user to XAI_API_KEY, not accept GROK_API_KEY');
  } finally {
    if (savedXai !== undefined) process.env.XAI_API_KEY = savedXai;
    if (savedGrok !== undefined) process.env.GROK_API_KEY = savedGrok; else delete process.env.GROK_API_KEY;
  }
});

test('getAdapter throws clear error for unknown vendor', () => {
  assert.throws(
    () => getAdapter('not-a-real-vendor'),
    /No vendor adapter registered/,
  );
});
