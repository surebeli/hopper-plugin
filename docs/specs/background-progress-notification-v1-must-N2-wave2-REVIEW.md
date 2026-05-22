# N2.wave2 Plan Review — Background Progress and Completion Notification v1-must

Status: verdict v1.0 — **accept**
Date: 2026-05-22
Anchor: `docs/specs/background-progress-notification-v1-must-N2-wave2-REVIEW.md::root`
Reviewer role: third-party architecture review agent (read-only)
Wave scope: R03 + R04 of PLAN-v1.0

## Companions

- PRD: `docs/specs/background-progress-notification-prd-trd.md` (v0.4)
- Rubric: `docs/specs/background-progress-notification-plan-review-rubric.md` (v1.0)
- PLAN-v1.0: `docs/specs/background-progress-notification-v1-must-PLAN.md`
- N1 verdict: `docs/specs/background-progress-notification-v1-must-N1-REVIEW.md`
- N2.wave1 verdict: `docs/specs/background-progress-notification-v1-must-N2-wave1-REVIEW.md` (accept v2.0)

## Round History

| Round | Date | Verdict | Trigger |
|---|---|---|---|
| N2.wave2 v1 | 2026-05-22 | **accept** | R03+R04 delivery: 2 atomic commits, 384/384 tests green, single-spawn invariant preserved, terminal-event dual-track + dedup verified |

## Verdict Summary

| Dimension | Status | Notes |
|---|---|---|
| R03 reap/preflight orphan terminal event | PASS | `markOrphaned` wraps `appendOrphanTerminalEvent` with dedup + best-effort, applied to both `preflightDispatch` and `reapStaleJobs` paths |
| R04 runner terminal event | PASS | `appendRunnerTerminalEvent` called on success / failure / timeout / spawn-error; early `fail()` path also covered |
| terminal-event dual-track dedup | PASS | `if (fm.terminal_event_emitted) return null` in both `appendOrphanTerminalEvent` and `appendRunnerTerminalEvent` |
| Single-spawn invariant | PASS | Static test `runner-single-spawn.test.js#6` and `#8` confirm exactly one `spawn()` call in `hopper-runner` and `spawnDetached`; new diff added zero `spawn(`/`exec(` |
| no retry / no fallback | PASS | Static test `#7` and `#9` confirm clean; grep finds only prohibitive comment matches |
| Test suite | PASS | `npm test` → 384/384 (pass 369 + skipped 15, fail 0); +1 test vs wave 1 close |
| Scope discipline | PASS | 5 in-scope files only; sync path = 0 lines changed |
| Commit hygiene | PASS | 2 atomic commits `[T-PROG-R03]` / `[T-PROG-R04]`, max single-file delta 148 lines (< 300) |

Overall: **accept** — wave 2 closed.

---

## Evidence

### Commit history

```
19219f6 [T-PROG-R04] append runner terminal progress events
c7a6746 [T-PROG-R03] append orphan terminal progress events
1a284db [T-PROG-R02] seed progress frontmatter in background dispatch
```

| Commit | Files | Lines | Largest file |
|---|---|---|---|
| `c7a6746 [T-PROG-R03]` | 3 (background.js, progress.js, background.test.js) | +138 / -7 | background.js 82 lines |
| `19219f6 [T-PROG-R04]` | 2 (hopper-runner, runner-single-spawn.test.js) | +258 / -12 | runner-single-spawn.test.js 148 lines |

Both within 300-line ceiling per R8.3. `[T-PROG-XX]` prefix matches R8.4.

### File scope (`git diff HEAD~2 HEAD --name-only`)

```
cli/bin/hopper-runner
cli/src/background.js
cli/src/progress.js
tests/integration/runner-single-spawn.test.js
tests/unit/background.test.js
```

All 5 files within R03/R04 scope. Sync-path check: `git diff HEAD~2 HEAD -- cli/src/dispatch.js cli/src/subprocess.js | wc -l` = `0`.

### Test suite (`npm test`)

```
1..384
# pass 369
# fail 0
# skipped 15
```

Compared to wave 1 close (383): +1 test (R03 idempotency).

### R03 — orphan terminal event

**Implementation** (`cli/src/background.js`):

- `markOrphaned()` (lines 219-232): wraps `appendOrphanTerminalEvent` in try/catch (best-effort, NFR-006 compliant) then `writeFrontmatter` with `status: orphaned` + progress fields
- `appendOrphanTerminalEvent()` (lines 187-204): **dedup check** `if (fm.terminal_event_emitted) return null` before append
- `orphanFrontmatterPatch()` (lines 206-218): sets `terminal_event_emitted: true` only when event was successfully written (preserves consistency)
- `preflightDispatch` (lines 261-267 and 281-282): now calls `markOrphaned` for both stale-age and dead-PID reclassification
- `reapStaleJobs` (lines 550-562): switched from inline `writeFrontmatter` to `markOrphaned`

**Helpers in `cli/src/progress.js`** (lines 89-94):

- `OPTIONAL_EVENT_FIELDS` whitelist: `status`, `duration_ms`, `exit_code`, `signal`, `adapter_status`, `timed_out` — passthrough for terminal events with rich metadata (used by both R03 and R04)

**Test coverage** (`tests/unit/background.test.js`):

- `#18` preflightDispatch stale-age re-classifies + allows dispatch
- `#19` preflightDispatch dead-PID re-classifies + allows dispatch
- `#22` reapStaleJobs flips stale + dead-PID jobs to orphaned
- `#23` **reapStaleJobs is idempotent for terminal orphan events** (AC-11 explicit)

### R04 — runner terminal event

**Implementation** (`cli/bin/hopper-runner`):

- `appendRunnerTerminalEvent()` (lines 73-93): dedup check `if (fm.terminal_event_emitted) return null` before append; carries 7 optional fields (`status`, `duration_ms`, `exit_code`, `signal`, `adapter_status`, `timed_out`)
- `terminalFrontmatterPatch()` (lines 95-106): updates progress fields only when event written; preserves `terminal_event_emitted` semantics on re-entry
- `fail()` (lines 117-142): now includes early-failure terminal event with try/catch wrap (covers spawn-error, log-open-error, unknown-adapter)
- `vendor.on('exit')` (lines 287-308): writes terminal event with `terminalPhaseFor(status, adapterStatus, timedOut)` + `terminalMessageFor(...)` helpers
- `vendor.on('error')` (line 339): routes through `fail()`, inherits terminal event

**Single-spawn invariant**:

```
$ grep -n "spawn(" cli/bin/hopper-runner
10:// Single-spawn invariant: this script contains exactly one spawn() call.
204:// Single spawn() call. Windows command resolution above is pure-sync
212:  const vendor = spawn(resolvedCmd, finalArgv, {
```

One match at line 212 (the original vendor spawn); R04 added zero new `spawn(` calls.

**Test coverage** (`tests/integration/runner-single-spawn.test.js`):

- `#3` runner appends exactly one terminal progress event on success → **AC-03**
- `#4` runner appends exactly one terminal progress event on failed vendor result → **AC-04**
- `#5` runner early `fail()` appends one terminal progress event when frontmatter exists
- `#6` runner source contains EXACTLY ONE `spawn()` call (Windows + POSIX) — static
- `#7` runner source contains NO retry/fallback/orchestration constructs — static
- `#8` background.js `spawnDetached` source contains EXACTLY ONE `spawn()` call — static
- `#9` OpenCode plugin source has NO retry/fallback patterns — static

### Red-line re-check

| Invariant | Status | Verification |
|---|---|---|
| Single-spawn (runner) | PASS | static test #6 + grep: one match at line 212, with prohibitive comments at lines 10, 204 |
| Single-spawn (spawnDetached) | PASS | static test #8 |
| No retry / no fallback | PASS | static test #7 + #9; grep matches are only inside prohibitive comments (`background.js:13`, `:293`, `hopper-runner:197`) |
| Sync path unchanged | PASS | `git diff HEAD~2 HEAD -- cli/src/dispatch.js cli/src/subprocess.js` empty |
| Frontmatter backward compatibility (wave 1) | PASS | `tests/unit/background.test.js#5` still green |
| Existing tests not deleted/bypassed | PASS | 383 → 384 baseline, +1 net new (idempotency); zero deletions |
| `.hopper/queue.md` / `AGENTS.md` untouched | PASS | Not in diff |
| Workflow constraints | PASS | 2 commits, `[T-PROG-XX]` prefix, no push, no amend, no no-verify |

### AC coverage delivered in wave 2

| AC (from PRD v0.4 §8) | Wave 2 verification |
|---|---|
| **AC-03** Successful task appends exactly one terminal event | `runner-single-spawn.test.js#3` |
| **AC-04** Failed/timed-out task appends exactly one terminal event with correct status | `runner-single-spawn.test.js#4` (failed); timeout path covered by `terminalPhaseFor(status, adapterStatus, timedOut)` logic; explicit timeout test recommended for R18 |
| **AC-11** `reapStaleJobs` writes one orphan terminal event and is idempotent | `background.test.js#23` |

AC-12 (two `--watch-events` subscribers) and AC-13 (sync no progress.log) remain wave 3 / R18 work.

---

## Notes (informational, non-blocking)

### N-w2.1 — `markOrphaned` partial-write window

If `appendOrphanTerminalEvent` throws (e.g. disk full mid-write), `markOrphaned` still writes `status: orphaned` to frontmatter but with `terminal_event_emitted: false`. Subsequent reads from subscribers will see:

- `frontmatter.status = orphaned` (authoritative for task state)
- `progress.log` lacks the orphaned terminal event (subscribers must fall back to frontmatter)

This is consistent with NFR-006 ("Parser or progress writer failure must not strand the task in `in-progress`") — frontmatter remains the authoritative status source; progress.log is best-effort augmentation. No fix required. Document this contract in R06 when subscribers consume the streams (wave 3).

### N-w2.2 — `terminalMessageFor` does not consume `timedOut`

`terminalMessageFor(status, adapterStatus, providedMessage)` is signature-narrower than `terminalPhaseFor(status, adapterStatus, timedOut)`. Edge case: if `timedOut=true` but `adapterStatus !== 'timeout'` (e.g. vendor self-killed in a way the adapter classifies as `unknown-fail`), the produced message is `"Task failed."` while phase is `"timeout"`. Minor inconsistency, not user-facing harm — phase carries the authoritative signal.

Suggested when R05 (`--progress` rendering) lands: include `phase` in the human-readable summary so the inconsistency does not surface.

### N-w2.3 — N-w1.1 in-memory seq counter still not adopted

Wave 1 note N-w1.1 suggested an in-memory `seq` counter inside the runner to avoid re-reading `progress.log` on every `appendProgressEvent`. Wave 2 did not adopt this; runner exit path still calls `nextProgressSeq` (which now reads both `progress.log` and `.1` per the B4 fix).

Actual cost in v1.0: runner exit calls `appendProgressEvent` exactly once → `nextProgressSeq` reads ≤ 20 MB of JSONL → bounded one-time cost. Acceptable.

When wave 3 / R09 (v1.2 stream-parser, LATER) introduces high-frequency progress writes, the in-memory counter becomes necessary. Re-evaluate at v1.2 R09 design.

### N-w2.4 — AC-04 timeout case lacks explicit integration test

`runner-single-spawn.test.js#4` covers `failed vendor result`. The timeout subcase (`adapterStatus === 'timeout'`, `timedOut === true`) is covered by code-path logic but not by an integration test fixture.

Suggested for R18 verification gate: add a fixture vendor that hangs past `timeoutMs` and assert exactly one terminal event with `phase: timeout, status: failed, timed_out: true`.

Not blocking wave 2; record for R18.

---

## Reviewer Boundary

Per `N1-REVIEW.md`: reviewer does not write code, does not commit, does not run executor's test suite directly (relies on executor evidence). This review consumed read-only `git diff`, `git show`, `git log`, and `npm test` invocations.

---

## Next reviewer trigger (N2.wave3)

Wave 3 = R05 + R06 of PLAN-v1.0.

When R05 + R06 merge, N2.wave3 fires. Reviewer will check:

- `hopper-dispatch --progress <task-id>` renders phase, status, elapsed, last_progress, last 5 events, output/raw/progress paths (AC-02 substantively, even though PLAN-v1.0 AC matrix omits AC-02)
- `hopper-dispatch --watch-events [--once]` uses `fs.watchFile(path, { interval: 500 })`, watches `*-output.md` not `*-progress.log`
- Two concurrent subscribers both receive every terminal event (AC-12)
- Per-process `last_seen_seq` dedup correctness
- Sync mode still does not create `progress.log` (AC-13 regression check)
- N-w2.1 / N-w2.2 / N-w2.3 / N-w2.4 acknowledged or addressed

---

## Revision Log

| Version | Date | Change |
|---|---|---|
| v1.0 | 2026-05-22 | First N2.wave2 review; verdict accept |
