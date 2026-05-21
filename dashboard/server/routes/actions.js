import { Router } from 'express';
import { spawnProbe } from '../lib/spawn-cli.js';

export function createActionsRouter({ spawnProbeImpl = spawnProbe } = {}) {
  const router = Router();
  const active = new Set();

  router.post('/probe', async (req, res, next) => {
    const vendor = req.body?.vendor;
    let started = false;
    try {
      if (active.has(vendor)) {
        res.status(409).json({ error: `probe already running for ${vendor}` });
        return;
      }
      active.add(vendor);
      started = true;
      const result = await runProbe(vendor, spawnProbeImpl);
      res.json(result);
    } catch (err) {
      if (err.code === 'EINVAL') {
        res.status(400).json({ error: err.message });
        return;
      }
      next(err);
    } finally {
      if (started) active.delete(vendor);
    }
  });

  return router;
}

function runProbe(vendor, spawnProbeImpl) {
  return new Promise((resolveRun, rejectRun) => {
    let child;
    try {
      child = spawnProbeImpl(vendor);
    } catch (err) {
      rejectRun(err);
      return;
    }
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => { stdout = appendTail(stdout, chunk); });
    child.stderr?.on('data', (chunk) => { stderr = appendTail(stderr, chunk); });
    child.once('error', rejectRun);
    child.once('exit', (exitCode, signal) => {
      if (exitCode === 0) {
        resolveRun({ vendor, status: 'done', exitCode, signal, stdout, stderr });
        return;
      }
      const err = new Error(`probe failed for ${vendor}: exit ${exitCode}`);
      err.status = 500;
      err.exitCode = exitCode;
      err.stderr = stderr;
      rejectRun(err);
    });
  });
}

function appendTail(current, chunk, max = 65536) {
  const next = current + chunk.toString('utf8');
  return next.length > max ? next.slice(next.length - max) : next;
}

export default createActionsRouter();
