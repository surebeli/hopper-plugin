// Output.md writer tests (T-PLUGIN-06)
// Anchor: tests/unit/output-writer.test.js

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  writeOutput,
  renderOutputMarkdown,
  suggestQueueEdit,
  suggestCostEdit,
  mapDispatchStatusToQueueStatus,
  validateTaskId,
} from '../../cli/src/output.js';
import { mkdtempSync, readFileSync, existsSync, writeFileSync, mkdirSync, rmSync, symlinkSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir, platform } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFrontmatter } from '../../cli/src/background.js';

const DISPATCH_CLI = resolve(fileURLToPath(import.meta.url), '..', '..', '..', 'cli', 'bin', 'hopper-dispatch');

function makeDispatchResult(overrides = {}) {
  return {
    task: {
      id: 'T-PLUGIN-XX',
      taskType: 'code-impl',
      status: 'pending',
      depends: [],
      priority: 'normal',
      brief: 'Test brief.',
      vendor: null,
      ...(overrides.task || {}),
    },
    vendor: overrides.vendor || 'codex',
    output: {
      text: 'hello world',
      status: 'success',
      ...(overrides.output || {}),
    },
    raw: {
      exitCode: 0,
      stdout: 'hello world\n',
      stderr: '',
      timedOut: false,
      durationMs: 1234,
      ...(overrides.raw || {}),
    },
  };
}

test('renderOutputMarkdown: success case includes Phase 2 schema sections in correct order', () => {
  const result = makeDispatchResult();
  const md = renderOutputMarkdown(result);
  assert.match(md, /^# T-PLUGIN-XX — code-impl Output \(vendor: codex\)$/m);

  // Per codex F1: section ORDER must match Phase 2 outputs
  const expected = [
    '## Summary',
    '## Files touched',
    '## Acceptance verification',
    '## Decisions / deviations from spec',
    '## Open questions for Leader',
    '## Commit',
    '## Verdict',
    '## Checks',
    '## Next recommendation',
    '## Dispatcher execution metadata',
    '## Vendor output text',
    '## Suggested protocol edits',
  ];
  let lastIdx = -1;
  for (const heading of expected) {
    const idx = md.indexOf(heading);
    assert.notEqual(idx, -1, `missing section: ${heading}`);
    assert.ok(idx > lastIdx, `section ${heading} appears out of order (idx=${idx}, lastIdx=${lastIdx})`);
    lastIdx = idx;
  }
});

test('renderOutputMarkdown: failure case includes only a closed adapter diagnostic', () => {
  const result = makeDispatchResult({
    output: { text: 'RAW_STDOUT_PRIVATE', status: 'auth-fail', error: 'adapter-auth-failed', diagnosticCode: 'adapter-auth-failed' },
    raw: { exitCode: 0, stdout: 'RAW_STDOUT_PRIVATE', stderr: 'RAW_STDERR_PRIVATE', timedOut: false, durationMs: 500 },
  });
  const md = renderOutputMarkdown(result);
  assert.match(md, /Vendor dispatch status: `auth-fail` \[FAIL\]/);
  assert.match(md, /## Adapter diagnostic/);
  assert.match(md, /adapter-auth-failed/);
  assert.doesNotMatch(md, /RAW_STDOUT_PRIVATE|RAW_STDERR_PRIVATE/);
});

test('renderOutputMarkdown: timed-out case is annotated', () => {
  const result = makeDispatchResult({
    output: { text: '', status: 'timeout', error: 'exceeded 300s' },
    raw: { exitCode: -1, stdout: '', stderr: '', timedOut: true, durationMs: 300000 },
  });
  const md = renderOutputMarkdown(result);
  assert.match(md, /\(timed out\)/i);
});

test('renderOutputMarkdown: long output text is truncated with an explicit --full boundary but no sidecar path', () => {
  const longText = 'A'.repeat(5000);  // > 4096 truncation threshold
  const result = makeDispatchResult({ output: { text: longText, status: 'success' } });
  const rawPath = '/fake/handoffs/T-PLUGIN-XX-output-raw.txt';
  const md = renderOutputMarkdown({ ...result, rawPath });
  assert.match(md, /\[truncated, \d+ chars omitted\]/);
  assert.match(md, /Full vendor output exceeds 4096-char preview limit/);
  assert.match(md, /hopper-dispatch --result T-PLUGIN-XX --full/);
  assert.doesNotMatch(md, /\/fake\/handoffs/);
  // First 4096 chars should be present
  assert.ok(md.includes('A'.repeat(4096)));
  // Full 5000 chars should NOT be present
  assert.ok(!md.includes('A'.repeat(5000)));
});

test('renderOutputMarkdown: empty output text shows (empty) placeholder', () => {
  const result = makeDispatchResult({ output: { text: '', status: 'unknown-fail', error: 'nothing emitted' } });
  const md = renderOutputMarkdown(result);
  assert.match(md, /\(empty\)/);
});

test('mapDispatchStatusToQueueStatus: success → done', () => {
  assert.equal(mapDispatchStatusToQueueStatus('success'), 'done');
});

test('mapDispatchStatusToQueueStatus: every other status → failed', () => {
  for (const status of ['auth-fail', 'timeout', 'permission-fail', 'unknown-fail']) {
    assert.equal(mapDispatchStatusToQueueStatus(status), 'failed',
      `${status} should map to failed`);
  }
});

test('suggestQueueEdit: includes task ID, both statuses, and handoff path', () => {
  const task = { id: 'T-99', status: 'pending', vendor: 'codex' };
  const edit = suggestQueueEdit(task, { status: 'success' });
  assert.match(edit, /T-99/);
  assert.match(edit, /'pending' -> 'done'/);
  assert.match(edit, /\.hopper\/handoffs\/T-99-output\.md/);
});

test('suggestQueueEdit: on failure maps to failed', () => {
  const task = { id: 'T-99', status: 'pending', vendor: null };
  const edit = suggestQueueEdit(task, { status: 'auth-fail' });
  assert.match(edit, /'pending' -> 'failed'/);
  assert.match(edit, /AGENTS\.md/, 'mentions AGENTS.md when task.vendor is null (resolved from)');
});

test('suggestCostEdit: produces a markdown table row', () => {
  const task = { id: 'T-42', taskType: 'code-review-adversarial' };
  const result = {
    output: { status: 'success', text: 'OK' },
    raw: { durationMs: 7500 },
  };
  const row = suggestCostEdit(task, 'kimi', result.output, result.raw);
  // Should be a single markdown table row
  assert.match(row, /^\|/);
  assert.match(row, /\|\s*T-42\s*\|/);
  assert.match(row, /\|\s*code-review-adversarial\s*\|/);
  assert.match(row, /\|\s*kimi\s*\|/);
  assert.match(row, /success/);
  assert.match(row, /7\.5s/);
});

test('suggestCostEdit: failure includes only the closed diagnostic code', () => {
  const task = { id: 'T-42', taskType: 'code-impl' };
  const row = suggestCostEdit(task, 'agy',
    { status: 'auth-fail', error: 'adapter-auth-failed', diagnosticCode: 'adapter-auth-failed' },
    { durationMs: 300 });
  assert.match(row, /auth-fail/);
  assert.match(row, /adapter-auth-failed/);
  assert.doesNotMatch(row, /error=|RAW_|OAuth-authed/);
});

test('writeOutput: creates file at .hopper/handoffs/<task-id>-output.md', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-out-write-'));
  try {
    const hopperDir = join(tmp, '.hopper');
    mkdirSync(hopperDir, { recursive: true });

    const result = makeDispatchResult();
    const written = await writeOutput({ hopperDir, dispatchResult: result });

    assert.ok(existsSync(written.path), 'output.md file must exist');
    assert.equal(written.overwritten, false);
    const content = readFileSync(written.path, 'utf-8');
    assert.match(content, /^# T-PLUGIN-XX/);

    // Returned edits should be non-empty strings
    assert.ok(written.queueEdit.length > 20);
    assert.ok(written.costEdit.length > 20);
    assert.match(written.queueEdit, /T-PLUGIN-XX/);
    assert.match(written.costEdit, /^\|/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('writeOutput: refuses to overwrite without force=true', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-out-noforce-'));
  try {
    const hopperDir = join(tmp, '.hopper');
    const handoffs = join(hopperDir, 'handoffs');
    mkdirSync(handoffs, { recursive: true });
    writeFileSync(join(handoffs, 'T-PLUGIN-XX-output.md'), 'PRE-EXISTING', 'utf-8');

    const result = makeDispatchResult();
    await assert.rejects(
      writeOutput({ hopperDir, dispatchResult: result }),
      /already exists/,
      'must reject when file exists and force not set'
    );

    // Verify file was NOT overwritten
    const content = readFileSync(join(handoffs, 'T-PLUGIN-XX-output.md'), 'utf-8');
    assert.equal(content, 'PRE-EXISTING');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('writeOutput: overwrites when force=true and reports overwritten=true', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-out-force-'));
  try {
    const hopperDir = join(tmp, '.hopper');
    const handoffs = join(hopperDir, 'handoffs');
    mkdirSync(handoffs, { recursive: true });
    writeFileSync(join(handoffs, 'T-PLUGIN-XX-output.md'), 'PRE-EXISTING', 'utf-8');

    const result = makeDispatchResult();
    const written = await writeOutput({ hopperDir, dispatchResult: result, force: true });

    assert.equal(written.overwritten, true);
    const content = readFileSync(written.path, 'utf-8');
    assert.notEqual(content, 'PRE-EXISTING');
    assert.match(content, /^# T-PLUGIN-XX/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('writeOutput: throws clear error when task.id missing', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-out-nope-'));
  try {
    const hopperDir = join(tmp, '.hopper');
    mkdirSync(hopperDir, { recursive: true });

    const badResult = { task: { taskType: 'foo' }, vendor: 'codex', output: {}, raw: {} };
    await assert.rejects(
      writeOutput({ hopperDir, dispatchResult: badResult }),
      /task\.id is required/,
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('writeOutput: creates handoffs/ dir if missing', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-out-mkdir-'));
  try {
    const hopperDir = join(tmp, '.hopper');
    // intentionally do NOT create handoffs/
    mkdirSync(hopperDir, { recursive: true });

    const result = makeDispatchResult();
    const written = await writeOutput({ hopperDir, dispatchResult: result });
    assert.ok(existsSync(written.path));
    assert.ok(existsSync(join(hopperDir, 'handoffs')));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ─── codex T-06 mini-audit F2: raw sidecar for long outputs ────────────

test('writeOutput: writes sidecar -output-raw.txt when output exceeds preview limit', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-out-sidecar-'));
  try {
    const hopperDir = join(tmp, '.hopper');
    mkdirSync(hopperDir, { recursive: true });

    const longText = 'X'.repeat(8000);  // > 4096 limit
    const result = makeDispatchResult({ output: { text: longText, status: 'success' } });
    const written = await writeOutput({ hopperDir, dispatchResult: result });

    assert.ok(written.rawPath, 'rawPath must be set when output exceeds preview limit');
    assert.ok(existsSync(written.rawPath), 'sidecar raw file must exist on disk');
    const rawContent = readFileSync(written.rawPath, 'utf-8');
    assert.equal(rawContent.length, 8000, 'sidecar must contain FULL output, not truncated');
    assert.equal(rawContent, longText, 'sidecar content must equal output.text exactly');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('writeOutput: generated markdown and frontmatter omit absolute sidecar paths and raw stderr while --full remains an explicit sidecar boundary', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-out-private-sidecar-'));
  try {
    const hopperDir = join(tmp, '.hopper');
    mkdirSync(hopperDir, { recursive: true });
    const rawStderr = 'RAW_STDERR_DO_NOT_PUBLISH';
    const sidecarText = `RAW_SIDECAR_EXPLICIT_ONLY-${'x'.repeat(8_200)}`;
    const result = makeDispatchResult({
      output: { text: sidecarText, status: 'unknown-fail', error: 'closed dispatch failure' },
      raw: { stderr: rawStderr, exitCode: 1 },
    });
    const written = await writeOutput({ hopperDir, dispatchResult: result });

    writeFrontmatter(written.path, {
      task_id: result.task.id,
      adapter: result.vendor,
      status: 'done',
      adapter_status: 'success',
      duration_ms: 1234,
      exit_code: 0,
      requested_selector: 'safe-requested',
      effective_selector: 'safe-effective',
      effective_selector_source: 'user-argv',
      selector_kind: 'concrete',
      observed_models_json: '["safe-observed"]',
      resolution_status: 'exact',
      resolution_detail: 'concrete-runtime-exact',
      catalog_source_kind: 'static',
      catalog_source_label: 'adapter-static-selectors',
      binary_availability: 'present',
      binary_basename: 'codex',
      _body: readFileSync(written.path, 'utf-8'),
    });

    const markdown = readFileSync(written.path, 'utf-8');
    assert.match(markdown, /^---\n/, 'the generated output contains frontmatter');
    assert.ok(written.rawPath && existsSync(written.rawPath), 'the private sidecar remains on disk');
    const renderedSidecarPath = written.rawPath.replace(/\\/g, '/');
    assert.deepEqual(
      [renderedSidecarPath, rawStderr].filter((secret) => markdown.includes(secret)),
      [],
      'neither frontmatter nor body may reveal a local sidecar path or raw stderr',
    );
    assert.equal(readFileSync(written.rawPath, 'utf-8'), sidecarText, 'the sidecar retains the full raw text');

    const defaultResult = spawnSync(process.execPath, [DISPATCH_CLI, '--result', result.task.id], {
      encoding: 'utf-8', env: { ...process.env, HOPPER_DIR: hopperDir },
    });
    assert.equal(defaultResult.status, 0, defaultResult.stderr);
    assert.doesNotMatch(`${defaultResult.stdout}\n${defaultResult.stderr}`, /RAW_SIDECAR_EXPLICIT_ONLY|RAW_STDERR_DO_NOT_PUBLISH/);

    const fullResult = spawnSync(process.execPath, [DISPATCH_CLI, '--result', result.task.id, '--full'], {
      encoding: 'utf-8', env: { ...process.env, HOPPER_DIR: hopperDir },
    });
    assert.equal(fullResult.status, 0, fullResult.stderr);
    assert.match(fullResult.stdout, /FULL OUTPUT \(sidecar/);
    assert.match(fullResult.stdout, /RAW_SIDECAR_EXPLICIT_ONLY/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('writeOutput: HOPPER_OUTPUT_PREVIEW_MAX raises the cap → long-but-under-cap output writes NO sidecar (T1)', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-out-raisedcap-'));
  const prev = process.env.HOPPER_OUTPUT_PREVIEW_MAX;
  process.env.HOPPER_OUTPUT_PREVIEW_MAX = '50000';
  try {
    const hopperDir = join(tmp, '.hopper');
    mkdirSync(hopperDir, { recursive: true });
    const text = 'Y'.repeat(8000);  // > default 4096 but < raised 50000
    const result = makeDispatchResult({ output: { text, status: 'success' } });
    const written = await writeOutput({ hopperDir, dispatchResult: result });
    assert.equal(written.rawPath, null, 'no sidecar when the raised cap covers the text');
    assert.ok(written.content.includes(text), 'full text inline in output.md under a raised cap');
    assert.doesNotMatch(written.content, /complete text written to/, 'no sidecar reference under a raised cap');
  } finally {
    if (prev === undefined) delete process.env.HOPPER_OUTPUT_PREVIEW_MAX; else process.env.HOPPER_OUTPUT_PREVIEW_MAX = prev;
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('writeOutput: short outputs do NOT generate sidecar', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-out-nosidecar-'));
  try {
    const hopperDir = join(tmp, '.hopper');
    mkdirSync(hopperDir, { recursive: true });
    const result = makeDispatchResult();  // default 'hello world' (short)
    const written = await writeOutput({ hopperDir, dispatchResult: result });
    assert.equal(written.rawPath, null, 'short output → no sidecar');
    assert.ok(!existsSync(join(hopperDir, 'handoffs', 'T-PLUGIN-XX-output-raw.txt')));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ─── codex T-06 mini-audit F3: task.id path safety ─────────────────────

test('validateTaskId: accepts well-formed task IDs', () => {
  for (const id of ['T-PLUGIN-05a', 'T01', 'Task.v2', 'A_B', 'X-y.z-1.2.3']) {
    assert.doesNotThrow(() => validateTaskId(id), `should accept "${id}"`);
  }
});

test('validateTaskId: rejects path-traversal attempts', () => {
  for (const id of ['../etc/passwd', '..\\..\\foo', 'foo/bar', 'foo\\bar', '.hidden', '', 'a..b']) {
    assert.throws(() => validateTaskId(id), `should reject "${id}"`);
  }
});

test('validateTaskId: rejects oversize IDs', () => {
  const longId = 'T-' + 'a'.repeat(200);
  assert.throws(() => validateTaskId(longId), /exceeds 100 chars/);
});

test('validateTaskId: rejects non-string types', () => {
  assert.throws(() => validateTaskId(null), /must be string/);
  assert.throws(() => validateTaskId(123), /must be string/);
  assert.throws(() => validateTaskId(undefined), /must be string/);
});

// ─── codex Phase 3 P1 F3: symlink-safe writes ─────────────────────────

test('writeOutput: refuses to follow symlink at output path (codex P3 F3)', { skip: platform() === 'win32' ? 'symlink creation requires admin on Windows' : false }, async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-out-symlink-'));
  try {
    const hopperDir = join(tmp, '.hopper');
    const handoffs = join(hopperDir, 'handoffs');
    mkdirSync(handoffs, { recursive: true });
    // Plant an attack: symlink at the would-be output path pointing outside .hopper/
    const attackTarget = join(tmp, 'attack-target.txt');
    writeFileSync(attackTarget, 'do not overwrite me', 'utf-8');
    symlinkSync(attackTarget, join(handoffs, 'T-PLUGIN-XX-output.md'));

    const result = makeDispatchResult();
    await assert.rejects(
      writeOutput({ hopperDir, dispatchResult: result, force: true }),
      /symlink/i,
      'writer must refuse to follow symlinks even with force=true'
    );

    // Verify attack target untouched
    assert.equal(readFileSync(attackTarget, 'utf-8'), 'do not overwrite me',
      'attack target file must not be overwritten');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('writeOutput: refuses when handoffs/ itself is a symlink escaping .hopper/', { skip: platform() === 'win32' ? 'symlink creation requires admin on Windows' : false }, async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-out-dir-symlink-'));
  try {
    const hopperDir = join(tmp, '.hopper');
    mkdirSync(hopperDir, { recursive: true });
    // handoffs/ is a symlink to a directory outside .hopper/
    const evilTarget = join(tmp, 'evil-handoffs');
    mkdirSync(evilTarget, { recursive: true });
    symlinkSync(evilTarget, join(hopperDir, 'handoffs'));

    const result = makeDispatchResult();
    await assert.rejects(
      writeOutput({ hopperDir, dispatchResult: result }),
      /escapes/i,
      'writer must refuse when handoffs/ real path escapes hopperDir'
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('writeOutput: rejects task with path-traversal ID', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-out-traversal-'));
  try {
    const hopperDir = join(tmp, '.hopper');
    mkdirSync(hopperDir, { recursive: true });
    const result = makeDispatchResult({ task: { id: '../escape', taskType: 'code-impl', status: 'pending', vendor: null } });
    await assert.rejects(
      writeOutput({ hopperDir, dispatchResult: result }),
      /unsafe characters|escapes handoffs/,
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ─── codex T-06 mini-audit F4: markdown/control-char edge cases ────────

test('renderOutputMarkdown: output containing triple-backticks does NOT break the fence', () => {
  const result = makeDispatchResult({
    output: { text: 'before\n```js\ninnerCode\n```\nafter', status: 'success' },
  });
  const md = renderOutputMarkdown(result);
  // Find the fences in the "Vendor output text" section
  const outputSection = md.split('## Vendor output text')[1];
  // The opening fence must be longer than any internal ``` run (3 chars)
  // so the fence is ≥4 backticks
  assert.match(outputSection, /````+/,
    'fence must be longer than 3 backticks when content contains ```');
  // And the inner ```js content should be preserved literally
  assert.match(md, /```js/);
});

test('renderOutputMarkdown: backticks in task.brief sanitized in H1/metadata', () => {
  const result = makeDispatchResult({
    task: { id: 'T-OK', taskType: 'code-impl', status: 'pending', depends: [], priority: 'normal',
      brief: 'install `kimi-cli` and run',  // contains backticks
      vendor: null },
  });
  const md = renderOutputMarkdown(result);
  // Brief is in Summary block — backticks should be converted to apostrophes (or otherwise neutralized)
  // The H1 and metadata blocks must not include unescaped backticks from user input
  // For brief specifically, we sanitize via sanitizeInline which converts ` → '
  assert.match(md, /install 'kimi-cli' and run/);
});

test('renderOutputMarkdown: NUL and control bytes in output replaced with U+FFFD', () => {
  const result = makeDispatchResult({
    output: { text: 'before\x00middle\x07after', status: 'success' },
  });
  const md = renderOutputMarkdown(result);
  assert.ok(!md.includes('\x00'), 'NUL byte must be stripped from markdown');
  assert.ok(!md.includes('\x07'), 'BEL byte must be stripped from markdown');
  assert.match(md, /�/, 'replacement char must appear');
});

test('renderOutputMarkdown: preserves \\n, \\t, \\r in output text (not stripped)', () => {
  const result = makeDispatchResult({
    output: { text: 'line1\nline2\tcol2\rline3', status: 'success' },
  });
  const md = renderOutputMarkdown(result);
  assert.match(md, /line1\nline2/);  // \n preserved
  assert.ok(md.includes('\t'), 'tab character preserved');
});

test('renderOutputMarkdown: vendor name with control chars sanitized in H1', () => {
  const result = makeDispatchResult({ vendor: 'kimi\x00\n```evil' });
  const md = renderOutputMarkdown(result);
  const h1 = md.split('\n')[0];
  // H1 must not contain NUL, newline (after sanitizeInline → space), or backticks
  assert.ok(!h1.includes('\x00'));
  assert.ok(!h1.includes('```'), 'backticks in vendor name must be neutralized in H1');
  assert.equal(h1.split('\n').length, 1, 'H1 must be single line');
});

test('renderOutputMarkdown: diagnostic rendering ignores raw error prose with embedded fences', () => {
  const result = makeDispatchResult({
    output: { text: 'RAW_STDOUT_PRIVATE', status: 'unknown-fail', error: 'failed at ```bash\nRAW_STDERR_PRIVATE\n``` line 42', diagnosticCode: 'adapter-unknown-failed' },
    raw: { exitCode: 1, stdout: '', stderr: '', timedOut: false, durationMs: 100 },
  });
  const md = renderOutputMarkdown(result);
  assert.match(md, /## Adapter diagnostic/);
  assert.match(md, /adapter-unknown-failed/);
  assert.doesNotMatch(md, /RAW_STDOUT_PRIVATE|RAW_STDERR_PRIVATE|rm -rf/);
});
