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
      accepted: 'enumerated',
      knownGood: ['low', 'medium', 'high'],
      sourceNote: 'grok headless `--effort <LEVEL>` exists (CONFIRMED via `grok --help`, vendor-preset feedback 2026-06-15). The adapter forwards opts.reasoning -> --effort ONLY when set (opt-in), so grok builds predating the flag are unaffected by default dispatches. Accepted level vocabulary is not fully documented; low|medium|high are known-good. Older docs.x.ai claimed no CLI effort flag — that is now stale.',
    },
    features: {
      sessionResume: { supported: true, mechanism: '`grok -s <id>` (named headless session) / `-r <id>` (resume) / `-c` (continue cwd). Adapter passes `-r <id>` only when opts.conversationId set. Background+session interaction UNCONFIRMED.' },
      fileOutput: { supported: false, mechanism: 'stdout only; no --output-file flag (CONFIRMED absent). Redirect --output-format json at the shell layer if a file is needed.' },
      streaming: { supported: true, mechanism: '`--output-format streaming-json` emits NDJSON events; accepted values are plain|json|streaming-json (plain = human-readable, CONFIRMED). Adapter uses `json` for a single trailing object suited to background capture.' },
    },
    staleAfter: '2026-08-31',
  },

  // HOPPER (vendor-preset feedback 2026-06-15): long-form flags the adapter
  // relies on, checked by `hopper-dispatch --check --compat` against `grok --help`.
  compatFlags: ['--single', '--output-format', '--model', '--permission-mode', '--cwd'],

  args(input, opts) {
    const sandbox = opts.sandbox ?? 'danger-full-access';
    // Headless single-prompt form (CONFIRMED): grok -p "<prompt>" --output-format json
    // (-p is the short form of --single). --no-auto-update suppresses CI update noise.
    //
    // Headless = no interactive approval is possible: a background dispatch, an
    // injected log file, or a non-TTY stdout (a host shell driving us). In that
    // case grok needs an explicit permission mode (and, for full-access, also
    // --always-approve) or it stalls and returns stopReason:"Cancelled" with
    // Auth(AuthorizationRequired) + "worker quit" (vendor-preset feedback
    // 2026-06-15 — --always-approve alone was insufficient). bypassPermissions is
    // the headless-safe mode (CONFIRMED `grok --help`:
    // default|acceptEdits|auto|dontAsk|bypassPermissions|plan). The --sandbox opt
    // still gates --always-approve (full-access only). Escape hatch:
    // HOPPER_GROK_PERMISSION_MODE overrides the mode (empty = omit it on grok
    // builds that lack the flag).
    const headless = Boolean(opts.background || opts.logFile || !process.stdout.isTTY);
    const permMode = process.env.HOPPER_GROK_PERMISSION_MODE ?? 'bypassPermissions';
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
      ...(headless && permMode ? ['--permission-mode', permMode] : []),
      ...(headless && sandbox === 'danger-full-access' ? ['--always-approve'] : []),
      // Reasoning effort (opt-in): forward only when the caller set --reasoning,
      // so default dispatches stay safe on grok builds that predate --effort.
      ...(opts.reasoning ? ['--effort', opts.reasoning] : []),
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
    // Now also catches the headless permission-stall signature (vendor-preset
    // feedback 2026-06-15): AuthorizationRequired / Transport channel closed /
    // "worker quit with fatal" accompany a cancelled headless turn.
    const signal = `${raw.stdout || ''}\n${raw.stderr || ''}`;
    if (/unauthorized|invalid api key|XAI_API_KEY|not logged in|\b401\b|\b403\b|authenticat|authorizationrequired|transport channel closed|worker quit with fatal/i.test(signal)) {
      return {
        text: '',
        status: 'auth-fail',
        error: 'grok is not authenticated or was blocked by its permission mode. Set XAI_API_KEY / run `grok login --device-auth`. hopper passes --permission-mode bypassPermissions + --always-approve for headless dispatch.',
      };
    }
    if (raw.exitCode === 0) {
      // --output-format json yields a single trailing JSON object. Field names
      // are UNDOCUMENTED → parse defensively: whole-stdout JSON, then last
      // non-empty line, then raw text fallback.
      const parsed = extractGrokText(raw.stdout);
      const stop = (parsed.stopReason || '').toString().toLowerCase();
      const badStop = /cancel|abort|refus|error|fatal/.test(stop);
      // FAIL FAST instead of writing a silent empty result (the reported bug):
      // grok can exit 0 yet return {"text":"","stopReason":"Cancelled"} when a
      // headless turn is blocked. Treat a bad stopReason OR no usable text as a
      // failure so the dispatcher records it as failed, not done-with-no-output.
      if (badStop || !parsed.text.trim()) {
        return {
          text: parsed.text,
          status: 'unknown-fail',
          error: `grok produced no usable result${parsed.stopReason ? ` (stopReason="${parsed.stopReason}")` : ''}. ` +
            'Common cause: a blocked/cancelled headless turn — confirm grok is authenticated and re-dispatch (hopper sets --permission-mode bypassPermissions for headless).',
        };
      }
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
 * @returns {{ text: string, usage?: object, stopReason?: string }}
 */
function extractGrokText(stdout) {
  const trimmed = (stdout || '').trim();
  const fromObj = (obj) => {
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      const text = obj.text ?? obj.message ?? obj.content ?? obj.output ?? obj.result ?? obj.response;
      const stopReason = obj.stopReason ?? obj.stop_reason ?? obj.finishReason ?? obj.finish_reason;
      if (typeof text === 'string') return { text, usage: obj.usage, stopReason };
      return { text: JSON.stringify(obj), usage: obj.usage, stopReason };
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
