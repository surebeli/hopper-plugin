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
 * @returns {Promise<import('./types.js').SubprocessResult>}
 */
export async function runSubprocessOnce({
  command,
  args,
  stdinInput,
  timeoutMs,
  env,
  cwd,
  logFilePath = null,
  vendorName,
}) {
  const isWindows = platform() === 'win32';
  const startedAt = Date.now();
  const releaseVendorLock = await acquireVendorLock(vendorName);

  try {
    const child = spawn(command, args, {
      env: { ...process.env, ...(env || {}) },
      cwd: cwd || process.cwd(),
      stdio: [stdinInput == null ? 'ignore' : 'pipe', 'pipe', 'pipe'],
      detached: !isWindows,                                       // Unix: detached process group for tree-kill
      windowsHide: isWindows,
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let killTimer = null;

    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    if (stdinInput != null && child.stdin) {
      try {
        child.stdin.write(stdinInput);
        child.stdin.end();
      } catch (_) {
        // child may have exited before stdin ready — ignore; exit code captures result
      }
    }

    // Set up hard timeout. NO retry on timeout — timeout = failure, surface it.
    if (timeoutMs > 0) {
      killTimer = setTimeout(() => {
        timedOut = true;
        killProcessTree(child.pid, isWindows);
      }, timeoutMs);
    }

    const exitCode = await new Promise((resolve) => {
      child.on('close', (code, signal) => {
        if (killTimer) clearTimeout(killTimer);
        // Map signal to exit-code-equivalent (POSIX convention: 128 + signal)
        resolve(code != null ? code : 128 + (signal === 'SIGKILL' ? 9 : signal === 'SIGTERM' ? 15 : 0));
      });
      child.on('error', (_err) => {
        if (killTimer) clearTimeout(killTimer);
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

    return { exitCode, stdout, stderr, timedOut, durationMs, logFileContent };
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
  if (!pid) return;
  if (isWindows) {
    // taskkill /T = kill tree (all child processes), /F = force
    try {
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore', timeout: 5000 });
    } catch (_) {
      // best-effort; process may already be dead
    }
  } else {
    // Unix: negative PID kills the process group (requires detached: true at spawn)
    try {
      process.kill(-pid, 'SIGKILL');
    } catch (_) {
      // try direct kill as fallback
      try { process.kill(pid, 'SIGKILL'); } catch (_) {}
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
