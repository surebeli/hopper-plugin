// OpenCode vendor adapter (T-PLUGIN-05c)
// Anchor: cli/src/vendors/opencode.js
//
// Per T-PLUGIN-00b resolved: `opencode run "<input>" [--model <provider/model>]`
// Per T-00b finding: user's 1.15.3 works fine for `opencode run`; #3213 hang
// regression affects TUI mode only. Pin 0.14.7 is fallback if user reports issues.

import { existsSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';
import { applyTaskTypeFloor } from '../subprocess.js';

// This is intentionally narrower than the completion parser: an answer can be
// completed by several OpenCode event forms, but runtime model evidence is
// available only in this approved, versioned terminal result shape.
const OPENCODE_RUNTIME_MODEL_METADATA = Object.freeze({
  schemaVersion: 1,
  resultVersion: 1,
  terminal: Object.freeze({ type: 'result', subtype: 'success' }),
  providerField: 'providerID',
  modelField: 'modelID',
  source: 'opencode.result.providerID-modelID',
});

/** @type {import('../types.js').VendorAdapter} */
export const opencodeAdapter = {
  name: 'opencode',
  command: 'opencode',
  stdinMode: 'none',
  runtimeModelMetadata: OPENCODE_RUNTIME_MODEL_METADATA,

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
      sourceNote: 'CORRECTION (ISSUE-codex-vendor-model-effort, 2026-06): `opencode run --variant <name>` DOES exist (the earlier "no CLI flag" note was stale). But variant values are provider/model-specific and validated by the provider API, and opencode runs arbitrary models, so the adapter does NOT forward the canonical xhigh default automatically (would break non-reasoning models). Default path: ignored. Opt-in: set HOPPER_OPENCODE_VARIANT=<variant> to pass --variant.',
    },
    features: {
      sessionResume: { supported: true, mechanism: '`opencode run --session <id>` / `--continue` / `--fork`. Session IDs per-machine (sst/opencode#10349 — not portable Win<->macOS).' },
      fileOutput: { supported: false, mechanism: 'No --output flag; stdout-only. Use `--format json` + shell redirect.' },
      streaming: { supported: true, mechanism: 'opencode run streams events; exits when idle.' },
    },
    webSearch: { headless: false, hopperEnabled: false, how: 'off by default; set OPENCODE_ENABLE_EXA=1 or use the Zen provider (not headless out of the box)' },
    staleAfter: '2026-08-21',
  },

  args(input, opts) {
    const sandbox = opts.sandbox ?? 'danger-full-access';
    const argv = [
      'run',
      input,
      // opencode `--dir` sets the working dir; its external_directory sandbox is
      // relative to it. hopper injects opts.cwd = the resolved vendor CWD (repo
      // root by default, or $HOPPER_VENDOR_CWD if the user widened it). Passing
      // it explicitly is more reliable than relying on the spawned process CWD,
      // and lets a user-widened root reach external evidence without disabling
      // opencode's own permission model.
      ...(opts.cwd ? ['--dir', opts.cwd] : []),
      ...(opts.model ? ['--model', opts.model] : []),
      // `opencode run --variant <provider-specific>` sets reasoning effort, but the
      // valid set is PER-MODEL (validated by the provider API) and opencode runs
      // arbitrary provider models — so unlike mimo (a fork with a known variant set)
      // we do NOT forward the xhigh default automatically (it would break non-
      // reasoning models). Opt-in: HOPPER_OPENCODE_VARIANT (ISSUE-codex-vendor-model-effort).
      ...(process.env.HOPPER_OPENCODE_VARIANT
        ? ['--variant', process.env.HOPPER_OPENCODE_VARIANT]
        : []),
      ...(opts.conversationId ? ['-s', opts.conversationId] : []),
      '--print-logs',
      '--format', 'json',
      '--pure',
    ];

    // Product default is full vendor write access. For opencode, that maps to
    // skipping interactive permission prompts. If the task is explicitly
    // read-only, omit the bypass and let opencode's own permission model apply.
    if (sandbox === 'danger-full-access') argv.push('--dangerously-skip-permissions');

    return argv;
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

  timeoutMs(opts) {
    // Native: 180s for typical opencode run
    // Phase 6c F1: review task-types get raised to 30min floor
    return applyTaskTypeFloor(180_000, opts);
  },

  parseResult(raw) {
    if (raw.timedOut) {
      return { text: raw.stdout, status: 'timeout', error: `opencode run timed out after ${raw.durationMs}ms` };
    }
    if (raw.exitCode === 127) {
      return { text: '', status: 'permission-fail', error: 'opencode binary not found. Install: npm install -g opencode-ai/opencode' };
    }
    if (raw.exitCode === 0) {
      const text = extractOpencodeText(raw.stdout);
      if (!opencodeAnswerCompleted(raw.stdout) || !text) {
        return {
          text,
          status: 'unknown-fail',
          error: 'opencode exited 0 without authoritative completion evidence and usable result text.',
        };
      }
      const modelAttestation = extractOpencodeModelAttestation(raw.stdout);
      return modelAttestation ? { text, status: 'success', modelAttestation } : { text, status: 'success' };
    }
    return {
      text: raw.stdout,
      status: 'unknown-fail',
      error: `opencode exited ${raw.exitCode}: ${(raw.stderr || '').slice(0, 500)}`,
    };
  },
};

function extractOpencodeText(stdout) {
  const trimmed = (stdout || '').trim();
  if (!trimmed) return '';

  const lines = trimmed.split(/\r?\n/).filter((line) => line.trim());
  const chunks = [];
  let parsedJson = false;

  for (const line of lines) {
    try {
      const event = JSON.parse(line);
      parsedJson = true;
      const text = extractOpencodeEventText(event);
      if (text) chunks.push(text);
    } catch (_) {
      // Mixed stdout is possible; fall back below if the stream wasn't JSON.
    }
  }

  // Once a structured stream is present, never fall back to rendering raw JSON
  // or diagnostic lines as the answer. A usable answer must come from an
  // answer-bearing event, and completion is checked separately below.
  if (parsedJson) return chunks.join('').trim();

  // Legacy/plain-text fallback.
  let text = stdout.replace(/\x1b\[[0-9;]*m/g, '');
  text = text.replace(/^>\s+build\s+·\s+[^\n]+\n+/m, '').trim();
  return text;
}

/**
 * Read only the approved top-level identity pair from a successful terminal
 * result. Do not inspect nested request echoes or completion stream events.
 * @param {string} stdout
 * @returns {{observedModels:string[],source:string,observedAt:string}|undefined}
 */
function extractOpencodeModelAttestation(stdout) {
  const lines = String(stdout || '').split(/\r?\n/).filter((line) => line.trim());
  for (let index = lines.length - 1; index >= 0; index--) {
    let envelope;
    try { envelope = JSON.parse(lines[index]); } catch (_) { continue; }
    if (!isApprovedOpencodeTerminalEnvelope(envelope)) continue;
    const provider = normalizeOpencodeIdentityComponent(envelope[OPENCODE_RUNTIME_MODEL_METADATA.providerField]);
    const model = normalizeOpencodeIdentityComponent(envelope[OPENCODE_RUNTIME_MODEL_METADATA.modelField]);
    if (!provider || !model) return undefined;
    return {
      observedModels: [`${provider}/${model}`],
      source: OPENCODE_RUNTIME_MODEL_METADATA.source,
      observedAt: new Date().toISOString(),
    };
  }
  return undefined;
}

function isApprovedOpencodeTerminalEnvelope(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && OPENCODE_RUNTIME_MODEL_METADATA.schemaVersion === 1
    && value.version === OPENCODE_RUNTIME_MODEL_METADATA.resultVersion
    && value.type === OPENCODE_RUNTIME_MODEL_METADATA.terminal.type
    && value.subtype === OPENCODE_RUNTIME_MODEL_METADATA.terminal.subtype
    && value.is_error === false;
}

function normalizeOpencodeIdentityComponent(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized && !normalized.includes('/') ? normalized : null;
}

/**
 * Returns true only when an OpenCode JSON stream contains a whitelisted
 * authoritative completion event: a reasonless/terminal `step_finish`, an
 * exact `message.completed`, or an explicit successful `result` envelope.
 * Older/forward-compatible wrappers may place those events under
 * event/data/payload. Tool-call, error, and cancellation boundaries are
 * deliberately excluded because they do not prove a usable final answer.
 *
 * @param {string} log full stdout/log stream
 * @returns {boolean}
 */
export function opencodeAnswerCompleted(log) {
  if (!log) return false;
  for (const line of String(log).split(/\r?\n/)) {
    let parsed;
    try { parsed = JSON.parse(line); } catch (_) { continue; }
    if (containsTerminalOpencodeEvent(parsed)) return true;
  }
  return false;
}

function containsTerminalOpencodeEvent(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 4) return false;
  const type = normalizeProtocolToken(node.type ?? node.kind);
  const reason = normalizeProtocolToken(node.part?.reason ?? node.reason);
  if (type === 'step_finish') {
    // OpenCode 1.17+ has emitted authoritative step_finish records without a
    // reason. An explicit mid-turn/tool reason remains non-terminal.
    return reason === '' || isTerminalStopReason(reason);
  }
  if (type === 'message.completed' || type === 'message_completed') return true;
  if (type === 'result') return isSuccessfulResultEnvelope(node);

  for (const key of ['event', 'data', 'payload', 'result']) {
    if (containsTerminalOpencodeEvent(node[key], depth + 1)) return true;
  }
  return false;
}

function normalizeProtocolToken(value) {
  return typeof value === 'string'
    ? value.trim().toLowerCase().replace(/-/g, '_')
    : '';
}

function isTerminalStopReason(reason) {
  return new Set([
    'stop', 'finished', 'finish', 'completed', 'complete', 'end_turn',
    'length', 'max_tokens',
  ]).has(reason);
}

function isSuccessfulResultEnvelope(node) {
  const nested = node.result && typeof node.result === 'object' ? node.result : null;
  const outcomes = [
    node.subtype, node.status, node.state, node.stop_reason, node.reason,
    nested?.subtype, nested?.status, nested?.state, nested?.stop_reason, nested?.reason,
  ].map(normalizeProtocolToken).filter(Boolean);

  const failed = outcomes.some((outcome) => new Set([
    'error', 'failed', 'failure', 'cancelled', 'canceled', 'aborted', 'abort',
    'interrupted', 'timeout', 'timed_out',
  ]).has(outcome) || outcome.startsWith('error_'));
  if (failed || node.is_error === true || node.success === false ||
      node.cancelled === true || node.canceled === true ||
      (typeof node.error === 'string' && node.error.trim()) || node.error === true) {
    return false;
  }

  const succeeded = outcomes.some((outcome) => new Set([
    'success', 'succeeded', 'completed', 'complete', 'done', 'stop',
    'end_turn', 'finished', 'finish',
  ]).has(outcome));
  return node.is_error === false || node.success === true || succeeded;
}

function extractOpencodeEventText(event) {
  if (!event || typeof event !== 'object') return '';

  const kind = typeof event.type === 'string'
    ? event.type
    : typeof event.kind === 'string'
      ? event.kind
      : '';

  // opencode >= 1.17 emits assistant output as `{type:"text", part:{text:"..."}}`
  // (the same event schema as the MiMoCode fork), NOT the older
  // `message.part.delta`. The kind allow-list below rejects bare "text", so
  // without this branch the parser collected NOTHING and fell back to dumping the
  // raw JSON event stream as the result — a dispatch that "succeeds" with
  // unusable JSON noise. Handle the new text-part shape first.
  if (kind === 'text') {
    if (typeof event.text === 'string') return event.text;
    if (typeof event.part?.text === 'string') return event.part.text;
    return '';
  }

  if (kind && !/message|assistant|output|response|result/i.test(kind)) {
    return '';
  }

  return collectOpencodeText(event);
}

function collectOpencodeText(node, depth = 0) {
  if (depth > 6 || node == null) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) {
    return node.map((part) => collectOpencodeText(part, depth + 1)).join('');
  }
  if (typeof node !== 'object') return '';

  for (const key of ['text', 'delta', 'content', 'value']) {
    if (typeof node[key] === 'string') return node[key];
  }

  for (const key of ['message', 'part', 'parts', 'payload', 'data', 'result', 'output']) {
    const text = collectOpencodeText(node[key], depth + 1);
    if (text) return text;
  }

  return '';
}
