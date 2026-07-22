import { Router } from 'express';
import { platform } from 'node:os';
import { spawnProbe } from '../lib/spawn-cli.js';
import { ALLOWED_VENDORS } from '../lib/spawn-cli.js';
import { projectProbeDiagnostic } from '../../../cli/src/inventory-contract.js';
import { killProcessTree } from '../../../cli/src/subprocess.js';

export const PROBE_TIMEOUT_MS = 60_000;
export const PROBE_CLEANUP_TIMEOUT_MS = 5_000;

export function createActionsRouter({
  spawnProbeImpl = spawnProbe,
  probeTimeoutMs = PROBE_TIMEOUT_MS,
  probeCleanupTimeoutMs = PROBE_CLEANUP_TIMEOUT_MS,
  killProcessTreeImpl = killProcessTree,
  isWindows = platform() === 'win32',
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout,
} = {}) {
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
      const result = await runProbe(vendor, spawnProbeImpl, {
        isWindows,
        killProcessTreeImpl,
        probeCleanupTimeoutMs,
        probeTimeoutMs,
        setTimeoutImpl,
        clearTimeoutImpl,
      });
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

function runProbe(vendor, spawnProbeImpl, {
  isWindows,
  killProcessTreeImpl,
  probeCleanupTimeoutMs,
  probeTimeoutMs,
  setTimeoutImpl,
  clearTimeoutImpl,
}) {
  return new Promise((resolveRun, rejectRun) => {
    let child;
    try {
      child = spawnProbeImpl(vendor);
    } catch (err) {
      rejectRun(err);
      return;
    }
    let settled = false;
    let timedOut = false;
    let exited = false;
    let recordedExitCode = null;
    let cleanupTimeout = null;
    let timeout = null;
    const drain = () => {};
    const finish = (httpStatus, outcome) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeoutImpl(timeout);
      if (cleanupTimeout) clearTimeoutImpl(cleanupTimeout);
      child.off('error', onError);
      child.off('exit', onExit);
      child.off('close', onClose);
      child.stdout?.off('data', drain);
      child.stderr?.off('data', drain);
      resolveRun({ httpStatus, payload: probeResponse(vendor, outcome) });
    };
    const onError = () => {
      if (!timedOut) finish(500, 'failed');
    };
    const onExit = (exitCode) => {
      if (timedOut) return;
      exited = true;
      recordedExitCode = exitCode;
    };
    const onClose = (exitCode) => {
      if (timedOut) {
        finish(504, 'failed');
        return;
      }
      if (!settled) {
        const completedCode = exited ? recordedExitCode : exitCode;
        finish(completedCode === 0 ? 200 : 500, completedCode === 0 ? 'success' : 'failed');
      }
    };
    // Drain both streams to prevent child-process backpressure. Their raw bytes
    // are deliberately not retained or returned by this public API.
    child.stdout?.on('data', drain);
    child.stderr?.on('data', drain);
    child.once('error', onError);
    child.once('exit', onExit);
    child.once('close', onClose);
    timeout = setTimeoutImpl(() => {
      if (settled) return;
      timedOut = true;
      clearTimeoutImpl(timeout);
      timeout = null;
      const cleanupWait = Number.isFinite(probeCleanupTimeoutMs) && probeCleanupTimeoutMs >= 0
        ? probeCleanupTimeoutMs
        : PROBE_CLEANUP_TIMEOUT_MS;
      cleanupTimeout = setTimeoutImpl(() => finish(504, 'failed'), cleanupWait);
      try {
        killProcessTreeImpl(child.pid, isWindows);
      } catch (_) {
        // The bounded close wait below still preserves the fixed public diagnostic.
      }
    }, probeTimeoutMs);
  });
}

export default createActionsRouter();
