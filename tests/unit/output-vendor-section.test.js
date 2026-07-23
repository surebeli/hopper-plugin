// HOPPER-5: background output.md captures the parsed vendor answer.
// Anchor: tests/unit/output-vendor-section.test.js
//
// Unit coverage for renderVendorOutputSection (the renderer the background
// runner appends). The end-to-end "runner writes it into output.md" path is
// covered in tests/integration/vendor-output-capture.test.js.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { renderVendorOutputSection, VENDOR_OUTPUT_PREVIEW_LIMIT } from '../../cli/src/output.js';

test('HOPPER-5: renders the parsed vendor text under a distinct heading', () => {
  const md = renderVendorOutputSection('VERDICT: PASS\nNo blocking findings.', { rawLogName: 'T-X-output.log' });
  assert.match(md, /## Vendor output \(parsed\)/);
  assert.match(md, /VERDICT: PASS/);
  assert.match(md, /No blocking findings\./);
  // Distinct from the sync writer's "## Vendor output text" heading.
  assert.doesNotMatch(md, /## Vendor output text/);
});

test('recovered parser-designated text declares verified-complete evidence without changing its body', () => {
  const md = renderVendorOutputSection('SAFE_VERIFIED', {
    recovered: true,
    evidenceState: 'verified-complete',
    taskId: 'T-verified',
    rawLogName: 'T-verified-output.log',
  });
  assert.match(md, /## Vendor output \(recovered; evidence: verified-complete\)/);
  assert.match(md, /SAFE_VERIFIED/);
  assert.doesNotMatch(md, /advisory/i);
});

test('recovered parser-designated text with unknown completeness is advisory', () => {
  const md = renderVendorOutputSection('SAFE_PARTIAL', {
    recovered: true,
    evidenceState: 'unknown-completeness',
    taskId: 'T-partial',
    rawLogName: 'T-partial-output.log',
  });
  assert.match(md, /## Vendor output \(recovered; evidence: unknown-completeness\)/);
  assert.match(md, /SAFE_PARTIAL/);
  assert.match(md, /This parser-designated text may be incomplete and is advisory; the task remains failed\./);
});

test('HOPPER-5: empty/whitespace text yields a "no parsed text" note pointing at the log', () => {
  for (const t of ['', '   \n  ', null, undefined]) {
    const md = renderVendorOutputSection(t, { rawLogName: 'T-Y-output.log' });
    assert.match(md, /## Vendor output \(parsed\)/);
    assert.match(md, /no parsed text/i);
    assert.match(md, /T-Y-output\.log/);
  }
});

test('HOPPER-5: long text is previewed with a parsed-output retrieval note', () => {
  const big = 'x'.repeat(VENDOR_OUTPUT_PREVIEW_LIMIT + 500);
  const md = renderVendorOutputSection(big, { taskId: 'T-Z', rawLogName: 'T-Z-output.log' });
  assert.match(md, /preview \d+\/\d+ chars/);
  assert.match(md, /complete parsed output/i);
  assert.match(md, /hopper-dispatch --result T-Z --full/);
  assert.doesNotMatch(md, /full raw stream/i);
  // Body must be truncated, not the whole blob.
  assert.ok(md.length < big.length + 500);
});

test('HOPPER-5: content is fenced so it cannot break the surrounding markdown', () => {
  const md = renderVendorOutputSection('```js\ncode\n```', { rawLogName: 'l.log' });
  // The fence helper widens to outlast embedded backticks.
  assert.match(md, /````/);
});
