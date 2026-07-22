import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { PassThrough } from 'node:stream';
import vm from 'node:vm';
import express from 'express';
import ts from 'typescript';
import { createActionsRouter } from '../../dashboard/server/routes/actions.js';
import { readVendorInventory } from '../../dashboard/server/routes/vendors.js';
import { spawnProbe } from '../../dashboard/server/lib/spawn-cli.js';

function closeServer(server) {
  return new Promise((resolveClose) => server.close(resolveClose));
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

async function waitFor(predicate, timeoutMs = 1_000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('timed out waiting for test condition');
    await delay(1);
  }
}

function createProbeChild(pid) {
  const child = new EventEmitter();
  child.pid = pid;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  return child;
}

function createManualTimers() {
  const pending = [];
  return {
    clearTimeout(timer) {
      timer.cancelled = true;
    },
    setTimeout(callback, delayMs) {
      const timer = { callback, cancelled: false, delayMs };
      pending.push(timer);
      return timer;
    },
    fire(delayMs) {
      const timer = pending.find((candidate) => candidate.delayMs === delayMs && !candidate.cancelled);
      assert.ok(timer, `expected a pending ${delayMs}ms timer`);
      timer.cancelled = true;
      timer.callback();
    },
    has(delayMs) {
      return pending.some((timer) => timer.delayMs === delayMs && !timer.cancelled);
    },
  };
}

const CLOSED_PROBE_KEYS = ['diagnosticCode', 'diagnosticState', 'status', 'vendor'].sort();
const RAW_PROBE_SENTINELS = [
  'RAW_STDOUT_PRIVATE',
  'RAW_STDERR_PRIVATE',
  'C:\\PRIVATE\\probe.log',
  'sk-private-probe-token',
  'PRIVATE_CHILD_ERROR',
];

function assertClosedProbePayload(payload, expected) {
  assert.deepEqual(Object.keys(payload).sort(), CLOSED_PROBE_KEYS);
  assert.deepEqual(payload, expected);
  const serialized = JSON.stringify(payload);
  for (const sentinel of RAW_PROBE_SENTINELS) {
    assert.equal(serialized.includes(sentinel), false, `probe response leaked ${sentinel}`);
  }
}

const V2_VENDOR_KEYS = [
  'binaryAvailability',
  'binaryBasename',
  'binaryPath',
  'cacheError',
  'cachedAt',
  'cachedModels',
  'diagnosticCode',
  'diagnosticState',
  'modelsSource',
  'name',
  'notes',
  'reasoningLevels',
  'sourceKind',
  'sourceLabel',
].sort();

const SAFE_SHIMS = {
  binaryPath: null,
  cacheError: null,
  modelsSource: null,
  notes: [],
};

const FORBIDDEN_KEYS = new Set([
  'auth',
  'binary_path',
  'cache',
  'config',
  'error',
  'introspection',
  'models_source',
  'provider',
  'provenance',
  'sourceNote',
  'stale',
  'staleness',
  'stderr',
  'stdout',
]);

function assertSafeInventoryPayload(value, { directVendor = false, path = '$' } = {}) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertSafeInventoryPayload(entry, {
      directVendor: path === '$.vendors',
      path: `${path}[${index}]`,
    }));
    return;
  }
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string') {
      assert.doesNotMatch(value, /(?:https?:\/\/|[A-Z]:[\\/]|\/(?:home|users|etc|var)[\\/]|stderr:|authorization|api[_-]?key|access[_-]?token|private-account)/i, path);
    }
    return;
  }

  for (const [key, nested] of Object.entries(value)) {
    if (Object.hasOwn(SAFE_SHIMS, key)) {
      assert.equal(directVendor, true, `${path}.${key} must only occur on a direct vendor record`);
      assert.deepEqual(nested, SAFE_SHIMS[key], `${path}.${key} must be its exact permanent safe shim`);
      continue;
    }
    assert.equal(FORBIDDEN_KEYS.has(key), false, `${path}.${key} is not public inventory data`);
    assertSafeInventoryPayload(nested, { path: `${path}.${key}` });
  }
}

function loadVendorDisplayNormalizer() {
  const sourcePath = new URL('../../dashboard/client/src/lib/types.ts', import.meta.url);
  const source = readFileSync(sourcePath, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const module = { exports: {} };
  vm.runInNewContext(outputText, { exports: module.exports, module });
  return module.exports;
}

test('vendor inventory exposes only v2 safe projection fields and permanent direct shims', () => {
  const inventory = readVendorInventory({
    listAdaptersImpl: () => ['claude', 'kimi'],
    readCacheWithOutcomeImpl: () => ({
      outcome: 'ok-v1',
      cache: {
        version: 1,
        vendors: {
          claude: {
            binary_path: 'C:\\Users\\private\\AppData\\Local\\claude.exe',
            introspection_supported: 'full',
            models: ['claude-safe', 42, 'https://private.example.invalid/models'],
            models_source: 'C:\\Users\\private\\.config\\claude.json',
            notes: ['provider/private-account/token/stderr should never escape'],
            probed_at: new Date().toISOString(),
            reasoning_levels: ['high', false, '/home/private/.config'],
            sourceNote: 'https://private.example.invalid/path',
            provenance: {
              binary_availability: 'present',
              binary_basename: 'claude',
              provider: 'private-account',
              source_kind: 'adapter-aliases',
            },
          },
          kimi: {
            probed_at: '2026-02-30T00:00:00.000Z',
          },
        },
      },
    }),
  });

  assert.deepEqual(Object.keys(inventory).sort(), ['generatedAt', 'inventoryContractVersion', 'vendors']);
  assert.equal(inventory.inventoryContractVersion, 2);
  assert.match(inventory.generatedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.equal(Number.isNaN(Date.parse(inventory.generatedAt)), false);
  assert.deepEqual(inventory.vendors.map((vendor) => vendor.name), ['claude', 'kimi']);
  assert.deepEqual(Object.keys(inventory.vendors[0]).sort(), V2_VENDOR_KEYS);
  assert.deepEqual(inventory.vendors[0], {
    binaryAvailability: 'present',
    binaryBasename: 'claude',
    binaryPath: null,
    cacheError: null,
    cachedAt: inventory.vendors[0].cachedAt,
    cachedModels: ['claude-safe'],
    diagnosticCode: 'none',
    diagnosticState: 'none',
    modelsSource: null,
    name: 'claude',
    notes: [],
    reasoningLevels: ['high'],
    sourceKind: 'adapter-aliases',
    sourceLabel: 'claude-selector-metadata',
  });
  assert.match(inventory.vendors[0].cachedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.equal(inventory.vendors[1].cachedAt, null);
  assert.deepEqual(inventory.vendors[1].cachedModels, []);
  assert.deepEqual(inventory.vendors[1].reasoningLevels, []);
  assertSafeInventoryPayload({
    ...inventory,
    vendors: inventory.vendors.map((vendor) => ({ ...vendor })),
  });
  inventory.vendors.forEach((vendor) => assertSafeInventoryPayload(vendor, { directVendor: true, path: '$.vendors[]' }));
});

test('vendor inventory derives closed diagnostics for missing, malformed, and future cache outcomes', () => {
  const cases = [
    ['missing', 'catalog-unavailable', 'unavailable'],
    ['malformed', 'inventory-cache-malformed', 'degraded'],
    ['version-mismatch', 'inventory-cache-version-unsupported', 'degraded'],
    ['future-cache-outcome', 'none', 'none'],
  ];
  for (const [outcome, diagnosticCode, diagnosticState] of cases) {
    const inventory = readVendorInventory({
      listAdaptersImpl: () => ['claude'],
      readCacheWithOutcomeImpl: () => ({ outcome, cache: null, error: 'C:\\Users\\private\\cache failure' }),
    });
    const [vendor] = inventory.vendors;
    assert.equal(inventory.inventoryContractVersion, 2, outcome);
    assert.equal(vendor.diagnosticCode, diagnosticCode, outcome);
    assert.equal(vendor.diagnosticState, diagnosticState, outcome);
    assert.deepEqual(Object.fromEntries(Object.keys(SAFE_SHIMS).map((key) => [key, vendor[key]])), SAFE_SHIMS, outcome);
    assertSafeInventoryPayload(vendor, { directVendor: true, path: `$.vendors[${outcome}]` });
  }
});

test('recursive privacy scanner rejects misplaced shims and raw fields at every nesting depth', () => {
  assert.throws(() => assertSafeInventoryPayload({ vendors: [{ ...SAFE_SHIMS, nested: { notes: [] } }] }), /direct vendor record/);
  assert.throws(() => assertSafeInventoryPayload({ vendors: [{ ...SAFE_SHIMS, nested: { cacheError: 'stderr: secret' } }] }), /direct vendor record/);
  assert.throws(() => assertSafeInventoryPayload({ vendors: [{ ...SAFE_SHIMS, provenance: { sourceNote: 'https:\/\/private.example.invalid' } }] }), /not public inventory data/);
});

test('client display normalizes complete, missing, null, unknown, future, gate-off, rollback, and card-disabled v2 fixtures', () => {
  const { normalizeVendorDisplay } = loadVendorDisplayNormalizer();
  assert.equal(typeof normalizeVendorDisplay, 'function');
  const fixtures = [
    {
      name: 'complete',
      inventoryContractVersion: 2,
      vendor: {
        binaryAvailability: 'present', binaryBasename: 'claude', sourceKind: 'adapter-aliases',
        sourceLabel: 'claude-selector-metadata', diagnosticCode: 'none', diagnosticState: 'none',
      },
      expected: { binary: 'present (claude)', diagnostic: 'none', source: 'claude-selector-metadata' },
    },
    { name: 'missing', vendor: {}, expected: { binary: 'unavailable', diagnostic: 'unavailable', source: 'unavailable' } },
    { name: 'null', inventoryContractVersion: null, vendor: { binaryBasename: null }, expected: { binary: 'unavailable', diagnostic: 'unavailable', source: 'unavailable' } },
    { name: 'unknown', inventoryContractVersion: 'unknown', vendor: { binaryAvailability: 'unknown', binaryBasename: 'unknown', sourceLabel: 'unknown', diagnosticCode: 'unknown', diagnosticState: 'unknown' }, expected: { binary: 'unavailable', diagnostic: 'unavailable', source: 'unavailable' } },
    { name: 'future', inventoryContractVersion: 99, vendor: { binaryAvailability: 'future', binaryBasename: 'future', sourceKind: 'future', sourceLabel: 'future', diagnosticCode: 'future', diagnosticState: 'future' }, expected: { binary: 'unavailable', diagnostic: 'unavailable', source: 'unavailable' } },
    { name: 'gate-off', inventoryContractVersion: 2, vendor: { ...SAFE_SHIMS }, expected: { binary: 'unavailable', diagnostic: 'unavailable', source: 'unavailable' } },
    { name: 'rollback', inventoryContractVersion: 1, vendor: { ...SAFE_SHIMS, modelsSource: 'C:\\Users\\private\\source' }, expected: { binary: 'unavailable', diagnostic: 'unavailable', source: 'unavailable' } },
    { name: 'card-disabled', inventoryContractVersion: undefined, vendor: null, expected: { binary: 'unavailable', diagnostic: 'unavailable', source: 'unavailable' } },
  ];
  for (const fixture of fixtures) {
    assert.doesNotThrow(() => normalizeVendorDisplay(fixture.vendor), fixture.name);
    assert.deepEqual(JSON.parse(JSON.stringify(normalizeVendorDisplay(fixture.vendor))), fixture.expected, fixture.name);
  }

  const cardSource = readFileSync(new URL('../../dashboard/client/src/components/VendorCard.tsx', import.meta.url), 'utf8');
  for (const shim of Object.keys(SAFE_SHIMS)) {
    assert.doesNotMatch(cardSource, new RegExp(`vendor\\.${shim}`), `${shim} must never be rendered or dereferenced`);
  }
  assert.doesNotMatch(cardSource, /(?:notes|cacheError|modelsSource|binaryPath)\.length/, 'shim values must not receive unsafe length dereferences');
});

test('spawnProbe allowlists vendors and spawns only hopper-dispatch --probe', () => {
  let captured;
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  spawnProbe('codex', {
    spawn: (cmd, args, opts) => {
      captured = { args, cmd, opts };
      return child;
    },
  });

  assert.equal(captured.cmd, process.execPath);
  assert.deepEqual(captured.args.slice(-2), ['--probe', 'codex']);
  assert.equal(captured.args.includes('--background'), false);
  assert.equal(captured.args.includes('--dispatch'), false);
  assert.equal(captured.opts.stdio[0], 'ignore');
  assert.equal(captured.opts.detached, process.platform !== 'win32');
  assert.throws(() => spawnProbe('codex; rm -rf /', { spawn: () => child }), /vendor not allowed/);
});

test('probe action returns 409 while same vendor is already running', async () => {
  let release;
  const app = express();
  app.use(express.json());
  app.use('/api/action', createActionsRouter({
    spawnProbeImpl: () => {
      const child = new EventEmitter();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      release = () => {
        child.stdout.end('RAW_STDOUT_PRIVATE C:\\PRIVATE\\probe.log sk-private-probe-token');
        child.stderr.end('RAW_STDERR_PRIVATE');
        child.emit('exit', 0, null);
        child.emit('close', 0, null);
      };
      return child;
    },
  }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolveListen) => server.once('listening', resolveListen));
  const { port } = server.address();

  try {
    const first = fetch(`http://127.0.0.1:${port}/api/action/probe`, {
      body: JSON.stringify({ vendor: 'codex' }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
    await new Promise((resolveTick) => setImmediate(resolveTick));
    const duplicate = await fetch(`http://127.0.0.1:${port}/api/action/probe`, {
      body: JSON.stringify({ vendor: 'codex' }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
    release();
    const firstResponse = await first;

    assert.equal(duplicate.status, 409);
    assert.equal(firstResponse.status, 200);
    assertClosedProbePayload(await firstResponse.json(), {
      vendor: 'codex', status: 'done', diagnosticCode: 'none', diagnosticState: 'none',
    });
  } finally {
    await closeServer(server);
  }
});

test('successful probe remains busy after exit until close drains inherited stdio exactly once', async () => {
  const delayedChild = createProbeChild(4141);
  let spawnCount = 0;
  let firstResolved = false;
  const app = express();
  app.use(express.json());
  app.use('/api/action', createActionsRouter({
    probeTimeoutMs: 200,
    spawnProbeImpl: () => {
      spawnCount += 1;
      if (spawnCount === 1) return delayedChild;
      const child = createProbeChild(4141 + spawnCount);
      queueMicrotask(() => {
        child.stdout.end();
        child.stderr.end();
        child.emit('exit', 0, null);
        child.emit('close', 0, null);
      });
      return child;
    },
  }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolveListen) => server.once('listening', resolveListen));
  const { port } = server.address();

  try {
    const first = fetch(`http://127.0.0.1:${port}/api/action/probe`, {
      body: JSON.stringify({ vendor: 'codex' }), headers: { 'Content-Type': 'application/json' }, method: 'POST',
    }).then((response) => { firstResolved = true; return response; });
    await waitFor(() => delayedChild.listenerCount('close') === 1);
    delayedChild.emit('exit', 0, null);
    await new Promise((resolveTick) => setImmediate(resolveTick));

    assert.equal(firstResolved, false, 'exit cannot settle before stdio close');
    assert.equal(delayedChild.listenerCount('close'), 1, 'close listener remains armed');
    assert.equal(delayedChild.stdout.listenerCount('data'), 1, 'stdout drain remains armed');
    assert.equal(delayedChild.stderr.listenerCount('data'), 1, 'stderr drain remains armed');
    const duplicate = await fetch(`http://127.0.0.1:${port}/api/action/probe`, {
      body: JSON.stringify({ vendor: 'codex' }), headers: { 'Content-Type': 'application/json' }, method: 'POST',
    });
    assert.equal(duplicate.status, 409);

    delayedChild.stdout.end('RAW_STDOUT_PRIVATE');
    delayedChild.stderr.end('RAW_STDERR_PRIVATE');
    delayedChild.emit('close', 0, null);
    const response = await first;
    assert.equal(response.status, 200);
    assertClosedProbePayload(await response.json(), {
      vendor: 'codex', status: 'done', diagnosticCode: 'none', diagnosticState: 'none',
    });
    delayedChild.emit('close', 0, null);

    const retry = await fetch(`http://127.0.0.1:${port}/api/action/probe`, {
      body: JSON.stringify({ vendor: 'codex' }), headers: { 'Content-Type': 'application/json' }, method: 'POST',
    });
    assert.equal(retry.status, 200);
    assert.equal(spawnCount, 2);
  } finally {
    delayedChild.emit('close', 0, null);
    await closeServer(server);
  }
});

test('probe timeout cleans the process tree and holds the vendor lock until child close', async () => {
  const timedOutChild = createProbeChild(4242);
  const cleanupCalls = [];
  let directKills = 0;
  let spawnCount = 0;
  let firstResolved = false;
  timedOutChild.kill = () => { directKills += 1; };
  const app = express();
  app.use(express.json());
  app.use('/api/action', createActionsRouter({
    probeTimeoutMs: 5,
    probeCleanupTimeoutMs: 100,
    killProcessTreeImpl: (pid, isWindows) => {
      cleanupCalls.push([pid, isWindows]);
      return { status: 'succeeded', method: 'fake-tree-cleanup' };
    },
    spawnProbeImpl: () => {
      spawnCount += 1;
      if (spawnCount === 1) return timedOutChild;
      const child = createProbeChild(5000 + spawnCount);
      queueMicrotask(() => {
        child.stdout.end();
        child.stderr.end();
        child.emit('exit', 0, null);
        child.emit('close', 0, null);
      });
      return child;
    },
  }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolveListen) => server.once('listening', resolveListen));
  const { port } = server.address();

  try {
    const first = fetch(`http://127.0.0.1:${port}/api/action/probe`, {
      body: JSON.stringify({ vendor: 'codex' }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }).then((response) => {
      firstResolved = true;
      return response;
    });
    await waitFor(() => cleanupCalls.length === 1);

    assert.deepEqual(cleanupCalls, [[4242, process.platform === 'win32']]);
    assert.equal(firstResolved, false, 'timeout response must wait for child close');
    assert.equal(directKills, 0, 'tree cleanup replaces parent-only child.kill');

    timedOutChild.emit('exit', null, 'SIGKILL');
    await new Promise((resolveTick) => setImmediate(resolveTick));
    assert.equal(firstResolved, false, 'exit alone must not release the active vendor lock');
    const duplicate = await fetch(`http://127.0.0.1:${port}/api/action/probe`, {
      body: JSON.stringify({ vendor: 'codex' }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
    assert.equal(duplicate.status, 409);

    timedOutChild.stdout.end();
    timedOutChild.stderr.end();
    timedOutChild.emit('close', null, 'SIGKILL');
    const response = await first;
    const body = await response.json();

    assert.equal(response.status, 504);
    assertClosedProbePayload(body, {
      vendor: 'codex', status: 'failed', diagnosticCode: 'probe-failed', diagnosticState: 'unavailable',
    });
    assert.equal(timedOutChild.listenerCount('error'), 0);
    assert.equal(timedOutChild.listenerCount('exit'), 0);
    assert.equal(timedOutChild.listenerCount('close'), 0);
    assert.equal(timedOutChild.stdout.listenerCount('data'), 0);
    assert.equal(timedOutChild.stderr.listenerCount('data'), 0);

    const retry = await fetch(`http://127.0.0.1:${port}/api/action/probe`, {
      body: JSON.stringify({ vendor: 'codex' }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
    assert.equal(retry.status, 200);
    assert.equal(spawnCount, 2);
    timedOutChild.emit('close', null, 'SIGKILL');
    assert.equal(cleanupCalls.length, 1, 'late close must not trigger duplicate cleanup or resolution');
  } finally {
    if (!firstResolved) timedOutChild.emit('close', null, 'SIGKILL');
    await closeServer(server);
  }
});

test('probe timeout cleanup fallback is bounded and keeps the vendor busy until fallback', async () => {
  const timedOutChild = createProbeChild(4343);
  const timers = createManualTimers();
  let cleanupCalls = 0;
  let spawnCount = 0;
  const app = express();
  app.use(express.json());
  app.use('/api/action', createActionsRouter({
    probeTimeoutMs: 5,
    probeCleanupTimeoutMs: 40,
    setTimeoutImpl: timers.setTimeout,
    clearTimeoutImpl: timers.clearTimeout,
    killProcessTreeImpl: () => {
      cleanupCalls += 1;
      return { status: 'succeeded', method: 'fake-tree-cleanup' };
    },
    spawnProbeImpl: () => {
      spawnCount += 1;
      if (spawnCount === 1) return timedOutChild;
      const child = createProbeChild(6000 + spawnCount);
      queueMicrotask(() => {
        child.stdout.end();
        child.stderr.end();
        child.emit('exit', 0, null);
        child.emit('close', 0, null);
      });
      return child;
    },
  }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolveListen) => server.once('listening', resolveListen));
  const { port } = server.address();

  try {
    const first = fetch(`http://127.0.0.1:${port}/api/action/probe`, {
      body: JSON.stringify({ vendor: 'codex' }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
    await waitFor(() => timers.has(5));
    timers.fire(5);
    await waitFor(() => cleanupCalls === 1 && timers.has(40));
    assert.equal(cleanupCalls, 1);
    const duplicate = await fetch(`http://127.0.0.1:${port}/api/action/probe`, {
      body: JSON.stringify({ vendor: 'codex' }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
    assert.equal(duplicate.status, 409);

    timers.fire(40);
    const response = await first;
    assert.equal(response.status, 504);
    assertClosedProbePayload(await response.json(), {
      vendor: 'codex', status: 'failed', diagnosticCode: 'probe-failed', diagnosticState: 'unavailable',
    });
    assert.equal(timedOutChild.listenerCount('close'), 0);
    assert.equal(timedOutChild.listenerCount('exit'), 0);
    assert.equal(timedOutChild.listenerCount('error'), 0);

    const retry = await fetch(`http://127.0.0.1:${port}/api/action/probe`, {
      body: JSON.stringify({ vendor: 'codex' }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
    assert.equal(retry.status, 200);
    assert.equal(spawnCount, 2);
  } finally {
    timedOutChild.emit('close', null, 'SIGKILL');
    await closeServer(server);
  }
});

test('probe action maps nonzero exit, child error, and malformed vendor to closed diagnostics', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/action', createActionsRouter({
    spawnProbeImpl: (vendor) => {
      if (vendor === 'malformed') {
        const err = new Error('PRIVATE_CHILD_ERROR C:\\PRIVATE\\probe.log sk-private-probe-token');
        err.code = 'EINVAL';
        throw err;
      }
      const child = new EventEmitter();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      queueMicrotask(() => {
        child.stdout.end('RAW_STDOUT_PRIVATE C:\\PRIVATE\\probe.log');
        child.stderr.end('RAW_STDERR_PRIVATE sk-private-probe-token');
        if (vendor === 'opencode') child.emit('error', new Error('PRIVATE_CHILD_ERROR'));
        else {
          child.emit('exit', 9, 'SIGPRIVATE');
          child.emit('close', 9, 'SIGPRIVATE');
        }
      });
      return child;
    },
  }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolveListen) => server.once('listening', resolveListen));
  const { port } = server.address();

  try {
    for (const vendor of ['kimi', 'opencode', 'malformed']) {
      const response = await fetch(`http://127.0.0.1:${port}/api/action/probe`, {
        body: JSON.stringify({ vendor }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
      assert.equal(response.status, vendor === 'malformed' ? 400 : 500, vendor);
      assertClosedProbePayload(await response.json(), {
        vendor: vendor === 'malformed' ? 'unknown' : vendor,
        status: 'failed', diagnosticCode: vendor === 'malformed' ? 'unknown' : 'probe-failed',
        diagnosticState: vendor === 'malformed' ? 'unknown' : 'unavailable',
      });
    }
  } finally {
    await closeServer(server);
  }
});
