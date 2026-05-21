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
  // We can verify by reading path-resolve.js source for any spawn/exec calls
  // (after stripping comments — doc references like "spawn()" in JSDoc are OK).
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { dirname, resolve, join } = await import('node:path');
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const REPO_ROOT = resolve(__dirname, '..', '..');
  const pathResolveSrc = readFileSync(join(REPO_ROOT, 'cli', 'src', 'path-resolve.js'), 'utf-8');
  // Strip /* */ and // comments + string literals before pattern-matching
  const code = pathResolveSrc
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/'[^']*'/g, "''")
    .replace(/"[^"]*"/g, '""')
    .replace(/`[^`]*`/g, '``');
  assert.ok(!/\bspawn\s*\(/.test(code),
    'path-resolve.js code must not contain spawn() — would break single-spawn proof');
  assert.ok(!/\bexec(Sync|FileSync|File)?\s*\(/.test(code),
    'path-resolve.js code must not contain exec/execSync — would break single-spawn proof');
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
