// Dispatch orchestrator (Phase 1 integration glue)
// Anchor: cli/src/dispatch.js
//
// Per spec §3 #4 + #5: this is the THIN router. It reads protocol files,
// resolves task → vendor, composes prompt, and... STOPS. Actual subprocess
// spawn happens in T-PLUGIN-05a-e adapter implementations (Phase 2 / not
// yet wired in Phase 1 deliverable).
//
// Phase 1 deliverable: dispatch() returns a ResolvedTask + composed prompt
// without spawning. T-PLUGIN-05a-e adapters + final wiring lands in Phase 2+.

import { parseQueue, findEligibleTask, summarizeQueue } from './queue.js';
import { loadTaskFrame, composePrompt } from './tasks.js';
import { parseAgentsFile, resolveVendor } from './agents.js';
import { getAdapter } from './vendors/index.js';
import { resolveCommandWithKnownPaths } from './path-resolve.js';
import { runSubprocessOnce } from './subprocess.js';
import { resolveVendorCwd } from './background.js';
import { DEFAULT_DISPATCH_SANDBOX } from './validation.js';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const READ_ONLY_TASK_RE = /\b(?:read[-_\s]?only|readonly)\b|只读/i;
const NEGATED_READ_ONLY_RE = /\b(?:not|non|is\s+not|isn't)\s+(?:read[-_\s]?only|readonly)\b|(?:不是|非)\s*只读/i;

/**
 * Resolve a task for dispatch (Phase 1 stops here; Phase 2 calls vendor adapter).
 *
 * @param {object} args
 * @param {string} args.hopperDir          Path to .hopper/ directory
 * @param {string} args.taskId             Task ID to dispatch
 * @returns {Promise<{
 *   task: import('./types.js').TaskRow,
 *   frame: string,
 *   vendor: string,
 *   composedPrompt: string,
 *   taskSpec: string
 * }>}
 */
export async function resolveDispatch({ hopperDir, taskId }) {
  // 1. Read queue.md, find task by ID
  const queuePath = join(hopperDir, 'queue.md');
  const tasks = await parseQueue(queuePath);
  const { task, reason } = findEligibleTask(tasks, taskId);
  if (!task) {
    throw new Error(`Task not eligible: ${reason}`);
  }

  // 2. Load task-type frame
  const frame = await loadTaskFrame(hopperDir, task.taskType);

  // 3. Resolve vendor via AGENTS.md (deterministic, no retry state)
  const agentsPath = join(hopperDir, 'AGENTS.md');
  const agentsData = await parseAgentsFile(agentsPath);
  const vendor = resolveVendor(task, agentsData);

  // 4. Read task spec (from leader-tasklist.md if present)
  const taskSpec = await loadTaskSpec(hopperDir, taskId);

  // 5. Compose prompt (frame + spec)
  const composedPrompt = composePrompt(frame, taskSpec);

  return { task, frame, vendor, composedPrompt, taskSpec };
}

async function loadTaskSpec(hopperDir, taskId) {
  // Try .hopper/handoffs/leader-tasklist.md and extract the relevant section
  const path = join(hopperDir, 'handoffs', 'leader-tasklist.md');
  try {
    const content = await readFile(path, 'utf-8');
    // Find a section starting with **<task-id>** or ## <task-id> or ### <task-id>
    const escapedId = taskId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const sectionStart = content.search(new RegExp(
      `(\\*\\*${escapedId}\\*\\*|^##+\\s+${escapedId}\\b|^\\|\\s*${escapedId}\\s*\\|)`,
      'm'
    ));
    if (sectionStart === -1) {
      return `(no detailed spec found for ${taskId} in leader-tasklist.md; using queue.md brief only)`;
    }
    // Take the next ~80 lines as the task spec (or until next H2 heading)
    const rest = content.slice(sectionStart);
    const nextH2 = rest.slice(50).search(/^##\s+/m);
    const end = nextH2 === -1 ? Math.min(rest.length, 8000) : 50 + nextH2;
    return rest.slice(0, end).trim();
  } catch (err) {
    if (err.code === 'ENOENT') {
      return `(no leader-tasklist.md found at ${path}; using queue.md brief only)`;
    }
    throw err;
  }
}

/**
 * Status summary for --status command.
 *
 * @param {string} hopperDir
 */
export async function getStatus(hopperDir) {
  const queuePath = join(hopperDir, 'queue.md');
  const tasks = await parseQueue(queuePath);
  return summarizeQueue(tasks);
}

/**
 * Return true only when the queue brief or detailed task spec explicitly says
 * the task is read-only. We intentionally do not infer read-only from task-type
 * names like "review"; the product default is full vendor write access unless
 * the task description itself says read-only / 只读.
 *
 * @param {object} resolved
 */
export function taskTextRequestsReadOnly(resolved) {
  const text = [
    resolved?.task?.brief,
    resolved?.taskSpec,
  ].filter(Boolean).join('\n');
  if (!text) return false;
  if (NEGATED_READ_ONLY_RE.test(text)) return false;
  return READ_ONLY_TASK_RE.test(text);
}

/**
 * Apply the product-level default permission policy to adapter opts.
 * Explicit --sandbox always wins; otherwise read-only text downgrades, and all
 * other tasks default to danger-full-access.
 *
 * @param {object} resolved
 * @param {import('./types.js').AdapterOpts} [adapterOpts]
 * @returns {import('./types.js').AdapterOpts}
 */
export function resolveAdapterOptsForTask(resolved, adapterOpts = {}) {
  if (adapterOpts.sandbox) return { ...adapterOpts };
  return {
    ...adapterOpts,
    sandbox: taskTextRequestsReadOnly(resolved) ? 'read-only' : DEFAULT_DISPATCH_SANDBOX,
  };
}

/**
 * Execute dispatch end-to-end: resolve + adapter preflight + subprocess spawn + parse.
 *
 * Per spec §3 #4 (no harness reaction core): ONE adapter call = ONE subprocess
 * spawn attempt. No retry on failure. If adapter.envPreflight() returns ok=false,
 * we abort BEFORE spawning (no point invoking known-broken environment).
 *
 * @param {object} args
 * @param {string} args.hopperDir
 * @param {string} args.taskId
 * @param {import('./types.js').AdapterOpts} [args.adapterOpts]
 * @returns {Promise<{
 *   task: import('./types.js').TaskRow,
 *   vendor: string,
 *   output: import('./types.js').TaskOutput,
 *   raw: import('./types.js').SubprocessResult,
 * }>}
 */
export async function executeDispatch({ hopperDir, taskId, adapterOpts = {} }) {
  const resolved = await resolveDispatch({ hopperDir, taskId });
  const adapter = getAdapter(resolved.vendor);
  // Retro #3 fix: sync-mode vendor runs in the repo root that owns .hopper/
  // (or $HOPPER_VENDOR_CWD if set), not the dir hopper-dispatch was invoked from.
  return executeWithAdapter({ resolved, adapter, adapterOpts, cwd: resolveVendorCwd(hopperDir) });
}

/**
 * Lower-level dispatch entry: takes already-resolved task + adapter directly.
 * Enables E2E testing per codex Phase 2 audit F3 (inject a fake adapter +
 * counter-binary to prove one-spawn-per-dispatch end-to-end).
 *
 * @param {object} args
 * @param {object} args.resolved      Output of resolveDispatch
 * @param {import('./types.js').VendorAdapter} args.adapter
 * @param {import('./types.js').AdapterOpts} [args.adapterOpts]
 */
export async function executeWithAdapter({ resolved, adapter, adapterOpts = {}, cwd = null }) {
  const { task, vendor, composedPrompt } = resolved;
  const dispatchAdapterOpts = resolveAdapterOptsForTask(resolved, adapterOpts);

  // envPreflight — if not ok, fail FAST without spawning subprocess
  const preflight = adapter.envPreflight();
  if (!preflight.ok) {
    return {
      task,
      vendor,
      output: {
        text: '',
        status: 'auth-fail',
        error: `Adapter ${vendor} preflight failed: ${preflight.missing.join(' | ')}`,
      },
      raw: { exitCode: -1, stdout: '', stderr: '', timedOut: false, durationMs: 0 },
    };
  }

  // Prepare log file if adapter wants one (codex F2 silent-fail detection)
  let logPath = null;
  if (typeof adapter.prepareLog === 'function') {
    const hint = adapter.prepareLog(task.id, adapter.name);
    logPath = hint.logPath || null;
  }

  // Build args (adapter may want logFile threaded through opts).
  // Phase 6c F1: include task.taskType so timeoutMs can apply review-task floor.
  // Thread the resolved vendor CWD through opts so adapters that take a
  // working-dir flag (e.g. opencode --dir) can pass it explicitly.
  const effectiveOpts = { ...dispatchAdapterOpts, logFile: logPath, taskType: task.taskType, cwd: cwd || undefined };
  const args = adapter.args(composedPrompt, effectiveOpts);

  // Spawn subprocess ONCE (per spec §3 #4).
  // Phase 6c F2: resolve adapter.command with deterministic known-install
  // paths (NOT vendor-retry orchestration) so installers that don't add
  // their bin to PATH (agy on Windows) still work.
  const resolvedCmd = resolveCommandWithKnownPaths(adapter.command, adapter.knownInstallPaths || []);
  const spawnCommand = resolvedCmd ? resolvedCmd.command : adapter.command;
  const spawnArgs = resolvedCmd && resolvedCmd.prependArgs.length > 0
    ? [...resolvedCmd.prependArgs, ...args]
    : args;

  const stdinInput = adapter.stdinMode === 'pipe' ? composedPrompt : null;
  // HOPPER-3: optional adapter env (e.g. codex CODEX_HOME auto-isolation).
  const adapterEnv = typeof adapter.env === 'function' ? adapter.env(effectiveOpts) : undefined;
  const raw = await runSubprocessOnce({
    command: spawnCommand,
    args: spawnArgs,
    stdinInput,
    timeoutMs: adapter.timeoutMs(effectiveOpts),
    logFilePath: logPath,
    vendorName: adapter.name,
    cwd: cwd || undefined,
    env: adapterEnv,
  });

  // Parse result (adapter-specific failure classification)
  const output = adapter.parseResult(raw);

  return { task, vendor, output, raw };
}
