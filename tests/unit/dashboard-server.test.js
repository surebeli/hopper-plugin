import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createApp, parseServerArgs, startServer } from '../../dashboard/server/index.js';
import * as hopperDirLib from '../../dashboard/server/lib/hopper-dir.js';

const { findHopperDir, isHopperWorkspace } = hopperDirLib;

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

test('dashboard server parses --port and --dev flags', () => {
  assert.deepEqual(parseServerArgs(['--dev', '--port', '9090']), {
    dev: true,
    host: '127.0.0.1',
    port: 9090,
  });
});

test('dashboard server rejects non-loopback host', () => {
  assert.throws(() => parseServerArgs(['--host', '0.0.0.0']), /127\.0\.0\.1/);
  assert.throws(() => startServer({ host: '0.0.0.0', dev: true, requireDist: false }), /127\.0\.0\.1/);
});

test('dashboard health route responds in dev mode', async () => {
  const app = createApp({ dev: true });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, mode: 'dev' });
  await closeServer(server);
});

test('dashboard prod mode requires built client dist', async () => {
  const distDir = mkdtempSync(join(tmpdir(), 'hopper-dashboard-dist-'));
  assert.throws(
    () => startServer({ distDir, port: 7777, requireDist: true }),
    /npm run dashboard:build/,
  );
});

test('dashboard workspace discovery rejects structurally invalid explicit HOPPER_DIR without fallback', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-dashboard-workspace-'));
  const workspace = join(tmp, 'workspace');
  const cwd = join(workspace, 'nested');
  const fileOverride = join(tmp, 'not-a-directory');
  const missingHandoffs = join(tmp, 'missing-handoffs');
  const cacheLike = join(tmp, '.hopper');
  const previous = process.env.HOPPER_DIR;
  mkdirSync(join(workspace, '.hopper', 'handoffs'), { recursive: true });
  mkdirSync(cwd, { recursive: true });
  writeFileSync(fileOverride, 'not a workspace', 'utf-8');
  mkdirSync(missingHandoffs);
  mkdirSync(cacheLike);
  try {
    for (const override of [fileOverride, missingHandoffs, cacheLike]) {
      process.env.HOPPER_DIR = override;
      assert.equal(findHopperDir(cwd), null, `${override}: must not ancestor-fallback`);
    }
  } finally {
    if (previous === undefined) delete process.env.HOPPER_DIR;
    else process.env.HOPPER_DIR = previous;
    rmSync(resolve(tmp), { recursive: true, force: true });
  }
});

test('dashboard workspace validation fails closed when stat races or is denied', () => {
  const calls = [];
  const fsOps = {
    existsSync(path) { calls.push(['exists', path]); return true; },
    statSync(path) {
      calls.push(['stat', path]);
      if (calls.filter(([kind]) => kind === 'stat').length === 1) return { isDirectory: () => true };
      throw Object.assign(new Error('simulated handoffs permission failure'), { code: 'EACCES' });
    },
  };
  assert.equal(isHopperWorkspace('volatile-workspace', fsOps), false);
  assert.equal(calls.filter(([kind]) => kind === 'stat').length, 2, 'validation intentionally uses statSync and follows symlinks');
});
