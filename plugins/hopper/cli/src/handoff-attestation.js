// Canonical startup snapshot and event-first terminal attestation finalizer.
// This module is intentionally file-backed and zero-spawn: callers supply the
// already-resolved selector/catalog snapshot and parsed vendor result.

import { readFrontmatter, writeFrontmatter } from './background.js';
import { appendProgressEvent, readProgressEvents } from './progress.js';
import { resolveAttestation } from './model-attestation.js';

const TERMINAL_STATUSES = new Set(['done', 'failed', 'cancelled', 'orphaned']);

function nullableString(value) {
  return typeof value === 'string' ? value : null;
}

function scalar(value, fallback = 'unknown') {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function catalogSnapshot(catalog = {}) {
  return {
    sourceKind: scalar(catalog.sourceKind ?? catalog.source_kind),
    sourceLabel: scalar(catalog.sourceLabel ?? catalog.source_label),
    observedAt: nullableString(catalog.observedAt ?? catalog.observed_at),
    freshness: scalar(catalog.freshness),
    binaryAvailability: scalar(catalog.binaryAvailability ?? catalog.binary_availability),
    binaryBasename: nullableString(catalog.binaryBasename ?? catalog.binary_basename),
    binding: catalog.binding ?? null,
  };
}

/**
 * Build the one startup snapshot that is carried from dispatch policy resolution
 * to the terminal writer. It performs no cache I/O, probing, spawning, or model
 * derivation; the passed catalog/metadata are an existing snapshot only.
 */
export function buildAttestationStartupSnapshot({
  requestedSelector = null,
  effectiveSelector = null,
  effectiveSelectorSource = 'vendor-default',
  catalog = {},
  selectorMetadata = {},
  binding = null,
} = {}) {
  const safeRequested = nullableString(requestedSelector);
  const safeEffective = nullableString(effectiveSelector);
  const safeSource = ['user-argv', 'policy', 'vendor-default'].includes(effectiveSelectorSource)
    ? effectiveSelectorSource
    : 'vendor-default';
  const safeCatalog = catalogSnapshot(catalog);
  const snapshot = {
    requestedSelector: safeRequested,
    effectiveSelector: safeEffective,
    effectiveSelectorSource: safeSource,
    catalog: safeCatalog,
    selectorMetadata: selectorMetadata && typeof selectorMetadata === 'object' ? selectorMetadata : {},
    binding: binding ?? safeCatalog.binding ?? null,
  };
  snapshot.frontmatter = {
    requested_selector: snapshot.requestedSelector,
    effective_selector: snapshot.effectiveSelector,
    effective_selector_source: snapshot.effectiveSelectorSource,
    selector_kind: snapshot.effectiveSelector === null ? 'auto' : 'unknown',
    catalog_source_kind: safeCatalog.sourceKind,
    catalog_source_label: safeCatalog.sourceLabel,
    catalog_observed_at: safeCatalog.observedAt,
    catalog_freshness: safeCatalog.freshness,
    binary_availability: safeCatalog.binaryAvailability,
    binary_basename: safeCatalog.binaryBasename,
  };
  return snapshot;
}

function startupSnapshotFromFrontmatter(fm) {
  return buildAttestationStartupSnapshot({
    requestedSelector: fm.requested_selector,
    effectiveSelector: fm.effective_selector,
    effectiveSelectorSource: fm.effective_selector_source,
    catalog: {
      source_kind: fm.catalog_source_kind,
      source_label: fm.catalog_source_label,
      observed_at: fm.catalog_observed_at,
      freshness: fm.catalog_freshness,
      binary_availability: fm.binary_availability,
      binary_basename: fm.binary_basename,
    },
  });
}

function fallbackBinding(snapshot, fm, completion) {
  return snapshot.binding ?? snapshot.catalog?.binding ?? {
    vendor: scalar(fm.adapter ?? completion.vendor),
    adapterId: scalar(fm.adapter ?? completion.vendor),
    adapterVersion: '',
    catalogId: '',
    catalogVersion: '',
  };
}

function terminalStatus(value) {
  return TERMINAL_STATUSES.has(value) ? value : 'failed';
}

function parsedModelAttestation(parsed) {
  const attestation = parsed?.modelAttestation;
  if (!attestation || typeof attestation !== 'object' || Array.isArray(attestation)) {
    return { observedModels: [], source: null, observedAt: null };
  }
  return {
    observedModels: Object.hasOwn(attestation, 'observedModels') ? attestation.observedModels : [],
    source: nullableString(attestation.source),
    observedAt: nullableString(attestation.observedAt),
  };
}

function existingTerminalEvents(readEvents, hopperDir, taskId) {
  return readEvents({ hopperDir, taskId })
    .filter((event) => event && event.terminal === true && event.kind === 'terminal' && event.task_id === taskId);
}

function completionValue(completion, camel, snake, fallback = undefined) {
  return completion[camel] ?? completion[snake] ?? fallback;
}

// Kept internal so all writers construct byte/field-equivalent terminal records.
function buildCanonicalTerminalRecord({ fm, startupSnapshot, parsed, completion }) {
  const snapshot = startupSnapshot ?? startupSnapshotFromFrontmatter(fm);
  const evidence = parsedModelAttestation(parsed);
  const resolved = resolveAttestation({
    effectiveSelector: snapshot.effectiveSelector,
    effectiveSelectorSource: snapshot.effectiveSelectorSource,
    binding: fallbackBinding(snapshot, fm, completion),
    selectorMetadata: snapshot.selectorMetadata,
    observedModels: evidence.observedModels,
    catalogSourceKind: snapshot.catalog.sourceKind,
    runtimeDiagnosticCode: completion.runtimeDiagnosticCode ?? completion.runtime_diagnostic_code ?? 'none',
  });
  const status = terminalStatus(completion.status);
  const phase = scalar(completion.phase, status);
  const message = scalar(completion.message, status === 'done' ? 'Task completed successfully.' : 'Task failed.');
  const event = {
    vendor: scalar(completion.vendor ?? fm.adapter),
    phase,
    kind: 'terminal',
    message,
    source: scalar(completion.source, 'runner'),
    terminal: true,
    status,
    duration_ms: completionValue(completion, 'durationMs', 'duration_ms'),
    exit_code: completionValue(completion, 'exitCode', 'exit_code'),
    signal: completion.signal ?? null,
    adapter_status: completionValue(completion, 'adapterStatus', 'adapter_status'),
    timed_out: completionValue(completion, 'timedOut', 'timed_out'),
    timeout_reason: completionValue(completion, 'timeoutReason', 'timeout_reason'),
    process_cleanup: completionValue(completion, 'processCleanup', 'process_cleanup'),
    requested_selector: snapshot.requestedSelector,
    effective_selector: snapshot.effectiveSelector,
    effective_selector_source: snapshot.effectiveSelectorSource,
    selector_kind: resolved.selectorKind,
    observed_models: resolved.observedModels,
    model_attestation_source: evidence.source,
    model_attestation_observed_at: evidence.observedAt,
    resolution_status: resolved.resolutionStatus,
    resolution_detail: resolved.resolutionDetail,
  };
  const attestationFrontmatter = {
    ...snapshot.frontmatter,
    selector_kind: resolved.selectorKind,
    observed_models_json: JSON.stringify(resolved.observedModels),
    model_attestation_source: evidence.source,
    model_attestation_observed_at: evidence.observedAt,
    resolution_status: resolved.resolutionStatus,
    resolution_detail: resolved.resolutionDetail,
    diagnostic_code: resolved.diagnosticCode,
  };
  return { snapshot, resolved, status, phase, message, event, attestationFrontmatter };
}

/**
 * Emit exactly one terminal JSONL event before atomically persisting canonical
 * frontmatter. A pre-existing terminal event is a deterministic refusal, never
 * an opportunity to append a second event or silently repair it.
 */
export function finalizeTerminalAttestation({
  hopperDir,
  taskId,
  outputMdPath,
  startupSnapshot = null,
  parsed = {},
  completion = {},
  io = {},
}) {
  const readEvents = io.readProgressEvents ?? readProgressEvents;
  const appendEvent = io.appendProgressEvent ?? appendProgressEvent;
  const readFm = io.readFrontmatter ?? readFrontmatter;
  const writeFm = io.writeFrontmatter ?? writeFrontmatter;
  const terminals = existingTerminalEvents(readEvents, hopperDir, taskId);
  if (terminals.length > 0) {
    return { refused: true, reason: 'terminal-event-exists', terminalCount: terminals.length };
  }

  const fm = readFm(outputMdPath);
  if (fm.terminal_event_emitted === true || TERMINAL_STATUSES.has(fm.status)) {
    return { refused: true, reason: 'terminal-frontmatter-exists', terminalCount: 0 };
  }

  const record = buildCanonicalTerminalRecord({ fm, startupSnapshot, parsed, completion });
  // Event first: an append error must leave frontmatter visibly in-progress.
  const event = appendEvent({ hopperDir, taskId, event: record.event });
  // The only writer state transition after successful append. `finalizing` and
  // `partial` are reader-derived crash-window labels and are never persisted.
  writeFm(outputMdPath, {
    ...fm,
    ...record.attestationFrontmatter,
    status: record.status,
    phase: record.phase,
    end_time: completion.endTime ?? completion.end_time ?? new Date().toISOString(),
    exit_code: completionValue(completion, 'exitCode', 'exit_code', fm.exit_code),
    signal: completion.signal ?? null,
    timed_out: completionValue(completion, 'timedOut', 'timed_out', fm.timed_out),
    timeout_reason: completionValue(completion, 'timeoutReason', 'timeout_reason', fm.timeout_reason),
    process_cleanup: completionValue(completion, 'processCleanup', 'process_cleanup', fm.process_cleanup),
    process_cleanup_method: completionValue(completion, 'processCleanupMethod', 'process_cleanup_method', fm.process_cleanup_method),
    duration_ms: completionValue(completion, 'durationMs', 'duration_ms', fm.duration_ms),
    adapter_status: completionValue(completion, 'adapterStatus', 'adapter_status', fm.adapter_status),
    last_progress_at: event.ts,
    last_progress: event.message,
    progress_seq: event.seq,
    terminal_event_emitted: true,
    _body: (fm._body || '') + (completion.bodyAppend || ''),
  });
  return { refused: false, event, record };
}
