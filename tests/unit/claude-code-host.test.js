// Claude Code host adapter (Tier B) plugin manifest + slash-command file tests
// Anchor: tests/unit/claude-code-host.test.js (T-PLUGIN-07 + Phase 3 audit P0 fix)
//
// Per codex Phase 3 audit P0 F1: plugin root is the REPO root, not hosts/claude-code/.
// Layout: <repo>/.claude-plugin/plugin.json + <repo>/commands/*.md.
// User installs by symlinking <repo> -> ~/.claude/plugins/hopper.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..', '..');
const MANIFEST = join(REPO_ROOT, '.claude-plugin', 'plugin.json');
const COMMANDS_DIR = join(REPO_ROOT, 'commands');

test('plugin manifest exists at repo-root /.claude-plugin/ (codex P0 F1)', () => {
  assert.ok(existsSync(MANIFEST), `plugin.json missing at ${MANIFEST}`);
  const raw = readFileSync(MANIFEST, 'utf-8');
  let parsed;
  assert.doesNotThrow(() => { parsed = JSON.parse(raw); }, 'plugin.json must be valid JSON');
  assert.ok(parsed.name, 'plugin.json must declare a name');
  assert.ok(parsed.version, 'plugin.json must declare a version');
  assert.ok(parsed.description, 'plugin.json must declare a description');
  assert.ok(parsed.license, 'plugin.json must declare a license');
});

test('cli/bin/hopper-dispatch lives at repo root (coexistence with plugin manifest)', () => {
  // Per codex P0 F1: plugin root must contain BOTH .claude-plugin/ AND cli/bin/hopper-dispatch
  // so $CLAUDE_PLUGIN_ROOT/cli/bin/hopper-dispatch resolves correctly.
  assert.ok(existsSync(join(REPO_ROOT, 'cli', 'bin', 'hopper-dispatch')),
    'cli/bin/hopper-dispatch must be at repo root (same level as .claude-plugin/)');
});

test('plugin name is "hopper" (drives /hopper:* namespace)', () => {
  const parsed = JSON.parse(readFileSync(MANIFEST, 'utf-8'));
  assert.equal(parsed.name, 'hopper',
    'plugin name must be "hopper" so slash commands become /hopper:<cmd>');
});

test('plugin version follows x.y.z[-suffix] format', () => {
  const parsed = JSON.parse(readFileSync(MANIFEST, 'utf-8'));
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

test('every slash command file declares allowed-tools (includes Bash)', () => {
  for (const cmd of ['dispatch.md', 'status.md', 'smoke.md', 'vendors.md']) {
    const path = join(COMMANDS_DIR, cmd);
    const content = readFileSync(path, 'utf-8');
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
    assert.ok(fmMatch, `${cmd}: frontmatter must be parseable`);
    assert.match(fmMatch[1], /allowed-tools:.*Bash/i,
      `${cmd}: allowed-tools must include Bash`);
  }
});

test('every slash command body references hopper-dispatch binary', () => {
  for (const cmd of ['dispatch.md', 'status.md', 'smoke.md', 'vendors.md']) {
    const path = join(COMMANDS_DIR, cmd);
    const content = readFileSync(path, 'utf-8');
    assert.match(content, /hopper-dispatch/);
  }
});

test('dispatch.md mentions user-action gate (spec §11)', () => {
  const content = readFileSync(join(COMMANDS_DIR, 'dispatch.md'), 'utf-8');
  assert.match(content, /user-action gate|§11|unified user-action/i,
    'dispatch.md must remind operator that queue/cost edits require user approval');
  assert.match(content, /Do NOT auto-apply|Do NOT.*auto/i,
    'dispatch.md must explicitly forbid auto-applying queue/cost edits');
});

test('dispatch.md validates $ARGUMENTS before Bash invocation (codex Phase 3 F2)', () => {
  const content = readFileSync(join(COMMANDS_DIR, 'dispatch.md'), 'utf-8');
  // Per codex Phase 3 P1 F2: raw $ARGUMENTS splat is shell-injection prone.
  // The prompt must instruct Claude to validate arguments before passing to Bash.
  assert.match(content, /[Vv]alidat/, 'dispatch.md must instruct validation step');
  assert.match(content, /Do NOT splat unvalidated/i,
    'dispatch.md must explicitly forbid raw $ARGUMENTS splat');
  assert.match(content, /\^\[A-Za-z\]/,
    'dispatch.md must specify task-id regex pattern');
});

test('dispatch.md uses anti-persona phrasing (codex Phase 3 F5)', () => {
  const content = readFileSync(join(COMMANDS_DIR, 'dispatch.md'), 'utf-8');
  // Per llm-hopper anti-persona convention + codex Phase 3 P2 F5:
  // prompts must not assert identity ("You are X", "Act as X").
  assert.ok(!/^You are\b/im.test(content),
    'dispatch.md must not start lines with "You are X" identity claim');
  assert.ok(!/Act as the\b/i.test(content),
    'dispatch.md must not use "act as the X" persona language');
});

test('smoke.md references current dispatcher version (drift detector)', () => {
  const manifestVer = JSON.parse(readFileSync(MANIFEST, 'utf-8')).version;
  const content = readFileSync(join(COMMANDS_DIR, 'smoke.md'), 'utf-8');
  assert.ok(content.includes(manifestVer),
    `smoke.md should reference current version ${manifestVer}`);
});

test('host README documents Tier B + 4 slash commands at new install path', () => {
  const readmePath = join(REPO_ROOT, 'hosts', 'claude-code', 'README.md');
  const content = readFileSync(readmePath, 'utf-8');
  assert.match(content, /Tier B/);
  for (const cmd of ['/hopper:dispatch', '/hopper:status', '/hopper:smoke', '/hopper:vendors']) {
    assert.ok(content.includes(cmd), `README must document ${cmd}`);
  }
  // Per codex P0 F1: README must specify the symlink target is REPO ROOT,
  // not hosts/claude-code/.
  assert.ok(
    /symlink.*repo root|repo root.*symlink|symlink.*hopper-plugin\b/i.test(content),
    'README install instructions must symlink the repo root (not hosts/claude-code/)'
  );
});

test('plugin manifest does NOT declare commands or entry (old schema removed)', () => {
  const parsed = JSON.parse(readFileSync(MANIFEST, 'utf-8'));
  assert.equal(parsed.commands, undefined);
  assert.equal(parsed.entry, undefined);
});

// ─── codex Phase 3 P2 F6: version drift detector ────────────────────────

test('version consistency across plugin.json, package.json, CLI, and prompts', () => {
  const manifestVer = JSON.parse(readFileSync(MANIFEST, 'utf-8')).version;
  const pkgVer = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf-8')).version;
  assert.equal(pkgVer, manifestVer,
    `package.json version "${pkgVer}" drifted from plugin.json "${manifestVer}"`);

  // CLI --version output
  const cliOut = execFileSync(process.execPath, [join(REPO_ROOT, 'cli', 'bin', 'hopper-dispatch'), '--version'],
    { encoding: 'utf-8' }).trim();
  assert.equal(cliOut, manifestVer,
    `cli --version "${cliOut}" drifted from plugin.json "${manifestVer}"`);

  // smoke.md and vendors.md should mention current version
  for (const cmd of ['smoke.md', 'vendors.md']) {
    const content = readFileSync(join(COMMANDS_DIR, cmd), 'utf-8');
    assert.ok(content.includes(manifestVer),
      `${cmd}: missing reference to current version ${manifestVer} (drift detector)`);
  }
});
