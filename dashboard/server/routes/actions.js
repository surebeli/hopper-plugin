import { Router } from 'express';
import { spawnProbe } from '../lib/spawn-cli.js';
import { ALLOWED_VENDORS } from '../lib/spawn-cli.js';
import { projectProbeDiagnostic } from '../../../cli/src/inventory-contract.js';

export const PROBE_TIMEOUT_MS = 60_000;

export function createActionsRouter({ spawnProbeImpl = spawnProbe, probeTimeoutMs = PROBE_TIMEOUT_MS } = {}) {
  const router = Router();
  const active = new Set();

  router.post('/probe', async (req, res, next) => {
    const vendor = req.body?.vendor;
    let started = false;
    try {
      if (!ALLOWED_VENDORS.has(vendor)) {
        res.status(400).json(probeResponse(vendor, 'malformed-vendor'));
        return;
      }
      if (active.has(vendor)) {
        res.status(409).json(probeResponse(vendor, 'failed'));
        return;
      }
      active.add(vendor);
      started = true;
      const result = await runProbe(vendor, spawnProbeImpl, probeTimeoutMs);
      res.status(result.httpStatus).json(result.payload);
    } catch (err) {
      const malformed = err?.code === 'EINVAL';
      res.status(malformed ? 400 : 500).json(probeResponse(vendor, malformed ? 'malformed-vendor' : 'failed'));
    } finally {
      if (started) active.delete(vendor);
    }
  });

  return router;
}

function probeResponse(vendor, outcome) {
  const safeVendor = ALLOWED_VENDORS.has(vendor) ? vendor : 'unknown';
  return {
    vendor: safeVendor,
    status: outcome === 'success' ? 'done' : 'failed',
    ...projectProbeDiagnostic(outcome),
  };
}

function runProbe(vendor, spawnProbeImpl, probeTimeoutMs) {
  return new Promise((resolveRun, rejectRun) => {
    let child;
    try {
      child = spawnProbeImpl(vendor);
    } catch (err) {
      rejectRun(err);
      return;
    }
    let settled = false;
    const timeout = setTimeout(() => {
      settled = true;
      child.kill?.();
      resolveRun({ httpStatus: 504, payload: probeResponse(vendor, 'failed') });
    }, probeTimeoutMs);
    const rejectOnce = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolveRun({ httpStatus: 500, payload: probeResponse(vendor, 'failed') });
    };
    // Drain both streams to prevent child-process backpressure. Their raw bytes
    // are deliberately not retained or returned by this public API.
    child.stdout?.on('data', () => {});
    child.stderr?.on('data', () => {});
    child.once('error', rejectOnce);
    child.once('exit', (exitCode, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (exitCode === 0) {
        resolveRun({ httpStatus: 200, payload: probeResponse(vendor, 'success') });
        return;
      }
      resolveRun({ httpStatus: 500, payload: probeResponse(vendor, 'failed') });
    });
  });
}

export default createActionsRouter();
