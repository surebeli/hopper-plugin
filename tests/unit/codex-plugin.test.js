// Codex plugin manifest tests.
// Layout: <repo>/.codex-plugin/plugin.json, sibling to .claude-plugin/plugin.json.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..', '..');
const CODEX_MANIFEST = join(REPO_ROOT, '.codex-plugin', 'plugin.json');
const CLAUDE_MANIFEST = join(REPO_ROOT, '.claude-plugin', 'plugin.json');
const CODEX_MARKETPLACE = join(REPO_ROOT, '.agents', 'plugins', 'marketplace.json');
const CODEX_PACKAGE_ROOT = join(REPO_ROOT, 'plugins', 'hopper');
const CODEX_PACKAGE_MANIFEST = join(CODEX_PACKAGE_ROOT, '.codex-plugin', 'plugin.json');
const EXPECTED_CODEX_SKILLS = [
  'hopper',
  'hopper-dispatch',
  'hopper-models',
  'hopper-probe',
  'hopper-progress',
  'hopper-result',
  'hopper-smoke',
  'hopper-status',
  'hopper-vendors',
];

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

test('Codex plugin manifest exists at repo-root /.codex-plugin/', () => {
  assert.ok(existsSync(CODEX_MANIFEST), `plugin.json missing at ${CODEX_MANIFEST}`);
  assert.doesNotThrow(() => readJson(CODEX_MANIFEST), 'Codex plugin.json must be valid JSON');
});

test('Codex plugin manifest declares required metadata', () => {
  const parsed = readJson(CODEX_MANIFEST);
  for (const field of ['name', 'version', 'description', 'author', 'homepage', 'repository', 'license', 'keywords', 'skills', 'interface']) {
    assert.ok(parsed[field], `Codex plugin.json must declare ${field}`);
  }
  assert.equal(parsed.name, 'hopper');
  assert.match(parsed.version, /^\d+\.\d+\.\d+(-[A-Za-z0-9-]+)?$/);
  assert.ok(Array.isArray(parsed.keywords), 'keywords must be an array');
  assert.equal(parsed.skills, './skills/');
});

test('Codex plugin manifest stays in sync with Claude manifest identity', () => {
  const codex = readJson(CODEX_MANIFEST);
  const claude = readJson(CLAUDE_MANIFEST);
  assert.equal(codex.name, claude.name);
  assert.equal(codex.version, claude.version);
  assert.equal(codex.license, claude.license);
});

test('Codex plugin interface metadata is suitable for app display', () => {
  const parsed = readJson(CODEX_MANIFEST);
  const ui = parsed.interface;
  for (const field of ['displayName', 'shortDescription', 'longDescription', 'developerName', 'category', 'capabilities', 'defaultPrompt', 'brandColor']) {
    assert.ok(ui[field], `interface.${field} is required for app display`);
  }
  assert.ok(Array.isArray(ui.capabilities), 'interface.capabilities must be an array');
  assert.ok(Array.isArray(ui.defaultPrompt), 'interface.defaultPrompt must be an array');
  assert.ok(ui.defaultPrompt.length <= 3, 'Codex displays at most 3 default prompts');
  for (const prompt of ui.defaultPrompt) {
    assert.ok(prompt.length <= 128, `default prompt too long: ${prompt}`);
  }
  assert.ok(Array.isArray(ui.screenshots), 'interface.screenshots must be an array');
  for (const screenshot of ui.screenshots) {
    assert.equal(typeof screenshot, 'string', 'Codex screenshots must be relative path strings');
    assert.ok(existsSync(join(REPO_ROOT, screenshot)), `screenshot path missing: ${screenshot}`);
  }
});

test('Codex plugin manifest does not reference missing component paths', () => {
  const parsed = readJson(CODEX_MANIFEST);
  for (const field of ['skills', 'hooks', 'mcpServers', 'apps']) {
    if (!parsed[field]) continue;
    const relativePath = parsed[field].replace(/^\.\//, '');
    assert.ok(existsSync(join(REPO_ROOT, relativePath)), `${field} path does not exist: ${parsed[field]}`);
  }
});

test('Codex plugin bundles one callable skill per Hopper command surface', () => {
  for (const skillRoot of [
    join(REPO_ROOT, 'skills'),
    join(CODEX_PACKAGE_ROOT, 'skills'),
  ]) {
    for (const skillName of EXPECTED_CODEX_SKILLS) {
      const skillPath = join(skillRoot, skillName, 'SKILL.md');
      assert.ok(existsSync(skillPath), `Hopper skill missing at ${skillPath}`);
      const body = readFileSync(skillPath, 'utf-8');
      assert.ok(body.startsWith('---\n'), `${skillName} must start with YAML frontmatter`);
      assert.match(body, new RegExp(`\\nname:\\s*${skillName}\\n`), `${skillName} frontmatter name must match folder`);
      assert.match(body, /\ndescription:\s*.+Hopper.+/, `${skillName} description must mention Hopper`);
    }
  }
});

test('Codex repo marketplace exposes Hopper from the packaged plugin root', () => {
  assert.ok(existsSync(CODEX_MARKETPLACE), `Codex marketplace missing at ${CODEX_MARKETPLACE}`);
  const marketplace = readJson(CODEX_MARKETPLACE);
  assert.equal(marketplace.name, 'agent-hopper');
  assert.ok(Array.isArray(marketplace.plugins), 'marketplace.plugins must be an array');
  const hopper = marketplace.plugins.find((entry) => entry.name === 'hopper');
  assert.ok(hopper, 'marketplace must include hopper plugin entry');
  assert.equal(hopper.source?.source, 'local');
  assert.equal(hopper.source?.path, './plugins/hopper');
  assert.equal(hopper.policy?.installation, 'INSTALLED_BY_DEFAULT');
  assert.equal(hopper.policy?.authentication, 'ON_INSTALL');
  assert.equal(hopper.category, 'Coding');
  assert.ok(existsSync(CODEX_PACKAGE_MANIFEST), `packaged plugin manifest missing at ${CODEX_PACKAGE_MANIFEST}`);
});

test('Codex marketplace package installs the Hopper skill with the plugin', () => {
  const root = readJson(CODEX_MANIFEST);
  const packaged = readJson(CODEX_PACKAGE_MANIFEST);
  for (const field of ['name', 'version', 'description', 'license', 'skills']) {
    assert.equal(packaged[field], root[field], `packaged manifest ${field} drifted from root manifest`);
  }
  assert.equal(packaged.interface.displayName, root.interface.displayName);
  assert.equal(packaged.interface.shortDescription, root.interface.shortDescription);
  for (const skillName of EXPECTED_CODEX_SKILLS) {
    const rootSkillPath = join(REPO_ROOT, root.skills.replace(/^\.\//, ''), skillName, 'SKILL.md');
    const packagedSkillPath = join(CODEX_PACKAGE_ROOT, packaged.skills.replace(/^\.\//, ''), skillName, 'SKILL.md');
    assert.ok(existsSync(rootSkillPath), `root skill missing at ${rootSkillPath}`);
    assert.ok(existsSync(packagedSkillPath), `packaged skill missing at ${packagedSkillPath}`);
    assert.equal(
      readFileSync(packagedSkillPath, 'utf-8'),
      readFileSync(rootSkillPath, 'utf-8'),
      `${skillName} packaged skill drifted from root skill`,
    );
  }
});

test('Codex marketplace package includes the Hopper CLI used by its skill', () => {
  assert.ok(
    existsSync(join(CODEX_PACKAGE_ROOT, 'cli', 'bin', 'hopper-dispatch')),
    'packaged plugin must include cli/bin/hopper-dispatch',
  );
  assert.ok(
    existsSync(join(CODEX_PACKAGE_ROOT, 'cli', 'bin', 'hopper-runner')),
    'packaged plugin must include cli/bin/hopper-runner for background dispatch',
  );
  assert.ok(
    existsSync(join(CODEX_PACKAGE_ROOT, 'cli', 'src', 'dispatch.js')),
    'packaged plugin must include cli/src dependencies',
  );
});
