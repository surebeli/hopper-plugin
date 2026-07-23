// Phase 6c tests: task-type-aware timeouts + adapter knownInstallPaths + kimi --thinking + soft-warn enhancement
// Anchor: tests/unit/phase6c.test.js

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { applyTaskTypeFloor, REVIEW_TASK_FLOOR_MS, REVIEW_TASK_TYPES } from '../../cli/src/subprocess.js';
import { resolveCommandWithKnownPaths } from '../../cli/src/path-resolve.js';

// ─── F1: applyTaskTypeFloor ────────────────────────────────────────────

test('F1: applyTaskTypeFloor returns native when opts has no taskType', () => {
  assert.equal(applyTaskTypeFloor(120_000, {}), 120_000);
  assert.equal(applyTaskTypeFloor(120_000, undefined), 120_000);
  assert.equal(applyTaskTypeFloor(120_000, null), 120_000);
});

test('F1: applyTaskTypeFloor returns native for non-review task-types', () => {
  for (const tt of ['code-impl', 'spec-write', 'sidecar-polish', 'spec-blindspot-hunt']) {
    assert.equal(applyTaskTypeFloor(120_000, { taskType: tt }), 120_000,
      `non-review task-type '${tt}' should not be elevated`);
  }
});

test('F1: applyTaskTypeFloor raises review task-types to 30min floor', () => {
  for (const tt of REVIEW_TASK_TYPES) {
    assert.equal(applyTaskTypeFloor(120_000, { taskType: tt }), REVIEW_TASK_FLOOR_MS,
      `review task-type '${tt}' should be raised to floor`);
    assert.equal(applyTaskTypeFloor(120_000, { taskType: tt }), 1_800_000);
  }
});

test('F1: applyTaskTypeFloor does NOT cap above the floor (codex xhigh stays 900s only if < floor)', () => {
  // If a vendor's native is already above the floor, keep it.
  const above = 3_600_000;
  assert.equal(applyTaskTypeFloor(above, { taskType: 'code-review-adversarial' }), above,
    'native above floor should be preserved');
});

test('F1: REVIEW_TASK_TYPES contains the two review task-types from tasks/', () => {
  assert.ok(REVIEW_TASK_TYPES.has('code-review-adversarial'));
  assert.ok(REVIEW_TASK_TYPES.has('code-review-acceptance'));
});

// ─── F1 wiring: each adapter applies the floor through opts.taskType ──

test('F1 wiring: codex timeoutMs(opts) returns 30min floor for review task-types', async () => {
  const { codexAdapter } = await import('../../cli/src/vendors/codex.js');
  // Native codex defaults to 300s; xhigh = 900s; both are < 30min floor
  assert.equal(codexAdapter.timeoutMs({}), 300_000);
  assert.equal(codexAdapter.timeoutMs({ reasoning: 'xhigh' }), 900_000);
  assert.equal(codexAdapter.timeoutMs({ taskType: 'code-review-adversarial' }), 1_800_000);
  assert.equal(codexAdapter.timeoutMs({ taskType: 'code-review-adversarial', reasoning: 'xhigh' }), 1_800_000);
});

test('F1 wiring: copilot timeoutMs(opts) elevates from 120s → 30min for review tasks', async () => {
  const { copilotAdapter } = await import('../../cli/src/vendors/copilot.js');
  assert.equal(copilotAdapter.timeoutMs({}), 120_000);
  assert.equal(copilotAdapter.timeoutMs({ taskType: 'code-review-adversarial' }), 1_800_000);
});

test('F1 wiring: opencode timeoutMs(opts) elevates from 180s → 30min for review tasks', async () => {
  const { opencodeAdapter } = await import('../../cli/src/vendors/opencode.js');
  assert.equal(opencodeAdapter.timeoutMs({}), 180_000);
  assert.equal(opencodeAdapter.timeoutMs({ taskType: 'code-review-acceptance' }), 1_800_000);
});

test('F1 wiring: kimi timeoutMs(opts) elevates from 180s → 30min for review tasks', async () => {
  const { kimiAdapter } = await import('../../cli/src/vendors/kimi.js');
  assert.equal(kimiAdapter.timeoutMs({}), 180_000);
  assert.equal(kimiAdapter.timeoutMs({ taskType: 'code-review-adversarial' }), 1_800_000);
});

test('F1 wiring: agy timeoutMs(opts) elevates from 360s → 30min for review tasks', async () => {
  const { agyAdapter } = await import('../../cli/src/vendors/agy.js');
  assert.equal(agyAdapter.timeoutMs({}), 360_000);
  assert.equal(agyAdapter.timeoutMs({ taskType: 'code-review-adversarial' }), 1_800_000);
});

// ─── F2: resolveCommandWithKnownPaths ────────────────────────────────────

test('F2: resolveCommandWithKnownPaths returns null when PATH lookup fails AND no known paths', () => {
  const r = resolveCommandWithKnownPaths('definitely-nonexistent-binary-xyz123', []);
  assert.equal(r, null);
});

test('F2: resolveCommandWithKnownPaths returns null when PATH fails AND all known paths missing', () => {
  const r = resolveCommandWithKnownPaths('definitely-nonexistent-binary-xyz123', ['/no/such/path']);
  assert.equal(r, null);
});

test('F2: resolveCommandWithKnownPaths uses known-install path when PATH lookup fails', async (t) => {
  const tmp = mkdtempSync(join(tmpdir(), 'fallback-'));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const isWindows = process.platform === 'win32';
  const fallbackBin = join(tmp, isWindows ? 'fake.exe' : 'fake');
  writeFileSync(fallbackBin, '');
  if (!isWindows) {
    const { chmodSync } = await import('node:fs');
    chmodSync(fallbackBin, 0o755);
  }
  const r = resolveCommandWithKnownPaths('this-name-isnt-on-path-xyz', [fallbackBin]);
  assert.ok(r, 'fallback should resolve');
  assert.equal(r.resolvedPath, fallbackBin);
  // .exe on Windows → direct exec; POSIX → direct
  if (isWindows && fallbackBin.toLowerCase().endsWith('.exe')) {
    assert.equal(r.command, fallbackBin);
    assert.deepEqual(r.prependArgs, []);
  }
});

test('F2: resolveCommandWithKnownPaths walks known paths in order (first hit wins)', async (t) => {
  const tmp = mkdtempSync(join(tmpdir(), 'fallback-order-'));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const isWindows = process.platform === 'win32';
  const first = join(tmp, isWindows ? 'first.exe' : 'first');
  const second = join(tmp, isWindows ? 'second.exe' : 'second');
  writeFileSync(first, '');
  writeFileSync(second, '');
  if (!isWindows) {
    const { chmodSync } = await import('node:fs');
    chmodSync(first, 0o755);
    chmodSync(second, 0o755);
  }
  const r = resolveCommandWithKnownPaths('not-on-path-xyz', ['/no/such', first, second]);
  assert.equal(r.resolvedPath, first, 'should take first existing fallback');
});

test('F2: agy adapter declares knownInstallPaths for both platforms', async () => {
  const { agyAdapter } = await import('../../cli/src/vendors/agy.js');
  assert.ok(Array.isArray(agyAdapter.knownInstallPaths), 'agy must declare knownInstallPaths');
  assert.ok(agyAdapter.knownInstallPaths.length > 0, 'at least one fallback path');
  if (process.platform === 'win32') {
    assert.ok(agyAdapter.knownInstallPaths[0].endsWith('agy.exe'),
      `Windows fallback should end in agy.exe; got ${agyAdapter.knownInstallPaths[0]}`);
    assert.ok(agyAdapter.knownInstallPaths[0].includes('AppData'),
      'Windows fallback should point at Windows install location');
  }
});

// ─── 6c follow-up P1#1: qualified-path NOT hijacked by knownInstallPaths ─

test('6c-followup P1: qualified paths are NOT hijacked by knownInstallPaths', (t) => {
  // codex/copilot reproduced: node.exe → cmd.exe hijack when knownInstallPaths
  // declared a different .exe. resolveCommandOnPath returns qualified paths
  // with resolvedPath:null (pass-through). resolveCommandWithKnownPaths must
  // honor that pass-through and NOT fall through to the fallback walk.
  const isWindows = process.platform === 'win32';
  const qualified = isWindows ? 'C:\\Windows\\System32\\cmd.exe' : '/bin/sh';
  // Fake knownInstallPaths that point to a DIFFERENT real binary
  const decoy = isWindows ? 'C:\\Windows\\System32\\notepad.exe' : '/bin/ls';
  const r = resolveCommandWithKnownPaths(qualified, [decoy]);
  assert.ok(r, 'qualified path must resolve, not return null');
  assert.equal(r.command, qualified,
    `qualified path must pass through unmodified; got ${r.command} (decoy was ${decoy})`);
  assert.equal(r.resolvedPath, null,
    'resolvedPath stays null for qualified pass-through (matches resolveCommandOnPath contract)');
});

test('6c-followup P1: relative path with extension also bypasses fallback walk', () => {
  // 'foo.exe' (Windows) or 'foo.sh' (POSIX) — has an extension, so qualified
  const cmd = process.platform === 'win32' ? 'someName.exe' : 'someName.sh';
  // knownInstallPaths is irrelevant here; cmd is qualified by extension
  const r = resolveCommandWithKnownPaths(cmd, ['/no/such/decoy']);
  assert.ok(r, 'extension-qualified cmd must resolve');
  assert.equal(r.command, cmd, 'qualified cmd passes through');
});

// ─── T-KIMI-MIGRATE: Kimi Code 0.x dropped the --thinking argv toggle ──────
// (Supersedes the Phase 6c "P1: kimi --thinking forwarding" test — 0.x makes
// reasoning config-driven; emitting --thinking would error out the new binary.)

test('kimi args() never emits --thinking/--no-thinking (0.x reasoning is config-driven)', async () => {
  const { kimiAdapter } = await import('../../cli/src/vendors/kimi.js');
  for (const r of [undefined, 'none', 'low', 'medium', 'high', 'xhigh', true]) {
    const args = kimiAdapter.args('prompt', r === undefined ? {} : { reasoning: r });
    assert.ok(!args.includes('--thinking') && !args.includes('--no-thinking'),
      `reasoning=${r}: 0.x must NOT emit a reasoning argv flag; got: ${args.join(' ')}`);
  }
});

// (Old test 'P1: kimi args() omits --thinking when reasoning=none' removed in
// 6c follow-up — superseded by the more precise 6c-followup tests above which
// assert --no-thinking emission for explicit-disable and no flags for omitted.)

test('6c-followup --result: default output is private and --full explicitly releases body and log', async (t) => {
  // Create a fake completed task output.md + log. The default renderer must
  // expose only its closed public summary; --full is the raw-output boundary.
  const { mkdtempSync, writeFileSync, rmSync, mkdirSync } = await import('node:fs');
  const { spawnSync } = await import('node:child_process');
  const { tmpdir } = await import('node:os');
  const { join: pathJoin } = await import('node:path');

  const tmp = mkdtempSync(pathJoin(tmpdir(), 'hopper-result-'));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const handoffs = pathJoin(tmp, 'handoffs');
  mkdirSync(handoffs);

  const taskId = 'T-RESULT-TEST-1';
  writeFileSync(pathJoin(handoffs, `${taskId}-output.md`), [
    '---',
    `task_id: ${taskId}`,
    'adapter: fakevendor',
    'status: done',
    'pid: 12345',
    'start_time: "2026-05-21T00:00:00.000Z"',
    'end_time: "2026-05-21T00:01:30.000Z"',
    'exit_code: 0',
    'duration_ms: 90000',
    'mode: background',
    'adapter_status: success',
    '---',
    '',
    `# ${taskId} — Adversarial Review`,
    '',
    '## Verdict: PASS',
    '',
    'No findings worth surfacing.',
    '',
    '## Status (background completion)',
    '- queue_status: done',
  ].join('\n'));
  writeFileSync(pathJoin(handoffs, `${taskId}-output.log`), 'vendor stdout line 1\nvendor stdout line 2\n');

  const { fileURLToPath } = await import('node:url');
  const { dirname, resolve } = await import('node:path');
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const REPO_ROOT = resolve(__dirname, '..', '..');
  const dispatchBin = pathJoin(REPO_ROOT, 'cli', 'bin', 'hopper-dispatch');
  const result = spawnSync(process.execPath, [dispatchBin, '--result', taskId], {
    env: { ...process.env, HOPPER_DIR: tmp },
    encoding: 'utf-8',
  });
  assert.equal(result.status, 0, `--result should exit 0 for status=done; got ${result.status}; stderr: ${result.stderr}`);
  assert.match(result.stdout, /=== T-RESULT-TEST-1 — DONE ===/, 'must print summary header');
  assert.match(result.stdout, /Vendor:\s+unknown/, 'unverified adapter must not become a public vendor claim');
  assert.ok(!result.stdout.includes('fakevendor'), `must not expose unverified adapter: ${result.stdout}`);
  assert.ok(!result.stdout.includes('## Verdict: PASS'), `must not print output.md body by default: ${result.stdout}`);
  assert.ok(!result.stdout.includes('vendor stdout line 1'), `must not print log tail by default: ${result.stdout}`);
  assert.match(result.stdout, /Parser-designated output is available only with `--full`\./, 'must name the parser-designated output boundary');

  const full = spawnSync(process.execPath, [dispatchBin, '--result', taskId, '--full'], {
    env: { ...process.env, HOPPER_DIR: tmp },
    encoding: 'utf-8',
  });
  assert.equal(full.status, 0, `--result --full should exit 0 for status=done; got ${full.status}; stderr: ${full.stderr}`);
  assert.match(full.stdout, /## Verdict: PASS/, 'must print output.md body after explicit opt-in');
  assert.doesNotMatch(full.stdout, /vendor stdout line 1/, 'must never print raw log bytes, even after explicit opt-in');
});

test('6c-followup --result: in-progress task exits 2 with watch hint', async (t) => {
  const { mkdtempSync, writeFileSync, rmSync, mkdirSync } = await import('node:fs');
  const { spawnSync } = await import('node:child_process');
  const { tmpdir } = await import('node:os');
  const { join: pathJoin } = await import('node:path');

  const tmp = mkdtempSync(pathJoin(tmpdir(), 'hopper-result-inprog-'));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const handoffs = pathJoin(tmp, 'handoffs');
  mkdirSync(handoffs);

  const taskId = 'T-RESULT-INPROG';
  writeFileSync(pathJoin(handoffs, `${taskId}-output.md`), [
    '---',
    `task_id: ${taskId}`,
    'adapter: kimi',
    'status: in-progress',
    'pid: 99999',
    'start_time: "2026-05-21T00:00:00.000Z"',
    '---',
    '',
    '# placeholder',
  ].join('\n'));

  const { fileURLToPath } = await import('node:url');
  const { dirname, resolve } = await import('node:path');
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const REPO_ROOT = resolve(__dirname, '..', '..');
  const dispatchBin = pathJoin(REPO_ROOT, 'cli', 'bin', 'hopper-dispatch');
  const result = spawnSync(process.execPath, [dispatchBin, '--result', taskId], {
    env: { ...process.env, HOPPER_DIR: tmp },
    encoding: 'utf-8',
  });
  assert.equal(result.status, 2, `in-progress must exit 2; got ${result.status}`);
  assert.match(result.stderr, /still in-progress/, 'must say still in-progress');
  assert.match(result.stderr, /--watch/, 'must suggest --watch');
});

test('6c-followup P2: copilot args() includes --allow-all-tools and --allow-all-paths', async () => {
  // T-AUDIT-PH6C-copilot dogfood: copilot non-interactive mode blocked every
  // write attempt and escalated to a General-purpose sub-agent that wrote to
  // the WRONG file (agy-output.md got contaminated). Fix: explicit allow flags.
  const { copilotAdapter } = await import('../../cli/src/vendors/copilot.js');
  const args = copilotAdapter.args('prompt', {});
  assert.ok(args.includes('--allow-all-tools'),
    `copilot must pass --allow-all-tools so dispatches can write their own output; got: ${args.join(' ')}`);
  assert.ok(args.includes('--allow-all-paths'),
    `copilot must pass --allow-all-paths so file writes aren't blocked; got: ${args.join(' ')}`);
});

test('kimi args() forwards -m and ignores opts.reasoning (0.x: no --thinking argv)', async () => {
  const { kimiAdapter } = await import('../../cli/src/vendors/kimi.js');
  const args = kimiAdapter.args('prompt', { reasoning: 'high', model: 'kimi-code/kimi-for-coding' });
  assert.ok(args.includes('-m'));
  assert.ok(args.includes('kimi-code/kimi-for-coding'));
  // reasoning is config-driven in Kimi Code 0.x — must NOT leak into argv
  assert.ok(!args.includes('--thinking') && !args.includes('--no-thinking'),
    `0.x must not emit a reasoning flag even when opts.reasoning set; got: ${args.join(' ')}`);
});

// ─── P2: soft-warn enhancement for Kimi alias introspection ────────────

test('P2 (manual-check): kimi soft-warn includes TOML snippet hint', async () => {
  // The hopper-dispatch warnIfModelUnknown helper writes to console.error
  // when vendor=kimi + alias introspection misses a model. Hard to unit
  // test without exec'ing the bin — assert the bin file contains the
  // expected hint string + recommended TOML snippet structure.
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { dirname, resolve, join: pathJoin } = await import('node:path');
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const REPO_ROOT = resolve(__dirname, '..', '..');
  const src = readFileSync(pathJoin(REPO_ROOT, 'cli', 'bin', 'hopper-dispatch'), 'utf-8');

  assert.match(src, /vendor === 'kimi'/,
    'soft-warn must include vendor-specific branch for kimi');
  assert.match(src, /\['partial', 'config-only'\]\.includes\(cached\.introspection_supported\)/,
    'soft-warn must handle both Kimi provider-list and config fallback introspection');
  assert.match(src, /\[models\."\$\{model\}"\]/,
    'soft-warn must print the [models."X"] TOML block snippet (0.x quoted key — aliases like kimi-code/kimi-for-coding contain a slash)');
  assert.match(src, /capabilities = \["thinking"\]/,
    'soft-warn must include capabilities hint for thinking-capable models');
});
