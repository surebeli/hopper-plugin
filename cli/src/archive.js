// Handoff archival — move terminal-task artifacts out of .hopper/handoffs/ into
// .hopper/archive/<date>/ so the live handoffs/ dir stays lean (the watcher, reaper, and
// listInProgressJobs all scan it) while results remain on disk + retrievable.
// Anchor: cli/src/archive.js
//
// Design (the "how"):
//   - Archival is EXPLICIT — hopper has no reaction core, so nothing auto-archives. Run
//     `hopper-dispatch --archive [...]` manually or from your own cron/hook.
//   - A task's artifact SET is the 5 known sibling files keyed by its id. Matching by exact
//     suffix (not a prefix glob) avoids id-prefix collisions (T-1 vs T-10) and never touches
//     shared files like handoffs/leader-tasklist.md.
//   - SAFETY: never archive a pending/in-progress task, or one whose runner PID is still alive.
//     So `--archive` is safe to run at any time, even mid-dispatch.
//   - queue.md is the historical ledger and is left untouched; only the bulky per-dispatch
//     output artifacts move. `--result <id>` falls back to the archive (findArchivedOutputMd).

import { readdirSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { readFrontmatter, isAlive } from './background.js';

// Mirrors hopper-dispatch TERMINAL_TASK_STATUSES — only these are archivable.
export const ARCHIVE_TERMINAL_STATUSES = new Set(['done', 'failed', 'timeout', 'cancelled', 'orphaned']);

// The per-task artifact suffixes. Exact-suffix match keeps id-prefix collisions impossible and
// excludes shared files (leader-tasklist.md, *_vlreq-msg.txt, etc.).
export const ARTIFACT_SUFFIXES = ['-output.md', '-output.log', '-output-raw.txt', '-progress.log', '-prompt.md'];

const DAY_MS = 86_400_000;

function taskIdFromOutputMd(filename) {
  return filename.endsWith('-output.md') ? filename.slice(0, -'-output.md'.length) : null;
}

function artifactFiles(handoffDir, taskId) {
  return ARTIFACT_SUFFIXES.map((s) => `${taskId}${s}`).filter((f) => existsSync(join(handoffDir, f)));
}

/**
 * Classify every terminal task in handoffs/ as eligible-to-archive or skipped (with a reason).
 * Pure + read-only.
 * @param {string} hopperDir
 * @param {object} [opts]
 * @param {number|null} [opts.olderThanDays]  only tasks finished > N days ago
 * @param {string[]|Set<string>|null} [opts.statuses]  restrict to these terminal statuses
 * @param {number} [opts.keep]  keep the N most-recently-finished eligible tasks in place
 * @param {number} [opts.now]  injectable clock (ms) for age + testing
 * @param {Function} [opts.isAliveFn]  injectable PID-liveness check (testing)
 * @returns {{ eligible: Array, skipped: Array, handoffDir: string }}
 */
export function planArchive(hopperDir, {
  olderThanDays = null, statuses = null, keep = 0, now = Date.now(), isAliveFn = isAlive,
} = {}) {
  const handoffDir = join(hopperDir, 'handoffs');
  const statusFilter = statuses ? new Set(Array.isArray(statuses) ? statuses : [...statuses]) : null;
  const eligible = [];
  const skipped = [];
  let files;
  try { files = readdirSync(handoffDir); } catch (_) { return { eligible, skipped, handoffDir }; }
  for (const f of files) {
    const taskId = taskIdFromOutputMd(f);
    if (!taskId) continue;
    let fm;
    try { fm = readFrontmatter(join(handoffDir, f)); } catch (_) { skipped.push({ taskId, reason: 'unreadable-frontmatter' }); continue; }
    const status = fm.status;
    if (!ARCHIVE_TERMINAL_STATUSES.has(status)) { skipped.push({ taskId, status, reason: 'not-terminal' }); continue; }
    // Defense in depth: never archive a task whose runner process is still alive.
    if (fm.pid && isAliveFn(fm.pid)) { skipped.push({ taskId, status, reason: 'runner-alive' }); continue; }
    if (statusFilter && !statusFilter.has(status)) { skipped.push({ taskId, status, reason: 'status-filtered' }); continue; }
    const endMs = fm.end_time ? Date.parse(fm.end_time)
      : (fm.last_progress_at ? Date.parse(fm.last_progress_at) : NaN);
    if (olderThanDays != null) {
      const ageDays = Number.isFinite(endMs) ? (now - endMs) / DAY_MS : Infinity; // unknown end → treat as old
      if (ageDays < olderThanDays) { skipped.push({ taskId, status, reason: 'too-recent' }); continue; }
    }
    eligible.push({ taskId, status, endMs: Number.isFinite(endMs) ? endMs : 0, files: artifactFiles(handoffDir, taskId) });
  }
  // --keep N: retain the N most-recently-finished eligible tasks (sort desc by end time).
  // splice(0, keep) tolerates keep >= length (retains all, archives none) — do NOT gate on
  // `length > keep` or `--keep N` with <= N eligible would archive EVERYTHING (codex review).
  if (keep > 0) {
    eligible.sort((a, b) => b.endMs - a.endMs);
    for (const k of eligible.splice(0, keep)) skipped.push({ taskId: k.taskId, status: k.status, reason: 'kept-recent' });
  }
  return { eligible, skipped, handoffDir };
}

/**
 * Execute (or dry-run) an archive plan: move each eligible task's artifact set into
 * .hopper/archive/<dateLabel>/. dateLabel is supplied by the caller (no Date in the lib).
 * @returns {{ archivedCount, fileCount, destDir, moved, skipped, dryRun }}
 */
export function runArchive(hopperDir, opts = {}) {
  const { dryRun = false, dateLabel = 'undated' } = opts;
  const plan = planArchive(hopperDir, opts);
  const destDir = join(hopperDir, 'archive', dateLabel);
  const moved = [];
  const skipped = [...plan.skipped];
  if (!dryRun && plan.eligible.length) mkdirSync(destDir, { recursive: true });
  for (const item of plan.eligible) {
    // Never overwrite a set already archived under this date (same id re-archived same day) —
    // preserve the earlier copy and leave this run's files in handoffs/ for the next date.
    if (!dryRun && existsSync(join(destDir, `${item.taskId}-output.md`))) {
      skipped.push({ taskId: item.taskId, status: item.status, reason: 'already-archived-today' });
      continue;
    }
    const movedFiles = [];
    let failed = 0;
    for (const f of item.files) {
      if (!dryRun) {
        try { renameSync(join(plan.handoffDir, f), join(destDir, f)); }
        catch (_) { failed += 1; continue; } // a stranded sibling stays in handoffs/ (no data loss)
      }
      movedFiles.push(f);
    }
    moved.push({ taskId: item.taskId, status: item.status, files: movedFiles, partial: failed > 0 });
  }
  return {
    archivedCount: moved.length,
    fileCount: moved.reduce((n, m) => n + m.files.length, 0),
    partialCount: moved.filter((m) => m.partial).length,
    destDir,
    moved,
    skipped,
    dryRun,
  };
}

/**
 * Locate an archived task's output.md (so --result can fall back to the archive). Searches the
 * newest date dir first. Returns the path or null.
 */
export function findArchivedOutputMd(hopperDir, taskId) {
  const archiveRoot = join(hopperDir, 'archive');
  let dates;
  try { dates = readdirSync(archiveRoot); } catch (_) { return null; }
  for (const d of dates.sort().reverse()) { // YYYY-MM-DD sorts lexically → newest first
    const p = join(archiveRoot, d, `${taskId}-output.md`);
    if (existsSync(p)) return p;
  }
  return null;
}
