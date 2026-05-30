// Kimi vendor adapter (T-PLUGIN-05b; migrated to Kimi Code 0.x in T-KIMI-MIGRATE)
// Anchor: cli/src/vendors/kimi.js
//
// MIGRATION (2026-05-23): the `kimi` CLI was REPLACED, not version-bumped.
//   OLD: MoonshotAI/kimi-cli (Python, `pip install kimi-cli`, ~/.kimi/, v1.x)
//   NEW: @moonshot-ai/kimi-code (TypeScript/Node>=22, npm/curl, ~/.kimi-code/, v0.x)
// The binary name is STILL `kimi` (npm bin map), so `command: 'kimi'` is unchanged,
// but the headless flags, config path, and reasoning model all changed.
//
// ⚠ BINARY NAME COLLISION: both products ship a `kimi` binary; whichever is on
// PATH wins, and their version numbers collide (legacy 1.x vs new 0.x). Do NOT
// branch on the version string. This adapter targets the NEW Kimi Code 0.x and
// uses ONLY flags that exist in both-or-new (`-p`, `-m`, `--session`); the new
// tool uses Commander allowUnknownOption(false), so emitting a removed legacy
// flag (--print/--afk/--final-message-only/--thinking) would make it ERROR OUT.
//
// SOURCE & CONFIDENCE: migrated from a 3-way web research sweep of
// moonshotai.github.io/kimi-code + npm @moonshot-ai/kimi-code@0.6.0 binary
// inspection + adversarial verification (verdict: proceed-with-corrections,
// overall_confidence high). Items marked UNCONFIRMED handled defensively.

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { applyTaskTypeFloor } from '../subprocess.js';

/** @type {import('../types.js').VendorAdapter} */
export const kimiAdapter = {
  name: 'kimi',
  command: 'kimi',
  stdinMode: 'none',

  capabilities: {
    modelArg: {
      accepted: 'freeform',
      knownGood: ['kimi-code/kimi-for-coding'],
      sourceNote: 'Kimi Code 0.x `-m, --model <ALIAS>` takes the config ALIAS KEY (from `[models."NAME"]` blocks in ~/.kimi-code/config.toml), NOT an upstream Moonshot model id. Default alias when -m omitted: `kimi-code/kimi-for-coding` (provider managed:kimi-code, upstream id kimi-for-coding, 262144 ctx). `-m ""` is rejected ("Model cannot be empty"). Underlying flagship coding model this era: Kimi K2.5. Do NOT hardcode upstream ids (kimi-k2.6 / kimi-k2-thinking UNCONFIRMED). No `kimi models` introspection command — config file is the source of truth (now ~/.kimi-code/, not legacy ~/.kimi/).',
    },
    reasoningArg: {
      accepted: 'ignored',
      knownGood: [],
      sourceNote: 'Kimi Code 0.x REMOVED the --thinking/--no-thinking argv toggle (CONFIRMED moonshotai.github.io + binary Commander has no such flag, allowUnknownOption(false)). Reasoning is now CONFIG-driven in ~/.kimi-code/config.toml: top-level default_thinking (bool) + [thinking] table mode=auto|on|off, effort=low|medium|high|xhigh|max|off (also via KIMI_MODEL_THINKING_MODE / KIMI_MODEL_THINKING_EFFORT env). There is NO per-invocation argv reasoning flag in -p mode. kimi.com legacy product docs still list --thinking (UNCONFIRMED cross-source conflict, that is the wound-down Python tool) — adapter emits NO reasoning flag so it degrades safely on both binaries.',
    },
    features: {
      sessionResume: { supported: true, mechanism: '`kimi --session <id>` / `-S <id>` (documented short flag in 0.x; was `-r` in legacy) / `-C` (continue most recent in cwd). `-r` retained as a hidden alias of --session. Prompt mode rejects --session without an id, so adapter forwards it only when opts.conversationId is set.' },
      fileOutput: { supported: false, mechanism: 'stdout only; no --output-file flag. Use --output-format stream-json + shell redirect if needed.' },
      streaming: { supported: true, mechanism: '`-p` streams assistant text to stdout; thinking, tool progress, and the "To resume this session: kimi -r <id>" hint go to stderr. `--output-format stream-json` emits one JSON object per stdout line (thinking excluded); default `text`.' },
    },
    staleAfter: '2026-08-31',
  },

  args(input, opts) {
    // Kimi Code 0.x headless form (CONFIRMED): kimi -p "<prompt>" [-m <alias>] [--session <id>]
    // REMOVED in the 0.x rewrite (would ERROR OUT — Commander allowUnknownOption(false)):
    //   --print, --afk, --final-message-only, --thinking, --no-thinking.
    // Do NOT emit --yolo/--auto/--plan: prompt mode forces 'auto' permission and
    // throws OptionConflictError if combined with them. Reasoning is config-driven
    // (no argv flag), so opts.reasoning is intentionally not forwarded.
    return [
      '-p', input,
      ...(opts.model ? ['-m', opts.model] : []),
      ...(opts.conversationId ? ['--session', opts.conversationId] : []),
    ];
  },

  envPreflight() {
    // Config path MOVED to ~/.kimi-code/ in the 0.x rewrite; legacy ~/.kimi/ is the
    // old Python tool and is never touched by migration (checking only it would
    // false-negative on fresh new installs). Honor $KIMI_CODE_HOME override.
    // Soft-warn pattern (OAuth creds may live at ~/.kimi-code/credentials/).
    const codeHome = process.env.KIMI_CODE_HOME
      ? process.env.KIMI_CODE_HOME
      : join(homedir(), '.kimi-code');
    const candidates = [
      join(codeHome, 'config.toml'),                          // new primary (TOML-only)
      join(codeHome, 'credentials'),                          // OAuth creds dir (CONFIRMED)
      join(codeHome, 'config.migrated-from-kimi-cli.toml'),   // migration marker
      join(homedir(), '.kimi', 'config.toml'),                // legacy fallback
      join(homedir(), '.kimi', 'config.json'),                // legacy fallback
    ];
    if (candidates.some((p) => existsSync(p))) return { ok: true, missing: [] };
    if (process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY) {
      return { ok: true, missing: [] };
    }
    return {
      ok: true,
      missing: ['Note: no ~/.kimi-code/config.toml (or $KIMI_CODE_HOME) / credentials or KIMI_API_KEY found. If smoke fails, run `kimi` then `/login` (Kimi Code OAuth or Moonshot API key), OR set KIMI_API_KEY.'],
    };
  },

  timeoutMs(opts) {
    // Native: 180s (thinking is config-default-on; coding agent runs can be long).
    const native = 180_000;
    // Phase 6c F1: review task-types get raised to 30min floor.
    return applyTaskTypeFloor(native, opts);
  },

  parseResult(raw) {
    if (raw.timedOut) {
      return { text: raw.stdout, status: 'timeout', error: `kimi -p timed out after ${raw.durationMs}ms` };
    }
    if (raw.exitCode === 127 || /not found|command not found/i.test(raw.stderr || '')) {
      return {
        text: '',
        status: 'permission-fail',
        error: 'kimi binary not found in PATH. Install: curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash (Windows: irm https://code.kimi.com/kimi-code/install.ps1 | iex; or npm i -g @moonshot-ai/kimi-code, Node >=22.19.0).',
      };
    }
    // Primary auth-fail (0.x routes auth errors to stderr + sets non-zero exit;
    // 401->AuthenticationError, 403->PermissionDenied, 402 membership).
    const signal = `${raw.stdout || ''}\n${raw.stderr || ''}`;
    if (/invalid authentication|api key.*(invalid|expired)|verify your membership|usage limit|unauthoriz|not logged in|\b401\b|\b40[23]\b/i.test(signal)) {
      const msg = signal.match(/'message':\s*"([^"]+)"/);
      return {
        text: '',
        status: 'auth-fail',
        error: msg ? `Kimi auth: ${msg[1]}` : 'Kimi auth/membership error. Run `kimi` then `/login`, or set KIMI_API_KEY.',
      };
    }
    // Legacy-compat fallback: the Python 1.x client printed HTTP 402 to stdout at
    // exit 0. UNCONFIRMED whether the Node 0.x tool ever does this; kept defensively.
    if (raw.stdout.includes('Error code: 4') && raw.stdout.includes("'error'")) {
      const msg = raw.stdout.match(/'message':\s*"([^"]+)"/);
      return {
        text: raw.stdout,
        status: 'auth-fail',
        error: msg ? `Kimi auth/membership: ${msg[1]}` : 'Kimi auth/membership error (legacy stdout 402).',
      };
    }
    if (raw.exitCode === 0 && raw.stdout) {
      // 0.x sends the "To resume this session: kimi -r <id>" hint to STDERR, so this
      // strip is now a defensive no-op for the new tool (still strips the legacy 1.x
      // stdout footer). Assistant text is already stdout-only in -p mode.
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
