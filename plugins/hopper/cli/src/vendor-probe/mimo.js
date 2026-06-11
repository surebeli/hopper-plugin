// mimo vendor probe — runs `mimo models` + `mimo auth list` + `mimo --version`
// Anchor: cli/src/vendor-probe/mimo.js

import { spawn } from 'node:child_process';
import { resolveCommandOnPath } from '../path-resolve.js';
import { killProcessTree } from '../subprocess.js';

const PROBE_TIMEOUT_MS = 30_000;
const IS_WINDOWS = process.platform === 'win32';
const ANSI_ESCAPE_RE = /\x1B\[[0-?]*[ -/]*[@-~]/g;

export function stripAnsi(s) {
  return s.replace(ANSI_ESCAPE_RE, '');
}

export function parseMimoModelsList(stdout) {
  return stripAnsi(stdout)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && /^[A-Za-z0-9][A-Za-z0-9._/:-]+$/.test(line));
}

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

  const resolved = resolveCommandOnPath('mimo');
  if (!resolved || !resolved.resolvedPath) {
    return {
      introspection_supported: 'none',
      binary_path: null,
      version: null,
      models: [],
      models_source: 'mimo not on PATH',
      reasoning_levels: [],
      notes: ['mimo binary not found on PATH'],
      duration_ms: Date.now() - t0,
    };
  }

  const cmd = resolved.command;
  const prepend = resolved.prependArgs;

  let version = null;
  const verResult = await runOnce(cmd, [...prepend, '--version']);
  if (verResult.exitCode === 0 && verResult.stdout) {
    const m = verResult.stdout.match(/[\d]+\.[\d]+\.[\d]+/);
    if (m) version = m[0];
  } else if (verResult.timedOut) {
    notes.push('mimo --version timed out');
  }

  let models = [];
  let modelsSource = '';
  const modelsResult = await runOnce(cmd, [...prepend, 'models']);
  if (modelsResult.exitCode === 0 && modelsResult.stdout.trim()) {
    models = parseMimoModelsList(modelsResult.stdout);
    modelsSource = 'mimo models (text)';
  } else if (modelsResult.timedOut) {
    notes.push('mimo models timed out');
    modelsSource = 'timeout';
  } else {
    notes.push(`mimo models exited ${modelsResult.exitCode}; stderr: ${modelsResult.stderr.slice(0, 200)}`);
    modelsSource = `exit ${modelsResult.exitCode}`;
  }

  const authResult = await runOnce(cmd, [...prepend, 'auth', 'list']);
  if (authResult.exitCode === 0 && authResult.stdout.trim()) {
    const clean = stripAnsi(authResult.stdout).slice(0, 500);
    const providerCount = (clean.match(/\b(xiaomi|mimo|openai|anthropic|deepseek|google|mistral|groq)\b/gi) || []).length;
    notes.push(`mimo auth list found ${providerCount} provider mention(s); see cache for excerpt`);
    notes.push(`auth excerpt: ${clean.slice(0, 200).replace(/\n/g, ' | ')}`);
  } else {
    notes.push('mimo auth list unavailable (MiMo Auto may still work, or first-launch setup may be needed)');
  }

  return {
    introspection_supported: 'full',
    binary_path: resolved.resolvedPath,
    version,
    models,
    models_source: modelsSource,
    reasoning_levels: ['minimal', 'low', 'medium', 'high', 'xhigh'],
    notes,
    duration_ms: Date.now() - t0,
  };
}
