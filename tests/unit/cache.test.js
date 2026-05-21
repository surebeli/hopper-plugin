// Phase 6b cache tests
// Anchor: tests/unit/cache.test.js

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  readCache, writeCache, getVendorCache, setVendorCache,
  isStale, staleness, cachePath, CACHE_VERSION,
} from '../../cli/src/cache.js';
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function withTmpCache(fn) {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-cache-'));
  const oldEnv = process.env.HOPPER_CACHE_DIR;
  process.env.HOPPER_CACHE_DIR = tmp;
  try {
    return fn(tmp);
  } finally {
    if (oldEnv === undefined) delete process.env.HOPPER_CACHE_DIR;
    else process.env.HOPPER_CACHE_DIR = oldEnv;
    rmSync(tmp, { recursive: true, force: true });
  }
}

test('readCache returns null when file does not exist', () => {
  withTmpCache(() => {
    assert.equal(readCache(), null);
  });
});

test('writeCache + readCache roundtrip preserves data', () => {
  withTmpCache(() => {
    const data = {
      version: CACHE_VERSION,
      host: 'test-host',
      probed_at_global: '2026-05-21T12:00:00Z',
      vendors: {
        codex: { models: ['gpt-5'], introspection_supported: 'full', probed_at: '2026-05-21T12:00:00Z' },
      },
    };
    writeCache(data);
    const got = readCache();
    assert.deepEqual(got, data);
  });
});

test('readCache returns null on version mismatch (no auto-migration)', () => {
  withTmpCache(() => {
    writeCache({ version: 999, host: 'x', probed_at_global: '', vendors: {} });
    assert.equal(readCache(), null);
  });
});

test('getVendorCache returns null when vendor not cached', () => {
  withTmpCache(() => {
    setVendorCache('codex', { models: [], introspection_supported: 'full' });
    assert.equal(getVendorCache('kimi'), null);
  });
});

test('setVendorCache preserves other vendor entries', () => {
  withTmpCache(() => {
    setVendorCache('codex', { models: ['gpt-5'], introspection_supported: 'full' });
    setVendorCache('kimi', { models: ['default'], introspection_supported: 'config-only' });
    const codex = getVendorCache('codex');
    const kimi = getVendorCache('kimi');
    assert.deepEqual(codex.models, ['gpt-5']);
    assert.deepEqual(kimi.models, ['default']);
  });
});

test('isStale: fresh timestamp returns false', () => {
  const fresh = new Date().toISOString();
  assert.equal(isStale(fresh), false);
});

test('isStale: 30-day-old timestamp returns true (default 14d ceiling)', () => {
  const old = new Date(Date.now() - 30 * 24 * 3.6e6).toISOString();
  assert.equal(isStale(old), true);
});

test('isStale: 7d old returns false; 21d returns true (default 14d ceiling)', () => {
  const sevenDays = new Date(Date.now() - 7 * 24 * 3.6e6).toISOString();
  const twentyOneDays = new Date(Date.now() - 21 * 24 * 3.6e6).toISOString();
  assert.equal(isStale(sevenDays), false);
  assert.equal(isStale(twentyOneDays), true);
});

test('isStale: null/invalid returns true', () => {
  assert.equal(isStale(null), true);
  assert.equal(isStale(undefined), true);
  assert.equal(isStale('not-a-date'), true);
});

test('staleness: returns human-readable string', () => {
  const now = new Date().toISOString();
  assert.match(staleness(now), /m ago|s ago|0\.0h ago/);

  const oneHour = new Date(Date.now() - 3.6e6).toISOString();
  assert.match(staleness(oneHour), /h ago|m ago/);

  const fiveDays = new Date(Date.now() - 5 * 24 * 3.6e6).toISOString();
  assert.match(staleness(fiveDays), /d ago/);
});

test('cachePath uses HOPPER_CACHE_DIR override', () => {
  withTmpCache((tmp) => {
    assert.equal(cachePath(), join(tmp, 'vendor-capabilities.json'));
  });
});

test('writeCache atomic — no leftover tmp files', () => {
  withTmpCache((tmp) => {
    writeCache({ version: CACHE_VERSION, host: 'x', probed_at_global: '', vendors: {} });
    const finalFile = join(tmp, 'vendor-capabilities.json');
    assert.ok(existsSync(finalFile));
    // Check no .tmp.* leftovers in the cache dir
    const dirs = readdirSync(tmp);
    const tmpFiles = dirs.filter((f) => f.includes('.tmp.'));
    assert.equal(tmpFiles.length, 0, `tmp files left over: ${tmpFiles.join(', ')}`);
  });
});

test('F2-fix: parallel setVendorCache calls preserve all entries (sync barrier)', async (t) => {
  // R2-F2: tighter race exerciser. The earlier version had children fire
  // setVendorCache as soon as they finished module-load — but module-load
  // takes ~50-150ms per child, easily long enough for the OS scheduler to
  // serialize them. Now each child busy-waits until a shared START_AT
  // timestamp (HOPPER_RACE_START_AT) before calling setVendorCache, so all
  // 5 children fire within a sub-ms window. Without the lock, last writer
  // wins; with the lock, all 5 entries survive.
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-cache-race-'));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));

  const { spawn } = await import('node:child_process');
  const { pathToFileURL, fileURLToPath } = await import('node:url');
  const { dirname: pathDirname, resolve: pathResolve, join: pathJoin } = await import('node:path');
  const __dirname = pathDirname(fileURLToPath(import.meta.url));
  const REPO_ROOT = pathResolve(__dirname, '..', '..');
  const cacheJsUrl = pathToFileURL(pathJoin(REPO_ROOT, 'cli', 'src', 'cache.js')).href;
  const vendors = ['codex', 'kimi', 'opencode', 'copilot', 'agy'];

  // Children sleep until the shared START_AT (set by us below to "now + 1.5s",
  // generous enough that all 5 children finish module-load before firing).
  const startAt = Date.now() + 1500;
  const script = `
    import { setVendorCache, readCache } from '${cacheJsUrl}';
    const vendor = process.argv[1];
    const startAt = Number(process.env.HOPPER_RACE_START_AT);
    // Spin-sleep until target time (avoids setTimeout jitter)
    while (Date.now() < startAt) { /* tight loop, last ~few ms only */ }
    const fireAt = Date.now();
    setVendorCache(vendor, { models: [vendor + '-m1'], introspection_supported: 'full', probed_at: new Date().toISOString() });
    process.stdout.write(JSON.stringify({ vendor, fireAt }));
  `;

  const results = await Promise.all(vendors.map((v) => new Promise((res, rej) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', script, '--', v], {
      env: { ...process.env, HOPPER_CACHE_DIR: tmp, HOPPER_RACE_START_AT: String(startAt) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d.toString(); });
    child.stderr.on('data', (d) => { err += d.toString(); });
    child.on('close', (code) => code === 0 ? res(JSON.parse(out)) : rej(new Error(`exit ${code}: ${err}`)));
  })));

  // Sanity: confirm the children actually fired close together. If the gap
  // between first and last fireAt is >250ms, the race window is too wide
  // and this test isn't really exercising the race — bail out (test
  // environment too slow / inconsistent, treat as inconclusive rather
  // than fake-passing).
  const fireTimes = results.map((r) => r.fireAt).sort((a, b) => a - b);
  const fireSpread = fireTimes[fireTimes.length - 1] - fireTimes[0];
  assert.ok(fireSpread < 250,
    `sync barrier failed — children fired ${fireSpread}ms apart, too wide to exercise race (timestamps: ${fireTimes.join(', ')})`);

  // Read the final cache directly
  const finalRaw = readFileSync(join(tmp, 'vendor-capabilities.json'), 'utf-8');
  const finalCache = JSON.parse(finalRaw);
  for (const v of vendors) {
    assert.ok(finalCache.vendors[v],
      `vendor '${v}' must survive parallel write (fire-spread ${fireSpread}ms); survivors: ${Object.keys(finalCache.vendors).join(', ')}`);
  }
});

test('F2-fix: stale lockfile (>30s old) is auto-cleared', () => {
  withTmpCache((tmp) => {
    const lockPath = join(tmp, 'vendor-capabilities.json.lock');
    // Pre-create a stale lockfile (mtime 60s ago)
    writeFileSync(lockPath, '', 'utf-8');
    const oldTime = new Date(Date.now() - 60_000);
    utimesSync(lockPath, oldTime, oldTime);
    // setVendorCache should succeed — stale lock auto-cleared
    setVendorCache('codex', { models: ['x'], introspection_supported: 'full' });
    const c = readCache();
    assert.ok(c.vendors.codex);
  });
});
