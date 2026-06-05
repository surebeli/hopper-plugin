// agy vendor probe — fixed capability (ZERO subprocess spawn)
// Anchor: cli/src/vendor-probe/agy.js
//
// Per Phase 6b research (docs/research/vendor-introspection/03-copilot-agy.md):
// agy CLI has NO --model flag, NO models subcommand, NO --version subcommand.
// Default model `gemini-3.5-flash` is baked into the binary. There is nothing
// to probe — just declare the static capability.

import { resolveCommandWithKnownPaths } from '../path-resolve.js';
import { agyAdapter } from '../vendors/agy.js';

export async function probe() {
  const t0 = Date.now();
  // Phase 6c F2: respect adapter's knownInstallPaths so probe matches dispatch.
  // Without this, probe correctly reports 0 models for agy on Windows
  // (because the installer didn't add bin to PATH) even though the binary
  // is present at its deterministic install path.
  const resolved = resolveCommandWithKnownPaths('agy', agyAdapter.knownInstallPaths || []);
  const binaryPath = resolved && resolved.resolvedPath ? resolved.resolvedPath : null;

  return {
    introspection_supported: 'none',
    binary_path: binaryPath,
    version: null,
    // Static: agy uses gemini-3.5-flash baked into the binary (per launch docs).
    // User cannot select a different model via flag/env per research. Identifier
    // must be canonical (no prose) so soft-warn string match works against
    // `--model gemini-3.5-flash`. Provenance goes in models_source / notes.
    models: binaryPath ? ['gemini-3.5-flash'] : [],
    models_source: 'agy CLI static model (source: agy vendor README); baked into binary, no --model flag',
    reasoning_levels: [],
    notes: binaryPath
      ? ['agy: no introspection commands; --model not supported; reasoning not flag-configurable. Default gemini-3.5-flash is baked into the binary.']
      : ['agy binary not found on PATH'],
    duration_ms: Date.now() - t0,
  };
}
