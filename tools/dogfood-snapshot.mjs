#!/usr/bin/env node
import { appendFileSync, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';
const VENDORS = ['codex', 'kimi', 'opencode', 'copilot', 'agy', 'grok', 'unknown'];
const TERMINAL = new Set(['done', 'failed', 'timeout', 'cancelled', 'orphaned']);
const NON_CODEX = new Set(['kimi', 'opencode', 'copilot', 'agy', 'grok']);
try {
  const appendPath = parseAppendPath(process.argv.slice(2));
  const snapshot = collectSnapshot(findHopperDir());
  process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
  if (appendPath) appendMarkdown(appendPath, snapshot);
} catch (err) {
  process.stderr.write(`dogfood-snapshot: ${err.message}\n`);
  process.exit(2);
}
function parseAppendPath(args) {
  if (args.length === 0) return null;
  if (args.length === 2 && args[0] === '--append') return resolve(args[1]);
  throw new Error('usage: node tools/dogfood-snapshot.mjs [--append <path>]');
}
function findHopperDir() {
  if (process.env.HOPPER_DIR) return normalizeHopperDir(resolve(process.env.HOPPER_DIR));
  let cur = process.cwd();
  for (let i = 0; i < 5; i++) {
    const candidate = join(cur, '.hopper');
    if (existsSync(join(candidate, 'handoffs'))) return candidate;
    const parent = dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return null;
}
function normalizeHopperDir(path) {
  if (existsSync(join(path, 'handoffs'))) return path;
  if (existsSync(join(path, '.hopper', 'handoffs'))) return join(path, '.hopper');
  return null;
}
function collectSnapshot(hopperDir) {
  const byVendor = Object.fromEntries(VENDORS.map((vendor) => [vendor, 0]));
  const signals = { partial_write_orphans: 0, rotate_triggered: 0, non_codex_no_terminal: 0, empty_progress_log_with_done: 0 };
  const blocker_reasons = [];
  const handoffs = hopperDir ? join(hopperDir, 'handoffs') : null;
  const files = safeList(handoffs);
  const outputFiles = files.filter((name) => name.endsWith('-output.md'));
  let tasksV1Aware = 0;
  signals.rotate_triggered = files.filter((name) => name.endsWith('-progress.log.1')).length;
  for (const name of outputFiles) {
    let content = '';
    try { content = readFileSync(join(handoffs, name), 'utf-8'); } catch (_) {}
    const fm = readFrontmatter(content);
    const taskId = fm.task_id || name.replace(/-output\.md$/, '');
    const vendor = VENDORS.includes(fm.adapter) && fm.adapter !== 'unknown' ? fm.adapter : 'unknown';
    const status = String(fm.status || '');
    const terminal = fm.terminal_event_emitted === true;
    byVendor[vendor] += 1;
    if (!/^progress_log:/m.test(content)) continue;
    tasksV1Aware += 1;
    if (status === 'orphaned' && !terminal) signals.partial_write_orphans += 1;
    if (NON_CODEX.has(vendor) && TERMINAL.has(status) && !terminal) signals.non_codex_no_terminal += 1;
    if (status === 'done' && missingOrEmpty(join(handoffs, `${taskId}-progress.log`))) {
      signals.empty_progress_log_with_done += 1;
      blocker_reasons.push(`${taskId}: status=done but progress.log is missing or empty`);
    }
  }
  return {
    ts: new Date().toISOString(),
    hopper_dir: hopperDir ? resolve(hopperDir) : 'not found',
    totals: { tasks: outputFiles.length, tasks_v1_aware: tasksV1Aware, by_vendor: byVendor },
    signals,
    blocker: signals.empty_progress_log_with_done > 0,
    blocker_reasons,
  };
}
function safeList(dir) {
  try { return dir && existsSync(dir) ? readdirSync(dir) : []; } catch (_) { return []; }
}
function readFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  return Object.fromEntries(match[1].split(/\r?\n/).map((line) => {
    const m = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    return m ? [m[1], parseScalar(m[2].trim())] : null;
  }).filter(Boolean));
}
function parseScalar(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value.replace(/^['"]|['"]$/g, '');
}
function missingOrEmpty(path) {
  try { return !existsSync(path) || statSync(path).size === 0; } catch (_) { return true; }
}
function appendMarkdown(path, snapshot) {
  if (path.includes(`${sep}.hopper${sep}`) || basename(path) === '.hopper') throw new Error('--append path must not be inside .hopper');
  const vendors = Object.entries(snapshot.totals.by_vendor).map(([k, v]) => `${k}: ${v}`).join(', ');
  const blocker = snapshot.signals.empty_progress_log_with_done > 0 ? ' BLOCKER' : '';
  appendFileSync(path, `\n## Snapshot ${snapshot.ts}\n\nSource: \`${snapshot.hopper_dir}\`\n\n- Total tasks: ${snapshot.totals.tasks} (${vendors})\n- Partial-write orphans: ${snapshot.signals.partial_write_orphans}\n- Rotate triggered: ${snapshot.signals.rotate_triggered}\n- Non-Codex no terminal_event: ${snapshot.signals.non_codex_no_terminal}\n- Empty progress.log w/ done: ${snapshot.signals.empty_progress_log_with_done}${blocker}\n`, 'utf-8');
}
