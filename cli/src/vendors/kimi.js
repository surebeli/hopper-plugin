// Kimi vendor adapter (T-PLUGIN-05b)
// Anchor: cli/src/vendors/kimi.js
//
// Per T-PLUGIN-00b resolved: `kimi -p "<input>" --print --afk --final-message-only -m <model>`
// Per spec §3 #4: thin wrapper, no retry.

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { applyTaskTypeFloor } from '../subprocess.js';

/** @type {import('../types.js').VendorAdapter} */
export const kimiAdapter = {
  name: 'kimi',
  command: 'kimi',
  stdinMode: 'none',

  // Phase 6a static capability hint — sourced from docs/research/.
  capabilities: {
    modelArg: {
      accepted: 'freeform',
      knownGood: [],  // No canonical list — depends on user kimi config + Moonshot account
      // Phase 6a-corrected 2026-05-21: kimi help confirms `--model, -m <TEXT>`,
      // default from `~/.kimi/config.{toml,json}`. Models depend on user
      // account + config, not on this adapter. Don't hardcode.
      sourceNote: 'kimi works WITHOUT -m (uses default model from ~/.kimi/config.toml or kimi-cli built-in default — verified 2026-05-21 dogfood: `kimi --prompt "test" --no-thinking` succeeds with no -m). Pass -m ONLY when explicitly selecting a non-default alias from your config. CRITICAL: `-m` takes the ALIAS KEY from your `[models.NAME]` blocks, NOT the upstream Moonshot model ID — that is why `-m kimi-thinking` fails with "LLM not set" when kimi-thinking is not a defined alias. Authoritative upstream IDs per Moonshot docs: kimi-k2.6, kimi-k2.5, kimi-k2-thinking, kimi-k2-thinking-turbo, kimi-k2-0905-preview — but you call them by your chosen alias in -m. No `kimi models` introspection command exists.',
    },
    reasoningArg: {
      accepted: 'binary',
      knownGood: ['low', 'medium', 'high', 'xhigh', 'none'],
      // Phase 6c wired the adapter (was Phase 6b candidate); Phase 6c follow-up
      // added explicit --no-thinking emission for opts.reasoning === 'none'
      // per kimi session-stickiness research.
      sourceNote: 'kimi has `--thinking / --no-thinking` binary toggle (verified 2026-05-21 via research). STRICTLY BINARY — no hidden levels, no thinking_budget / max_thinking_tokens keys. Reasoning granularity is selected via MODEL identifier (e.g. kimi-k2-thinking vs kimi-k2-thinking-turbo), not via flag level. Per-model capability flags: `"thinking"` (toggleable) vs `"always_thinking"` (locked on). Phase 6c adapter mapping: truthy reasoning → --thinking; reasoning=none → --no-thinking (explicit, overrides kimi session stickiness); omitted → no flag (leaves kimi default / sticky).',
    },
    features: {
      sessionResume: { supported: true, mechanism: '`kimi --session <id>` / `--resume <id>` / `-C` (continue most recent in cwd)' },
      fileOutput: { supported: false, mechanism: 'stdout only; redirect at shell layer' },
      streaming: { supported: true, mechanism: '--print mode streams incrementally; --final-message-only suppresses intermediate tool calls' },
    },
    staleAfter: '2026-08-21',
  },

  args(input, opts) {
    // Phase 6c: forward opts.reasoning to kimi's --thinking / --no-thinking
    // binary toggle. Per Phase 6c follow-up (codex + copilot dogfood):
    // kimi reuses the last session's thinking setting when neither flag is
    // present, so omitting both leaves the toggle "sticky" — passing
    // --reasoning=none then doesn't actually force it off. Be explicit:
    //   truthy (low/medium/high/xhigh) → --thinking
    //   'none' (explicit disable)       → --no-thinking
    //   omitted                          → no flag (leave sticky / kimi default)
    let thinkingFlag = [];
    if (opts.reasoning === 'none') thinkingFlag = ['--no-thinking'];
    else if (opts.reasoning) thinkingFlag = ['--thinking'];
    return [
      '-p', input,
      '--print',
      '--afk',
      '--final-message-only',
      ...thinkingFlag,
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

  timeoutMs(opts) {
    // Native: 180s for kimi-thinking (T-00b research)
    const native = 180_000;
    // Phase 6c F1: review task-types get raised to 30min floor
    return applyTaskTypeFloor(native, opts);
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
