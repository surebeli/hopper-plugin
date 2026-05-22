# N2.wave4 Plan Review — Background Progress and Completion Notification v1-must

Status: verdict v1.0 — **accept** + **v1-must milestone CLOSED**
Date: 2026-05-22
Anchor: `docs/specs/background-progress-notification-v1-must-N2-wave4-REVIEW.md::root`
Reviewer role: third-party architecture review agent (read-only)
Wave scope: R16 + R18 of PLAN-v1.0 (final wave)

## Companions

- PRD: `docs/specs/background-progress-notification-prd-trd.md` (v0.4)
- Rubric: `docs/specs/background-progress-notification-plan-review-rubric.md` (v1.0)
- PLAN-v1.0: `docs/specs/background-progress-notification-v1-must-PLAN.md`
- N1: `docs/specs/background-progress-notification-v1-must-N1-REVIEW.md`
- N2.wave1: `docs/specs/background-progress-notification-v1-must-N2-wave1-REVIEW.md`
- N2.wave2: `docs/specs/background-progress-notification-v1-must-N2-wave2-REVIEW.md`
- N2.wave3: `docs/specs/background-progress-notification-v1-must-N2-wave3-REVIEW.md`
- Wave 4 OUTPUT: `docs/specs/background-progress-notification-v1-must-wave4-OUTPUT.md`

## Round History

| Round | Date | Verdict | Trigger |
|---|---|---|---|
| N2.wave4 v1 | 2026-05-22 | **accept** | R16+R18 delivery: 2 atomic commits, 398/398 tests green, Claude monitor bridge wired, full 7-AC verified, redline-guard static tests added, all 4 wave-3 notes acknowledged |

## Verdict Summary

| Dimension | Status | Notes |
|---|---|---|
| R16 packaging spike outcome | PASS | Spike concluded Claude Code expects plugin components at plugin root; `monitors/monitors.json` placed at repo root (alongside `commands/`); deviation documented in wave4-OUTPUT |
| R16 Claude monitor config | PASS | `monitors/monitors.json` invokes `hopper-dispatch --watch-events`; static test #26 enforces |
| R16 no `commands/*.md` changes | PASS | `git diff HEAD~2 HEAD -- commands/` = 0 lines |
| R16 docs state wrapper ≠ task completion | PASS | README.md "Completion monitor" section explicit; static test #27 enforces |
| R18 7-AC verification | PASS | wave4-OUTPUT records AC-01 / 03 / 04 / 06 / 11 / 12 / 13 with evidence pointers to specific test files |
| R18 timeout integration test (N-w2.4) | PASS | `runner-single-spawn.test.js#5` "hopper-runner appends exactly one timeout terminal progress event" green |
| R18 redline static gates | PASS | `progress-redline.test.js` 4 tests cover watch-events shape, sync-path purity, host-bridge exclusivity, OUTPUT contract |
| Wave 3 notes disposition | PASS | All 4 notes acknowledged or deferred in wave4-OUTPUT |
| Test suite | PASS | 392 → 398 (pass 383 + skipped 15, fail 0); +6 net new |
| Scope discipline | PASS | 6 wave-4 in-scope files (5 code/test + 1 OUTPUT); sync path = 0; `commands/*.md` = 0 |
| Commit hygiene | PASS | 2 atomic commits `[T-PROG-R16]` / `[T-PROG-R18]`; max single-file delta 60 lines |
| Single-spawn invariant (entire surface) | PASS | static tests #7 #8 #9 confirm runner / spawnDetached / opencode plugin |
| No fallback / no retry (entire surface) | PASS | static test #8 + #10 + redline test #2; grep clean across waves 1-4 |

Overall: **accept**. PLAN-v1.0 (`v1-must`) is **CLOSED**.

---

## Evidence

### Commit history

```
99957ec [T-PROG-R18] add v1 verification and redline gate
c40b3fc [T-PROG-R16] add Claude Code watch-events monitor bridge
772fb3a [T-PROG-R06] add watch-events terminal event CLI
4cbb65e [T-PROG-R05] add progress status CLI
19219f6 [T-PROG-R04] append runner terminal progress events
c7a6746 [T-PROG-R03] append orphan terminal progress events
1a284db [T-PROG-R02] seed progress frontmatter in background dispatch
28f0981 [T-PROG-R01.1] make progress seq rotate-aware
ffbfc40 [T-PROG-R01] add progress helpers and unit tests
```

9 commits total, all `[T-PROG-XX]` prefixed, atomic, no `--amend`, no `--no-verify`, not pushed.

| Commit | Files | Lines | Largest file |
|---|---|---|---|
| `c40b3fc [T-PROG-R16]` | 3 (monitors.json, README, claude-code-host.test.js) | +64 / -3 | README 32 lines |
| `99957ec [T-PROG-R18]` | 4 (runner, runner-single-spawn.test.js, progress-redline.test.js, wave4-OUTPUT.md) | +159 / -4 | progress-redline.test.js 60 lines |

Both within 300-line ceiling per R8.3. `[T-PROG-XX]` prefix matches R8.4.

### File scope (`git diff HEAD~2 HEAD --name-only`)

```
cli/bin/hopper-runner                                                       (R18)
docs/specs/background-progress-notification-v1-must-wave4-OUTPUT.md         (R18)
hosts/claude-code/README.md                                                 (R16)
monitors/monitors.json                                                      (R16)
tests/integration/runner-single-spawn.test.js                               (R18)
tests/unit/claude-code-host.test.js                                         (R16)
tests/unit/progress-redline.test.js                                         (R18)
```

7 files. All within R16/R18 scope. Sync-path check + `commands/*.md` check both = 0 lines.

### Test suite (`npm test`)

```
1..398
# pass 383
# fail 0
# skipped 15
```

Compared to wave 3 close (392): +6 net new tests.

### R16 — Claude Code monitor bridge

**Packaging spike outcome** (per N1 Note B obligation):

> Per wave4-OUTPUT: "packaging spike showed Claude Code expects plugin components at plugin root, so the monitor is `monitors/monitors.json`, not `.claude-plugin/monitors/monitors.json`."

This is a path deviation from PLAN R16's literal text (which proposed `.claude-plugin/monitors/monitors.json`) but adheres to PLAN R16's carve-out: "if plugin monitor packaging is not supported by current Claude plugin metadata, document the manual monitor command and mark the packaging work blocked for N1 review rather than expanding scope." Spike found packaging **does** support monitors but at a different path — executor documented this deviation in wave4-OUTPUT §Decisions And Deviations rather than escalating. Acceptable.

**Implementation**:

- `monitors/monitors.json` (7 lines):
  ```json
  [
    {
      "name": "hopper-watch-events",
      "command": "node \"${CLAUDE_PLUGIN_ROOT}/cli/bin/hopper-dispatch\" --watch-events",
      "description": "Forward hopper terminal task events from .hopper/handoffs to Claude Code notifications"
    }
  ]
  ```
- `hosts/claude-code/README.md` "Completion monitor" section: explicitly states "The runner terminal state is authoritative... Wrapper completion, background Bash completion, or subagent completion is not authoritative task completion."

**Static tests** (`tests/unit/claude-code-host.test.js`):

- `#26` plugin-root `monitors/monitors.json` invokes `hopper-dispatch --watch-events`
- `#27` README documents monitor bridge boundaries (wrapper completion warning)

### R18 — Verification + redline gate

**Runner change (justified)**:

R18 adds 6 lines to `cli/bin/hopper-runner` introducing `HOPPER_TEST_ONLY_TIMEOUT_MS` env-var override:

```js
let timeoutMs = adapter.timeoutMs({ ...adapterOpts, background: true });
if (process.env.HOPPER_TEST_ONLY_TIMEOUT_MS) {
  const testTimeoutMs = Number.parseInt(process.env.HOPPER_TEST_ONLY_TIMEOUT_MS, 10);
  if (Number.isFinite(testTimeoutMs) && testTimeoutMs > 0) timeoutMs = testTimeoutMs;
}
```

Reviewer assessment: this is the necessary infrastructure for N-w2.4 (timeout integration test) which the wave 3 verdict explicitly required at wave 4. Without this hook, the timeout codepath cannot be tested without waiting 120s+ per fixture. The env-var name (`HOPPER_TEST_ONLY_*`) is explicit anti-misuse; production behavior is unchanged when the env-var is absent. Not scope creep — R18 verification infrastructure. See N-w4.1 below for the surface-area note.

**Timeout integration test** (`tests/integration/runner-single-spawn.test.js#5`):

> `hopper-runner appends exactly one timeout terminal progress event`

Closes N-w2.4 from wave 2 verdict.

**Redline static gates** (`tests/unit/progress-redline.test.js`, 4 tests):

- `#1 (#29 in full suite)` `--watch-events` uses `fs.watchFile`, watches `*-output.md`, not `*-progress.log`; no `fs.watch(`, no `chokidar`
- `#2 (#30)` sync dispatch path (`cli/src/dispatch.js`, `cli/src/subprocess.js`, `cli/src/output.js`) contains no `appendProgressEvent` / `progressLogPath` / `progress_log` / `progress.log` strings — AC-13 regression guard
- `#3` `monitors/monitors.json` is the only v1.0 native host wake bridge; `hosts/codex-cli/README.md` and `hosts/opencode/plugins/hopper-async.ts` contain no `--watch-events` / `monitors/monitors.json` / `hopper-watch-events` references
- `#4` wave4-OUTPUT contract: must reference AC-01/03/04/06/11/12/13 with PASS|covered|verified, must acknowledge/defer N-w3.1/3.2/3.3/3.4, must mention `HOPPER_TEST_ONLY_TIMEOUT_MS` as test-only

These are excellent regression guards — they encode reviewer's wave 1-3 invariants as automated static tests, preventing future drift.

### Full 7-AC verification (PLAN-v1.0 acceptance subset)

| AC | wave | Status | Direct test |
|---|---|---|---|
| AC-01 background writes output.md + output.log + progress.log | 1 (R02) | PASS | `background-e2e.test.js` "spawnDetached writes initial in-progress frontmatter + PID + start_time" asserts progress.log existence |
| AC-03 successful task = exactly one terminal event | 2 (R04) | PASS | `runner-single-spawn.test.js#3` "appends exactly one terminal progress event on success" |
| AC-04 failed/timeout task = exactly one terminal event | 2 (R04) + 4 (R18) | PASS | `runner-single-spawn.test.js#4` (failed) + `#5` (timeout, new in R18) |
| AC-06 non-Codex vendor emits coarse + terminal | (covered) | PASS covered | Runner is vendor-agnostic; fake adapter exercises coarse terminal path independent of any vendor identity |
| AC-11 reapStaleJobs idempotent orphan terminal | 2 (R03) | PASS | `background.test.js#23` "reapStaleJobs is idempotent for terminal orphan events" |
| AC-12 two `--watch-events` subscribers both receive | 3 (R06) | PASS | `progress-watch.test.js#5` "two subscribers both receive terminal event JSONL" |
| AC-13 sync dispatch does not create progress.log | 1 (R02) + 4 (R18 static) | PASS | wave 1 sync regression + R18 `progress-redline.test.js#2` static guard |

### Wave 3 notes disposition (per wave4-OUTPUT)

| Note | Disposition | Verdict |
|---|---|---|
| N-w3.1 partial-write orphan permissive trade | acknowledged; strict-only kept for v1.0; permissive deferred | ✓ acceptable |
| N-w3.2 `readProgressEvents` rotate-aware | deferred to v1.1/v1.2 | ✓ acceptable (rotate is rare in v1.0 durations) |
| N-w3.3 scan + watchFile 500ms coupling | acknowledged; current scale safe | ✓ acceptable |
| N-w3.4 `--once` first-event semantics | documented in OUTPUT | ✓ acceptable |

### Red-line re-check across waves 1-4

| Invariant | Status | Verification |
|---|---|---|
| Single-spawn (runner) | PASS | static test #7 + grep: one match at line 212 |
| Single-spawn (spawnDetached) | PASS | static test #9 |
| No retry / no fallback (runner) | PASS | static test #8 |
| No retry / no fallback (OpenCode plugin) | PASS | static test #10 |
| watch-events fs.watchFile only | PASS | redline test #1 (#29) |
| watch-events watches output.md not progress.log | PASS | redline test #1 (#29) |
| sync path progress-free | PASS | redline test #2 (#30) + diff verification |
| Claude monitor is sole v1.0 native bridge | PASS | redline test #3 |
| wave4 OUTPUT contract | PASS | redline test #4 |
| commands/*.md untouched | PASS | `git diff HEAD~2 HEAD -- commands/` = 0 |
| `.hopper/queue.md` / `AGENTS.md` untouched (waves 2-4) | PASS | Not in diffs |
| frontmatter backward compatibility | PASS | wave 1 R02 compat test still green |
| Workflow constraints (all waves) | PASS | 9 atomic commits, prefix consistent, no push, no amend, no no-verify |
| Existing tests not deleted | PASS | Test count progression: 382 (pre-wave1) → 383 → 384 → 392 → 398, +16 net new, zero deletions |

---

## Notes (informational, non-blocking)

### N-w4.1 — `HOPPER_TEST_ONLY_TIMEOUT_MS` increases prod attack surface marginally

R18 introduces a test-only env-var that, if set in production, would shorten runner timeout. Risk profile:

- Naming (`HOPPER_TEST_ONLY_*`) is explicit anti-misuse signal
- Worst-case misuse: timeout shortened on own process; no privilege escalation, no cross-process effect
- No bypass of single-spawn / no-fallback / no-retry invariants
- Production users do not typically set this env-var; CI / fixtures do

Recommended for v1.1 release docs: explicit one-line in `INSTALL-MATRIX.md` or `README.md` noting `HOPPER_TEST_ONLY_*` env-vars exist and should not be set in production. Not blocking.

### N-w4.2 — R16 packaging-deviation: monitors at repo root, not under .claude-plugin/

PLAN R16's literal text proposed `.claude-plugin/monitors/monitors.json`; executor's spike found Claude Code actually expects plugin components at plugin root (sibling of `commands/`). The path `monitors/monitors.json` works, but PLAN-v1.0 was not updated to reflect this.

Recommended for v1.1: update PLAN-v1.0 retroactively (or amend PRD §6.6) to anchor the canonical path. Helps future plugin packaging contributors avoid the spike. Not blocking; OUTPUT.md captures the rationale.

### N-w4.3 — AC-06 evidence is structural, not vendor-fixture

AC-06 ("Non-Codex vendor emits at least coarse progress and terminal events") is marked "PASS covered" with the rationale that the runner is vendor-agnostic. No specific Kimi / OpenCode / Copilot / Agy fixture was added. Structurally this is sound (the runner code path makes no vendor-specific branches for terminal events), but a real-world dogfood would close the loop.

Recommend deferring to v1.1 R17 (release docs) or a post-merge dogfood run: dispatch a real non-Codex task in `--background` mode, verify progress.log + frontmatter + terminal event. Not blocking — code-path proof is sufficient for N2 acceptance.

---

## v1-must Milestone Summary

PLAN-v1.0 R01-R06 + R16 + R18 = 8 revisions, delivered across 4 waves over 1 day (2026-05-22).

| Wave | R items | Commits | Tests added | N2 verdict |
|---|---|---|---|---|
| 1 | R01, R01.1, R02 | 3 | +9 (5 progress + 1 backward-compat + 1 e2e + 1 rotate-monotonic + R02 frontmatter assertions) | accept (after one rework round) |
| 2 | R03, R04 | 2 | +8 (background orphan / preflight / reap idempotency + runner success/fail/early-fail/static) | accept |
| 3 | R05, R06 | 2 | +8 (4 progress-cli + 4 progress-watch) | accept |
| 4 | R16, R18 | 2 | +6 (claude-code-host #26+#27 + timeout-terminal #5 + redline #1-#4) | accept |
| Total | 8 | 9 (incl. R01.1 split) | +31 net new | — |

Cumulative test count: 382 baseline → 398 close. Zero existing tests deleted, zero regressions.

PRD v0.4 §5 MUST scope **fully delivered**. v1.1 (SHOULD) and v1.2 (LATER) remain available as separate phases.

---

## Reviewer Boundary (unchanged)

Per `N1-REVIEW.md`: reviewer does not write code, does not commit, does not run executor's test suite directly (relies on executor evidence). This review consumed read-only `git diff`, `git show`, `git log`, `npm test`, and direct `node --test` invocations. v1-must close does not change reviewer role.

---

## Next reviewer trigger

**v1-must is closed.** No further N2 reviews on PLAN-v1.0.

Available next phases (user/orchestrator decides):

- **v1.1** (`docs/specs/background-progress-notification-v1.1-should-PLAN.md`): R07 OS notify + R14 dashboard watcher + R15 dashboard UI + R17 release docs. Recommend N1 re-review on the v1.1 PLAN before execution starts (PLAN was accepted in original N1; re-confirmation is light given v1.0 implementation surface is now real).
- **v1.2** (`docs/specs/background-progress-notification-v1.2-later-PLAN.md`): R08 pipe+tee + R09 stream-parser + R10 capability metadata + R11 Codex app-server deferral + R12 single-spawn reconciliation + R13 OpenCode plugin progress. Recommend N1 re-review especially on R08 backpressure design.
- **Hold**: collect dogfood telemetry on v1.0 before committing to v1.1/v1.2 priority.

---

## Revision Log

| Version | Date | Change |
|---|---|---|
| v1.0 | 2026-05-22 | First N2.wave4 review; verdict accept; v1-must milestone CLOSED |
