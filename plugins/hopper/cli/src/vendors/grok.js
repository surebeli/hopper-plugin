// Grok (xAI "Grok Build" CLI) vendor adapter (T-GROK-01)
// Anchor: cli/src/vendors/grok.js
//
// xAI's official first-party agentic coding CLI "Grok Build". Binary: `grok`.
// Per spec §3 #4: thin wrapper, ZERO retry/fallback/circuit-breaker.
//
// SOURCE & CONFIDENCE: authored from a 3-way web research sweep of docs.x.ai
// plus adversarial verification (recommendation: proceed-with-corrections,
// overall_confidence: high) — NOT from local dogfood (grok not installed on
// the authoring machine). CONFIRMED against docs.x.ai/build/cli/headless-scripting:
// headless form `grok -p "<prompt>" --output-format json`, `-p`(long form
// `--single`), `-m, --model`, `-s/-r/-c` session resume, `--always-approve`
// (-p does NOT auto-approve tool calls — required for background or the agent
// hangs per tool call), `--no-auto-update`, auth via XAI_API_KEY / ~/.grok/.
// Items handled defensively because UNCONFIRMED: the `--output-format json`
// object field names, the built-in default model when -m omitted, exit-code
// semantics, and background+session-flag interaction.
//
// ⚠ BINARY NAME COLLISION: a popular THIRD-PARTY tool (superagent-ai/grok-cli,
// npm `grok-dev` / `@vibe-kit/grok-cli`) ships the SAME binary name `grok`,
// uses GROK_API_KEY (NOT XAI_API_KEY), `--format json` (NOT --output-format),
// and emits OpenAI-style NDJSON with a default of grok-code-fast-1. This adapter
// targets xAI's OFFICIAL Grok Build CLI only — envPreflight checks XAI_API_KEY +
// ~/.grok/, NEVER GROK_API_KEY. If PATH resolves to the third-party binary,
// args/auth/output will mismatch; the sourceNotes flag this.

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { applyTaskTypeFloor } from '../subprocess.js';

// Always pass -m explicitly: when -m is omitted the CLI's built-in default is
// UNCONFIRMED, and retired slugs can silently redirect. Real-world dogfood on
// 2026-06-02 confirmed `grok-build` as the working coding-model slug.
const DEFAULT_MODEL = 'grok-build';

/** @type {import('../types.js').VendorAdapter} */
export const grokAdapter = {
  name: 'grok',
  command: 'grok',
  stdinMode: 'none',

  capabilities: {
    modelArg: {
      accepted: 'freeform',
      knownGood: ['grok-build', 'grok-4.3'],
      sourceNote: 'grok `-m, --model <MODEL>` (CONFIRMED docs.x.ai/build/cli/headless-scripting). Local dogfood feedback on 2026-06-02 confirmed `grok-build` as the working coding-model slug; `grok-build-0.1` returned `unknown model id`. CLI built-in default when -m omitted is still UNCONFIRMED, so this adapter ALWAYS passes -m (default grok-build). NAME COLLISION: the third-party grok-cli defaults to grok-code-fast-1 and uses different auth/output flags.',
    },
    reasoningArg: {
      accepted: 'ignored',
      knownGood: [],
      sourceNote: 'No reasoning/effort CLI flag in grok headless reference (CONFIRMED absent docs.x.ai). grok-4.3 has API-layer reasoning effort (none/low/high) but whether the CLI forwards it is UNCONFIRMED. This adapter does NOT forward opts.reasoning. Do not invent --reasoning/--effort.',
    },
    features: {
      sessionResume: { supported: true, mechanism: '`grok -s <id>` (named headless session) / `-r <id>` (resume) / `-c` (continue cwd). Adapter passes `-r <id>` only when opts.conversationId set. Background+session interaction UNCONFIRMED.' },
      fileOutput: { supported: false, mechanism: 'stdout only; no --output-file flag (CONFIRMED absent). Redirect --output-format json at the shell layer if a file is needed.' },
      streaming: { supported: true, mechanism: '`--output-format streaming-json` emits NDJSON events; accepted values are plain|json|streaming-json (plain = human-readable, CONFIRMED). Adapter uses `json` for a single trailing object suited to background capture.' },
    },
    staleAfter: '2026-08-31',
  },

  args(input, opts) {
    const sandbox = opts.sandbox ?? 'danger-full-access';
    // Headless single-prompt form (CONFIRMED): grok -p "<prompt>" --output-format json
    // -p long form is --single <PROMPT>. --always-approve is CONFIRMED required
    // for full-access headless dispatches: -p does NOT auto-approve tool calls,
    // so the agent hangs on each tool use without it (analog of agy
    // --dangerously-skip-permissions / copilot --allow-all-tools).
    // --no-auto-update suppresses CI update noise.
    return [
      '-p', input,
      '--output-format', 'json',
      '--no-auto-update',
      '-m', opts.model ?? DEFAULT_MODEL,
      // Anchor the working dir explicitly (CONFIRMED `--cwd <PATH>` docs.x.ai).
      // hopper injects opts.cwd = resolved vendor CWD (repo root by default, or
      // $HOPPER_VENDOR_CWD). grok's sandbox is relative to --cwd, so a widened
      // root reaches external paths without disabling grok's permission model.
      ...(opts.cwd ? ['--cwd', opts.cwd] : []),
      ...(sandbox === 'danger-full-access' ? ['--always-approve'] : []),
      ...(opts.conversationId ? ['-r', opts.conversationId] : []),
    ];
  },

  envPreflight() {
    // Soft-warn pattern (mirrors codex/kimi/agy): a stored browser-OAuth session
    // may authenticate even when undetectable on disk; parseResult is the
    // backstop for real auth failures. CRITICAL: only XAI_API_KEY (xAI's official
    // var) — NEVER GROK_API_KEY (that targets the unrelated third-party grok-cli).
    if (process.env.XAI_API_KEY) return { ok: true, missing: [] };
    const grokDir = join(homedir(), '.grok');
    const candidates = [
      join(grokDir, 'config.toml'),
      join(grokDir, 'config.json'),
      join(grokDir, 'auth'),
      join(grokDir, 'managed_config.toml'),
    ];
    if (candidates.some((p) => existsSync(p))) return { ok: true, missing: [] };
    return {
      ok: true,
      missing: ['Note: no XAI_API_KEY or ~/.grok credentials found. If smoke fails, set XAI_API_KEY="xai-..." OR run `grok login --device-auth` (headless) / `grok` once for browser OAuth. Do NOT set GROK_API_KEY (that targets the unrelated third-party grok-cli).'],
    };
  },

  timeoutMs(opts) {
    // Native: 300s (agentic coding CLI; same tier as codex).
    const native = 300_000;
    // Phase 6c F1: review task-types raised to 30min floor (all-adapter consistent).
    return applyTaskTypeFloor(native, opts);
  },

  parseResult(raw) {
    if (raw.timedOut) {
      return { text: raw.stdout, status: 'timeout', error: `grok timed out after ${raw.durationMs}ms` };
    }
    if (raw.exitCode === 127 || /not found|command not found/i.test(raw.stderr || '')) {
      return {
        text: '',
        status: 'permission-fail',
        error: 'grok binary not found in PATH. Install: curl -fsSL https://x.ai/cli/install.sh | bash (Windows: irm https://x.ai/cli/install.ps1 | iex)',
      };
    }
    // Auth-fail detection (exit codes UNDOCUMENTED → pattern-match like agy/kimi).
    const signal = `${raw.stdout || ''}\n${raw.stderr || ''}`;
    if (/unauthorized|invalid api key|XAI_API_KEY|not logged in|\b401\b|\b403\b|authenticat/i.test(signal)) {
      return {
        text: '',
        status: 'auth-fail',
        error: 'grok is not authenticated. Set XAI_API_KEY="xai-..." OR run `grok login --device-auth`.',
      };
    }
    if (raw.exitCode === 0 && raw.stdout) {
      // --output-format json yields a single trailing JSON object. Field names
      // are UNDOCUMENTED → parse defensively: whole-stdout JSON, then last
      // non-empty line, then raw text fallback.
      const parsed = extractGrokText(raw.stdout);
      return parsed.usage
        ? { text: parsed.text, status: 'success', usage: parsed.usage }
        : { text: parsed.text, status: 'success' };
    }
    return {
      text: raw.stdout,
      status: 'unknown-fail',
      error: `grok exited ${raw.exitCode}: ${(raw.stderr || '').slice(0, 500)}`,
    };
  },
};

/**
 * Defensive extraction of answer text from grok --output-format json stdout.
 * Field names are UNCONFIRMED (docs never document the object shape), so try
 * common keys, fall back to last JSON line, then raw text.
 * @param {string} stdout
 * @returns {{ text: string, usage?: object }}
 */
function extractGrokText(stdout) {
  const trimmed = stdout.trim();
  const fromObj = (obj) => {
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      const text = obj.text ?? obj.message ?? obj.content ?? obj.output ?? obj.result ?? obj.response;
      if (typeof text === 'string') return { text, usage: obj.usage };
      return { text: JSON.stringify(obj), usage: obj.usage };
    }
    if (typeof obj === 'string') return { text: obj };
    return null;
  };
  try {
    const got = fromObj(JSON.parse(trimmed));
    if (got) return got;
  } catch (_) { /* not a single JSON object — try line scan */ }
  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim());
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const got = fromObj(JSON.parse(lines[i]));
      if (got) return got;
    } catch (_) { /* keep scanning upward */ }
  }
  return { text: trimmed };
}
