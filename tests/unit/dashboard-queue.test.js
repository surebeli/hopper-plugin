import { after, before, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Route, Routes } from 'react-router-dom';
import { StaticRouter } from 'react-router-dom/server.js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createServer as createViteServer } from 'vite';
import { createApp } from '../../dashboard/server/index.js';

let vite;

function closeServer(server) {
  return new Promise((resolveClose) => server.close(resolveClose));
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

function renderWithProviders(element, route = '/', path = '/*') {
  return renderToStaticMarkup(
    React.createElement(
      QueryClientProvider,
      { client: makeQueryClient() },
      React.createElement(
        StaticRouter,
        { location: route },
        React.createElement(Routes, null, React.createElement(Route, { path, element })),
      ),
    ),
  );
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

test('dashboard queue route returns parsed queue rows', async () => {
  const root = mkdtempSync(join(tmpdir(), 'hopper-dashboard-queue-'));
  const hopperDir = join(root, '.hopper');
  mkdirSync(hopperDir);
  writeFileSync(
    join(hopperDir, 'queue.md'),
    [
      '| ID | Task-type | Status | Depends | Priority | Brief | Vendor |',
      '|----|-----------|--------|---------|----------|-------|--------|',
      '| T-WEB-A | code-impl | pending | | high | Build table | codex |',
      '| T-WEB-B | code-review-adversarial | done | T-WEB-A | normal | Review table | claude |',
    ].join('\n'),
  );

  const app = createApp({ dev: true, hopperDir });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolveListen) => server.once('listening', resolveListen));
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/queue`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), [
      {
        id: 'T-WEB-A',
        taskType: 'code-impl',
        status: 'pending',
        depends: [],
        priority: 'high',
        brief: 'Build table',
        vendor: 'codex',
      },
      {
        id: 'T-WEB-B',
        taskType: 'code-review-adversarial',
        status: 'done',
        depends: ['T-WEB-A'],
        priority: 'normal',
        brief: 'Review table',
        vendor: 'claude',
      },
    ]);
  } finally {
    await closeServer(server);
  }
});

test('QueueTable renders fixed-height rows and selected primary bar', async () => {
  const { QueueTable } = await vite.ssrLoadModule('/src/components/QueueTable.tsx');
  const rows = [
    { id: 'T-WEB-A', taskType: 'code-impl', status: 'pending', depends: [], priority: 'normal', brief: 'Build table', vendor: 'codex' },
    { id: 'T-WEB-B', taskType: 'code-review-adversarial', status: 'in-progress', depends: [], priority: 'high', brief: 'Review table', vendor: null },
  ];
  const html = renderWithProviders(React.createElement(QueueTable, { rows }), '/task/T-WEB-A', '/task/:id');

  assert.match(html, /T-WEB-A/);
  assert.match(html, /code-review-adversarial/);
  assert.match(html, /hover:bg-muted\/40/);
  assert.match(html, /border-l-primary/);
  assert.match(html, /h-8/);
  assert.match(html, /ID/);
  assert.match(html, /Vendor/);
});

test('StatusPill maps five statuses to glyph and color classes', async () => {
  const { StatusPill } = await vite.ssrLoadModule('/src/components/StatusPill.tsx');
  const html = renderToStaticMarkup(
    React.createElement(
      React.Fragment,
      null,
      ...['pending', 'in-progress', 'done', 'failed', 'removed'].map((status) =>
        React.createElement(StatusPill, { key: status, status }),
      ),
    ),
  );

  assert.match(html, /data-status="pending"/);
  assert.match(html, /data-status="in-progress"/);
  assert.match(html, /fill-primary/);
  assert.match(html, /data-status="done"/);
  assert.match(html, /data-status="failed"/);
  assert.match(html, /text-destructive/);
  assert.match(html, /data-status="removed"/);
  assert.match(html, /line-through/);
});
