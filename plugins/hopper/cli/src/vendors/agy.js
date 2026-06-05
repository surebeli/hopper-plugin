// Antigravity (agy) vendor adapter (T-PLUGIN-05e)
// Anchor: cli/src/vendors/agy.js
//
// Per spec v2.0.3 §6 T-PLUGIN-05e + codex audit F2: agy has THE most complex
// adapter due to silent auth-fail behavior (exit 0 + empty stdout when not
// OAuth-authed). Adapter MUST:
//
// 1. Generate unique per-dispatch log file (avoid stale-log false positives)
// 2. Pass via --log-file
// 3. Inspect log after exit; classify failure: auth / timeout / permission / unknown
// 4. NOT bake OAuth cred path as literal (path is TBD until post-login evidence)
//
// Per spec §3 #4: no retry, no fallback, single subprocess spawn.

import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { makeUniqueLogPath, applyTaskTypeFloor } from '../subprocess.js';

/** @type {import('../types.js').VendorAdapter} */
export const agyAdapter = {
  name: 'agy',
  command: 'agy',
  stdinMode: 'none',
  // Phase 6c F2: agy installer on Windows does NOT add its bin to PATH.
  // Probe and dispatch both correctly report "not found" without these
  // fallbacks. When PATH lookup fails, the runner consults this list to
  // locate the binary at its deterministic install location.
  knownInstallPaths: process.platform === 'win32'
    ? [join(homedir(), 'AppData', 'Local', 'agy', 'bin', 'agy.exe')]
    : [join(homedir(), '.local', 'bin', 'agy')],

  // Phase 6a static capability hint — sourced from docs/research/.
  capabilities: {
    modelArg: {
      accepted: 'ignored',
      knownGood: [],
      sourceNote: 'agy -p does not expose --model. Marketing references "Gemini 3.5 Flash" as default; some third-party blog mentions `antigravity agent run --model gemini-3.5-flash` separate binary, UNCONFIRMED.',
    },
    reasoningArg: {
      accepted: 'ignored',
      knownGood: [],
      sourceNote: 'agy uses internal "parallel subagents" orchestration; no external reasoning-effort flag.',
    },
    features: {
      sessionResume: { supported: false, mechanism: 'UNCONFIRMED — no documented --resume <id> flag as of 2026-05-20.' },
      fileOutput: { supported: false, mechanism: '`--log-file <path>` writes diagnostic log (NOT answer text). Answer text is stdout-only.' },
      streaming: { supported: true, mechanism: '`agy -p` streams; first-run blocked by OAuth (interactive once).' },
    },
    // Phase 6a dogfood 2026-05-21 (CORRECTED 2026-05-21 evening per user
    // feedback): this adapter targets the AGENTIC `agy` CLI. Confirmed on
    // this dev machine at:
    //   C:\Users\litianyi\AppData\Local\agy\bin\agy.exe
    // user-verified `agy --help` from PowerShell shows: --print / -p,
    // --dangerously-skip-permissions, --log-file, --continue,
    // --conversation, --add-dir (repeatable workspace dir), --sandbox,
    // --print-timeout (default 5m0s), subcommands: changelog / help /
    // install / plugin{,s} / update.
    // RE-VERIFIED 2026-06-05: --add-dir IS present (earlier note omitted it);
    // adapter now threads opts.cwd via --add-dir for cross-vendor parity.
    //
    // Bash session PATH coverage caveat (verified live): some MSYS2 /
    // Git-Bash environments do NOT inherit Windows-installed-app PATH
    // entries by default. PowerShell users get agy on PATH; Git-Bash users
    // may need to add `~/AppData/Local/agy/bin` manually OR run via full
    // path. Our `--check` correctly reflects whichever shell ran it.
    //
    // Distinct binary: `antigravity` (Google's VS-Code-fork editor at
    // ~/AppData/Local/Programs/Antigravity/bin/) is a SEPARATE product
    // from `agy` (the agentic CLI). They are NOT aliases of each other.
    staleAfter: '2026-08-21',
    installPath: 'Default Windows install: ~/AppData/Local/agy/bin/agy.exe. PATH coverage shell-dependent on Windows (PowerShell yes; Git-Bash may need manual setup).',
  },

  args(input, opts) {
    return [
      '-p', input,
      '--dangerously-skip-permissions',
      // Cross-vendor working-dir support (mirrors opencode --dir / grok --cwd /
      // codex --cd). agy has no cwd-setting flag, but `--add-dir <path>`
      // (CONFIRMED present + repeatable via `agy --help`) grants a directory to
      // its workspace. hopper injects opts.cwd = resolved vendor CWD (repo root
      // by default, or $HOPPER_VENDOR_CWD) so agy can read/write project files
      // regardless of where `-p` anchors its own working context. "enable not
      // bypass" — grants the specific repo root, does NOT widen the sandbox.
      ...(opts.cwd ? ['--add-dir', opts.cwd] : []),
      ...(opts.logFile ? ['--log-file', opts.logFile] : []),
      ...(opts.conversationId ? ['--conversation', opts.conversationId] : []),
    ];
  },

  /**
   * Prepare a unique log file path for this dispatch.
   * Called by dispatch executor BEFORE args() so the path can be threaded in.
   */
  prepareLog(taskId, vendorName) {
    return { logPath: makeUniqueLogPath(taskId, vendorName) };
  },

  envPreflight() {
    // Per codex v2.0.3 audit F2: do NOT bake ~/.gemini/oauth_creds.json as literal.
    // Check for presence of any non-empty file under ~/.gemini/antigravity-cli/
    // or ~/.gemini/ that looks like an auth artifact.
    const geminiDir = join(homedir(), '.gemini');
    if (!existsSync(geminiDir)) {
      return {
        ok: false,
        missing: ['Run `agy install` (PATH setup) THEN `agy` interactively (OAuth login) before -p mode works.'],
      };
    }
    // Look for likely auth artifact files. If none, surface clear instruction.
    try {
      const candidates = ['oauth_creds.json', 'credentials.json', 'token.json', 'auth.json'];
      // Check root .gemini/ first
      for (const c of candidates) {
        if (existsSync(join(geminiDir, c))) {
          return { ok: true, missing: [] };
        }
      }
      // Check .gemini/antigravity-cli/ subdir
      const cliDir = join(geminiDir, 'antigravity-cli');
      if (existsSync(cliDir)) {
        const entries = readdirSync(cliDir);
        if (entries.some((e) => /credential|token|auth|oauth/i.test(e))) {
          return { ok: true, missing: [] };
        }
      }
      // No auth artifact found — but agy might use other storage. Don't block;
      // parseResult will detect silent auth-fail via log file. Return ok=true
      // but include a soft warning in missing field.
      return {
        ok: true,
        missing: ['Note: no obvious agy auth artifact found in ~/.gemini/; if smoke fails with "not logged in", run `agy` interactively to OAuth.'],
      };
    } catch (_) {
      return { ok: true, missing: [] };
    }
  },

  timeoutMs(opts) {
    // Native: 360s (agy default print-timeout is 5min; we cap at 6min)
    // Phase 6c F1: review task-types get raised to 30min floor
    return applyTaskTypeFloor(360_000, opts);
  },

  parseResult(raw) {
    // Per codex Phase 2 audit F2: classify over BOTH log + stderr.
    // Missing log is distinguishable from empty-clean log.
    if (raw.timedOut) {
      return { text: raw.stdout, status: 'timeout', error: `agy -p timed out after ${raw.durationMs}ms (default 5min print-timeout exceeded)` };
    }
    if (raw.exitCode === 127) {
      return {
        text: '',
        status: 'permission-fail',
        error: 'agy binary not found in PATH. Run `agy install` to configure PATH.',
      };
    }

    // Combine signals: log file content (if read) + stderr (always captured).
    // Per F2: stderr may contain failure pattern when log is missing/disabled.
    const log = raw.logFileContent || '';
    const logFileMissing = raw.logFileContent === undefined;
    const signal = `${log}\n${raw.stderr || ''}`;
    const hasStdout = Boolean((raw.stdout || '').trim());

    // Auth-fail patterns (per T-00b diagnostic + codex F2 enumeration)
    // agy print mode may emit early "not logged in" log lines, then recover via
    // silent auth and still return a valid answer on stdout. Treat these auth
    // patterns as terminal only when there is no successful stdout payload.
    if ((!hasStdout || raw.exitCode !== 0) && /You are not logged into Antigravity|Failed to get OAuth token|error getting token source/i.test(signal)) {
      return {
        text: '',
        status: 'auth-fail',
        error: `agy is not OAuth-authed. Run \`agy\` interactively once (browser OAuth flow). After login, -p mode works headless.${logFileMissing ? ' [Note: --log-file content was missing; auth pattern matched stderr]' : ''}`,
      };
    }

    if (/deadline exceeded|context cancelled|context deadline/i.test(signal)) {
      return {
        text: raw.stdout,
        status: 'timeout',
        error: 'agy print-timeout. Increase via --print-timeout OR check network.',
      };
    }

    if (/permission denied|permission error|access denied|forbidden|not allowed/i.test(signal)) {
      return {
        text: raw.stdout,
        status: 'permission-fail',
        error: `agy permission error. Signal excerpt: ${signal.slice(0, 300)}`,
      };
    }

    if (raw.exitCode === 0 && hasStdout) {
      return { text: raw.stdout.trim(), status: 'success' };
    }

    // Exit 0 + empty stdout + no specific error pattern = unknown silent fail
    if (raw.exitCode === 0 && !raw.stdout.trim()) {
      return {
        text: '',
        status: 'unknown-fail',
        error: `agy returned empty output with exit 0 but no matching error pattern.${logFileMissing ? ' [Note: --log-file content was missing — adapter could not read diagnostic log.]' : ''} Log excerpt: ${log.slice(0, 300)}. Stderr excerpt: ${(raw.stderr || '').slice(0, 200)}`,
      };
    }

    return {
      text: raw.stdout,
      status: 'unknown-fail',
      error: `agy exited ${raw.exitCode}.${logFileMissing ? ' [log file missing]' : ''} Stderr: ${(raw.stderr || '').slice(0, 300)}. Log: ${log.slice(0, 300)}`,
    };
  },
};
