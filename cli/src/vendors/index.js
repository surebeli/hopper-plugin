// Vendor adapter registry (T-PLUGIN-05a-e composition point)
// Anchor: cli/src/vendors/index.js
//
// Per spec §3 #4: this is a STATIC registry. No dynamic loading, no plugin
// discovery, no runtime registration. Adapters are imported at load time.
// Adding a vendor = edit this file + add adapter module.

import { codexAdapter } from './codex.js';
import { kimiAdapter } from './kimi.js';
import { opencodeAdapter } from './opencode.js';
import { copilotAdapter } from './copilot.js';
import { agyAdapter } from './agy.js';

/** @type {Record<string, import('../types.js').VendorAdapter>} */
const REGISTRY = {
  codex: codexAdapter,
  kimi: kimiAdapter,
  opencode: opencodeAdapter,
  copilot: copilotAdapter,
  agy: agyAdapter,
};

/**
 * Get a vendor adapter by name.
 *
 * @param {string} name
 * @returns {import('../types.js').VendorAdapter}
 * @throws {Error} If no adapter registered for this name
 */
export function getAdapter(name) {
  const adapter = REGISTRY[name];
  if (!adapter) {
    const known = Object.keys(REGISTRY).join(', ');
    throw new Error(`No vendor adapter registered for '${name}'. Known adapters: ${known}`);
  }
  return adapter;
}

/**
 * List all registered vendor adapter names.
 *
 * @returns {string[]}
 */
export function listAdapters() {
  return Object.keys(REGISTRY);
}

/**
 * Phase 6a: install-check helper. Runs in-process binary + auth checks
 * for one adapter. NO subprocess spawn (no vendor introspection).
 *
 * @param {string} name
 * @returns {{
 *   name: string,
 *   command: string,
 *   binaryFound: boolean,
 *   resolvedPath: string | null,
 *   needsShellWrap: boolean,
 *   authOk: boolean,
 *   authNotes: string[],
 *   overallStatus: 'READY' | 'AUTH_NEEDED' | 'NOT_INSTALLED' | 'UNKNOWN',
 * }}
 */
export async function installCheckForAdapter(name) {
  const { resolveCommandOnPath } = await import('../path-resolve.js');
  const adapter = REGISTRY[name];
  if (!adapter) throw new Error(`No vendor adapter registered for '${name}'`);
  const resolved = resolveCommandOnPath(adapter.command);
  const binaryFound = resolved !== null && resolved.resolvedPath !== null;
  const auth = adapter.envPreflight();
  const authOk = auth.ok && (!auth.missing || auth.missing.length === 0);
  let overallStatus = 'READY';
  if (!binaryFound) overallStatus = 'NOT_INSTALLED';
  else if (!auth.ok) overallStatus = 'AUTH_NEEDED';
  else if (auth.missing && auth.missing.length > 0) overallStatus = 'READY';  // soft-warn doesn't downgrade
  return {
    name,
    command: adapter.command,
    binaryFound,
    resolvedPath: resolved ? resolved.resolvedPath : null,
    needsShellWrap: resolved ? resolved.prependArgs.length > 0 : false,
    authOk,
    authNotes: auth.missing || [],
    overallStatus,
  };
}

/**
 * Phase 6a: capabilities lookup. Returns the adapter's static capability
 * hint object, or null if the adapter lacks one.
 *
 * @param {string} name
 * @returns {object | null}
 */
export function capabilitiesForAdapter(name) {
  const adapter = REGISTRY[name];
  if (!adapter) throw new Error(`No vendor adapter registered for '${name}'`);
  return adapter.capabilities || null;
}
