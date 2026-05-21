import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

export function findHopperDir(startDir = process.cwd()) {
  if (process.env.HOPPER_DIR) {
    const override = resolve(process.env.HOPPER_DIR);
    if (existsSync(override)) return override;
  }

  let current = resolve(startDir);
  for (let i = 0; i < 8; i += 1) {
    const candidate = join(current, '.hopper');
    if (existsSync(candidate)) return candidate;
    const parent = resolve(current, '..');
    if (parent === current) break;
    current = parent;
  }
  return null;
}
