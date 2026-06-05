// Drift guard for the vendored codex-marketplace plugin copy (plugins/hopper/).
// Anchor: tests/unit/vendored-plugin-sync.test.js
//
// codex marketplace local source.path cannot be the repo root (openai/codex#17066)
// and has no ignore mechanism, so a minimal plugin subset is vendored under
// plugins/hopper/. This test fails if that copy drifts from the main source —
// run `node scripts/sync-vendored-plugin.mjs` (or `npm run sync:plugin`) to fix.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = join(REPO, 'scripts', 'sync-vendored-plugin.mjs');

test('plugins/hopper vendored copy stays in sync with main source (codex#17066 drift guard)', () => {
  const r = spawnSync(process.execPath, [SCRIPT, '--check'], { encoding: 'utf-8' });
  assert.equal(r.status, 0,
    `plugins/hopper/ drifted from the main source. Fix: \`node scripts/sync-vendored-plugin.mjs\` then commit plugins/hopper/.\n${r.stdout}\n${r.stderr}`);
});
