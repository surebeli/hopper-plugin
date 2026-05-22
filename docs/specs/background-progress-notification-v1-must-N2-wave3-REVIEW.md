# N2.wave3 Plan Review — Background Progress and Completion Notification v1-must

Status: verdict v1.0 — **accept**
Date: 2026-05-22
Anchor: `docs/specs/background-progress-notification-v1-must-N2-wave3-REVIEW.md::root`
Reviewer role: third-party architecture review agent (read-only)
Wave scope: R05 + R06 of PLAN-v1.0

## Companions

- PRD: `docs/specs/background-progress-notification-prd-trd.md` (v0.4)
- Rubric: `docs/specs/background-progress-notification-plan-review-rubric.md` (v1.0)
- PLAN-v1.0: `docs/specs/background-progress-notification-v1-must-PLAN.md`
- N1: `docs/specs/background-progress-notification-v1-must-N1-REVIEW.md`
- N2.wave1: `docs/specs/background-progress-notification-v1-must-N2-wave1-REVIEW.md`
- N2.wave2: `docs/specs/background-progress-notification-v1-must-N2-wave2-REVIEW.md`

## Round History

| Round | Date | Verdict | Trigger |
|---|---|---|---|
| N2.wave3 v1 | 2026-05-22 | **accept** | R05+R06 delivery: 2 atomic commits, 392/392 tests green, AC-12 covered, fs.watchFile-only verified by static test, no chokidar / no `spawn` / no fallback |

## Verdict Summary

| Dimension | Status | Notes |
|---|---|---|
| R05 `--progress` rendering | PASS | Phase / Status / PID / Elapsed / Duration / last_progress / progress_seq / terminal flag / output+raw+progress paths / last 5 events all rendered |
| R06 `--watch-events` mechanism | PASS | Uses `fs.watchFile(path, { interval: 500 })`; watches `*-output.md` only; new test #8 statically asserts this |
| R06 dual-track dedup | PASS | `isTerminalFrontmatter` requires `terminal_event_emitted === true` AND status ∈ {done, failed, timeout, cancelled, orphaned}; per-process `lastSeenSeq` Map dedups within a subscriber |
| AC-12 two concurrent subscribers | PASS | `progress-watch.test.js#5` explicit integration test |
| AC-13 sync no `progress.log` (regression) | PASS | Wave 1 R02 e2e + scope check: sync path unchanged in wave 3 diff |
| Test suite | PASS | 384 → 392 (pass 377 + skipped 15, fail 0); +8 net new (4 progress-cli + 4 progress-watch) |
| Scope discipline | PASS | 3 in-scope files; sync path = 0 lines |
| Commit hygiene | PASS | 2 atomic commits `[T-PROG-R05]` / `[T-PROG-R06]`; max single-file delta 212 lines (< 300) |
| Single-spawn invariant | PASS | hopper-dispatch grep `spawn(` returns no matches |
| No chokidar / no `fs.watch` | PASS | grep clean; only `watchFile` polling |
| No fallback / no retry | PASS | One match (`pathFromFrontmatter(..., fallbackName)`) is a default-path argument, not vendor fallback |

Overall: **accept** — wave 3 closed.

---

## Evidence

### Commit history

```
772fb3a [T-PROG-R06] add watch-events terminal event CLI
4cbb65e [T-PROG-R05] add progress status CLI
19219f6 [T-PROG-R04] append runner terminal progress events
```

| Commit | Files | Lines | Largest file |
|---|---|---|---|
| `4cbb65e [T-PROG-R05]` | 2 (hopper-dispatch, progress-cli.test.js) | +253 / -1 | progress-cli.test.js 158 lines |
| `772fb3a [T-PROG-R06]` | 2 (hopper-dispatch, progress-watch.test.js) | +312 / -2 | progress-watch.test.js 212 lines |

Both within 300-line ceiling per R8.3. `[T-PROG-XX]` prefix matches R8.4.

### File scope (`git diff HEAD~2 HEAD --name-only`)

```
cli/bin/hopper-dispatch
tests/unit/progress-cli.test.js
tests/unit/progress-watch.test.js
```

3 files, all in R05/R06 scope. Sync-path check: `git diff HEAD~2 HEAD -- cli/src/dispatch.js cli/src/subprocess.js | wc -l` = `0`.

### Test suite (`npm test`)

```
1..392
# pass 377
# fail 0
# skipped 15
```

Compared to wave 2 close (384): +8 net new tests.

### R05 — `--progress` CLI

**Implementation** (`cli/bin/hopper-dispatch:611-674`):

- `runProgress(hopperDir, taskId)` flow:
  1. `validateTaskId(taskId)` — exit 2 on invalid
  2. `existsSync(outputMdPath)` — exit 1 on missing task
  3. `readFrontmatter(outputMdPath)` — exit 1 on parse error
  4. `readProgressEvents({ hopperDir, taskId, limit: 5 })` — last 5 events
  5. Compute `elapsedMs` and `durationMs` from `start_time` / `end_time` / frontmatter `duration_ms`
  6. Render header / status block / paths / recent events

- Rendered fields cover all PLAN-v1.0 R05 contract items:
  - task id, vendor, status, **phase** (explicit per N-w2.2), PID + liveness, started, ended (if any), elapsed, duration, last_progress, last_progress_at, progress_seq, terminal flag
  - output.md, raw log, progress log paths (`pathFromFrontmatter` resolves `./...` prefix correctly)
  - last 5 progress events with format `#{seq} {ts} {phase}/{kind}[terminal]: {message} [status=X adapter_status=Y exit_code=Z duration_ms=N]`

- Exit codes match PLAN R05 spec: 0 / 1 / 2

**N-w2.2 resolution**: R05 explicitly outputs `Phase:` line. The signature inconsistency between `terminalPhaseFor(status, adapterStatus, timedOut)` and `terminalMessageFor(status, adapterStatus)` no longer surfaces to users — `--progress` shows authoritative phase alongside `last_progress` message.

**Test coverage** (`tests/unit/progress-cli.test.js`):

- `#1` --progress prints current phase, paths, and the last five progress events
- `#2` --progress prints terminal event details for completed task
- `#3` --progress exits 1 for missing task
- `#4` --progress exits 2 for invalid task id

### R06 — `--watch-events` CLI

**Implementation** (`cli/bin/hopper-dispatch:678-770`):

- Constants:
  - `TERMINAL_TASK_STATUSES = {done, failed, timeout, cancelled, orphaned}`
  - `WATCH_EVENTS_INTERVAL_MS = 500`
- `isTerminalFrontmatter(fm)`: dual-track gate — requires `terminal_event_emitted === true` **and** `TERMINAL_TASK_STATUSES.has(fm.status)`
- `listOutputMarkdownFiles(handoffDir)`: filters `name.endsWith('-output.md')` — explicitly NOT `*-progress.log`
- `terminalPayload(handoffDir, outputMdPath, fm)`: builds JSONL with `type: "hopper.task.terminal"`, includes resolved progress_log and raw_log paths
- `runWatchEvents(hopperDir, { once })`:
  - `scanOutputs()` lists existing output.md files + watches each via `watchFile(path, { interval: 500 }, ...)`
  - Re-scans every 500 ms (covers tasks dispatched after watcher start)
  - `lastSeenSeq: Map<taskId, seq>` per-process dedup
  - `--once` → cleanup + exit 0 after first emission
  - SIGINT / SIGTERM cleanup → unwatchFile + clearInterval

**Adherence to PLAN R06**:

- ✅ `fs.watchFile`, not `fs.watch`, not `chokidar` (grep verified)
- ✅ Watch `*-output.md`, not `*-progress.log` (verified by source filter + static test #8)
- ✅ stdout JSONL with `type: "hopper.task.terminal"`
- ✅ `--once` supported
- ✅ per-process `last_seen_seq` maintained
- ✅ Atomic `renameSync` frontmatter rewrites trigger detection (verified by test #7 against post-runner state)

**Test coverage** (`tests/unit/progress-watch.test.js`):

- `#5` two `--watch-events` subscribers both receive terminal event JSONL → **AC-12 directly covered**
- `#6` single subscriber does not duplicate one terminal event
- `#7` `--watch-events --once` exits after first terminal event from atomic frontmatter write
- `#8` implementation uses fs.watchFile over output.md only — static source assertion

### Red-line re-check

| Invariant | Status | Verification |
|---|---|---|
| No new `spawn()` in dispatch | PASS | `grep "spawn(" cli/bin/hopper-dispatch` returns no matches |
| No chokidar | PASS | grep clean; only `watchFile` polling imported from `node:fs` |
| No `fs.watch(` | PASS | grep clean |
| Sync path unchanged | PASS | `git diff HEAD~2 HEAD -- cli/src/dispatch.js cli/src/subprocess.js` empty |
| No fallback / no retry | PASS | One grep match at line 600 (`pathFromFrontmatter(handoffDir, value, fallbackName)`) is a default-path argument, not vendor fallback; line 6 is a prohibitive comment |
| `progress.log` not watched by `--watch-events` | PASS | `listOutputMarkdownFiles` filter at line 696 is `.endsWith('-output.md')` only; static test #8 enforces this |
| terminal-event dual-track dedup | PASS | `isTerminalFrontmatter` requires both `terminal_event_emitted` flag AND known terminal status; tests #5 / #6 cover broadcast + dedup |
| Existing tests not deleted/bypassed | PASS | 384 → 392; zero deletions |
| Workflow constraints | PASS | 2 commits, `[T-PROG-XX]` prefix, no push, no amend, no no-verify |

### Wave 2 notes — disposition

| Note | Disposition |
|---|---|
| **N-w2.1** subscribers fallback for partial-write orphan | **Strict-only chosen** (not addressed by fallback). R06's `isTerminalFrontmatter` requires `terminal_event_emitted === true`. Partial-write orphans (where progress.log write throws but frontmatter still flipped to status=orphaned with `terminal_event_emitted=false`) are silently skipped by `--watch-events`. Acceptable for v1.0 (partial-write is exception path); flag for wave 4 R16 host bridge design. See N-w3.1 below. |
| **N-w2.2** phase explicit in render | **Resolved** by R05. `Phase:` line shown alongside `Status:` and `Last progress:`. |
| **N-w2.3** in-memory seq counter | **Not adopted**. Wave 3 still re-reads `progress.log` per call. R05's `readProgressEvents({ limit: 5 })` slices the in-memory array after full file read — does not optimize disk I/O. Acceptable for v1.0; v1.2 R09 (stream-parser) is the natural place to add an in-memory counter. |
| **N-w2.4** timeout integration test | **Deferred to R18** as planned. R04 timeout codepath remains test-covered only by unit-level adapter status logic. |

### AC coverage delivered in wave 3

| AC (from PRD v0.4 §8) | Wave 3 verification |
|---|---|
| **AC-02** `--progress` shows phase / elapsed / last_progress / last 5 events | `progress-cli.test.js#1` + `#2` (substantively covered; PLAN-v1.0 omits AC-02 from acceptance subset per N1 Note A, but wave 3 implements it cleanly) |
| **AC-12** two concurrent `--watch-events` subscribers both receive every terminal event | `progress-watch.test.js#5` direct integration test |
| **AC-13** sync dispatch does not create `progress.log` (regression) | Sync path delta = 0 in wave 3 diff; wave 1 R02 e2e still green |

AC-01 / AC-03 / AC-04 / AC-06 / AC-11 were closed in waves 1 / 2. R18 (wave 4) handles full 7-AC subset verification and red-line gate.

---

## Notes (informational, non-blocking)

### N-w3.1 — `--watch-events` skips partial-write orphan terminals

`isTerminalFrontmatter` enforces strict dual-track: `terminal_event_emitted === true` AND status ∈ TERMINAL. If `markOrphaned`'s try/catch around `appendOrphanTerminalEvent` catches a write error (N-w2.1 scenario), the resulting frontmatter has `status: orphaned, terminal_event_emitted: false`. `--watch-events` will not emit a terminal event for this task.

Trade-off:

- **Strict** (current): no duplicate events when `terminal_event_emitted` later flips; partial-write orphans go silent at this layer
- **Permissive**: gate on `status ∈ TERMINAL` alone; partial-write orphans surface but duplicates appear after consistency restored

For v1.0 the strict choice is acceptable — partial-write is a low-frequency exception path, and frontmatter status remains authoritative for `--progress` / `--result` / dashboard. Revisit at wave 4 R16 (Claude monitor bridge) if real-world telemetry shows partial-write orphans are visible enough to warrant the permissive trade.

### N-w3.2 — `readProgressEvents` does not read rotated `.1`

R05's last-5-events render uses `readProgressEvents` which only reads the current `progress.log` (per `cli/src/progress.js:62-67`). Immediately after rotate (≥10 MB threshold), the current file may contain only 1-2 events; "last 5" will show fewer than 5. Users with long-running tasks crossing rotate see this once per task.

Fix shape (low priority): make `readProgressEvents` also read `.1`, concatenate, then slice. ~5 lines. Defer to R18 or v1.1 dashboard work — rotate is rare in v1.0 task durations.

### N-w3.3 — scan + watchFile interval coupling

`runWatchEvents` re-scans `handoffDir` every 500 ms to discover newly-dispatched tasks. Each discovered task adds another `watchFile` poll at 500 ms. At ~100 concurrent in-progress tasks the syscall fanout is non-trivial. hopper deployment scale today is far below this; flag for re-evaluation if `--watch-events` becomes long-running daemon mode in v1.1.

### N-w3.4 — `--once` race with multi-task terminal arrival

`runWatchEvents` with `--once` cleans up and exits after the **first** emitted terminal. If two tasks reach terminal state within the same `interval` poll (rare but possible on a busy system), only the first observed JSONL emits; the second's terminal event reaches the file system but `--once` already exited. Acceptable per PLAN R06 ("exits after first terminal event") — flag in user-facing docs that `--once` is single-event semantics, not "drain pending then exit".

---

## Reviewer Boundary

Per `N1-REVIEW.md`: reviewer does not write code, does not commit, does not run executor's test suite directly (relies on executor evidence). This review consumed read-only `git diff`, `git show`, `git log`, and `npm test` invocations.

---

## Next reviewer trigger (N2.wave4)

Wave 4 = R16 + R18 of PLAN-v1.0.

When R16 + R18 merge, N2.wave4 fires. Reviewer will check:

- R16 packaging spike outcome (per N1 Note B): does Claude plugin packaging actually accept `monitors/monitors.json`? If yes, the bridge implementation; if no, the documented manual setup downgrade
- R16 monitor config does not modify `commands/*.md`
- R16 documentation states wrapper/subagent completion is not authoritative task completion
- R18 full 7-AC verification matrix run (AC-01 / 03 / 04 / 06 / 11 / 12 / 13)
- R18 timeout integration test for N-w2.4
- R18 redline static checks across entire wave 1-4 surface
- N-w3.1 / N-w3.2 / N-w3.3 / N-w3.4 acknowledged in OUTPUT or deferred to v1.1
- Existing 158-baseline + waves 1-3 additions all still green

---

## Revision Log

| Version | Date | Change |
|---|---|---|
| v1.0 | 2026-05-22 | First N2.wave3 review; verdict accept |
