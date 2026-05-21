// Copilot vendor adapter (T-PLUGIN-05d)
// Anchor: cli/src/vendors/copilot.js
//
// Per T-PLUGIN-00b smoke: `copilot -p "<input>"` returns response.
// Per subagent research: requires GH_TOKEN env with "Copilot Requests" PAT permission.
// Quota meter: every -p call consumes premium request quota; use sparingly.

/** @type {import('../types.js').VendorAdapter} */
export const copilotAdapter = {
  name: 'copilot',
  command: 'copilot',
  stdinMode: 'none',

  // Phase 6a static capability hint.
  capabilities: {
    modelArg: {
      accepted: 'freeform',
      knownGood: ['claude-sonnet-4-5', 'gpt-4o-mini'],
      sourceNote: 'copilot --model <name>. Available models depend on user subscription tier (premium-request meter applies).',
    },
    reasoningArg: {
      accepted: 'ignored',
      knownGood: [],
      // Phase 6a dogfood 2026-05-21: Copilot CLI ACTUALLY supports --effort
      // {none|low|medium|high|xhigh|max} per live `copilot --help`. Our
      // adapter currently does NOT forward opts.reasoning to --effort.
      // Listed as 'ignored' here to reflect adapter behavior, not CLI
      // capability. Phase 6b candidate: wire opts.reasoning → --effort
      // (note: copilot has 6 levels including 'max' beyond codex's 4).
      sourceNote: 'Copilot CLI supports --effort {none|low|medium|high|xhigh|max} (verified 2026-05-21). Our adapter currently does NOT forward opts.reasoning to --effort. Mark as adapter-ignored, not CLI-unsupported.',
    },
    features: {
      sessionResume: { supported: true, mechanism: '`copilot --resume` (picker; UNCONFIRMED whether takes ID arg) / `--continue`. Sessions at ~/.copilot/session-state/ + SQLite.' },
      fileOutput: { supported: false, mechanism: 'stdout only.' },
      streaming: { supported: true, mechanism: 'copilot -p streams during execution.' },
    },
    staleAfter: '2026-08-21',
  },

  args(input, opts) {
    return [
      '-p', input,
      // Optional --model when explicitly chosen
      ...(opts.model ? ['--model', opts.model] : []),
    ];
  },

  envPreflight() {
    // Per codex Phase 2 audit F1: broaden to include COPILOT_GITHUB_TOKEN
    // + gh CLI auth fallback (Copilot CLI can sometimes pick up `gh auth status`).
    if (process.env.GH_TOKEN || process.env.GITHUB_TOKEN || process.env.COPILOT_GITHUB_TOKEN) {
      return { ok: true, missing: [] };
    }
    // Soft warn — gh CLI may have auth cached (Copilot can fall back to it on some installs)
    return {
      ok: true,
      missing: ['Note: no GH_TOKEN/GITHUB_TOKEN/COPILOT_GITHUB_TOKEN env var set. Copilot may pick up `gh auth status` cache, or smoke may fail. See https://docs.github.com/copilot/concepts/agents/about-copilot-cli'],
    };
  },

  timeoutMs(_opts) {
    return 120_000;
  },

  parseResult(raw) {
    if (raw.timedOut) {
      return { text: raw.stdout, status: 'timeout', error: `copilot -p timed out after ${raw.durationMs}ms` };
    }
    if (raw.exitCode === 127) {
      return {
        text: '',
        status: 'permission-fail',
        error: 'copilot binary not found. Install: npm install -g @github/copilot OR brew install copilot-cli',
      };
    }
    // Copilot quota exhaustion: surfaces as specific error in stdout/stderr
    if (raw.stderr.match(/quota|rate.limit|premium request/i) || raw.stdout.match(/quota exceeded|rate.limit/i)) {
      return {
        text: raw.stdout,
        status: 'permission-fail',
        error: 'Copilot premium request quota exceeded. Upgrade subscription or wait for monthly reset.',
      };
    }
    if (raw.exitCode === 0) {
      // Strip Copilot footer: "Changes / Requests / Tokens" usage block
      let text = raw.stdout;
      // Try to find and trim the usage footer (starts at "Changes" or "Requests" near end)
      const footerStart = text.search(/\n\s*(Changes|Requests)\s+[+\-]?\d/);
      if (footerStart > 0) text = text.slice(0, footerStart);
      // Parse usage from footer if present
      const usageMatch = raw.stdout.match(/Requests\s+([\d.]+)\s+Premium/);
      const usage = usageMatch ? { premiumRequests: parseFloat(usageMatch[1]) } : undefined;
      return { text: text.trim(), status: 'success', usage };
    }
    return {
      text: raw.stdout,
      status: 'unknown-fail',
      error: `copilot exited ${raw.exitCode}: ${(raw.stderr || '').slice(0, 500)}`,
    };
  },
};
