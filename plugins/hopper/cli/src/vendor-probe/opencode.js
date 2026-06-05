// opencode vendor probe — runs `opencode models` + `opencode auth list` + `opencode --version`
// Anchor: cli/src/vendor-probe/opencode.js

import { spawn } from 'node:child_process';
import { resolveCommandOnPath } from '../path-resolve.js';
import { killProcessTree } from '../subprocess.js';

const PROBE_TIMEOUT_MS = 30_000;
const IS_WINDOWS = process.platform === 'win32';

// P1-fix: pure helpers exposed for static-fixture tests.
const ANSI_ESCAPE_RE = /\x1B\[[0-?]*[ -/]*[@-~]/g;

export function stripAnsi(s) {
  return s.replace(ANSI_ESCAPE_RE, '');
}

/**
 * Parse opencode `models` text output into a model identifier list.
 * Strips ANSI codes, splits on newlines, filters lines that don't look
 * like model identifiers (skip headers / prose / blank lines).
 *
 * R2-P1: regex is fully-anchored — line must be ENTIRELY identifier chars
 * (no whitespace, no trailing punctuation). Previously the unanchored regex
 * accepted header lines like `Available models:` (only the prefix needed
 * to match).
 */
export function parseOpencodeModelsList(stdout) {
  return stripAnsi(stdout)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && /^[A-Za-z0-9][A-Za-z0-9._/:-]+$/.test(l));
}

// P4-fix: timeout uses killProcessTree to prevent Windows process-tree leak.
function runOnce(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      detached: !IS_WINDOWS,
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    const timer = setTimeout(() => { timedOut = true; killProcessTree(child.pid, IS_WINDOWS); }, PROBE_TIMEOUT_MS);
    timer.unref();
    child.on('close', (code) => { clearTimeout(timer); resolve({ exitCode: code ?? 1, stdout, stderr, timedOut }); });
    child.on('error', () => { clearTimeout(timer); resolve({ exitCode: 127, stdout, stderr, timedOut: false }); });
  });
}

export async function probe() {
  const t0 = Date.now();
  const notes = [];

  const resolved = resolveCommandOnPath('opencode');
  if (!resolved || !resolved.resolvedPath) {
    return {
      introspection_supported: 'none',
      binary_path: null,
      version: null,
      models: [],
      models_source: 'opencode not on PATH',
      reasoning_levels: [],
      notes: ['opencode binary not found on PATH'],
      duration_ms: Date.now() - t0,
    };
  }
  const cmd = resolved.command;
  const prepend = resolved.prependArgs;

  // 1. version
  let version = null;
  const verResult = await runOnce(cmd, [...prepend, '--version']);
  if (verResult.exitCode === 0 && verResult.stdout) {
    const m = verResult.stdout.match(/[\d]+\.[\d]+\.[\d]+/);
    if (m) version = m[0];
  }

  // 2. models — text output, one per line (NO --json per research)
  let models = [];
  let modelsSource = '';
  const modelsResult = await runOnce(cmd, [...prepend, 'models']);
  if (modelsResult.exitCode === 0 && modelsResult.stdout.trim()) {
    models = parseOpencodeModelsList(modelsResult.stdout);
    modelsSource = 'opencode models (text)';
  } else if (modelsResult.timedOut) {
    notes.push('opencode models timed out');
    modelsSource = 'timeout';
  } else {
    notes.push(`opencode models exited ${modelsResult.exitCode}; stderr: ${modelsResult.stderr.slice(0, 200)}`);
    modelsSource = `exit ${modelsResult.exitCode}`;
  }

  // 3. auth list — what providers are signed in (informational)
  const authResult = await runOnce(cmd, [...prepend, 'auth', 'list']);
  if (authResult.exitCode === 0 && authResult.stdout.trim()) {
    const clean = stripAnsi(authResult.stdout).slice(0, 500);
    const providerCount = (clean.match(/\b(anthropic|openai|deepseek|opencode|xiaomi|google|mistral|groq)\b/gi) || []).length;
    notes.push(`opencode auth list found ${providerCount} provider mention(s); see cache for excerpt`);
    notes.push(`auth excerpt: ${clean.slice(0, 200).replace(/\n/g, ' | ')}`);
  } else {
    notes.push('opencode auth list unavailable (may need server running)');
  }

  return {
    introspection_supported: 'full',
    binary_path: resolved.resolvedPath,
    version,
    models,
    models_source: modelsSource,
    // No global reasoning enum — opencode does per-provider --variant
    reasoning_levels: [],
    notes,
    duration_ms: Date.now() - t0,
  };
}
