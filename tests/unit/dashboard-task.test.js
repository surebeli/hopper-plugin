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

test('TaskDetailPanel renders 13 frontmatter fields with missing-value fallback', async () => {
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

  assert.equal(frontmatterFields.length, 13);
  for (const field of frontmatterFields) assert.match(html, new RegExp(field));
  assert.match(html, /T-WEB-04/);
  assert.match(html, /2026-05-22T01:00:00\+08:00/);
  assert.match(html, /—/);
  assert.doesNotMatch(html, /undefined|null/);
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
