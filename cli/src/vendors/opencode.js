// OpenCode vendor adapter (T-PLUGIN-05c)
// Anchor: cli/src/vendors/opencode.js
//
// Per T-PLUGIN-00b resolved: `opencode run "<input>" [--model <provider/model>]`
// Per T-00b finding: user's 1.15.3 works fine for `opencode run`; #3213 hang
// regression affects TUI mode only. Pin 0.14.7 is fallback if user reports issues.

import { existsSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';

/** @type {import('../types.js').VendorAdapter} */
export const opencodeAdapter = {
  name: 'opencode',
  command: 'opencode',
  stdinMode: 'none',

  // Phase 6a static capability hint.
  capabilities: {
    modelArg: {
      accepted: 'freeform',
      // Phase 6a-corrected per user feedback 2026-05-21: do NOT hardcode
      // model lists in the adapter — actual catalog depends on the user's
      // opencode auth config + active subscriptions, which is per-machine
      // and per-account. The adapter forwards opts.model verbatim; whether
      // a given identifier resolves is opencode's concern.
      knownGood: ['<provider>/<model>'],  // format example only — not a catalog
      sourceNote: 'opencode --model <provider/model>. Provider prefix required. Available models depend on YOUR opencode auth configuration + active subscriptions, NOT on this adapter. Run `opencode models` on your machine for live list. See .hopper/handoffs/T-DOGFOOD-PHASE6A-VENDORS.md for a sample snapshot from one dev machine (illustrative, not canonical).',
    },
    reasoningArg: {
      accepted: 'ignored',
      knownGood: [],
      sourceNote: 'opencode does not expose reasoning-effort knob via CLI flags.',
    },
    features: {
      sessionResume: { supported: true, mechanism: '`opencode run --session <id>` / `--continue` / `--fork`. Session IDs per-machine (sst/opencode#10349 — not portable Win<->macOS).' },
      fileOutput: { supported: false, mechanism: 'No --output flag; stdout-only. Use `--format json` + shell redirect.' },
      streaming: { supported: true, mechanism: 'opencode run streams events; exits when idle.' },
    },
    staleAfter: '2026-08-21',
  },

  args(input, opts) {
    return [
      'run',
      input,
      ...(opts.model ? ['--model', opts.model] : []),
      ...(opts.conversationId ? ['-s', opts.conversationId] : []),
    ];
  },

  envPreflight() {
    // Per codex Phase 2 audit F1: broaden checks.
    // OpenCode auth paths (3 platforms) + env-var fallbacks + opencode.json
    const candidates = [
      join(homedir(), '.local', 'share', 'opencode', 'auth.json'),
      join(homedir(), 'AppData', 'Roaming', 'opencode', 'auth.json'),
      join(homedir(), 'Library', 'Application Support', 'opencode', 'auth.json'),
      // Also accept project-local opencode.json
      join(process.cwd(), 'opencode.json'),
    ];
    if (candidates.some((p) => existsSync(p))) return { ok: true, missing: [] };
    // Env-var fallback (opencode honors per-provider env refs)
    if (process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY ||
        process.env.GROQ_API_KEY || process.env.DEEPSEEK_API_KEY) {
      return { ok: true, missing: [] };
    }
    // Soft warn — opencode may have other config we cannot detect
    return {
      ok: true,
      missing: ['Note: no obvious opencode auth detected. If smoke fails, run `opencode auth` OR set provider env refs in opencode.json.'],
    };
  },

  timeoutMs(_opts) {
    return 180_000;
  },

  parseResult(raw) {
    if (raw.timedOut) {
      return { text: raw.stdout, status: 'timeout', error: `opencode run timed out after ${raw.durationMs}ms` };
    }
    if (raw.exitCode === 127) {
      return { text: '', status: 'permission-fail', error: 'opencode binary not found. Install: npm install -g opencode-ai/opencode' };
    }
    if (raw.exitCode === 0) {
      // Strip leading "> build · <provider/model>" line + ANSI codes
      let text = raw.stdout.replace(/\x1b\[[0-9;]*m/g, ''); // strip ANSI
      text = text.replace(/^>\s+build\s+·\s+[^\n]+\n+/m, '').trim();
      return { text, status: 'success' };
    }
    return {
      text: raw.stdout,
      status: 'unknown-fail',
      error: `opencode exited ${raw.exitCode}: ${(raw.stderr || '').slice(0, 500)}`,
    };
  },
};
