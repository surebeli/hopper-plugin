// Codex vendor probe — combines `codex --version`, `codex debug models`, and
// Codex's account-aware local model cache. The probe is opt-in via --probe;
// it never retries and spawns exactly those two commands when Codex is found.
// Anchor: cli/src/vendor-probe/codex.js

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { resolveCommandOnPath } from '../path-resolve.js';
import { killProcessTree } from '../subprocess.js';

const PROBE_TIMEOUT_MS = 30_000;
const CACHE_TTL_MS = 300_000;
const IS_WINDOWS = process.platform === 'win32';

/**
 * P1-fix: pure parser exposed for static-fixture testing. Codex model JSON
 * may be an array or a `{ models: [...] }` envelope. `.slug` is preferred.
 */
export function parseCodexModelsJson(stdout) {
  const parsed = JSON.parse(stdout);
  const list = Array.isArray(parsed) ? parsed : (parsed.models || []);
  if (!Array.isArray(list)) throw new Error('models is not an array');
  return list.map((m) => {
    if (typeof m === 'string') return m;
    return m.slug || m.name || m.id || null;
  }).filter(Boolean);
}

/** Run one subprocess attempt; capture output without retries. */
function runOnce(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      detached: !IS_WINDOWS,
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    const timer = setTimeout(() => {
      timedOut = true;
      killProcessTree(child.pid, IS_WINDOWS);
    }, PROBE_TIMEOUT_MS);
    timer.unref();
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ exitCode: code ?? 1, stdout, stderr, timedOut });
    });
    child.on('error', () => {
      clearTimeout(timer);
      resolve({ exitCode: 127, stdout, stderr, timedOut: false });
    });
  });
}

function formatAge(ageMs) {
  return `${Math.max(0, Math.floor(ageMs / 1000))}s`;
}

function readAccountCache(readFile, cachePath, now) {
  try {
    const parsed = JSON.parse(readFile(cachePath, 'utf8'));
    const models = parseCodexModelsJson(JSON.stringify(parsed));
    if (models.length === 0) return { usable: false, reason: 'cache has no models' };
    const fetchedAt = Date.parse(parsed.fetched_at);
    if (!Number.isFinite(fetchedAt)) return { usable: false, reason: 'cache fetched_at is invalid' };
    const ageMs = now - fetchedAt;
    const clientVersion = typeof parsed.client_version === 'string' ? parsed.client_version : null;
    return {
      usable: true,
      models,
      clientVersion,
      ageMs,
      fresh: ageMs >= 0 && ageMs <= CACHE_TTL_MS,
      reason: `cache age ${formatAge(ageMs)}, client_version ${clientVersion || 'missing'}`,
    };
  } catch (err) {
    const reason = err && err.code === 'ENOENT' ? 'cache missing' : `cache unreadable: ${err.message}`;
    return { usable: false, reason };
  }
}

function parseVersion(result, notes) {
  if (result.exitCode === 0 && result.stdout) {
    const match = result.stdout.match(/\d+\.\d+\.\d+/);
    if (match) return match[0];
    notes.push('codex --version output was unparseable');
  } else if (result.timedOut) {
    notes.push('codex --version timed out');
  } else {
    notes.push(`codex --version exited ${result.exitCode}`);
  }
  return null;
}

function parseCommandModels(result, notes) {
  if (result.exitCode !== 0 || !result.stdout.trim()) {
    notes.push(result.timedOut
      ? 'codex debug models timed out'
      : `codex debug models exited ${result.exitCode}; stderr: ${result.stderr.slice(0, 200)}`);
    return null;
  }
  try {
    return parseCodexModelsJson(result.stdout);
  } catch (err) {
    notes.push(`codex debug models JSON parse failed: ${err.message}`);
    return null;
  }
}

/**
 * Probe the account-aware Codex catalog. Dependencies are injectable for unit
 * tests; the public zero-argument API remains unchanged.
 */
export async function probe(deps = {}) {
  const {
    runner = runOnce,
    pathResolver = resolveCommandOnPath,
    readFile = readFileSync,
    env = process.env,
    home = homedir,
    clock = Date.now,
  } = deps;
  const t0 = clock();
  const notes = [];
  const cachePath = env.CODEX_HOME
    ? join(env.CODEX_HOME, 'models_cache.json')
    : join(home(), '.codex', 'models_cache.json');
  const resolved = pathResolver('codex');

  let versionResult = { exitCode: 127, stdout: '', stderr: 'codex binary not found', timedOut: false };
  let modelsResult = versionResult;
  if (resolved?.resolvedPath) {
    const cmd = resolved.command;
    const prepend = resolved.prependArgs || [];
    // Keep this order and exactly these two subprocesses: no bundled mode, retry, or fallback command.
    versionResult = await runner(cmd, [...prepend, '--version']);
    modelsResult = await runner(cmd, [...prepend, 'debug', 'models']);
  } else {
    notes.push('codex binary not found on PATH; account cache may still be available');
  }

  // Read only after the command attempts: Codex may refresh this cache while it runs.
  const cache = readAccountCache(readFile, cachePath, clock());
  const version = parseVersion(versionResult, notes);
  const commandModels = parseCommandModels(modelsResult, notes);
  const commandUsable = commandModels !== null;
  const cacheVersionMatches = cache.usable && version !== null && cache.clientVersion === version;
  const cacheModelsInCommand = cache.usable && commandUsable
    && cache.models.every((model) => commandModels.includes(model));
  const full = Boolean(commandUsable && version && cache.usable && cache.fresh
    && cacheVersionMatches && cacheModelsInCommand);

  notes.push(`${cache.reason}${cache.usable ? `; fresh=${cache.fresh}` : ''}`);
  if (cache.usable) {
    notes.push(`cache version ${cache.clientVersion || 'missing'}; CLI version ${version || 'unavailable'}; match=${cacheVersionMatches}`);
    if (commandUsable) notes.push(`cache/command catalog conflict=${!cacheModelsInCommand}`);
  }

  let introspectionSupported;
  let models;
  let modelsSource;
  if (full) {
    introspectionSupported = 'full';
    models = cache.models;
    modelsSource = `Codex account cache (${cache.reason}; version matches CLI; reconciled with codex debug models)`;
  } else if (commandUsable) {
    introspectionSupported = 'partial';
    models = commandModels;
    modelsSource = `codex debug models (command catalog; account cache not trusted: ${cache.reason})`;
  } else if (cache.usable) {
    introspectionSupported = 'partial';
    models = cache.models;
    modelsSource = `Codex account cache (${cache.reason}; command catalog unavailable)`;
  } else {
    introspectionSupported = 'none';
    models = [];
    modelsSource = `no usable Codex catalog (${cache.reason})`;
  }

  return {
    introspection_supported: introspectionSupported,
    binary_path: resolved?.resolvedPath || null,
    version,
    models,
    models_source: modelsSource,
    reasoning_levels: ['minimal', 'low', 'medium', 'high', 'xhigh'],
    notes,
    duration_ms: clock() - t0,
  };
}
