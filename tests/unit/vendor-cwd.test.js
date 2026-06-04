// Retrospective #3 fix: vendor CWD must anchor to the repo root that owns
// .hopper/, not the dir hopper-dispatch was invoked from.
// Anchor: tests/unit/vendor-cwd.test.js

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { resolveVendorCwd } from '../../cli/src/background.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..', '..');

test('resolveVendorCwd returns repo root = dirname(resolve(hopperDir))', () => {
  assert.equal(resolveVendorCwd('/home/u/proj/.hopper'), resolve('/home/u/proj/.hopper', '..'));
  // relative hopperDir resolves against cwd, then takes dirname
  assert.equal(resolveVendorCwd('.hopper'), resolve('.'));
  assert.equal(resolveVendorCwd(join('sub', '.hopper')), resolve('sub'));
});

test('retro #3: hopper-runner spawns vendor in --cwd, not bare process.cwd()', () => {
  const src = readFileSync(join(REPO, 'cli', 'bin', 'hopper-runner'), 'utf-8');
  // opts carries cwd as vendorCwd, vendor spawn uses it with process.cwd() fallback
  assert.match(src, /cwd:\s*vendorCwd,\s*adapterArgv/);
  assert.match(src, /cwd:\s*vendorCwd\s*\|\|\s*process\.cwd\(\)/);
  // the OLD bare `cwd: process.cwd()` on the vendor spawn must be gone
  assert.doesNotMatch(src, /detached: !isWindows[\s\S]{0,80}cwd:\s*process\.cwd\(\),/);
});

test('retro #3: spawnDetached passes --cwd (repo root) to the runner and sets runner cwd', () => {
  const src = readFileSync(join(REPO, 'cli', 'src', 'background.js'), 'utf-8');
  assert.match(src, /const vendorCwd = resolveVendorCwd\(hopperDir\)/);
  assert.match(src, /'--cwd',\s*vendorCwd/);
  assert.match(src, /cwd:\s*vendorCwd,/);
});

test('retro #3: sync dispatch anchors vendor cwd to repo root', () => {
  const src = readFileSync(join(REPO, 'cli', 'src', 'dispatch.js'), 'utf-8');
  assert.match(src, /cwd:\s*dirname\(resolve\(hopperDir\)\)/);
  assert.match(src, /cwd:\s*cwd\s*\|\|\s*undefined/);
});
