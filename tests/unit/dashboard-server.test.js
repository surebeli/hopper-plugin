import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp, parseServerArgs, startServer } from '../../dashboard/server/index.js';

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
