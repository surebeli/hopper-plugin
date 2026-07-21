// T1: `--result --full` surfaces the COMPLETE sidecar text; preview path hints at
// --full; an empty/missing sidecar falls back to the body (review findings #1/#3).
// Anchor: tests/unit/result-full.test.js

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = resolve(fileURLToPath(import.meta.url), '..', '..', '..', 'cli', 'bin', 'hopper-dispatch');

function setupTask({ withSidecar, sidecarText = '' }) {
  const root = mkdtempSync(join(tmpdir(), 'hopper-result-'));
  const hopper = join(root, '.hopper');
  const handoffs = join(hopper, 'handoffs');
  mkdirSync(handoffs, { recursive: true });
  const id = 'T-RESULT-FULL';
  const outputMd = join(handoffs, `${id}-output.md`);
  const md = [
    '---',
    `task_id: ${id}`,
    'adapter: codex',
    'status: done',
    'adapter_status: success',
    'duration_ms: 1234',
    'exit_code: 0',
    '---',
    '',
    `# ${id} — market-research Output`,
    '',
    '## Vendor output (parsed) _(preview 8000/99999 chars; full raw stream in `' + id + '-output.log`)_',
    '',
    '```',
    'PREVIEW_BODY_MARKER (truncated to a preview)',
    '```',
    '',
  ].join('\n');
  writeFileSync(outputMd, md, 'utf-8');
  if (withSidecar) writeFileSync(join(handoffs, `${id}-output-raw.txt`), sidecarText, 'utf-8');
  return { root, hopper, id };
}

function runResult(hopper, id, extra = []) {
  return execFileSync(process.execPath, [BIN, '--result', id, ...extra], {
    encoding: 'utf-8', env: { ...process.env, HOPPER_DIR: hopper },
  });
}

test('T1: --result --full prints the COMPLETE sidecar text (long background output)', () => {
  const FULL = 'FULL_RESEARCH_BRIEF_' + 'x'.repeat(20000) + '_END_MARKER';
  const { root, hopper, id } = setupTask({ withSidecar: true, sidecarText: FULL });
  try {
    const out = runResult(hopper, id, ['--full']);
    assert.match(out, /FULL OUTPUT \(sidecar/, 'prints the full-output block');
    assert.ok(out.includes('FULL_RESEARCH_BRIEF_'), 'full sidecar text surfaced');
    assert.ok(out.includes('_END_MARKER'), 'sidecar tail NOT truncated');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('T1: --result (no --full) shows the preview body + a --full hint when a sidecar exists', () => {
  const { root, hopper, id } = setupTask({ withSidecar: true, sidecarText: 'x'.repeat(20000) });
  try {
    const out = runResult(hopper, id);
    assert.match(out, /PREVIEW_BODY_MARKER/, 'shows the preview body');
    assert.match(out, /--full/, 'hints at --full when a sidecar exists');
    assert.ok(!out.includes('FULL OUTPUT (sidecar'), 'does not dump full text without --full');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('T1: --result --full with NO sidecar falls back to the body (no empty FULL OUTPUT block)', () => {
  const { root, hopper, id } = setupTask({ withSidecar: false });
  try {
    const out = runResult(hopper, id, ['--full']);
    assert.ok(!out.includes('FULL OUTPUT (sidecar'), 'no empty sidecar block printed');
    assert.match(out, /OUTPUT\.MD BODY/, 'falls back to the body');
    assert.match(out, /PREVIEW_BODY_MARKER/, 'body content present');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('T1: --result safely renders an unknown frontmatter status without throwing', () => {
  const { root, hopper, id } = setupTask({ withSidecar: false });
  try {
    const output = join(hopper, 'handoffs', `${id}-output.md`);
    writeFileSync(output, `---\ntask_id: ${id}\nstatus: invalid-status\nobserved_models_json: {}\n---\nbody\n`, 'utf-8');
    const result = spawnSync(process.execPath, [BIN, '--result', id], {
      encoding: 'utf-8', env: { ...process.env, HOPPER_DIR: hopper },
    });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stdout, /UNKNOWN/);
    assert.match(result.stdout, /unverified/i);
    assert.doesNotMatch(result.stderr, /(?:TypeError|ReferenceError|\bat\s+runResult\b)/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
