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
    'requested_selector: safe-requested',
    'effective_selector: safe-effective',
    'effective_selector_source: user-argv',
    'selector_kind: concrete',
    'observed_models_json: "[\\"safe-observed\\"]"',
    'resolution_status: exact',
    'resolution_detail: concrete-runtime-exact',
    'catalog_source_kind: static',
    'catalog_source_label: adapter-static-selectors',
    'binary_availability: present',
    'binary_basename: codex',
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

test('T1: --result (no --full) withholds the preview body and directs callers to the explicit --full boundary', () => {
  const { root, hopper, id } = setupTask({ withSidecar: true, sidecarText: 'x'.repeat(20000) });
  try {
    const out = runResult(hopper, id);
    assert.ok(!out.includes('PREVIEW_BODY_MARKER'), 'does not print parsed body without explicit raw-output opt-in');
    assert.match(out, /--full/, 'points to the explicit raw-output boundary');
    assert.match(out, /Requested selector:\s+safe-requested/);
    assert.match(out, /Effective selector:\s+safe-effective/);
    assert.match(out, /binaryAvailability=present/);
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

test('T7: --result renders only canonical safe attestation data unless --full is explicitly requested', () => {
  const { root, hopper, id } = setupTask({ withSidecar: true, sidecarText: 'RAW_SIDECAR_PRIVATE' });
  try {
    const output = join(hopper, 'handoffs', `${id}-output.md`);
    const log = join(hopper, 'handoffs', `${id}-output.log`);
    const forbidden = [
      'C:\\PRIVATE_LOGS\\result.log', 'C:\\PRIVATE_CONFIG\\vendor.json', 'RAW_STDERR_PRIVATE',
      'AUTH_PROSE_PRIVATE', 'PRIVATE_PROVIDER_NAME', 'https://private.example.invalid/model',
      'sk-private-secret-token', 'SOURCE_NOTE_PRIVATE', 'CACHE_ERROR_PRIVATE', 'RAW_DIAGNOSTIC_PRIVATE',
      'raw_log', 'sourceNote', 'cacheError', 'modelsSource', 'RAW_SIDECAR_PRIVATE',
    ];
    writeFileSync(output, [
      '---', `task_id: ${id}`, 'adapter: codex', 'status: done',
      'requested_selector: safe-requested', 'effective_selector: safe-effective',
      'effective_selector_source: user-argv', 'selector_kind: concrete',
      'observed_models_json: "[\\"safe-observed\\"]"',
      'resolution_status: exact', 'resolution_detail: concrete-runtime-exact',
      'catalog_source_kind: static', 'catalog_source_label: SOURCE_NOTE_PRIVATE',
      'binary_availability: present', 'binary_basename: codex',
      'raw_log: C:\\PRIVATE_LOGS\\result.log', 'modelsSource: modelsSource',
      'sourceNote: SOURCE_NOTE_PRIVATE', 'cacheError: CACHE_ERROR_PRIVATE', 'diagnostic_code: RAW_DIAGNOSTIC_PRIVATE',
      'notes: AUTH_PROSE_PRIVATE sk-private-secret-token', 'stderr: RAW_STDERR_PRIVATE',
      'provider: PRIVATE_PROVIDER_NAME', '---', '', 'RAW_STDERR_PRIVATE',
    ].join('\n'), 'utf-8');
    writeFileSync(log, 'RAW_STDERR_PRIVATE AUTH_PROSE_PRIVATE sk-private-secret-token', 'utf-8');
    const result = spawnSync(process.execPath, [BIN, '--result', id], {
      encoding: 'utf-8', env: { ...process.env, HOPPER_DIR: hopper },
    });
    assert.equal(result.status, 0, result.stderr);
    for (const value of forbidden) assert.ok(!`${result.stdout}\n${result.stderr}`.includes(value), value);
    assert.match(result.stdout, /Requested selector:\s+safe-requested/);
    assert.match(result.stdout, /Effective selector:\s+safe-effective/);
    assert.match(result.stdout, /Source:\s+user-argv/);
    assert.match(result.stdout, /Kind:\s+concrete/);
    assert.match(result.stdout, /Observed:\s+safe-observed/);
    assert.match(result.stdout, /Resolution:\s+exact/);
    assert.match(result.stdout, /binaryAvailability=present/);
    assert.match(result.stdout, /sourceLabel=adapter-static-selectors/);
    assert.match(result.stdout, /--full/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
