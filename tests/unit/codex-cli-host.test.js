// Codex CLI host adapter (Tier C #1) tests
// Anchor: tests/unit/codex-cli-host.test.js (T-PLUGIN-08a)
//
// Static-artifact tests + dry-run argument validation (we cannot exercise codex
// CLI in tests without auth + subprocess time; functional verification = manual
// smoke per spec §11).

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { platform } from 'node:os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..', '..');
const HOST_DIR = join(REPO_ROOT, 'hosts', 'codex-cli');
const WRAPPER = join(HOST_DIR, 'bin', 'hopper-codex');
const WRAPPER_CMD = join(HOST_DIR, 'bin', 'hopper-codex.cmd');
const README = join(HOST_DIR, 'README.md');

test('codex CLI host directory exists with expected structure', () => {
  assert.ok(existsSync(HOST_DIR), `hosts/codex-cli/ missing`);
  assert.ok(existsSync(join(HOST_DIR, 'bin')), `hosts/codex-cli/bin/ missing`);
  assert.ok(existsSync(WRAPPER), `wrapper script missing at ${WRAPPER}`);
  assert.ok(existsSync(README), `host README missing`);
});

test('wrapper script has bash shebang', () => {
  const content = readFileSync(WRAPPER, 'utf-8');
  assert.match(content, /^#!\/usr\/bin\/env bash/,
    'wrapper must start with #!/usr/bin/env bash');
});

test('Windows .cmd wrapper exists and delegates to bash', () => {
  assert.ok(existsSync(WRAPPER_CMD), 'hopper-codex.cmd missing for Windows');
  const content = readFileSync(WRAPPER_CMD, 'utf-8');
  assert.match(content, /bash.*hopper-codex/i,
    '.cmd wrapper must invoke bash on the main script');
});

test('wrapper validates task-id with explicit regex (codex Phase 3 F2 echo)', () => {
  const content = readFileSync(WRAPPER, 'utf-8');
  // Must contain the exact same regex as the Claude Code dispatch.md
  assert.match(content, /\^\[A-Za-z\]\[A-Za-z0-9\._-\]\{0,99\}\$/,
    'wrapper must validate task-id with documented regex');
});

test('wrapper validates flags against explicit whitelist', () => {
  const content = readFileSync(WRAPPER, 'utf-8');
  assert.match(content, /--write\|--force/,
    'wrapper must whitelist --write and --force');
  assert.match(content, /invalid flag/i,
    'wrapper must reject unknown flags');
});

test('wrapper invokes codex exec exactly once (single-spawn invariant)', () => {
  const content = readFileSync(WRAPPER, 'utf-8');
  // Count occurrences of `codex exec` invocations
  const matches = content.match(/codex exec/g) || [];
  assert.equal(matches.length, 1,
    `wrapper must invoke 'codex exec' exactly once; found ${matches.length} occurrences`);
});

test('wrapper has no retry / fallback / orchestration LOGIC (prose mentions of "do not retry" allowed)', () => {
  const content = readFileSync(WRAPPER, 'utf-8');
  // Per spec §3 #4: check for active retry/orchestration CONSTRUCTS, not the
  // mere word "retry" — the wrapper's prompt-to-codex includes "Do NOT retry"
  // reminders which are spec-compliance language, not retry logic.
  //
  // Active retry constructs would be:
  //   - while/until/for loops that re-invoke codex or hopper-dispatch
  //   - if-on-failure branches that retry
  //   - fallback to a different vendor/command
  const activeRetryPatterns = [
    /while\b.*\bcodex\b/i,
    /while\b.*hopper-dispatch/i,
    /for\b.*\bcodex\b/i,
    /until\b.*\bcodex\b/i,
    /backoff|circuit.break|consensus|round.?robin/i,
    /if.*\$\?\s*-(ne|eq)\s*0.*\bcodex\b/i,
  ];
  for (const forbidden of activeRetryPatterns) {
    assert.ok(!forbidden.test(content),
      `wrapper must not contain active orchestration pattern ${forbidden} per spec §3 #4`);
  }

  // The single `codex exec` invocation should be reachable by EXACTLY one
  // line (the exec command). Count occurrences again here as belt-and-braces.
  const codexExecLines = content.split('\n').filter((l) => /codex exec/.test(l) && !/^\s*#/.test(l));
  assert.equal(codexExecLines.length, 1,
    'exactly one non-comment line should invoke `codex exec`');
});

test('wrapper resolves HOPPER_PLUGIN_ROOT correctly', () => {
  const content = readFileSync(WRAPPER, 'utf-8');
  assert.match(content, /HOPPER_PLUGIN_ROOT/,
    'wrapper must respect HOPPER_PLUGIN_ROOT env var');
  assert.match(content, /cli\/bin\/hopper-dispatch/,
    'wrapper must point at the host-agnostic dispatcher');
});

test('wrapper builds prompt mentioning user-action gate (spec §11)', () => {
  const content = readFileSync(WRAPPER, 'utf-8');
  assert.match(content, /§11|user-action gate|unified user-action/i,
    'wrapper prompt must remind codex of user-action gate');
  assert.match(content, /not apply.*automatically|do not retry/i,
    'wrapper prompt must forbid auto-application of suggested edits');
});

test('host README documents Tier C #1 + cross-host equivalence claim', () => {
  const content = readFileSync(README, 'utf-8');
  assert.match(content, /Tier C/);
  assert.match(content, /cross-host/i);
  assert.match(content, /hopper-codex/);
  // Must include install instructions + prerequisites + troubleshooting table
  assert.match(content, /Install/);
  assert.match(content, /Prerequisites/);
  assert.match(content, /Troubleshooting/);
});

test('host README warns of single-spawn + no-harness-core', () => {
  const content = readFileSync(README, 'utf-8');
  assert.match(content, /single-spawn|Single-spawn/);
  assert.match(content, /no.*retry|No retry|no harness/i);
});

// ─── argument validation dry-run (only on Unix where bash is available) ───

test('wrapper rejects bad task-id without invoking codex', { skip: platform() === 'win32' ? 'bash not standardly available on Windows CI' : false }, () => {
  // Path traversal attempt
  let stderr = '';
  let exitCode = 0;
  try {
    execFileSync('bash', [WRAPPER, '../escape'], {
      env: { ...process.env, HOPPER_PLUGIN_ROOT: REPO_ROOT, PATH: process.env.PATH },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    stderr = err.stderr ? err.stderr.toString() : '';
    exitCode = err.status;
  }
  assert.equal(exitCode, 2, 'invalid task-id must exit with code 2 (validation error)');
  assert.match(stderr, /^Error: task-id/, 'stderr must show validation error');
});

test('wrapper rejects unknown flag without invoking codex', { skip: platform() === 'win32' ? 'bash not standardly available on Windows CI' : false }, () => {
  let stderr = '';
  let exitCode = 0;
  try {
    execFileSync('bash', [WRAPPER, 'T-OK', '--evil-flag'], {
      env: { ...process.env, HOPPER_PLUGIN_ROOT: REPO_ROOT, PATH: process.env.PATH },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    stderr = err.stderr ? err.stderr.toString() : '';
    exitCode = err.status;
  }
  assert.equal(exitCode, 2);
  assert.match(stderr, /invalid flag/i);
});

test('wrapper rejects when dispatch binary missing', { skip: platform() === 'win32' ? 'bash not standardly available on Windows CI' : false }, () => {
  let stderr = '';
  let exitCode = 0;
  try {
    execFileSync('bash', [WRAPPER, 'T-OK'], {
      env: { ...process.env, HOPPER_PLUGIN_ROOT: '/nonexistent-plugin-root', PATH: process.env.PATH },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    stderr = err.stderr ? err.stderr.toString() : '';
    exitCode = err.status;
  }
  assert.equal(exitCode, 3, 'missing dispatcher must exit code 3');
  assert.match(stderr, /hopper-dispatch not found/i);
});
