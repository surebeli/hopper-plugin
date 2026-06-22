// Static registry/listing meta-commands must run WITHOUT a .hopper/ project context
// (regression: --vendors/--rules used to hit the .hopper gate and error). They compute
// purely from the adapter registry, like --setup/--capabilities/--probe.
// Anchor: tests/unit/meta-no-hopper.test.js

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = resolve(fileURLToPath(import.meta.url), '..', '..', '..', 'cli', 'bin', 'hopper-dispatch');

// Run from a fresh tmp dir (no .hopper in cwd or any ancestor) with HOPPER_DIR removed,
// so the only way the command succeeds is if it never consults the project context.
function runNoHopper(args) {
  const cwd = mkdtempSync(join(tmpdir(), 'hopper-nohopper-'));
  const env = { ...process.env };
  delete env.HOPPER_DIR;
  try {
    const out = execFileSync(process.execPath, [BIN, ...args], { encoding: 'utf-8', cwd, env });
    return { code: 0, out, err: '' };
  } catch (e) {
    return { code: e.status, out: e.stdout || '', err: e.stderr || '' };
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test('--vendors lists the adapter registry without a .hopper/ directory', () => {
  const r = runNoHopper(['--vendors']);
  assert.equal(r.code, 0, `expected exit 0, got ${r.code}; stderr: ${r.err}`);
  assert.match(r.out, /registered vendor adapters/);
  for (const v of ['codex', 'kimi', 'opencode', 'copilot', 'agy', 'grok', 'mimo', 'claude']) {
    assert.match(r.out, new RegExp(`- ${v}\\b`), `missing vendor ${v}`);
  }
});

test('--rules renders the dispatch matrix without a .hopper/ directory', () => {
  const r = runNoHopper(['--rules']);
  assert.equal(r.code, 0, `expected exit 0, got ${r.code}; stderr: ${r.err}`);
  assert.match(r.out, /Hopper Dispatch Rules/);
});

test('--swarm --vendors a,b is NOT intercepted by the --vendors listing (overload preserved)', () => {
  // The standalone --vendors handler is guarded by !--swarm, so this must fall through
  // to the swarm path (which still needs .hopper) rather than printing the adapter list.
  const r = runNoHopper(['--swarm', '--task-type', 'code-review-acceptance', '--brief', 'x', '--vendors', 'codex,grok']);
  assert.doesNotMatch(r.out, /registered vendor adapters/, 'swarm must not be hijacked by the listing');
  assert.notEqual(r.code, 0, 'swarm without .hopper still errors at the gate');
  assert.match(r.err, /no \.hopper\/ directory/);
});

test('--task-types STILL requires .hopper/ (it reads project task-types, not the static registry)', () => {
  const r = runNoHopper(['--task-types']);
  assert.notEqual(r.code, 0, '--task-types must stay gated on .hopper/');
  assert.match(r.err, /no \.hopper\/ directory/);
});
