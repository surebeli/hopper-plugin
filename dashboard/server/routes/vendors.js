import { Router } from 'express';
import {
  isStale,
  readCacheWithDiagnostics,
  staleness,
} from '../../../cli/src/cache.js';
import {
  capabilitiesForAdapter,
  listAdapters,
} from '../../../cli/src/vendors/index.js';

export function createVendorsRouter({
  capabilitiesForAdapterImpl = capabilitiesForAdapter,
  listAdaptersImpl = listAdapters,
  readCacheWithDiagnosticsImpl = readCacheWithDiagnostics,
} = {}) {
  const router = Router();

  router.get('/', (_req, res, next) => {
    try {
      res.json(readVendorInventory({
        capabilitiesForAdapterImpl,
        listAdaptersImpl,
        readCacheWithDiagnosticsImpl,
      }));
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export function readVendorInventory({
  capabilitiesForAdapterImpl = capabilitiesForAdapter,
  listAdaptersImpl = listAdapters,
  readCacheWithDiagnosticsImpl = readCacheWithDiagnostics,
} = {}) {
  const { cache, error } = readCacheWithDiagnosticsImpl();
  const vendors = listAdaptersImpl().map((name) => {
    const cached = cache?.vendors?.[name] || null;
    const capabilities = capabilitiesForAdapterImpl(name);
    const stale = isStale(cached?.probed_at);
    return {
      name,
      installStatus: cached?.binary_path ? 'installed' : cached ? 'cached' : 'unknown',
      binaryPath: cached?.binary_path || null,
      cachedAt: cached?.probed_at || null,
      cachedModels: cached?.models || [],
      cacheError: error,
      introspection: cached?.introspection_supported || null,
      modelsSource: cached?.models_source || null,
      notes: cached?.notes || [],
      reasoningLevels: cached?.reasoning_levels || capabilities?.reasoningArg?.knownGood || [],
      stale,
      staleness: staleness(cached?.probed_at),
    };
  });
  return { vendors, cacheError: error, generatedAt: new Date().toISOString() };
}

export default createVendorsRouter();
