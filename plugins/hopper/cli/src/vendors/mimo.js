// MiMoCode vendor adapter (XiaomiMiMo/MiMo-Code)
// Anchor: cli/src/vendors/mimo.js
//
// MiMoCode is an OpenCode fork with a `mimo run` noninteractive path. Verified
// against local @mimo-ai/cli 0.1.0 and the public XiaomiMiMo/MiMo-Code README.

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { applyTaskTypeFloor } from '../subprocess.js';

function reasoningVariant(reasoning) {
  if (!reasoning) return null;
  return reasoning === 'xhigh' ? 'max' : reasoning;
}

/** @type {import('../types.js').VendorAdapter} */
export const mimoAdapter = {
  name: 'mimo',
  command: 'mimo',
  stdinMode: 'none',

  capabilities: {
    modelArg: {
      accepted: 'freeform',
      knownGood: ['mimo/mimo-auto', 'xiaomi/mimo-v2.5-pro', 'xiaomi/mimo-v2.5-pro-ultraspeed'],
      sourceNote: 'MiMoCode `mimo run -m, --model <provider/model>` accepts provider/model identifiers. Run `mimo models` for the account-local catalog.',
    },
    reasoningArg: {
      accepted: 'enumerated',
      knownGood: ['minimal', 'low', 'medium', 'high', 'xhigh'],
      sourceNote: 'MiMoCode exposes provider-specific reasoning via `--variant`; hopper maps `--reasoning xhigh` to MiMo `--variant max` and forwards the other levels verbatim.',
    },
    features: {
      sessionResume: { supported: true, mechanism: '`mimo run --session <id>` / `--continue` / `--fork`' },
      fileOutput: { supported: false, mechanism: 'stdout only; use `--format json` + shell redirect.' },
      streaming: { supported: true, mechanism: '`mimo run --format json` emits newline-delimited JSON events; text events carry `part.text`.' },
      permissions: { supported: true, mechanism: 'Default hopper dispatch uses `--agent build --dangerously-skip-permissions`; explicit read-only dispatch uses `--agent plan` and does not skip permissions.' },
    },
    webSearch: { headless: true, hopperEnabled: false, how: 'Exa websearch; set MIMOCODE_ENABLE_EXA=1 or use the MiMo provider (not auto-forwarded)' },
    staleAfter: '2026-09-11',
  },

  args(input, opts) {
    const sandbox = opts.sandbox ?? 'danger-full-access';
    const variant = reasoningVariant(opts.reasoning);
    const agent = sandbox === 'read-only' ? 'plan' : 'build';
    const argv = [
      'run',
      input,
      ...(opts.cwd ? ['--dir', opts.cwd] : []),
      ...(opts.model ? ['--model', opts.model] : []),
      ...(opts.conversationId ? ['--session', opts.conversationId] : []),
      '--agent', agent,
      '--format', 'json',
      '--pure',
      '--print-logs',
      ...(variant ? ['--variant', variant] : []),
    ];

    if (sandbox === 'danger-full-access') argv.push('--dangerously-skip-permissions');
    return argv;
  },

  envPreflight() {
    const candidates = [
      join(homedir(), '.local', 'share', 'mimocode', 'auth.json'),
      join(homedir(), '.config', 'mimocode', 'mimocode.json'),
      join(homedir(), '.mimocode', 'mimocode.json'),
      join(process.cwd(), '.mimocode', 'mimocode.json'),
    ];
    if (candidates.some((p) => existsSync(p))) return { ok: true, missing: [] };
    if (process.env.MIMO_API_KEY || process.env.XIAOMI_MIMO_API_KEY) {
      return { ok: true, missing: [] };
    }
    return {
      ok: true,
      missing: ['Note: no obvious MiMoCode auth/config found. If smoke fails, run `mimo` for first-launch setup or configure MiMo Auto / Xiaomi MiMo Platform credentials.'],
    };
  },

  timeoutMs(opts) {
    return applyTaskTypeFloor(180_000, opts);
  },

  parseResult(raw) {
    if (raw.timedOut) {
      return { text: raw.stdout, status: 'timeout', error: `mimo run timed out after ${raw.durationMs}ms` };
    }
    if (raw.exitCode === 127 || /not found|command not found/i.test(raw.stderr || '')) {
      return {
        text: '',
        status: 'permission-fail',
        error: 'mimo binary not found in PATH. Install: curl -fsSL https://mimo.xiaomi.com/install | bash OR npm install -g @mimo-ai/cli.',
      };
    }

    const signal = `${raw.stdout || ''}\n${raw.stderr || ''}`;
    if (/unauthoriz|invalid.*api|api key|credential|not logged in|\b401\b|\b403\b/i.test(signal)) {
      return {
        text: '',
        status: 'auth-fail',
        error: 'MiMo auth error. Run `mimo` for first-launch setup, or configure Xiaomi MiMo Platform credentials.',
      };
    }
    if (/permission denied|operation not permitted|\bEPERM\b|not allowed/i.test(signal)) {
      return {
        text: raw.stdout,
        status: 'permission-fail',
        error: `mimo permission error: ${(raw.stderr || raw.stdout || '').slice(0, 500)}`,
      };
    }

    if (raw.exitCode === 0) {
      const parsed = extractMimoJsonText(raw.stdout);
      return {
        text: parsed.text,
        status: 'success',
        usage: parsed.totalTokens ? { totalTokens: parsed.totalTokens } : undefined,
      };
    }

    return {
      text: raw.stdout,
      status: 'unknown-fail',
      error: `mimo exited ${raw.exitCode}: ${(raw.stderr || '').slice(0, 500)}`,
    };
  },
};

export function extractMimoJsonText(stdout) {
  const trimmed = (stdout || '').trim();
  if (!trimmed) return { text: '', totalTokens: undefined };

  const lines = trimmed.split(/\r?\n/).filter((line) => line.trim());
  const chunks = [];
  let parsedJson = false;
  let totalTokens;

  for (const line of lines) {
    try {
      const event = JSON.parse(line);
      parsedJson = true;
      const text = extractMimoEventText(event);
      if (text) chunks.push(text);
      const tokens = event?.part?.tokens?.total ?? event?.tokens?.total;
      if (typeof tokens === 'number') totalTokens = tokens;
    } catch (_) {
      // Mixed output is possible; fall back to raw text if nothing parsed.
    }
  }

  if (parsedJson) return { text: chunks.join('').trim(), totalTokens };
  return { text: trimmed, totalTokens: undefined };
}

function extractMimoEventText(event) {
  if (!event || typeof event !== 'object') return '';
  if (event.type === 'text' && typeof event.text === 'string') return event.text;
  if (event.type === 'text' && typeof event.part?.text === 'string') return event.part.text;
  if (typeof event.delta === 'string') return event.delta;
  if (typeof event.part?.delta === 'string') return event.part.delta;
  if (event.type === 'message.part.delta' && typeof event.delta === 'string') return event.delta;
  if (event.type === 'message.part.delta' && typeof event.part?.text === 'string') return event.part.text;
  return '';
}
