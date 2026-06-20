// T2: bin `--adhoc` handler arg-validation (no vendor spawn — these error before dispatch).
// Anchor: tests/unit/adhoc-cli.test.js

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = resolve(fileURLToPath(import.meta.url), '..', '..', '..', 'cli', 'bin', 'hopper-dispatch');

function setupHopper() {
  const root = mkdtempSync(join(tmpdir(), 'hopper-adhoc-'));
  const hopper = join(root, '.hopper');
  mkdirSync(join(hopper, 'tasks'), { recursive: true });
  mkdirSync(join(hopper, 'handoffs'), { recursive: true });
  writeFileSync(join(hopper, 'queue.md'), '## Tasks\n\n| ID | Task-type | Status | Brief |\n|----|-----------|--------|-------|\n');
  writeFileSync(join(hopper, 'AGENTS.md'), '## Task-type → vendor default preference\n\n| Task-type | Default vendor | Why |\n|---|---|---|\n| prd-research | codex | x |\n');
  return { root, hopper };
}

function runCli(hopper, args) {
  try {
    const out = execFileSync(process.execPath, [BIN, ...args], { encoding: 'utf-8', env: { ...process.env, HOPPER_DIR: hopper } });
    return { code: 0, out, err: '' };
  } catch (e) {
    return { code: e.status, out: e.stdout || '', err: e.stderr || '' };
  }
}

test('T2 --adhoc: missing --brief errors (exit 2, no dispatch)', () => {
  const { root, hopper } = setupHopper();
  try {
    const r = runCli(hopper, ['--adhoc', '--task-type', 'prd-research']);
    assert.equal(r.code, 2);
    assert.match(r.err, /requires --task-type .* --brief/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('T2 --adhoc: unknown --vendor errors before dispatch (exit 2, no spawn)', () => {
  const { root, hopper } = setupHopper();
  try {
    const r = runCli(hopper, ['--adhoc', '--task-type', 'prd-research', '--brief', 'x', '--vendor', 'not-a-vendor']);
    assert.equal(r.code, 2);
    assert.match(r.err, /unknown vendor/i);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// ─── T5 --swarm handler (validation + the two third-party-review fixes) ───

test('T5 --swarm: missing --vendors errors (exit 2)', () => {
  const { root, hopper } = setupHopper();
  try {
    const r = runCli(hopper, ['--swarm', '--task-type', 'code-review-acceptance', '--brief', 'x']);
    assert.equal(r.code, 2);
    assert.match(r.err, /requires --task-type .* --brief .* --vendors/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('T5 --swarm: a write task-type is refused (qualitative-only, exit 2)', () => {
  const { root, hopper } = setupHopper();
  try {
    const r = runCli(hopper, ['--swarm', '--task-type', 'code-impl', '--brief', 'x', '--vendors', 'codex,grok']);
    assert.equal(r.code, 2);
    assert.match(r.err, /read-only\/qualitative/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('T5 --swarm: --sandbox is rejected so a panel cannot be upgraded to write access (review #1)', () => {
  const { root, hopper } = setupHopper();
  try {
    const r = runCli(hopper, ['--swarm', '--task-type', 'code-review-acceptance', '--brief', 'x', '--vendors', 'codex,grok', '--sandbox', 'danger-full-access']);
    assert.equal(r.code, 2);
    assert.match(r.err, /--sandbox is not allowed/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('T5 --swarm: a failing panelist does NOT abort the rest (failure isolation, review #2)', () => {
  // No task-type frames exist in the fixture → every panelist fails resolve BEFORE spawning.
  // The loop must continue through all of them and report, not exit on the first.
  const { root, hopper } = setupHopper();
  try {
    const r = runCli(hopper, ['--swarm', '--task-type', 'spec-blindspot-hunt', '--brief', 'x', '--vendors', 'codex,grok']);
    assert.match(r.err, /panelist codex did not launch/);
    assert.match(r.err, /panelist grok did not launch/, 'the loop continued past the first failure');
    assert.match(r.out, /Not launched \(2\/2\)/);
    assert.equal(r.code, 1, 'exit 1 when nothing launched');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
