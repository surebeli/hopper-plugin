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

  const resolved = resolveCommandOnPath('opencode');
  if (!resolved || !resolved.resolvedPath) {
    return {
      introspection_supported: 'none',
      version: null,
      models: [],
      models_source: 'unavailable',
      reasoning_levels: [],
      notes: [],
      provenance: {
        source_kind: 'unavailable', source_label: 'unavailable',
        binary_availability: 'missing', binary_basename: null,
      },
      diagnostic_code: 'catalog-unavailable',
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
  let modelsSource = 'unavailable';
  let diagnosticCode = 'probe-failed';
  const modelsResult = await runOnce(cmd, [...prepend, 'models']);
  if (modelsResult.exitCode === 0 && modelsResult.stdout.trim()) {
    models = parseOpencodeModelsList(modelsResult.stdout);
    modelsSource = 'cli-catalog';
    diagnosticCode = 'none';
  } else {
  }

  return {
    introspection_supported: 'full',
    version,
    models,
    models_source: modelsSource,
    // No global reasoning enum — opencode does per-provider --variant
    reasoning_levels: [],
    notes: [],
    provenance: {
      source_kind: modelsSource === 'cli-catalog' ? 'cli-catalog' : 'unavailable',
      source_label: modelsSource === 'cli-catalog' ? 'opencode-cli-catalog' : 'unavailable',
      binary_availability: 'present', binary_basename: 'opencode',
    },
    diagnostic_code: diagnosticCode,
    duration_ms: Date.now() - t0,
  };
}
