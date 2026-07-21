// claude vendor probe — runs `claude --version` (no model-catalog command)
// Anchor: cli/src/vendor-probe/claude.js
//
// Per spec §3 #4: probe() is a DIAGNOSTIC path (opt-in via --probe), distinct
// from the dispatch single-spawn invariant. This probe spawns at most ONE claude
// subprocess (`--version`) with a hard 30s timeout. No retry.
//
// Claude Code has NO machine-readable model-catalog command (unlike codex's
// `debug models --bundled` or kimi's `provider list --json`): the reachable
// models depend on the authenticated account's subscription. So introspection is
// 'partial' — version is live, the model list is the static alias set
// (sonnet|opus|haiku|fable) plus a note pointing the user at the live source.

import { spawn } from 'node:child_process';
import { resolveCommandOnPath } from '../path-resolve.js';
import { killProcessTree } from '../subprocess.js';

const PROBE_TIMEOUT_MS = 30_000;
const IS_WINDOWS = process.platform === 'win32';

// Static alias set accepted by `claude --model` (cli-reference 2026-06-16). NOT a
// live catalog — exact model ids/tiers are account/subscription dependent.
const KNOWN_MODEL_ALIASES = ['sonnet', 'opus', 'haiku', 'fable'];

/** Run a single subprocess attempt; capture stdout + exit code. No retry. */
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
 * Probe claude CLI for version. Returns the standard probe-result shape
 * (see cli/src/cache.js schema).
 */
export async function probe() {
  const t0 = Date.now();

  // Resolve binary path (no spawn — uses in-process PATH walk).
  const resolved = resolveCommandOnPath('claude');
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

  let version = null;
  const verResult = await runOnce(cmd, [...prepend, '--version']);
  if (verResult.exitCode === 0 && verResult.stdout) {
    const m = verResult.stdout.match(/[\d]+\.[\d]+\.[\d]+/);
    if (m) version = m[0];
  }

  return {
    introspection_supported: 'partial',  // version is live; model list is static aliases
    version,
    models: KNOWN_MODEL_ALIASES,
    models_source: 'adapter-aliases',
    reasoning_levels: [],  // no per-invocation reasoning-effort flag in claude -p
    notes: [],
    provenance: {
      source_kind: 'adapter-aliases', source_label: 'claude-selector-metadata',
      binary_availability: 'present', binary_basename: 'claude',
    },
    diagnostic_code: 'none',
    duration_ms: Date.now() - t0,
  };
}
