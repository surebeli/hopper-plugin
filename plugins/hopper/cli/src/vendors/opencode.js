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
      return { text: extractOpencodeText(raw.stdout), status: 'success' };
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

  if (parsedJson) {
    const joined = chunks.join('').trim();
    if (joined) return joined;
  }

  // Legacy/plain-text fallback.
  let text = stdout.replace(/\x1b\[[0-9;]*m/g, '');
  text = text.replace(/^>\s+build\s+·\s+[^\n]+\n+/m, '').trim();
  return text;
}

function extractOpencodeEventText(event) {
  if (!event || typeof event !== 'object') return '';

  const kind = typeof event.type === 'string'
    ? event.type
    : typeof event.kind === 'string'
      ? event.kind
      : '';

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
