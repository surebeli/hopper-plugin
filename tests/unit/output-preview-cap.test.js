// T1: configurable output preview cap (HOPPER_OUTPUT_PREVIEW_MAX) + the
// full-output complement (--result --full reads the sidecar; tested at the CLI level).
// Anchor: tests/unit/output-preview-cap.test.js

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { effectivePreviewLimit, renderVendorOutputSection, VENDOR_OUTPUT_PREVIEW_LIMIT } from '../../cli/src/output.js';

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

  const truncated = renderVendorOutputSection(long, { rawLogName: 't.log' });
  assert.match(truncated, /preview \d+\/\d+ chars/, 'shows a preview note when truncated');
  assert.ok(!truncated.includes(long), 'full text NOT present inline at the default cap');

  withEnv('HOPPER_OUTPUT_PREVIEW_MAX', String(VENDOR_OUTPUT_PREVIEW_LIMIT + 2000), () => {
    const fullInline = renderVendorOutputSection(long, { rawLogName: 't.log' });
    assert.doesNotMatch(fullInline, /preview \d+\/\d+ chars/, 'no truncation note when the cap covers the text');
    assert.ok(fullInline.includes(long), 'full text present inline under a raised cap');
  });
});
