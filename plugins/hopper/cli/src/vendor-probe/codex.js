// codex vendor probe — runs `codex debug models --bundled` + `codex --version`
// Anchor: cli/src/vendor-probe/codex.js
//
// Per spec §3 #4: probe() is a DIAGNOSTIC path (opt-in via --probe), distinct
// from dispatch single-spawn invariant. Each probe spawns up to 2 codex
// subprocesses (debug models + version) with hard 30s timeout each. No retry.

import { spawn } from 'node:child_process';
import { resolveCommandOnPath } from '../path-resolve.js';
import { killProcessTree } from '../subprocess.js';

const PROBE_TIMEOUT_MS = 30_000;
const IS_WINDOWS = process.platform === 'win32';

/**
 * P1-fix: pure parser exposed for static-fixture testing.
 * Codex `debug models --bundled` returns JSON: either an array or
 * `{ models: [...] }`. Each entry has a `.slug` identifier (preferred);
 * may fall back to `.name` or `.id` for forward-compat with schema changes.
 * Returns identifier list; throws on JSON parse failure.
 */
export function parseCodexModelsJson(stdout) {
  const parsed = JSON.parse(stdout);
  const list = Array.isArray(parsed) ? parsed : (parsed.models || []);
  return list.map((m) => {
    if (typeof m === 'string') return m;
    return m.slug || m.name || m.id || null;
  }).filter(Boolean);
}

/**
 * Run a single subprocess attempt; capture stdout + exit code.
 * No retry. Times out after PROBE_TIMEOUT_MS. P4-fix: timeout uses
 * killProcessTree (taskkill /T /F on Windows, negative-PID SIGKILL on POSIX)
 * so child trees don't leak past the probe timeout.
 */
function runOnce(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      detached: !IS_WINDOWS,  // group-kill needs detached on POSIX
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

/**
 * Probe codex CLI for available models + version.
 * Returns the standard probe-result shape (see cli/src/cache.js schema).
 */
export async function probe() {
  const t0 = Date.now();
  const notes = [];

  // Resolve binary path (no spawn — uses in-process PATH walk)
  const resolved = resolveCommandOnPath('codex');
  if (!resolved || !resolved.resolvedPath) {
    return {
      introspection_supported: 'none',
      binary_path: null,
      version: null,
      models: [],
      models_source: 'codex not on PATH',
      reasoning_levels: [],
      notes: ['codex binary not found on PATH; install codex CLI first'],
      duration_ms: Date.now() - t0,
    };
  }

  // Build spawn command (codex.cmd on Windows needs cmd.exe wrap; resolveCommandOnPath handled this)
  const cmd = resolved.command;
  const prepend = resolved.prependArgs;

  // 1. version
  let version = null;
  const verResult = await runOnce(cmd, [...prepend, '--version']);
  if (verResult.exitCode === 0 && verResult.stdout) {
    const m = verResult.stdout.match(/[\d]+\.[\d]+\.[\d]+/);
    if (m) version = m[0];
  } else if (verResult.timedOut) {
    notes.push('codex --version timed out');
  }

  // 2. model catalog via `codex debug models --bundled` (JSON output per official docs)
  let models = [];
  let modelsSource = '';
  const modelsResult = await runOnce(cmd, [...prepend, 'debug', 'models', '--bundled']);
  if (modelsResult.exitCode === 0 && modelsResult.stdout.trim()) {
    try {
      models = parseCodexModelsJson(modelsResult.stdout);
      modelsSource = 'codex debug models --bundled (JSON, .slug field)';
    } catch (err) {
      notes.push(`codex debug models JSON parse failed: ${err.message}`);
      modelsSource = 'codex debug models --bundled (unparseable)';
    }
  } else if (modelsResult.timedOut) {
    notes.push('codex debug models timed out');
    modelsSource = 'timeout';
  } else {
    notes.push(`codex debug models exited ${modelsResult.exitCode}; stderr: ${modelsResult.stderr.slice(0, 200)}`);
    modelsSource = `exit ${modelsResult.exitCode}`;
  }

  return {
    introspection_supported: 'full',
    binary_path: resolved.resolvedPath,
    version,
    models,
    models_source: modelsSource,
    // Static (per research): codex supports 5 reasoning levels via -c flag
    reasoning_levels: ['minimal', 'low', 'medium', 'high', 'xhigh'],
    notes,
    duration_ms: Date.now() - t0,
  };
}
