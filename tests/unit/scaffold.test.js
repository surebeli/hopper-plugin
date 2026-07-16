// HOPPER-4: `hopper-dispatch --init-tasks` scaffolds a full .hopper/ workspace.
// Anchor: tests/unit/scaffold.test.js

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { scaffoldHopper, buildScaffoldFiles, SCAFFOLD_TASK_TYPES } from '../../cli/src/scaffold.js';
import { parseQueueContent, findEligibleTask } from '../../cli/src/queue.js';
import { parseAgentsContent, resolveVendor } from '../../cli/src/agents.js';
import { verifyFrameAntiPersona } from '../../cli/src/tasks.js';
import { validateTaskType } from '../../cli/src/validation.js';
import { listAdapters } from '../../cli/src/vendors/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const DISPATCH = join(REPO_ROOT, 'cli', 'bin', 'hopper-dispatch');

function runInCwd(args, cwd) {
  const env = { ...process.env };
  delete env.HOPPER_DIR;  // exercise the real cwd-walk
  try {
    const stdout = execFileSync(process.execPath, [DISPATCH, ...args], {
      cwd, env, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf-8',
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err) {
    return {
      stdout: err.stdout ? err.stdout.toString() : '',
      stderr: err.stderr ? err.stderr.toString() : '',
      exitCode: err.status,
    };
  }
}

// ─── Module-level behavior ────────────────────────────────────────────

test('HOPPER-4: scaffold writes a complete .hopper/ tree', () => {
  const root = mkdtempSync(join(tmpdir(), 'hopper-scaffold-'));
  try {
    const res = scaffoldHopper(root);
    const hd = join(root, '.hopper');
    assert.ok(existsSync(join(hd, 'queue.md')));
    assert.ok(existsSync(join(hd, 'AGENTS.md')));
    assert.ok(existsSync(join(hd, 'COST-LOG.md')));
    assert.ok(existsSync(join(hd, 'handoffs', 'leader-tasklist.md')));
    for (const t of SCAFFOLD_TASK_TYPES) {
      assert.ok(existsSync(join(hd, 'tasks', `${t}.md`)), `tasks/${t}.md must exist`);
    }
    assert.equal(res.overwritten, false);
    assert.equal(res.written.length, buildScaffoldFiles().length);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('HOPPER-4: scaffold refuses to overwrite without force, then force overwrites', () => {
  const root = mkdtempSync(join(tmpdir(), 'hopper-scaffold-'));
  try {
    scaffoldHopper(root);
    assert.throws(() => scaffoldHopper(root), (e) => e.code === 'EHOPPEREXISTS');
    const res = scaffoldHopper(root, { force: true });
    assert.equal(res.overwritten, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('HOPPER-4: generated queue.md parses; the example row is eligible', () => {
  const queue = buildScaffoldFiles().find((f) => f.rel === 'queue.md').content;
  const tasks = parseQueueContent(queue);
  assert.ok(tasks.length >= 1, 'queue must have at least the example row');
  const { task, reason } = findEligibleTask(tasks, 'T-EXAMPLE-001');
  assert.ok(task, `example task must be eligible; reason=${reason}`);
  assert.equal(task.taskType, 'code-impl');
});

test('HOPPER-4: generated AGENTS.md ships NO vendor defaults — every task-type is unbound by design, with a clear pointer error', () => {
  // Vendor names are project-specific (the pool on this machine won't match the
  // author's); scaffolding a concrete default would rot the moment the project's
  // vendor pool differs. The task-vendor-preference table ships with every row's
  // Default vendor column as the `(bind per project)` placeholder, which the
  // AGENTS.md parser treats as an OOB marker (unbound), not a real binding.
  const { agents, preferences } = parseAgentsContent(buildScaffoldFiles().find((f) => f.rel === 'AGENTS.md').content);
  assert.deepEqual(preferences, {}, 'scaffold must not preset any task-type -> vendor binding');
  for (const t of SCAFFOLD_TASK_TYPES) {
    assert.throws(
      () => resolveVendor({ taskType: t, vendor: null, id: 'T-TEST' }, { agents, preferences }),
      /No vendor binding for task-type '.*'\. Bind a vendor in \.hopper\/AGENTS\.md/,
      `task-type '${t}' must throw a clear AGENTS.md-pointing error, not silently resolve`,
    );
  }
});

test('HOPPER-4: every generated task frame states an abstract Recommended execution profile with NO vendor name', () => {
  const adapters = listAdapters(); // e.g. codex, kimi, opencode, copilot, agy, grok, mimo, claude
  for (const t of SCAFFOLD_TASK_TYPES) {
    const frame = buildScaffoldFiles().find((f) => f.rel === join('tasks', `${t}.md`)).content;
    assert.match(frame, /\*\*Recommended execution profile\*\*:/, `${t}.md must state a recommended execution profile`);
    const profileLine = frame.match(/\*\*Recommended execution profile\*\*:.*/)[0];
    for (const v of adapters) {
      assert.ok(
        !new RegExp(`\\b${v}\\b`, 'i').test(profileLine),
        `${t}.md profile line names vendor '${v}'; profiles must stay vendor-agnostic: "${profileLine}"`,
      );
    }
  }
});

test('HOPPER-4: AGENTS.md task-vendor-preference table recommends abstract profiles, no vendor names, and its Default vendor column is unbound', () => {
  const adapters = listAdapters();
  const agentsMd = buildScaffoldFiles().find((f) => f.rel === 'AGENTS.md').content;
  assert.match(agentsMd, /\| Task-type \| Default vendor \| Recommended profile \|/, 'table header must have a Recommended profile column');
  const tableStart = agentsMd.indexOf('## Task-type → vendor default preference');
  const tableSection = agentsMd.slice(tableStart, agentsMd.indexOf('## Reassignment'));
  for (const t of SCAFFOLD_TASK_TYPES) {
    assert.match(tableSection, new RegExp(`\`${t}\` \\| \\(bind per project\\) \\|`), `${t} row's Default vendor must be the unbound placeholder`);
  }
  // The vendor pool differs per project (test-harnessloop's own .hopper/AGENTS.md
  // dropped two rows whose vendor was never installed) — the shipped table must
  // not reintroduce a concrete vendor name in the BINDING columns (Default vendor /
  // Recommended profile) that could rot the same way.
  //
  // Batch 2 added Effort policy / Model rule columns (4th/5th). Effort policy's
  // shipped default is DELIBERATELY a per-vendor table (`codex:xhigh, grok:high`
  // for review task-types) — that is advisory metadata consumed only once a vendor
  // is actually bound (Default vendor is still `(bind per project)` on every row,
  // asserted above), not a binding itself: an uninstalled codex/grok never dispatches
  // anything, the per-vendor entry just sits inert. So the vendor-name-absence check
  // is scoped to the first 3 cells (Task-type | Default vendor | Recommended profile)
  // — the columns this test was written against — rather than the whole row.
  const rows = tableSection.split('\n').filter((l) => l.trim().startsWith('| `'));
  assert.equal(rows.length, SCAFFOLD_TASK_TYPES.length);
  for (const row of rows) {
    const bindingCells = row.split('|').slice(0, 4).join('|'); // '' | Task-type | Default vendor | Recommended profile
    for (const v of adapters) {
      assert.ok(!new RegExp(`\\b${v}\\b`, 'i').test(bindingCells), `binding columns name vendor '${v}': "${bindingCells}"`);
    }
  }
});

test('batch 2: AGENTS.md task-vendor-preference table has Effort policy / Model rule columns with machine-parsable defaults', () => {
  const agentsMd = buildScaffoldFiles().find((f) => f.rel === 'AGENTS.md').content;
  assert.match(agentsMd, /\| Task-type \| Default vendor \| Recommended profile \| Effort policy \| Model rule \|/, 'header must have both new columns');
  const { policies } = parseAgentsContent(agentsMd);
  for (const t of SCAFFOLD_TASK_TYPES) {
    assert.ok(policies[t], `${t} must have a policies entry`);
    assert.equal(policies[t].modelRule.trim(), 'verified-latest', `${t} Model rule must default to the verified-latest sentinel`);
  }
  // review task-types get the per-vendor table; research task-types get a single
  // token; everything else stays the unbound OOB placeholder (same convention as
  // Default vendor).
  for (const t of ['code-review-adversarial', 'code-review-acceptance']) {
    assert.equal(policies[t].effortPolicy.trim(), 'codex:xhigh, grok:high', `${t} Effort policy`);
  }
  for (const t of ['prd-research', 'market-research']) {
    assert.equal(policies[t].effortPolicy.trim(), 'medium', `${t} Effort policy`);
  }
  for (const t of ['spec-write', 'code-impl', 'sidecar-polish', 'spec-blindspot-hunt']) {
    assert.equal(policies[t].effortPolicy.trim(), '(bind per project)', `${t} Effort policy must stay unbound`);
  }
});

test('HOPPER-4: every generated task frame is anti-persona-clean and a valid task-type', () => {
  for (const f of buildScaffoldFiles().filter((x) => x.rel.includes('tasks'))) {
    const { ok, hits } = verifyFrameAntiPersona(f.content);
    assert.ok(ok, `${f.rel} contains banned persona phrases: ${hits.join(', ')}`);
    assert.ok(f.content.trim().length > 0, `${f.rel} must be non-empty`);
  }
  for (const t of SCAFFOLD_TASK_TYPES) {
    assert.doesNotThrow(() => validateTaskType(t), `'${t}' must be a valid task-type`);
  }
});

// ─── CLI behavior ─────────────────────────────────────────────────────

test('HOPPER-4: --init-tasks scaffolds in cwd, is idempotent, and the queue parses', () => {
  const root = mkdtempSync(join(tmpdir(), 'hopper-init-cli-'));
  try {
    const r1 = runInCwd(['--init-tasks'], root);
    assert.equal(r1.exitCode, 0, `init failed: ${r1.stderr}`);
    assert.match(r1.stdout, /scaffolded \.hopper\//i);
    assert.ok(existsSync(join(root, '.hopper', 'queue.md')));

    // Second run refuses (exit 3) without --force.
    const r2 = runInCwd(['--init-tasks'], root);
    assert.equal(r2.exitCode, 3);
    assert.match(r2.stderr, /refusing to overwrite/i);

    // --force overwrites.
    const r3 = runInCwd(['--init-tasks', '--force'], root);
    assert.equal(r3.exitCode, 0);

    // The freshly scaffolded queue parses via --status.
    const r4 = runInCwd(['--status'], root);
    assert.equal(r4.exitCode, 0, `status failed: ${r4.stderr}`);
    assert.match(r4.stdout, /Pending:\s+1/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
