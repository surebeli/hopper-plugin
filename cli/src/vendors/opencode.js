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

  args(input, opts) {
    return [
      'run',
      input,
      ...(opts.model ? ['--model', opts.model] : []),
      ...(opts.conversationId ? ['-s', opts.conversationId] : []),
    ];
  },

  envPreflight() {
    // opencode stores auth in platform-specific paths
    // Windows: %APPDATA%\opencode\auth.json typically
    // Linux/Mac: ~/.local/share/opencode/auth.json
    const candidates = [
      join(homedir(), '.local', 'share', 'opencode', 'auth.json'),
      join(homedir(), 'AppData', 'Roaming', 'opencode', 'auth.json'),
      join(homedir(), 'Library', 'Application Support', 'opencode', 'auth.json'),
    ];
    if (candidates.some((p) => existsSync(p))) {
      return { ok: true, missing: [] };
    }
    return {
      ok: false,
      missing: ['Configure opencode providers: run `opencode auth` interactively OR set env-var refs in opencode.json'],
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
