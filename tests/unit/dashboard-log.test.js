import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { appendFileSync, mkdirSync, mkdtempSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ansiToHtml, createAnsiState } from '../../dashboard/client/src/lib/ansi.ts';
import { createApp } from '../../dashboard/server/index.js';
import { createLogTailer, MAX_INITIAL_CHUNK, readLogChunk } from '../../dashboard/server/lib/tail.js';

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

test('readLogChunk caps initial read to 1MB tail', () => {
  const hopperDir = makeHopper();
  const logPath = join(hopperDir, 'handoffs', 'T-CAP-output.log');
  const content = `${'a'.repeat(MAX_INITIAL_CHUNK + 128)}tail`;
  writeFileSync(logPath, content);

  const chunk = readLogChunk({ hopperDir, id: 'T-CAP', offset: 0 });

  assert.equal(chunk.chunk.length, MAX_INITIAL_CHUNK);
  assert.equal(chunk.offset, content.length - MAX_INITIAL_CHUNK);
  assert.equal(chunk.nextOffset, content.length);
  assert.equal(chunk.chunk.endsWith('tail'), true);
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

test('log tailer resets offset when a file is truncated mid-stream', () => {
  const hopperDir = makeHopper();
  const logPath = join(hopperDir, 'handoffs', 'T-TRUNC-output.log');
  const tailer = createLogTailer({ hopperDir });
  writeFileSync(logPath, 'first\nsecond\n');

  assert.equal(tailer.readNew('T-TRUNC').chunk, 'first\nsecond\n');
  writeFileSync(logPath, 'new\n');
  assert.equal(tailer.readNew('T-TRUNC').chunk, 'new\n');
  assert.equal(tailer.readNew('T-TRUNC').chunk, '');
});

test('log tailer resets offset when the current file rotates', () => {
  const hopperDir = makeHopper();
  const logPath = join(hopperDir, 'handoffs', 'T-ROT-output.log');
  const tailer = createLogTailer({ hopperDir });
  writeFileSync(logPath, 'old\n');

  assert.equal(tailer.readNew('T-ROT').chunk, 'old\n');
  renameSync(logPath, `${logPath}.1`);
  writeFileSync(logPath, 'new\n');

  assert.equal(tailer.readNew('T-ROT').chunk, 'new\n');
  assert.equal(tailer.readNew('T-ROT').chunk, '');
});

test('log tailer cold-start after rotate reads only the current file', () => {
  const hopperDir = makeHopper();
  const logPath = join(hopperDir, 'handoffs', 'T-COLD-output.log');
  writeFileSync(`${logPath}.1`, 'rotated\n');
  writeFileSync(logPath, 'current\n');

  const tailer = createLogTailer({ hopperDir });
  assert.equal(tailer.readNew('T-COLD').chunk, 'current\n');
});

test('dashboard does not expose raw log SSE', async () => {
  const hopperDir = makeHopper();
  writeFileSync(join(hopperDir, 'handoffs', 'T-SSE-output.log'), 'alpha\nbeta\n');
  const app = createApp({ dev: true, hopperDir });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolveListen) => server.once('listening', resolveListen));
  const { port } = server.address();
  const controller = new AbortController();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/events/log/T-SSE?offset=0`, { signal: controller.signal });
    assert.equal(response.status, 404);
  } finally {
    controller.abort();
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
