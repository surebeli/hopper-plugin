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
import { platform, tmpdir } from 'node:os';
import { join } from 'node:path';

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
}) {
  const isWindows = platform() === 'win32';
  const startedAt = Date.now();

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
      const { readFileSync } = await import('node:fs');
      logFileContent = readFileSync(logFilePath, 'utf-8');
    } catch (_) {
      // log file may not exist if subprocess died early — that's diagnostic-worthy itself
      logFileContent = undefined;
    }
  }

  return { exitCode, stdout, stderr, timedOut, durationMs, logFileContent };
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
