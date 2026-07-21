// OpenCode host adapter (Tier C #2) tests
// Anchor: tests/unit/opencode-host.test.js (T-PLUGIN-08b)
//
// Parallel to tests/unit/codex-cli-host.test.js. The patterns are intentionally
// identical to demonstrate cross-host parity.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { platform } from 'node:os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..', '..');
const HOST_DIR = join(REPO_ROOT, 'hosts', 'opencode');
const WRAPPER = join(HOST_DIR, 'bin', 'hopper-opencode');
const WRAPPER_CMD = join(HOST_DIR, 'bin', 'hopper-opencode.cmd');
const README = join(HOST_DIR, 'README.md');
const CODEX_WRAPPER = join(REPO_ROOT, 'hosts', 'codex-cli', 'bin', 'hopper-codex');
const COOKBOOK = join(REPO_ROOT, 'docs', 'cookbook.md');
const DASHBOARD_README = join(REPO_ROOT, 'dashboard', 'README.md');

test('opencode host directory exists with expected structure', () => {
  assert.ok(existsSync(HOST_DIR));
  assert.ok(existsSync(WRAPPER));
  assert.ok(existsSync(README));
});

test('wrapper script has bash shebang', () => {
  const content = readFileSync(WRAPPER, 'utf-8');
  assert.match(content, /^#!\/usr\/bin\/env bash/);
});

test('Windows .cmd wrapper exists and delegates to bash', () => {
  assert.ok(existsSync(WRAPPER_CMD));
  const content = readFileSync(WRAPPER_CMD, 'utf-8');
  assert.match(content, /bash.*hopper-opencode/i);
});

test('wrapper validates task-id with the SAME regex as Codex CLI host (cross-host parity)', () => {
  const content = readFileSync(WRAPPER, 'utf-8');
  assert.match(content, /\^\[A-Za-z\]\[A-Za-z0-9\._-\]\{0,99\}\$/);
});

test('wrapper explicitly rejects ".." (parity with Codex CLI + Claude Code)', () => {
  const content = readFileSync(WRAPPER, 'utf-8');
  assert.match(content, /\*\.\.\*|contain.*\.\./i);
});

test('wrapper resolves symlinks before computing PLUGIN_ROOT', () => {
  const content = readFileSync(WRAPPER, 'utf-8');
  assert.match(content, /resolve_script_dir|readlink/);
});

test('wrapper validates flags against {--write, --force} whitelist (parity)', () => {
  const content = readFileSync(WRAPPER, 'utf-8');
  assert.match(content, /--write\|--force/);
  assert.match(content, /invalid flag/i);
});

test('wrapper invokes opencode exactly once', () => {
  const content = readFileSync(WRAPPER, 'utf-8');
  // Count non-comment lines with `opencode` followed by a subcommand or run
  const lines = content.split('\n').filter((l) => !/^\s*#/.test(l));
  const execLines = lines.filter((l) => /\bexec opencode\b/.test(l));
  assert.equal(execLines.length, 1,
    `exactly one exec opencode line expected; got ${execLines.length}`);
});

test('wrapper has no active retry/fallback construct', () => {
  const content = readFileSync(WRAPPER, 'utf-8');
  const forbidden = [
    /while\b.*\bopencode\b/i,
    /while\b.*hopper-dispatch/i,
    /for\b.*\bopencode\b/i,
    /until\b.*\bopencode\b/i,
    /backoff|circuit.break|consensus|round.?robin/i,
    /if.*\$\?\s*-(ne|eq)\s*0.*\bopencode\b/i,
  ];
  for (const pat of forbidden) {
    assert.ok(!pat.test(content), `wrapper must not contain ${pat}`);
  }
});

test('wrapper does not issue git snapshot, worktree, or checkout commands', () => {
  const commands = readFileSync(WRAPPER, 'utf-8')
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');
  assert.doesNotMatch(commands, /\bgit\s+(?:snapshot|worktree|checkout)\b/i);
});

test('operator docs define the OpenCode execution and evidence boundary', () => {
  const cookbook = readFileSync(COOKBOOK, 'utf-8');
  const dashboard = readFileSync(DASHBOARD_README, 'utf-8');

  assert.match(cookbook, /tests use fake binaries and temporary directories/i);
  assert.match(cookbook, /native plugin is a disabled shim/i);
  assert.match(cookbook, /wrapper is the only repo-owned route/i);
  assert.match(cookbook, /record the command, cwd, and observed writes/i);
  assert.match(cookbook, /user-level snapshot side effect.*not.*handoff.*cache.*attestation status.*model evidence/is);
  assert.match(cookbook, /current native plugin route remains disabled/i);
  assert.match(cookbook, /separate design.*exact temporary root.*cleanup fixture/is);
  assert.match(cookbook, /does not promise.*strict no-write.*external/i);
  assert.match(dashboard, /external OpenCode.*not.*attestation.*model evidence/is);
});

test('wrapper prompt forbids soft-orchestration (diagnose/propose fixes/retry-nudge)', () => {
  const content = readFileSync(WRAPPER, 'utf-8');
  assert.match(content, /do not diagnose|Do NOT diagnose/i);
  assert.match(content, /not.*propose fixes|not.*suggest next steps/i);
});

test('wrapper prompt mentions user-action gate (spec §11)', () => {
  const content = readFileSync(WRAPPER, 'utf-8');
  assert.match(content, /§11|user-action gate|unified user-action/i);
  assert.match(content, /not.*apply.*automatically/i);
});

test('host README documents Tier C #2 + cross-host equivalence', () => {
  const content = readFileSync(README, 'utf-8');
  assert.match(content, /Tier C/);
  assert.match(content, /cross-host/i);
  // Must include the 4-route verification snippet
  assert.match(content, /hopper-codex/);
  assert.match(content, /hopper-opencode/);
  assert.match(content, /hopper:dispatch/);
});

test('OpenCode wrapper and Codex CLI wrapper share validation logic', () => {
  // Per cross-host equivalence: same regex, same .. rejection, same flag whitelist
  // should appear in BOTH wrappers byte-equivalently.
  const oc = readFileSync(WRAPPER, 'utf-8');
  const cx = readFileSync(CODEX_WRAPPER, 'utf-8');
  const taskIdPattern = /\^\[A-Za-z\]\[A-Za-z0-9\._-\]\{0,99\}\$/;
  assert.match(oc, taskIdPattern, 'opencode wrapper missing task-id regex');
  assert.match(cx, taskIdPattern, 'codex wrapper missing task-id regex');
  // Same dotdot rejection
  for (const w of [oc, cx]) assert.match(w, /\*\.\.\*/);
  // Same flag whitelist
  for (const w of [oc, cx]) assert.match(w, /--write\|--force/);
  // Same reasoning whitelist
  for (const w of [oc, cx]) assert.match(w, /minimal\|low\|medium\|high\|xhigh/);
  // Same sandbox whitelist
  for (const w of [oc, cx]) assert.match(w, /read-only\|workspace-write\|danger-full-access/);
});

// ─── dry-run validation (Unix only) ────────────────────────────────────

test('wrapper rejects ".." in task-id (dry-run)', { skip: platform() === 'win32' ? 'bash not standardly available on Windows CI' : false }, () => {
  let stderr = '';
  let exitCode = 0;
  try {
    execFileSync('bash', [WRAPPER, 'T..evil'], {
      env: { ...process.env, HOPPER_PLUGIN_ROOT: REPO_ROOT, PATH: process.env.PATH },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    stderr = err.stderr ? err.stderr.toString() : '';
    exitCode = err.status;
  }
  assert.equal(exitCode, 2);
  assert.match(stderr, /\.\./);
});

test('wrapper rejects unknown flag (dry-run)', { skip: platform() === 'win32' ? 'bash not standardly available on Windows CI' : false }, () => {
  let stderr = '';
  let exitCode = 0;
  try {
    execFileSync('bash', [WRAPPER, 'T-OK', '--malicious'], {
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

test('wrapper rejects when dispatcher binary missing (dry-run)', { skip: platform() === 'win32' ? 'bash not standardly available on Windows CI' : false }, () => {
  let stderr = '';
  let exitCode = 0;
  try {
    execFileSync('bash', [WRAPPER, 'T-OK'], {
      env: { ...process.env, HOPPER_PLUGIN_ROOT: '/nonexistent-root', PATH: process.env.PATH },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    stderr = err.stderr ? err.stderr.toString() : '';
    exitCode = err.status;
  }
  assert.equal(exitCode, 3);
  assert.match(stderr, /hopper-dispatch not found/i);
});
