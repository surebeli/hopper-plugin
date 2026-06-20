// Size-gated pointer prompt delivery (ISSUE-codex-bypass-flag-missing-from-argv follow-up).
// Anchor: tests/unit/prompt-delivery.test.js
//
// When the would-be vendor command line is too large for the OS limit (cmd.exe
// ~8191 / CreateProcess 32767), hopper writes the composed prompt to a file and
// passes the vendor a SMALL pointer instruction ("read file X and follow it").
// The size decision must be ENCODING-AWARE: Chinese/mixed text costs more bytes
// than its character count, and the regime (cmd.exe shim vs native .exe vs POSIX)
// sets the budget.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, existsSync, readFileSync, statSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { join } from 'node:path';
import {
  commandLineRegime,
  commandLineBytes,
  inlineBudgetBytes,
  buildPointerInstruction,
  resolvePromptDelivery,
  DEFAULT_INLINE_BUDGETS,
} from '../../cli/src/prompt-delivery.js';
import { codexAdapter } from '../../cli/src/vendors/codex.js';

// A minimal real fake adapter (no mock framework): prompt is the last positional.
const fakeAdapter = { name: 'fake', command: 'fake', args: (input) => ['run', '--flag', input] };

// ── commandLineBytes: UTF-8, encoding-aware (the multilingual concern) ──
test('commandLineBytes counts ASCII as 1 byte/char', () => {
  assert.equal(commandLineBytes(['abc']), 3);
});

test('commandLineBytes counts each Chinese char as 3 UTF-8 bytes (not 1)', () => {
  // 100 Chinese chars = 100 .length but 300 UTF-8 bytes — the whole point.
  assert.equal(commandLineBytes(['中'.repeat(100)]), 300);
});

test('commandLineBytes handles mixed scripts and emoji additively', () => {
  // 'a' (1) + '中' (3) + '😀' (4) + one join-space-less single part
  assert.equal(commandLineBytes(['a中😀']), 1 + 3 + 4);
});

test('commandLineBytes joins multiple argv parts with single spaces', () => {
  assert.equal(commandLineBytes(['ab', 'cd']), 2 + 1 + 2); // "ab cd"
});

// ── commandLineRegime: which OS limit applies ──
test('commandLineRegime: cmd.exe wrapper is cmd-shim', () => {
  assert.equal(commandLineRegime('C:\\Windows\\System32\\cmd.exe', ['/c', 'C:\\x\\codex.cmd'], { isWindows: true }), 'cmd-shim');
});

test('commandLineRegime: .cmd/.bat in prependArgs is cmd-shim even if cmd path lowercased', () => {
  assert.equal(commandLineRegime('cmd.exe', ['/c', 'foo.BAT'], { isWindows: true }), 'cmd-shim');
});

test('commandLineRegime: native .exe on Windows is native-exe', () => {
  assert.equal(commandLineRegime('C:\\Users\\me\\.bun\\bin\\kimi.EXE', [], { isWindows: true }), 'native-exe');
});

test('commandLineRegime: POSIX is always posix', () => {
  assert.equal(commandLineRegime('/usr/bin/codex', [], { isWindows: false }), 'posix');
});

// ── inlineBudgetBytes: per-regime defaults + env override ──
test('inlineBudgetBytes returns conservative per-regime defaults', () => {
  assert.equal(inlineBudgetBytes('cmd-shim', {}), DEFAULT_INLINE_BUDGETS['cmd-shim']);
  assert.equal(inlineBudgetBytes('native-exe', {}), DEFAULT_INLINE_BUDGETS['native-exe']);
  assert.equal(inlineBudgetBytes('posix', {}), DEFAULT_INLINE_BUDGETS['posix']);
  assert.ok(DEFAULT_INLINE_BUDGETS['cmd-shim'] < DEFAULT_INLINE_BUDGETS['native-exe']);
});

test('inlineBudgetBytes honors env override per regime', () => {
  assert.equal(inlineBudgetBytes('cmd-shim', { HOPPER_INLINE_PROMPT_MAX_CMDSHIM: '1234' }), 1234);
  assert.equal(inlineBudgetBytes('native-exe', { HOPPER_INLINE_PROMPT_MAX_NATIVE: '9999' }), 9999);
});

// ── buildPointerInstruction ──
test('buildPointerInstruction references the path and tells the agent to read+follow it', () => {
  const p = 'F:/repo/.hopper/handoffs/T-1-prompt.md';
  const s = buildPointerInstruction(p);
  assert.ok(s.includes(p), 'must include the absolute path');
  assert.match(s, /read/i);
  assert.match(s, /follow/i);
});

// ── resolvePromptDelivery: the gating decision ──
test('resolvePromptDelivery INLINES a small prompt (no file written)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pd-'));
  try {
    const res = resolvePromptDelivery({
      adapter: fakeAdapter, composedPrompt: 'do the thing', opts: {},
      resolvedCmd: 'cmd.exe', prependArgs: ['/c', 'fake.cmd'],
      handoffsDir: dir, taskId: 'T-SMALL', isWindows: true, env: {},
    });
    assert.equal(res.inlined, true);
    assert.equal(res.promptFilePath, null);
    assert.deepEqual(res.args, ['run', '--flag', 'do the thing']);
    assert.equal(existsSync(join(dir, 'T-SMALL-prompt.md')), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('resolvePromptDelivery switches to POINTER for an over-budget prompt and writes the file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pd-'));
  try {
    const big = 'x'.repeat(7000); // > 6000 cmd-shim budget (ASCII)
    const res = resolvePromptDelivery({
      adapter: fakeAdapter, composedPrompt: big, opts: {},
      resolvedCmd: 'cmd.exe', prependArgs: ['/c', 'fake.cmd'],
      handoffsDir: dir, taskId: 'T-BIG', isWindows: true, env: {},
    });
    assert.equal(res.inlined, false);
    const f = join(dir, 'T-BIG-prompt.md');
    assert.equal(res.promptFilePath, f);
    assert.equal(existsSync(f), true);
    assert.equal(readFileSync(f, 'utf-8'), big, 'file holds the full composed prompt verbatim');
    // args now carry the small pointer, NOT the 7000-char prompt
    assert.ok(!res.args.includes(big), 'over-long prompt must NOT be in argv');
    // argv references the prompt file (path is forward-slashed in the pointer for
    // agent safety; assert by basename so the check is slash-direction-agnostic).
    assert.ok(res.args.some((a) => typeof a === 'string' && a.includes('T-BIG-prompt.md')), 'argv must reference the prompt file');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('resolvePromptDelivery: Chinese prompt triggers pointer by BYTES even when char count is under budget', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pd-'));
  try {
    // 2500 Chinese chars: .length = 2500 (< 6000), but UTF-8 bytes = 7500 (> 6000).
    // A char-based gate would WRONGLY inline this; the byte gate must switch to pointer.
    const zh = '中'.repeat(2500);
    assert.ok(zh.length < DEFAULT_INLINE_BUDGETS['cmd-shim'], 'precondition: char count under budget');
    const res = resolvePromptDelivery({
      adapter: fakeAdapter, composedPrompt: zh, opts: {},
      resolvedCmd: 'cmd.exe', prependArgs: ['/c', 'fake.cmd'],
      handoffsDir: dir, taskId: 'T-ZH', isWindows: true, env: {},
    });
    assert.equal(res.inlined, false, 'Chinese prompt over the BYTE budget must use the pointer');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('resolvePromptDelivery: same Chinese prompt INLINES under the larger native-exe budget', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pd-'));
  try {
    const zh = '中'.repeat(2500); // 7500 bytes < native-exe budget (28000)
    const res = resolvePromptDelivery({
      adapter: fakeAdapter, composedPrompt: zh, opts: {},
      resolvedCmd: 'C:\\bin\\kimi.EXE', prependArgs: [],
      handoffsDir: dir, taskId: 'T-ZH-NATIVE', isWindows: true, env: {},
    });
    assert.equal(res.inlined, true, 'native-exe regime tolerates a much larger inline prompt');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('resolvePromptDelivery: env override lowers the budget so a small prompt uses the pointer', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pd-'));
  try {
    const res = resolvePromptDelivery({
      adapter: fakeAdapter, composedPrompt: 'modest prompt text here', opts: {},
      resolvedCmd: 'cmd.exe', prependArgs: ['/c', 'fake.cmd'],
      handoffsDir: dir, taskId: 'T-ENV', isWindows: true,
      env: { HOPPER_INLINE_PROMPT_MAX_CMDSHIM: '10' },
    });
    assert.equal(res.inlined, false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ── real codex adapter: gating composes with the prompt-last reorder + bypass flag ──
test('REAL codex adapter: small prompt stays inline, prompt last, bypass flag present', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pd-'));
  try {
    const res = resolvePromptDelivery({
      adapter: codexAdapter, composedPrompt: 'small task', opts: { sandbox: 'danger-full-access', cwd: 'F:/x' },
      resolvedCmd: 'cmd.exe', prependArgs: ['/c', 'codex.cmd'],
      handoffsDir: dir, taskId: 'T-CDX-SM', isWindows: true, env: {},
    });
    assert.equal(res.inlined, true);
    assert.equal(res.args[res.args.length - 1], 'small task', 'prompt stays the last positional');
    assert.ok(res.args.includes('--dangerously-bypass-approvals-and-sandbox'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('REAL codex adapter: huge prompt -> pointer file; bypass flag survives, prompt off argv', () => {
  const root = mkdtempSync(join(tmpdir(), 'repo-'));
  const handoffsDir = join(root, '.hopper', 'handoffs'); // under the vendor cwd (root)
  try {
    const huge = 'PROMPT '.repeat(2000); // ~14000 bytes >> cmd-shim budget
    const res = resolvePromptDelivery({
      adapter: codexAdapter, composedPrompt: huge, opts: { sandbox: 'danger-full-access', cwd: root },
      resolvedCmd: 'cmd.exe', prependArgs: ['/c', 'codex.cmd'],
      handoffsDir, taskId: 'T-CDX-BIG', isWindows: true, env: {},
    });
    assert.equal(res.inlined, false);
    assert.equal(readFileSync(res.promptFilePath, 'utf-8'), huge, 'prompt file holds the full brief');
    assert.ok(!res.args.includes(huge), 'huge prompt must be OFF the command line');
    assert.ok(res.args.includes('--dangerously-bypass-approvals-and-sandbox'), 'bypass flag still reaches codex');
    assert.ok(res.args.some((a) => typeof a === 'string' && a.includes('T-CDX-BIG-prompt.md')), 'argv points at the prompt file');
    const bytes = commandLineBytes(['cmd.exe', '/c', 'codex.cmd', ...res.args]);
    assert.ok(bytes < 2000, 'pointer command line is tiny (' + bytes + 'B) — no truncation risk');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// ── review fix: re-dispatch must re-tighten the prompt file to 0600 ──
test('resolvePromptDelivery re-applies 0600 even when the prompt file already exists (POSIX)', { skip: platform() === 'win32' ? 'POSIX mode bits only' : false }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'pd-'));
  try {
    const f = join(dir, 'T-REWRITE-prompt.md');
    writeFileSync(f, 'stale', { mode: 0o644 });
    chmodSync(f, 0o644); // pre-existing world-readable file (e.g. from a prior run)
    const res = resolvePromptDelivery({
      adapter: fakeAdapter, composedPrompt: 'z'.repeat(7000), opts: {},
      resolvedCmd: 'cmd.exe', prependArgs: ['/c', 'fake.cmd'],
      handoffsDir: dir, taskId: 'T-REWRITE', isWindows: true, env: {},
    });
    assert.equal(res.inlined, false);
    assert.equal(statSync(res.promptFilePath).mode & 0o777, 0o600, 'overwrite must re-tighten perms to owner-only');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ── review fix: pointer file outside the vendor cwd -> fall back to inline (not a silent no-op) ──
test('resolvePromptDelivery falls back to INLINE when the prompt file would be outside opts.cwd', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'vendorcwd-'));
  const handoffsDir = mkdtempSync(join(tmpdir(), 'elsewhere-')); // NOT under cwd
  try {
    const res = resolvePromptDelivery({
      adapter: fakeAdapter, composedPrompt: 'q'.repeat(7000), opts: { cwd },
      resolvedCmd: 'cmd.exe', prependArgs: ['/c', 'fake.cmd'],
      handoffsDir, taskId: 'T-OUTSIDE', isWindows: true, env: {},
    });
    assert.equal(res.inlined, true, 'unreadable pointer target must not be used');
    assert.equal(res.promptFilePath, null);
    assert.ok(res.fallbackReason && /cwd|scope|outside/i.test(res.fallbackReason), 'fallbackReason must explain the cwd-scope miss');
    assert.equal(existsSync(join(handoffsDir, 'T-OUTSIDE-prompt.md')), false, 'no file written outside cwd');
  } finally { rmSync(cwd, { recursive: true, force: true }); rmSync(handoffsDir, { recursive: true, force: true }); }
});

// ── review fix: write failure must fall back to inline (never break dispatch) with a fallbackReason ──
test('resolvePromptDelivery falls back to INLINE with fallbackReason when the prompt file cannot be written', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pd-'));
  try {
    // handoffsDir under a regular FILE -> mkdirSync throws ENOTDIR (cross-platform).
    const blocker = join(dir, 'iam-a-file');
    writeFileSync(blocker, 'x');
    const res = resolvePromptDelivery({
      adapter: fakeAdapter, composedPrompt: 'w'.repeat(7000), opts: {},
      resolvedCmd: 'cmd.exe', prependArgs: ['/c', 'fake.cmd'],
      handoffsDir: join(blocker, 'sub'), taskId: 'T-WRITEFAIL', isWindows: true, env: {},
    });
    assert.equal(res.inlined, true, 'write failure must not break dispatch — fall back to inline');
    assert.equal(res.promptFilePath, null);
    assert.ok(res.fallbackReason, 'fallbackReason must be set so the caller can warn loudly');
    assert.deepEqual(res.args, fakeAdapter.args('w'.repeat(7000), {}), 'inline args are the full prompt');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('resolvePromptDelivery writes the prompt file owner-only (0600) on POSIX', { skip: platform() === 'win32' ? 'POSIX mode bits only' : false }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'pd-'));
  try {
    const res = resolvePromptDelivery({
      adapter: fakeAdapter, composedPrompt: 'y'.repeat(7000), opts: {},
      resolvedCmd: 'cmd.exe', prependArgs: ['/c', 'fake.cmd'],
      handoffsDir: dir, taskId: 'T-MODE', isWindows: true, env: {},
    });
    const mode = statSync(res.promptFilePath).mode & 0o777;
    assert.equal(mode, 0o600, 'prompt file must be owner-only (contains the sensitive brief)');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
