import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import { createApp, startServer } from '../../dashboard/server/index.js';
import { createSseHub } from '../../dashboard/server/events/sse.js';
import { createWatcher } from '../../dashboard/server/events/watcher.js';

function fakeRes() {
  const res = new EventEmitter();
  res.headers = {};
  res.body = '';
  res.ended = false;
  res.setHeader = (key, value) => { res.headers[key] = value; };
  res.flushHeaders = () => {};
  res.write = (chunk) => { res.body += chunk; };
  res.end = () => { res.ended = true; };
  return res;
}

function createMockWatch() {
  const watcher = new EventEmitter();
  watcher.paths = null;
  watcher.options = null;
  watcher.closed = false;
  watcher.close = async () => { watcher.closed = true; };
  return {
    watcher,
    watch: (paths, options) => {
      watcher.paths = paths;
      watcher.options = options;
      return watcher;
    },
  };
}

function closeServer(server) {
  return new Promise((resolveClose) => server.close(resolveClose));
}

test('SSE hub supports retry, multi-client publish, and close', () => {
  const hub = createSseHub({ heartbeatMs: 0 });
  const first = fakeRes();
  const second = fakeRes();

  hub.add('queue', first);
  hub.add('queue', second);
  hub.publish('queue', 'queue', { changed: true });

  assert.equal(first.headers['Content-Type'], 'text/event-stream');
  assert.match(first.body, /retry: 1000/);
  assert.match(first.body, /event: queue/);
  assert.match(second.body, /"changed":true/);
  assert.equal(hub.size('queue'), 2);
  hub.close();
  assert.equal(first.ended, true);
  assert.equal(second.ended, true);
});

test('dashboard exposes six SSE subscription routes', async () => {
  const app = createApp({ dev: true, sseHub: createSseHub({ heartbeatMs: 0 }) });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolveListen) => server.once('listening', resolveListen));
  const { port } = server.address();
  const paths = ['/events/queue', '/events/task/T-1', '/events/log/T-1', '/events/cost', '/events/agents', '/events/liveness'];

  try {
    for (const path of paths) {
      const controller = new AbortController();
      const response = await fetch(`http://127.0.0.1:${port}${path}`, { signal: controller.signal });
      const text = new TextDecoder().decode((await response.body.getReader().read()).value);
      controller.abort();
      assert.equal(response.status, 200);
      assert.match(text, /event: connected/);
      assert.match(text, /retry: 1000/);
    }
  } finally {
    await closeServer(server);
    app.locals.sseHub.close();
  }
});

test('watcher maps chokidar events to SSE channels', async () => {
  const hopperDir = 'F:\\repo\\.hopper';
  const events = [];
  const mock = createMockWatch();
  const watcher = createWatcher({
    hopperDir,
    hub: { publish: (channel, event, payload) => events.push({ channel, event, payload }) },
    livenessIntervalMs: 0,
    watch: mock.watch,
  });

  mock.watcher.emit('all', 'change', join(hopperDir, 'queue.md'));
  mock.watcher.emit('all', 'change', join(hopperDir, 'handoffs', 'T-WEB-03-output.md'));
  mock.watcher.emit('all', 'change', join(hopperDir, 'handoffs', 'T-WEB-03-output.log'));
  mock.watcher.emit('all', 'change', join(hopperDir, 'handoffs', 'T-WEB-04-output.md'));
  mock.watcher.emit('all', 'change', join(hopperDir, 'handoffs', 'T-WEB-04-REVIEW-claude-output.md'));
  mock.watcher.emit('all', 'change', join(hopperDir, 'handoffs', 'T-WEB-04-leader-feedback.md'));
  mock.watcher.emit('all', 'change', join(hopperDir, 'COST-LOG.md'));
  mock.watcher.emit('all', 'change', join(hopperDir, 'AGENTS.md'));

  assert.deepEqual(events.map((item) => item.channel), [
    'queue',
    'task/T-WEB-03',
    'log/T-WEB-03',
    'task/T-WEB-04',
    'task/T-WEB-04',
    'task/T-WEB-04',
    'cost',
    'agents',
  ]);
  assert.equal(events[0].event, 'queue');
  assert.equal(events[1].payload.path, 'handoffs/T-WEB-03-output.md');
  assert.equal(mock.watcher.options.ignoreInitial, true);
  await watcher.close();
  assert.equal(mock.watcher.closed, true);
});

test('startServer close shuts down watcher and SSE hub', async () => {
  let watcherClosed = false;
  const started = await startServer({
    dev: true,
    port: 0,
    requireDist: false,
    watchEvents: true,
    hopperDir: 'F:\\repo\\.hopper',
    watcherFactory: () => ({ close: async () => { watcherClosed = true; } }),
  });

  await started.close();
  assert.equal(watcherClosed, true);
  assert.equal(started.app.locals.sseHub.size(), 0);
});
