// AGENTS.md parser + vendor router (T-PLUGIN-04)
// Anchor: cli/src/agents.js
//
// Per spec §3 #4 + codex F1: routing is a PURE FUNCTION of (taskType, agents).
// NO memoization across dispatches. NO retry-aware vendor selection.
// NO round-robin. NO load-balance state. Deterministic static lookup ONLY.

import { readFile } from 'node:fs/promises';

/**
 * Parse a .hopper/AGENTS.md file.
 *
 * @param {string} filePath
 * @returns {Promise<{ agents: import('./types.js').AgentBinding[], preferences: Record<string, string> }>}
 */
export async function parseAgentsFile(filePath) {
  const content = await readFile(filePath, 'utf-8');
  return parseAgentsContent(content);
}

/**
 * Parse AGENTS content directly (for testing).
 *
 * @param {string} content
 * @returns {{ agents: import('./types.js').AgentBinding[], preferences: Record<string, string> }}
 */
export function parseAgentsContent(content) {
  const lines = content.split(/\r?\n/);
  const agents = [];
  const preferences = {};

  // Three sections of interest:
  // 1. "Active Agent Instances" table — nickname → vendor binding
  // 2. "Task-type → vendor default preference" table — task-type → vendor

  let currentSection = null;     // 'agents' | 'preferences' | null
  let inTable = false;
  let columnMap = null;
  let pastSeparator = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Detect section headers
    if (/^##\s+/.test(line)) {
      currentSection = null;
      inTable = false;
      columnMap = null;
      pastSeparator = false;
      if (/active agent instances/i.test(line)) currentSection = 'agents';
      else if (/task-type.*vendor.*preference|task-type.*preference|vendor default preference/i.test(line)) currentSection = 'preferences';
      continue;
    }

    if (!currentSection || !line.startsWith('|')) {
      if (inTable && pastSeparator) {
        inTable = false;
        columnMap = null;
        pastSeparator = false;
      }
      continue;
    }

    const cells = parseRowCells(line);

    if (columnMap == null) {
      columnMap = mapColumns(cells, currentSection);
      if (columnMap == null) continue;
      inTable = true;
      continue;
    }

    if (!pastSeparator) {
      if (cells.every((c) => /^:?-+:?$/.test(c.trim()))) {
        pastSeparator = true;
      }
      continue;
    }

    if (currentSection === 'agents') {
      const binding = extractAgentRow(cells, columnMap);
      if (binding) agents.push(binding);
    } else if (currentSection === 'preferences') {
      const pref = extractPreferenceRow(cells, columnMap);
      if (pref) {
        const { taskType, vendor } = pref;
        // First non-null wins (deterministic, per codex F1 — no round-robin)
        if (!preferences[taskType]) preferences[taskType] = vendor;
      }
    }
  }

  return { agents, preferences };
}

function parseRowCells(line) {
  const trimmed = line.replace(/^\|/, '').replace(/\|\s*$/, '');
  return trimmed.split('|').map((c) => c.trim());
}

function mapColumns(cells, section) {
  const lower = cells.map((c) => c.toLowerCase());
  if (section === 'agents') {
    const map = {
      nicknameIdx: indexOfAny(lower, ['nickname']),
      uuidIdx: indexOfAny(lower, ['uuid']),
      vendorIdx: indexOfAny(lower, ['vendor', 'cli', 'vendor (cli)']),
      prefIdx: indexOfAny(lower, ['task-vendor-preference', 'task-type preference', 'default invocation', 'preference']),
    };
    if (map.nicknameIdx == null || map.vendorIdx == null) return null;
    return map;
  }
  if (section === 'preferences') {
    const map = {
      taskTypeIdx: indexOfAny(lower, ['task-type', 'task type']),
      vendorIdx: indexOfAny(lower, ['default vendor', 'vendor', 'preferred vendor']),
    };
    if (map.taskTypeIdx == null || map.vendorIdx == null) return null;
    return map;
  }
  return null;
}

function indexOfAny(arr, candidates) {
  for (const cand of candidates) {
    const idx = arr.indexOf(cand);
    if (idx !== -1) return idx;
  }
  return null;
}

function extractAgentRow(cells, map) {
  const nickname = stripBackticks(cells[map.nicknameIdx]);
  if (!nickname) return null;
  const uuid = map.uuidIdx != null ? stripBackticks(cells[map.uuidIdx]) : '';
  // First token = CLI name; normalize to adapter ID (strip -cli/-CLI suffix
  // so "codex-cli (gpt-5.5-xhigh)" → "codex" matching cli/src/vendors/codex.js)
  // Per codex Phase 1 audit F2 fix.
  let vendor = stripBackticks(cells[map.vendorIdx]).split(/\s+/)[0];
  vendor = vendor.replace(/-cli$/i, '').replace(/_cli$/i, '');
  const prefRaw = map.prefIdx != null ? cells[map.prefIdx] : '';
  const taskTypePref = prefRaw
    .split(',')
    .map((s) => stripBackticks(s.trim()))
    .filter(Boolean);
  return { nickname, uuid, vendor, taskTypePref };
}

function extractPreferenceRow(cells, map) {
  const taskType = stripBackticks(cells[map.taskTypeIdx]);
  if (!taskType) return null;
  const vendorCell = cells[map.vendorIdx];
  // Skip OOB markers: cells that START with parens are notes, not bindings.
  // e.g. "(Strategy invokes OOB /codex)" means this task-type is handled
  // out-of-band, NOT dispatched through queue.md to a vendor.
  if (/^\s*\(/.test(vendorCell)) return null;
  // Vendor cell may have annotations: "kimi-builder *(static default — codex F1)*"
  // Match first nickname-shaped token (lowercase-starting alphanumeric + hyphens)
  const match = vendorCell.match(/`?([a-z][\w-]+)`?/);
  if (!match) return null;
  return { taskType, vendor: stripBackticks(match[1]) };
}

function stripBackticks(s) {
  if (!s) return s;
  return s.replace(/^`/, '').replace(/`$/, '').trim();
}

/**
 * Resolve which vendor adapter should handle a task.
 *
 * Resolution order (deterministic — codex F1 — no round-robin / no state):
 *   1. If task.vendor is set (per-row override in queue.md) → use that
 *   2. Look up preferences[task.taskType] → use that vendor
 *   3. Fall back to first agent with this taskType in taskTypePref array
 *   4. Throw — caller decides whether to escalate or default
 *
 * @param {import('./types.js').TaskRow} task
 * @param {{ agents: import('./types.js').AgentBinding[], preferences: Record<string, string> }} agentsData
 * @returns {string}                  Vendor CLI name (e.g. "codex", "kimi", "agy")
 * @throws {Error} If no vendor can be resolved
 */
export function resolveVendor(task, agentsData) {
  // 1. Row override
  if (task.vendor) return task.vendor;

  // 2. Task-type → vendor lookup
  const pref = agentsData.preferences[task.taskType];
  if (pref) {
    // Pref may be a nickname (e.g. "kimi-builder"); resolve to vendor CLI name
    const binding = agentsData.agents.find((a) => a.nickname === pref);
    if (binding) return binding.vendor;
    // If pref isn't a known nickname, treat it as a direct vendor name
    return pref;
  }

  // 3. Search agents for one that prefers this task-type
  const match = agentsData.agents.find((a) => a.taskTypePref.includes(task.taskType));
  if (match) return match.vendor;

  // 4. No resolution — caller decides
  throw new Error(
    `No vendor binding for task-type '${task.taskType}'. ` +
    `Add a row to .hopper/AGENTS.md task-vendor-preference table, ` +
    `OR set Vendor column in queue.md for task '${task.id}'.`
  );
}
