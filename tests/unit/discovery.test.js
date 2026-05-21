// Discovery API tests (Phase 6a — --check + --capabilities)
// Anchor: tests/unit/discovery.test.js

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  resolveCommandOnPath,
  isCommandAvailable,
} from '../../cli/src/path-resolve.js';
import {
  listAdapters,
  installCheckForAdapter,
  capabilitiesForAdapter,
  getAdapter,
} from '../../cli/src/vendors/index.js';

// ─── path-resolve.js ──────────────────────────────────────────────────
// Cross-platform note: tests run on Windows + macOS + Linux. Mac-specific
// exec-bit semantics are tested via a POSIX-only `chmod` test below; on
// Windows that test is auto-skipped because exec bit doesn't apply.

test('resolveCommandOnPath: node is always findable (test self-validates)', () => {
  // process.execPath is guaranteed to exist; spawn it as a basename test.
  // On Windows it's node.exe; on POSIX it's node. The PATH-walk should find it.
  const r = resolveCommandOnPath('node');
  assert.ok(r !== null, 'node should be findable on PATH');
  assert.ok(r.resolvedPath, 'resolvedPath populated when found on PATH');
});

test('resolveCommandOnPath: returns null for nonexistent command', () => {
  const r = resolveCommandOnPath('this-command-definitely-does-not-exist-zzz');
  assert.equal(r, null);
});

test('resolveCommandOnPath: pre-qualified path passes through unchanged', () => {
  const r = resolveCommandOnPath('/usr/bin/foo');
  assert.equal(r.command, '/usr/bin/foo');
  assert.deepEqual(r.prependArgs, []);
  assert.equal(r.resolvedPath, null);
});

test('resolveCommandOnPath: command with extension passes through unchanged', () => {
  const r = resolveCommandOnPath('node.exe');
  assert.equal(r.command, 'node.exe');
  assert.deepEqual(r.prependArgs, []);
});

test('isCommandAvailable: returns boolean', () => {
  assert.equal(isCommandAvailable('node'), true);
  assert.equal(isCommandAvailable('this-cmd-does-not-exist-zzz'), false);
});

// ─── POSIX exec-bit check (Mac + Linux) ────────────────────────────────
// Verifies the resolver does NOT falsely "find" a file without exec permission.
// Skipped on Windows because Windows exec semantics are extension-based, not
// permission-based (PATHEXT instead of chmod).

test('POSIX: resolveCommandOnPath skips file without exec bit', { skip: process.platform === 'win32' ? 'Windows uses PATHEXT, not exec bit' : false }, async () => {
  const { mkdtempSync, writeFileSync, chmodSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');

  const tmp = mkdtempSync(join(tmpdir(), 'hopper-pathres-'));
  try {
    // Plant a file named 'fake-vendor-xyz' WITHOUT exec bit
    const nonExec = join(tmp, 'fake-vendor-xyz');
    writeFileSync(nonExec, '#!/bin/sh\necho hello\n', 'utf-8');
    chmodSync(nonExec, 0o644);  // rw-r--r-- — no exec

    // Run resolver with this dir prepended to PATH
    const oldPath = process.env.PATH;
    process.env.PATH = tmp + ':' + (oldPath || '');
    try {
      const r = resolveCommandOnPath('fake-vendor-xyz');
      assert.equal(r, null,
        'POSIX resolver MUST skip non-executable file; found anyway');
    } finally {
      process.env.PATH = oldPath;
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('POSIX: resolveCommandOnPath finds file WITH exec bit', { skip: process.platform === 'win32' ? 'Windows uses PATHEXT, not exec bit' : false }, async () => {
  const { mkdtempSync, writeFileSync, chmodSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');

  const tmp = mkdtempSync(join(tmpdir(), 'hopper-pathres-ok-'));
  try {
    const execScript = join(tmp, 'fake-vendor-ok');
    writeFileSync(execScript, '#!/bin/sh\necho hello\n', 'utf-8');
    chmodSync(execScript, 0o755);  // rwxr-xr-x — executable

    const oldPath = process.env.PATH;
    process.env.PATH = tmp + ':' + (oldPath || '');
    try {
      const r = resolveCommandOnPath('fake-vendor-ok');
      assert.ok(r !== null, 'POSIX resolver must find executable file');
      assert.equal(r.resolvedPath, execScript);
      assert.deepEqual(r.prependArgs, []);
    } finally {
      process.env.PATH = oldPath;
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('POSIX: resolveCommandOnPath walks PATH dirs in order (first match wins)', { skip: process.platform === 'win32' ? 'Windows uses PATHEXT walk' : false }, async () => {
  const { mkdtempSync, writeFileSync, chmodSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');

  const tmp1 = mkdtempSync(join(tmpdir(), 'hopper-pathres-dir1-'));
  const tmp2 = mkdtempSync(join(tmpdir(), 'hopper-pathres-dir2-'));
  try {
    // Plant 'fake-vendor-multi' in BOTH dirs
    const f1 = join(tmp1, 'fake-vendor-multi');
    const f2 = join(tmp2, 'fake-vendor-multi');
    writeFileSync(f1, '#!/bin/sh\necho dir1\n', 'utf-8');
    writeFileSync(f2, '#!/bin/sh\necho dir2\n', 'utf-8');
    chmodSync(f1, 0o755);
    chmodSync(f2, 0o755);

    const oldPath = process.env.PATH;
    process.env.PATH = tmp1 + ':' + tmp2 + ':' + (oldPath || '');
    try {
      const r = resolveCommandOnPath('fake-vendor-multi');
      assert.equal(r.resolvedPath, f1,
        'first PATH dir must win — got ' + r.resolvedPath);
    } finally {
      process.env.PATH = oldPath;
    }
  } finally {
    rmSync(tmp1, { recursive: true, force: true });
    rmSync(tmp2, { recursive: true, force: true });
  }
});

// ─── Windows-specific PATHEXT tests are inherent to running on Windows ──
// (No way to spoof PATHEXT semantics from POSIX. The Windows-host machine
// running tests IS the test. Real Windows verification covered by the
// production smoke runs the user did on this machine.)

// ─── installCheckForAdapter ───────────────────────────────────────────

test('installCheckForAdapter throws on unknown vendor', async () => {
  await assert.rejects(
    () => installCheckForAdapter('nonexistent'),
    /No vendor adapter registered/
  );
});

test('installCheckForAdapter returns expected shape for each registered vendor', async () => {
  for (const name of listAdapters()) {
    const r = await installCheckForAdapter(name);
    assert.equal(r.name, name);
    assert.ok(typeof r.command === 'string');
    assert.ok(typeof r.binaryFound === 'boolean');
    assert.ok(typeof r.authOk === 'boolean');
    assert.ok(Array.isArray(r.authNotes));
    assert.ok(['READY', 'AUTH_NEEDED', 'NOT_INSTALLED', 'UNKNOWN'].includes(r.overallStatus),
      `overallStatus must be one of READY/AUTH_NEEDED/NOT_INSTALLED/UNKNOWN; got ${r.overallStatus}`);
    if (r.binaryFound) {
      assert.ok(typeof r.resolvedPath === 'string', 'resolvedPath populated when found');
      assert.ok(typeof r.needsShellWrap === 'boolean');
    } else {
      assert.equal(r.resolvedPath, null);
    }
  }
});

test('installCheckForAdapter does NOT spawn vendor subprocess (single-spawn proof)', async () => {
  // Per spec §3 #4: discovery must not break the single-spawn proof.
  // Per codex Phase 6a strict audit P2 #5 + recheck F2 #5 tightening:
  // this test scans every file whose CODE PATH is REACHED by --check or
  // --capabilities. It does NOT scan files merely imported transitively
  // (e.g. background.js, subprocess.js) — those legitimately contain spawn
  // call sites for dispatch/runner paths NEVER entered during discovery.
  //
  // The integrity argument is: the imports of those modules don't execute
  // their spawn-containing functions; only resolveCommandOnPath +
  // adapter.capabilities/envPreflight execute, and those live in files
  // listed here. Future regressions in adapter init code that called
  // spawn at top-level would be caught.
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { dirname, resolve, join } = await import('node:path');
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const REPO_ROOT = resolve(__dirname, '..', '..');

  // Files whose CODE is invoked during --check / --capabilities:
  // - path-resolve.js: called by installCheckForAdapter
  // - vendors/index.js: installCheckForAdapter + capabilitiesForAdapter
  // - vendors/*.js: each adapter's envPreflight() runs during installCheck
  const filesToScan = [
    join(REPO_ROOT, 'cli', 'src', 'path-resolve.js'),
    join(REPO_ROOT, 'cli', 'src', 'vendors', 'index.js'),
    join(REPO_ROOT, 'cli', 'src', 'vendors', 'codex.js'),
    join(REPO_ROOT, 'cli', 'src', 'vendors', 'kimi.js'),
    join(REPO_ROOT, 'cli', 'src', 'vendors', 'opencode.js'),
    join(REPO_ROOT, 'cli', 'src', 'vendors', 'copilot.js'),
    join(REPO_ROOT, 'cli', 'src', 'vendors', 'agy.js'),
  ];

  const stripCodeOnly = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/'[^']*'/g, "''")
    .replace(/"[^"]*"/g, '""')
    .replace(/`[^`]*`/g, '``');

  for (const f of filesToScan) {
    const src = readFileSync(f, 'utf-8');
    const code = stripCodeOnly(src);
    // Allow import {...} statements (those are static-imports, not calls).
    // Forbid actual call sites: `spawn(...)`, `exec(...)`, `execSync(...)`, `execFile(...)`.
    // We strip the import lines first so 'spawn' inside a destructured import doesn't trip the check.
    const codeNoImports = code.replace(/^\s*import\s*\{[^}]*\}\s*from[^;\n]+;?/gm, '');
    assert.ok(!/\bspawn\s*\(/.test(codeNoImports),
      `${f.split(/[/\\]/).pop()}: contains spawn() call site (would break single-spawn proof)`);
    assert.ok(!/\bexec(Sync|FileSync|File)?\s*\(/.test(codeNoImports),
      `${f.split(/[/\\]/).pop()}: contains exec/execSync/execFile call site (would break single-spawn proof)`);
  }
});

// ─── capabilitiesForAdapter ───────────────────────────────────────────

test('capabilitiesForAdapter returns capability hint for every registered vendor', () => {
  for (const name of listAdapters()) {
    const caps = capabilitiesForAdapter(name);
    assert.ok(caps !== null, `vendor ${name} must expose capabilities()`);
    assert.ok(caps.modelArg, `${name}: missing modelArg`);
    assert.ok(caps.reasoningArg, `${name}: missing reasoningArg`);
    assert.ok(caps.features, `${name}: missing features`);
    assert.ok(['enumerated', 'freeform', 'ignored'].includes(caps.modelArg.accepted),
      `${name}: modelArg.accepted must be enumerated/freeform/ignored; got ${caps.modelArg.accepted}`);
    assert.ok(['enumerated', 'ignored'].includes(caps.reasoningArg.accepted),
      `${name}: reasoningArg.accepted must be enumerated/ignored; got ${caps.reasoningArg.accepted}`);
    assert.ok(Array.isArray(caps.modelArg.knownGood));
    assert.ok(Array.isArray(caps.reasoningArg.knownGood));
    assert.ok(typeof caps.sourceNote === 'undefined' || typeof caps.modelArg.sourceNote === 'string');
    assert.ok(typeof caps.staleAfter === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(caps.staleAfter),
      `${name}: staleAfter must be YYYY-MM-DD`);
  }
});

test('capabilities: codex specifically declares reasoning enumerated low/medium/high/xhigh', () => {
  const caps = capabilitiesForAdapter('codex');
  assert.equal(caps.reasoningArg.accepted, 'enumerated');
  assert.deepEqual(caps.reasoningArg.knownGood, ['low', 'medium', 'high', 'xhigh']);
  assert.equal(caps.modelArg.accepted, 'ignored',
    'codex adapter uses reasoning not model — accurate per code (args() uses opts.reasoning only)');
});

test('capabilities: kimi/opencode/copilot accept --model freeform', () => {
  for (const name of ['kimi', 'opencode', 'copilot']) {
    const caps = capabilitiesForAdapter(name);
    assert.equal(caps.modelArg.accepted, 'freeform',
      `${name} adapter passes opts.model through to vendor CLI`);
  }
});

test('capabilities: kimi/opencode/copilot/agy all ignore --reasoning', () => {
  for (const name of ['kimi', 'opencode', 'copilot', 'agy']) {
    const caps = capabilitiesForAdapter(name);
    assert.equal(caps.reasoningArg.accepted, 'ignored',
      `${name} adapter does not honor opts.reasoning`);
  }
});

test('capabilities: every adapter has staleAfter date for freshness tracking', () => {
  for (const name of listAdapters()) {
    const caps = capabilitiesForAdapter(name);
    assert.match(caps.staleAfter, /^\d{4}-\d{2}-\d{2}$/);
  }
});

// ─── Verify runner uses shared path-resolve ────────────────────────────

test('hopper-runner imports resolveCommandOnPath from shared module (no duplicate logic)', async () => {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { dirname, resolve, join } = await import('node:path');
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const REPO_ROOT = resolve(__dirname, '..', '..');
  const runnerSrc = readFileSync(join(REPO_ROOT, 'cli', 'bin', 'hopper-runner'), 'utf-8');
  assert.match(runnerSrc, /from\s+['"]\.\.\/src\/path-resolve\.js['"]/,
    'hopper-runner must import from cli/src/path-resolve.js (DRY with --check)');
  // Make sure the OLD inline resolveWindowsCommand is gone
  assert.ok(!/function resolveWindowsCommand/.test(runnerSrc),
    'hopper-runner must NOT have inline resolveWindowsCommand anymore — extracted to path-resolve.js');
});
