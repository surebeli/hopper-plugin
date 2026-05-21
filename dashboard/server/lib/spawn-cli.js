import { spawn as nodeSpawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ALLOWED_VENDORS = new Set(['codex', 'kimi', 'opencode', 'copilot', 'agy']);

const __dirname = dirname(fileURLToPath(import.meta.url));
const DISPATCH_PATH = resolve(__dirname, '..', '..', '..', 'cli', 'bin', 'hopper-dispatch');

export function buildProbeArgs(vendor) {
  return ['--probe', vendor];
}

export function spawnProbe(vendor, { spawn = nodeSpawn } = {}) {
  if (!ALLOWED_VENDORS.has(vendor)) {
    const err = new Error(`vendor not allowed: ${vendor}`);
    err.code = 'EINVAL';
    throw err;
  }
  return spawn(process.execPath, [DISPATCH_PATH, ...buildProbeArgs(vendor)], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}
