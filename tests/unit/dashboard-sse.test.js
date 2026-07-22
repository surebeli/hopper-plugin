import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import { createApp, startServer } from '../../dashboard/server/index.js';
import { createSseHub } from '../../dashboard/server/events/sse.js';
import { createWatcher, mapFileEvent } from '../../dashboard/server/events/watcher.js';

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

test('SSE hub removes and ends a client on its first backpressured write', async () => {
  const hub = createSseHub({ heartbeatMs: 5 });
  const slow = fakeRes();
  const writes = [];
  slow.write = (chunk) => {
    writes.push(chunk);
    return false;
  };

  hub.add('queue', slow);
  assert.equal(writes.length, 1);
  assert.equal(hub.size('queue'), 0);
  assert.equal(slow.ended, true);
  assert.equal(slow.listenerCount('close'), 0);
  assert.equal(slow.listenerCount('error'), 0);

  hub.publish('queue', 'queue', { changed: true });
  assert.equal(writes.length, 1, 'removed client must not receive later events');
  await new Promise((resolveWait) => setTimeout(resolveWait, 15));
  assert.equal(writes.length, 1, 'removed client must not receive later heartbeats');
  hub.close();
  assert.equal(writes.length, 1, 'removed client must not receive close-time writes');
});

test('dashboard exposes only six closed SSE subscription routes', async () => {
  const app = createApp({ dev: true, sseHub: createSseHub({ heartbeatMs: 0 }) });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolveListen) => server.once('listening', resolveListen));
  const { port } = server.address();
  const paths = ['/events/queue', '/events/task/T-1', '/events/progress/T-1', '/events/cost', '/events/agents', '/events/liveness'];

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
    const logController = new AbortController();
    try {
      const logResponse = await fetch(`http://127.0.0.1:${port}/events/log/T-1`, { signal: logController.signal });
      assert.equal(logResponse.status, 404);
    } finally {
      logController.abort();
    }
  } finally {
    await closeServer(server);
    app.locals.sseHub.close();
  }
});

test('progress SSE route streams only closed event arrays to a client subscriber', async () => {
  const hub = createSseHub({ heartbeatMs: 0 });
  const app = createApp({ dev: true, sseHub: hub });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolveListen) => server.once('listening', resolveListen));
  const { port } = server.address();
  const controller = new AbortController();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/events/progress/T-PROG`, { signal: controller.signal });
    const reader = response.body.getReader();
    let text = '';
    while (!text.includes('event: connected')) {
      text += new TextDecoder().decode((await reader.read()).value);
    }
    hub.publish('progress/T-PROG', 'progress', {
      events: [{ seq: 1, phase: 'running', kind: 'progress', terminal: false, status: 'unknown' }],
    });
    while (!text.includes('\nevent: progress\n')) {
      text += new TextDecoder().decode((await reader.read()).value);
    }
    const json = text.split('\nevent: progress\n')[1].match(/data: (.*)\n/)[1];
    assert.deepEqual(JSON.parse(json), {
      events: [{ seq: 1, phase: 'running', kind: 'progress', terminal: false, status: 'unknown' }],
    });
  } finally {
    controller.abort();
    await closeServer(server);
    hub.close();
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

test('watcher maps progress logs and ignores output logs', () => {
  const hopperDir = 'F:\\repo\\.hopper';
  const progress = mapFileEvent(hopperDir, 'change', join(hopperDir, 'handoffs', 'T-PROG-progress.log'));
  const output = mapFileEvent(hopperDir, 'change', join(hopperDir, 'handoffs', 'T-PROG-output.log'));

  assert.equal(progress.channel, 'progress/T-PROG');
  assert.equal(progress.event, 'progress');
  assert.equal(progress.payload.taskId, 'T-PROG');
  assert.equal(output, null);
});

test('watcher publishes only closed progress event fields from a dedicated tailer', async () => {
  const hopperDir = 'F:\\repo\\.hopper';
  const events = [];
  const mock = createMockWatch();
  const progressTailer = {
    readNew(id) {
      assert.equal(id, 'T-PROG');
      return {
        taskId: id,
        offset: 0,
        nextOffset: 96,
        chunk: [
          '{"seq":1,"task_id":"T-PROG","vendor":"codex","phase":"running","kind":"progress","terminal":false,"status":"in-progress","message":"RAW_PROGRESS_PRIVATE C:\\\\PRIVATE\\\\progress.log sk-private-token","source":"runner","exit_code":99,"duration_ms":42}',
          '{"seq":null,"phase":"running","kind":"progress","terminal":false,"status":"in-progress"}',
          '{"phase":"running","kind":"progress","terminal":false,"status":"in-progress"}',
          '{"seq":1.5,"phase":"running","kind":"progress","terminal":false,"status":"in-progress"}',
          '{"seq":-1,"phase":"running","kind":"progress","terminal":false,"status":"in-progress"}',
          '{"seq":9007199254740992,"phase":"running","kind":"progress","terminal":false,"status":"in-progress"}',
          'not json',
          '{"seq":2,"task_id":"T-PROG","vendor":"codex","phase":"done","kind":"terminal","terminal":true,"status":"done","message":"RAW_TERMINAL_PRIVATE","source":"runner","signal":"SIGPRIVATE"}',
          '',
        ].join('\n'),
      };
    },
  };
  const watcher = createWatcher({
    hopperDir,
    hub: { publish: (channel, event, payload) => events.push({ channel, event, payload }) },
    livenessIntervalMs: 0,
    progressTailer,
    watch: mock.watch,
  });

  mock.watcher.emit('all', 'change', join(hopperDir, 'handoffs', 'T-PROG-progress.log'));

  assert.equal(events.length, 1);
  assert.equal(events[0].channel, 'progress/T-PROG');
  assert.equal(events[0].event, 'progress');
  assert.deepEqual(events[0].payload, {
    events: [
      { seq: 1, phase: 'running', kind: 'progress', terminal: false, status: 'in-progress' },
      { seq: 2, phase: 'done', kind: 'terminal', terminal: true, status: 'done' },
    ],
  });
  assert.doesNotMatch(JSON.stringify(events[0]), /RAW_|PRIVATE|sk-private|message|task_id|vendor|source|exit_code|duration_ms|signal|path|offset/);
  await watcher.close();
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
