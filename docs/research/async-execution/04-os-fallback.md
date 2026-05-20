# OS-level Detached Spawn + Async Output — Fallback Layer Research

> Research date: 2026-05-21
> For: hopper-plugin `--background` implementation
> Scope: Node 18+ ESM, Windows + macOS first, Linux nice-to-have
> Constraints: single-spawn invariant, no new JSON state files, output.md is canonical job record

---

## TL;DR

- **The detached recipe is well-defined and short**: `spawn(cmd, args, { detached: true, stdio: ['ignore', fdOut, fdErr], windowsHide: true })` + `child.unref()` works on Windows, macOS, and Linux, *provided* stdio is fully redirected to files (or `'ignore'`) — inheriting any parent stream defeats detachment. Open the log file with `fs.openSync(path, 'a')` and pass the integer fd; the kernel's `O_APPEND` flag guarantees atomic appends per-write on all three platforms.
- **PID liveness is `process.kill(pid, 0)` — and that's it.** It works identically on Windows and Unix (Node emulates signal-0 semantics on Windows). The real risk is PID reuse, mitigated by storing `start_time` (wall-clock ISO timestamp at spawn) in the YAML frontmatter and treating "PID alive but start_time mismatch impossible to verify cheaply" as `unknown` rather than `running`.
- **For concurrent-dispatch protection, don't use a lockfile library.** Check `output.md` frontmatter: if `status: in-progress` and `process.kill(pid, 0)` succeeds, refuse the new dispatch. Otherwise rewrite the frontmatter and proceed. This is sufficient and respects the "no new JSON state files" constraint.
- **For `--watch`, use `fs.watchFile` (polling) — not `fs.watch`.** `fs.watch` has documented platform inconsistencies (FSEvents start-race on macOS, recursive quirks on Windows, ENOSPC on Linux). A 500ms-1s poll on a single file is cheap, deterministic, and survives editor-style rename/replace cycles.

---

## Q1: Detached spawn semantics

### Windows

From the Node.js docs verbatim: *"On Windows, setting `options.detached` to `true` makes it possible for the child process to continue running after the parent exits. The child process will have its own console window. Once enabled for a child process, it cannot be disabled."*

What `detached: true` actually does on Windows:
- Passes `CREATE_NEW_PROCESS_GROUP` to `CreateProcessW` (via libuv).
- Child receives its own console (a new conhost window) **unless** stdio is fully redirected and `windowsHide: true` is set.
- The child no longer inherits the parent's job object, so closing the parent's terminal does not cascade-kill the child.

Gotchas:
- **`windowsHide` + `detached: true` interaction is buggy** — see [nodejs/node#21825](https://github.com/nodejs/node/issues/21825). When both are set together with piped stdio, the console window may still flash and stdout piping can misbehave. Workaround that the hopper-plugin should adopt: set `windowsHide: true`, set `detached: true`, and use **file fds (not pipes)** for stdio. The bug primarily manifests with `stdio: 'pipe'`; with `stdio: ['ignore', fdOut, fdErr]` it does not bite because there is no pipe handle to leak into a new console.
- **`windowsVerbatimArguments`**: only relevant if you build a CMD command line manually. Leave it `false` (default). Node already escapes args correctly for `CreateProcessW`. It is auto-flipped to `true` when `shell: true` resolves to CMD — another reason to avoid `shell: true` for the vendor spawn.
- **No `setsid` equivalent** — process-group semantics are emulated through `CREATE_NEW_PROCESS_GROUP`. You cannot send POSIX signals to the group; `process.kill(pid, 'SIGTERM')` on Windows is best-effort and effectively a forced termination.
- **PowerShell-as-target** is broken under `detached: true` in some Node versions ([nodejs/node#51018](https://github.com/nodejs/node/issues/51018)). hopper-plugin does not need to spawn pwsh — adapters spawn vendor CLIs directly — so this is documented but not blocking.

### macOS / Linux

From the docs: *"On non-Windows platforms, if `options.detached` is set to `true`, the child process will be made the leader of a new process group and session. Child processes may continue running after the parent exits regardless of whether they are detached or not. See `setsid(2)`."*

What it does:
- Calls `setsid(2)` in the child between `fork()` and `exec()`. The child becomes session leader and process-group leader.
- Decouples from the parent's controlling TTY, so `SIGHUP` from terminal close doesn't reach it.
- Signals sent to the parent's PGID won't fan out to the child.

Gotchas:
- **Children of a `shell: true` spawn won't be reached** by `kill -pgrp`. Quote from docs: *"On Linux, child processes of child processes will not be terminated when attempting to kill their parent."* Practically: spawn the adapter binary directly, not via shell.
- **macOS quirk**: signals to a session leader that's already exited give `ESRCH`, which is fine — but if a different process gets the same PID, you might "kill" the wrong thing. This is the PID-reuse problem; see Q3.

### Universal pattern (Node 18+ cross-platform)

```js
import { spawn } from 'node:child_process';
import { openSync, closeSync } from 'node:fs';

function spawnDetached(cmd, args, logPath) {
  const out = openSync(logPath, 'a'); // O_APPEND — kernel guarantees atomic appends
  const err = openSync(logPath, 'a'); // same file, separate fd is fine
  const child = spawn(cmd, args, {
    detached: true,
    stdio: ['ignore', out, err],
    windowsHide: true,
    // do NOT pass shell: true — breaks signal/PGID semantics
  });
  // Parent no longer needs the fds; the child has its own copies post-fork/CreateProcess
  closeSync(out);
  closeSync(err);
  child.unref(); // remove from event-loop refcount so parent can exit
  return child.pid;
}
```

**`child.unref()` semantics** (verbatim docs): *"the parent will wait for the detached child process to exit. To prevent the parent process from waiting … use `subprocess.unref()`. Doing so will cause the parent process' event loop to not include the child process in its reference count."* Missing `unref()` on Windows will sometimes hold the parent open even when nothing else is pending — see [nodejs/node#5614](https://github.com/nodejs/node/issues/5614).

**Parent-exit behavior**: with `stdio: ['ignore', fd, fd]` + `unref()`, the child survives parent termination on all three platforms. The Node docs explicitly warn that without this stdio isolation, *"the child process will remain attached to the controlling terminal."*

---

## Q2: Stdout/stderr → file redirection

### Recommended pattern

Open the file once for stdout, once for stderr. Both can target the same `output.md`. The kernel `O_APPEND` flag (which `'a'` requests) makes each `write(2)` atomic up to `PIPE_BUF` (4 KiB on Linux, typically smaller on Windows but still atomic per-line for reasonable line lengths).

```js
const fdOut = openSync(outputMdPath, 'a');
const fdErr = openSync(outputMdPath, 'a'); // OK to alias — append is atomic
spawn(cmd, args, { detached: true, stdio: ['ignore', fdOut, fdErr], windowsHide: true });
closeSync(fdOut);
closeSync(fdErr);
```

**Does the file remain writable after the parent exits?** Yes. The fd is duplicated into the child during `fork`/`CreateProcessW`. The parent's `closeSync` only closes the parent's copy. The child's copy remains open until the child exits or explicitly closes it.

### Append vs separate log file

Two options:

1. **Inline append into `output.md`** — child stdout/stderr written between fenced markdown blocks the dispatcher already wrote (status header + `## Output` heading + ```` ``` ```` fence). Pros: one file. Cons: the closing fence and the completion footer cannot be written by the detached child easily, because the child is the vendor CLI, not a wrapper.
2. **Sidecar `.log` file** — `<task-id>-output.log` holds raw stdout/stderr; `<task-id>-output.md` holds frontmatter + a `log: ./T-X-output.log` pointer + the final status footer (written by a small wrapper process that owns the child).

**Recommendation: option 2 with a thin Node wrapper.** Spawn pattern becomes:

```
hopper-dispatch (parent)
   └─ detaches → hopper-runner (wrapper, also detached)
                    └─ spawn vendor CLI, inherit fds → output.log
                    └─ on child exit: append status footer to output.md, set status=done|failed
```

The wrapper is ~30 LOC of Node and is what runs detached. The vendor CLI is its non-detached child, with stdio piped to the `.log` file. The wrapper writes the structured footer to `.md` atomically on exit. This preserves the single-spawn invariant for the vendor itself (one and only one spawn of the vendor CLI per dispatch), while letting us own the lifecycle.

### Race conditions

- **Multiple writers, one file**: Two detached children both opening `output.md` with `'a'` will interleave at the *line* level on POSIX. Windows NT also implements `FILE_APPEND_DATA` atomically, but line-mixing is possible. This is mitigated by refusing concurrent dispatch (Q4), not by locking the file.
- **Encoding**: write UTF-8 with no BOM. Vendor CLIs emit UTF-8; appending matching bytes is safe. Do not let Node convert line endings — `fs.openSync` does not touch bytes.
- **Line endings**: vendor CLIs on Windows often emit CRLF, on POSIX LF. The output is read as markdown; CRLF and LF both render fine. Don't normalize.

### Output format strategy

Frontmatter-anchored markdown is the right shape:

```markdown
---
task_id: T-3
adapter: codex
status: in-progress
pid: 24112
start_time: 2026-05-21T14:33:02.117Z
started_by_pid: 19204
log: ./T-3-output.log
---

# T-3 — codex

## Output
See: `./T-3-output.log` (live).

## Status
<!-- footer written by hopper-runner on child exit -->
```

The footer (written on exit) replaces the `status` field in frontmatter and appends:

```markdown
## Status
- exit_code: 0
- duration_ms: 184733
- end_time: 2026-05-21T14:36:07.114Z
```

Status flips via **atomic rewrite** of `output.md`: write `output.md.tmp`, then `fs.renameSync` over `output.md`. On POSIX `rename(2)` is atomic; on Windows NTFS `MoveFileEx(... MOVEFILE_REPLACE_EXISTING)` is atomic for files on the same volume. Node's `fs.rename` wraps both.

---

## Q3: PID tracking + liveness

### Storage location (output.md frontmatter YAML)

```yaml
---
task_id: T-3
adapter: codex
status: in-progress       # in-progress | done | failed | orphaned
pid: 24112                # OS PID of the hopper-runner wrapper (NOT the vendor CLI)
start_time: 2026-05-21T14:33:02.117Z   # ISO 8601, UTC
started_by_pid: 19204     # PID of the dispatch CLI that launched this — purely informational
log: ./T-3-output.log
---
```

**Why store PID of the wrapper, not the vendor**: the wrapper is what we own. If it exits, the vendor must have exited too (it's a non-detached child of the wrapper). If we stored the vendor PID, the wrapper could be alive doing post-processing while the vendor is gone, and our state would mis-classify.

Pros of frontmatter YAML: human-readable, lives next to output, no extra file. Cons: rewriting frontmatter requires reading the whole file and atomic-renaming. Acceptable at this scale (output.md is rarely >1 MB).

### Liveness check recipe

```js
function isAlive(pid) {
  if (!pid || pid <= 0) return false;
  try {
    // Signal 0: existence probe. Docs: "0 can be sent to test for the existence
    // of a process, it has no effect if the process exists, but will throw
    // an error if the process does not exist."
    process.kill(pid, 0);
    return true;
  } catch (err) {
    if (err.code === 'EPERM') return true;  // process exists but we can't signal it
    if (err.code === 'ESRCH') return false; // no such process
    return false;
  }
}
```

This is cross-platform. Node explicitly documents that *"Sending signal 0 can be used as a platform independent way to test for the existence of a process"* — Windows emulates the semantics. `EPERM` happens when the PID exists but belongs to another user / has higher integrity; on a typical dev machine for a hopper-spawned process this should not occur, but we return `true` defensively because the *process* is alive even if we can't poke it.

### PID-reuse mitigation (start_time)

PIDs are recycled. On macOS the PID space is small (~99999) and can wrap in days; on Windows PIDs wrap surprisingly fast (multiples of 4, ~64k space). If hopper writes `pid: 24112, start_time: 2026-05-21T14:33:02Z` and a reboot happens, PID 24112 might later belong to `explorer.exe`. `process.kill(24112, 0)` would return `true` and lie.

Mitigation strategy (cheap, no native deps):

1. On every status check, compare `start_time` to "is this PID still the one we spawned?" — but cheap cross-platform process-start-time lookup is **not available in stdlib**. Options:
   - `ps -o lstart= -p <pid>` on macOS/Linux. Parse the date. Compare ± 2 s.
   - `wmic process where ProcessId=<pid> get CreationDate` on Windows (deprecated but still present in Win11) **or** `Get-CimInstance Win32_Process -Filter "ProcessId=<pid>" | Select CreationDate` via PowerShell. Both are heavy (spawn a sidecar process just to check).
2. **Pragmatic compromise** (recommended for v0): don't try to verify PID identity. Instead:
   - If `status: in-progress` AND `now() - start_time < 24h` AND `isAlive(pid)` → trust it.
   - If `status: in-progress` AND `now() - start_time >= 24h` → re-classify as `orphaned` regardless of `isAlive` (anything running for a day is presumed wedged).
   - If `status: in-progress` AND `!isAlive(pid)` → re-classify as `orphaned` and let the user re-dispatch.

The 24h ceiling sidesteps PID-reuse entirely under the realistic assumption that machines reboot at least daily for the population of users we care about (laptop devs).

If a hard guarantee is later required, pull in [`ps-list`](https://github.com/sindresorhus/ps-list) (note: it does not expose `startTime` on Windows) or [`pidusage`](https://github.com/soyuka/pidusage), but defer this until someone files a bug.

---

## Q4: Concurrent dispatch protection

**Don't introduce a lockfile library.** `proper-lockfile` works (it uses `mkdir` atomicity rather than `O_EXCL` to be NFS-safe, and tracks staleness via `mtime` updates) but adds a dependency and a second file (`output.md.lock`) that violates the spec's "no new state files" intent.

**Recipe**:

```js
async function preflight(outputMdPath) {
  if (!existsSync(outputMdPath)) return { proceed: true };

  const frontmatter = readFrontmatter(outputMdPath); // small YAML parse
  if (frontmatter.status !== 'in-progress') {
    return { proceed: true }; // done/failed/orphaned — overwrite is fine
  }
  if (isAlive(frontmatter.pid)) {
    return {
      proceed: false,
      message:
        `Refusing to dispatch: ${frontmatter.task_id} is already running ` +
        `(pid ${frontmatter.pid}, started ${frontmatter.start_time}). ` +
        `Use 'hopper-dispatch --watch ${frontmatter.task_id}' to follow, ` +
        `or wait for it to finish.`,
    };
  }
  // status=in-progress but PID is dead → orphan; mark it and proceed
  rewriteFrontmatter(outputMdPath, { ...frontmatter, status: 'orphaned' });
  return { proceed: true };
}
```

This is a TOCTOU race in theory (two preflights pass simultaneously between status-read and frontmatter-rewrite). In practice the window is ~10 ms and the user invocation pattern (human typing two commands in two terminals within 10ms) is implausible. If we ever care, switch the rewrite to an atomic `O_CREAT | O_EXCL` of a `.dispatch-claim` sentinel created *before* spawning. That's two atomic syscalls instead of one; it's small.

---

## Q5: Watch / tail mode

### Recommendation: `fs.watchFile` polling, not `fs.watch`

`fs.watch` is the "right" API (uses inotify/FSEvents/ReadDirectoryChangesW) but the docs ship with a whole "Caveats" section about platform inconsistencies. Documented problems:

- **macOS FSEvents**: *"the application cannot know when the stream of events from fs.watch will actually start"* — meaning you can call `fs.watch` and miss events for the first ~tens of ms. See [nodejs/node#52601](https://github.com/nodejs/node/issues/52601).
- **Windows ReadDirectoryChangesW**: recursive watching is platform-specific; `filename` argument in callbacks is inconsistent.
- **Linux inotify**: `ENOSPC` if you exceed `fs.inotify.max_user_watches` (default 8192 on older systems, 524288 on newer). Not a risk for a single-file watch but a sign of system-wide fragility.
- **Inode-replacement** (write+rename atomic write style): `fs.watch` on the old inode stops firing because the watched inode no longer maps to the path. The runner uses atomic rewrite for the final status update — exactly this scenario.

`fs.watchFile` uses `stat(2)` polling. It's "less efficient" but for *one* small file at 1 Hz the cost is negligible.

### Recipe

```js
import { watchFile, unwatchFile, readFileSync } from 'node:fs';

function watchOutput(outputMdPath, { intervalMs = 1000 } = {}) {
  let lastSize = 0;
  let lastStatus = null;

  const handler = (curr, prev) => {
    if (curr.mtimeMs === prev.mtimeMs && curr.size === prev.size) return;

    // Read incremental tail of the .log sidecar (much larger than .md)
    const logPath = outputMdPath.replace(/\.md$/, '.log');
    if (existsSync(logPath)) {
      const stat = statSync(logPath);
      if (stat.size > lastSize) {
        const fd = openSync(logPath, 'r');
        const buf = Buffer.alloc(stat.size - lastSize);
        readSync(fd, buf, 0, buf.length, lastSize);
        closeSync(fd);
        process.stdout.write(buf);
        lastSize = stat.size;
      }
    }

    // Check frontmatter status — exit when done/failed
    const fm = readFrontmatter(outputMdPath);
    if (fm.status !== lastStatus) {
      lastStatus = fm.status;
      if (fm.status === 'done' || fm.status === 'failed' || fm.status === 'orphaned') {
        unwatchFile(outputMdPath, handler);
        process.exit(fm.status === 'done' ? 0 : 1);
      }
    }
  };

  watchFile(outputMdPath, { interval: intervalMs }, handler);
}
```

Why this works regardless of file rotation, atomic-rename, or truncation: `watchFile` re-`stat()`s by path each tick. If the inode changes (atomic rewrite), the next poll just reads the new file. There is no held fd to invalidate. For libraries that handle the "tail through rotation" case more robustly, see [node-tailfd](https://github.com/soldair/node-tailfd) and [tail-file-node](https://github.com/logdna/tail-file-node), but for hopper's case we don't need them.

If the latency of 1 s feels sluggish, drop `intervalMs` to 250. Below that, switch to `chokidar` with `usePolling: true` to get the same semantics with a battle-tested implementation, but the dep is ~150 KB and probably unwarranted.

---

## Q6: Cleanup + orphan recovery

Three failure modes:

1. **User Ctrl-C's the dispatcher before background spawn completes**. In practice this is a non-issue: the only work between `spawn()` and exit is `unref()` + a print. If the user manages to interrupt this <1ms window, the child is already spawned, just not `unref`'d — and the dispatcher hard-exit takes the parent down anyway, leaving the detached child running with valid stdio fds. Result: child runs to completion, footer gets written. No cleanup needed.

2. **System reboot mid-run**. After reboot, `output.md` shows `status: in-progress, pid: 24112` but `24112` is either nonexistent or is now `explorer.exe`. The 24h ceiling + `isAlive` check from Q3 catches this on the next status read: re-classify as `orphaned`.

3. **Wrapper crashes hard (segfault, OOM-kill)**. Status stuck at `in-progress`, PID dead. Same recovery as (2): on next read or dispatch, re-classify as `orphaned`.

Design recommendation:
- `hopper-dispatch --watch T-X` should call `preflight`-style logic on first read and re-classify orphans. Watch loop exits immediately reporting `orphaned`.
- A dedicated `hopper-dispatch --reap` command (optional, later) can scan `.hopper/handoffs/*-output.md`, find stale-in-progress entries, and rewrite their frontmatter to `status: orphaned`. Pure local-only operation; no risk.
- **Do not auto-restart orphans.** That would violate the "no harness reaction core" rule in Spec §3 #4. Orphan recovery means "tell the user, let them re-dispatch."

---

## Q7: Node 18+ specifics

- **`fs/promises`**: prefer `fsp.rename` for atomic rewrites; identical guarantees to `fs.renameSync` but plays nicer with the rest of the async dispatcher code.
- **`AbortController`**: Node 18's `spawn` accepts `signal: abortController.signal`. Useful for the *non-background* path; not used in `--background` because the whole point is to outlive the dispatcher.
- **ES modules**: `import { spawn } from 'node:child_process'` — note the `node:` prefix is required (well, recommended) for clarity.
- **No new built-ins relevant here**. Node 20/22 added `node:fs/promises.glob`, `node:test`, etc. — none change the detached-spawn story.
- **Don't reach for libraries**: `proper-lockfile`, `chokidar`, `node-tail`, `pidusage`, `ps-list` are all viable but each is a maintenance/supply-chain liability. The recipes above are stdlib-only.

---

## Implementation recipe summary

The complete recommended pattern (~50 LOC sketch):

```js
// cli/src/background.js  — sketch
import { spawn } from 'node:child_process';
import { openSync, closeSync, existsSync, renameSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;

export function readFrontmatter(path) {
  const txt = readFileSync(path, 'utf8');
  const m = txt.match(FRONTMATTER_RE);
  if (!m) return { _body: txt };
  return { ...parseYaml(m[1]), _body: m[2] };
}

export function writeFrontmatter(path, fm) {
  const { _body = '', ...rest } = fm;
  const tmp = path + '.tmp';
  writeFileSync(tmp, `---\n${stringifyYaml(rest)}---\n${_body}`, 'utf8');
  renameSync(tmp, path); // atomic on POSIX and NTFS (same volume)
}

export function isAlive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; }
  catch (err) { return err.code === 'EPERM'; }
}

export function preflight(outputMdPath) {
  if (!existsSync(outputMdPath)) return { ok: true };
  const fm = readFrontmatter(outputMdPath);
  if (fm.status !== 'in-progress') return { ok: true };
  const ageH = (Date.now() - Date.parse(fm.start_time)) / 3.6e6;
  if (ageH >= 24) {
    writeFrontmatter(outputMdPath, { ...fm, status: 'orphaned' });
    return { ok: true };
  }
  if (isAlive(fm.pid)) {
    return { ok: false, reason: `already running (pid ${fm.pid})` };
  }
  writeFrontmatter(outputMdPath, { ...fm, status: 'orphaned' });
  return { ok: true };
}

export function spawnDetached({ adapter, args, outputMdPath, runnerPath }) {
  const pf = preflight(outputMdPath);
  if (!pf.ok) throw new Error(`Refusing dispatch: ${pf.reason}`);

  const logPath = outputMdPath.replace(/\.md$/, '.log');
  const startTime = new Date().toISOString();

  // Seed frontmatter before spawn — wrapper will rewrite on exit
  writeFrontmatter(outputMdPath, {
    task_id: extractTaskId(outputMdPath),
    adapter,
    status: 'in-progress',
    pid: null,                // filled in next step
    start_time: startTime,
    started_by_pid: process.pid,
    log: `./${require('node:path').basename(logPath)}`,
    _body: '\n# Output\n\nRunning…\n',
  });

  const fdOut = openSync(logPath, 'a');
  const fdErr = openSync(logPath, 'a');
  const child = spawn(process.execPath, [runnerPath, adapter, outputMdPath, ...args], {
    detached: true,
    stdio: ['ignore', fdOut, fdErr],
    windowsHide: true,
  });
  closeSync(fdOut);
  closeSync(fdErr);
  child.unref();

  // Patch the PID in
  const fm = readFrontmatter(outputMdPath);
  writeFrontmatter(outputMdPath, { ...fm, pid: child.pid });

  return { pid: child.pid, outputMdPath, logPath, startTime };
}
```

And the wrapper (`hopper-runner`, sketched):

```js
// cli/src/runner.js — runs detached, owns the vendor subprocess lifecycle
import { spawn } from 'node:child_process';
import { openSync, closeSync } from 'node:fs';
import { readFrontmatter, writeFrontmatter } from './background.js';

const [, , adapter, outputMdPath, ...adapterArgs] = process.argv;
const logPath = outputMdPath.replace(/\.md$/, '.log');

const fdOut = openSync(logPath, 'a');
const fdErr = openSync(logPath, 'a');
const t0 = Date.now();

const vendor = spawn(resolveAdapterBinary(adapter), adapterArgs, {
  stdio: ['ignore', fdOut, fdErr],
  windowsHide: true,
});

vendor.on('exit', (code, signal) => {
  closeSync(fdOut);
  closeSync(fdErr);
  const fm = readFrontmatter(outputMdPath);
  writeFrontmatter(outputMdPath, {
    ...fm,
    status: code === 0 ? 'done' : 'failed',
    exit_code: code ?? -1,
    signal: signal ?? null,
    end_time: new Date().toISOString(),
    duration_ms: Date.now() - t0,
    _body: (fm._body ?? '') + `\n## Status\n- exit_code: ${code}\n- duration_ms: ${Date.now() - t0}\n`,
  });
  process.exit(code ?? 1);
});
```

Plus `watchOutput()` from Q5 for the `--watch` flag.

---

## Pitfalls observed in similar projects

- **PM2** spent years fighting Windows detachment edge cases; its current solution on Windows is to install itself as a service (nssm) rather than rely on `detached: true` for daemonization. We don't need that — our background lives in user space, not a service.
- **`forever`** is unmaintained and conflates "background" with "auto-restart". hopper explicitly forbids auto-restart (single-spawn invariant), so we don't inherit that mistake.
- **VS Code's terminal task runners** had repeated bugs where `windowsHide: true` + `detached: true` flashed a conhost window for one frame ([nodejs/node#21825](https://github.com/nodejs/node/issues/21825)) — using file fds + no shell avoids triggering the bug.
- **Chokidar's existence** is a strong signal that nobody trusts raw `fs.watch` in production. Polling via `watchFile` for a single file is the conservative move.
- **`write-file-atomic`'s entire reason for being** is that "atomic write" via separate write+rename is non-trivial across platforms (fsync, ownership, perms). For hopper's use case (rewriting our own file with our own perms) bare `renameSync` is sufficient.
- **PID-reuse bugs in cron-like tools**: Multiple incidents in long-running daemons where a stale PID file killed an unrelated process on cleanup. Our `kill(pid, 0)` only *checks* — we never `kill(pid, SIGTERM)` an orphan automatically. This is the safer posture.

---

## Source citations

1. [Node.js Child Process docs](https://nodejs.org/api/child_process.html) — `detached`, `unref`, stdio fd arrays, `windowsHide`, `windowsVerbatimArguments`, signal handling on Windows.
2. [Node.js Process docs (Signal events)](https://nodejs.org/api/process.html) — signal 0 cross-platform liveness semantics.
3. [Node.js File System docs](https://nodejs.org/api/fs.html) — `fs.openSync` flags, `fs.watch` caveats, `fs.watchFile`, atomic rename, threadpool concurrency warning.
4. [nodejs/node#21825 — `windowsHide` not working with `detached: true`](https://github.com/nodejs/node/issues/21825) — combined-flag bug; workaround via file fds.
5. [nodejs/node#5614 — Detached unref'd child still prevents parent exit on Windows](https://github.com/nodejs/node/issues/5614) — `unref()` reliability on Windows.
6. [nodejs/node#51018 — `detached: true` doesn't work with pwsh](https://github.com/nodejs/node/issues/51018) — PowerShell-specific failure mode (not blocking for hopper).
7. [nodejs/node#52601 — fs.watch start-race on macOS](https://github.com/nodejs/node/issues/52601) — FSEvents reliability gap motivating `watchFile`.
8. [chokidar README](https://github.com/paulmillr/chokidar) — survey of `fs.watch` quirks; when to use polling.
9. [proper-lockfile (npm)](https://www.npmjs.com/package/proper-lockfile) — comparison to `lockfile`; mkdir-based atomicity; staleness via mtime.
10. [tail-file-node](https://github.com/logdna/tail-file-node) and [node-tailfd](https://github.com/soldair/node-tailfd) — reference implementations for rotation/truncation-safe tailing.
11. [ps-list](https://github.com/sindresorhus/ps-list), [pidusage](https://github.com/soyuka/pidusage) — references for cross-platform process metadata if start_time verification is later needed.
12. [Twilio: When Not to Use Lock Files with Node.js](https://www.twilio.com/en-us/blog/lockfiles-nodejs) — argues for in-process queueing over filesystem locks; supports our "no lockfile lib" stance.
