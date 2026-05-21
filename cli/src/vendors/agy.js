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
import { makeUniqueLogPath } from '../subprocess.js';

/** @type {import('../types.js').VendorAdapter} */
export const agyAdapter = {
  name: 'agy',
  command: 'agy',
  stdinMode: 'none',

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
    staleAfter: '2026-08-21',
  },

  args(input, opts) {
    return [
      '-p', input,
      '--dangerously-skip-permissions',
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

  timeoutMs(_opts) {
    // agy default print-timeout is 5min; we hard-cap at 6min for safety margin
    return 360_000;
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

    // Auth-fail patterns (per T-00b diagnostic + codex F2 enumeration)
    if (/You are not logged into Antigravity|Failed to get OAuth token|error getting token source/i.test(signal)) {
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

    if (/permission|access denied|forbidden/i.test(signal)) {
      return {
        text: raw.stdout,
        status: 'permission-fail',
        error: `agy permission error. Signal excerpt: ${signal.slice(0, 300)}`,
      };
    }

    if (raw.exitCode === 0 && raw.stdout.trim()) {
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
