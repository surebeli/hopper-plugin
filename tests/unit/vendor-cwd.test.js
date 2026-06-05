// Retrospective #3 fix + HOPPER_VENDOR_CWD override: vendor CWD anchors to the
// repo root that owns .hopper/ (or an explicit override), not the dir
// hopper-dispatch was invoked from. opencode passes it via --dir.
// Anchor: tests/unit/vendor-cwd.test.js

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { resolveVendorCwd } from '../../cli/src/background.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..', '..');

test('resolveVendorCwd defaults to repo root = dirname(resolve(hopperDir))', () => {
  const saved = process.env.HOPPER_VENDOR_CWD;
  delete process.env.HOPPER_VENDOR_CWD;
  try {
    assert.equal(resolveVendorCwd('/home/u/proj/.hopper'), resolve('/home/u/proj/.hopper', '..'));
    assert.equal(resolveVendorCwd('.hopper'), resolve('.'));
    assert.equal(resolveVendorCwd(join('sub', '.hopper')), resolve('sub'));
  } finally {
    if (saved !== undefined) process.env.HOPPER_VENDOR_CWD = saved;
  }
});

test('resolveVendorCwd honors HOPPER_VENDOR_CWD override (monorepo / external-evidence root)', () => {
  const saved = process.env.HOPPER_VENDOR_CWD;
  process.env.HOPPER_VENDOR_CWD = join('custom', 'ancestor');
  try {
    // override wins regardless of the hopperDir argument
    assert.equal(resolveVendorCwd('/anything/deep/.hopper'), resolve('custom', 'ancestor'));
  } finally {
    if (saved !== undefined) process.env.HOPPER_VENDOR_CWD = saved;
    else delete process.env.HOPPER_VENDOR_CWD;
  }
});

test('retro #3: hopper-runner spawns vendor in --cwd, not bare process.cwd()', () => {
  const src = readFileSync(join(REPO, 'cli', 'bin', 'hopper-runner'), 'utf-8');
  assert.match(src, /cwd:\s*vendorCwd,\s*adapterArgv/);
  assert.match(src, /cwd:\s*vendorCwd\s*\|\|\s*process\.cwd\(\)/);
  assert.doesNotMatch(src, /detached: !isWindows[\s\S]{0,80}cwd:\s*process\.cwd\(\),/);
});

test('retro #3: spawnDetached passes --cwd (repo root) to the runner and sets runner cwd', () => {
  const src = readFileSync(join(REPO, 'cli', 'src', 'background.js'), 'utf-8');
  assert.match(src, /const vendorCwd = resolveVendorCwd\(hopperDir\)/);
  assert.match(src, /'--cwd',\s*vendorCwd/);
  assert.match(src, /cwd:\s*vendorCwd,/);
});

test('retro #3: sync dispatch anchors vendor cwd via resolveVendorCwd', () => {
  const src = readFileSync(join(REPO, 'cli', 'src', 'dispatch.js'), 'utf-8');
  assert.match(src, /cwd:\s*resolveVendorCwd\(hopperDir\)/);
  assert.match(src, /cwd:\s*cwd\s*\|\|\s*undefined/);
});

test('opencode adapter passes --dir when opts.cwd is set (and omits it otherwise)', async () => {
  const { opencodeAdapter } = await import('../../cli/src/vendors/opencode.js');
  const withCwd = opencodeAdapter.args('hi', { cwd: '/repo/root' });
  const dirIdx = withCwd.indexOf('--dir');
  assert.ok(dirIdx !== -1, '--dir must be present when opts.cwd is set');
  assert.equal(withCwd[dirIdx + 1], '/repo/root');
  assert.equal(withCwd[0], 'run', 'run subcommand stays first');
  const noCwd = opencodeAdapter.args('hi', {});
  assert.ok(!noCwd.includes('--dir'), 'no --dir when opts.cwd absent');
});

test('grok passes --cwd and codex passes --cd when opts.cwd is set (and omit otherwise)', async () => {
  const { grokAdapter } = await import('../../cli/src/vendors/grok.js');
  const { codexAdapter } = await import('../../cli/src/vendors/codex.js');

  const g = grokAdapter.args('hi', { cwd: '/repo/root' });
  const gIdx = g.indexOf('--cwd');
  assert.ok(gIdx !== -1, 'grok must pass --cwd when opts.cwd set');
  assert.equal(g[gIdx + 1], '/repo/root');
  assert.ok(!grokAdapter.args('hi', {}).includes('--cwd'), 'grok: no --cwd without opts.cwd');

  const c = codexAdapter.args('hi', { cwd: '/repo/root' });
  const cIdx = c.indexOf('--cd');
  assert.ok(cIdx !== -1, 'codex must pass --cd when opts.cwd set');
  assert.equal(c[cIdx + 1], '/repo/root');
  assert.ok(!codexAdapter.args('hi', {}).includes('--cd'), 'codex: no --cd without opts.cwd');
});

test('agy passes --add-dir when opts.cwd is set (and omits it otherwise)', async () => {
  const { agyAdapter } = await import('../../cli/src/vendors/agy.js');
  const withCwd = agyAdapter.args('hi', { cwd: '/repo/root' });
  const idx = withCwd.indexOf('--add-dir');
  assert.ok(idx !== -1, 'agy must pass --add-dir when opts.cwd set');
  assert.equal(withCwd[idx + 1], '/repo/root');
  assert.ok(!agyAdapter.args('hi', {}).includes('--add-dir'), 'agy: no --add-dir without opts.cwd');
});
