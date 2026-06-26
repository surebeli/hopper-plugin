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
import { resolveGovernance } from './governance.js';
import { getAdapter } from './vendors/index.js';
import { normalizeModel } from './model-normalize.js';
import { resolveCommandWithKnownPaths } from './path-resolve.js';
import { runSubprocessOnce, resolveDispatchTimeouts } from './subprocess.js';
import { resolveVendorCwd } from './background.js';
import { resolvePromptDelivery } from './prompt-delivery.js';
import {
  resolveDefaultReasoning, resolveDefaultSandbox,
  READ_ONLY_DEFAULT_TASK_TYPES, WEB_SEARCH_TASK_TYPES,
  validateTaskId, TASK_TYPE_PATTERN, VENDOR_PATTERN,
} from './validation.js';
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
export async function resolveDispatch({ hopperDir, taskId, vendorOverride = null }) {
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
  // --vendor override wins over the AGENTS.md routing tables; host != vendor and
  // unknown-vendor checks still apply downstream (the dispatcher validates both).
  const vendor = vendorOverride || resolveVendor(task, agentsData);

  // 4. Read task spec (from leader-tasklist.md if present)
  const taskSpec = await loadTaskSpec(hopperDir, taskId);

  // 5. Resolve optional governance overlay (keyed on the resolved vendor) and
  // compose. resolveGovernance is pure file I/O — no subprocess (spec §3 #4).
  const governance = await resolveGovernance({ hopperDir, vendor, task });
  const composedPrompt = composePrompt(frame, taskSpec, { governance });

  return { task, frame, vendor, composedPrompt, taskSpec };
}

/**
 * Resolve an AD-HOC dispatch — a one-off task with NO queue.md row; the brief IS
 * the spec. Used by the directed commands (/hopper:review|research|market) and the
 * swarm so they need not author (and pollute) queue.md. Returns the same shape as
 * resolveDispatch, so the caller's single-spawn / host!=vendor guarantees apply
 * identically. Read-only/web-search task-type defaults still come from
 * resolveAdapterOptsForTask downstream.
 *
 * @param {object} args
 * @param {string} args.hopperDir
 * @param {string} args.taskType        a scaffolded task-type (its frame must exist)
 * @param {string} args.brief           the task brief (becomes the spec)
 * @param {string} args.id              the synthetic task-id (for output files)
 * @param {string|null} [args.vendorOverride]
 * @returns {Promise<{task: object, frame: string, vendor: string, composedPrompt: string, taskSpec: string}>}
 */
export async function resolveAdhocDispatch({ hopperDir, taskType, brief, id, vendorOverride = null }) {
  validateTaskId(id);
  if (typeof taskType !== 'string' || !TASK_TYPE_PATTERN.test(taskType)) {
    throw new Error(`Invalid --task-type "${taskType}" (expected lowercase like prd-research / code-review-acceptance).`);
  }
  if (typeof brief !== 'string' || brief.trim().length === 0) {
    throw new Error('Ad-hoc dispatch requires a non-empty --brief.');
  }
  // Frame must exist for the task-type (same loader as the queued path).
  const frame = await loadTaskFrame(hopperDir, taskType);
  const task = { id, taskType, brief, status: 'pending', depends: [] };  // shape parity with queue TaskRow
  const agentsData = await parseAgentsFile(join(hopperDir, 'AGENTS.md'));
  const vendor = vendorOverride || resolveVendor(task, agentsData);
  if (!vendor) {
    throw new Error(`No vendor resolved for ad-hoc task-type "${taskType}". Pass --vendor <name> (no AGENTS.md preference found).`);
  }
  const taskSpec = brief;
  const governance = await resolveGovernance({ hopperDir, vendor, task });
  const composedPrompt = composePrompt(frame, taskSpec, { governance });
  return { task, frame, vendor, composedPrompt, taskSpec };
}

/**
 * Plan a multi-vendor SWARM (panel) — fan the SAME qualitative brief out to N vendors,
 * each as its own ad-hoc dispatch (one single-spawn per panelist; N tasks, not N retries).
 * PURE: validates + returns the per-panelist plan; the caller dispatches each via the
 * normal ad-hoc path. Restricted to READ-ONLY/qualitative task-types — swarming a write
 * task would have N vendors edit the same files. The vendor *selection* + per-vendor config
 * is a host-side confirmation gate; this only executes the confirmed list.
 *
 * @param {object} args
 * @param {string} args.taskType   a read-only/qualitative task-type (review/research/audit)
 * @param {string} args.brief
 * @param {string[]|string} args.vendors   panelists (array or comma-separated)
 * @param {string} [args.idBase]
 * @returns {Array<{ vendor: string, id: string, taskType: string, brief: string }>}
 */
export function planSwarm({ taskType, brief, vendors, idBase, now = Date.now() }) {
  if (typeof taskType !== 'string' || !TASK_TYPE_PATTERN.test(taskType)) {
    throw new Error(`Invalid --task-type "${taskType}".`);
  }
  if (!READ_ONLY_DEFAULT_TASK_TYPES.includes(taskType)) {
    throw new Error(`--swarm only supports read-only/qualitative task-types (${READ_ONLY_DEFAULT_TASK_TYPES.join(', ')}); got "${taskType}". Swarming a write task would have N vendors edit the same files.`);
  }
  if (typeof brief !== 'string' || brief.trim().length === 0) {
    throw new Error('--swarm requires a non-empty --brief.');
  }
  const list = (Array.isArray(vendors) ? vendors : String(vendors || '').split(','))
    .map((v) => v.trim()).filter(Boolean);
  const uniq = [...new Set(list)];
  if (uniq.length < 2) {
    throw new Error('--swarm needs at least 2 vendors (--vendors v1,v2,...). Use --adhoc for a single vendor.');
  }
  for (const v of uniq) {
    if (!VENDOR_PATTERN.test(v)) throw new Error(`Invalid vendor name "${v}" in --vendors.`);
  }
  const base = idBase || `swarm-${taskType}-${now.toString(36)}`;
  validateTaskId(base);
  return uniq.map((vendor) => ({ vendor, id: `${base}-${vendor}`, taskType, brief }));
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
  const out = { ...adapterOpts };
  const taskType = resolved?.task?.taskType;
  // V4: normalize a user-specified model to the vendor's canonical name (fuzzy-match against
  // knownGood; advisory — passthrough if no confident match). Single chokepoint — every
  // dispatch path (sync / background / adhoc / swarm) flows through resolveAdapterOptsForTask.
  if (out.model && resolved?.vendor) {
    try {
      const kg = getAdapter(resolved.vendor)?.capabilities?.modelArg?.knownGood || [];
      out.model = normalizeModel(resolved.vendor, out.model, kg);
    } catch (_) { /* normalization is advisory; keep the original on any error */ }
  }
  // Permission default (precedence, most specific first):
  //   1. explicit --sandbox (already in out.sandbox) wins
  //   2. read-only task TEXT (brief/spec says read-only / 只读)
  //   3. read-only-by-default TASK-TYPE (review / research — must not edit the repo)
  //   4. global HOPPER_DEFAULT_SANDBOX, else the product default (danger-full-access)
  // codex has NO read-only scenario when its sandbox bypass is active (the default): the
  // `-s` harness is broken on Windows (CreateProcessWithLogonW 1326 kills every child — see
  // codex.js), so codex ALWAYS runs full-access and the read-only INTENT of review/research
  // rides in the executor prompt frame, not the OS sandbox. Force the resolved sandbox to
  // full-access so the displayed value matches what the adapter actually runs — this overrides
  // even an explicit --sandbox, which codex cannot honor here (showing read-only while running
  // full-access would be a lie). The HOPPER_CODEX_SANDBOX_BYPASS=0 escape hatch (POSIX, where
  // -s spawns children fine) falls through to the normal precedence below, so an escape-hatch
  // user still gets a working read-only downgrade for review/research.
  const codexAlwaysFullAccess = resolved?.vendor === 'codex'
    && process.env.HOPPER_CODEX_SANDBOX_BYPASS !== '0';
  if (codexAlwaysFullAccess) {
    out.sandbox = 'danger-full-access';
  } else if (!out.sandbox) {
    if (taskTextRequestsReadOnly(resolved)) out.sandbox = 'read-only';
    else if (taskType && READ_ONLY_DEFAULT_TASK_TYPES.includes(taskType)) out.sandbox = 'read-only';
    else out.sandbox = resolveDefaultSandbox();
  }
  // Web search: auto-enable for web-needing task-types (prd-research / market-research)
  // unless the caller already decided. An explicit --web-search sets out.webSearch=true
  // before this runs; only web-capable adapters (codex/claude/copilot) act on it.
  if (out.webSearch == null && taskType && WEB_SEARCH_TASK_TYPES.includes(taskType)) {
    out.webSearch = true;
  }
  // Reasoning/effort default: max out unless the caller passed --reasoning. Only
  // codex/grok/mimo consume it (kimi/opencode/copilot/agy/claude ignore it
  // harmlessly). This is safe BY DESIGN together with the idle-timeout primitive:
  // a slower max-effort run is not killed for being slow, only for going silent.
  // Env-tunable via HOPPER_DEFAULT_REASONING. Injected at the DISPATCH layer (not
  // in each adapter), so adapters' own opt-in defaults — and their unit tests —
  // are unaffected.
  if (out.reasoning == null) {
    out.reasoning = resolveDefaultReasoning();
  }
  return out;
}

/**
 * Dispatch gate: refuse to dispatch to a vendor whose adapter declares `dispatchDisabled`
 * unless the caller has explicitly opted in via that adapter's `enableEnv` (=== '1'). This is
 * the single chokepoint enforced by BOTH the sync and background dispatch paths (and swarm,
 * which fans out through the background path), so a disabled vendor cannot be reached by any
 * route — `--vendor`, AGENTS.md routing, adhoc, or panel. Non-dispatch surfaces (doctor /
 * --vendors / --resolve) do NOT call this, so a disabled vendor is still listed + introspectable.
 * Throws a clear, actionable Error when blocked; returns silently otherwise.
 * @param {string} vendor
 * @param {Record<string,string|undefined>} [env]
 */
export function assertVendorDispatchable(vendor, env = process.env) {
  let adapter;
  try { adapter = getAdapter(vendor); } catch (_) { return; } // unknown vendor handled elsewhere
  const gate = adapter && adapter.dispatchDisabled;
  if (!gate) return;
  if (env[gate.enableEnv] === '1') return; // explicit opt-in
  throw new Error(
    `Dispatch to vendor '${vendor}' is DISABLED: ${gate.reason} `
    + `If you understand the limitation and still want to dispatch, set ${gate.enableEnv}=1.`,
  );
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
  return executeWithAdapter({ resolved, adapter, adapterOpts, cwd: resolveVendorCwd(hopperDir), hopperDir });
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
export async function executeWithAdapter({ resolved, adapter, adapterOpts = {}, cwd = null, hopperDir = null }) {
  const { task, vendor, composedPrompt } = resolved;
  // Dispatch gate — the canonical sync spawn chokepoint (covers the CLI sync path AND any other
  // caller, e.g. executeDispatch). A vendor disabled by capability (agy headless-output) is
  // blocked here unless explicitly opted in. Throws before any subprocess is spawned.
  assertVendorDispatchable(vendor);
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

  // Spawn subprocess ONCE (per spec §3 #4).
  // Phase 6c F2: resolve adapter.command with deterministic known-install
  // paths (NOT vendor-retry orchestration) so installers that don't add
  // their bin to PATH (agy on Windows) still work. Resolved FIRST so size-gated
  // prompt delivery knows the OS command-line regime (cmd.exe shim vs native .exe).
  const resolvedCmd = resolveCommandWithKnownPaths(adapter.command, adapter.knownInstallPaths || []);
  const spawnCommand = resolvedCmd ? resolvedCmd.command : adapter.command;
  const prependArgs = resolvedCmd ? resolvedCmd.prependArgs : [];

  // Size-gated prompt delivery (ISSUE-codex-bypass-flag-missing-from-argv): inline
  // small prompts; for an over-budget command line write handoffs/<task>-prompt.md
  // and pass the vendor a small "read this file" pointer. Needs hopperDir to locate
  // handoffs/; without it (e.g. direct-injected E2E adapters) fall back to inline.
  let args;
  let delivery = null;
  if (hopperDir) {
    delivery = resolvePromptDelivery({
      adapter, composedPrompt, opts: effectiveOpts,
      resolvedCmd: spawnCommand, prependArgs,
      handoffsDir: join(hopperDir, 'handoffs'), taskId: task.id,
    });
    if (delivery.fallbackReason) {
      // Pointer delivery was wanted but unusable → INLINE with bytes > budget (the
      // silent-no-op risk class). Surface it instead of falling back quietly.
      process.stderr.write(`hopper: WARNING prompt-file delivery fell back to INLINE — ${delivery.fallbackReason}. Command line ${delivery.bytes}B (budget ${delivery.budget}B, ${delivery.regime}); may be truncated on Windows cmd.exe.\n`);
    }
    args = delivery.args;
  } else {
    args = adapter.args(composedPrompt, effectiveOpts);
  }
  const spawnArgs = prependArgs.length > 0 ? [...prependArgs, ...args] : args;

  // STDIN delivery (win-cmd-shim): the delivery layer routes the full prompt to stdin
  // (adapter emitted a sentinel in argv). Prefer it over the static stdinMode check.
  const stdinInput = (delivery && delivery.channel === 'stdin' && delivery.stdinPrompt != null)
    ? delivery.stdinPrompt
    : (adapter.stdinMode === 'pipe' ? composedPrompt : null);
  // HOPPER-3: optional adapter env (e.g. codex CODEX_HOME auto-isolation).
  const adapterEnv = typeof adapter.env === 'function' ? adapter.env(effectiveOpts) : undefined;
  // 乙: idle + ceiling instead of a single total cap. The per-vendor
  // adapter.timeoutMs() now seeds the ceiling (floored to ≥30 min); idle (silence)
  // is the real "stuck" detector. --timeout / HOPPER_DISPATCH_TIMEOUT_MS override
  // the ceiling; HOPPER_IDLE_TIMEOUT_MS overrides idle.
  const { idleMs, ceilingMs } = resolveDispatchTimeouts(adapter.timeoutMs(effectiveOpts), effectiveOpts);
  const raw = await runSubprocessOnce({
    command: spawnCommand,
    args: spawnArgs,
    stdinInput,
    timeoutMs: ceilingMs,
    idleMs,
    logFilePath: logPath,
    vendorName: adapter.name,
    cwd: cwd || undefined,
    env: adapterEnv,
  });

  // Parse result (adapter-specific failure classification)
  const output = adapter.parseResult(raw);

  return { task, vendor, output, raw };
}
