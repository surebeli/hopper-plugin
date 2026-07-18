// grok vendor probe — runs `grok models` (live parse) with a static-catalog fallback
// Anchor: cli/src/vendor-probe/grok.js
//
// V3 upgrade (ISSUE-grok-model-line-rotation-stale-knownGood.md): xAI's Grok
// Build model line ROTATES without notice — `grok-build` and
// `grok-composer-2.5-fast`, both live-confirmed on 2026-06-02, silently became
// `unknown model id` by 2026-07-16. The previous version of this probe was
// ZERO-SPAWN and returned a hardcoded static catalog (with a note admitting
// "`grok models` DOES exist ... a live-introspection upgrade is a follow-up").
// That hardcoded catalog is exactly the "names rot" failure mode: it cannot
// self-heal, so a stale --probe cache kept resolving the `verified-latest`
// sentinel (cli/src/policy.js + cli/src/dispatch.js, which reads
// knownGood[0]) to a dead model name and every dispatch failed.
//
// This probe now spawns `grok models` and parses its "Available models:"
// section — CONFIRMED live output shape (grok CLI v0.2.101, 2026-07-18):
//
//   You are logged in with grok.com.
//
//   Default model: grok-4.5
//
//   Available models:
//     * grok-4.5 (default)
//
// Per spec §3 #4: probe() is a DIAGNOSTIC path (opt-in via --probe), distinct
// from the dispatch single-spawn invariant. This probe spawns at most ONE grok
// subprocess (`grok models`) with a hard 30s timeout. No retry. On spawn
// failure, timeout, or unparseable output, it degrades HONESTLY to the
// adapter's static knownGood (introspection 'partial', notes explain why) —
// it never silently reports an empty or fabricated catalog.

import { spawn } from 'node:child_process';
import { resolveCommandWithKnownPaths } from '../path-resolve.js';
import { killProcessTree } from '../subprocess.js';
import { grokAdapter } from '../vendors/grok.js';

const PROBE_TIMEOUT_MS = 30_000;
const IS_WINDOWS = process.platform === 'win32';

/**
 * P1-fix-style pure parser exposed for static-fixture tests.
 * Parses `grok models` text output for the bullet list under the
 * "Available models:" header, e.g.:
 *   Available models:
 *     * grok-4.5 (default)
 *     * grok-4.5-fast
 * Extracts the bare model id from each `* <id> [(default) ...]` / `- <id>`
 * line. Stops at the first line after the header that is blank-then-prose or
 * otherwise doesn't look like a bullet, so trailing help text isn't ingested
 * as a model name. Never throws — returns [] on any unrecognized shape so the
 * caller can fall back cleanly to the static knownGood.
 * @param {string} stdout
 * @returns {string[]}
 */
export function parseGrokModelsList(stdout) {
  const text = String(stdout || '');
  const headerMatch = text.match(/Available models:/i);
  if (!headerMatch) return [];
  const afterHeader = text.slice(headerMatch.index + headerMatch[0].length);
  const lines = afterHeader.split(/\r?\n/);
  const models = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue; // blank separator lines don't end the list
    const m = line.match(/^[*-]\s+([A-Za-z0-9][A-Za-z0-9._:/-]*)/);
    if (!m) break; // first non-bullet content after the header ends the list
    models.push(m[1]);
  }
  return models;
}

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

const NAME_COLLISION_NOTE = 'NAME COLLISION: same `grok` binary may resolve to the third-party grok-cli (GROK_API_KEY, --format json).';

export async function probe() {
  const t0 = Date.now();
  const staticKnownGood = (grokAdapter.capabilities && grokAdapter.capabilities.modelArg && grokAdapter.capabilities.modelArg.knownGood) || [];

  const resolved = resolveCommandWithKnownPaths('grok', grokAdapter.knownInstallPaths || []);
  const binaryPath = resolved && resolved.resolvedPath ? resolved.resolvedPath : null;

  if (!binaryPath) {
    return {
      introspection_supported: 'none',
      binary_path: null,
      version: null,
      models: [],
      models_source: 'grok binary not found on PATH',
      reasoning_levels: ['low', 'medium', 'high'],
      notes: ['grok binary not found on PATH'],
      duration_ms: Date.now() - t0,
    };
  }

  const cmd = resolved.command;
  const prepend = resolved.prependArgs || [];
  const modelsResult = await runOnce(cmd, [...prepend, 'models']);
  const models = (modelsResult.exitCode === 0 && modelsResult.stdout.trim())
    ? parseGrokModelsList(modelsResult.stdout)
    : [];

  if (models.length > 0) {
    return {
      introspection_supported: 'full',
      binary_path: binaryPath,
      version: null,
      models,
      models_source: '`grok models` (live parse of "Available models:" bullet list)',
      reasoning_levels: ['low', 'medium', 'high'],
      notes: [
        'grok: model line rotates without notice (ISSUE-grok-model-line-rotation-stale-knownGood.md) — this catalog is LIVE from `grok models`, not the static fallback, so it self-heals across xAI renames.',
        'reasoning via `--effort`/`--reasoning-effort` (opt-in when --reasoning set); level vocabulary not enumerated by `grok --help`, low|medium|high known-good.',
        NAME_COLLISION_NOTE,
      ],
      duration_ms: Date.now() - t0,
    };
  }

  // Honest fallback: the live spawn/parse did not yield a catalog. Degrade to
  // the adapter's static knownGood (mirrors claude.js's 'partial' pattern —
  // some real signal (binary resolved) but the model list itself is not
  // live) instead of caching an empty or stale-looking result.
  const notes = [];
  if (modelsResult.timedOut) {
    notes.push(`grok models timed out after ${PROBE_TIMEOUT_MS}ms; falling back to static knownGood.`);
  } else if (modelsResult.exitCode !== 0) {
    notes.push(`grok models exited ${modelsResult.exitCode}; stderr: ${(modelsResult.stderr || '').slice(0, 200)}; falling back to static knownGood.`);
  } else {
    notes.push(`grok models produced output that did not match the expected "Available models:" bullet-list shape; falling back to static knownGood. Raw (first 200 chars): ${JSON.stringify((modelsResult.stdout || '').slice(0, 200))}`);
  }
  notes.push('Static fallback catalog source: grok.js capabilities.modelArg.sourceNote (hand-curated, can itself go stale — this is the offline baseline, not a live introspection).');
  notes.push(NAME_COLLISION_NOTE);

  return {
    introspection_supported: 'partial',
    binary_path: binaryPath,
    version: null,
    models: staticKnownGood,
    models_source: 'static knownGood fallback (live `grok models` parse failed)',
    reasoning_levels: ['low', 'medium', 'high'],
    notes,
    duration_ms: Date.now() - t0,
  };
}
