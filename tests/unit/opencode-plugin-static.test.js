// OpenCode hopper-async plugin static checks (Phase 5b)
// Anchor: tests/unit/opencode-plugin-static.test.js
//
// Cannot test the plugin functionally without a live `opencode serve`
// (it depends on OpenCode SDK + lifecycle events). These tests verify
// static properties of the plugin source: structure, validation regex
// parity, spec compliance language, anti-persona phrasing.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..', '..');
const PLUGIN_PATH = join(REPO_ROOT, 'hosts', 'opencode', 'plugins', 'hopper-async.ts');
const PLUGIN_README = join(REPO_ROOT, 'hosts', 'opencode', 'plugins', 'README.md');

test('OpenCode hopper-async plugin file exists', () => {
  assert.ok(existsSync(PLUGIN_PATH), `plugin missing at ${PLUGIN_PATH}`);
  assert.ok(existsSync(PLUGIN_README), `plugin README missing`);
});

test('plugin uses canonical TASK_ID regex (cross-host parity with §3 #5)', () => {
  const src = readFileSync(PLUGIN_PATH, 'utf-8');
  assert.match(src, /\^\[A-Za-z\]\[A-Za-z0-9\._-\]\{0,99\}\$/,
    'plugin must use the canonical task-id regex');
  assert.match(src, /\.\.|path traversal/,
    'plugin must explicitly reject "..". in task-id');
});

test('plugin writes status=in-progress before async dispatch', () => {
  const src = readFileSync(PLUGIN_PATH, 'utf-8');
  assert.match(src, /status:.*['"`]?in-progress['"`]?/,
    'plugin must seed status=in-progress before invoking prompt_async');
});

test('plugin uses OpenCode native prompt_async (not blocking prompt)', () => {
  const src = readFileSync(PLUGIN_PATH, 'utf-8');
  assert.match(src, /prompt_async/,
    'plugin must use prompt_async per spec §14.9 native-preferred path');
  assert.ok(!/await.*\.prompt\s*\(/.test(src),
    'plugin must NOT use blocking prompt() — that would block the session');
});

test('plugin handles session.idle hook (completion notification)', () => {
  const src = readFileSync(PLUGIN_PATH, 'utf-8');
  assert.match(src, /['"`]session\.idle['"`]/, 'plugin must register session.idle hook');
  assert.match(src, /['"`]session\.error['"`]/, 'plugin must register session.error hook');
});

test('plugin uses status state machine matching spec §14.4', () => {
  const src = readFileSync(PLUGIN_PATH, 'utf-8');
  // Must emit done / failed status values
  assert.match(src, /['"`]done['"`]/, 'must use "done" status string');
  assert.match(src, /['"`]failed['"`]/, 'must use "failed" status string');
});

test('plugin has NO retry / fallback / orchestration constructs', () => {
  const src = readFileSync(PLUGIN_PATH, 'utf-8');
  const forbidden = [
    /while\b.*\bprompt_async\b/i,
    /while\b.*\bcreate\b/i,
    /retry.*loop|loop.*retry/i,
    /backoff|circuit.break|consensus|round.?robin/i,
    /catch.*\{[\s\S]*?prompt_async/i,  // no retry-on-catch pattern
  ];
  for (const pat of forbidden) {
    assert.ok(!pat.test(src), `plugin must not contain ${pat} (spec §3 #4)`);
  }
});

test('plugin README documents §14 spec compliance section', () => {
  const readme = readFileSync(PLUGIN_README, 'utf-8');
  assert.match(readme, /Spec compliance/);
  assert.match(readme, /§14\.4|§14\.6|§14\.10/,
    'README must cite spec §14 sub-sections');
  assert.match(readme, /single-spawn/i);
});

test('plugin README explains when to use plugin vs CLI fallback', () => {
  const readme = readFileSync(PLUGIN_README, 'utf-8');
  assert.match(readme, /When to use/i);
  assert.match(readme, /native-preferred|native preferred|spec §14\.4/i,
    'README must explain the native-preferred constraint #4 rationale');
});

test('plugin README has install instructions for project + global', () => {
  const readme = readFileSync(PLUGIN_README, 'utf-8');
  assert.match(readme, /\.opencode\/plugins/);
  assert.match(readme, /~\/\.config\/opencode\/plugins|.config\/opencode\/plugins/);
});
