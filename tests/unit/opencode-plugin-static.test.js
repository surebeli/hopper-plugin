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

test('plugin remains present as a disabled shim', () => {
  const src = readFileSync(PLUGIN_PATH, 'utf-8');
  assert.match(src, /host!=vendor|host != vendor/i);
  assert.match(src, /hopper-opencode <task-id> --background|hopper-dispatch --background/);
});

test('plugin advertises disabled shim behavior instead of native async execution', () => {
  const src = readFileSync(PLUGIN_PATH, 'utf-8');
  assert.match(src, /Disabled shim/i);
  assert.match(src, /throw new Error/);
  assert.doesNotMatch(src, /prompt_async/);
  assert.doesNotMatch(src, /session\.idle/);
});

test('disabled shim throws before any native async or git mutation route', () => {
  const src = readFileSync(PLUGIN_PATH, 'utf-8');
  const throwIndex = src.indexOf('throw new Error');
  assert.ok(throwIndex >= 0, 'disabled shim must throw instead of routing');

  for (const route of ['prompt_async', 'session.idle', 'git snapshot', 'git worktree', 'git checkout']) {
    const routeIndex = src.toLowerCase().indexOf(route);
    assert.ok(routeIndex === -1 || throwIndex < routeIndex,
      `disabled shim must throw before a ${route} route`);
  }
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
  assert.match(readme, /host!=vendor|host != vendor/i);
});

test('plugin README explains when to use plugin vs CLI fallback', () => {
  const readme = readFileSync(PLUGIN_README, 'utf-8');
  assert.match(readme, /When to use/i);
  assert.match(readme, /wrapper|disabled|host!=vendor|host != vendor/i,
    'README must explain why the native path is disabled and where to go instead');
});

test('plugin README has install instructions for project + global', () => {
  const readme = readFileSync(PLUGIN_README, 'utf-8');
  assert.match(readme, /\.opencode\/plugins/);
  assert.match(readme, /~\/\.config\/opencode\/plugins|.config\/opencode\/plugins/);
});
