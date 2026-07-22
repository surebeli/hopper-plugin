import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Router } from 'express';
import { readCanonicalAttestation } from '../../../cli/src/handoff-attestation.js';
import { findHopperDir } from '../lib/hopper-dir.js';

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
      const events = canonical.public.recentEvents.slice(-limit);
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
    selector: publicRecord.selector,
    observedModels: publicRecord.observedModels,
    resolution: publicRecord.resolution,
    inventory: publicRecord.safeCatalog,
    events: publicRecord.recentEvents,
  };
}

function isSafeTaskId(id) {
  return typeof id === 'string'
    && /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/.test(id)
    && !id.includes('..');
}

export default createTaskRouter();
