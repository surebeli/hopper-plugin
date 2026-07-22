import { after, before, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient } from '@tanstack/react-query';
import { createServer as createViteServer } from 'vite';
import { createApp } from '../../dashboard/server/index.js';
import { readTaskDetail } from '../../dashboard/server/routes/task.js';

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

function assertNoRawTaskData(value, path = '$') {
  const forbidden = [
    'RAW_BODY_PRIVATE', 'RAW_PROGRESS_PRIVATE', 'RAW_LOG_PRIVATE', 'RAW_SIDECAR_PRIVATE',
    'C:\\PRIVATE\\handoffs\\result.log', 'sk-private-task-token', 'PRIVATE_PROVIDER',
  ];
  if (typeof value === 'string') {
    for (const sentinel of forbidden) assert.equal(value.includes(sentinel), false, `${path} leaked ${sentinel}`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoRawTaskData(item, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      assert.equal(['_body', 'body', 'frontmatter', 'log', 'progress_log', 'raw_log', 'message', 'vendor_session_id'].includes(key), false, `${path}.${key} is not public task data`);
      assertNoRawTaskData(nested, `${path}.${key}`);
    }
  }
}

test('dashboard task route projects canonical attestation data without frontmatter or body escape', async () => {
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
       'phase: done',
       'terminal_event_emitted: true',
       'requested_selector: safe-requested',
       'effective_selector: safe-effective',
       'effective_selector_source: user-argv',
       'selector_kind: concrete',
       'observed_models_json: "[\\"safe-observed\\"]"',
       'resolution_status: exact',
       'resolution_detail: concrete-runtime-exact',
       'catalog_source_kind: static',
       'catalog_source_label: C:\\PRIVATE\\handoffs\\result.log',
       'binary_availability: present',
       'binary_basename: codex',
       'pid: 123',
       'raw_log: C:\\PRIVATE\\handoffs\\result.log',
       'prompt: RAW_BODY_PRIVATE sk-private-task-token',
       'vendor_session_id: PRIVATE_PROVIDER',
       '---',
       '# Output RAW_BODY_PRIVATE',
      '',
      '| A | B |',
      '|---|---|',
      '| 1 | 2 |',
    ].join('\n'),
  );
  writeFileSync(join(handoffs, 'T-WEB-04-progress.log'), [
    JSON.stringify({ seq: 1, task_id: 'T-WEB-04', vendor: 'codex', phase: 'running', kind: 'progress', message: 'RAW_PROGRESS_PRIVATE', source: 'runner', terminal: false }),
    JSON.stringify({ seq: 2, task_id: 'T-WEB-04', vendor: 'codex', phase: 'done', kind: 'terminal', message: 'RAW_LOG_PRIVATE', source: 'runner', terminal: true, status: 'done' }),
  ].join('\n'));

  const hopperDir = join(root, '.hopper');
  const expected = {
    id: 'T-WEB-04',
    status: 'done',
    terminal: true,
    selector: { requested: 'safe-requested', effective: 'safe-effective', kind: 'concrete', source: 'user-argv' },
    observedModels: ['safe-observed'],
    resolution: { status: 'exact', detail: 'concrete-runtime-exact' },
    inventory: {
      binaryAvailability: 'present', binaryBasename: 'codex', sourceKind: 'static',
      sourceLabel: 'adapter-static-selectors', diagnosticCode: 'none', diagnosticState: 'none',
    },
    events: [
      { seq: 1, phase: 'running', kind: 'progress', terminal: false, status: 'unknown', adapterDiagnosticCode: 'adapter-unknown-failed' },
      { seq: 2, phase: 'done', kind: 'terminal', terminal: true, status: 'done', adapterDiagnosticCode: 'none' },
    ],
  };
  assert.deepEqual(readTaskDetail(hopperDir, 'T-WEB-04'), expected);
  assertNoRawTaskData(expected);

  const app = createApp({ dev: true, hopperDir });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolveListen) => server.once('listening', resolveListen));
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/task/T-WEB-04`);
    const json = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(json, expected);
    assertNoRawTaskData(json);
  } finally {
    await closeServer(server);
  }
});

test('dashboard task route closes hostile selector and observed-model value domains', () => {
  const root = mkdtempSync(join(tmpdir(), 'hopper-dashboard-task-identifiers-'));
  const handoffs = join(root, '.hopper', 'handoffs');
  const oversized = 'x'.repeat(256);
  const observedModels = [
    'fable',
    'deepseek-v4-pro',
    'tokenbox/deepseek-v4-pro',
    'C:\\PRIVATE\\model',
    '/home/private/model',
    'https://private.example/model',
    'sk-private-secret-token',
    `control\u0001model`,
    oversized,
  ];
  mkdirSync(handoffs, { recursive: true });
  writeFileSync(join(handoffs, 'T-IDENT-output.md'), [
    '---',
    'task_id: T-IDENT',
    'adapter: claude',
    'status: done',
    'phase: done',
    'terminal_event_emitted: true',
    'requested_selector: C:\\PRIVATE\\model',
    'effective_selector: https://private.example/model',
    'effective_selector_source: user-argv',
    'selector_kind: concrete',
    `observed_models_json: ${JSON.stringify(JSON.stringify(observedModels))}`,
    'resolution_status: exact',
    'resolution_detail: concrete-runtime-exact',
    '---',
    'PRIVATE BODY',
  ].join('\n'));

  const detail = readTaskDetail(join(root, '.hopper'), 'T-IDENT');
  assert.deepEqual(detail.selector, {
    requested: null,
    effective: null,
    kind: 'concrete',
    source: 'user-argv',
  });
  assert.deepEqual(detail.observedModels, [
    'fable',
    'deepseek-v4-pro',
    'tokenbox/deepseek-v4-pro',
  ]);
  const serialized = JSON.stringify(detail);
  for (const sentinel of [
    'C:\\PRIVATE\\model', '/home/private/model', 'https://private.example/model',
    'sk-private-secret-token', 'control\\u0001model', oversized,
  ]) {
    assert.equal(serialized.includes(sentinel), false, `task DTO leaked ${JSON.stringify(sentinel)}`);
  }
});

test('dashboard task route denies credential-shaped prefixes without blocking short slug lookalikes', () => {
  const root = mkdtempSync(join(tmpdir(), 'hopper-dashboard-task-credentials-'));
  const handoffs = join(root, '.hopper', 'handoffs');
  const tokens = [
    `ghp_${'A'.repeat(36)}`,
    `gho_${'B'.repeat(36)}`,
    `ghu_${'C'.repeat(36)}`,
    `ghs_${'D'.repeat(36)}`,
    `ghr_${'E'.repeat(36)}`,
    `github_pat_${'F'.repeat(32)}`,
    `glpat-${'G'.repeat(24)}`,
    `xapp-1-${'H'.repeat(32)}`,
    `xoxb-${'I'.repeat(32)}`,
    'sk-private-secret-token',
    `xai-${'J'.repeat(24)}`,
  ];
  const shortLookalikes = [
    'gho_model',
    'ghu-preview',
    'ghs-test',
    'ghr-dev',
    'glpat-model',
    'xapp-preview',
    'xai-model',
  ];
  mkdirSync(handoffs, { recursive: true });
  writeFileSync(join(handoffs, 'T-CREDENTIALS-output.md'), [
    '---',
    'task_id: T-CREDENTIALS',
    'adapter: claude',
    'status: done',
    'phase: done',
    `requested_selector: ${tokens[10]}`,
    `effective_selector: ${tokens[6]}`,
    'effective_selector_source: user-argv',
    'selector_kind: concrete',
    `observed_models_json: ${JSON.stringify(JSON.stringify([...tokens, ...shortLookalikes, 'fable', 'tokenbox/deepseek-v4-pro']))}`,
    '---',
    'PRIVATE BODY',
  ].join('\n'));

  const detail = readTaskDetail(join(root, '.hopper'), 'T-CREDENTIALS');
  assert.equal(detail.selector.requested, null);
  assert.equal(detail.selector.effective, null);
  assert.deepEqual(detail.observedModels, [...shortLookalikes, 'fable', 'tokenbox/deepseek-v4-pro']);
  const serialized = JSON.stringify(detail);
  for (const token of tokens) {
    assert.equal(serialized.includes(token), false, `task DTO leaked credential-shaped value ${token.slice(0, 12)}`);
  }
});

test('dashboard task route preserves exact adapter-declared non-slug knownGood models only', () => {
  const root = mkdtempSync(join(tmpdir(), 'hopper-dashboard-task-known-good-'));
  const hopperDir = join(root, '.hopper');
  const handoffs = join(hopperDir, 'handoffs');
  const claudeKnownGood = [
    'sonnet', 'opus', 'haiku', 'fable', 'opusplan', 'best', 'default', 'sonnet[1m]', 'opus[1m]',
  ];
  const agyKnownGood = [
    'Gemini 3.5 Flash (High)',
    'Gemini 3.5 Flash (Medium)',
    'Gemini 3.1 Pro (High)',
    'Gemini 3.1 Pro (Low)',
  ];
  mkdirSync(handoffs, { recursive: true });
  writeFileSync(join(handoffs, 'T-CLAUDE-KG-output.md'), [
    '---',
    'task_id: T-CLAUDE-KG',
    'adapter: claude',
    'status: done',
    'phase: done',
    'requested_selector: sonnet[1m]',
    'effective_selector: opus[1m]',
    'effective_selector_source: user-argv',
    'selector_kind: alias',
    `observed_models_json: ${JSON.stringify(JSON.stringify([
      ...claudeKnownGood,
      'Sonnet[1m]',
      'Gemini 3.5 Flash (High)',
      'Enterprise Model (Private)',
    ]))}`,
    '---',
    'PRIVATE BODY',
  ].join('\n'));
  writeFileSync(join(handoffs, 'T-AGY-KG-output.md'), [
    '---',
    'task_id: T-AGY-KG',
    'adapter: agy',
    'status: done',
    'phase: done',
    'requested_selector: Gemini 3.5 Flash (High)',
    'effective_selector: Gemini 3.5 Flash (Medium)',
    'effective_selector_source: user-argv',
    'selector_kind: concrete',
    `observed_models_json: ${JSON.stringify(JSON.stringify([
      ...agyKnownGood,
      'gemini 3.5 flash high',
      'sonnet[1m]',
      'Enterprise Model (Private)',
    ]))}`,
    '---',
    'PRIVATE BODY',
  ].join('\n'));

  const claude = readTaskDetail(hopperDir, 'T-CLAUDE-KG');
  assert.deepEqual(claude.selector, {
    requested: 'sonnet[1m]', effective: 'opus[1m]', kind: 'alias', source: 'user-argv',
  });
  assert.deepEqual(claude.observedModels, claudeKnownGood);

  const agy = readTaskDetail(hopperDir, 'T-AGY-KG');
  assert.deepEqual(agy.selector, {
    requested: 'Gemini 3.5 Flash (High)',
    effective: 'Gemini 3.5 Flash (Medium)',
    kind: 'concrete',
    source: 'user-argv',
  });
  assert.deepEqual(agy.observedModels, agyKnownGood);
});

test('dashboard task progress route returns limited progress events in append order', async () => {
  const root = mkdtempSync(join(tmpdir(), 'hopper-dashboard-task-progress-'));
  const handoffs = join(root, '.hopper', 'handoffs');
  mkdirSync(handoffs, { recursive: true });
    writeFileSync(join(handoffs, 'T-PROG-progress.log'), [
    '{"seq":1,"task_id":"T-PROG","vendor":"codex","phase":"running","kind":"progress","message":"RAW_PROGRESS_PRIVATE","source":"runner","terminal":false}',
    'malformed json',
    '{"seq":2,"task_id":"T-PROG","vendor":"codex","phase":"running","kind":"progress","message":"RAW_PROGRESS_PRIVATE","source":"runner","terminal":false}',
    '{"seq":3,"task_id":"T-PROG","vendor":"codex","phase":"done","kind":"terminal","message":"RAW_PROGRESS_PRIVATE","source":"runner","terminal":true,"status":"done"}',
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
    assertNoRawTaskData(json);
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

test('dashboard client task surfaces consume only the closed DTO', () => {
  const typesSource = readFileSync(resolve('dashboard/client/src/lib/types.ts'), 'utf8');
  const drawerSource = readFileSync(resolve('dashboard/client/src/components/TaskDrawer.tsx'), 'utf8');
  const progressSource = readFileSync(resolve('dashboard/client/src/components/ProgressTimeline.tsx'), 'utf8');
  const taskDetail = typesSource.match(/export interface TaskDetail\s*{([\s\S]*?)\n}/)?.[1] || '';
  const progressEvent = typesSource.match(/export type ProgressEvent\s*=\s*{([\s\S]*?)\n};/)?.[1] || '';
  const probeResponse = typesSource.match(/export interface ProbeResponse\s*{([\s\S]*?)\n}/)?.[1] || '';

  assert.match(taskDetail, /status:/);
  assert.match(taskDetail, /selector:/);
  assert.match(taskDetail, /observedModels:/);
  assert.match(taskDetail, /resolution:/);
  assert.match(taskDetail, /inventory:/);
  assert.match(taskDetail, /events:/);
  assert.doesNotMatch(taskDetail, /frontmatter|body|log|path/i);
  assert.deepEqual([...progressEvent.matchAll(/^\s*(\w+)\??:/gm)].map((match) => match[1]), [
    'seq', 'phase', 'kind', 'terminal', 'status', 'adapterDiagnosticCode',
  ]);
  assert.deepEqual([...probeResponse.matchAll(/^\s*(\w+)\??:/gm)].map((match) => match[1]), [
    'vendor', 'status', 'diagnosticCode', 'diagnosticState',
  ]);
  assert.doesNotMatch(drawerSource, /LiveLog|frontmatter|\.body|renderMarkdown|dangerouslySetInnerHTML/);
  assert.doesNotMatch(progressSource, /\.message|\.ts|exit_code|duration_ms|adapter_status|timed_out/);
  assert.equal(existsSync(resolve('dashboard/client/src/components/LiveLog.tsx')), false);
});

test('TaskDetailPanel renders only safe Details and Progress tabs', async () => {
  const { TaskDetailPanel } = await vite.ssrLoadModule('/src/components/TaskDrawer.tsx');
  const html = renderToStaticMarkup(React.createElement(TaskDetailPanel, {
    detail: taskDetailFixture(),
    id: 'T-PROG',
  }));

  assert.match(html, /Details/);
  assert.match(html, /Progress/);
  assert.match(html, /tokenbox\/deepseek-v4-pro/);
  assert.match(html, /fable/);
  assert.match(html, /concrete-runtime-exact/);
  assert.doesNotMatch(html, /Output|Live log|Frontmatter|RAW_|PRIVATE|undefined|null/);
});

test('TaskStatusStrip renders closed status and terminal state with fallbacks', async () => {
  const { TaskStatusStrip } = await vite.ssrLoadModule('/src/components/TaskDrawer.tsx');
  const html = renderToStaticMarkup(React.createElement(TaskStatusStrip, { detail: taskDetailFixture() }));
  const fallback = renderToStaticMarkup(React.createElement(TaskStatusStrip, {}));

  assert.match(html, /Status/);
  assert.match(html, /done/);
  assert.match(html, /Terminal/);
  assert.match(html, /yes/);
  assert.match(fallback, /—/);
  assert.doesNotMatch(fallback, /undefined|null/);
});

test('Progress tab content owns overflow for long timelines', async () => {
  const { TaskDetailPanel } = await vite.ssrLoadModule('/src/components/TaskDrawer.tsx');
  const html = renderToStaticMarkup(React.createElement(TaskDetailPanel, {
    detail: taskDetailFixture(),
    id: 'T-PROG',
  }));

  assert.match(html, /id="[^"]+-content-progress"[^>]+class="[^"]*overflow-auto[^"]*"/);
});

test('Progress timeline rows limit to five events and pin terminal event first', async () => {
  const { ProgressTimelineRows } = await vite.ssrLoadModule('/src/components/ProgressTimeline.tsx');
  const events = [
    progressEvent(1, 'starting', 'lifecycle'),
    progressEvent(2, 'running', 'lifecycle'),
    progressEvent(3, 'running', 'finding'),
    progressEvent(4, 'running', 'command'),
    progressEvent(5, 'running', 'file'),
    progressEvent(6, 'done', 'terminal', true, 'done'),
  ];
  const html = renderToStaticMarkup(React.createElement(ProgressTimelineRows, { events }));

  assert.equal((html.match(/data-progress-row=/g) || []).length, 5);
  assert.match(html, /role="list"/);
  assert.match(html, /aria-label="Progress timeline"/);
  assert.equal((html.match(/role="listitem"/g) || []).length, 5);
  assert.ok(html.indexOf('#6') < html.indexOf('#5'));
  assert.match(html, /done\/terminal/);
  assert.match(html, /done/);
  assert.doesNotMatch(html, /RAW_PROGRESS_PRIVATE|message|exit_code|duration_ms|adapter_status|timed_out/);
});

test('Progress SSE payload merge updates query cache and dedups by seq', async () => {
  const { mergeProgressEvents } = await vite.ssrLoadModule('/src/components/ProgressTimeline.tsx');
  const client = new QueryClient();
  client.setQueryData(taskProgressKey('T-PROG'), {
    id: 'T-PROG',
    events: [progressEvent(1, 'running', 'lifecycle'), progressEvent(2, 'running', 'lifecycle')],
  });

  client.setQueryData(taskProgressKey('T-PROG'), (prev) => mergeProgressEvents('T-PROG', prev, [
    progressEvent(2, 'finalizing', 'lifecycle'),
    progressEvent(3, 'done', 'terminal', true, 'done'),
  ]));

  const cache = client.getQueryData(taskProgressKey('T-PROG'));
  assert.deepEqual(cache.events.map((event) => event.seq), [1, 2, 3]);
  assert.equal(cache.events[1].phase, 'finalizing');
});

function taskDetailFixture() {
  return {
    id: 'T-PROG',
    status: 'done',
    terminal: true,
    selector: { requested: 'fable', effective: 'tokenbox/deepseek-v4-pro', kind: 'concrete', source: 'user-argv' },
    observedModels: ['fable', 'deepseek-v4-pro'],
    resolution: { status: 'exact', detail: 'concrete-runtime-exact' },
    inventory: {
      binaryAvailability: 'present', binaryBasename: 'claude', sourceKind: 'static',
      sourceLabel: 'adapter-static-selectors', diagnosticCode: 'none', diagnosticState: 'none',
    },
    events: [],
  };
}

function progressEvent(seq, phase, kind, terminal = false, status = 'unknown') {
  return {
    seq,
    phase,
    kind,
    terminal,
    status,
    // Hostile legacy extras must be ignored by the closed client DTO.
    ts: new Date(2026, 4, 22, 12, 0, seq).toISOString(),
    message: 'RAW_PROGRESS_PRIVATE',
    exit_code: 99,
  };
}

function taskProgressKey(id) {
  return ['task', id, 'progress'];
}

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
