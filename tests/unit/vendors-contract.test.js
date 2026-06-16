// Vendor contract conformance tests (Phase 2)
// Anchor: tests/unit/vendors-contract.test.js
//
// Verifies all vendor adapters conform to the VendorAdapter contract from
// cli/src/types.js. Catches drift in adapter shape without invoking vendors.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listAdapters, getAdapter } from '../../cli/src/vendors/index.js';

const VENDORS = ['codex', 'kimi', 'opencode', 'copilot', 'agy', 'grok', 'mimo', 'claude'];

test('registry lists exactly the 8 functional vendors', () => {
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
  assert.equal(argv[argv.indexOf('-s') + 1], 'danger-full-access');
  assert.ok(argv.includes('-c'));
  assert.ok(argv.some((a) => a.includes('model_reasoning_effort="high"')));
  assert.ok(argv.includes('test prompt'));

  const ro = a.args('test prompt', { sandbox: 'read-only' });
  assert.equal(ro[ro.indexOf('-s') + 1], 'read-only');
});

test('kimi adapter args() uses Kimi Code 0.x headless form (no removed legacy flags)', () => {
  const a = getAdapter('kimi');
  const argv = a.args('test', {});
  assert.ok(argv.includes('-p'));
  assert.ok(argv.includes('test'));
  // Kimi Code 0.x removed these (Commander allowUnknownOption(false) → would error out)
  assert.ok(!argv.includes('--afk'), '--afk removed in 0.x');
  assert.ok(!argv.includes('--print'), '--print removed in 0.x');
  assert.ok(!argv.includes('--final-message-only'), '--final-message-only removed in 0.x');
  assert.ok(!argv.includes('--thinking') && !argv.includes('--no-thinking'), 'reasoning is config-driven in 0.x, not argv');
  assert.ok(!argv.includes('--yolo') && !argv.includes('--auto') && !argv.includes('--plan'),
    'Kimi 0.14 rejects prompt mode combined with permission/plan flags');
  // -m only when model given; --session only when conversationId given
  assert.ok(!argv.includes('-m'), 'no -m without opts.model');
  const withModel = a.args('test', { model: 'kimi-code/kimi-for-coding' });
  assert.ok(withModel.includes('-m') && withModel.includes('kimi-code/kimi-for-coding'));
  const withSession = a.args('test', { conversationId: 'sess-1' });
  assert.ok(withSession.includes('--session') && withSession.includes('sess-1'));
  const danger = a.args('test', { sandbox: 'danger-full-access' });
  const readOnly = a.args('test', { sandbox: 'read-only' });
  assert.deepEqual(danger, argv, 'sandbox opts are not argv-enforceable for kimi -p');
  assert.deepEqual(readOnly, argv, 'read-only cannot be enforced by a kimi -p argv flag');
});

test('opencode adapter args() uses run subcommand', () => {
  const a = getAdapter('opencode');
  const argv = a.args('test', {});
  assert.equal(argv[0], 'run');
  assert.ok(argv.includes('--print-logs'));
  assert.ok(argv.includes('--format'));
  assert.ok(argv.includes('json'));
  assert.ok(argv.includes('--pure'));
  assert.ok(argv.includes('--dangerously-skip-permissions'), 'default sandbox is danger-full-access');

  const ro = a.args('test', { sandbox: 'read-only' });
  assert.ok(!ro.includes('--dangerously-skip-permissions'), 'read-only tasks must not skip permissions');
});

test('opencode adapter parseResult() reconstructs assistant text from json event stream', () => {
  const a = getAdapter('opencode');
  const result = a.parseResult({
    exitCode: 0,
    stdout: [
      JSON.stringify({ type: 'session.started', session: 's-1' }),
      JSON.stringify({ type: 'message.part.delta', delta: 'HELLO_' }),
      JSON.stringify({ type: 'message.part.delta', delta: 'WORLD' }),
      JSON.stringify({ type: 'message.completed' }),
    ].join('\n'),
    stderr: '',
    timedOut: false,
    durationMs: 200,
  });
  assert.equal(result.status, 'success');
  assert.equal(result.text, 'HELLO_WORLD');
});

test('opencode adapter parseResult() reconstructs text from opencode 1.17+ {type:"text", part:{text}} events', () => {
  // Regression: opencode 1.17.7 changed its --format json schema to emit
  // `{type:"text", part:{text:"..."}}` (the mimo-fork shape), which the old
  // kind allow-list rejected → the parser dumped raw JSON as the "result" and a
  // dispatch looked failed. Captured from a real `opencode run --format json`.
  const a = getAdapter('opencode');
  const result = a.parseResult({
    exitCode: 0,
    stdout: [
      JSON.stringify({ type: 'step_start', part: { type: 'step-start' } }),
      JSON.stringify({ type: 'text', part: { type: 'text', text: 'OK_' } }),
      JSON.stringify({ type: 'text', part: { type: 'text', text: 'DONE' } }),
      JSON.stringify({ type: 'step_finish', part: { tokens: { total: 19834 } } }),
    ].join('\n'),
    stderr: '', timedOut: false, durationMs: 200,
  });
  assert.equal(result.status, 'success');
  assert.equal(result.text, 'OK_DONE', 'must extract clean assistant text');
  assert.ok(!result.text.includes('step_start'), 'must NOT fall back to dumping raw JSON');
});

test('mimo adapter args() maps sandbox and reasoning to MiMoCode run flags', () => {
  const a = getAdapter('mimo');
  const argv = a.args('test', { cwd: '/tmp/project', model: 'xiaomi/mimo-v2.5-pro', reasoning: 'xhigh' });
  assert.equal(argv[0], 'run');
  assert.ok(argv.includes('test'));
  assert.ok(argv.includes('--dir') && argv.includes('/tmp/project'));
  assert.ok(argv.includes('--model') && argv.includes('xiaomi/mimo-v2.5-pro'));
  assert.ok(argv.includes('--agent'));
  assert.equal(argv[argv.indexOf('--agent') + 1], 'build');
  assert.ok(argv.includes('--format') && argv.includes('json'));
  assert.ok(argv.includes('--pure'));
  assert.ok(argv.includes('--print-logs'));
  assert.ok(argv.includes('--variant'));
  assert.equal(argv[argv.indexOf('--variant') + 1], 'max', 'xhigh maps to MiMo variant max');
  assert.ok(argv.includes('--dangerously-skip-permissions'), 'default sandbox is danger-full-access');

  const ro = a.args('test', { sandbox: 'read-only', reasoning: 'high' });
  assert.equal(ro[ro.indexOf('--agent') + 1], 'plan');
  assert.ok(ro.includes('--variant') && ro.includes('high'));
  assert.ok(!ro.includes('--dangerously-skip-permissions'), 'read-only tasks must not auto-approve tool calls');
});

test('mimo adapter parseResult() reconstructs text and token usage from json events', () => {
  const a = getAdapter('mimo');
  const result = a.parseResult({
    exitCode: 0,
    stdout: [
      JSON.stringify({ type: 'step_start', part: { type: 'step-start' } }),
      JSON.stringify({ type: 'text', part: { type: 'text', text: 'HELLO_' } }),
      JSON.stringify({ type: 'text', part: { type: 'text', text: 'MIMO' } }),
      JSON.stringify({ type: 'step_finish', part: { tokens: { total: 1234 } } }),
    ].join('\n'),
    stderr: '',
    timedOut: false,
    durationMs: 200,
  });
  assert.equal(result.status, 'success');
  assert.equal(result.text, 'HELLO_MIMO');
  assert.deepEqual(result.usage, { totalTokens: 1234 });
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

test('copilot adapter maps sandbox to allow-all permission flags', () => {
  const a = getAdapter('copilot');
  const argv = a.args('test', {});
  assert.ok(argv.includes('--allow-all-tools'));
  assert.ok(argv.includes('--allow-all-paths'));
  const ro = a.args('test', { sandbox: 'read-only' });
  assert.ok(!ro.includes('--allow-all-tools'));
  assert.ok(!ro.includes('--allow-all-paths'));
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
  const ro = a.args('test', { sandbox: 'read-only' });
  assert.ok(!ro.includes('--dangerously-skip-permissions'), 'read-only tasks must not skip permissions');
});

test('grok adapter args() builds headless json invocation with explicit default model', () => {
  const a = getAdapter('grok');
  // Use background:true so headless detection is deterministic regardless of TTY.
  const argv = a.args('test prompt', { background: true });
  assert.ok(argv.includes('-p'));
  assert.ok(argv.includes('test prompt'));
  assert.ok(argv.includes('--output-format'));
  assert.ok(argv.includes('json'));
  assert.ok(argv.includes('--no-auto-update'));
  // Always passes explicit -m (avoids retired-slug grok-4.3 billing redirect)
  assert.ok(argv.includes('-m'));
  assert.ok(argv.includes('grok-build'), 'default model must be grok-build');
  // Headless dispatch needs an explicit permission mode (and --always-approve for
  // full-access) or grok stalls with stopReason:"Cancelled" (vendor-preset
  // feedback 2026-06-15).
  assert.ok(argv.includes('--permission-mode'), '--permission-mode required for headless');
  assert.ok(argv.includes('bypassPermissions'));
  assert.ok(argv.includes('--always-approve'), 'default sandbox is danger-full-access → auto-approve');
  // read-only sandbox: still gets a permission mode, but NOT --always-approve.
  const ro = a.args('test', { sandbox: 'read-only', background: true });
  assert.ok(!ro.includes('--always-approve'), 'read-only tasks must not auto-approve tool calls');
  assert.ok(ro.includes('--permission-mode'), 'read-only headless still needs a permission mode (avoids the Cancelled stall)');
  // honors explicit --model override
  const custom = a.args('test', { model: 'grok-4.3', background: true });
  assert.ok(custom.includes('grok-4.3') && !custom.includes('grok-build'));
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
  const savedHome = process.env.HOME;
  const savedUserProfile = process.env.USERPROFILE;
  const savedHomeDrive = process.env.HOMEDRIVE;
  const savedHomePath = process.env.HOMEPATH;
  const fakeHome = mkdtempSync(join(tmpdir(), 'hopper-grok-home-'));
  delete process.env.XAI_API_KEY;
  process.env.GROK_API_KEY = 'should-be-ignored';
  process.env.HOME = fakeHome;
  process.env.USERPROFILE = fakeHome;
  delete process.env.HOMEDRIVE;
  delete process.env.HOMEPATH;
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
    if (savedHome !== undefined) process.env.HOME = savedHome; else delete process.env.HOME;
    if (savedUserProfile !== undefined) process.env.USERPROFILE = savedUserProfile; else delete process.env.USERPROFILE;
    if (savedHomeDrive !== undefined) process.env.HOMEDRIVE = savedHomeDrive; else delete process.env.HOMEDRIVE;
    if (savedHomePath !== undefined) process.env.HOMEPATH = savedHomePath; else delete process.env.HOMEPATH;
    rmSync(fakeHome, { recursive: true, force: true });
  }
});

test('claude adapter args() builds headless json invocation, default skips permissions', () => {
  const a = getAdapter('claude');
  const argv = a.args('test prompt', {});
  assert.ok(argv.includes('-p'));
  assert.ok(argv.includes('test prompt'));
  assert.ok(argv.includes('--output-format'));
  assert.ok(argv.includes('json'));
  // Default sandbox is danger-full-access → headless full-access path.
  assert.ok(argv.includes('--dangerously-skip-permissions'));
  assert.ok(!argv.includes('--permission-mode'), 'danger-full-access uses the skip flag, not --permission-mode');
  // No --model unless asked (account default, like codex).
  assert.ok(!argv.includes('--model'), 'no --model without opts.model');
  const withModel = a.args('test', { model: 'opus' });
  assert.ok(withModel.includes('--model') && withModel.includes('opus'));
  // cwd → --add-dir; conversationId → --resume
  const withCwd = a.args('test', { cwd: '/tmp/project' });
  assert.ok(withCwd.includes('--add-dir') && withCwd.includes('/tmp/project'));
  const withSession = a.args('test', { conversationId: 'sess-1' });
  assert.ok(withSession.includes('--resume') && withSession.includes('sess-1'));
});

test('claude adapter args() maps non-danger sandboxes to native permission modes', () => {
  const a = getAdapter('claude');
  const ro = a.args('test', { sandbox: 'read-only' });
  assert.ok(!ro.includes('--dangerously-skip-permissions'), 'read-only must not skip permissions');
  assert.equal(ro[ro.indexOf('--permission-mode') + 1], 'dontAsk', 'read-only → dontAsk (locked-down, no prompt-hang)');
  const ww = a.args('test', { sandbox: 'workspace-write' });
  assert.equal(ww[ww.indexOf('--permission-mode') + 1], 'acceptEdits', 'workspace-write → acceptEdits');
});

test('claude adapter HOPPER_CLAUDE_PERMISSION_MODE overrides the mode for non-danger sandboxes', () => {
  const saved = process.env.HOPPER_CLAUDE_PERMISSION_MODE;
  process.env.HOPPER_CLAUDE_PERMISSION_MODE = 'plan';
  try {
    const a = getAdapter('claude');
    const argv = a.args('test', { sandbox: 'read-only' });
    assert.equal(argv[argv.indexOf('--permission-mode') + 1], 'plan');
  } finally {
    if (saved === undefined) delete process.env.HOPPER_CLAUDE_PERMISSION_MODE;
    else process.env.HOPPER_CLAUDE_PERMISSION_MODE = saved;
  }
});

test('claude adapter HOPPER_CLAUDE_BARE=1 prepends --bare for CI isolation', () => {
  const saved = process.env.HOPPER_CLAUDE_BARE;
  process.env.HOPPER_CLAUDE_BARE = '1';
  try {
    const a = getAdapter('claude');
    const argv = a.args('test', {});
    assert.equal(argv[0], '--bare', '--bare must lead so it applies as a global flag');
  } finally {
    if (saved === undefined) delete process.env.HOPPER_CLAUDE_BARE;
    else process.env.HOPPER_CLAUDE_BARE = saved;
  }
});

test('claude adapter parseResult() extracts .result from --output-format json object', () => {
  const a = getAdapter('claude');
  const result = a.parseResult({
    exitCode: 0,
    stdout: JSON.stringify({
      type: 'result', subtype: 'success', is_error: false,
      result: 'CLAUDE_ANSWER', session_id: 's-1', total_cost_usd: 0.012,
    }),
    stderr: '',
    timedOut: false,
    durationMs: 200,
  });
  assert.equal(result.status, 'success');
  assert.equal(result.text, 'CLAUDE_ANSWER');
  assert.equal(result.usage.totalCostUsd, 0.012);
});

test('claude adapter parseResult() fails fast on is_error / empty result (no silent success)', () => {
  const a = getAdapter('claude');
  const errResult = a.parseResult({
    exitCode: 0,
    stdout: JSON.stringify({ type: 'result', subtype: 'error_max_turns', is_error: true, result: '' }),
    stderr: '',
    timedOut: false,
    durationMs: 100,
  });
  assert.equal(errResult.status, 'unknown-fail');
  assert.match(errResult.error, /no usable result/i);
  assert.match(errResult.error, /error_max_turns/);
});

test('claude adapter parseResult() detects auth-fail and billing/credit block', () => {
  const a = getAdapter('claude');
  const auth = a.parseResult({
    exitCode: 1, stdout: '', stderr: 'authentication_failed: please run /login', timedOut: false, durationMs: 90,
  });
  assert.equal(auth.status, 'auth-fail');
  const billing = a.parseResult({
    exitCode: 1, stdout: '', stderr: 'billing_error: usage limit reached', timedOut: false, durationMs: 90,
  });
  assert.equal(billing.status, 'auth-fail');
  assert.match(billing.error, /billing \/ credit \/ usage limit/i);
});

test('getAdapter throws clear error for unknown vendor', () => {
  assert.throws(
    () => getAdapter('not-a-real-vendor'),
    /No vendor adapter registered/,
  );
});
