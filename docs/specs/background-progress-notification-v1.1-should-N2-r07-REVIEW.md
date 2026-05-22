# N2.wave.r07 Plan Review — v1.1 R07 (OS notify helper)

Status: verdict v1.0 — **accept**
Date: 2026-05-22
Anchor: `docs/specs/background-progress-notification-v1.1-should-N2-r07-REVIEW.md::root`
Reviewer role: third-party architecture review agent (read-only)
Wave scope: R07 of PLAN-v1.1 (cross-platform OS toast notification)

## Companions

- PLAN-v1.1: `docs/specs/background-progress-notification-v1.1-should-PLAN.md` §R07
- N1.v2 + Errata: `docs/specs/background-progress-notification-v1.1-should-N1-REVIEW.md`
- v1.0 milestone: `docs/specs/background-progress-notification-v1-must-N2-wave4-REVIEW.md`
- R07 OUTPUT: `docs/specs/background-progress-notification-v1.1-r07-OUTPUT.md`
- Dogfood (research): `.hopper/handoffs/T-PROG-R07-RESEARCH-codex-output.md`
- Dogfood (review): `.hopper/handoffs/T-PROG-R07-REVIEW-opencode-output.md`

## Round History

| Round | Date | Verdict | Trigger |
|---|---|---|---|
| N2.wave.r07 v1 | 2026-05-22 | **accept** | R07 delivery: 5 atomic commits, 425/425 tests green (+11 net), 15 R07-relevant tests all PASS, scope clean (zero v1.0-runner / dashboard / commands / hosts / monitors / package.json changes), no new npm deps, redline grep clean, v1.0 redline gates 4/4 intact |

## Verdict Summary

| Dimension | Status | Notes |
|---|---|---|
| Rev-R07.1 `cli/src/notify.js` | PASS | 165 lines; platform dispatch (win32/darwin/linux); BurntToast→MessageBox same-platform fallback; HOPPER_NOTIFY=0 disable; 5s spawn timeout; shell escape (PowerShell single-quote doubling + AppleScript `\"` + `\\n`); never throws; full DI surface (`_spawn`/`_platform`/`_env`/`_timeoutMs`) |
| Rev-R07.2 watch-events integration | PASS | Fire-and-forget `notifyFn(...).catch(() => {})`; `runWatchEvents` exported with injectable `notifyFn`/`writeLine`/`exitFn`; main() guarded so module load doesn't trigger watcher |
| Rev-R07.3 `notify.test.js` | PASS | 8 tests cover all promised scenarios (3 platforms + disable + escape + timeout + error swallow + Windows fallback) |
| Rev-R07.4 watcher-notify integration tests | PASS | 3 new tests in `progress-watch.test.js` (one-notify-per-terminal + notify-failure-doesn't-block-JSONL + disable-keeps-JSONL) |
| Test suite | PASS | 414 → 425 (+11), fail 0 |
| Scope discipline | PASS | All 5 commits within R07 scope; cli/src/progress.js / cli/src/background.js / cli/bin/hopper-runner / dashboard/ / commands/ / monitors/ / hosts/ / package.json all = 0 lines |
| Commit hygiene | PASS | 5 atomic commits `[T-PROG-R07*]`; max single-file delta 165 lines (notify.js); DOGFOOD separated |
| No new npm deps | PASS | `package.json` delta = 0; uses only `node:child_process` + platform-native binaries |
| Single-spawn invariant | PASS | notify spawns are best-effort toast subprocesses, completely separate from hopper's vendor-spawn invariant; runner/dispatch single-spawn untouched |
| No fallback / no retry (semantic) | PASS | Windows BurntToast→MessageBox is **same-platform multi-mechanism best-effort**, NOT vendor retry/fallback — different layer entirely. grep `retry|fallback|alternate.provider` in notify.js → 0 matches; only "falls through" appears in a code comment |
| v1.0 redline gates | PASS | `progress-redline.test.js` 4/4 still green |
| Dogfood execution | PARTIAL | Research (codex) + review (opencode) both dispatched; research still in-progress at closeout; opencode review delivered only frontmatter, no body content (see N-w.r07.1 below) |

Overall: **accept**. R07 wave closed.

---

## Evidence

### Commit history

```
b630483 [T-PROG-R07] add R07 execution output
c6f8065 [T-PROG-R07] add notify watcher tests
eb6d839 [T-PROG-R07] integrate notify into watch-events
a19d5fd [T-PROG-R07] add OS notify helper
1badd08 [T-PROG-R07-DOGFOOD] add R07 dogfood tasks
```

| Commit | Files | Lines | Largest |
|---|---|---|---|
| `1badd08` DOGFOOD | 2 | +68 | leader-tasklist.md 66 |
| `a19d5fd` notify.js | 1 | +165 | notify.js 165 |
| `eb6d839` integration | 1 | +25/-7 | hopper-dispatch 25 |
| `c6f8065` tests | 2 | +291/-5 | notify.test.js 158 |
| `b630483` OUTPUT | 1 | +35 | OUTPUT 35 |

All within 300-line per-file ceiling. `[T-PROG-R07*]` prefix consistent.

### File scope

```
.hopper/handoffs/leader-tasklist.md                (DOGFOOD)
.hopper/queue.md                                   (DOGFOOD)
cli/bin/hopper-dispatch                            (R07.2 integration)
cli/src/notify.js                                  (R07.1 NEW)
docs/specs/background-progress-notification-v1.1-r07-OUTPUT.md  (OUTPUT)
tests/unit/notify.test.js                          (R07.3 NEW)
tests/unit/progress-watch.test.js                  (R07.4 extension)
```

7 files. Out-of-scope check: `git diff HEAD~5 HEAD -- dashboard/ commands/ monitors/ hosts/ cli/bin/hopper-runner cli/src/progress.js cli/src/background.js package.json | wc -l` = 0.

### Test breakdown

```
ok 1  Windows: spawns PowerShell BurntToast command
ok 2  Windows: falls through from BurntToast failure to MessageBox
ok 3  macOS: spawns osascript with escaped notification script
ok 4  Linux: spawns notify-send with title and message as separate args
ok 5  HOPPER_NOTIFY=0 disables notification without spawning
ok 6  shell injection strings are quoted or passed without shell splitting
ok 7  spawn timeout kills child and returns timeout without throwing
ok 8  spawn errors never throw into caller
ok 9  two --watch-events subscribers both receive terminal event JSONL
ok 10 single --watch-events subscriber does not duplicate one terminal event
ok 11 --watch-events --once exits after first terminal event from atomic frontmatter write
ok 12 terminal event triggers one OS notify attempt
ok 13 notify failure does not block stdout JSONL output
ok 14 HOPPER_NOTIFY=0 keeps watcher JSONL but skips notifier spawn
ok 15 --watch-events implementation uses fs.watchFile over output.md only
```

15/15 PASS.

### Red-line re-check

| Invariant | Status | Verification |
|---|---|---|
| Single-spawn invariant (runner) | PASS | R07 does not touch runner; static test #7 / #8 still green |
| No vendor retry / fallback | PASS | notify.js grep `fallback|retry|alternate.provider` = 0; Windows mechanism fallthrough is platform-internal, not hopper invariant |
| Sync path unchanged | PASS | `cli/src/dispatch.js` / `cli/src/subprocess.js` untouched |
| v1.0 progress-redline gates | PASS | 4/4 still green |
| No new dependencies | PASS | `package.json` delta = 0 |
| `HOPPER_TEST_ONLY` scope respected | PASS | grep `HOPPER_TEST_ONLY` in `cli/src/notify.js` = 0 (only `HOPPER_NOTIFY=0` which is user-facing disable, not test-only override) |
| Frontmatter contract intact | PASS | R07 doesn't write frontmatter |
| `.hopper/queue.md` / `AGENTS.md` (queue dogfood entries excepted) | PASS | Only 2 dogfood task rows in queue.md; explicit and committed under `[T-PROG-R07-DOGFOOD]` |
| Workflow constraints | PASS | 5 atomic commits, prefix consistent, no push, no amend, no no-verify |

### Implementation quality observations

1. **Excellent test coverage with DI** — `_spawn` / `_platform` / `_env` / `_timeoutMs` injection lets all 8 platform tests run on any CI without invoking real OS toast. Test #6 verifies shell-injection-safe quoting by inspecting captured `spawn` args, not actual command execution.

2. **Fire-and-forget pattern correct** — `notifyFn(...).catch(() => {})` in `runWatchEvents` ensures notify failure never propagates to watcher state machine. JSONL emit happens before notify, so even synchronous notify throws (impossible by design but defensively guarded) can't suppress the authoritative stdout event.

3. **Module main guard added** — `if (process.argv[1] && resolve(process.argv[1]) === __filename) main()` lets test code `import` the module without invoking the CLI's main loop. Standard Node idiom, cleanly applied.

4. **Shell escape is correct**:
   - PowerShell: single-quote string with internal `'` doubled to `''` (standard PS literal escape)
   - AppleScript: double-quote with `\\`, `\"`, `\n` escape (standard AS literal escape)
   - Linux: passes title/message as separate argv elements to `notify-send` (no shell), so no escape needed

5. **Best-effort everywhere** — no path in notify.js can throw to caller; structured `{ ok, platform, mechanism, error? }` return contract.

---

## Notes (informational, non-blocking)

### N-w.r07.1 — Dogfood opencode review delivered no body content

`T-PROG-R07-REVIEW-opencode-output.md` contains only frontmatter (status: done, duration: 570s) — no review body. Contrast with R15 wave where opencode/deepseek produced a substantive 188-line review finding 3 P1 bugs.

Possible causes:
- vendor timeout / cost limit hit silently
- review prompt was too narrow for opencode to find issues on small R07 surface (~165 LOC)
- vendor refused or produced empty output (silent fail)

This is **not a blocker** — R07 implementation is solid by reviewer's independent inspection. But dogfood pattern reliability varies wave-to-wave; documenting for retrospective.

**Recommendation**: at v1.1 closeout retrospective (after R17), assess dogfood ROI across waves: R14 research (productive), R15 review (3 P1 found → high value), R07 research/review (low or unverified value). Decide whether dogfood task design should change for v1.2.

### N-w.r07.2 — Windows BurntToast spawn cost when module not installed

`notifyWindows` always tries BurntToast first. If user doesn't have BurntToast PowerShell module installed (Windows default), every terminal event triggers:
1. spawn `powershell -Command "Import-Module BurntToast -ErrorAction Stop; ..."` — fails fast (~100-200ms)
2. spawn `powershell -Command "Add-Type ...; MessageBox::Show(...)"` — succeeds

Two PowerShell spawns per terminal event when BurntToast absent. PowerShell startup is ~100-200ms, so user experiences ~300-400ms extra latency per notification.

Optional optimization (v1.2 polish or follow-up `[T-PROG-DASHBOARD-PERF]`): cache `burntToastAvailable: boolean | null` at module level after first failed call; future calls skip BurntToast attempt.

Not blocking; current behavior is correct and best-effort.

### N-w.r07.3 — `runWatchEvents` exported public surface

`runWatchEvents` is now `export`ed (was `function runWatchEvents` previously). This makes it part of the dispatch module's public API for testing purposes. If someone else imports it from production code, they get a watcher with default `notifyFn` / `writeLine` / `exitFn`.

Reviewer judgement: acceptable. Test injection is a legitimate use case; the exported function is harmless if called from anywhere else. Mark `@internal` in JSDoc if desired (not required).

### N-w.r07.4 — `--watch-events` exit path uses injected `exitFn`

`cleanup(code)` now calls `exitFn(code)` (default `process.exit`). Tests inject `exitFn: () => {}` so `--once` doesn't terminate the test process. This is necessary for test isolation but means production behavior is unchanged.

Reviewer judgement: standard test seam. No risk.

---

## Wave 3 / Wave 4 / dashboard-1/2 notes disposition

| Note | Status |
|---|---|
| N-w3.1 partial-write orphan | not addressed; v1.2 |
| N-w3.2 readProgressEvents `.1` rotate | not addressed; v1.2 |
| N-w3.3 scan + watchFile interval | N/A |
| N-w3.4 `--once` semantics | not addressed; defer to polish |
| N-w4.1 `HOPPER_TEST_ONLY_TIMEOUT_MS` docs | **not addressed**; R17 target |
| N-w4.2 monitors path canonical anchor | **not addressed**; R17 target |
| N-w4.3 vendor-fixture real-world dogfood | partially: R15 wave fully covered; R07 wave produced empty review (see N-w.r07.1) |
| N-w.d1.1/2/3 | all closed in R15.2 cleanup |
| N-w.d2.1 redline grep scope | closed via N1.v2 Errata |
| N-w.d2.2-d2.6 | open polish items |

R17 is the natural closure for N-w4.1 + N-w4.2.

---

## Reviewer Boundary (unchanged)

Read-only. No code, no commit, no PR. This review consumed read-only `git diff`, `git show`, `git log`, `npm test`, and `node --test` invocations.

---

## Next reviewer trigger

R07 wave is closed. v1.1 final remaining R-item is **R17** (release docs sync), which closes N-w4.1 + N-w4.2.

When R17 lands, **N2.wave.r17** fires — thin docs review (≤30 min). After R17 accept, v1.1 milestone closes.

---

## Revision Log

| Version | Date | Change |
|---|---|---|
| v1.0 | 2026-05-22 | First N2.wave.r07 review; verdict accept; v1.1 R07 wave closed |
