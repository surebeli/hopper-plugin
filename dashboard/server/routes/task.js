import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Router } from 'express';
import { readCanonicalAttestation } from '../../../cli/src/handoff-attestation.js';
import { findHopperDir } from '../lib/hopper-dir.js';

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,63}(?:\/[A-Za-z0-9][A-Za-z0-9._:+-]{0,63})?$/;
const SECRET_LIKE_IDENTIFIER = /^(?:sk|pk|rk|ghp|github_pat|xox[aboprs]|api[_-]?key|access[_-]?token|secret)[_-]/i;
const PUBLIC_PHASES = new Set(['starting', 'running', 'done', 'failed', 'cancelled', 'orphaned', 'timeout', 'unknown']);
const PUBLIC_EVENT_KINDS = new Set(['finding', 'progress', 'terminal', 'process_alive', 'status', 'unknown']);
const PUBLIC_EVENT_STATUSES = new Set(['done', 'failed', 'cancelled', 'orphaned', 'timeout', 'in-progress', 'unknown']);

export function createTaskRouter({ hopperDir } = {}) {
  const router = Router();

  router.get('/:id/progress', (req, res, next) => {
    try {
      const root = hopperDir || findHopperDir();
      if (!root) {
        res.status(404).json({ error: 'no .hopper directory found' });
        return;
      }
      if (!isSafeTaskId(req.params.id)) {
        res.status(400).json({ error: 'invalid task id' });
        return;
      }
      const path = join(root, 'handoffs', `${req.params.id}-progress.log`);
      if (!existsSync(path)) {
        res.status(404).json({ error: 'task progress not found' });
        return;
      }
      const requested = Number(req.query.limit);
      const limit = Math.min(Number.isFinite(requested) && requested > 0 ? requested : 20, 5);
      const canonical = readCanonicalAttestation({ hopperDir: root, taskId: req.params.id });
      const events = projectPublicProgressEvents(canonical.public.recentEvents).slice(-limit);
      res.json({ id: req.params.id, events });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', (req, res, next) => {
    try {
      const root = hopperDir || findHopperDir();
      if (!root) {
        res.status(404).json({ error: 'no .hopper directory found' });
        return;
      }
      const detail = readTaskDetail(root, req.params.id);
      res.json(detail);
    } catch (err) {
      if (err.code === 'EINVAL') {
        res.status(400).json({ error: err.message });
        return;
      }
      if (err.code === 'ENOENT') {
        res.status(404).json({ error: 'task output not found' });
        return;
      }
      next(err);
    }
  });

  return router;
}

export function readTaskDetail(hopperDir, id) {
  if (!isSafeTaskId(id)) {
    const err = new Error('invalid task id');
    err.code = 'EINVAL';
    throw err;
  }
  const path = join(hopperDir, 'handoffs', `${id}-output.md`);
  if (!existsSync(path)) {
    const err = new Error('task output not found');
    err.code = 'ENOENT';
    throw err;
  }
  const canonical = readCanonicalAttestation({ hopperDir, taskId: id, outputMdPath: path });
  const publicRecord = canonical.public;
  return {
    id: publicRecord.taskId,
    status: publicRecord.displayStatus,
    terminal: publicRecord.terminal,
    selector: {
      requested: publicIdentifier(publicRecord.selector?.requested),
      effective: publicIdentifier(publicRecord.selector?.effective),
      kind: publicRecord.selector.kind,
      source: publicRecord.selector.source,
    },
    observedModels: publicIdentifiers(publicRecord.observedModels),
    resolution: publicRecord.resolution,
    inventory: publicRecord.safeCatalog,
    events: projectPublicProgressEvents(publicRecord.recentEvents),
  };
}

export function publicIdentifier(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 128 || value !== value.trim()) return null;
  if (!SAFE_IDENTIFIER.test(value) || /^[A-Za-z]:[\\/]/.test(value)) return null;
  if (value.split('/').some((part) => SECRET_LIKE_IDENTIFIER.test(part))) return null;
  return value;
}

export function publicIdentifiers(value) {
  if (!Array.isArray(value)) return [];
  const result = [];
  for (const item of value) {
    const safe = publicIdentifier(item);
    if (safe === null || result.includes(safe)) continue;
    result.push(safe);
  }
  return result;
}

export function projectPublicProgressEvents(value) {
  if (!Array.isArray(value)) return [];
  return value.map((event) => ({
    seq: Number.isInteger(event?.seq) ? event.seq : null,
    phase: PUBLIC_PHASES.has(event?.phase) ? event.phase : 'unknown',
    kind: PUBLIC_EVENT_KINDS.has(event?.kind) ? event.kind : 'unknown',
    terminal: event?.terminal === true,
    status: PUBLIC_EVENT_STATUSES.has(event?.status) ? event.status : 'unknown',
  }));
}

function isSafeTaskId(id) {
  return typeof id === 'string'
    && /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/.test(id)
    && !id.includes('..');
}

export default createTaskRouter();
