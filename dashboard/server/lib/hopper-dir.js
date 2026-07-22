import { existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

export function isHopperWorkspace(candidate, fsOps = { existsSync, statSync }) {
  try {
    // statSync intentionally follows symlinks; fail closed only for lookup races
    // or access errors without changing the established symlink policy.
    return fsOps.existsSync(candidate) && fsOps.statSync(candidate).isDirectory()
      && fsOps.existsSync(join(candidate, 'handoffs')) && fsOps.statSync(join(candidate, 'handoffs')).isDirectory();
  } catch (_) {
    return false;
  }
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
