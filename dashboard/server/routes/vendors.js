import { Router } from 'express';
import {
  readCacheWithOutcome,
} from '../../../cli/src/cache.js';
import {
  projectInventoryEntry,
} from '../../../cli/src/inventory-contract.js';
import { listAdapters } from '../../../cli/src/vendors/index.js';

const SAFE_VENDOR_NAME = /^[a-z][a-z0-9-]{0,31}$/;
const SAFE_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const UNSAFE_PUBLIC_TEXT = /(?:https?:\/\/|[a-z]:[\\/]|\/(?:home|users|etc|var)[\\/]|stderr:|authorization|api[_-]?key|access[_-]?token|private-account)/i;

function safeVendorName(value) {
  return typeof value === 'string' && SAFE_VENDOR_NAME.test(value) ? value : 'unknown';
}

function safeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && !UNSAFE_PUBLIC_TEXT.test(item));
}

function safeTimestamp(value) {
  if (typeof value !== 'string' || !SAFE_TIMESTAMP.test(value) || Number.isNaN(Date.parse(value))) return null;
  return new Date(value).toISOString() === value ? value : null;
}

export function createVendorsRouter({
  listAdaptersImpl = listAdapters,
  readCacheWithOutcomeImpl = readCacheWithOutcome,
} = {}) {
  const router = Router();

  router.get('/', (_req, res, next) => {
    try {
      res.json(readVendorInventory({
        listAdaptersImpl,
        readCacheWithOutcomeImpl,
      }));
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export function readVendorInventory({
  listAdaptersImpl = listAdapters,
  readCacheWithOutcomeImpl = readCacheWithOutcome,
} = {}) {
  const cacheResult = readCacheWithOutcomeImpl() || {};
  const outcome = typeof cacheResult.outcome === 'string' ? cacheResult.outcome : 'malformed';
  const cache = cacheResult.cache && typeof cacheResult.cache === 'object' ? cacheResult.cache : null;
  const adapterList = listAdaptersImpl();
  const adapters = Array.isArray(adapterList) ? adapterList : [];
  const vendors = adapters.map((adapterName) => {
    const name = safeVendorName(adapterName);
    const cached = typeof adapterName === 'string' ? cache?.vendors?.[adapterName] : null;
    const projected = projectInventoryEntry(name, cached, outcome);
    return {
      name,
      cachedAt: safeTimestamp(cached?.probed_at),
      cachedModels: safeStringArray(cached?.models),
      reasoningLevels: safeStringArray(cached?.reasoning_levels),
      ...projected,
      // Compatibility keys are permanent safe shims during the v2 rollout.
      notes: [],
      cacheError: null,
      modelsSource: null,
      binaryPath: null,
    };
  });
  return {
    inventoryContractVersion: 2,
    generatedAt: new Date().toISOString(),
    vendors,
  };
}

export default createVendorsRouter();
