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

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

test('Codex plugin manifest exists at repo-root /.codex-plugin/', () => {
  assert.ok(existsSync(CODEX_MANIFEST), `plugin.json missing at ${CODEX_MANIFEST}`);
  assert.doesNotThrow(() => readJson(CODEX_MANIFEST), 'Codex plugin.json must be valid JSON');
});

test('Codex plugin manifest declares required metadata', () => {
  const parsed = readJson(CODEX_MANIFEST);
  for (const field of ['name', 'version', 'description', 'author', 'homepage', 'repository', 'license', 'keywords', 'interface']) {
    assert.ok(parsed[field], `Codex plugin.json must declare ${field}`);
  }
  assert.equal(parsed.name, 'hopper');
  assert.match(parsed.version, /^\d+\.\d+\.\d+(-[A-Za-z0-9-]+)?$/);
  assert.ok(Array.isArray(parsed.keywords), 'keywords must be an array');
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
});

test('Codex plugin manifest does not reference missing component paths', () => {
  const parsed = readJson(CODEX_MANIFEST);
  for (const field of ['skills', 'hooks', 'mcpServers', 'apps']) {
    if (!parsed[field]) continue;
    const relativePath = parsed[field].replace(/^\.\//, '');
    assert.ok(existsSync(join(REPO_ROOT, relativePath)), `${field} path does not exist: ${parsed[field]}`);
  }
});
