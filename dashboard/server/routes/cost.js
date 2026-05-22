import { Router } from 'express';
import { join } from 'node:path';
import { parseCostLog } from '../lib/cost.js';
import { findHopperDir } from '../lib/hopper-dir.js';

export function createCostRouter({ hopperDir } = {}) {
  const router = Router();

  router.get('/', async (_req, res, next) => {
    try {
      const root = hopperDir || findHopperDir();
      if (!root) {
        res.status(404).json({ error: 'no .hopper directory found' });
        return;
      }
      res.json(await parseCostLog(join(root, 'COST-LOG.md')));
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export default createCostRouter();
