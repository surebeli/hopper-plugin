// Kimi vendor adapter (T-PLUGIN-05b)
// Anchor: cli/src/vendors/kimi.js
//
// Per T-PLUGIN-00b resolved: `kimi -p "<input>" --print --afk --final-message-only -m <model>`
// Per spec §3 #4: thin wrapper, no retry.

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** @type {import('../types.js').VendorAdapter} */
export const kimiAdapter = {
  name: 'kimi',
  command: 'kimi',
  stdinMode: 'none',

  // Phase 6a static capability hint — sourced from docs/research/.
  capabilities: {
    modelArg: {
      accepted: 'freeform',
      knownGood: ['default'],
      sourceNote: 'kimi -m <name>. Empirical: invalid model causes "LLM not set" error from kimi-cli. Per Phase 0 smoke + T-AUDIT-PH5 attempt. UNCONFIRMED: precise list of kimi-cli-accepted model identifiers.',
    },
    reasoningArg: {
      accepted: 'ignored',
      knownGood: [],
      sourceNote: 'kimi has its own thinking mechanism; no --reasoning equivalent. docs/research/async-execution/03-other-ai-clis.md',
    },
    features: {
      sessionResume: { supported: true, mechanism: '`kimi --session <id>` / `--resume <id>` / `-C` (continue most recent in cwd)' },
      fileOutput: { supported: false, mechanism: 'stdout only; redirect at shell layer' },
      streaming: { supported: true, mechanism: '--print mode streams incrementally; --final-message-only suppresses intermediate tool calls' },
    },
    staleAfter: '2026-08-21',
  },

  args(input, opts) {
    return [
      '-p', input,
      '--print',
      '--afk',
      '--final-message-only',
      ...(opts.model ? ['-m', opts.model] : []),
    ];
  },

  envPreflight() {
    // Per codex Phase 2 audit F1: kimi may have config.toml OR config.json variant.
    const candidates = [
      join(homedir(), '.kimi', 'config.toml'),
      join(homedir(), '.kimi', 'config.json'),
    ];
    if (candidates.some((p) => existsSync(p))) return { ok: true, missing: [] };
    if (process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY) {
      return { ok: true, missing: [] };
    }
    // Soft warn
    return {
      ok: true,
      missing: ['Note: no kimi config.toml/config.json or KIMI_API_KEY found. If smoke fails, run `kimi /connect` or set KIMI_API_KEY.'],
    };
  },

  timeoutMs(_opts) {
    // Kimi-thinking can take longer; default 180s per T-00b
    return 180_000;
  },

  parseResult(raw) {
    if (raw.timedOut) {
      return { text: raw.stdout, status: 'timeout', error: `kimi -p timed out after ${raw.durationMs}ms` };
    }
    if (raw.exitCode === 127) {
      return { text: '', status: 'permission-fail', error: 'kimi binary not found. Install: pip install kimi-cli' };
    }
    // Kimi-specific quirk: HTTP 402 membership errors print to stdout, exit 0
    // Per T-00b smoke observation: "Error code: 402 - {'error': {'message': "We're unable to verify your membership..."}}"
    if (raw.stdout.includes('Error code: 4') && raw.stdout.includes("'error'")) {
      const msg = raw.stdout.match(/'message':\s*"([^"]+)"/);
      return {
        text: raw.stdout,
        status: 'auth-fail',
        error: msg ? `Kimi auth/membership: ${msg[1]}` : 'Kimi auth/membership error (check ~/.kimi/config.toml)',
      };
    }
    if (raw.exitCode === 0 && raw.stdout) {
      // Strip "To resume this session: kimi -r <id>" footer if present
      const text = raw.stdout.replace(/\n*To resume this session:[^\n]*\n*$/m, '').trim();
      return { text, status: 'success' };
    }
    return {
      text: raw.stdout,
      status: 'unknown-fail',
      error: `kimi exited ${raw.exitCode}: ${(raw.stderr || '').slice(0, 500)}`,
    };
  },
};
