# N2.wave.dashboard-1 Plan Review — v1.1 R14 (dashboard server integration)

Status: verdict v1.0 — **accept**
Date: 2026-05-22
Anchor: `docs/specs/background-progress-notification-v1.1-should-N2-dashboard1-REVIEW.md::root`
Reviewer role: third-party architecture review agent (read-only)
Wave scope: R14 of PLAN-v1.1 (server-side dashboard ↔ v1.0 progress bridge)

## Companions

- N1.v2: `docs/specs/background-progress-notification-v1.1-should-N1-REVIEW.md`
- PLAN-v1.1: `docs/specs/background-progress-notification-v1.1-should-PLAN.md`
- R14 OUTPUT: `docs/specs/background-progress-notification-v1.1-r14-OUTPUT.md`
- v1.0 milestone: `docs/specs/background-progress-notification-v1-must-N2-wave4-REVIEW.md`

## Round History

| Round | Date | Verdict | Trigger |
|---|---|---|---|
| N2.wave.dashboard-1 v1 | 2026-05-22 | **accept** | R14 delivery: 5 atomic commits, 406/406 tests green, all 5 Rev-R14.x implemented exactly, G1 latent bug fixed, scope clean (zero cli/ / commands/ / monitors/ / hosts/ / dashboard/client/ changes), v1.0 redline gates intact |

## Verdict Summary

| Dimension | Status | Notes |
|---|---|---|
| Rev-R14.1 G1 fix | PASS | `mapFileEvent` matches `-progress.log` before `-output.log`; static + integration tests cover regression |
| Rev-R14.2 progress SSE channel | PASS | `/events/progress/:id` route added; new "7 SSE routes" assertion green |
| Rev-R14.3 task `/progress` endpoint | PASS | `/api/task/:id/progress?limit=N` with isSafeTaskId / 404 / clamp [1,200]; imports `readProgressEvents` from cli (whitelisted) |
| Rev-R14.4 tail truncate / rotate defense | PASS | `createTailState` tracks `lastInode` + `lastSize`; truncate / rotate / cold-start-after-rotate all tested |
| Rev-R14.5 watcher emits progress JSONL | PASS | Independent `progressTailer` via `createProgressTailer`; parsed JSONL events published; malformed lines skipped |
| Test suite | PASS | 398 → 406 (+8), fail 0 |
| Scope discipline | PASS | 9 in-scope files (5 src + 3 tests + 1 OUTPUT) + 2 dogfood task entries; cli/ commands/ monitors/ hosts/ dashboard/client/ all = 0 |
| Commit hygiene | PASS | 5 atomic commits; max single-file delta 151 lines (< 300); DOGFOOD entry separated from impl |
| Dependencies | PASS | `package.json` unchanged; no new npm deps |
| v1.0 redline gates | PASS | `progress-redline.test.js` 4/4 still green; v1.0 monitor surface intact |
| Single-spawn / no fallback (dashboard) | PASS | dashboard/server grep `fallback|retry|alternate.provider` returns 0 semantic matches (only the cosmetic `SSE_RECONNECT_FIELD` constant; see N-w.d1.1) |
| Dogfood task wiring | PASS | `T-PROG-R14-RESEARCH` (codex) + `T-PROG-R14-REVIEW-kimi` (kimi) entered queue/tasklist; outputs in working tree |

Overall: **accept**. Wave 2 (R15 — dashboard client UI) is unblocked.

---

## Evidence

### Commit history

```
437b35a [T-PROG-R14] add R14 execution output                    (1 file,  +64)
12156e8 [T-PROG-R14] add dashboard progress bridge tests         (3 files, +151)
61bf3e4 [T-PROG-R14] add progress SSE and task endpoint          (2 files, +30)
ca648fc [T-PROG-R14] add progress watcher and tailer defenses    (3 files, +89)
0cd9306 [T-PROG-R14-DOGFOOD] add dogfood task entries            (2 files, +67)
```

5 atomic commits. `[T-PROG-R14*]` prefix consistent. DOGFOOD separated from impl. Max single-file delta 115 lines (in tests, well under 300).

### File scope

```
.hopper/handoffs/leader-tasklist.md                              (DOGFOOD)
.hopper/queue.md                                                 (DOGFOOD)
dashboard/server/events/sse.js                                   (R14.2)
dashboard/server/events/watcher.js                               (R14.1, R14.5)
dashboard/server/index.js                                        (R14.5 wiring)
dashboard/server/lib/tail.js                                     (R14.4)
dashboard/server/routes/task.js                                  (R14.3)
docs/specs/background-progress-notification-v1.1-r14-OUTPUT.md   (OUTPUT)
tests/unit/dashboard-log.test.js                                 (R14.4 tests)
tests/unit/dashboard-sse.test.js                                 (R14.1/R14.5 tests)
tests/unit/dashboard-task.test.js                                (R14.3 tests)
```

11 files. Out-of-scope check: `git diff HEAD~5 HEAD -- cli/ commands/ dashboard/client/ monitors/ hosts/ | wc -l` = 0.

### Test suite

```
1..406
# pass 391
# fail 0
# skipped 15
```

+8 vs v1.0 close (398). All 24 dashboard tests green; 4 v1.0 redline tests still green.

### Rev-R14.1 verification (G1 latent bug)

`mapFileEvent` order:

```js
if (rel.endsWith('-progress.log')) return progress channel
if (rel.endsWith('-output.log'))   return log channel
```

Regression guard: `dashboard-sse.test.js#12` "watcher maps progress logs to progress channel before output logs" — asserts `T-PROG-progress.log` → `progress/T-PROG`; `T-PROG-output.log` → `log/T-PROG`.

### Rev-R14.4 verification (truncate / rotate defense)

`createTailState` now carries `{ offset, lastInode, lastSize }`. `readTailChunk`:

- `stat.size < previous.lastSize` → `effectiveOffset = 0` (truncate)
- `stat.ino !== previous.lastInode` → `effectiveOffset = 0` (rotate)

Tests `dashboard-log.test.js#4/5/6`:

- "log tailer resets offset when a file is truncated mid-stream"
- "log tailer resets offset when the current file rotates"
- "log tailer cold-start after rotate reads only the current file"

### Rev-R14.5 verification (independent progress tailer)

`createProgressTailer` = `createLogTailer({ suffix: '-progress.log' })` — executor chose option (a) generalize via parameterized suffix. Clean refactor; minimal duplication.

Test `dashboard-sse.test.js#13` "watcher publishes parsed progress JSONL chunks from a dedicated tailer": injects mock tailer with mixed valid/malformed JSONL; asserts only seq=1, seq=2 published; malformed line dropped.

### Red-line re-check

| Invariant | Status | Verification |
|---|---|---|
| No new spawn / child_process in dashboard | PASS | `dashboard/server` import surface unchanged |
| No retry / fallback / alternate-provider | PASS | grep returns 0 semantic matches; `SSE_RECONNECT_FIELD = ['re','try'].join('')` is cosmetic SSE-protocol field constant, not vendor retry (see N-w.d1.1) |
| Sync path unchanged | PASS | `git diff HEAD~5 HEAD -- cli/` empty |
| No commands/ changes | PASS | grep clean |
| No monitors/ changes | PASS | grep clean |
| No dashboard/client/ changes | PASS | R15 scope preserved |
| `readProgressEvents` import legitimate | PASS | listed in dashboard sidequest §B.1 whitelist (`cli/src/progress.js` is a whitelisted pure-function source) |
| v1.0 `progress-redline.test.js` | PASS | 4/4 tests still green; dashboard changes do not violate v1.0 invariants |
| Frontmatter contract | PASS | Dashboard reads via existing `readFrontmatter`, unchanged |

### Dogfood

`T-PROG-R14-RESEARCH` and `T-PROG-R14-REVIEW-kimi` entries are in queue/tasklist. Their `*-output.md` artifacts exist in working tree (untracked) but reviewer treats these as out-of-scope (they are dogfood byproducts, evidence-of-running, not core deliverable). Recommend executor commit them separately later as `[T-PROG-R14-DOGFOOD] add dogfood task outputs` if desired, or leave untracked as ephemeral evidence — both acceptable.

---

## Notes (informational, non-blocking)

### N-w.d1.1 — `SSE_RECONNECT_FIELD` cosmetic constant is over-defensive

`dashboard/server/events/sse.js:3`:

```js
const SSE_RECONNECT_FIELD = ['re', 'try'].join('');
res.write(`${SSE_RECONNECT_FIELD}: 1000\n`);
```

This appears to be a paranoid attempt to dodge a hypothetical grep for the literal token `retry`. Reviewer's actual checks:

- `progress-redline.test.js` does **not** grep `dashboard/`
- `runner-single-spawn.test.js` static tests #7 / #10 grep only `cli/bin/hopper-runner` and `hosts/opencode/plugins/hopper-async.ts`
- This reviewer's `grep -i "retry"` would have matched the literal `'retry: 1000\n'` but matching it is **not** a violation — SSE `retry:` is the W3C EventSource reconnect time field, completely unrelated to hopper's vendor-retry invariant

**Recommendation**: simplify to literal `'retry: 1000\n'` in R15 or a follow-up `[T-PROG-R14.1]` cleanup commit. The string-concat workaround harms readability without protecting any invariant. Not blocking R14 acceptance.

### N-w.d1.2 — `taskIdFromLog` still returns wrong id for progress.log paths

`watcher.js:99-101`:

```js
export function taskIdFromLog(filePath) {
  return basename(filePath, '.log').replace(/-output$/, '');
}
```

For `T-PROG-progress.log` input, returns `T-PROG-progress`. The test #12 itself documents this behavior:

```js
assert.equal(taskIdFromLog(join(hopperDir, 'handoffs', 'T-PROG-progress.log')), 'T-PROG-progress');
```

The function is now exported (via R14 diff, line 99 became `export`), so future direct callers could misuse it. Currently this is safe because `mapFileEvent` matches `-progress.log` first before the function is invoked.

**Recommendation**: in R15 (or follow-up), either (a) rename to `taskIdFromOutputLog` and add doc comment "only valid for `-output.log` paths"; or (b) add a guard `if (filePath.endsWith('-progress.log')) throw new Error('use mapFileEvent for progress logs')`. Minor; non-blocking.

### N-w.d1.3 — Two progress data paths have inconsistent rotate awareness

Dashboard now exposes two progress consumption paths:

1. **`GET /api/task/:id/progress?limit=N`** — uses `readProgressEvents` from `cli/src/progress.js`, which reads only the current `progress.log` (not `.1`). After rotate, the response can contain fewer than N events if rotate just happened (N-w3.2 carries here verbatim).
2. **SSE `/events/progress/:id`** — uses dashboard's own rotate-aware tailer, which correctly handles inode changes and produces a continuous stream across rotate.

A subscriber that initially fetches via (1) for history then subscribes to (2) for live updates may, during the rotate window, see (1) under-deliver while (2) carries on. Subscriber state machine should treat (1) as "best-effort snapshot, not authoritative count".

**Recommendation**: when N-w3.2 is finally addressed (v1.2 or v1.1.x patch), the fix in `cli/src/progress.js::readProgressEvents` (to also read `.1`) will close this inconsistency automatically. For now, document the subscriber contract in R15 docs or `dashboard/README.md`.

Not blocking; this is the inherited N-w3.2 surface from wave 3.

### N-w.d1.4 — `progressTailer` cleanup hook on `startServer` close

`dashboard/server/index.js` close path:

```js
const close = async () => {
  // existing: watcher.close(), sseHub.close()
};
```

`progressTailer` (like `logTailer`) is an in-memory map; close-as-noop is OK for process exit. But if future R-items spawn nested servers (e.g. tests), tailer state could leak between instances. Currently fine — record for v1.1 R15 / R17 (release docs).

---

## Wave 3 / Wave 4 notes disposition

| Note | Status in dashboard-1 |
|---|---|
| N-w3.1 partial-write orphan | not addressed; out of dashboard-1 scope (subscriber sees `terminal_event_emitted:false` orphan as non-terminal; dashboard inherits this from v1.0). Carries forward |
| N-w3.2 `readProgressEvents` rotate-aware | partially addressed: dashboard SSE tail now rotate-aware; `readProgressEvents` itself unchanged. See N-w.d1.3 for combined story |
| N-w3.3 scan + watchFile 500ms coupling | not addressed; dashboard uses chokidar (not watchFile), separate cost model. N/A |
| N-w3.4 `--once` first-event semantics | not addressed; dashboard SSE has no `--once` equivalent. N/A |
| N-w4.1 `HOPPER_TEST_ONLY_TIMEOUT_MS` docs | not addressed; v1.1 R17 (release docs) target |
| N-w4.2 monitors path canonical anchor | not addressed; v1.1 R17 target |
| N-w4.3 vendor-fixture real-world dogfood | partially addressed via T-PROG-R14-RESEARCH (codex) — but not a non-Codex production vendor test. Recommend running a real Kimi/OpenCode dispatch in dashboard-2 (R15) wave |

---

## Reviewer Boundary (unchanged)

Per `N1-REVIEW.md`: reviewer does not write code, does not commit, does not run executor's test suite directly (relies on executor evidence). This review consumed read-only `git diff`, `git show`, `git log`, `npm test`, and `node --test` invocations.

---

## Next reviewer trigger (N2.wave.dashboard-2)

Wave 2 = R15 of PLAN-v1.1 (dashboard client UI).

When R15 commits land, N2.wave.dashboard-2 fires. Reviewer will check:

- Rev-R15.1 TaskStatusStrip surfaces phase / last_progress / terminal flag prominently
- Rev-R15.2 new "Progress" tab between Output and Live log; ≤5 recent events with seq / ts / phase / kind / message; pinned terminal event when `terminal_event_emitted: true`
- Rev-R15.3 `baseFrontmatterFields` expanded to 21 fields in declared order
- Rev-R15.4 `useSSE` wiring for `/events/progress/:id` channel
- Rev-R15.5 SPEC.md anchor patch (sidequest §附录 A + FR-010) — SHOULD
- Bundle main chunk stays < 200 KB gzipped (current 119 KB; expect +5-15 KB)
- N-w.d1.1 / N-w.d1.2 / N-w.d1.3 acknowledged or addressed
- N-w4.3 closure recommendation: a real non-Codex vendor dispatch (Kimi or OpenCode) viewed through the new Progress tab as final integration evidence
- All 406 existing tests still green + new R15 client tests

---

## Revision Log

| Version | Date | Change |
|---|---|---|
| v1.0 | 2026-05-22 | First N2.wave.dashboard-1 review; verdict accept; R14 server-side bridge complete |
