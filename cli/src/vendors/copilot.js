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

  args(input, opts) {
    return [
      '-p', input,
      // Optional --model when explicitly chosen
      ...(opts.model ? ['--model', opts.model] : []),
    ];
  },

  envPreflight() {
    // GH_TOKEN OR GITHUB_TOKEN required for headless mode
    if (process.env.GH_TOKEN || process.env.GITHUB_TOKEN) {
      return { ok: true, missing: [] };
    }
    return {
      ok: false,
      missing: ['Set GH_TOKEN (or GITHUB_TOKEN) with a PAT having "Copilot Requests" permission. See https://docs.github.com/copilot/concepts/agents/about-copilot-cli'],
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
