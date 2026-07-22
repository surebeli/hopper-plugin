// Shared subprocess wrapper (T-PLUGIN-04.5)
// Anchor: cli/src/subprocess.js
//
// Per spec v2.0.3 §3 #4 (no harness reaction core):
//   ONE dispatch = ONE selected vendor = ONE subprocess spawn attempt = success OR specific failure.
//   No retry. No fallback. No backoff. No circuit breaker.
//
// Per codex v2.0.3 audit F3 (subprocess kill strategy):
//   Windows: taskkill /PID <pid> /T /F  (kill tree, force)
//   Unix:    spawn detached + process.kill(-pid, 'SIGKILL')  (negative PID = process group)
//   NOT by port — children may be unrelated.

import { spawn, execSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { prepareSubjectRootGuard, wrapSubjectRootInvocation } from './subject-root-guard.js';

// Phase 6c F1: task-type-aware timeout floors.
// Adapter-native timeoutMs is tuned for code-impl (short tasks). Review tasks
// inherently need 30+ min because the reviewer reads dozens of files, runs the
// test suite, then writes findings. Without this floor, the 5-vendor dogfood
// audit on 2026-05-21 had all 5 vendors timeout before writing a verdict.
// See docs/audit/phase-6b-dogfood-5vendor.md for the meta-finding.
const REVIEW_TASK_TYPES = new Set([
  'code-review-adversarial',
  'code-review-acceptance',
]);
const REVIEW_TASK_FLOOR_MS = 1_800_000;  // 30 min floor for any review task
const SERIAL_VENDOR_LOCK_POLL_MS = 250;
const SERIAL_VENDOR_LOCK_STALE_MS = 3_600_000;
const SERIALIZED_VENDORS = new Set(['codex']);

/**
 * Apply task-type-aware floor to an adapter-native timeout.
 * - For review task-types: returns max(native, REVIEW_TASK_FLOOR_MS).
 *   Lets a vendor like codex with reasoning=xhigh still extend beyond the
 *   floor if it wants more time; capped vendors get raised TO the floor.
 * - For non-review task-types: returns native unchanged.
 *
 * Adapters call this from their `timeoutMs(opts)` implementation. The
 * dispatch/runner path is responsible for setting `opts.taskType`.
 */
export function applyTaskTypeFloor(nativeMs, opts) {
  if (!opts || !opts.taskType) return nativeMs;
  if (REVIEW_TASK_TYPES.has(opts.taskType)) {
    return Math.max(nativeMs, REVIEW_TASK_FLOOR_MS);
  }
  return nativeMs;
}

export { REVIEW_TASK_TYPES, REVIEW_TASK_FLOOR_MS };

// ── idle + ceiling timeout primitive (replaces the single total-wall-clock cap) ──
// The old design hard-killed at one per-vendor TOTAL timeout, which could not
// tell "hung" from "legitimately working on a long task" — see
// ISSUE-mimo-codeimpl-timeout (a 41-edit code-impl killed at the flat 180s).
// New design (two timers):
//   - idle timeout: kill ONLY after idleMs of ZERO output (stdout+stderr) — the
//     real "is it stuck" detector. An actively-streaming long task keeps
//     resetting it and is NOT killed (most agentic vendors stream json / log /
//     tool-call events under hopper's --format json / --print-logs flags).
//   - absolute ceiling: a generous safety net so a runaway can't live forever.
// Both env-overridable; an explicit per-task --timeout sets the ceiling.
const DEFAULT_IDLE_TIMEOUT_MS = 180_000;   // 3 min of silence ⇒ treat as stuck
const CEILING_FLOOR_MS = 1_800_000;        // ≥30 min absolute ceiling (safety net)

function envPositiveInt(name) {
  const v = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(v) && v > 0 ? v : null;
}

/**
 * Resolve {idleMs, ceilingMs} for a dispatch from the adapter baseline + env +
 * an optional explicit per-task override (--timeout → opts.timeoutOverrideMs).
 *
 * Ceiling precedence: explicit --timeout > HOPPER_DISPATCH_TIMEOUT_MS >
 *   max(adapter baseline, CEILING_FLOOR_MS).
 * Idle: HOPPER_IDLE_TIMEOUT_MS > DEFAULT_IDLE_TIMEOUT_MS, never above ceiling.
 *
 * @param {number} adapterBaselineMs  adapter.timeoutMs(opts) (per-vendor tuned)
 * @param {object} [opts]             may carry timeoutOverrideMs (ms)
 * @returns {{ idleMs: number, ceilingMs: number }}
 */
export function resolveDispatchTimeouts(adapterBaselineMs, opts = {}) {
  const idleMs = envPositiveInt('HOPPER_IDLE_TIMEOUT_MS') ?? DEFAULT_IDLE_TIMEOUT_MS;
  const override = Number.isFinite(opts?.timeoutOverrideMs) && opts.timeoutOverrideMs > 0
    ? opts.timeoutOverrideMs
    : null;
  const ceilingMs = override
    ?? envPositiveInt('HOPPER_DISPATCH_TIMEOUT_MS')
    ?? Math.max(Number(adapterBaselineMs) || 0, CEILING_FLOOR_MS);
  return { idleMs: Math.min(idleMs, ceilingMs), ceilingMs };
}

export { DEFAULT_IDLE_TIMEOUT_MS, CEILING_FLOOR_MS };

/**
 * Idle-detection helper for vendors that emit a periodic heartbeat to their log even when
 * otherwise idle (e.g. mimo's `--print-logs` GET /session/status poll). Raw log-size growth
 * never goes quiet for those, so the idle timer's "no growth = stuck" detector never fires and
 * a delivered-but-non-exiting process (the mimo background-exit hang) waits out the full
 * ceiling. Given a freshly-appended log chunk and a heartbeat matcher, returns true iff the
 * chunk contains at least one NON-empty line that is NOT a heartbeat line (i.e. real progress).
 * The runner resets the idle clock only on such substantive growth. Pure; exported for tests.
 * @param {string} chunk         newly-appended log bytes (decoded)
 * @param {RegExp} heartbeatRe   matches a heartbeat (noise) line; non-global
 * @returns {boolean}
 */
export function chunkHasSubstantiveLine(chunk, heartbeatRe) {
  if (!chunk) return false;
  for (const line of chunk.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    if (heartbeatRe && heartbeatRe.test(t)) continue;
    return true;
  }
  return false;
}

import { platform, tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Serialize selected vendors across processes when the upstream CLI cannot
 * safely share auth/session state concurrently. Current scope: codex only.
 *
 * @param {string | undefined} vendorName
 * @returns {Promise<() => void>} release callback
 */
export async function acquireVendorLock(vendorName) {
  if (!vendorName || !SERIALIZED_VENDORS.has(vendorName)) {
    return () => {};
  }

  const lockPath = join(tmpdir(), `hopper-${vendorName}.lock`);
  const lockToken = `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;

  while (true) {
    try {
      writeFileSync(lockPath, lockToken, { flag: 'wx' });
      return () => releaseVendorLock(lockPath, lockToken);
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      if (isVendorLockStale(lockPath)) {
        try {
          unlinkSync(lockPath);
          continue;
        } catch (_) {
          // Another process may have reclaimed it first.
        }
      }
      await new Promise((resolve) => setTimeout(resolve, SERIAL_VENDOR_LOCK_POLL_MS));
    }
  }
}

function releaseVendorLock(lockPath, lockToken) {
  try {
    if (!existsSync(lockPath)) return;
    const current = readFileSync(lockPath, 'utf-8');
    if (current === lockToken) unlinkSync(lockPath);
  } catch (_) {
    // best-effort; stale lock recovery handles crash leftovers
  }
}

function isVendorLockStale(lockPath) {
  try {
    return (Date.now() - statSync(lockPath).mtimeMs) > SERIAL_VENDOR_LOCK_STALE_MS;
  } catch (_) {
    return false;
  }
}

/**
 * Run a vendor subprocess EXACTLY ONCE with hard timeout + process-tree kill.
 *
 * @param {object} args
 * @param {string} args.command          CLI command (e.g. "codex", "kimi", "agy")
 * @param {string[]} args.args           Argv array
 * @param {string|null} args.stdinInput  Input to pipe to stdin (null = none)
 * @param {number} args.timeoutMs        Hard timeout
 * @param {object} [args.env]            Extra env vars (merged with process.env)
 * @param {string} [args.cwd]            Working directory
 * @param {string|null} [args.logFilePath]  Path to vendor --log-file (read after exit if set)
 * @param {string} [args.vendorName]     Logical vendor name for serialization guard
 * @param {string} [args.subjectRoot]     Explicit read-only subject tree, if requested
 * @param {string} [args.sandbox]         Effective sandbox used to validate subjectRoot
 * @param {object} [args.subjectGuardOptions] Test-only dependency overrides for guard validation
 * @returns {Promise<import('./types.js').SubprocessResult>}
 */
export async function runSubprocessOnce({
  command,
  args,
  stdinInput,
  timeoutMs,
  idleMs = 0,
  env,
  cwd,
  logFilePath = null,
  vendorName,
  subjectRoot = null,
  sandbox,
  subjectGuardOptions,
}) {
  const isWindows = platform() === 'win32';
  const startedAt = Date.now();
  // Validation/backend availability is deliberately before the vendor spawn and
  // before lock acquisition: a requested guard is mandatory, never advisory.
  const subjectGuard = prepareSubjectRootGuard({ subjectRoot, sandbox, ...(subjectGuardOptions || {}) });
  const invocation = wrapSubjectRootInvocation(command, args, subjectGuard);
  const releaseVendorLock = await acquireVendorLock(vendorName);

  try {
    const child = spawn(invocation.command, invocation.args, {
      env: { ...process.env, ...(env || {}) },
      cwd: cwd || process.cwd(),
      stdio: [stdinInput == null ? 'ignore' : 'pipe', 'pipe', 'pipe'],
      detached: !isWindows,                                       // Unix: detached process group for tree-kill
      windowsHide: isWindows,
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let timeoutReason = null;     // 'idle' | 'ceiling' (diagnostic)
    let processCleanup = { status: 'not-needed', method: null };
    let killTimer = null;
    let idleTimer = null;

    const clearTimeoutTimers = () => {
      if (killTimer) clearTimeout(killTimer);
      if (idleTimer) clearTimeout(idleTimer);
      killTimer = null;
      idleTimer = null;
    };

    const claimTimeout = (reason) => {
      if (timedOut) return false;
      timedOut = true;
      timeoutReason = reason;
      // Clear the competing source before the synchronous tree-kill. Output
      // arriving after a best-effort cleanup must not re-arm idle either.
      clearTimeoutTimers();
      processCleanup = killProcessTree(child.pid, isWindows);
      return true;
    };

    // idle timer — resets on every chunk of vendor output; fires only after
    // idleMs of total silence (hung / reverse-pressured). ADDITIVE: when idleMs
    // is falsy this is a no-op, so callers/tests passing only timeoutMs keep the
    // legacy single-ceiling behavior unchanged.
    const armIdle = () => {
      if (!(idleMs > 0) || timedOut) return;
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => claimTimeout('idle'), idleMs);
      if (idleTimer.unref) idleTimer.unref();
    };

    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); armIdle(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); armIdle(); });

    if (stdinInput != null && child.stdin) {
      try {
        child.stdin.write(stdinInput);
        child.stdin.end();
      } catch (_) {
        // child may have exited before stdin ready — ignore; exit code captures result
      }
    }

    // Absolute ceiling. NO retry on timeout — timeout = failure, surface it.
    if (timeoutMs > 0) {
      killTimer = setTimeout(() => claimTimeout('ceiling'), timeoutMs);
    }
    armIdle();  // start the idle clock at spawn (silence before first byte counts)

    const exitCode = await new Promise((resolve) => {
      child.on('close', (code, signal) => {
        clearTimeoutTimers();
        // Map signal to exit-code-equivalent (POSIX convention: 128 + signal)
        resolve(code != null ? code : 128 + (signal === 'SIGKILL' ? 9 : signal === 'SIGTERM' ? 15 : 0));
      });
      child.on('error', (_err) => {
        clearTimeoutTimers();
        resolve(127); // command-not-found convention
      });
    });

    const durationMs = Date.now() - startedAt;

    // Read --log-file content if adapter requested one (silent-fail diagnostic per codex F2)
    let logFileContent = undefined;
    if (logFilePath) {
      try {
        logFileContent = readFileSync(logFilePath, 'utf-8');
      } catch (_) {
        // log file may not exist if subprocess died early — that's diagnostic-worthy itself
        logFileContent = undefined;
      }
    }

    return { exitCode, stdout, stderr, timedOut, timeoutReason, processCleanup, durationMs, logFileContent };
  } finally {
    releaseVendorLock();
  }
}

/**
 * Kill an entire process tree (parent + descendants).
 * Per codex v2.0.3 F3 + Phase 5 audit F1: NOT by port; tree-kill via OS-specific
 * mechanism. Exported so hopper-runner can reuse it for background-mode timeout.
 *
 * @param {number} pid
 * @param {boolean} isWindows
 */
export function killProcessTree(pid, isWindows) {
  if (!pid) return { status: 'not-requested', method: null };
  if (isWindows) {
    // taskkill /T = kill tree (all child processes), /F = force
    try {
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore', timeout: 5000 });
      return { status: 'succeeded', method: 'taskkill /T /F' };
    } catch (_) {
      return { status: 'failed', method: 'taskkill /T /F' };
    }
  } else {
    // Unix: negative PID kills the process group (requires detached: true at spawn)
    try {
      process.kill(-pid, 'SIGKILL');
      return { status: 'succeeded', method: 'process-group SIGKILL' };
    } catch (groupError) {
      // try direct kill as fallback
      try {
        process.kill(pid, 'SIGKILL');
        return { status: 'succeeded', method: 'direct SIGKILL' };
      } catch (directError) {
        // The process can exit naturally between timeout detection and cleanup.
        // Preserve the existing success/failure status enum while making that
        // benign race observable. Do not mask EPERM/EACCES or mixed failures.
        if (groupError?.code === 'ESRCH' && directError?.code === 'ESRCH') {
          return {
            status: 'succeeded',
            method: 'already exited (group/direct ESRCH)',
            alreadyExited: true,
          };
        }
        return { status: 'failed', method: 'direct SIGKILL' };
      }
    }
  }
}

/**
 * HOPPER-6: best-effort check that a PID currently maps to an expected process
 * image. Background jobs record the hopper-runner PID (a node process); on
 * Windows especially, PIDs are recycled aggressively, so before `--stop` kills
 * a tree we confirm the PID is still a node process and not some unrelated
 * program that inherited the number. Returns 'match' | 'mismatch' | 'unknown'.
 *
 * Subprocess-based (tasklist/ps), so callers MUST NOT use it on the single-spawn
 * dispatch path (spec §3 #4) — only in management commands like --stop, which
 * already run outside the dispatch invariant. On any ambiguity it returns
 * 'unknown' and leaves the kill/no-kill decision to the caller.
 *
 * @param {number} pid
 * @param {object} [opts]
 * @param {string} [opts.expectImageIncludes]  case-insensitive substring (default 'node')
 * @param {boolean} [opts.isWindows]
 * @returns {'match'|'mismatch'|'unknown'}
 */
export function verifyPidImage(pid, { expectImageIncludes = 'node', isWindows = platform() === 'win32' } = {}) {
  if (!pid || pid <= 0) return 'unknown';
  const needle = String(expectImageIncludes).toLowerCase();
  try {
    if (isWindows) {
      const out = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, {
        encoding: 'utf-8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'],
      });
      if (!out || /no tasks/i.test(out)) return 'unknown';
      // CSV row: "ImageName","PID","SessionName","Session#","MemUsage"
      const image = (out.split(',')[0] || '').replace(/^"|"$/g, '').trim().toLowerCase();
      if (!image) return 'unknown';
      return image.includes(needle) ? 'match' : 'mismatch';
    }
    const out = execSync(`ps -p ${pid} -o comm=`, {
      encoding: 'utf-8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'],
    }).trim().toLowerCase();
    if (!out) return 'unknown';
    return out.includes(needle) ? 'match' : 'mismatch';
  } catch (_) {
    // ps/tasklist failed, or PID not found → cannot determine
    return 'unknown';
  }
}

/**
 * Generate a unique log file path for a dispatch.
 * Per codex v2.0.3 F2: unique per-dispatch to avoid stale-log false positives.
 *
 * @param {string} taskId
 * @param {string} vendorName
 * @returns {string} Absolute temp path
 */
export function makeUniqueLogPath(taskId, vendorName) {
  const rand = Math.random().toString(36).slice(2, 10);
  const ts = Date.now();
  return join(tmpdir(), `hopper-${vendorName}-${taskId}-${ts}-${rand}.log`);
}
