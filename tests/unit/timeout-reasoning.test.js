// Tests for the idle+ceiling timeout primitive, max-reasoning default, --timeout
// flag, grok effort clamp, and codex skills-config sanitizer.
// Anchor: tests/unit/timeout-reasoning.test.js
//
// Covers: ISSUE-mimo-codeimpl-timeout (idle/ceiling) + the max-effort default +
// ISSUE-codex-review-hijack (stripCodexSkillsConfig).

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { platform, tmpdir } from 'node:os';
import {
  runSubprocessOnce,
  resolveDispatchTimeouts,
  DEFAULT_IDLE_TIMEOUT_MS,
  CEILING_FLOOR_MS,
} from '../../cli/src/subprocess.js';
import {
  resolveDefaultReasoning,
  DEFAULT_DISPATCH_REASONING,
  validateTimeout,
  MIN_DISPATCH_TIMEOUT_MS,
  MAX_DISPATCH_TIMEOUT_MS,
} from '../../cli/src/validation.js';
import { resolveAdapterOptsForTask } from '../../cli/src/dispatch.js';
import { getAdapter } from '../../cli/src/vendors/index.js';
import { stripCodexSkillsConfig } from '../../cli/src/vendors/codex.js';

function withEnv(key, value, fn) {
  const prev = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  try { return fn(); } finally {
    if (prev === undefined) delete process.env[key];
    else process.env[key] = prev;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (_) {
    return false;
  }
}

// ─── resolveDispatchTimeouts ───────────────────────────────────────────
test('resolveDispatchTimeouts: ceiling floors a small adapter baseline up to ≥30min', () => {
  const { idleMs, ceilingMs } = resolveDispatchTimeouts(180_000, {});
  assert.equal(ceilingMs, CEILING_FLOOR_MS, 'small baseline floored to the 30min net');
  assert.equal(idleMs, DEFAULT_IDLE_TIMEOUT_MS);
});

test('resolveDispatchTimeouts: a baseline larger than the floor is preserved', () => {
  const { ceilingMs } = resolveDispatchTimeouts(CEILING_FLOOR_MS + 600_000, {});
  assert.equal(ceilingMs, CEILING_FLOOR_MS + 600_000);
});

test('resolveDispatchTimeouts: explicit --timeout (timeoutOverrideMs) wins', () => {
  const { idleMs, ceilingMs } = resolveDispatchTimeouts(180_000, { timeoutOverrideMs: 5_000 });
  assert.equal(ceilingMs, 5_000);
  assert.equal(idleMs, 5_000, 'idle never exceeds the ceiling');
});

test('resolveDispatchTimeouts: env overrides (HOPPER_DISPATCH_TIMEOUT_MS / HOPPER_IDLE_TIMEOUT_MS)', () => {
  withEnv('HOPPER_DISPATCH_TIMEOUT_MS', '120000', () => {
    withEnv('HOPPER_IDLE_TIMEOUT_MS', '30000', () => {
      const { idleMs, ceilingMs } = resolveDispatchTimeouts(180_000, {});
      assert.equal(ceilingMs, 120_000);
      assert.equal(idleMs, 30_000);
    });
  });
});

// ─── runSubprocessOnce idle behavior (real subprocess; additive over ceiling) ──
test('runSubprocessOnce: idle fires after silence (reason=idle), well under ceiling', async () => {
  const r = await runSubprocessOnce({
    command: process.execPath,
    args: ['-e', 'console.log("one byte"); setInterval(()=>{},1e9)'],  // emit once, then silent forever
    stdinInput: null,
    timeoutMs: 8000,   // generous ceiling
    idleMs: 400,       // 400ms of silence ⇒ kill
  });
  assert.equal(r.timedOut, true);
  assert.equal(r.timeoutReason, 'idle');
  assert.ok(r.durationMs < 4000, `idle should kill fast; got ${r.durationMs}ms`);
});

test('runSubprocessOnce: Windows cleanup fallback settles and reaps an owned child when taskkill reports false success', {
  skip: platform() !== 'win32' ? 'Windows-only taskkill lifecycle' : false,
  timeout: 8_000,
}, async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-timeout-fallback-'));
  const pidPath = join(tmp, 'taskkill-pid.txt');
  const previousPath = process.env.PATH;
  let resultPromise = null;
  try {
    writeFileSync(join(tmp, 'taskkill.cmd'), [
      '@echo off',
      `>${JSON.stringify(pidPath)} echo %2`,
      'exit /b 0',
      '',
    ].join('\r\n'));
    process.env.PATH = `${tmp}${delimiter}${previousPath || ''}`;

    resultPromise = runSubprocessOnce({
      command: process.execPath,
      args: ['-e', 'setInterval(() => {}, 60_000)'],
      stdinInput: null,
      idleMs: 50,
      timeoutMs: 8_000,
    });
    const result = await Promise.race([
      resultPromise,
      delay(2_000).then(() => { throw new Error('Windows cleanup fallback did not settle'); }),
    ]);

    assert.equal(result.timedOut, true);
    assert.equal(result.timeoutReason, 'idle');
    assert.ok(existsSync(pidPath), 'the taskkill shim observed the owned child PID');
    const pid = Number.parseInt(readFileSync(pidPath, 'utf-8'), 10);
    assert.ok(Number.isInteger(pid) && pid > 0);
    assert.equal(isAlive(pid), false, 'the fallback must not leave the owned child alive');
  } finally {
    if (existsSync(pidPath)) {
      const pid = Number.parseInt(readFileSync(pidPath, 'utf-8'), 10);
      if (Number.isInteger(pid) && pid > 0 && isAlive(pid)) {
        try { execFileSync(join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe'), ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' }); } catch (_) {}
      }
    }
    if (resultPromise) await Promise.race([resultPromise.catch(() => {}), delay(2_000)]);
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('runSubprocessOnce: streaming output keeps resetting idle (no kill)', async () => {
  // Generous margin so this survives heavy concurrent test load: inter-tick gap
  // (150ms) is ~13x under idle (2000ms), and node startup is well under idle.
  const r = await runSubprocessOnce({
    command: process.execPath,
    args: ['-e', 'let n=0;const t=setInterval(()=>{console.log("tick",n++);if(n>=10){clearInterval(t);process.exit(0)}},150)'],
    stdinInput: null,
    timeoutMs: 20000,
    idleMs: 2000,
  });
  assert.equal(r.timedOut, false, 'actively-streaming process must not be idle-killed');
  assert.equal(r.exitCode, 0);
});

test('runSubprocessOnce: ceiling still fires for a chatty runaway (reason=ceiling)', async () => {
  const r = await runSubprocessOnce({
    command: process.execPath,
    args: ['-e', 'setInterval(()=>console.log("noise"),50)'],  // never silent, never exits
    stdinInput: null,
    timeoutMs: 500,     // low ceiling
    idleMs: 5000,       // idle won't trip (constant output)
  });
  assert.equal(r.timedOut, true);
  assert.equal(r.timeoutReason, 'ceiling');
});

test('runSubprocessOnce: legacy callers (no idleMs) keep pure-ceiling behavior', async () => {
  const r = await runSubprocessOnce({
    command: process.execPath,
    args: ['-e', 'console.log("hi")'],
    stdinInput: null,
    timeoutMs: 5000,    // no idleMs → additive idle disabled
  });
  assert.equal(r.timedOut, false);
  assert.match(r.stdout, /hi/);
});

// ─── reasoning default = max ───────────────────────────────────────────
test('resolveDefaultReasoning defaults to xhigh; HOPPER_DEFAULT_REASONING overrides', () => {
  assert.equal(DEFAULT_DISPATCH_REASONING, 'xhigh');
  withEnv('HOPPER_DEFAULT_REASONING', undefined, () => {
    assert.equal(resolveDefaultReasoning(), 'xhigh');
  });
  withEnv('HOPPER_DEFAULT_REASONING', 'high', () => {
    assert.equal(resolveDefaultReasoning(), 'high');
  });
  withEnv('HOPPER_DEFAULT_REASONING', 'bogus', () => {
    assert.equal(resolveDefaultReasoning(), 'xhigh', 'invalid env ignored');
  });
});

test('resolveAdapterOptsForTask injects max reasoning by default, preserves explicit', () => {
  const resolved = { task: { brief: 'do the thing' }, taskSpec: '' };
  const def = resolveAdapterOptsForTask(resolved, {});
  assert.equal(def.reasoning, 'xhigh');
  assert.equal(def.sandbox, 'danger-full-access');
  const explicit = resolveAdapterOptsForTask(resolved, { reasoning: 'low' });
  assert.equal(explicit.reasoning, 'low', 'explicit --reasoning must win');
});

test('codex/mimo consume the default; grok clamps xhigh→high; ignorers unaffected', () => {
  // codex: xhigh → model_reasoning_effort="xhigh"
  const codex = getAdapter('codex').args('p', { reasoning: 'xhigh' });
  assert.ok(codex.some((a) => a.includes('model_reasoning_effort="xhigh"')));
  // mimo: xhigh → --variant max
  const mimo = getAdapter('mimo').args('p', { reasoning: 'xhigh' });
  assert.equal(mimo[mimo.indexOf('--variant') + 1], 'max');
  // grok: xhigh clamped to its known-good 'high'
  const grok = getAdapter('grok').args('p', { background: true, reasoning: 'xhigh' });
  assert.equal(grok[grok.indexOf('--effort') + 1], 'high');
  // grok direct call w/o reasoning still emits NO --effort (opt-in preserved)
  const grokBare = getAdapter('grok').args('p', { background: true });
  assert.ok(!grokBare.includes('--effort'));
});

// ─── --timeout validation ──────────────────────────────────────────────
test('validateTimeout: parses ms, range-guards, rejects junk', () => {
  assert.equal(validateTimeout('600000'), 600_000);
  assert.equal(validateTimeout(600_000), 600_000);
  assert.throws(() => validateTimeout('abc'), /not an integer/);
  // codex review P2: partial / float strings must be rejected, not truncated
  assert.throws(() => validateTimeout('600000abc'), /not an integer/);
  assert.throws(() => validateTimeout('1000.5'), /not an integer/);
  assert.throws(() => validateTimeout(1000.5), /not an integer/);
  assert.throws(() => validateTimeout('-5000'), /not an integer/);
  assert.throws(() => validateTimeout(MIN_DISPATCH_TIMEOUT_MS - 1), /too small/);
  assert.throws(() => validateTimeout(MAX_DISPATCH_TIMEOUT_MS + 1), /too large/);
});

// ─── codex skills-config sanitizer (ISSUE-codex-review-hijack) ─────────
test('stripCodexSkillsConfig removes skills tables, keeps model/provider/mcp', () => {
  const toml = [
    'model = "gpt-5.5"',
    '',
    '[[skills.config]]',
    'path = "/home/u/.codex/skills/gstack-review"',
    'enabled = true',
    '',
    '[[skills.config]]',
    'path = "/home/u/.codex/skills/using-superpowers"',
    'enabled = true',
    '',
    '[model_providers.openai]',
    'name = "OpenAI"',
    '',
    '[skills]',
    'autoload = true',
    '',
    '[mcp_servers.fs]',
    'command = "fs-server"',
  ].join('\n');
  const out = stripCodexSkillsConfig(toml);
  assert.ok(!/skills/i.test(out), `all skills config must be stripped; got:\n${out}`);
  assert.match(out, /model = "gpt-5\.5"/, 'top-level model preserved');
  assert.match(out, /\[model_providers\.openai\]/, 'provider table preserved');
  assert.match(out, /\[mcp_servers\.fs\]/, 'mcp table preserved');
  assert.match(out, /command = "fs-server"/, 'mcp body preserved');
});

test('stripCodexSkillsConfig is a no-op when there are no skills', () => {
  const toml = 'model = "gpt-5.5"\n\n[model_providers.openai]\nname = "OpenAI"\n';
  assert.equal(stripCodexSkillsConfig(toml), toml.replace(/\r\n/g, '\n'));
});
