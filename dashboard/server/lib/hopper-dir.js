import { existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

function isHopperWorkspace(candidate) {
  return existsSync(candidate) && statSync(candidate).isDirectory()
    && existsSync(join(candidate, 'handoffs')) && statSync(join(candidate, 'handoffs')).isDirectory();
}

export function findHopperDir(startDir = process.cwd()) {
  if (process.env.HOPPER_DIR) {
    const override = resolve(process.env.HOPPER_DIR);
    return isHopperWorkspace(override) ? override : null;
  }

  let current = resolve(startDir);
  for (let i = 0; i < 8; i += 1) {
    const candidate = join(current, '.hopper');
    if (isHopperWorkspace(candidate)) return candidate;
    const parent = resolve(current, '..');
    if (parent === current) break;
    current = parent;
  }
  return null;
}
