import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import express from 'express';
import { createActionsRouter } from '../../dashboard/server/routes/actions.js';
import { readVendorInventory } from '../../dashboard/server/routes/vendors.js';
import { spawnProbe } from '../../dashboard/server/lib/spawn-cli.js';

function closeServer(server) {
  return new Promise((resolveClose) => server.close(resolveClose));
}

test('vendor inventory merges adapter list with cache diagnostics', () => {
  const inventory = readVendorInventory({
    capabilitiesForAdapterImpl: () => ({ reasoningArg: { knownGood: ['high'] } }),
    listAdaptersImpl: () => ['codex', 'kimi', 'opencode', 'copilot', 'agy'],
    readCacheWithDiagnosticsImpl: () => ({
      cache: {
        version: 1,
        vendors: {
          codex: {
            binary_path: 'codex',
            introspection_supported: 'full',
            models: ['gpt-5.5', 'gpt-5.4'],
            models_source: 'codex debug models',
            notes: ['ok'],
            probed_at: new Date().toISOString(),
            reasoning_levels: ['low', 'high'],
          },
        },
      },
      error: null,
    }),
  });

  assert.equal(inventory.vendors.length, 5);
  assert.deepEqual(inventory.vendors.map((vendor) => vendor.name), ['codex', 'kimi', 'opencode', 'copilot', 'agy']);
  assert.equal(inventory.vendors[0].installStatus, 'installed');
  assert.equal(inventory.vendors[0].cachedModels.length, 2);
  assert.equal(inventory.vendors[0].stale, false);
  assert.equal(inventory.vendors[1].installStatus, 'unknown');
  assert.equal(inventory.vendors[1].stale, true);
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
        child.stdout.end('probe done');
        child.emit('exit', 0, null);
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
    assert.equal((await firstResponse.json()).stdout, 'probe done');
  } finally {
    await closeServer(server);
  }
});
