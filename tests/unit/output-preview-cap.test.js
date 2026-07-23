// T1: configurable output preview cap (HOPPER_OUTPUT_PREVIEW_MAX) + the
// full-output complement (--result --full reads the sidecar; tested at the CLI level).
// Anchor: tests/unit/output-preview-cap.test.js

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { effectivePreviewLimit, renderVendorOutputSection, writeRunnerSidecar, VENDOR_OUTPUT_PREVIEW_LIMIT } from '../../cli/src/output.js';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function withEnv(key, value, fn) {
  const prev = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  try { return fn(); } finally {
    if (prev === undefined) delete process.env[key];
    else process.env[key] = prev;
  }
}

test('T1: effectivePreviewLimit defaults to base, is raised by HOPPER_OUTPUT_PREVIEW_MAX, ignores junk', () => {
  assert.equal(effectivePreviewLimit(8000), 8000);
  withEnv('HOPPER_OUTPUT_PREVIEW_MAX', '50000', () => assert.equal(effectivePreviewLimit(8000), 50000));
  withEnv('HOPPER_OUTPUT_PREVIEW_MAX', '0', () => assert.equal(effectivePreviewLimit(8000), 8000));
  withEnv('HOPPER_OUTPUT_PREVIEW_MAX', '-5', () => assert.equal(effectivePreviewLimit(8000), 8000));
  withEnv('HOPPER_OUTPUT_PREVIEW_MAX', 'abc', () => assert.equal(effectivePreviewLimit(8000), 8000));
});

test('T1: renderVendorOutputSection truncates at the default cap, but fits the whole text under a raised cap', () => {
  const long = 'x'.repeat(VENDOR_OUTPUT_PREVIEW_LIMIT + 500);

  const truncated = renderVendorOutputSection(long, { taskId: 'T-preview', rawLogName: 't.log' });
  assert.match(truncated, /preview \d+\/\d+ chars/, 'shows a preview note when truncated');
  assert.match(truncated, /complete parsed output/i, 'never labels the retrieval path as a raw stream');
  assert.doesNotMatch(truncated, /full raw stream/i);
  assert.ok(!truncated.includes(long), 'full text NOT present inline at the default cap');

  withEnv('HOPPER_OUTPUT_PREVIEW_MAX', String(VENDOR_OUTPUT_PREVIEW_LIMIT + 2000), () => {
    const fullInline = renderVendorOutputSection(long, { rawLogName: 't.log' });
    assert.doesNotMatch(fullInline, /preview \d+\/\d+ chars/, 'no truncation note when the cap covers the text');
    assert.ok(fullInline.includes(long), 'full text present inline under a raised cap');
  });
});

test('T1: writeRunnerSidecar writes only supplied parser-designated text past the cap, else null', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hopper-sidecar-'));
  try {
    const long = 'PARSER_DESIGNATED_'.repeat(500);
    const p = writeRunnerSidecar(join(dir, 'T-X-output.md'), long);
    assert.ok(p && p.endsWith('T-X-output-raw.txt'), 'returns the sidecar path');
    assert.equal(readFileSync(p, 'utf-8'), long, 'sidecar holds only the supplied parser-designated text (untruncated)');

    // short / empty text → no sidecar
    assert.equal(writeRunnerSidecar(join(dir, 'T-Y-output.md'), 'short'), null);
    assert.equal(existsSync(join(dir, 'T-Y-output-raw.txt')), false);
    assert.equal(writeRunnerSidecar(join(dir, 'T-Y-output.md'), ''), null);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('T1: writeRunnerSidecar respects HOPPER_OUTPUT_PREVIEW_MAX (raised cap → no sidecar mid-length)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hopper-sidecar2-'));
  try {
    const mid = 'Q'.repeat(VENDOR_OUTPUT_PREVIEW_LIMIT + 100); // > default cap
    withEnv('HOPPER_OUTPUT_PREVIEW_MAX', String(VENDOR_OUTPUT_PREVIEW_LIMIT + 5000), () => {
      assert.equal(writeRunnerSidecar(join(dir, 'T-Z-output.md'), mid), null, 'raised cap covers it → no sidecar');
    });
    assert.equal(existsSync(join(dir, 'T-Z-output-raw.txt')), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
