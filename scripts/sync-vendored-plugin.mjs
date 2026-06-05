#!/usr/bin/env node
// Sync (or check) the vendored codex-marketplace plugin copy at plugins/hopper/.
// Anchor: scripts/sync-vendored-plugin.mjs
//
// WHY THIS EXISTS: codex's marketplace `source.path` for a local plugin cannot
// be the repository root (openai/codex#17066 — path must start with './' and
// have at least one subdir component), and codex has NO .codexignore / files
// field to limit packaging. So a MINIMAL plugin subset must be vendored under
// plugins/hopper/ (the runtime files codex needs — NOT dashboard/docs/tests/
// node_modules). That vendored copy then drifts from the main source whenever
// cli/ etc. change. This script keeps it in sync and a companion test
// (tests/unit/vendored-plugin-sync.test.js) fails CI if it drifts.
//
// Usage:
//   node scripts/sync-vendored-plugin.mjs           # copy drifted main-source files into plugins/hopper/
//   node scripts/sync-vendored-plugin.mjs --check   # report drift + exit 1 (no writes) — used by the test

import { readdirSync, statSync, readFileSync, copyFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VENDOR = join(REPO, 'plugins', 'hopper');
const check = process.argv.includes('--check');

/** Recursively list regular files under dir (absolute paths). */
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (entry.isFile()) out.push(p);
  }
  return out;
}

if (!existsSync(VENDOR)) {
  console.error(`No vendored plugin dir at ${VENDOR} — nothing to sync.`);
  process.exit(0);
}

const drifted = [];
const vendorOnly = []; // files in the vendored copy with no main-source counterpart (left untouched)

for (const vf of walk(VENDOR)) {
  const rel = relative(VENDOR, vf).split('\\').join('/');
  const src = join(REPO, rel);
  if (!existsSync(src) || !statSync(src).isFile()) {
    vendorOnly.push(rel);
    continue;
  }
  if (!readFileSync(src).equals(readFileSync(vf))) {
    drifted.push(rel);
    if (!check) copyFileSync(src, vf);
  }
}

if (check) {
  if (drifted.length) {
    console.error(`plugins/hopper/ is OUT OF SYNC with the main source (${drifted.length} file(s)):`);
    for (const d of drifted) console.error(`  ${d}`);
    console.error('\nFix: node scripts/sync-vendored-plugin.mjs   (then commit plugins/hopper/)');
    process.exit(1);
  }
  console.log('plugins/hopper/ is in sync with the main source.');
  if (vendorOnly.length) console.log(`(${vendorOnly.length} vendored-only file(s) ignored)`);
  process.exit(0);
}

console.log(`Synced ${drifted.length} drifted file(s) into plugins/hopper/:`);
for (const d of drifted) console.log(`  ${d}`);
if (vendorOnly.length) {
  console.log(`\n${vendorOnly.length} vendored-only file(s) left untouched (no main-source counterpart):`);
  for (const v of vendorOnly) console.log(`  ${v}`);
}
