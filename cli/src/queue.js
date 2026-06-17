// Queue parser (T-PLUGIN-02)
// Anchor: cli/src/queue.js
//
// Parses .hopper/queue.md v2 schema (Task-type column primary; Role column
// optional for backwards-compat with myWriteAssistant lineage projects).
//
// Per spec §3 #5 + USAGE-GUIDE §3.4: Task-type is the canonical routing key.

import { readFile } from 'node:fs/promises';

/**
 * Parse a .hopper/queue.md file.
 *
 * @param {string} filePath
 * @returns {Promise<import('./types.js').TaskRow[]>}
 */
export async function parseQueue(filePath) {
  const content = await readFile(filePath, 'utf-8');
  return parseQueueContent(content);
}

/**
 * Parse queue content directly (separated for testing without filesystem).
 *
 * @param {string} content
 * @returns {import('./types.js').TaskRow[]}
 */
export function parseQueueContent(content) {
  const lines = content.split(/\r?\n/);
  const rows = [];

  // Find the table — locate header row containing "Task-type" column
  let inTable = false;
  let columnMap = null;
  let pastSeparator = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line.startsWith('|')) {
      // Exiting table or pre-table content
      if (inTable && pastSeparator) {
        inTable = false;
        columnMap = null;
        pastSeparator = false;
      }
      continue;
    }

    // Inside a markdown table row
    const cells = parseRowCells(line);

    if (columnMap == null) {
      // First | row = column headers
      columnMap = mapColumns(cells);
      if (columnMap.taskTypeIdx == null && columnMap.roleIdx == null) {
        // Not a queue table; reset
        columnMap = null;
        continue;
      }
      inTable = true;
      continue;
    }

    if (!pastSeparator) {
      // Should be the |---|---|... separator row
      if (cells.every((c) => /^:?-+:?$/.test(c.trim()))) {
        pastSeparator = true;
      }
      continue;
    }

    // Data row
    const row = extractRow(cells, columnMap);
    if (row) rows.push(row);
  }

  return rows;
}

function parseRowCells(line) {
  // Remove leading and trailing pipes, split by pipe
  // Markdown table syntax: | a | b | c |
  const trimmed = line.replace(/^\|/, '').replace(/\|\s*$/, '');
  return trimmed.split('|').map((c) => c.trim());
}

function mapColumns(headerCells) {
  const lower = headerCells.map((c) => c.toLowerCase());
  return {
    idIdx: indexOfAny(lower, ['id', 'task id', 'task-id']),
    taskTypeIdx: indexOfAny(lower, ['task-type', 'task_type', 'tasktype', 'type']),
    roleIdx: indexOfAny(lower, ['role']),
    statusIdx: indexOfAny(lower, ['status']),
    dependsIdx: indexOfAny(lower, ['depends', 'dependencies', 'deps']),
    priorityIdx: indexOfAny(lower, ['priority']),
    briefIdx: indexOfAny(lower, ['brief', 'summary', 'description']),
    vendorIdx: indexOfAny(lower, ['vendor']),
    governIdx: indexOfAny(lower, ['govern', 'governance']),
  };
}

function indexOfAny(arr, candidates) {
  for (const cand of candidates) {
    const idx = arr.indexOf(cand);
    if (idx !== -1) return idx;
  }
  return null;
}

function extractRow(cells, map) {
  const id = map.idIdx != null ? stripBackticks(cells[map.idIdx]) : null;
  if (!id) return null;

  const taskType = map.taskTypeIdx != null ? stripBackticks(cells[map.taskTypeIdx]) : null;
  const role = map.roleIdx != null ? stripBackticks(cells[map.roleIdx]) : null;

  // Per USAGE-GUIDE §3.4: Task-type is the primary routing key.
  // Role is decorative (legacy). If both present, Task-type wins.
  const effectiveType = taskType || role || 'unknown';

  // Per codex final strict audit P1 (Category A): previously unknown statuses
  // silently mapped to 'pending', which re-eligibilizes failed tasks. We now
  // preserve unknown status verbatim and surface it as 'unknown' for the
  // caller; findEligibleTask only treats 'pending' as eligible. A row with
  // illegal status will fail eligibility check rather than silently re-run.
  const rawStatus = map.statusIdx != null ? cells[map.statusIdx].toLowerCase() : 'pending';
  const validStatuses = ['pending', 'in-progress', 'done', 'failed', 'removed'];
  const finalStatus = validStatuses.includes(rawStatus) ? rawStatus : `unknown:${rawStatus}`;

  const dependsRaw = map.dependsIdx != null ? cells[map.dependsIdx] : '';
  const depends = dependsRaw
    .split(',')
    .map((d) => stripBackticks(d.trim()))
    .filter(Boolean);

  const priorityRaw = map.priorityIdx != null ? cells[map.priorityIdx].toLowerCase() : 'normal';
  const validPriorities = ['high', 'normal', 'low'];
  const priority = validPriorities.includes(priorityRaw) ? priorityRaw : 'normal';

  const brief = map.briefIdx != null ? cells[map.briefIdx] : '';
  const vendor = map.vendorIdx != null && cells[map.vendorIdx] ? stripBackticks(cells[map.vendorIdx]) : null;
  const govern = map.governIdx != null && cells[map.governIdx] ? stripBackticks(cells[map.governIdx]) : null;

  return { id, taskType: effectiveType, status: finalStatus, depends, priority, brief, vendor, govern };
}

function stripBackticks(s) {
  if (!s) return s;
  return s.replace(/^`/, '').replace(/`$/, '').trim();
}

/**
 * Find a task by ID; validate it's eligible to dispatch (pending + deps done).
 *
 * @param {import('./types.js').TaskRow[]} tasks
 * @param {string} taskId
 * @returns {{ task: import('./types.js').TaskRow | null, reason: string|null }}
 */
export function findEligibleTask(tasks, taskId) {
  const task = tasks.find((t) => t.id === taskId);
  if (!task) {
    return { task: null, reason: `task ${taskId} not found in queue.md` };
  }
  if (task.status !== 'pending') {
    return { task: null, reason: `task ${taskId} status is '${task.status}', expected 'pending'` };
  }
  for (const depId of task.depends) {
    const dep = tasks.find((t) => t.id === depId);
    if (!dep) {
      return { task: null, reason: `dependency ${depId} not found in queue.md` };
    }
    if (dep.status !== 'done') {
      return { task: null, reason: `dependency ${depId} status is '${dep.status}', expected 'done'` };
    }
  }
  return { task, reason: null };
}

/**
 * Summarize queue by status (for --status command).
 *
 * @param {import('./types.js').TaskRow[]} tasks
 */
export function summarizeQueue(tasks) {
  const counts = { pending: 0, 'in-progress': 0, done: 0, failed: 0, removed: 0 };
  for (const t of tasks) {
    if (counts[t.status] != null) counts[t.status]++;
  }
  return { total: tasks.length, ...counts };
}
