// Codex vendor adapter (T-PLUGIN-05a)
// Anchor: cli/src/vendors/codex.js
//
// Implements VendorAdapter contract per cli/src/types.js.
// Per spec §3 #4: thin wrapper, ZERO retry/fallback/circuit-breaker.
// Per T-PLUGIN-00 Prong 2 resolved: codex exec is the noninteractive form.

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** @type {import('../types.js').VendorAdapter} */
export const codexAdapter = {
  name: 'codex',
  command: 'codex',
  stdinMode: 'none',

  // Phase 6a static capability hint (no live vendor introspection — would
  // break single-spawn proof). Source: docs/research/.
  capabilities: {
    modelArg: {
      accepted: 'ignored',
      knownGood: [],
      // Phase 6a dogfood 2026-05-21: codex CLI supports `-m, --model <MODEL>`
      // (verified via live `codex exec --help`). Our adapter currently uses
      // `model_reasoning_effort` config flag only, NOT --model. Mark as
      // adapter-ignored. Phase 6b candidate: wire opts.model → -m.
      sourceNote: 'codex CLI supports `-m <MODEL>` (verified 2026-05-21). Our adapter uses opts.reasoning via config flag only — does NOT forward opts.model. Adapter-ignored, not CLI-unsupported.',
    },
    reasoningArg: {
      accepted: 'enumerated',
      knownGood: ['low', 'medium', 'high', 'xhigh'],
      sourceNote: 'docs/research/async-execution/01-openai-hosts.md',
    },
    features: {
      sessionResume: { supported: true, mechanism: '`codex exec resume <SESSION_ID>` — hopper does not currently auto-capture session_id' },
      fileOutput: { supported: true, mechanism: '`--output-last-message <path>` exists (NOT currently used by adapter)' },
      streaming: { supported: true, mechanism: 'codex exec streams progress to stderr; final message to stdout' },
    },
    staleAfter: '2026-08-21',
  },

  args(input, opts) {
    return [
      'exec',
      input,
      '-s', opts.sandbox ?? 'read-only',
      '-c', `model_reasoning_effort="${opts.reasoning ?? 'medium'}"`,
      ...(opts.webSearch ? ['--enable', 'web_search_cached'] : []),
    ];
  },

  envPreflight() {
    // Per codex Phase 2 audit F1: broaden checks to avoid false-negatives.
    // codex supports: ~/.codex/auth.json (default), $CODEX_HOME override,
    // $CODEX_API_KEY env, $OPENAI_API_KEY env (keychain backed in some installs).
    const codexHome = process.env.CODEX_HOME || join(homedir(), '.codex');
    if (existsSync(join(codexHome, 'auth.json'))) return { ok: true, missing: [] };
    if (process.env.CODEX_API_KEY || process.env.OPENAI_API_KEY) return { ok: true, missing: [] };
    // Soft warn instead of hard block — codex may use keychain we cannot detect.
    return {
      ok: true,
      missing: ['Note: no obvious codex auth artifact found. If smoke fails, run `codex login` OR set CODEX_API_KEY/OPENAI_API_KEY.'],
    };
  },

  timeoutMs(opts) {
    if (opts.reasoning === 'xhigh') return 900_000;
    if (opts.reasoning === 'high') return 600_000;
    return 300_000;
  },

  parseResult(raw) {
    if (raw.timedOut) {
      return {
        text: raw.stdout,
        status: 'timeout',
        error: `codex exec timed out after ${raw.durationMs}ms`,
      };
    }
    if (raw.exitCode === 127) {
      return {
        text: '',
        status: 'permission-fail',
        error: 'codex binary not found in PATH. Install: see https://github.com/openai/codex',
      };
    }
    if (raw.exitCode === 0 && raw.stdout) {
      // Parse tokens from stderr metadata if present
      const tokenMatch = raw.stderr.match(/tokens used\s*\n(\d+)/);
      const tokens = tokenMatch ? parseInt(tokenMatch[1]) : undefined;
      return {
        text: raw.stdout.trim(),
        status: 'success',
        usage: tokens ? { totalTokens: tokens } : undefined,
      };
    }
    return {
      text: raw.stdout,
      status: 'unknown-fail',
      error: `codex exited ${raw.exitCode}: ${(raw.stderr || '').slice(0, 500)}`,
    };
  },
};
