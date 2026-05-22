---
task_id: T-PROG-R14-REVIEW-kimi
adapter: kimi
status: done
pid: 43248
start_time: "2026-05-22T14:44:58.913Z"
end_time: "2026-05-22T14:54:42.300Z"
exit_code: 0
duration_ms: 583200
mode: background
phase: done
last_progress_at: "2026-05-22T22:45:07.149Z"
last_progress: "Adversarial review complete. Verdict: PASS_WITH_NOTES. 1 P1, 7 P2 findings. No P0. No product code changes made."
progress_seq: 2
progress_log: ./T-PROG-R14-REVIEW-kimi-progress.log
raw_log: ./T-PROG-R14-REVIEW-kimi-output.log
vendor_session_id: null
terminal_event_emitted: true
host_native: null
session_id: null
log: ./T-PROG-R14-REVIEW-kimi-output.log
started_by_pid: 58456
signal: null
timed_out: null
adapter_status: success
---

# T-PROG-R14-REVIEW-kimi — Adversarial Review

## Summary

Reviewed the R14 commit range (`ca648fc^..12156e8`) implementing dashboard server support for v1.0 progress logs: watcher mapping fix (G1), `/events/progress/:id` SSE channel (G3), `/api/task/:id/progress` REST endpoint (G2), tail truncate/rotate defense (G4), and dedicated progress tailer wiring. All five red lines were held (no sync-path progress writes, no fallback/retry, no single-spawn bypass, no `dashboard/client/` changes, no CLI writer changes). The implementation is architecturally sound and tests pass, but one P1 validation mismatch and several P2 maintainability/parity gaps remain.

Severity profile: **1 P1, 7 P2, 0 P0**.

## Files Reviewed

| File | Approx. LOC | Nature |
|---|---|---|
| `dashboard/server/events/sse.js` | 87 | existing + diff |
| `dashboard/server/routes/task.js` | 83 | existing + diff |
| `dashboard/server/events/watcher.js` | 119 | existing + diff |
| `dashboard/server/lib/tail.js` | 107 | existing + diff |
| `dashboard/server/index.js` | 142 | existing (wiring) |
| `cli/src/progress.js` | 122 | existing (readProgressEvents contract) |
| `tests/unit/dashboard-sse.test.js` | 185 | diff + existing |
| `tests/unit/dashboard-log.test.js` | 143 | diff + existing |
| `tests/unit/dashboard-task.test.js` | 221 | diff + existing |

Total reviewed: ~1,209 LOC (181 insertions / 5 deletions in diff, plus contextual existing code).

## Findings

### [F1] P1: `isSafeTaskId` in task router is more permissive than `validateTaskId` used by `readProgressEvents`

**Root cause:** `dashboard/server/routes/task.js` defines `isSafeTaskId` with regex `^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$` (allows leading digits, up to 121 chars). `cli/src/progress.js` → `pathForTask` → `assertTaskId` calls `validateTaskId` (`^[A-Za-z][A-Za-z0-9._-]{0,99}$`, max 100 chars, leading letter required). A task ID such as `0ABC` or a 110-char string passes the route's 400-gate but then triggers an unhandled exception inside `readProgressEvents`, causing Express to return 500 instead of 400.

**Evidence:**
- `task.js:18-21`: `if (!isSafeTaskId(req.params.id)) { res.status(400)... }`
- `task.js:27-29`: `const events = readProgressEvents({ hopperDir: root, taskId: req.params.id, limit });`
- `cli/src/validation.js:72-82`: `validateTaskId` requires leading letter and max 100 chars.

**Recommended fix:** Reuse `validateTaskId` from `cli/src/validation.js` (or a shared wrapper) in the task router, or tighten `isSafeTaskId` to match `validateTaskId` exactly. Catch `validateTaskId` errors and map them to 400 in the route handler.

---

### [F2] P2: Progress SSE route `/events/progress/:id` lacks backfill on connect (no `?since=<seq>` or offset support)

**Root cause:** The log SSE route (`/events/log/:id`) sends the current log tail immediately on connect via `logTailer.readFrom(req.params.id, offset)`. The progress SSE route (`/events/progress/:id`) only calls `hub.add(...)`, so a connecting client receives no events until the next watcher fire. For reconnecting clients, this means a gap in the timeline. The N1.v2 spec listed `?since=<seq>` as optional, but the parity gap with the log channel is a UX regression.

**Evidence:**
- `dashboard/server/events/sse.js:68`: `router.get('/progress/:id', (req, res) => hub.add(`progress/${req.params.id}`, res));`
- `dashboard/server/events/sse.js:61-67`: log route backfills via `logTailer.readFrom(...)`.
- `dashboard/server/index.js:67`: `createSseRouter(sseHub, { logTailer: tailer })` — `progressTailer` is not passed.

**Recommended fix:** Extend `createSseRouter` to accept `progressTailer`, pass it from `index.js`, and on `/progress/:id` connection either (a) send the most recent N events from the tailer, or (b) accept `?since=<seq>` and backfill events with `seq > since` (requires `readProgressEvents` to support a `since` filter or the tailer to buffer).

---

### [F3] P2: `SSE_RECONNECT_FIELD` obfuscation hinders readability and auditability

**Root cause:** `dashboard/server/events/sse.js:3` uses `const SSE_RECONNECT_FIELD = ['re', 'try'].join('');` to spell the literal string `retry`. This is an unnecessary indirection that makes static analysis, grep, and code review harder without adding any functional value.

**Evidence:**
- `dashboard/server/events/sse.js:3`: `const SSE_RECONNECT_FIELD = ['re', 'try'].join('');`
- `dashboard/server/events/sse.js:18`: `res.write(`${SSE_RECONNECT_FIELD}: 1000\n`);`

**Recommended fix:** Replace with the literal string `retry`.

---

### [F4] P2: `taskIdFromLog` function name and contract are misleading for progress logs

**Root cause:** `taskIdFromLog` is exported with a generic name but only strips the `-output` suffix. If called with a `-progress.log` path, it returns `T-PROG-progress` instead of `T-PROG`. The watcher now correctly avoids calling it for progress logs, but the function's exported contract is a latent trap for future refactors.

**Evidence:**
- `dashboard/server/events/watcher.js:99-101`: `export function taskIdFromLog(filePath) { return basename(filePath, '.log').replace(/-output$/, ''); }`
- `tests/unit/dashboard-sse.test.js:131`: asserts `taskIdFromLog(...'-progress.log') === 'T-PROG-progress'`.

**Recommended fix:** Rename to `taskIdFromOutputLog` and tighten to throw or return `null` if the path does not end in `-output.log`.

---

### [F5] P2: `readProgressEvents` reads entire file into memory even for small `limit` values

**Root cause:** `cli/src/progress.js:65-69` reads the whole progress log, parses every JSONL line, and then slices the last N. For a 10 MB progress log (the rotation threshold), this allocates the full file and all parsed objects even when the caller only wants 20 events. Under frequent dashboard polling, this creates unnecessary memory pressure.

**Evidence:**
- `cli/src/progress.js:65-69`: `readProgressEvents` calls `readEventsFromPath` unconditionally.
- `cli/src/progress.js:38-53`: `readEventsFromPath` does `readFileSync(path, 'utf-8').split(...)`.

**Recommended fix:** For large files, consider a tail-read approach (read the last ~1 MB, parse backwards to collect N valid events) or at least document the O(file-size) characteristic so R15 UI polling frequency is kept reasonable.

---

### [F6] P2: TOCTOU race between `existsSync` and `statSync`/`openSync` in tailer

**Root cause:** `readTailChunk` (`tail.js:41-68`) and `readLogChunk` (`tail.js:70-97`) check `existsSync(path)`, then immediately call `statSync` or `openSync`. If the file is deleted or rotated by another process in that window, a synchronous exception propagates out of the tailer. In `watcher.js`, `progressTailer.readNew()` and `logTailer.readNew()` are called without try/catch inside the chokidar `all` event handler, so an unhandled exception could crash the watcher loop.

**Evidence:**
- `dashboard/server/lib/tail.js:47-52`: `if (!existsSync(path)) { ... } const stat = statSync(path);`
- `dashboard/server/lib/tail.js:74-77`: `if (!existsSync(path)) return ...; const size = statSync(path).size;`
- `dashboard/server/events/watcher.js:23-35`: no try/catch around tailer calls.

**Recommended fix:** Wrap `statSync`/`openSync` in try/catch inside `readTailChunk` and `readLogChunk`; return an empty chunk on `ENOENT` instead of throwing.

---

### [F7] P2: `limit` query parameter on `/api/task/:id/progress` accepts floating-point values without coercion

**Root cause:** `task.js:27-28` does `Number(req.query.limit)` and accepts any finite positive number. A value like `2.5` passes validation and is passed to `events.slice(-2.5)`, which JavaScript truncates to `slice(-2)`. The behavior is correct by accident but imprecise.

**Evidence:**
- `dashboard/server/routes/task.js:27-28`: `const requested = Number(req.query.limit); const limit = Math.min(Number.isFinite(requested) && requested > 0 ? requested : 20, 200);`

**Recommended fix:** Use `Math.floor` or `parseInt` on the validated limit before passing to `readProgressEvents`.

---

### [F8] P2: No explicit unit tests for `createProgressTailer` truncate/rotate defense

**Root cause:** `dashboard-log.test.js` tests `createLogTailer` directly for truncate, rotate, and cold-start scenarios. `createProgressTailer` is a thin wrapper (`tail.js:37-39`) but has no dedicated test coverage. A future refactor that changes the wrapper (e.g., adding progress-specific filtering) could regress the defense without a test failure.

**Evidence:**
- `dashboard/server/lib/tail.js:37-39`: `export function createProgressTailer({ hopperDir } = {}) { return createLogTailer({ hopperDir, suffix: '-progress.log' }); }`
- `tests/unit/dashboard-log.test.js`: all truncate/rotate tests use `createLogTailer` with default `-output.log` suffix.

**Recommended fix:** Add one regression test using `createProgressTailer` that verifies rotation defense with the `-progress.log` suffix.

---

## Verdict

**PASS_WITH_NOTES**

R14 successfully closes G1-G4 with clean diff shape, correct watcher ordering, proper tailer defense, and REST endpoint wiring. The P1 finding (F1) is a validation mismatch that can cause 500s for edge-case task IDs and should be fixed before N2.wave.dashboard-1 sign-off. The P2 findings are maintainability, parity, and coverage gaps that do not block downstream R15 but should be addressed in the same wave if possible.

## Commit

Review commit: `12156e8` (HEAD at time of review)

## Checks

- Review touched **only** this findings document (`T-PROG-R14-REVIEW-kimi-output.md`).
- `git diff --name-only` from review start: `.hopper/handoffs/T-PROG-R14-REVIEW-kimi-output.md` only.
- No product code was modified, committed, or pushed by the reviewer.

## Next Recommendation for N2.wave.dashboard-1 Reviewer

Verify F1 fix (task ID validation unified to a single source of truth) and confirm `/api/task/:id/progress` returns 400 (not 500) for IDs with leading digits or >100 chars; spot-check that `/events/progress/:id` receives live events when a real background task emits progress JSONL.

## Status (background completion)
- queue_status: done
- adapter_status: success
- exit_code: 0
- duration_ms: 583200
- end_time: 2026-05-22T14:54:42.300Z
- log: see `T-PROG-R14-REVIEW-kimi-output.log` for raw output
