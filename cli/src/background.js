// Background dispatch infrastructure (T-PLUGIN-PHASE5a-1)
// Anchor: cli/src/background.js
//
// Per spec v2.1.0 §14: background dispatch lives in output.md frontmatter,
// no new JSON state files. This module owns:
//   - reading + writing frontmatter atomically (renameSync over tmp)
//   - cross-platform liveness check via process.kill(pid, 0)
//   - preflight that detects in-progress duplicate dispatches + 24h orphan rule
//   - the spawnDetached() entry called by hopper-dispatch --background
//
// Per spec §3 #4 single-spawn invariant: this module wires up exactly ONE
// hopper-runner spawn per dispatch. hopper-runner itself spawns the vendor
// adapter exactly once. No retry, no fallback, no orchestration.

import { spawn } from 'node:child_process';
import {
  openSync, closeSync, existsSync, renameSync, unlinkSync, mkdirSync,
  readFileSync, writeFileSync, statSync, readdirSync, lstatSync, realpathSync,
} from 'node:fs';
import { resolve, dirname, basename, join, sep } from 'node:path';
import { validateTaskId } from './validation.js';
import { appendProgressEvent, progressLogPath } from './progress.js';
import { killProcessTree, verifyPidImage } from './subprocess.js';

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;

export const ORPHAN_CEILING_HOURS = 24;

/**
 * Minimal flat-YAML frontmatter parser. Handles only the schema we own:
 * scalar key: value pairs, no nested objects, no arrays. ISO-8601 dates
 * pass through as strings. Quoted strings are unquoted; null/true/false
 * literals are converted.
 *
 * @param {string} path
 * @returns {{ _body: string } & Record<string, any>}
 */
export function readFrontmatter(path) {
  const txt = readFileSync(path, 'utf-8');
  const m = txt.match(FRONTMATTER_RE);
  if (!m) return { _body: txt };
  const fm = { _body: m[2] };
  for (const line of m[1].split('\n')) {
    const trimmed = line.replace(/^\s+/, '');
    if (!trimmed || trimmed.startsWith('#')) continue;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx < 0) continue;
    const key = trimmed.slice(0, colonIdx).trim();
    let val = trimmed.slice(colonIdx + 1).trim();
    // strip optional inline comment (not perfect; OK for our schema)
    const hashIdx = val.indexOf(' #');
    if (hashIdx >= 0) val = val.slice(0, hashIdx).trim();
    fm[key] = parseScalar(val);
  }
  return fm;
}

function parseScalar(s) {
  if (s === '' || s === 'null' || s === '~') return null;
  if (s === 'true') return true;
  if (s === 'false') return false;
  // numeric (integers only — we don't store floats)
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  // quoted string
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

function emitScalar(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  // string — quote only if it contains characters that would confuse the parser
  if (typeof v === 'string') {
    if (/[:#\n\r]|^\s|\s$|^(?:true|false|null|~)$|^-?\d+$/.test(v)) {
      return `"${v.replace(/"/g, '\\"')}"`;
    }
    return v;
  }
  throw new Error(`Cannot emit scalar of type ${typeof v}: ${v}`);
}

/**
 * Sync the background output.md H1 heading to the frontmatter status. The heading
 * is written ONCE at dispatch as `# <id> — <adapter> (background, in-progress)`
 * (see runBackgroundDispatch); every terminal writer only APPENDS to `_body`, so
 * the H1 would otherwise stay "in-progress" forever on a done/failed/cancelled/
 * orphaned task — misleading anyone who opens the .md directly or views it in the
 * dashboard, even though the frontmatter + `--result` are already correct.
 *
 * Rewrites ONLY that exact hopper-generated H1 marker (a `#` line whose text ends
 * in `(background, <state>)`); appended `##` sections and vendor body text are
 * never touched (they carry no `(background, ` comma-marker). Idempotent, and a
 * no-op when status is falsy / still `in-progress` or the marker is absent (so it
 * is safe on the creation + per-progress writes, which all keep status
 * in-progress, and on any non-background frontmatter file). Pure — exported for
 * unit testing.
 *
 * @param {string} body
 * @param {string|undefined|null} status
 * @returns {string}
 */
export function syncBackgroundHeading(body, status) {
  if (!status || status === 'in-progress') return body;
  return String(body).replace(/^(#[^\n]*\(background, )[^)\n]*(\))/m, `$1${status}$2`);
}

/**
 * Write frontmatter back atomically via unique tmp-file + rename. Preserves
 * _body verbatim (aside from syncing the background H1 heading to a terminal
 * status — see syncBackgroundHeading). Drops keys whose values are undefined.
 *
 * Per codex Phase 5 audit P1 #4: previously used `path + '.tmp'` which
 * allowed concurrent writers to clobber each other's tmp file. Now uses
 * `path + '.tmp.<pid>.<ts>'` for per-writer isolation.
 *
 * @param {string} path
 * @param {object} fm
 */
export function writeFrontmatter(path, fm) {
  const { _body = '', ...rest } = fm;
  const body = syncBackgroundHeading(_body, rest.status);
  const lines = [];
  for (const [k, v] of Object.entries(rest)) {
    if (v === undefined) continue;
    lines.push(`${k}: ${emitScalar(v)}`);
  }
  const out = `---\n${lines.join('\n')}\n---\n${body}`;
  const tmp = `${path}.tmp.${process.pid}.${Date.now()}`;
  writeFileSync(tmp, out, 'utf-8');
  renameSync(tmp, path);
}

/**
 * Per codex Phase 5 audit P1 #3: enforce that a path lives under .hopper/handoffs/
 * AND is not a symlink escape. Mirrors output.js logic.
 *
 * @param {string} path           target file path (e.g. handoffs/T-X-output.md)
 * @param {string} hopperDir
 */
function assertPathSafe(path, hopperDir) {
  const handoffDir = join(hopperDir, 'handoffs');
  const resolvedPath = resolve(path);
  const resolvedHandoffs = resolve(handoffDir);
  if (!resolvedPath.startsWith(resolvedHandoffs + sep) && resolvedPath !== resolvedHandoffs) {
    throw new Error(`Path "${resolvedPath}" escapes handoffs/ — refusing.`);
  }
  // If file exists already, check it's not a symlink
  if (existsSync(path)) {
    try {
      const st = lstatSync(path);
      if (st.isSymbolicLink()) {
        throw new Error(`Path "${path}" is a symlink — refusing to follow.`);
      }
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }
  // realpath of parent handoffs/ should stay inside hopperDir
  if (existsSync(handoffDir)) {
    try {
      const realHandoffs = realpathSync(handoffDir);
      const realHopper = realpathSync(hopperDir);
      if (!realHandoffs.startsWith(realHopper + sep) && realHandoffs !== realHopper) {
        throw new Error(`handoffs/ real path "${realHandoffs}" escapes hopperDir.`);
      }
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }
}

/**
 * Cross-platform PID liveness probe. Per Node docs: signal 0 is
 * platform-independent existence check. EPERM means process exists but
 * we can't signal it (defensively return true). ESRCH means dead.
 *
 * @param {number|null|undefined} pid
 * @returns {boolean}
 */
export function isAlive(pid) {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    if (err.code === 'EPERM') return true;
    return false;
  }
}

/**
 * Compute hours elapsed since a given ISO-8601 timestamp.
 * Returns Infinity if input is invalid or missing.
 */
export function hoursSince(isoString) {
  if (!isoString) return Infinity;
  const t = Date.parse(isoString);
  if (!Number.isFinite(t)) return Infinity;
  return (Date.now() - t) / 3.6e6;
}

function taskIdFromOutputPath(outputMdPath, fm) {
  return fm.task_id || basename(outputMdPath).replace(/-output\.md$/, '');
}

function hopperDirFromOutputPath(outputMdPath) {
  return dirname(dirname(outputMdPath));
}

function orphanTerminalMessage(reason) {
  return `Task orphaned: ${reason}`;
}

function appendOrphanTerminalEvent(outputMdPath, fm, reason, source) {
  if (fm.terminal_event_emitted) return null;
  const taskId = taskIdFromOutputPath(outputMdPath, fm);
  return appendProgressEvent({
    hopperDir: hopperDirFromOutputPath(outputMdPath),
    taskId,
    event: {
      vendor: fm.adapter || 'unknown',
      phase: 'orphaned',
      kind: 'terminal',
      message: orphanTerminalMessage(reason),
      source,
      terminal: true,
      status: 'orphaned',
    },
  });
}

function orphanFrontmatterPatch(fm, event) {
  const patch = {
    ...fm,
    status: 'orphaned',
    phase: 'orphaned',
  };
  if (event) {
    patch.last_progress_at = event.ts;
    patch.last_progress = event.message;
    patch.progress_seq = event.seq;
    patch.terminal_event_emitted = true;
  }
  return patch;
}

function markOrphaned(outputMdPath, fm, reason, source, bodyAppend = '') {
  let event = null;
  try {
    event = appendOrphanTerminalEvent(outputMdPath, fm, reason, source);
  } catch (_) {
    // Progress writing is best-effort; never strand orphan reclassification.
  }
  writeFrontmatter(outputMdPath, {
    ...orphanFrontmatterPatch(fm, event),
    _body: (fm._body || '') + bodyAppend,
  });
}

/**
 * Preflight check before a new dispatch. Inspects an existing output.md
 * (if any) and decides whether the new dispatch may proceed.
 *
 * Per spec v2.1.0 §14.4 + §14.5:
 *   - status=done | failed | orphaned         → OK to overwrite
 *   - status=in-progress + age >= 24h         → re-classify as orphaned, then OK
 *   - status=in-progress + age < 24h + alive  → REFUSE (job is running)
 *   - status=in-progress + dead PID            → re-classify as orphaned, then OK
 *
 * Returns { ok: boolean, reason?: string }. When ok=true and reclassification
 * happened, this fn has already rewritten the frontmatter.
 *
 * @param {string} outputMdPath
 */
export function preflightDispatch(outputMdPath) {
  if (!existsSync(outputMdPath)) return { ok: true };

  let fm;
  try {
    fm = readFrontmatter(outputMdPath);
  } catch (err) {
    // Corrupt frontmatter — proceed but don't try to preserve previous state
    return { ok: true };
  }

  if (fm.status !== 'in-progress') return { ok: true };

  const ageH = hoursSince(fm.start_time);
  if (ageH >= ORPHAN_CEILING_HOURS) {
    markOrphaned(
      outputMdPath,
      fm,
      `age ${ageH.toFixed(1)}h exceeds ${ORPHAN_CEILING_HOURS}h ceiling`,
      'preflight'
    );
    return { ok: true };
  }

  if (isAlive(fm.pid)) {
    return {
      ok: false,
      reason: `task ${fm.task_id || basename(outputMdPath)} is already running ` +
              `(pid ${fm.pid}, started ${fm.start_time}). ` +
              `Use 'hopper-dispatch --watch ${fm.task_id || ''}' to follow, ` +
              `or wait for it to finish.`,
    };
  }

  // PID dead but status still in-progress → orphaned
  markOrphaned(outputMdPath, fm, 'PID not alive', 'preflight');
  return { ok: true };
}

/**
 * Spawn the hopper-runner wrapper detached. Returns immediately.
 *
 * Per spec §3 #4: this is the ONLY spawn point in the background path. The
 * wrapper, once running, will spawn the vendor adapter ONCE. No retry.
 *
 * @param {object} args
 * @param {string} args.hopperDir
 * @param {string} args.taskId
 * @param {string} args.adapterName            normalized vendor name
 * @param {string[]} args.adapterArgv          argv elements for the vendor (after `adapter` keyword)
 * @param {string} args.runnerPath             absolute path to cli/bin/hopper-runner
 * @param {string} [args.hostNative]           which host-native path is being bypassed/falling back (informational)
 * @param {string|null} [args.stdinInput]      adapter stdin payload (kept null in background mode; piping stdin to detached child is unreliable)
 * @returns {{ pid: number, outputMdPath: string, logPath: string, startTime: string }}
 */
/**
 * Resolve the CWD a dispatched vendor CLI must run in: the repo root that OWNS
 * the .hopper/ dir (= dirname of the resolved hopperDir), NOT the directory
 * hopper-dispatch happened to be invoked from. Fixes the retrospective #3 bug
 * where a vendor spawned in process.cwd() (e.g. the plugin's CLI dir) could not
 * see the project's files and timed out. Deterministic: same .hopper/ → same
 * vendor CWD, regardless of which host/dir launched the dispatch.
 * @param {string} hopperDir
 * @returns {string} absolute repo root
 */
export function resolveVendorCwd(hopperDir) {
  // HOPPER_VENDOR_CWD lets the user point the vendor's working dir at a wider
  // root — e.g. a monorepo root, or a common ancestor that also contains
  // external evidence the vendor must read (opencode's external_directory
  // sandbox is relative to the working dir, so widening the dir lets the vendor
  // read that subtree legitimately). This is an explicit opt-in knob, NOT an
  // auto-widening of any vendor sandbox — the vendor still enforces its own
  // permissions. Default = the repo root that owns .hopper/ (retro #3).
  if (process.env.HOPPER_VENDOR_CWD) return resolve(process.env.HOPPER_VENDOR_CWD);
  return dirname(resolve(hopperDir));
}

export function spawnDetached({ hopperDir, taskId, adapterName, adapterArgv, runnerPath, hostNative = null, stdinInput = null, adapterOpts = null, promptStdinFile = null, subjectRoot = null }) {
  validateTaskId(taskId);

  const vendorCwd = resolveVendorCwd(hopperDir);
  const handoffDir = join(hopperDir, 'handoffs');
  const outputMdPath = join(handoffDir, `${taskId}-output.md`);
  const logPath = outputMdPath.replace(/\.md$/, '.log');
  const progressPath = progressLogPath(outputMdPath);
  const lockPath = join(handoffDir, `${taskId}.dispatching`);

  // Per codex Phase 5 audit P1 #3: enforce path safety BEFORE preflight write.
  assertPathSafe(outputMdPath, hopperDir);
  assertPathSafe(logPath, hopperDir);
  assertPathSafe(progressPath, hopperDir);

  // Ensure handoffs/ exists before we try the atomic lock.
  if (!existsSync(handoffDir)) mkdirSync(handoffDir, { recursive: true });

  // Per codex Phase 5 audit F3: close the preflight-to-spawn TOCTOU window
  // via atomic lock-file create. `openSync(lockPath, 'wx')` is atomic on
  // both POSIX and Windows NTFS — only ONE process succeeds. The other
  // gets EEXIST and refuses. Lock is released after PID is seeded into
  // frontmatter; subsequent --jobs / --watch readers use the frontmatter,
  // not this lockfile.
  let lockFd;
  try {
    lockFd = openSync(lockPath, 'wx');
  } catch (err) {
    if (err.code === 'EEXIST') {
      // Stale lockfile from a previous crash? Reclaim if BOTH (a) mtime
      // older than 60s AND (b) no matching in-progress frontmatter with
      // alive PID. The dual check prevents racing against a slow-but-alive
      // sibling dispatch in the first 60s.
      let staleReclaimed = false;
      try {
        const lockAge = Date.now() - statSync(lockPath).mtimeMs;
        let blockedByLiveSibling = false;
        if (lockAge <= 60_000) {
          blockedByLiveSibling = true;
        } else {
          // mtime says stale; double-check via frontmatter if it exists
          if (existsSync(outputMdPath)) {
            try {
              const fm = readFrontmatter(outputMdPath);
              if (fm.status === 'in-progress' && fm.pid && isAlive(fm.pid)) {
                blockedByLiveSibling = true;
              }
            } catch (_) {}
          }
        }
        if (!blockedByLiveSibling) {
          unlinkSync(lockPath);
          lockFd = openSync(lockPath, 'wx');
          staleReclaimed = true;
        }
      } catch (_) {
        // race or unlinked by another process — fall through
      }
      if (!staleReclaimed) {
        const e = new Error(`Refusing dispatch: task ${taskId} is currently being dispatched by another process (lock at ${lockPath}). Wait or remove the lockfile if stale.`);
        e.code = 'EALREADYRUNNING';
        throw e;
      }
    } else {
      throw err;
    }
  }
  writeFileSync(lockFd, `pid=${process.pid}\nts=${Date.now()}\n`);

  // Per codex F1-F7 recheck: wrap REMAINING body in try/finally so the
  // lockfile is released on ALL failure paths, not just preflight.
  // Function-level try/finally is broken across multiple early-throw sites
  // below; instead, we use a single `releasing` function called from each
  // exit point.
  const releaseLock = () => {
    try { closeSync(lockFd); } catch (_) {}
    try { unlinkSync(lockPath); } catch (_) {}
  };

  try {
    const pf = preflightDispatch(outputMdPath);
    if (!pf.ok) {
      releaseLock();
      const err = new Error(`Refusing dispatch: ${pf.reason}`);
      err.code = 'EALREADYRUNNING';
      throw err;
    }
  } catch (err) {
    releaseLock();
    throw err;
  }

  // Per spec §14 stdin handling: background mode forbids stdin (would require
  // a pipe that survives parent exit, which is fragile cross-platform).
  // Adapters that need stdinMode='pipe' must compose prompt into argv instead.
  if (stdinInput) {
    releaseLock();
    throw new Error(
      `Background mode does not support stdin piping (adapter ${adapterName} ` +
      `requires stdinMode='pipe'). Use sync mode or update the adapter to ` +
      `accept the prompt as an argv element.`
    );
  }

  const startTime = new Date().toISOString();
  const initialProgress = appendProgressEvent({
    hopperDir,
    taskId,
    event: {
      vendor: adapterName,
      phase: 'starting',
      kind: 'lifecycle',
      message: 'Background task queued.',
      source: 'runner',
      terminal: false,
    },
  });

  // Seed frontmatter BEFORE spawn. PID will be patched in after spawn returns.
  writeFrontmatter(outputMdPath, {
    task_id: taskId,
    adapter: adapterName,
    // Point 5 (vendor-preset feedback 2026-06-15): record the model hopper passed
    // so a fallback from a canonical preset to the vendor's local default is
    // visible. Persists through the terminal write (frontmatter is spread).
    model: (adapterOpts && adapterOpts.model) || '(vendor default)',
    status: 'in-progress',
    pid: null,
    start_time: startTime,
    end_time: null,
    exit_code: null,
    duration_ms: null,
    mode: 'background',
    phase: initialProgress.phase,
    last_progress_at: initialProgress.ts,
    last_progress: initialProgress.message,
    progress_seq: initialProgress.seq,
    progress_log: `./${basename(progressPath)}`,
    raw_log: `./${basename(logPath)}`,
    vendor_session_id: null,
    terminal_event_emitted: false,
    host_native: hostNative,
    session_id: null,
    log: `./${basename(logPath)}`,
    started_by_pid: process.pid,
    _body: `\n# ${taskId} — ${adapterName} (background, in-progress)\n\n` +
           `Output streaming to \`${basename(logPath)}\`. Status updates here.\n`,
  });

  // Open log file with O_APPEND. Two fds (one for stdout, one for stderr) is fine —
  // kernel guarantees atomic appends per write.
  const fdOut = openSync(logPath, 'a');
  const fdErr = openSync(logPath, 'a');

  // Per codex Phase 5 audit F2: pass adapter opts to runner via env so
  // runner can call adapter.timeoutMs(opts) — fixes the dropped --reasoning
  // xhigh issue. Env is simpler than argv (no length pressure on Windows).
  const optsJson = JSON.stringify(adapterOpts || {});

  // Spawn the runner. node executes our runner script with task metadata.
  const child = spawn(process.execPath, [
    runnerPath,
    '--task-id', taskId,
    '--hopper-dir', hopperDir,
    '--adapter', adapterName,
    '--output-md', outputMdPath,
    '--log', logPath,
    '--cwd', vendorCwd,
    ...(subjectRoot ? ['--subject-root', subjectRoot] : []),
    '--',
    ...adapterArgv,
  ], {
    detached: true,
    stdio: ['ignore', fdOut, fdErr],
    windowsHide: true,
    // Retro #3 fix: anchor the runner (and thus the vendor) to the repo root
    // that owns .hopper/, not the arbitrary dir hopper-dispatch was launched in.
    cwd: vendorCwd,
    env: {
      ...process.env,
      HOPPER_RUNNER_INVOKED: '1',
      HOPPER_ADAPTER_OPTS: optsJson,
      // STDIN delivery (win-cmd-shim): the runner reads this 0600 file and pipes it to
      // the vendor's stdin. This is NOT the banned dispatcher-stdin pipe — the runner
      // (the vendor's alive parent) does the piping locally, so nothing crosses the
      // dispatcher's exit. The dispatcher-supplied `stdinInput` ban below is retained.
      // ALWAYS set the key (to undefined → Node omits it) so a non-stdin dispatch
      // CLEARS any ambient HOPPER_PROMPT_STDIN_FILE instead of leaking it into the
      // runner — critical for agy, which hangs forever on an open stdin pipe.
      HOPPER_PROMPT_STDIN_FILE: promptStdinFile || undefined,
    },
  });

  // Parent's fd copies no longer needed; child has its own duplicates post-spawn.
  closeSync(fdOut);
  closeSync(fdErr);

  if (!child.pid) {
    releaseLock();
    throw new Error('Failed to spawn hopper-runner (no PID returned)');
  }

  child.unref();

  // Patch the PID into frontmatter. Brief race window: runner might already
  // be writing status footer if it finished in <1ms. Re-read + merge.
  const fm = readFrontmatter(outputMdPath);
  if (fm.status === 'in-progress' && !fm.pid) {
    writeFrontmatter(outputMdPath, { ...fm, pid: child.pid });
  }

  // Per codex Phase 5 audit F3: PID is now seeded; release the dispatch lock
  // so subsequent legitimate re-dispatch (after this task completes) isn't
  // falsely refused. Lockfile lifetime: from openSync(wx) at top to here —
  // bounded by spawn + frontmatter-patch latency (~10-50ms typical).
  releaseLock();

  return { pid: child.pid, outputMdPath, logPath, startTime };
}

/**
 * List all in-progress jobs by scanning handoffs/. Read-only.
 * @param {string} hopperDir
 * @returns {Array<{ task_id, adapter, pid, start_time, age_hours, alive }>}
 */
export function listInProgressJobs(hopperDir) {
  const handoffDir = join(hopperDir, 'handoffs');
  if (!existsSync(handoffDir)) return [];
  const files = readdirSync(handoffDir).filter((f) => f.endsWith('-output.md'));
  const results = [];
  for (const f of files) {
    const path = join(handoffDir, f);
    try {
      const fm = readFrontmatter(path);
      if (fm.status === 'in-progress') {
        results.push({
          task_id: fm.task_id || f.replace(/-output\.md$/, ''),
          adapter: fm.adapter || 'unknown',
          pid: fm.pid,
          start_time: fm.start_time,
          age_hours: hoursSince(fm.start_time),
          alive: isAlive(fm.pid),
          path,
        });
      }
    } catch (_) {
      // skip unparseable files
    }
  }
  return results;
}

/**
 * Re-classify stale in-progress jobs to orphaned. Mutates frontmatter.
 * Returns list of reclassified task IDs.
 * @param {string} hopperDir
 * @returns {string[]}
 */
export function reapStaleJobs(hopperDir) {
  const jobs = listInProgressJobs(hopperDir);
  const reaped = [];
  for (const job of jobs) {
    const shouldReap = job.age_hours >= ORPHAN_CEILING_HOURS || !job.alive;
    if (!shouldReap) continue;
    const fm = readFrontmatter(job.path);
    const reason = job.alive
      ? `age ${job.age_hours.toFixed(1)}h exceeds ${ORPHAN_CEILING_HOURS}h ceiling`
      : 'PID not alive';
    markOrphaned(
      job.path,
      fm,
      reason,
      'reaper',
      `\n## Reaped\n- Reaped at: ${new Date().toISOString()}\n- Reason: ${reason}\n`
    );
    reaped.push(job.task_id);
  }
  return reaped;
}

/**
 * HOPPER-6: actively stop a running background job. Reads the job's frontmatter,
 * kills its process tree, and re-classifies it as `cancelled` with a terminal
 * progress event. `cancelled` was already in the watcher's terminal-status set
 * (cli/bin/hopper-dispatch TERMINAL_TASK_STATUSES) but nothing ever produced it
 * — this closes that loop, so --watch / --watch-events resolve on a stop.
 *
 * Windows PID-reuse guard: fm.pid is the hopper-runner PID (a node process). On
 * Windows a recycled PID could now belong to an unrelated program, so before
 * killing we confirm the PID is still a node process (verifyPidImage). If it is
 * clearly NOT (mismatch), we skip the kill — but still mark the task cancelled,
 * since the original job is plainly gone. 'unknown' falls through to the kill
 * (best-effort, the prior behavior).
 *
 * Idempotent: a job that is already terminal returns { ok:false, already:true }.
 *
 * @param {string} hopperDir
 * @param {string} taskId
 * @returns {{ ok: boolean, status?: string, pid?: number|null, killed?: boolean, killSkipped?: boolean, already?: boolean, reason?: string }}
 */
export function stopBackgroundJob(hopperDir, taskId) {
  validateTaskId(taskId);
  const outputMdPath = join(hopperDir, 'handoffs', `${taskId}-output.md`);
  if (!existsSync(outputMdPath)) {
    return { ok: false, reason: `no output file for ${taskId} at ${outputMdPath} (was it dispatched?)` };
  }

  let fm;
  try {
    fm = readFrontmatter(outputMdPath);
  } catch (err) {
    return { ok: false, reason: `could not read frontmatter: ${err.message}` };
  }

  if (fm.status !== 'in-progress') {
    return { ok: false, already: true, status: fm.status, reason: `task ${taskId} is not in-progress (status=${fm.status})` };
  }

  const isWindows = process.platform === 'win32';
  const pid = fm.pid;
  let killed = false;
  let killSkipped = false;
  if (pid && isAlive(pid)) {
    // PID-reuse guard (mgmt path → subprocess check is allowed; not dispatch).
    // 'mismatch' = the PID is now a non-node process (a recycled PID owned by
    // something unrelated) → never kill it. 'match'/'unknown' fall through to
    // the kill: 'unknown' (tasklist/ps unavailable) is kept killable on purpose
    // so --stop still works on locked-down systems; a live unrelated process
    // almost always resolves to 'mismatch' rather than 'unknown', so the
    // residual wrong-kill window is small. Set HOPPER off-path concerns aside —
    // this only runs for --stop, never on the single-spawn dispatch path.
    const image = verifyPidImage(pid, { expectImageIncludes: 'node', isWindows });
    if (image === 'mismatch') {
      killSkipped = true;  // recycled PID owned by an unrelated process — leave it
    } else {
      try { killProcessTree(pid, isWindows); killed = true; } catch (_) { /* best-effort */ }
    }
  }

  const endTime = new Date().toISOString();
  const startMs = Date.parse(fm.start_time || endTime);
  const duration_ms = Number.isFinite(startMs) ? Date.now() - startMs : null;

  let event = null;
  try {
    event = appendProgressEvent({
      hopperDir,
      taskId,
      event: {
        vendor: fm.adapter || 'unknown',
        phase: 'cancelled',
        kind: 'terminal',
        message: 'Task cancelled by user (--stop).',
        source: 'stop',
        terminal: true,
        status: 'cancelled',
        duration_ms: duration_ms ?? undefined,
      },
    });
  } catch (_) {
    // progress writing is best-effort; frontmatter below is authoritative
  }

  const patch = {
    ...fm,
    status: 'cancelled',
    phase: 'cancelled',
    end_time: endTime,
    duration_ms,
    adapter_status: 'cancelled',
  };
  if (event) {
    patch.last_progress_at = event.ts;
    patch.last_progress = event.message;
    patch.progress_seq = event.seq;
    patch.terminal_event_emitted = true;
  }
  writeFrontmatter(outputMdPath, {
    ...patch,
    _body: (fm._body || '') +
      `\n## Stopped (user --stop)\n` +
      `- pid: ${pid ?? 'n/a'}\n` +
      `- killed: ${killed}\n` +
      (killSkipped ? `- kill_skipped: PID reused by an unrelated process (left alone)\n` : '') +
      `- end_time: ${endTime}\n` +
      (duration_ms != null ? `- duration_ms: ${duration_ms}\n` : ''),
  });

  return { ok: true, status: 'cancelled', pid: pid ?? null, killed, killSkipped };
}

// ORPHAN_CEILING_HOURS already exported via the const declaration above.
