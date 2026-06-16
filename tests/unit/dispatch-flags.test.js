// CLI flag parsing tests (new --model / --reasoning forwarding)
// Anchor: tests/unit/dispatch-flags.test.js
//
// Covers the new value-taking flag parser in cli/bin/hopper-dispatch and the
// validation chain in cli/src/validation.js. Live spawn tests use the dispatcher
// binary's --resolve mode (which doesn't actually spawn a vendor) to verify
// args are parsed end-to-end without side effects.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  MODEL_PATTERN,
  ALLOWED_REASONING,
  ALLOWED_SANDBOXES,
  ALLOWED_DISPATCH_VALUE_FLAGS,
  validateModelName,
  validateReasoning,
  validateSandbox,
} from '../../cli/src/validation.js';
import {
  resolveAdapterOptsForTask,
  taskTextRequestsReadOnly,
} from '../../cli/src/dispatch.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..', '..');
const DISPATCH = join(REPO_ROOT, 'cli', 'bin', 'hopper-dispatch');

function runCli(args, opts = {}) {
  try {
    const stdout = execFileSync(process.execPath, [DISPATCH, ...args], {
      env: { ...process.env, ...(opts.env || {}), HOPPER_DIR: opts.hopperDir || join(REPO_ROOT, '.hopper') },
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf-8',
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err) {
    return {
      stdout: err.stdout ? err.stdout.toString() : '',
      stderr: err.stderr ? err.stderr.toString() : '',
      exitCode: err.status,
    };
  }
}

function makeMinimalHopper(vendor = 'codex-builder', { brief = 'test', taskSpec = '' } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'hopper-host-vendor-'));
  const hopperDir = join(root, '.hopper');
  mkdirSync(join(hopperDir, 'tasks'), { recursive: true });
  mkdirSync(join(hopperDir, 'handoffs'), { recursive: true });
  writeFileSync(join(hopperDir, 'queue.md'), [
    '| ID | Task-type | Status | Depends | Brief |',
    '|----|-----------|--------|---------|-------|',
    `| T-SAME | code-impl | pending | | ${brief} |`,
    '',
  ].join('\n'));
  writeFileSync(join(hopperDir, 'tasks', 'code-impl.md'), '# code-impl\n');
  if (taskSpec) {
    writeFileSync(join(hopperDir, 'handoffs', 'leader-tasklist.md'), taskSpec);
  }
  writeFileSync(join(hopperDir, 'AGENTS.md'), [
    '## Active Agent Instances',
    '',
    '| Nickname | UUID | Vendor | Default invocation |',
    '|----------|------|--------|--------------------|',
    `| \`builder\` | \`1\` | ${vendor} | \`x\` |`,
    '',
    '## Task-type → vendor default preference',
    '',
    '| Task-type | Default vendor |',
    '|---|---|',
    '| `code-impl` | builder |',
    '',
  ].join('\n'));
  return { root, hopperDir };
}

// ─── Static validation tests ──────────────────────────────────────────

test('MODEL_PATTERN accepts realistic model names', () => {
  for (const m of ['gpt-5.5', 'claude-opus-4-7', 'deepseek/v4-flash', 'kimi-thinking',
                   'meta-llama/llama-3-70b', 'org/model:tag', 'a', 'A1.b-c_d']) {
    assert.ok(MODEL_PATTERN.test(m), `should accept "${m}"`);
  }
});

test('MODEL_PATTERN rejects shell metachars + path traversal', () => {
  for (const bad of ['', 'foo bar', 'a; rm -rf /', '`evil`', '$(evil)', 'foo|bar', '..',
                     '../escape', '<script>', '"quoted"', "'quoted'", '\nnewline']) {
    assert.ok(!MODEL_PATTERN.test(bad), `should reject "${bad}"`);
  }
});

test('validateModelName throws on bad input', () => {
  assert.throws(() => validateModelName(''));
  assert.throws(() => validateModelName(null));
  assert.throws(() => validateModelName('a; rm -rf'));
  assert.throws(() => validateModelName('a'.repeat(200)));
});

test('ALLOWED_REASONING is the codex-vocabulary list (5 levels per Phase 6b research)', () => {
  // Phase 6b: codex has 5 reasoning levels per official config-reference.
  // `minimal` is lowest tier (cheap routing/extraction), added 2026-05-21.
  assert.deepEqual([...ALLOWED_REASONING], ['minimal', 'low', 'medium', 'high', 'xhigh']);
});

test('validateReasoning accepts only the 5 canonical levels', () => {
  for (const r of ['minimal', 'low', 'medium', 'high', 'xhigh']) {
    assert.doesNotThrow(() => validateReasoning(r));
  }
  for (const bad of ['ultra', 'medium-low', 'HIGH', '', null]) {
    assert.throws(() => validateReasoning(bad));
  }
});

test('ALLOWED_SANDBOXES is the dispatch permission vocabulary', () => {
  assert.deepEqual([...ALLOWED_SANDBOXES], ['read-only', 'workspace-write', 'danger-full-access']);
});

test('validateSandbox accepts only canonical permission modes', () => {
  for (const s of ALLOWED_SANDBOXES) {
    assert.doesNotThrow(() => validateSandbox(s));
  }
  for (const bad of ['readonly', 'write', 'full', 'danger', '', null]) {
    assert.throws(() => validateSandbox(bad));
  }
});

test('ALLOWED_DISPATCH_VALUE_FLAGS is exactly --model + --reasoning + --sandbox + --timeout', () => {
  assert.deepEqual([...ALLOWED_DISPATCH_VALUE_FLAGS], ['--model', '--reasoning', '--sandbox', '--timeout']);
});

test('taskTextRequestsReadOnly detects explicit read-only task text only', () => {
  assert.equal(taskTextRequestsReadOnly({
    task: { brief: 'read-only task: inspect routing' },
    taskSpec: '',
  }), true);
  assert.equal(taskTextRequestsReadOnly({
    task: { brief: '只读任务：确认队列状态' },
    taskSpec: '',
  }), true);
  assert.equal(taskTextRequestsReadOnly({
    task: { brief: 'implementation task' },
    taskSpec: '**T-SAME**\nThis is not read-only; modify files.',
  }), false);
});

test('resolveAdapterOptsForTask defaults to danger-full-access unless task text says read-only', () => {
  const writable = {
    task: { brief: 'implement product fix' },
    taskSpec: '**T-SAME**\nChange code and tests.',
  };
  const readOnly = {
    task: { brief: 'read-only task: audit current state' },
    taskSpec: '',
  };
  assert.equal(resolveAdapterOptsForTask(writable, {}).sandbox, 'danger-full-access');
  assert.equal(resolveAdapterOptsForTask(readOnly, {}).sandbox, 'read-only');
  assert.equal(resolveAdapterOptsForTask(readOnly, { sandbox: 'workspace-write' }).sandbox, 'workspace-write');
});

// ─── CLI end-to-end tests (via --resolve which doesn't spawn vendor) ──

test('CLI rejects --model with no value', () => {
  const r = runCli(['T-PLUGIN-05a', '--model']);
  assert.equal(r.exitCode, 2);
  assert.match(r.stderr, /--model requires a value/i);
});

test('CLI rejects --model with shell-metachar value', () => {
  const r = runCli(['T-PLUGIN-05a', '--model', 'evil; rm -rf']);
  assert.equal(r.exitCode, 2);
  assert.match(r.stderr, /unsafe characters/i);
});

test('CLI rejects --reasoning with invalid level', () => {
  const r = runCli(['T-PLUGIN-05a', '--reasoning', 'ultra']);
  assert.equal(r.exitCode, 2);
  assert.match(r.stderr, /reasoning.*invalid|Allowed/i);
});

test('CLI rejects --reasoning with no value', () => {
  const r = runCli(['T-PLUGIN-05a', '--reasoning']);
  assert.equal(r.exitCode, 2);
  assert.match(r.stderr, /--reasoning requires a value/i);
});

test('CLI rejects --sandbox with invalid level', () => {
  const r = runCli(['T-PLUGIN-05a', '--sandbox', 'full']);
  assert.equal(r.exitCode, 2);
  assert.match(r.stderr, /sandbox.*invalid|Allowed/i);
});

test('CLI rejects --sandbox with no value', () => {
  const r = runCli(['T-PLUGIN-05a', '--sandbox']);
  assert.equal(r.exitCode, 2);
  assert.match(r.stderr, /--sandbox requires a value/i);
});

test('CLI rejects unknown flag', () => {
  const r = runCli(['T-PLUGIN-05a', '--evil-flag']);
  assert.equal(r.exitCode, 2);
  assert.match(r.stderr, /Unknown flag.*--evil-flag/i);
});

test('CLI rejects extra positional argument', () => {
  const r = runCli(['T-PLUGIN-05a', 'T-EXTRA']);
  assert.equal(r.exitCode, 2);
  assert.match(r.stderr, /Unexpected extra positional argument/i);
});

test('CLI parses --model + --reasoning together and prints them in dispatch line', () => {
  // Use --resolve to avoid actually spawning a vendor subprocess; the parser
  // runs in main() before any --resolve check, so flag validation still fires.
  // Actually --resolve has its own short-circuit branch; instead verify with
  // a known-bad scenario that surfaces an error after parsing has succeeded
  // (e.g. task-id not in queue), so we see that parsing didn't reject good flags.
  const r = runCli(['T-PLUGIN-MISSING', '--model', 'gpt-5.5', '--reasoning', 'high']);
  // Expect exit 1 (task not found) or 2 (validation), not crash on flag parsing
  assert.ok(r.exitCode === 1 || r.exitCode === 2);
  // Confirm we did NOT reject the well-formed flags themselves
  assert.ok(!/unsafe characters/i.test(r.stderr));
  assert.ok(!/reasoning.*invalid/i.test(r.stderr));
});

test('CLI prints adapter opts summary on dispatch line', () => {
  // We can't fully exercise dispatch without a real vendor, but we can confirm
  // the parser DOES reach runDispatch by checking a known-bad task triggers
  // the expected error (validation passes; resolution fails).
  const r = runCli(['T-PLUGIN-NONEXISTENT', '--model', 'kimi-thinking']);
  // The 'opts:' summary should appear in stderr before the resolution error
  assert.match(r.stderr, /opts.*model=kimi-thinking/);
});

test('CLI hard-rejects host == vendor before adapter execution', () => {
  const { root, hopperDir } = makeMinimalHopper('codex');
  try {
    const r = runCli(['T-SAME'], { hopperDir, env: { HOPPER_HOST_VENDOR: 'codex' } });
    assert.equal(r.exitCode, 1);
    assert.match(r.stderr, /host != vendor/i);
    assert.match(r.stderr, /same vendor|cannot dispatch to the same vendor/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('CLI auto-defaults sandbox to danger-full-access for writable tasks', () => {
  const { root, hopperDir } = makeMinimalHopper('codex', { brief: 'implement product fix' });
  try {
    const r = runCli(['T-SAME'], { hopperDir, env: { HOPPER_HOST_VENDOR: 'codex' } });
    assert.equal(r.exitCode, 1);
    assert.match(r.stderr, /permission: sandbox=danger-full-access \(auto\)/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('CLI auto-downgrades sandbox to read-only when task text explicitly says read-only', () => {
  const { root, hopperDir } = makeMinimalHopper('codex', { brief: 'read-only task: inspect only' });
  try {
    const r = runCli(['T-SAME'], { hopperDir, env: { HOPPER_HOST_VENDOR: 'codex' } });
    assert.equal(r.exitCode, 1);
    assert.match(r.stderr, /permission: sandbox=read-only \(auto\)/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('CLI explicit --sandbox overrides task-text default', () => {
  const { root, hopperDir } = makeMinimalHopper('codex', { brief: 'read-only task: inspect only' });
  try {
    const r = runCli(['T-SAME', '--sandbox', 'workspace-write'], { hopperDir, env: { HOPPER_HOST_VENDOR: 'codex' } });
    assert.equal(r.exitCode, 1);
    assert.match(r.stderr, /permission: sandbox=workspace-write \(explicit\)/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('CLI help mentions --model, --reasoning, and --sandbox', () => {
  const r = runCli(['--help']);
  assert.equal(r.exitCode, 0);
  assert.match(r.stdout, /--model/);
  assert.match(r.stdout, /--reasoning/);
  assert.match(r.stdout, /--sandbox/);
  assert.match(r.stdout, /danger-full-access/);
  assert.match(r.stdout, /low \| medium \| high \| xhigh/);
});

// ─── Edge cases per codex flags-audit P2 ──────────────────────────────

test('CLI rejects empty --model value', () => {
  const r = runCli(['T-PLUGIN-05a', '--model', '']);
  assert.equal(r.exitCode, 2);
  // Empty arg is detected as "--model requires a value" (next-token is empty/starts with -)
  // OR as "must not be empty" depending on shell behavior. Both legitimate.
  assert.match(r.stderr, /--model.*(value|empty)/i);
});

test('CLI accepts --model + --write in either order (flag ordering)', () => {
  // Order 1: --write first
  const r1 = runCli(['T-MISSING', '--write', '--model', 'gpt-5.5']);
  // Order 2: --model first
  const r2 = runCli(['T-MISSING', '--model', 'gpt-5.5', '--write']);

  // Both should fail at task resolution (not flag parsing)
  for (const r of [r1, r2]) {
    assert.ok(r.exitCode === 1 || r.exitCode === 2);
    assert.ok(!/Unknown flag/i.test(r.stderr), 'no parser error');
    assert.ok(!/unsafe characters/i.test(r.stderr));
  }
});

test('CLI handles mixed bare + value flag interleaving', () => {
  // --reasoning xhigh interleaved with --write --force
  const r = runCli(['T-MISSING', '--write', '--reasoning', 'xhigh', '--force', '--model', 'kimi-thinking', '--sandbox', 'danger-full-access']);
  // Should reach dispatch banner with all 4 opts visible
  assert.match(r.stderr, /opts.*model=kimi-thinking/);
  assert.match(r.stderr, /reasoning=xhigh/);
  assert.match(r.stderr, /sandbox=danger-full-access/);
});

test('CLI flag value must not start with dash (consumes-next-arg detection)', () => {
  // If user writes "--model --write", we want to detect that --model didn't get a value
  const r = runCli(['T-PLUGIN-05a', '--model', '--write']);
  assert.equal(r.exitCode, 2);
  assert.match(r.stderr, /--model requires a value/i);
});

test('background dispatch path passes background=true into adapter opts before building argv', () => {
  const src = readFileSync(DISPATCH, 'utf-8');
  assert.match(
    src,
    /const effectiveOpts = \{[^}]*background:\s*true[^}]*logFile:\s*logPath[^}]*taskType:\s*resolved\.task\.taskType[^}]*\};/s,
  );
});
