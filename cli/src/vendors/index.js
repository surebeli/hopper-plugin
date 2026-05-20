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
