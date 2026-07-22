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
  const events = [...readEventsFromPath(`${path}.1`), ...readEventsFromPath(path)];
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
  'adapter_diagnostic_code',
  'timed_out',
  'last_stream_event',
  'last_reason',
  'last_update',
  'timeout_reason',
  'process_cleanup',
  'process_cleanup_attempted',
  'process_cleanup_method',
  'requested_selector',
  'effective_selector',
  'effective_selector_source',
  'selector_kind',
  'observed_models',
  'model_attestation_source',
  'model_attestation_observed_at',
  'resolution_status',
  'resolution_detail',
];

/**
 * Extract the latest vendor lifecycle marker from a log chunk without retaining
 * prompts, tool arguments, or model output. The normalized protocol tokens are
 * safe to mirror into file-backed progress heartbeats.
 *
 * @param {string} chunk
 * @returns {{ event: string, reason: string|null }|null}
 */
export function findLatestVendorProgressEvent(chunk) {
  if (!chunk) return null;
  let latest = null;
  for (const line of String(chunk).split(/\r?\n/)) {
    let parsed;
    try { parsed = JSON.parse(line); } catch (_) { continue; }
    const event = findLifecycleEvent(parsed);
    if (event) latest = event;
  }
  return latest;
}

function findLifecycleEvent(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 4) return null;
  const event = protocolToken(node.type ?? node.kind);
  if (new Set(['step_start', 'step_finish', 'session_start', 'session_started', 'result']).has(event)) {
    return { event, reason: protocolToken(node.part?.reason ?? node.reason) || null };
  }
  for (const key of ['event', 'data', 'payload', 'result']) {
    const nested = findLifecycleEvent(node[key], depth + 1);
    if (nested) return nested;
  }
  return null;
}

function protocolToken(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase().replace(/-/g, '_').replace(/[^a-z0-9_.]/g, '').slice(0, 80);
}

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
