# N2.wave.polish Plan Review — [T-PROG-POLISH] (10 notes fold)

Status: verdict v1.0 — **accept**
Date: 2026-05-23
Anchor: `docs/specs/background-progress-notification-v1.1-should-N2-polish-REVIEW.md::root`
Reviewer role: third-party architecture review agent (read-only)
Wave scope: 8 actionable polish items (P-1..P-8) folded; 2 informational-only skipped per protocol

## Companions

- v1.1 close: `docs/specs/background-progress-notification-v1.1-should-N2-r17-REVIEW.md` (lists the 10 polish notes)
- v1.0 wave 3/4 source: `docs/specs/background-progress-notification-v1-must-N2-wave4-REVIEW.md`
- dashboard-2: `docs/specs/background-progress-notification-v1.1-should-N2-dashboard2-REVIEW.md`
- r07: `docs/specs/background-progress-notification-v1.1-should-N2-r07-REVIEW.md`

## Round History

| Round | Date | Verdict | Trigger |
|---|---|---|---|
| N2.wave.polish v1 | 2026-05-23 | **accept** | Polish delivery: 4 atomic commits, 428/428 tests green (+3 net), bundle main unchanged (119.42 KB), 8 P-items all verified, 2 informational-only correctly skipped, v1.0 redline gates intact, scope completely clean |

## Verdict Summary

| Note | Item | Status | Evidence |
|---|---|---|---|
| N-w.d2.2 | P-1 ARIA list semantics | PASS | `ProgressTimeline.tsx` adds `role="list"` + `aria-label="Progress timeline"` on container; `role="listitem"` on row |
| N-w.d2.3 | P-2 Tooltip uses raw `last_progress` | PASS | `TaskDrawer.tsx::TaskStatusStrip` now uses `rawLast = String(frontmatter.last_progress)` for `title`, not truncated string |
| N-w.d2.4 | P-3 `truncate` extracted to utils | PASS | `dashboard/client/src/lib/utils.ts` exports `truncate`; both `TaskDrawer.tsx` and `ProgressTimeline.tsx` import; zero local definitions remain |
| N-w.d2.5 | P-4 `React.memo` ProgressEventRow | PASS | Wrapped: `const ProgressEventRow = React.memo(function ...)`; React imported |
| N-w.d2.6 | P-5 Grid column tokens | PASS | `48px_72px_112px` → `64px_80px_120px`; all values are §4.2.2 spacing-scale linear combinations (64=w-7, 80=w-7+w-4, 120=3×w-6) |
| N-w3.2 | P-6 `readProgressEvents` rotate-aware | PASS | `cli/src/progress.js`: `[...readEventsFromPath(`${path}.1`), ...readEventsFromPath(path)]`; closes N-w3.2 + dashboard `/progress` endpoint N-w.d1.3 inconsistency |
| N-w.r07.2 | P-7 BurntToast availability cache | PASS | `cli/src/notify.js`: tri-state `burntToastAvailable` + `_resetBurntToastCache()` test export; first-fail caches; subsequent calls skip BurntToast |
| N-w3.4 | P-8 `--once` semantics docs | PASS | `docs/release/INSTALL-MATRIX.md` line 255+ section explains first-event-not-drain semantics |
| N-w3.1 | partial-write orphan | skipped (informational-only) | Per protocol — kept strict-only; telemetry will decide future upgrade |
| N-w.r07.1 | dogfood wave-reliability | skipped (informational-only) | Per protocol — retrospective signal, no code action |

Overall: **accept**. Polish wave closed. v1.1 surface is 100% clean before entering dogfood telemetry phase.

---

## Evidence

### Commit history

```
abe63ea [T-PROG-POLISH] document watch-events once semantics              (1 file, +6)
31e634d [T-PROG-POLISH] cache BurntToast availability                     (2 files, ~)
b0e77c0 [T-PROG-POLISH] make readProgressEvents rotate-aware              (2 files, ~)
220fdb1 [T-PROG-POLISH] polish dashboard progress timeline                (4 files, ~)
```

4 atomic commits, `[T-PROG-POLISH]` prefix consistent.

### File scope

```
cli/src/notify.js                                       (P-7)
cli/src/progress.js                                     (P-6)
dashboard/client/src/components/ProgressTimeline.tsx    (P-1, P-3, P-4, P-5)
dashboard/client/src/components/TaskDrawer.tsx          (P-2, P-3)
dashboard/client/src/lib/utils.ts                       (P-3)
docs/release/INSTALL-MATRIX.md                          (P-8)
tests/unit/dashboard-task.test.js                       (P-1..P-5 tests)
tests/unit/notify.test.js                               (P-7 test)
tests/unit/progress.test.js                             (P-6 test)
```

9 files. Out-of-scope verification: `git diff HEAD~4 HEAD -- commands/ monitors/ hosts/ dashboard/server/ package.json cli/bin/hopper-runner cli/src/background.js cli/bin/hopper-dispatch | wc -l` = 0.

### Test deltas

```
1..428
# pass 413
# fail 0
# skipped 15
```

+3 net new vs R17 close (425 → 428). Verified additions:

- `ok 21 — Windows: skips BurntToast after first unavailable result` (P-7)
- `ok 33 — readProgressEvents returns recent events across rotated and current logs` (P-6)
- One more from dashboard-task (P-1 ARIA assertion or P-2 tooltip; both folded in dashboard test file)

### Bundle (no regression)

```
dist/assets/index-CYDP7Krs.js          378.64 kB │ gzip: 119.42 kB    (main chunk; same as R15 close)
dist/assets/TaskDetailRoute-VkBmr525.js 153.21 kB │ gzip:  66.22 kB    (lazy; +0.01 KB vs R15 — within noise)
```

Polish wave added React.memo + ARIA attrs + token-aligned grid + extracted utility — net effect on gzipped bundle is below measurement noise. Excellent.

### Red-line re-check

| Invariant | Status |
|---|---|
| Single-spawn invariant | PASS — no changes to runner / dispatch / background spawn paths |
| No retry / no fallback (semantic) | PASS — BurntToast cache is platform-internal best-effort mechanism, not vendor fallback |
| Sync path unchanged | PASS — `cli/src/dispatch.js` / `cli/src/subprocess.js` untouched |
| Frontmatter backward compatibility | PASS — `readProgressEvents` signature unchanged; only behavior extended (reads `.1` too) |
| v1.0 progress-redline gates | PASS — 4/4 still green |
| No new dependencies | PASS — `package.json` delta = 0 |
| Workflow constraints | PASS — 4 atomic commits, prefix consistent, no push, no amend |

---

## Notes (informational, non-blocking)

### N-w.polish.1 — Implicit improvement: dashboard `/api/task/:id/progress` now rotate-consistent

P-6 changes `readProgressEvents` to read both `.1` and current `progress.log`. Side benefit: the dashboard's `GET /api/task/:id/progress` endpoint now returns rotate-spanning events automatically. N-w.d1.3 (snapshot/SSE inconsistency around rotate) is now substantively closed — no longer just informational, fixed transitively by P-6.

### N-w.polish.2 — `_resetBurntToastCache()` export

The `_resetBurntToastCache` export name (underscore prefix) signals "internal/test only". Acceptable test-seam pattern; reviewer accepts. Same convention as `runWatchEvents` exposed for R07 tests.

### N-w.polish.3 — Polish wave did NOT touch dashboard server

Despite P-1..P-5 being client-only and P-8 being docs-only, executor verified `dashboard/server/` zero changes. Demonstrates correct interpretation of polish scope.

---

## v1.1 + Polish closed notes inventory

After polish wave:

| Source | Notes closed in polish | Notes remaining open |
|---|---|---|
| v1.0 wave 3 | N-w3.2, N-w3.4 | N-w3.1 (informational; awaits telemetry) |
| v1.0 wave 4 | (all closed in R17) | — |
| dashboard-1 | N-w.d1.3 (transitively via P-6) | — |
| dashboard-2 | N-w.d2.2, d2.3, d2.4, d2.5, d2.6 | — |
| r07 | N-w.r07.2 | N-w.r07.1 (informational; retrospective signal) |

**Net result**: 2 informational-only notes carried to dogfood telemetry phase (C). 0 actionable/blocking notes remain open.

---

## Reviewer Boundary (unchanged)

Read-only. No code, no commit, no PR.

---

## Next reviewer trigger

Polish wave closed. v1.1 + polish surface is **100% clean** entering dogfood telemetry (phase C).

- **Phase C** (dogfood telemetry, 1-2 weeks): reviewer idle. Telemetry collection per `docs/specs/background-progress-notification-v1.1-should-N2-r17-REVIEW.md` §"Next reviewer trigger" carried-forward checklist + the watcher's own dogfood evidence (`.hopper/handoffs/T-PROG-*-output.md`).
- **Phase A** (v1.2 N1.v2 re-review): triggered when user reports "enough telemetry, start v1.2". Reviewer will sharpen R08-R13 based on real-world data.

---

## Revision Log

| Version | Date | Change |
|---|---|---|
| v1.0 | 2026-05-23 | First N2.wave.polish review; verdict accept; v1.1 polish wave closed; surface 100% clean before dogfood telemetry |
