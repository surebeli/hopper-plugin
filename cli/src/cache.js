// Per-machine vendor capability cache (Phase 6b)
// Anchor: cli/src/cache.js
//
// Location: ~/.hopper/cache/vendor-capabilities.json (per-machine, not
// per-project — model availability is machine + account specific).
//
// Per spec §3 #4: cache READ is zero-subprocess (--capabilities + --models).
// Cache WRITE happens only via --probe (opt-in, diagnostic, single-spawn-
// per-vendor). Dispatch path NEVER auto-writes the cache.
//
// Schema v1:
//   {
//     "version": 1,
//     "host": "<hostname>",
//     "probed_at_global": ISO8601,
//     "vendors": {
//       "<name>": {
//         "introspection_supported": "full" | "partial" | "config-only" | "none",
//         "probed_at": ISO8601,
//         "binary_path": string | null,
//         "version": string | null,
//         "models": string[],         // alias/identifier list
//         "models_source": string,    // what command/file produced this
//         "reasoning_levels": string[],
//         "notes": string[],
//         "duration_ms": number
//       }
//     }
//   }

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, openSync, closeSync, unlinkSync, statSync } from 'node:fs';
import { homedir, hostname } from 'node:os';
import { join, dirname } from 'node:path';

const CACHE_VERSION = 1;
const STALE_DAYS_DEFAULT = 14;
const LOCK_STALE_MS = 30_000;        // a lockfile older than this is considered abandoned
const LOCK_ACQUIRE_TIMEOUT_MS = 5000;
const LOCK_RETRY_MS = 50;

/**
 * Resolve the cache file path. Allows HOPPER_CACHE_DIR override for tests.
 */
export function cachePath() {
  const root = process.env.HOPPER_CACHE_DIR || join(homedir(), '.hopper', 'cache');
  return join(root, 'vendor-capabilities.json');
}

/**
 * Read the cache. Returns null if missing or malformed.
 * Auto-migrates / discards on version mismatch (safe — cache is rebuildable).
 * For diagnostic surfaces that need to distinguish "missing" from "corrupt",
 * use `readCacheWithDiagnostics()`.
 */
export function readCache() {
  const r = readCacheWithDiagnostics();
  return r.cache;
}

/**
 * P3b-fix: same as readCache but returns `{ cache, error }` so `--models` and
 * `--probe` can tell the user why their cache is empty (missing vs malformed
 * vs version-mismatch) instead of silently returning nothing.
 * error is null on success or when file simply doesn't exist (not an error,
 * just "run --probe first"). It is a string explaining the failure otherwise.
 */
export function readCacheWithDiagnostics() {
  const path = cachePath();
  if (!existsSync(path)) return { cache: null, error: null };
  let raw;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch (err) {
    return { cache: null, error: `cache file unreadable (${err.code || err.message}): ${path}` };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return { cache: null, error: `cache file is malformed JSON (${err.message}): ${path} — delete and re-probe` };
  }
  if (!parsed || typeof parsed !== 'object') {
    return { cache: null, error: `cache file does not contain an object: ${path} — delete and re-probe` };
  }
  if (parsed.version !== CACHE_VERSION) {
    return { cache: null, error: `cache schema version ${parsed.version} != expected ${CACHE_VERSION}: ${path} — re-probe to upgrade` };
  }
  if (!parsed.vendors || typeof parsed.vendors !== 'object') {
    return { cache: null, error: `cache file missing vendors object: ${path} — delete and re-probe` };
  }
  return { cache: parsed, error: null };
}

/**
 * Write cache atomically via tmp + rename.
 */
export function writeCache(data) {
  const path = cachePath();
  if (!existsSync(dirname(path))) mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp.${process.pid}.${Date.now()}`;
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  renameSync(tmp, path);
}

/**
 * Get cached entry for one vendor, or null if absent.
 */
export function getVendorCache(name) {
  const c = readCache();
  if (!c) return null;
  return c.vendors[name] || null;
}

/**
 * Acquire an exclusive file lock by O_EXCL creation. Retries on EEXIST until
 * `timeoutMs` elapses. If an existing lock is older than LOCK_STALE_MS it is
 * treated as abandoned (process crashed mid-write) and removed.
 * Returns the lockfile path on success; throws on timeout.
 */
function acquireLock(lockPath, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    try {
      const fd = openSync(lockPath, 'wx');  // O_CREAT | O_EXCL
      closeSync(fd);
      return lockPath;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      // Stale-lock recovery: if the lockfile is older than LOCK_STALE_MS,
      // assume the holding process died and remove it.
      try {
        const st = statSync(lockPath);
        if (Date.now() - st.mtimeMs > LOCK_STALE_MS) {
          try { unlinkSync(lockPath); } catch (_) { /* race: someone else cleared it */ }
          continue;  // immediate retry
        }
      } catch (_) { /* stat race; fall through to backoff */ }
      if (Date.now() >= deadline) {
        throw new Error(`cache lock timeout after ${timeoutMs}ms: ${lockPath}`);
      }
      // Sync sleep via Atomics.wait — locks are held briefly (a few ms of JSON write).
      Atomics.wait(LOCK_SLEEP_BUF, 0, 0, LOCK_RETRY_MS);
    }
  }
}

const LOCK_SLEEP_BUF = new Int32Array(new SharedArrayBuffer(4));

function releaseLock(lockPath) {
  try { unlinkSync(lockPath); } catch (_) { /* already gone */ }
}

/**
 * Set one vendor's cache entry (merges into existing cache, preserves others).
 * F2-fix: holds an exclusive file lock for the read-merge-write critical section
 * so parallel `--probe codex` / `--probe opencode` invocations cannot drop each
 * other's entries.
 */
export function setVendorCache(name, entry) {
  const path = cachePath();
  if (!existsSync(dirname(path))) mkdirSync(dirname(path), { recursive: true });
  const lockPath = `${path}.lock`;
  acquireLock(lockPath, LOCK_ACQUIRE_TIMEOUT_MS);
  try {
    // Re-read INSIDE the critical section so we merge against current state,
    // not a stale pre-lock snapshot.
    const c = readCache() || {
      version: CACHE_VERSION,
      host: hostname(),
      probed_at_global: new Date().toISOString(),
      vendors: {},
    };
    c.vendors[name] = entry;
    c.probed_at_global = new Date().toISOString();
    writeCache(c);
  } finally {
    releaseLock(lockPath);
  }
}

/**
 * Returns true if a probedAt ISO timestamp is older than `daysCeiling` days.
 * Used to flag stale cache entries.
 */
export function isStale(probedAt, daysCeiling = STALE_DAYS_DEFAULT) {
  if (!probedAt) return true;
  const t = Date.parse(probedAt);
  if (!Number.isFinite(t)) return true;
  return (Date.now() - t) > daysCeiling * 24 * 3.6e6;
}

/**
 * Human-readable "how stale" string for diagnostic output.
 */
export function staleness(probedAt) {
  if (!probedAt) return 'never';
  const t = Date.parse(probedAt);
  if (!Number.isFinite(t)) return 'invalid';
  const hours = (Date.now() - t) / 3.6e6;
  if (hours < 1) return `${Math.round(hours * 60)}m ago`;
  if (hours < 24) return `${hours.toFixed(1)}h ago`;
  return `${(hours / 24).toFixed(1)}d ago`;
}

export { CACHE_VERSION, STALE_DAYS_DEFAULT };
