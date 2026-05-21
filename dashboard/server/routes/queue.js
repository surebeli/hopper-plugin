import { Router } from 'express';
import { join } from 'node:path';
import { parseQueue } from '../../../cli/src/queue.js';
import { findHopperDir } from '../lib/hopper-dir.js';

export function createQueueRouter({ hopperDir } = {}) {
  const router = Router();

  router.get('/queue', async (_req, res, next) => {
    try {
      const root = hopperDir || findHopperDir();
      if (!root) {
        res.status(404).json({ error: 'no .hopper directory found' });
        return;
      }
      const rows = await parseQueue(join(root, 'queue.md'));
      res.json(rows);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export default createQueueRouter();
