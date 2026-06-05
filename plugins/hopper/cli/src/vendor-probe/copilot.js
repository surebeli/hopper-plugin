// copilot vendor probe — `copilot version` + filesystem scan for custom agents
// Anchor: cli/src/vendor-probe/copilot.js

import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { resolveCommandOnPath } from '../path-resolve.js';
import { killProcessTree } from '../subprocess.js';

const PROBE_TIMEOUT_MS = 30_000;
const IS_WINDOWS = process.platform === 'win32';

/**
 * P1-fix: pure helper exposed for static-fixture testing.
 * Scans a directory for `*.agent.md` files; returns agent names (basename
 * minus `.agent.md`), optionally suffixing each (e.g. " (project)"). Missing
 * directory returns []. Read errors return [].
 */
export function scanAgentMdFiles(dir, suffix = '') {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith('.agent.md'))
      .map((f) => f.replace(/\.agent\.md$/, '') + suffix);
  } catch (_) {
    return [];
  }
}

// P4-fix: timeout uses killProcessTree to prevent Windows process-tree leak.
function runOnce(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      detached: !IS_WINDOWS,
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    const timer = setTimeout(() => { timedOut = true; killProcessTree(child.pid, IS_WINDOWS); }, PROBE_TIMEOUT_MS);
    timer.unref();
    child.on('close', (code) => { clearTimeout(timer); resolve({ exitCode: code ?? 1, stdout, stderr, timedOut }); });
    child.on('error', () => { clearTimeout(timer); resolve({ exitCode: 127, stdout, stderr, timedOut: false }); });
  });
}

export async function probe() {
  const t0 = Date.now();
  const notes = [];

  const resolved = resolveCommandOnPath('copilot');
  if (!resolved || !resolved.resolvedPath) {
    return {
      introspection_supported: 'none',
      binary_path: null,
      version: null,
      models: [],
      models_source: 'copilot not on PATH',
      reasoning_levels: [],
      notes: ['copilot binary not found on PATH'],
      duration_ms: Date.now() - t0,
    };
  }
  const cmd = resolved.command;
  const prepend = resolved.prependArgs;

  // 1. version
  let version = null;
  const verResult = await runOnce(cmd, [...prepend, 'version']);
  if (verResult.exitCode === 0 && verResult.stdout) {
    const m = verResult.stdout.match(/[\d]+\.[\d]+\.[\d]+/);
    if (m) version = m[0];
  }

  // 2. agents scan — user-level + project-level, NOT a subprocess.
  // Per Phase 6b research: ~/.copilot/agents/*.agent.md (user, wins on collision)
  // and .github/agents/*.agent.md (project). Files have YAML frontmatter.
  const userAgentsDir = join(homedir(), '.copilot', 'agents');
  const projectAgentsDir = join(process.cwd(), '.github', 'agents');
  const agents = [
    ...scanAgentMdFiles(userAgentsDir),
    ...scanAgentMdFiles(projectAgentsDir, ' (project)'),
  ];
  if (agents.length > 0) {
    notes.push(`Custom agents found: ${agents.join(', ')}`);
  }

  return {
    introspection_supported: 'partial',
    binary_path: resolved.resolvedPath,
    version,
    // Copilot does NOT expose a model-list command (per research). Models are
    // server-side resolved per subscription tier.
    models: [],
    models_source: 'copilot has no models list command (server-side per-tier)',
    // Per research: enum CONFIRMED 5 levels per official changelog (none/low/
    // medium/high/xhigh); `max` empirically present but UNCONFIRMED in docs.
    // We list 5 to match docs; user can pass `max` and copilot will validate.
    reasoning_levels: ['none', 'low', 'medium', 'high', 'xhigh'],
    notes,
    duration_ms: Date.now() - t0,
  };
}
