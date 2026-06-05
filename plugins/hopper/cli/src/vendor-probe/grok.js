// grok vendor probe — static capability (ZERO subprocess spawn)
// Anchor: cli/src/vendor-probe/grok.js
//
// xAI "Grok Build" CLI has NO CONFIRMED machine-readable models-introspection
// subcommand in its headless reference (docs.x.ai). Rather than spawn a guessed
// command, declare the static known catalog (mirrors the agy probe pattern).
// Probe stays zero-spawn → estimateSpawns() returns 0 for grok (switch default
// on introspection_supported 'none').

import { resolveCommandWithKnownPaths } from '../path-resolve.js';
import { grokAdapter } from '../vendors/grok.js';

export async function probe() {
  const t0 = Date.now();
  const resolved = resolveCommandWithKnownPaths('grok', grokAdapter.knownInstallPaths || []);
  const binaryPath = resolved && resolved.resolvedPath ? resolved.resolvedPath : null;

  return {
    introspection_supported: 'none',
    binary_path: binaryPath,
    version: null,
    // Static catalog: no CONFIRMED CLI models subcommand. 2026-06-02 dogfood
    // feedback corrected the coding-model slug from grok-build-0.1 → grok-build.
    models: binaryPath ? ['grok-build', 'grok-4.3'] : [],
    models_source: 'xAI Grok Build static catalog (source: docs.x.ai/developers/models + 2026-06-02 dogfood feedback); no CONFIRMED CLI models-introspection subcommand. Adapter passes grok-build by default.',
    reasoning_levels: [],
    notes: binaryPath
      ? ['grok: no CONFIRMED machine-readable models subcommand; default model grok-build passed explicitly by adapter. reasoning not flag-configurable. NAME COLLISION: same `grok` binary may resolve to the third-party grok-cli (GROK_API_KEY, --format json).']
      : ['grok binary not found on PATH'],
    duration_ms: Date.now() - t0,
  };
}
