# N1 Plan Review — Background Progress and Completion Notification v1-must

Status: verdict v1.0 — **accepted**
Date: 2026-05-22
Anchor: `docs/specs/background-progress-notification-v1-must-N1-REVIEW.md::root`
Reviewer role: third-party architecture review agent (read-only)

## Companions

- PRD: `docs/specs/background-progress-notification-prd-trd.md` (v0.4)
- Rubric: `docs/specs/background-progress-notification-plan-review-rubric.md` (v1.0)
- PLAN-v1.0: `docs/specs/background-progress-notification-v1-must-PLAN.md`
- PLAN-v1.1: `docs/specs/background-progress-notification-v1.1-should-PLAN.md`
- PLAN-v1.2: `docs/specs/background-progress-notification-v1.2-later-PLAN.md`

## Round History

| Round | Date | Verdict | Trigger |
|---|---|---|---|
| N1 v0 | 2026-05-22 | rework | Initial single-file PLAN exceeded v1 MUST scope; R11 introduced runtime vendor fallback |
| N1 v1 | 2026-05-22 | **accept** | Post-M1 split into 3 PLANs; M2 option b applied; M3-M6 patches present |

## Verdict Summary

| PLAN | BLOCKING | SHOULD | Verdict |
|---|---|---|---|
| **v1.0 MUST** | 28/28 PASS | 6/6 PASS (1 PARTIAL rationalized as N/A — POSIX smoke is execution-layer) | **accept** |
| **v1.1 SHOULD** | All applicable PASS | All PASS | **accept** |
| **v1.2 LATER** | All applicable PASS + M2 option b applied | All PASS | **accept** |

整体：**accept** — 可推进到执行阶段。

---

## PLAN-v1.0 BLOCKING Independent Verify

| ID | Status | Evidence |
|---|---|---|
| R1.1 | PASS | Scope = R01-R06 / R16 / R18 = 8 items, one-to-one with rubric expectation |
| R1.2 | PASS | Out of scope explicitly lists v1.1 (OS notify / dashboard / docs) and v1.2 (pipe+tee / stream-parser / capability / app-server / OpenCode plugin / single-spawn carve-out); plus heartbeat / Codex OS toast / sync path / hidden reasoning |
| R3.1 | PASS | R04 implementation: "Do not add a new child process or new vendor invocation"; verification: "exactly one vendor `spawn()` call in generic path" |
| R3.2 | PASS | Full-text grep of v1.0 PLAN: `fallback` / `alternate` / `retry` appear only inside Out of scope prohibitions, never in implementation text |
| R3.3 | PASS | R02 verification includes M5 compatibility clause: "Old `output.md` from v0.6.0-phase-6c, with no new fields, parses normally through `readFrontmatter`; missing fields return `null` / `undefined` and do not throw" |
| R4.2 | PASS | R01 lists 9 JSONL fields (seq / ts / task_id / vendor / phase / kind / message / source / terminal) — character-for-character match with PRD §6.2 |
| R4.3 | PASS | R02 lists 7 new frontmatter fields + `phase: starting`; aligns with rubric R4.3 spec |
| R5.3 | PASS | R06: "Use `fs.watchFile(path, { interval: 500 })`, not `fs.watch` and not `chokidar`" |
| R5.4 | PASS | R06: "Watch a set of `.hopper/handoffs/*-output.md` files. Do not watch `*-progress.log`" |
| R6.1 | PASS | R16 is the only host integration; commands/*.md explicitly not touched |
| R6.3 | PASS | Scope: "No changes to `hosts/opencode/plugins/hopper-async.ts`" |
| R6.4 | PASS | Scope: "No changes to `hosts/codex-cli/`" |
| R6.5 | PASS | Scope: "No changes to `dashboard/`" |
| R8.2 | PASS | Workflow Constraints: "Do not push. Do not use `--amend`. Do not use `--no-verify`" |
| R8.4 | PASS | Workflow Constraints: "Commit prefix: `[T-PROG-XX]` where `XX` equals the R item number" |
| R9.3 | PASS | Every R item carries `Source: PRD v0.4 §X.Y`; mapping matches rubric M4 character-for-character |

---

## PLAN-v1.2 Independent Verify

| Check | Status | Evidence |
|---|---|---|
| M2 decision (option a / b) | PASS — option b | R11 title: "Defer Codex app-server provider to v1.3"; body: "App-server provider is deferred to v1.3"; Locked Truth #6: "R11 is a deferral guard, not app-server implementation"; Redline: "No Codex app-server provider implementation in v1.2" |
| R3.2 no runtime fallback | PASS | R11: "No runtime app-server-to-stream-parser switching text is allowed in v1.2 tasks"; Locked Truth #5: "Capability metadata describes progress support; it must not trigger runtime alternate-provider switching"; Redline: "No runtime provider switching" |
| Scope correctness | PASS | R08-R13 = 6 items, all within LATER scope; no v1.0 / v1.1 items leaked in |
| Single-spawn invariant continuity | PASS | R12 dedicated to reconciling generic single-spawn under pipe+tee migration |

---

## SHOULD-level Notes

Record these at the first task brief head when executor agents pick up the PLAN.

### Note A — AC-02 and AC-09 missing from v1.0 AC matrix

- v0.4 PRD §8 AC-2 = "`--progress <task-id>` shows phase / elapsed time / last_progress / last 5 progress events". R05 implements this.
- v0.4 PRD §8 AC-9 = "Claude Code host bridge notifies completion from hopper terminal event, not wrapper completion". R16 implements this.
- v1.0 AC matrix lists only 7 ACs (AC-01 / 03 / 04 / 06 / 11 / 12 / 13). R05 and R16 substantively satisfy AC-02 and AC-09 respectively.

**Action**: Executor MUST claim AC-02 and AC-09 in the relevant R05 / R16 OUTPUT.md verification evidence. No PLAN edit required.

### Note B — R16 packaging spike before wave 1

- R16 carries the carve-out: "If plugin monitor packaging is not supported by current Claude plugin metadata, document the manual monitor command and mark the packaging work blocked for N1 review rather than expanding scope."
- Independent reviewer confirms: `.claude-plugin/plugin.json` (verified at the time of v0.3 review) does **not** declare a `monitors` field; the plugin currently ships `commands/` only.
- Whether Claude Code plugin packaging accepts `monitors/monitors.json` from a plugin that did not previously declare it is **packaging-time uncertain**.

**Action**: Before starting wave 1, executor runs an R16 packaging spike (≤ 10 minutes): fetch Claude Code plugin documentation for `monitors/monitors.json`, check whether the plugin manifest needs a new field. If packaging is not supported, R16 immediately escalates to a PLAN revision request (downgrade R16 to "documentation + manual setup instructions only") and returns to N1 before continuing.

### Note C — POSIX fixture tests deferred to execution layer

- Rubric R7.2 (POSIX-fixture tests for `fs.watchFile` / reap) is marked N/A by PLAN-v1.0 self-check, with rationale "POSIX smoke belongs to execution, not N1 plan doc".
- Reviewer accepts this rationale: PLAN files do not need to enumerate per-platform smoke steps.

**Action**: Execution-time obligation — R02 / R03 / R04 background test fixtures should include platform-conditional skip logic so POSIX CI (when added) can run them. This is an execution convention, not a PLAN gap.

---

## Red-line Final Check

| Invariant | v1.0 | v1.1 | v1.2 |
|---|---|---|---|
| single-spawn invariant | PASS (R04 explicit; runner stdio unchanged) | PASS (no runner changes) | PASS (R12 anchors it through pipe+tee migration) |
| no retry / no fallback | PASS (Out of scope grep clean) | PASS (R07 OS-toast best-effort is conditional execution, not vendor fallback) | **PASS** (M2 option b removed original R11 runtime fallback) |
| frontmatter backward compatibility | PASS (R02 explicit verification) | N/A (no frontmatter changes) | N/A (no frontmatter changes) |
| existing tests not broken | PASS (Final Gate covers `npm test` + runner-single-spawn + background-e2e) | PASS (Final Gate covers `npm test` + dashboard tests) | PASS (Final Gate covers `npm test` + runner-single-spawn + vendors-contract + opencode-plugin-static) |
| sync mode does not write progress.log | PASS (R02 verification explicit) | PASS (no runtime changes) | PASS (no runtime changes) |
| `.hopper/queue.md` / `AGENTS.md` not touched | PASS (Out of scope) | PASS (Out of scope) | PASS (Out of scope) |
| hidden reasoning never written | PASS (Redline #1) | PASS (Redline) | PASS (Redline) |

All red lines pass.

---

## N2 Trigger Points

Once v1.0 enters execution, the third-party reviewer (this agent) returns at these points:

| Trigger | After | Reviewer scope |
|---|---|---|
| **N2a** | R02 + R03 + R04 merged | Code-level diff vs rubric §4 (file contracts); verify JSONL schema, frontmatter fields, terminal-event dual track, atomic write strategy |
| **N2b** | R05 + R06 merged | CLI behavior verification: `--progress` rendering, `--watch-events` polling via `fs.watchFile`, watching `*-output.md` not `*-progress.log`, two-subscriber broadcast |
| **N2c** | R16 merged (or escalated per Note B) | Claude monitor bridge: confirm packaging spike outcome; if R16 downgraded, audit downgrade scope; verify no `commands/*.md` modifications |
| **N2d** | R18 merged | Full 7-AC verification matrix run; redline grep across new code; existing 158-test regression unchanged |

Each N2 node consumes:

- Latest commit SHA on the working branch
- Test output for the merged R items
- PLAN-v1.0 OUTPUT.md updates (if executor uses `.hopper/handoffs/` for output tracking)

Each N2 node produces:

- Verdict: accept / accept-with-notes / rework-this-wave
- Per-item rubric scores for the rubric sections touched by that wave
- Revision suggestions referencing PLAN-v1.0 line numbers and PRD §X.Y

## Reviewer Boundary

- Does not write code, does not commit, does not open PRs.
- Does not run the test suite — relies on executor evidence.
- Does not adjudicate executor choice (`codex` / `kimi` / `claude-code` / etc.).
- Each N2 reviews only the diff scope; does not re-litigate N1 unless executor introduces a deviation that exceeds the PLAN.

---

## Revision Log

| Version | Date | Change |
|---|---|---|
| v1.0 | 2026-05-22 | First N1 acceptance verdict, post-M1 split. v0 (pre-M1) rework verdict is recorded in the Round History table but not as a separate file. |
