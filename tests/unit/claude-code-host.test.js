// Claude Code host adapter (Tier B) plugin manifest + slash-command file tests
// Anchor: tests/unit/claude-code-host.test.js (T-PLUGIN-07)
//
// These tests verify the static plugin artifacts are well-formed. Functional
// verification (does Claude Code actually load this plugin?) is the Prong 1
// user-action gate — those tests would need a Claude Code runtime, which we
// cannot exercise headlessly. Here we cover what is exercisable: file
// existence, JSON validity, slash-command frontmatter conformance.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..', '..');
const HOST_DIR = join(REPO_ROOT, 'hosts', 'claude-code');
const MANIFEST = join(HOST_DIR, '.claude-plugin', 'plugin.json');
const COMMANDS_DIR = join(HOST_DIR, 'commands');

test('plugin manifest exists and parses as JSON', () => {
  assert.ok(existsSync(MANIFEST), `plugin.json missing at ${MANIFEST}`);
  const raw = readFileSync(MANIFEST, 'utf-8');
  let parsed;
  assert.doesNotThrow(() => { parsed = JSON.parse(raw); }, 'plugin.json must be valid JSON');
  assert.ok(parsed.name, 'plugin.json must declare a name');
  assert.ok(parsed.version, 'plugin.json must declare a version');
  assert.ok(parsed.description, 'plugin.json must declare a description');
  assert.ok(parsed.license, 'plugin.json must declare a license');
});

test('plugin name is "hopper" (drives /hopper:* namespace)', () => {
  const parsed = JSON.parse(readFileSync(MANIFEST, 'utf-8'));
  assert.equal(parsed.name, 'hopper',
    'plugin name must be "hopper" so slash commands become /hopper:<cmd>');
});

test('plugin version is stable semver-ish', () => {
  const parsed = JSON.parse(readFileSync(MANIFEST, 'utf-8'));
  // Allow x.y.z[-suffix] format
  assert.match(parsed.version, /^\d+\.\d+\.\d+(-[A-Za-z0-9-]+)?$/,
    `version "${parsed.version}" must look like x.y.z or x.y.z-suffix`);
});

test('commands/ directory contains expected slash command markdown files', () => {
  assert.ok(existsSync(COMMANDS_DIR), `commands/ dir missing at ${COMMANDS_DIR}`);
  for (const cmd of ['dispatch.md', 'status.md', 'smoke.md', 'vendors.md']) {
    const path = join(COMMANDS_DIR, cmd);
    assert.ok(existsSync(path), `slash command file missing: ${cmd}`);
  }
});

test('every slash command file starts with YAML frontmatter and has description', () => {
  for (const cmd of ['dispatch.md', 'status.md', 'smoke.md', 'vendors.md']) {
    const path = join(COMMANDS_DIR, cmd);
    const content = readFileSync(path, 'utf-8');
    assert.match(content, /^---\n/, `${cmd}: must start with --- frontmatter`);
    assert.match(content, /^description:/m, `${cmd}: must declare description in frontmatter`);
    const fmEnd = content.indexOf('\n---\n', 4);
    assert.notEqual(fmEnd, -1, `${cmd}: must close frontmatter with second ---`);
  }
});

test('every slash command file declares allowed-tools', () => {
  for (const cmd of ['dispatch.md', 'status.md', 'smoke.md', 'vendors.md']) {
    const path = join(COMMANDS_DIR, cmd);
    const content = readFileSync(path, 'utf-8');
    assert.match(content, /^allowed-tools:/m, `${cmd}: must declare allowed-tools`);
    // Must include Bash since all commands shell out to the dispatcher
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
    assert.ok(fmMatch, `${cmd}: frontmatter must be parseable`);
    assert.match(fmMatch[1], /allowed-tools:.*Bash/i,
      `${cmd}: allowed-tools must include Bash (commands shell out to hopper-dispatch)`);
  }
});

test('every slash command body invokes the hopper-dispatch binary', () => {
  for (const cmd of ['dispatch.md', 'status.md', 'smoke.md', 'vendors.md']) {
    const path = join(COMMANDS_DIR, cmd);
    const content = readFileSync(path, 'utf-8');
    assert.match(content, /hopper-dispatch/,
      `${cmd}: body must reference cli/bin/hopper-dispatch`);
  }
});

test('dispatch.md mentions user-action gate (spec §11)', () => {
  const content = readFileSync(join(COMMANDS_DIR, 'dispatch.md'), 'utf-8');
  assert.match(content, /user-action gate|§11|unified user-action/i,
    'dispatch.md must remind operator that queue/cost edits require user approval');
  assert.match(content, /Do NOT auto-apply|Do NOT.*auto/i,
    'dispatch.md must explicitly forbid auto-applying queue/cost edits');
});

test('smoke.md references current dispatcher version (drift detector)', () => {
  const manifestVer = JSON.parse(readFileSync(MANIFEST, 'utf-8')).version;
  const content = readFileSync(join(COMMANDS_DIR, 'smoke.md'), 'utf-8');
  // Tolerant check: the version mentioned in smoke.md should match the manifest
  // (or at least appear somewhere) — catches drift between manifest and prompt.
  assert.ok(content.includes(manifestVer),
    `smoke.md should reference current version ${manifestVer}; if it changed, update smoke.md`);
});

test('host README documents Tier B + 4 slash commands', () => {
  const readmePath = join(HOST_DIR, 'README.md');
  const content = readFileSync(readmePath, 'utf-8');
  assert.match(content, /Tier B/);
  for (const cmd of ['/hopper:dispatch', '/hopper:status', '/hopper:smoke', '/hopper:vendors']) {
    assert.ok(content.includes(cmd), `README must document ${cmd}`);
  }
});

test('host README warns of single-spawn invariant + no-harness-core', () => {
  const readmePath = join(HOST_DIR, 'README.md');
  const content = readFileSync(readmePath, 'utf-8');
  assert.match(content, /no retry|single subprocess|single-spawn/i,
    'README must declare single-spawn invariant');
  assert.match(content, /no fallback|no consensus|no harness reaction core|§3 #4/i,
    'README must declare no-harness-core stance');
});

test('plugin manifest does NOT declare commands or entry (old schema removed)', () => {
  const parsed = JSON.parse(readFileSync(MANIFEST, 'utf-8'));
  // Phase 3 standardization: commands are discovered from commands/*.md, not
  // hard-coded in plugin.json. This test prevents accidental regression to the
  // tentative schema from Phase 0.
  assert.equal(parsed.commands, undefined,
    'plugin.json should not embed commands array; use commands/*.md instead');
  assert.equal(parsed.entry, undefined,
    'plugin.json should not declare entry; slash commands shell out via bash');
});
