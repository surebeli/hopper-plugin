// Copilot vendor adapter (T-PLUGIN-05d)
// Anchor: cli/src/vendors/copilot.js
//
// Per T-PLUGIN-00b smoke: `copilot -p "<input>"` returns response.
// Per subagent research: requires GH_TOKEN env with "Copilot Requests" PAT permission.
// Quota meter: every -p call consumes premium request quota; use sparingly.

import { applyTaskTypeFloor } from '../subprocess.js';

/** @type {import('../types.js').VendorAdapter} */
export const copilotAdapter = {
  name: 'copilot',
  command: 'copilot',
  stdinMode: 'none',

  // Phase 6a static capability hint.
  capabilities: {
    modelArg: {
      accepted: 'freeform',
      knownGood: [],  // No canonical list — depends on user Copilot subscription tier
      sourceNote: 'copilot --model <name>. Available models depend on YOUR Copilot subscription tier (premium-request meter applies; Business/Enterprise tiers see different models). Not hardcoded in this adapter.',
    },
    reasoningArg: {
      accepted: 'ignored',
      knownGood: [],
      // Phase 6b research 2026-05-21: Copilot's --effort enum is GROWING
      // rapidly. Official changelog confirms {none|low|medium|high|xhigh}
      // (5 levels); empirical dev-machine help shows `max` too (6 levels)
      // — `max` is UNCONFIRMED in docs as of research date, possibly a
      // post-1.0.48 addition or per-model alias. Enum has expanded twice
      // in two months. DO NOT enumerate client-side; let copilot validate.
      // Our adapter does NOT forward opts.reasoning to --effort regardless.
      sourceNote: 'Copilot CLI supports --effort (5 doc-confirmed levels: none|low|medium|high|xhigh; `max` empirically present but UNCONFIRMED in docs — enum growing). Our adapter does NOT forward opts.reasoning to --effort. Adapter-ignored, not CLI-unsupported. NOTE Phase 6c follow-up: copilot non-interactive mode requires --allow-all-tools / --allow-all-paths or it silently blocks ALL writes (including to its own output.md) and may escalate to General-purpose sub-agents that write to wrong files. Our args() now passes these explicitly.',
    },
    features: {
      sessionResume: { supported: true, mechanism: '`copilot --resume` (picker; UNCONFIRMED whether takes ID arg) / `--continue`. Sessions at ~/.copilot/session-state/ + SQLite.' },
      fileOutput: { supported: false, mechanism: 'stdout only.' },
      streaming: { supported: true, mechanism: 'copilot -p streams during execution.' },
    },
    staleAfter: '2026-08-21',
  },

  args(input, opts) {
    const sandbox = opts.sandbox ?? 'danger-full-access';
    return [
      '-p', input,
      // Phase 6c follow-up (T-AUDIT-PH6C-copilot sub-agent escape investigation):
      // Without --allow-all-tools, copilot CLI's non-interactive permission
      // model blocks ALL write attempts (file edits, shell, Python, Node — every
      // exec path probed) AND blocks `copilot` from writing its own dispatched
      // output.md. Copilot then escalates to a General-purpose sub-agent which
      // runs in a DIFFERENT permission scope and writes content to a DIFFERENT
      // file (T-AUDIT-PH6C-agy-output.md got contaminated in the dogfood run).
      // --allow-all-tools makes the permission model match hopper's default:
      // implementation dispatches can use shell/file-edit tools and write their
      // own output. Explicit read-only tasks omit this grant and rely on
      // Copilot's native permission model.
      ...(sandbox === 'danger-full-access' ? ['--allow-all-tools', '--allow-all-paths'] : []),
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

  timeoutMs(opts) {
    // Native: 120s for typical copilot -p call
    // Phase 6c F1: review task-types get raised to 30min floor (was the
    // most aggressively misaligned vendor — killed in 122s before context-load done)
    return applyTaskTypeFloor(120_000, opts);
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
