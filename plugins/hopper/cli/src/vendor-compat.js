// Vendor CLI compatibility probe (HOPPER `--check --compat`).
// Anchor: cli/src/vendor-compat.js
//
// Spawns `<vendor> --help` and checks that the long-form flags the adapter
// relies on (adapter.compatFlags) are present, catching CLI-version drift
// BEFORE a dispatch silently fails (vendor-preset feedback 2026-06-15: Grok/Kimi
// presets had drifted from the installed CLIs).
//
// This module is the carve-out for the `--help` spawn (like vendor-probe/*.js
// is for `--probe`). It is NOT on the dispatch path and is NOT imported by it,
// so the single-spawn invariant (spec §3 #4) is preserved. It is deliberately
// kept OUT of vendors/index.js + the adapter files so the no-spawn discovery
// test (tests/unit/discovery.test.js) still passes for those.

import { spawnSync } from 'node:child_process';
import { getAdapter } from './vendors/index.js';
import { resolveCommandWithKnownPaths } from './path-resolve.js';

/**
 * Check one adapter's emitted flags against its CLI `--help`.
 *
 * @param {string} name
 * @returns {{ name: string, ran: boolean, reason?: string, flags?: string[]|null,
 *             present?: string[], missing?: string[], helpBytes?: number }}
 */
export function compatCheckForAdapter(name) {
  const adapter = getAdapter(name);  // throws on unknown vendor
  const flags = adapter.compatFlags || null;

  const resolved = resolveCommandWithKnownPaths(adapter.command, adapter.knownInstallPaths || []);
  if (!resolved || !resolved.resolvedPath) {
    return { name, ran: false, reason: 'binary not found on PATH', flags };
  }
  if (!flags || flags.length === 0) {
    return { name, ran: false, reason: 'no compatFlags declared (nothing to verify)', flags: null };
  }

  let help = '';
  let error = null;
  try {
    const r = spawnSync(resolved.command, [...resolved.prependArgs, '--help'], {
      encoding: 'utf-8',
      timeout: 8000,
      windowsHide: true,
    });
    help = `${r.stdout || ''}\n${r.stderr || ''}`;
    if (r.error) error = r.error.message;
  } catch (err) {
    error = err.message;
  }
  if (!help.trim()) {
    return { name, ran: false, reason: `--help produced no output${error ? ` (${error})` : ''}`, flags };
  }

  const present = flags.filter((f) => help.includes(f));
  const missing = flags.filter((f) => !help.includes(f));
  return { name, ran: true, present, missing, helpBytes: help.length };
}
