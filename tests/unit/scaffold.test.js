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

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const DISPATCH = join(REPO_ROOT, 'cli', 'bin', 'hopper-dispatch');
const KNOWN_ADAPTERS = ['codex', 'kimi', 'opencode', 'copilot', 'agy', 'grok'];

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

test('HOPPER-4: generated AGENTS.md resolves every task-type to a registered adapter', () => {
  const agents = parseAgentsContent(buildScaffoldFiles().find((f) => f.rel === 'AGENTS.md').content);
  for (const t of SCAFFOLD_TASK_TYPES) {
    const v = resolveVendor({ taskType: t, vendor: null }, agents);
    assert.ok(KNOWN_ADAPTERS.includes(v), `task-type '${t}' resolved to '${v}', not a known adapter`);
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
