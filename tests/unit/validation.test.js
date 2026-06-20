// Centralized validation tests (codex Phase 4 audit P1 — canonical validation)
// Anchor: tests/unit/validation.test.js

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  TASK_ID_PATTERN,
  ALLOWED_DISPATCH_FLAGS,
  validateTaskId,
  validateDispatchFlags,
  validateHostVendorSeparation,
} from '../../cli/src/validation.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..', '..');

test('TASK_ID_PATTERN accepts well-formed IDs', () => {
  for (const id of ['T-PLUGIN-05a', 'T01', 'Task.v2', 'A_B', 'X-y.z-1.2.3']) {
    assert.ok(TASK_ID_PATTERN.test(id), `should accept "${id}"`);
  }
});

test('TASK_ID_PATTERN rejects bad IDs', () => {
  for (const id of ['../escape', 'foo/bar', 'foo\\bar', '.hidden', '', '123abc']) {
    assert.ok(!TASK_ID_PATTERN.test(id), `should reject "${id}"`);
  }
});

test('validateTaskId throws on path traversal', () => {
  assert.throws(() => validateTaskId('../escape'));
  assert.throws(() => validateTaskId('a..b'), /\.\./);
  assert.throws(() => validateTaskId('T..x'), /\.\./);
});

test('validateTaskId throws on oversize', () => {
  assert.throws(() => validateTaskId('T-' + 'a'.repeat(200)), /exceeds 100 chars/);
});

test('validateTaskId throws on non-string', () => {
  for (const v of [null, 123, undefined, {}, []]) {
    assert.throws(() => validateTaskId(v));
  }
});

test('ALLOWED_DISPATCH_FLAGS is frozen + canonical', () => {
  assert.ok(Object.isFrozen(ALLOWED_DISPATCH_FLAGS));
  // --background added in spec v2.1.0 §14 (Phase 5a); --web-search added for research task-types
  assert.deepEqual([...ALLOWED_DISPATCH_FLAGS], ['--write', '--force', '--background', '--web-search']);
});

test('validateDispatchFlags accepts --write, --force', () => {
  assert.doesNotThrow(() => validateDispatchFlags(['--write']));
  assert.doesNotThrow(() => validateDispatchFlags(['--force']));
  assert.doesNotThrow(() => validateDispatchFlags(['--write', '--force']));
  assert.doesNotThrow(() => validateDispatchFlags([]));
});

test('validateDispatchFlags throws on unknown flag', () => {
  assert.throws(() => validateDispatchFlags(['--evil']), /Invalid flag/);
  assert.throws(() => validateDispatchFlags(['--write', '--evil']), /--evil/);
});

test('validateHostVendorSeparation enforces host != vendor', () => {
  assert.doesNotThrow(() => validateHostVendorSeparation(undefined, 'kimi'));
  assert.doesNotThrow(() => validateHostVendorSeparation('codex', 'kimi'));
  assert.throws(() => validateHostVendorSeparation('codex', 'codex'), /host != vendor/i);
});

// ─── Cross-host parity: verify the same pattern appears in all host entry points ──

test('cross-host parity: canonical TASK_ID_PATTERN matches dispatch.md and all Tier C wrappers', () => {
  const canonical = TASK_ID_PATTERN.source;
  // What pattern do the hosts cite?
  const claudeCode = readFileSync(join(REPO_ROOT, 'commands', 'dispatch.md'), 'utf-8');
  const codexCli = readFileSync(join(REPO_ROOT, 'hosts', 'codex-cli', 'bin', 'hopper-codex'), 'utf-8');
  const opencode = readFileSync(join(REPO_ROOT, 'hosts', 'opencode', 'bin', 'hopper-opencode'), 'utf-8');
  const copilot = readFileSync(join(REPO_ROOT, 'hosts', 'copilot-cli', 'bin', 'hopper-copilot'), 'utf-8');
  const grok = readFileSync(join(REPO_ROOT, 'hosts', 'grok-cli', 'bin', 'hopper-grok'), 'utf-8');
  const cursor = readFileSync(join(REPO_ROOT, 'hosts', 'cursor-cli', 'bin', 'hopper-cursor'), 'utf-8');

  // All three should contain a literal "^[A-Za-z][A-Za-z0-9._-]{0,99}$" substring
  const literal = '^[A-Za-z][A-Za-z0-9._-]{0,99}$';
  for (const [name, content] of [
    ['dispatch.md', claudeCode],
    ['hopper-codex', codexCli],
    ['hopper-opencode', opencode],
    ['hopper-copilot', copilot],
    ['hopper-grok', grok],
    ['hopper-cursor', cursor],
  ]) {
    assert.ok(content.includes(literal),
      `${name} must reference canonical task-id pattern "${literal}"`);
  }
  // And the canonical pattern equals this literal (escape `\` for JS regex source)
  assert.equal(canonical, '^[A-Za-z][A-Za-z0-9._-]{0,99}$',
    'canonical TASK_ID_PATTERN.source must equal the documented literal');
});
