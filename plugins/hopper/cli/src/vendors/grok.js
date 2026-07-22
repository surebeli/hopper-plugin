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
// 2026-06-02 confirmed `grok-build` as the working coding-model slug — but the
// grok model line ROTATES without notice (see
// ISSUE-grok-model-line-rotation-stale-knownGood.md): as of 2026-07-16/18,
// `grok-build` and `grok-composer-2.5-fast` both 400 with `Couldn't set model
// '<x>': Invalid params: "unknown model id"`. `grok -p ... -m grok-4.5
// --output-format json` live micro-test on 2026-07-18 (grok CLI v0.2.101)
// returned `{"text":"OK","stopReason":"EndTurn",...}` — CONFIRMED working.
const DEFAULT_MODEL = 'grok-4.5';

/** @type {import('../types.js').VendorAdapter} */
export const grokAdapter = {
  name: 'grok',
  command: 'grok',
  stdinMode: 'none',

  // Idle-watchdog hint (ISSUE-grok-claude-buffered-output-idle-falsekill): grok
  // `--output-format json` (passed in args() below) is END-BUFFERED — the vendor
  // writes stdout ONCE at completion, not incrementally (see the `streaming`
  // capability note and parseResult's "single trailing JSON object" comment
  // further down).
  // hopper-runner's background idle poll resets only on log-FILE-size growth, so
  // for a fully-buffered vendor that never grows the log until exit, idle
  // degenerates into an unconditional kill ~idleMs after spawn. This flag tells
  // the runner to skip arming that poll entirely for grok (the absolute ceiling
  // timeout still applies as the safety net).
  bufferedOutput: true,

  capabilities: {
    modelArg: {
      accepted: 'freeform',
      // knownGood[0] is the `verified-latest` sentinel target (cli/src/dispatch.js
      // resolveAdapterOptsForTask + cli/src/policy.js). The grok model LINE is
      // version-coupled and rotates without notice — xAI retires slugs and this
      // list rots out from under us (ISSUE-grok-model-line-rotation-stale-
      // knownGood.md: `grok-build` + `grok-composer-2.5-fast`, both live-good as
      // of 2026-06-02, returned `Couldn't set model '<x>': Invalid params:
      // "unknown model id"` by 2026-07-16). Live `--probe grok` (see
      // cli/src/vendor-probe/grok.js) now parses `grok models`' own "Available
      // models:" listing and is the PREFERRED self-healing source when its cache
      // is fresh — this static list is the offline/never-probed fallback baseline
      // only, not the source of truth.
      knownGood: ['grok-4.5'],
      sourceNote: 'grok `-m, --model <MODEL>` (CONFIRMED docs.x.ai/build/cli/headless-scripting). V-verified 2026-07-18 via `grok -p "..." -m grok-4.5 --output-format json` live micro-test on grok CLI v0.2.101 → {"text":"OK","stopReason":"EndTurn",...} (real dispatch, not just `grok models` listing it). `grok models` (live, same date) confirms grok-4.5 is also the CLI\'s own default. `grok-build` / `grok-composer-2.5-fast` (the prior knownGood) both now 400 with "unknown model id" — retired sometime between 2026-06-02 and 2026-07-16. CLI built-in default when -m omitted is still UNCONFIRMED as a matter of policy, so this adapter ALWAYS passes -m explicitly. NAME COLLISION: the third-party grok-cli defaults to grok-code-fast-1 and uses different auth/output flags.',
    },
    reasoningArg: {
      accepted: 'enumerated',
      knownGood: ['low', 'medium', 'high'],
      sourceNote: 'grok headless `--effort`/`--reasoning-effort <EFFORT>` exists (CONFIRMED via `grok --help` on v0.2.101, re-checked 2026-07-18 — flag present, unchanged). The adapter forwards opts.reasoning -> --effort ONLY when set (opt-in), so grok builds predating the flag are unaffected by default dispatches. Accepted level vocabulary is STILL not enumerated by `grok --help` (unlike --permission-mode/--output-format, which do list "[possible values: ...]"); low|medium|high remain the known-good levels observed, re-confirmed 2026-07-18 alongside the grok-4.5 model-line rotation fix — no xhigh ceiling on grok, unchanged. Older docs.x.ai claimed no CLI effort flag — that is now stale.',
    },
    features: {
      sessionResume: { supported: true, mechanism: '`grok -s <id>` (named headless session) / `-r <id>` (resume) / `-c` (continue cwd). Adapter passes `-r <id>` only when opts.conversationId set. Background+session interaction UNCONFIRMED.' },
      fileOutput: { supported: false, mechanism: 'stdout only; no --output-file flag (CONFIRMED absent). Redirect --output-format json at the shell layer if a file is needed.' },
      streaming: { supported: true, mechanism: '`--output-format streaming-json` emits NDJSON events; accepted values are plain|json|streaming-json (plain = human-readable, CONFIRMED). Adapter uses `json` for a single trailing object suited to background capture.' },
    },
    webSearch: { headless: true, hopperEnabled: true, how: 'automatic — web_search/x_search are default agent tools (no flag needed)' },
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
      // Reasoning effort. grok --effort vocabulary is low|medium|high, but the
      // dispatch layer now defaults opts.reasoning to the canonical max 'xhigh'
      // (5-level scale), so clamp it down (xhigh→high, minimal→low). Escape hatch:
      // HOPPER_GROK_EFFORT overrides the level (empty string omits --effort
      // entirely, for grok builds that predate the flag). A direct adapter call
      // with no reasoning + no env still emits NO --effort (opt-in preserved).
      ...(() => {
        const raw = process.env.HOPPER_GROK_EFFORT !== undefined
          ? process.env.HOPPER_GROK_EFFORT
          : opts.reasoning;
        const eff = clampGrokEffort(raw);
        return eff ? ['--effort', eff] : [];
      })(),
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
    const signal = `${raw.stdout || ''}\n${raw.stderr || ''}`;
    const parsed = raw.exitCode === 0 ? extractGrokText(raw.stdout) : null;
    if (parsed) {
      // The runner's merged log can include unrelated MCP auth warnings. Prefer
      // a real trailing Grok JSON success envelope before the broad auth regex.
      const stop = (parsed.stopReason || '').toString().toLowerCase();
      const badStop = /cancel|abort|refus|error|fatal/.test(stop);
      if (parsed.parsedJson && !parsed.hasError && !badStop && parsed.text.trim()) {
        return parsed.usage
          ? { text: parsed.text, status: 'success', usage: parsed.usage }
          : { text: parsed.text, status: 'success' };
      }
    }
    // Auth-fail detection (exit codes UNDOCUMENTED → pattern-match like agy/kimi).
    // This remains the fallback for all nonzero exits and exit-0 output without a
    // valid successful JSON envelope.
    if (/unauthorized|invalid api key|XAI_API_KEY|not logged in|\b401\b|\b403\b|authenticat|authorizationrequired|transport channel closed|worker quit with fatal/i.test(signal)) {
      return {
        text: '',
        status: 'auth-fail',
        error: 'grok is not authenticated or was blocked by its permission mode. Set XAI_API_KEY / run `grok login --device-auth`. hopper passes --permission-mode bypassPermissions + --always-approve for headless dispatch.',
      };
    }
    if (raw.exitCode === 0) {
      // Preserve the legacy generic stdout contract only for text that is
      // genuinely non-structured. Structured JSON failures must not be
      // relabelled as successful plain output after auth detection.
      if (!parsed.structured && parsed.text.trim()) {
        return { text: parsed.text, status: 'success' };
      }
      return {
        text: parsed.text,
        status: 'unknown-fail',
        error: `grok produced no usable result${parsed.stopReason ? ` (stopReason="${parsed.stopReason}")` : ''}. ` +
          'Common cause: a blocked/cancelled headless turn — confirm grok is authenticated and re-dispatch (hopper sets --permission-mode bypassPermissions for headless).',
      };
    }
    return {
      text: raw.stdout,
      status: 'unknown-fail',
      error: `grok exited ${raw.exitCode}: ${(raw.stderr || '').slice(0, 500)}`,
    };
  },
};

/**
 * Clamp the canonical 5-level reasoning scale to grok's known-good --effort
 * vocabulary (low|medium|high). xhigh→high, minimal→low; unknown/empty → null
 * (omit the flag). Exported-by-position next to args() for locality.
 * @param {string|undefined|null} level
 * @returns {string|null}
 */
function clampGrokEffort(level) {
  switch (level) {
    case 'xhigh':
    case 'high': return 'high';
    case 'medium': return 'medium';
    case 'low':
    case 'minimal': return 'low';
    default: return null;
  }
}

/**
 * Defensive extraction of answer text from grok --output-format json stdout.
 * Field names are UNCONFIRMED (docs never document the object shape), so try
 * common keys, fall back to last JSON line, then raw text.
 * @param {string} stdout
 * @returns {{ text: string, usage?: object, stopReason?: string, parsedJson: boolean, hasError?: boolean, structured: boolean }}
 */
function extractGrokText(stdout) {
  const trimmed = (stdout || '').trim();
  const envelopeKeys = new Set([
    'text', 'content', 'output', 'result', 'response', 'message',
    'stopReason', 'stop_reason', 'finishReason', 'finish_reason', 'error', 'usage',
  ]);
  const fromValue = (value, fallbackText) => {
    // A literal JSON null is structured-invalid, even though it has no keys.
    if (value === null) {
      return { text: '', parsedJson: false, structured: true };
    }
    if (typeof value === 'string') {
      return { text: value, parsedJson: false, structured: false };
    }
    const obj = value;
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      const recognized = Object.keys(obj).some((key) => envelopeKeys.has(key));
      if (!recognized) {
        return { text: fallbackText, parsedJson: false, structured: false };
      }
      const text = obj.text ?? obj.message ?? obj.content ?? obj.output ?? obj.result ?? obj.response;
      const stopReason = obj.stopReason ?? obj.stop_reason ?? obj.finishReason ?? obj.finish_reason;
      return {
        text: typeof text === 'string' ? text : '',
        usage: obj.usage,
        stopReason,
        parsedJson: true,
        hasError: Boolean(obj.error),
        structured: true,
      };
    }
    return { text: fallbackText, parsedJson: false, structured: false };
  };
  const parseCandidate = (candidate, fallbackText) => {
    try {
      return fromValue(JSON.parse(candidate), fallbackText);
    } catch (_) {
      return null;
    }
  };

  const whole = parseCandidate(trimmed, trimmed);
  if (whole) return whole;

  // Grok emits one trailing JSON line after warnings. Inspect only that line;
  // earlier unrelated JSON must not hijack result classification.
  const lines = trimmed.split(/\r?\n/).filter((line) => line.trim());
  const trailing = lines[lines.length - 1] || '';
  const tail = trailing === trimmed ? null : parseCandidate(trailing, trimmed);
  if (tail) return tail;

  // A malformed object-shaped tail is structured only when it advertises a
  // recognized Grok envelope key. Braces, arrays, and citation tails alone are
  // ordinary legacy text.
  const keyPattern = /["']?(?:text|content|output|result|response|message|stopReason|stop_reason|finishReason|finish_reason|error|usage)["']?\s*:/;
  const candidate = trailing.trim();
  const malformedEnvelope = candidate.startsWith('{') && keyPattern.test(candidate);
  return { text: trimmed, parsedJson: false, structured: malformedEnvelope };
}
