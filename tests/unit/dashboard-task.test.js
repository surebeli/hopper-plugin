import { after, before, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer as createViteServer } from 'vite';
import { createApp } from '../../dashboard/server/index.js';

let vite;

function closeServer(server) {
  return new Promise((resolveClose) => server.close(resolveClose));
}

before(async () => {
  vite = await createViteServer({
    configFile: resolve('dashboard/client/vite.config.ts'),
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true },
  });
});

after(async () => {
  await vite.close();
});

test('dashboard task route returns frontmatter and body', async () => {
  const root = mkdtempSync(join(tmpdir(), 'hopper-dashboard-task-'));
  const handoffs = join(root, '.hopper', 'handoffs');
  mkdirSync(handoffs, { recursive: true });
  writeFileSync(
    join(handoffs, 'T-WEB-04-output.md'),
    [
      '---',
      'task_id: T-WEB-04',
      'adapter: codex',
      'status: done',
      'pid: 123',
      '---',
      '# Output',
      '',
      '| A | B |',
      '|---|---|',
      '| 1 | 2 |',
    ].join('\n'),
  );

  const app = createApp({ dev: true, hopperDir: join(root, '.hopper') });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolveListen) => server.once('listening', resolveListen));
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/task/T-WEB-04`);
    const json = await response.json();
    assert.equal(response.status, 200);
    assert.equal(json.id, 'T-WEB-04');
    assert.equal(json.frontmatter.task_id, 'T-WEB-04');
    assert.equal(json.frontmatter.pid, 123);
    assert.match(json.body, /\| A \| B \|/);
  } finally {
    await closeServer(server);
  }
});

test('dashboard task progress route returns limited progress events in append order', async () => {
  const root = mkdtempSync(join(tmpdir(), 'hopper-dashboard-task-progress-'));
  const handoffs = join(root, '.hopper', 'handoffs');
  mkdirSync(handoffs, { recursive: true });
  writeFileSync(join(handoffs, 'T-PROG-progress.log'), [
    '{"seq":1,"task_id":"T-PROG","message":"one"}',
    'malformed json',
    '{"seq":2,"task_id":"T-PROG","message":"two"}',
    '{"seq":3,"task_id":"T-PROG","message":"three"}',
    '',
  ].join('\n'));

  const app = createApp({ dev: true, hopperDir: join(root, '.hopper') });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolveListen) => server.once('listening', resolveListen));
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/task/T-PROG/progress?limit=2`);
    const json = await response.json();
    assert.equal(response.status, 200);
    assert.equal(json.id, 'T-PROG');
    assert.deepEqual(json.events.map((event) => event.seq), [2, 3]);
  } finally {
    await closeServer(server);
  }
});

test('dashboard task progress route rejects unsafe task ids', async () => {
  const root = mkdtempSync(join(tmpdir(), 'hopper-dashboard-task-progress-unsafe-'));
  mkdirSync(join(root, '.hopper', 'handoffs'), { recursive: true });
  const app = createApp({ dev: true, hopperDir: join(root, '.hopper') });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolveListen) => server.once('listening', resolveListen));
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/task/BAD..ID/progress`);
    assert.equal(response.status, 400);
  } finally {
    await closeServer(server);
  }
});

test('dashboard task progress route returns 404 when progress log is absent', async () => {
  const root = mkdtempSync(join(tmpdir(), 'hopper-dashboard-task-progress-missing-'));
  mkdirSync(join(root, '.hopper', 'handoffs'), { recursive: true });
  const app = createApp({ dev: true, hopperDir: join(root, '.hopper') });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolveListen) => server.once('listening', resolveListen));
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/task/T-MISSING/progress`);
    assert.equal(response.status, 404);
  } finally {
    await closeServer(server);
  }
});

test('TaskDetailPanel renders 21 frontmatter fields with missing-value fallback', async () => {
  const { FrontmatterTable, frontmatterFields } = await vite.ssrLoadModule('/src/components/TaskDrawer.tsx');
  const detail = {
    id: 'T-WEB-04',
    frontmatter: {
      task_id: 'T-WEB-04',
      adapter: 'codex',
      status: 'done',
      pid: 123,
      start_time: '2026-05-22T01:00:00+08:00',
      exit_code: 0,
      duration_ms: 42,
      mode: 'background',
      log: './T-WEB-04-output.log',
      started_by_pid: 456,
    },
    body: '# Done',
  };
  const html = renderToStaticMarkup(React.createElement(FrontmatterTable, { frontmatter: detail.frontmatter }));

  assert.equal(frontmatterFields.length, 21);
  for (const field of frontmatterFields) assert.match(html, new RegExp(field));
  assert.match(html, /T-WEB-04/);
  assert.match(html, /2026-05-22T01:00:00\+08:00/);
  assert.match(html, /—/);
  assert.doesNotMatch(html, /undefined|null/);
});

test('baseFrontmatterFields declares v1 progress fields in stable order', async () => {
  const { baseFrontmatterFields } = await vite.ssrLoadModule('/src/components/TaskDrawer.tsx');
  assert.deepEqual(baseFrontmatterFields, [
    'task_id', 'adapter', 'status', 'phase',
    'pid', 'start_time', 'end_time', 'exit_code',
    'duration_ms', 'mode', 'host_native', 'session_id',
    'log', 'progress_log', 'raw_log',
    'last_progress', 'last_progress_at', 'progress_seq',
    'terminal_event_emitted', 'vendor_session_id',
    'started_by_pid',
  ]);
});

test('TaskStatusStrip renders phase, last progress, terminal flag, and missing fallback', async () => {
  const { TaskStatusStrip } = await vite.ssrLoadModule('/src/components/TaskDrawer.tsx');
  const html = renderToStaticMarkup(React.createElement(TaskStatusStrip, {
    frontmatter: {
      status: 'done',
      phase: 'done',
      last_progress: 'Task completed successfully.',
      last_progress_at: new Date(Date.now() - 2000).toISOString(),
      terminal_event_emitted: true,
    },
  }));
  const fallback = renderToStaticMarkup(React.createElement(TaskStatusStrip, { frontmatter: {} }));

  assert.match(html, /Status/);
  assert.match(html, /done/);
  assert.match(html, /Phase/);
  assert.match(html, /Task completed successfully\./);
  assert.match(html, /Terminal/);
  assert.match(html, /yes/);
  assert.match(fallback, /—/);
  assert.doesNotMatch(fallback, /undefined|null/);
});

test('TaskDetailPanel includes Progress tab between Output and Live log', async () => {
  const { TaskDetailPanel } = await vite.ssrLoadModule('/src/components/TaskDrawer.tsx');
  const html = renderToStaticMarkup(React.createElement(TaskDetailPanel, {
    detail: { id: 'T-PROG', frontmatter: {}, body: '# Done' },
    id: 'T-PROG',
  }));

  assert.match(html, /Output/);
  assert.match(html, /Progress/);
  assert.match(html, /Live log/);
  assert.ok(html.indexOf('Output') < html.indexOf('Progress'));
  assert.ok(html.indexOf('Progress') < html.indexOf('Live log'));
});

test('Progress timeline rows limit to five events and pin terminal event first', async () => {
  const { ProgressTimelineRows } = await vite.ssrLoadModule('/src/components/ProgressTimeline.tsx');
  const events = [
    progressEvent(1, 'starting', 'lifecycle', 'queued'),
    progressEvent(2, 'running', 'lifecycle', 'read files'),
    progressEvent(3, 'running', 'finding', 'found path'),
    progressEvent(4, 'running', 'command', 'ran tests'),
    progressEvent(5, 'running', 'file', 'edited file'),
    progressEvent(6, 'done', 'terminal', 'Task completed successfully.', true, { status: 'done', exit_code: 0, duration_ms: 42 }),
  ];
  const html = renderToStaticMarkup(React.createElement(ProgressTimelineRows, { events }));

  assert.equal((html.match(/data-progress-row=/g) || []).length, 5);
  assert.ok(html.indexOf('#6') < html.indexOf('#5'));
  assert.match(html, /done\/terminal/);
  assert.match(html, /status=done/);
  assert.match(html, /exit_code=0/);
  assert.match(html, /duration_ms=42/);
});

test('Progress timeline rows truncate long messages and keep full title', async () => {
  const { ProgressTimelineRows } = await vite.ssrLoadModule('/src/components/ProgressTimeline.tsx');
  const longMessage = 'x'.repeat(160);
  const html = renderToStaticMarkup(React.createElement(ProgressTimelineRows, {
    events: [progressEvent(1, 'running', 'lifecycle', longMessage)],
  }));

  assert.match(html, new RegExp(`title="${longMessage}"`));
  assert.doesNotMatch(html, new RegExp(`>${longMessage}<`));
});

test('FrontmatterTable renders sidequest dynamic fields after base fields', async () => {
  const { FrontmatterTable, effectiveFrontmatterFields } = await vite.ssrLoadModule('/src/components/TaskDrawer.tsx');
  const frontmatter = {
    task_id: 'T-WEB-08',
    status: 'done',
    spec_version: '2.1.3',
    review_status: 'pending',
  };
  const fields = effectiveFrontmatterFields(frontmatter);
  const html = renderToStaticMarkup(React.createElement(FrontmatterTable, { frontmatter }));

  assert.equal(fields.includes('spec_version'), true);
  assert.equal(fields.includes('review_status'), true);
  assert.equal(fields.indexOf('spec_version') > fields.indexOf('started_by_pid'), true);
  assert.match(html, /spec_version/);
  assert.match(html, /review_status/);
  assert.match(html, /2\.1\.3/);
});

function progressEvent(seq, phase, kind, message, terminal = false, extra = {}) {
  return {
    seq,
    ts: new Date(2026, 4, 22, 12, 0, seq).toISOString(),
    task_id: 'T-PROG',
    vendor: 'codex',
    phase,
    kind,
    message,
    source: 'runner',
    terminal,
    ...extra,
  };
}

test('LiveLog reconnect delay uses exponential backoff with cap', async () => {
  const { logReconnectDelay } = await vite.ssrLoadModule('/src/components/LiveLog.tsx');
  assert.equal(logReconnectDelay(0), 500);
  assert.equal(logReconnectDelay(1), 1000);
  assert.equal(logReconnectDelay(6), 30000);
  assert.equal(logReconnectDelay(20), 30000);
});

test('probeErrorMessage formats vendor mutation failures', async () => {
  const { probeErrorMessage } = await vite.ssrLoadModule('/src/routes/VendorsRoute.tsx');
  assert.equal(probeErrorMessage(new Error('network down'), 'codex'), 'probe codex failed: network down');
});

test('ErrorBoundary exposes dashboard error copy', async () => {
  const { ErrorBoundary, errorDialogCopy } = await vite.ssrLoadModule('/src/components/ErrorBoundary.tsx');
  const state = ErrorBoundary.getDerivedStateFromError(new Error('boom'));
  const copy = errorDialogCopy(new Error('boom'));

  assert.equal(state.error.message, 'boom');
  assert.equal(copy.title, 'Dashboard error');
  assert.equal(copy.message, 'boom');
  assert.equal(copy.action, 'Reload page');
});

test('renderMarkdown outputs table, code line numbers, list, and link markup', async () => {
  const { renderMarkdown } = await vite.ssrLoadModule('/src/components/TaskDrawer.tsx');
  const html = renderMarkdown([
    '| A | B |',
    '|---|---|',
    '| 1 | 2 |',
    '',
    '- item',
    '',
    '[link](https://example.com)',
    '',
    '```js',
    'const value = 1;',
    '```',
  ].join('\n'));

  assert.match(html, /<table>/);
  assert.match(html, /<ul>/);
  assert.match(html, /href="https:\/\/example.com"/);
  assert.match(html, /hljs-line-number/);
  assert.match(html, /const/);
});
