// Governance overlay resolver (opt-in prompt preamble).
// Anchor: cli/src/governance.js
//
// When .hopper/GOVERNANCE.md exists, dispatch prepends a behavioral constitution
// (+ optional per-vendor overlay) onto the composed prompt. This is the fable
// governance-injection fused into hopper's routing: the overlay is keyed on the
// SAME vendor resolveVendor() already returns. Pure file I/O — NO subprocess.

import { readFile } from 'node:fs/promises';
import { resolve, join, isAbsolute } from 'node:path';

/**
 * Parse GOVERNANCE.md content.
 * @param {string} content
 * @returns {{ constitutionPointer: string|null, overlays: Record<string,string> }}
 */
export function parseGovernanceContent(content) {
  const pointerMatch = content.match(/^[-*]\s*\*\*constitution\*\*\s*:\s*(.+?)\s*$/im);
  const constitutionPointer = pointerMatch ? stripBackticks(pointerMatch[1].trim()) : null;

  const overlays = {};
  const lines = content.split(/\r?\n/);
  let inOverlayTable = false;
  let pastSeparator = false;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (/^##\s+/.test(line)) {
      inOverlayTable = /vendor\s+overlays?/i.test(line);
      pastSeparator = false;
      continue;
    }
    if (!inOverlayTable || !line.startsWith('|')) continue;
    const cells = line.replace(/^\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
    if (!pastSeparator) {
      // skip header row and the |---|---| separator row
      if (cells.every((c) => /^:?-+:?$/.test(c))) pastSeparator = true;
      continue;
    }
    const vendor = stripBackticks((cells[0] || '').toLowerCase());
    const overlay = cells[1] || '';
    if (vendor && !/^vendor$/i.test(vendor)) overlays[vendor] = overlay;
  }
  return { constitutionPointer, overlays };
}

function stripBackticks(s) {
  return (s || '').replace(/^`/, '').replace(/`$/, '').trim();
}

/**
 * Load and parse .hopper/GOVERNANCE.md. Returns null if the file does not exist.
 * @param {string} hopperDir
 * @returns {Promise<{ constitutionPointer: string|null, overlays: Record<string,string> }|null>}
 */
export async function loadGovernance(hopperDir) {
  const path = join(hopperDir, 'GOVERNANCE.md');
  try {
    return parseGovernanceContent(await readFile(path, 'utf-8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * Resolve the constitution text from a pointer. Relative pointers resolve
 * against the project root that owns .hopper/ (dirname of hopperDir). Throws a
 * clear, actionable error when the pointer cannot be read — never silently
 * dispatches ungoverned.
 * @param {string} hopperDir
 * @param {string} pointer
 * @returns {Promise<string>}
 */
export async function resolveConstitutionText(hopperDir, pointer) {
  const projectRoot = resolve(hopperDir, '..');
  const target = isAbsolute(pointer) ? pointer : resolve(projectRoot, pointer);
  try {
    return await readFile(target, 'utf-8');
  } catch (err) {
    throw new Error(
      `governance enabled but constitution pointer '${pointer}' is unresolvable (${target}). ` +
      `Run \`hopper-dispatch --init-governance --from <fable>/prompts/portable-agent-core.md\` ` +
      `to vendor a copy, or fix the Constitution line in .hopper/GOVERNANCE.md.`
    );
  }
}

/**
 * Resolve the governance preamble for a dispatch. Returns null (no overlay) when
 * GOVERNANCE.md is absent or the task opts out with `Govern: off`. Otherwise
 * returns { constitution, overlay } keyed on the resolved vendor.
 *
 * Pure file I/O — never spawns. Called on the dispatch resolve path AFTER the
 * vendor is known and BEFORE composePrompt.
 *
 * @param {object} args
 * @param {string} args.hopperDir
 * @param {string} args.vendor
 * @param {{ govern?: string|null }} args.task
 * @returns {Promise<{ constitution: string, overlay: string }|null>}
 */
export async function resolveGovernance({ hopperDir, vendor, task }) {
  if (task && typeof task.govern === 'string' && task.govern.toLowerCase() === 'off') return null;
  const gov = await loadGovernance(hopperDir);
  if (!gov || !gov.constitutionPointer) return null;
  const constitution = await resolveConstitutionText(hopperDir, gov.constitutionPointer);
  const overlay = gov.overlays[vendor] || '';
  return { constitution, overlay };
}
