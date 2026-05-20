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
    const authPath = join(homedir(), '.codex', 'auth.json');
    if (!existsSync(authPath)) {
      return {
        ok: false,
        missing: ['Run `codex login` to authenticate. Stores auth in ~/.codex/auth.json'],
      };
    }
    return { ok: true, missing: [] };
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
