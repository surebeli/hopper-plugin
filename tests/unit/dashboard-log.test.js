import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ansiToHtml, createAnsiState } from '../../dashboard/client/src/lib/ansi.ts';
import { createApp } from '../../dashboard/server/index.js';
import { createLogTailer, readLogChunk } from '../../dashboard/server/lib/tail.js';

function makeHopper() {
  const root = mkdtempSync(join(tmpdir(), 'hopper-dashboard-log-'));
  const hopperDir = join(root, '.hopper');
  mkdirSync(join(hopperDir, 'handoffs'), { recursive: true });
  return hopperDir;
}

function closeServer(server) {
  return new Promise((resolveClose) => server.close(resolveClose));
}

test('readLogChunk reads only bytes after offset', () => {
  const hopperDir = makeHopper();
  writeFileSync(join(hopperDir, 'handoffs', 'T-LOG-output.log'), 'hello\nworld\n');

  const first = readLogChunk({ hopperDir, id: 'T-LOG', offset: 0 });
  const second = readLogChunk({ hopperDir, id: 'T-LOG', offset: first.nextOffset });
  appendFileSync(join(hopperDir, 'handoffs', 'T-LOG-output.log'), 'again\n');
  const third = readLogChunk({ hopperDir, id: 'T-LOG', offset: first.nextOffset });

  assert.equal(first.chunk, 'hello\nworld\n');
  assert.equal(second.chunk, '');
  assert.equal(third.chunk, 'again\n');
  assert.equal(third.offset, first.nextOffset);
});

test('log tailer readNew advances offset without duplicates', () => {
  const hopperDir = makeHopper();
  const logPath = join(hopperDir, 'handoffs', 'T-TAIL-output.log');
  const tailer = createLogTailer({ hopperDir });
  writeFileSync(logPath, 'one\n');

  assert.equal(tailer.readNew('T-TAIL').chunk, 'one\n');
  assert.equal(tailer.readNew('T-TAIL').chunk, '');
  appendFileSync(logPath, 'two\n');
  assert.equal(tailer.readNew('T-TAIL').chunk, 'two\n');
});

test('SSE log route honors reconnect offset', async () => {
  const hopperDir = makeHopper();
  writeFileSync(join(hopperDir, 'handoffs', 'T-SSE-output.log'), 'alpha\nbeta\n');
  const app = createApp({ dev: true, hopperDir });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolveListen) => server.once('listening', resolveListen));
  const { port } = server.address();

  try {
    const first = await readFirstLogEvent(port, '/events/log/T-SSE?offset=0');
    const second = await readFirstLogEvent(port, `/events/log/T-SSE?offset=${first.nextOffset}`);
    assert.equal(first.chunk, 'alpha\nbeta\n');
    assert.equal(second.chunk, '');
    appendFileSync(join(hopperDir, 'handoffs', 'T-SSE-output.log'), 'gamma\n');
    const third = await readFirstLogEvent(port, `/events/log/T-SSE?offset=${first.nextOffset}`);
    assert.equal(third.chunk, 'gamma\n');
  } finally {
    await closeServer(server);
    app.locals.sseHub.close();
  }
});

test('ansiToHtml maps minimal 16-color foregrounds and preserves state', () => {
  const state = createAnsiState();
  const red = ansiToHtml('\x1b[31mred ', state);
  const stillRed = ansiToHtml('tail\x1b[0m plain \x1b[32mgreen\x1b[33myellow', state);

  assert.match(red, /text-destructive/);
  assert.match(stillRed, /text-destructive[^>]*>tail/);
  assert.match(stillRed, /plain/);
  assert.match(stillRed, /text-primary[^>]*>green/);
  assert.match(stillRed, /text-warning[^>]*>yellow/);
});

async function readFirstLogEvent(port, path) {
  const controller = new AbortController();
  const response = await fetch(`http://127.0.0.1:${port}${path}`, { signal: controller.signal });
  const reader = response.body.getReader();
  let text = '';
  while (!text.includes('\nevent: log\n')) {
    text += new TextDecoder().decode((await reader.read()).value);
  }
  controller.abort();
  const json = text.split('\nevent: log\n')[1].match(/data: (.*)\n/)[1];
  return JSON.parse(json);
}
