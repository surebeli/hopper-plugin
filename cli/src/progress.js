// Background progress event helpers.
// Anchor: cli/src/progress.js

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { validateTaskId } from './validation.js';

export const PROGRESS_LOG_MAX_BYTES = 10 * 1024 * 1024;

export function progressLogPath(outputMdPath) {
  if (typeof outputMdPath !== 'string' || !outputMdPath.endsWith('-output.md')) {
    throw new Error(`Cannot derive progress log path from ${outputMdPath}`);
  }
  return outputMdPath.replace(/-output\.md$/, '-progress.log');
}

function assertTaskId(taskId) {
  try {
    validateTaskId(taskId);
  } catch (err) {
    throw new Error(`Invalid task id: ${err.message}`);
  }
}

function pathForTask(hopperDir, taskId) {
  assertTaskId(taskId);
  return join(hopperDir, 'handoffs', `${taskId}-progress.log`);
}

function readEventsFromPath(path) {
  if (!existsSync(path)) return [];

  const events = [];
  const lines = readFileSync(path, 'utf-8').split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed === 'object') events.push(parsed);
    } catch (_) {
      // Ignore corrupt or partially-written lines; progress is best-effort.
    }
  }
  return events;
}

export function rotateProgressLogIfNeeded(path, maxBytes = PROGRESS_LOG_MAX_BYTES) {
  if (!existsSync(path)) return false;
  const stat = statSync(path);
  if (stat.size <= maxBytes) return false;
  const rotated = `${path}.1`;
  if (existsSync(rotated)) unlinkSync(rotated);
  renameSync(path, rotated);
  return true;
}

export function readProgressEvents({ hopperDir, taskId, limit = Infinity }) {
  const path = pathForTask(hopperDir, taskId);
  const events = readEventsFromPath(path);
  return Number.isFinite(limit) ? events.slice(-limit) : events;
}

export function nextProgressSeq({ hopperDir, taskId }) {
  const path = pathForTask(hopperDir, taskId);
  let maxSeq = 0;
  for (const candidate of [`${path}.1`, path]) {
    for (const event of readEventsFromPath(candidate)) {
      if (Number.isInteger(event.seq) && event.seq > maxSeq) maxSeq = event.seq;
    }
  }
  return maxSeq + 1;
}

function requireString(value, name) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`progress event ${name} must be a non-empty string`);
  }
  return value;
}

const OPTIONAL_EVENT_FIELDS = [
  'status',
  'duration_ms',
  'exit_code',
  'signal',
  'adapter_status',
  'timed_out',
];

export function appendProgressEvent({ hopperDir, taskId, event }) {
  const path = pathForTask(hopperDir, taskId);
  mkdirSync(dirname(path), { recursive: true });

  const seq = event.seq ?? nextProgressSeq({ hopperDir, taskId });
  rotateProgressLogIfNeeded(path);

  const normalized = {
    seq,
    ts: event.ts ?? new Date().toISOString(),
    task_id: taskId,
    vendor: requireString(event.vendor, 'vendor'),
    phase: requireString(event.phase, 'phase'),
    kind: requireString(event.kind, 'kind'),
    message: requireString(event.message, 'message'),
    source: requireString(event.source, 'source'),
    terminal: Boolean(event.terminal),
  };
  for (const field of OPTIONAL_EVENT_FIELDS) {
    if (event[field] !== undefined) normalized[field] = event[field];
  }

  appendFileSync(path, `${JSON.stringify(normalized)}\n`, 'utf-8');
  return normalized;
}
