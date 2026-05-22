---
plan: background-progress-notification-v1-must
source_prd: docs/specs/background-progress-notification-prd-trd.md
prd_version: 0.4
scope: v1-must
status: ready-for-review
created: 2026-05-22
revision_items_count: 8
acceptance_criteria_count: 7
wave_count: 4
---

# Background Progress and Completion Notification PLAN-v1.0

## Objective

Deliver the PRD v0.4 MUST lane for background progress state and terminal events without changing vendor stdio capture, dashboard, OpenCode native plugin, Codex app-server behavior, or non-Claude host integrations.

v1.0 must provide:

1. `progress.log` JSONL sidecar for background tasks.
2. Progress frontmatter fields on background `output.md`.
3. Terminal events from runner completion/failure and stale/orphan reaping.
4. `hopper-dispatch --progress <task-id>`.
5. `hopper-dispatch --watch-events [--once]` using `fs.watchFile` over `*-output.md`.
6. Claude Code monitor bridge as the only v1.0 host integration.
7. Verification for AC-01 / AC-03 / AC-04 / AC-06 / AC-11 / AC-12 / AC-13.

## Scope Boundary

In scope:

- R01 progress.js core.
- R02 frontmatter seed for `--background` only.
- R03 `reapStaleJobs` and stale/dead PID terminal event.
- R04 runner terminal event.
- R05 `--progress` CLI.
- R06 `--watch-events` CLI using `fs.watchFile`.
- R16 Claude Code monitor bridge.
- R18 verification for the v1.0 AC subset only.

Out of scope:

- v1.1 SHOULD: OS notify helper, dashboard watcher/UI updates, release docs refresh.
- v1.2 LATER: pipe+tee runner stdio migration, generic stream-parser, provider capability metadata, Codex app-server provider, OpenCode native plugin progress, single-spawn carve-out work.
- No heartbeat rows.
- No Codex OS toast or Codex CLI host wake integration.
- No changes to `hosts/opencode/plugins/hopper-async.ts`.
- No changes to `hosts/codex-cli/`.
- No changes to `dashboard/`.
- No changes to `cli/src/dispatch.js::executeDispatch` sync path.
- No `progress.log` creation in sync mode.
- No hidden reasoning capture, automatic retry, alternate-provider switching, or harness reaction core.

## Locked Truths

1. Runner terminal state is authoritative; host wrapper completion is advisory.
2. `progress.log` lives at `.hopper/handoffs/<task-id>-progress.log`.
3. `output.md` frontmatter remains the compact status snapshot.
4. New frontmatter fields are optional and backward-compatible.
5. `terminal_event_emitted` is the writer-side dedup flag.
6. JSONL `terminal: true` is the subscriber-side signal.
7. v1.0 does not modify runner stdio mode; existing fd redirect remains.
8. v1.0 has no OS toast; `--watch-events` emits stdout JSONL only.
9. Claude Code monitor is the only v1.0 host integration.
10. Existing background and sync tests must keep passing.

## Wave Plan

| Wave | Items | Goal | Dependencies |
|---|---|---|---|
| 1 | R01, R02 | Progress schema and initial background state | none |
| 2 | R03, R04 | Terminal event writers | Wave 1 |
| 3 | R05, R06 | CLI read/watch surface | Waves 1-2 |
| 4 | R16, R18 | Claude monitor bridge and verification closure | Waves 1-3 |

Dependency graph:

```text
R01 -> R02 -> R03 -> R04 -> R05 -> R06 -> R16 -> R18
```

## Revision Items

### R01 - Add progress event core

Source: PRD v0.4 §6.2 + §5 NFR-003

Estimate: M

Files:

- `cli/src/progress.js` (new)
- `tests/unit/progress.test.js` (new)

Implement:

- `progressLogPath(outputMdPath)`
- `appendProgressEvent({ hopperDir, taskId, event })`
- `readProgressEvents({ hopperDir, taskId, limit })`
- `nextProgressSeq({ hopperDir, taskId })`
- `rotateProgressLogIfNeeded(path, maxBytes = 10 * 1024 * 1024)`
- flat JSONL schema validation for:
  - `seq`
  - `ts`
  - `task_id`
  - `vendor`
  - `phase`
  - `kind`
  - `message`
  - `source`
  - `terminal`

Verification:

- Unit: append/read roundtrip.
- Unit: malformed JSONL lines are skipped, not thrown.
- Unit: rotation to `.1` at 10 MB.
- Unit: path traversal rejected through existing task-id validation.

### R02 - Seed progress frontmatter for background dispatch

Source: PRD v0.4 §6.2 + §4 FR-001

Estimate: M

Files:

- `cli/src/background.js`
- `tests/unit/background.test.js`
- `tests/integration/background-e2e.test.js`

Implement:

- Add these optional frontmatter fields to initial `--background` output:
  - `last_progress_at`
  - `last_progress`
  - `progress_seq`
  - `progress_log`
  - `raw_log`
  - `vendor_session_id`
  - `terminal_event_emitted`
- Also seed `phase: starting` for new background tasks.
- Create initial JSONL progress event with `phase=starting`, `source=runner`, `terminal=false`.
- Do not touch sync dispatch.

Verification:

- `spawnDetached` writes progress fields for background tasks.
- `progress.log` exists only for background dispatch.
- Sync dispatch does not create `progress.log`.
- Old `output.md` from v0.6.0-phase-6c, with no new fields, parses normally through `readFrontmatter`; missing fields return `null` / `undefined` and do not throw.

### R03 - Make orphan transitions terminal-event aware

Source: PRD v0.4 §4 FR-010 + AC-11

Estimate: M

Files:

- `cli/src/background.js`
- `tests/unit/background.test.js`

Implement:

- When `preflightDispatch` reclassifies stale or dead-PID `in-progress` jobs to `orphaned`, append one terminal event before setting `terminal_event_emitted: true`.
- When `reapStaleJobs` reclassifies jobs to `orphaned`, append one terminal event before setting `terminal_event_emitted: true`.
- Check `terminal_event_emitted` before writing.

Verification:

- Stale age reclassification writes one terminal event.
- Dead PID reclassification writes one terminal event.
- Running `reapStaleJobs` twice on the same task appends nothing extra.

### R04 - Append runner terminal events

Source: PRD v0.4 §6.6 + AC-3

Estimate: M

Files:

- `cli/bin/hopper-runner`
- `cli/src/progress.js`
- `tests/integration/runner-single-spawn.test.js`

Implement:

- Append a terminal event after `adapter.parseResult`.
- Update frontmatter fields:
  - `status`
  - `phase`
  - `last_progress_at`
  - `last_progress`
  - `progress_seq`
  - `terminal_event_emitted`
  - existing completion fields such as `end_time`, `exit_code`, `duration_ms`, `adapter_status`.
- Add terminal event write to early `fail()` paths when output frontmatter exists.
- Do not add a new child process or new vendor invocation.

Verification:

- Success task writes exactly one terminal event.
- Failed task writes exactly one terminal event.
- Timed-out task writes exactly one terminal event.
- Runner still has exactly one vendor `spawn()` call in generic path.

### R05 - Add `hopper-dispatch --progress <task-id>`

Source: PRD v0.4 §4 FR-003

Estimate: S

Files:

- `cli/bin/hopper-dispatch`
- `tests/unit/progress-cli.test.js` (new) or `tests/unit/phase6c.test.js`

Implement:

- Usage line.
- Task-id validation before path construction.
- Render:
  - task id
  - status
  - phase
  - elapsed/duration
  - `last_progress`
  - last 5 progress events
  - output, raw log, and progress log paths.
- Exit codes:
  - `0` readable status
  - `1` missing task
  - `2` invalid input

Verification:

- In-progress task prints current phase and recent events.
- Terminal task prints status and terminal event.
- Missing task has clear error.

### R06 - Add `hopper-dispatch --watch-events [--once]`

Source: PRD v0.4 §4 FR-005 + §6.5 (fs.watchFile)

Estimate: M

Files:

- `cli/bin/hopper-dispatch`
- `cli/src/progress.js`
- `tests/unit/progress-watch.test.js` (new)

Implement:

- Watch a set of `.hopper/handoffs/*-output.md` files.
- Detect terminal transitions by reading frontmatter `status` and `terminal_event_emitted`.
- Do not watch `*-progress.log`; this avoids append churn and the Windows `renameSync` event window called out in PRD v0.4 §6.5.
- Use `fs.watchFile(path, { interval: 500 })`, not `fs.watch` and not `chokidar`.
- Emit stdout JSONL with `type: "hopper.task.terminal"`.
- Support `--once`.
- Maintain per-process `last_seen_seq`.

Verification:

- Two subscribers both receive every terminal event.
- A single subscriber does not duplicate one terminal event.
- `--once` exits after first terminal event.
- Atomic frontmatter `renameSync` still triggers polling detection on Windows.

### R16 - Add Claude Code monitor bridge

Source: PRD v0.4 §6.6 + §6.6.1

Estimate: M

Files:

- `.claude-plugin/monitors/monitors.json` (new, if supported by current plugin packaging)
- `.claude-plugin/monitors/hopper-watch-events.mjs` (new, or equivalent monitor command script)
- `hosts/claude-code/README.md`

Implement:

- Add a Claude Code monitor that runs `hopper-dispatch --watch-events`.
- Deliver stdout JSONL terminal events to the Claude session.
- Do not modify `commands/*.md` in v1.0.
- Document that this is the only v1.0 host integration.
- Document that wrapper/subagent completion is not task completion.
- If plugin monitor packaging is not supported by current Claude plugin metadata, document the manual monitor command and mark the packaging work blocked for N1 review rather than expanding scope.

Verification:

- Static check: monitor config invokes `hopper-dispatch --watch-events`.
- Static check: no `commands/*.md` modifications in v1.0 plan scope.
- Docs clearly state no Codex CLI/OpenCode native wake in v1.0.

### R18 - Complete v1.0 verification and redline gate

Source: PRD v0.4 §8 (18 AC)

Estimate: M

Files:

- `tests/unit/*.test.js`
- `tests/integration/*.test.js`
- `docs/specs/background-progress-notification-v1-must-PLAN.md`

Implement:

- Verification coverage only for AC-01 / AC-03 / AC-04 / AC-06 / AC-11 / AC-12 / AC-13.
- Static redline checks for forbidden v1.0 scope expansion.
- Regression run for existing background and sync behavior.

Verification command set:

```powershell
npm test
node --test tests/integration/background-e2e.test.js
node --test tests/integration/runner-single-spawn.test.js
```

## Acceptance Criteria Matrix

| AC | Requirement | v1.0 revisions | Verification |
|---|---|---|---|
| AC-01 | Background task writes `output.md`, `output.log`, and `progress.log`. | R01, R02 | background e2e |
| AC-03 | Successful task appends exactly one terminal event. | R04 | runner integration |
| AC-04 | Failed/timed-out task appends exactly one terminal event with correct status. | R04 | runner integration |
| AC-06 | Non-Codex vendor emits at least coarse terminal progress. | R01, R02, R04 | progress event unit + fake adapter |
| AC-11 | `reapStaleJobs` writes one orphan terminal event and is idempotent. | R03 | background unit |
| AC-12 | Two concurrent `--watch-events` subscribers both receive terminal events. | R06 | watch-events unit |
| AC-13 | Sync dispatch does not create `progress.log`; behavior remains unchanged. | R02, R18 | sync regression |

Note: `--progress` CLI is implemented in v1.0 via R05 and has task-level tests, but AC-02 is not part of the M1 v1.0 N1 acceptance subset.

## Redline Checklist

- [ ] No hidden chain-of-thought or private reasoning payload is written.
- [ ] No automatic retry, alternate-provider switching, or harness reaction core.
- [ ] Sync dispatch remains behaviorally unchanged and does not create `progress.log`.
- [ ] Host wrapper/subagent completion is never authoritative task completion.
- [ ] Runner terminal state remains authoritative.
- [ ] v1.0 runner stdio remains fd redirect; no pipe+tee.
- [ ] `killProcessTree()` timeout behavior remains active.
- [ ] Terminal events are exactly once via `terminal_event_emitted`.
- [ ] CLI `--watch-events` uses `fs.watchFile`.
- [ ] CLI `--watch-events` watches `*-output.md`, not `*-progress.log`.
- [ ] No changes to `hosts/opencode/plugins/hopper-async.ts`.
- [ ] No changes to `hosts/codex-cli/`.
- [ ] No changes to `dashboard/`.
- [ ] No required state outside `.hopper/handoffs`.
- [ ] Existing background and single-spawn tests are not deleted or bypassed.

## Executor Routing

Suggested split:

- Agent A: R01-R02 schema and progress core.
- Agent B: R03-R04 terminal writers.
- Agent C: R05-R06 CLI progress/watch.
- Agent D: R16-R18 Claude monitor and verification.

Merge order:

1. R01-R02
2. R03-R04
3. R05-R06
4. R16-R18

## Final Verification Gate

Before v1.0 can pass N1:

```powershell
npm test
node --test tests/integration/background-e2e.test.js
node --test tests/integration/runner-single-spawn.test.js
git diff --check -- docs/specs/background-progress-notification-v1-must-PLAN.md
```

Manual smoke, only with a safe local test task:

```powershell
node cli/bin/hopper-dispatch <safe-test-task-id> --background
node cli/bin/hopper-dispatch --progress <safe-test-task-id>
node cli/bin/hopper-dispatch --watch-events --once
```

Do not run a paid vendor smoke without explicit approval.

## Workflow Constraints

- Commit prefix: `[T-PROG-XX]` where `XX` equals the R item number.
- Single commit file delta <= 300 lines, except lockfiles.
- Do not push.
- Do not use `--amend`.
- Do not use `--no-verify`.
- Phase commits must be atomic: schema changes, implementation, and tests are separated.
- Deviation protocol: small deviations are recorded in the relevant `OUTPUT.md` deviations section; large deviations return to N1 reviewer before implementation continues.

## N1 Self-check

| Rubric | Result | Evidence |
|---|---|---|
| R1.1 | PASS | Scope lists only R01-R06/R16/R18 and the M1 v1.0 AC subset. |
| R1.2 | PASS | Out of scope explicitly excludes v1.1 and v1.2 items. |
| R1.3 | PASS | Separate v1.1 and v1.2 plan files are part of this rework. |
| R1.4 | PASS | No extra implementation beyond the listed R items. |
| R2.1 | PASS | AC matrix maps the user-required v1.0 subset. |
| R2.2 | PASS | Every R item has verification. |
| R2.3 | PASS | Verification distinguishes unit/integration/static where relevant. |
| R2.4 | PASS | AC-03 and AC-11 have R03/R04 coverage. |
| R3.1 | PASS | No added spawn; progress uses file IO in existing processes. |
| R3.2 | PASS | No retry or alternate-provider switching in v1.0. |
| R3.3 | PASS | R02 includes old-frontmatter compatibility verification. |
| R3.4 | PASS | Final gate keeps existing unit/background/single-spawn tests. |
| R3.5 | PASS | `cli/src/dispatch.js::executeDispatch` is out of scope. |
| R3.6 | PASS | No `.hopper/queue.md` or `.hopper/AGENTS.md` edits. |
| R4.1 | PASS | Exact `progress.log` path is specified. |
| R4.2 | PASS | R01 lists required JSONL fields. |
| R4.3 | PASS | R02 lists seven frontmatter fields. |
| R4.4 | PASS | R03/R04 specify terminal-event dual track. |
| R4.5 | PASS | Existing `writeFrontmatter` atomic strategy remains. |
| R4.6 | PASS | R01 defines 10 MB rotation to `.1`. |
| R4.7 | N/A | Field order is not required for v1.0 correctness. |
| R5.1 | PASS | R03 is dedicated to reap/orphan terminal events. |
| R5.2 | PASS | Sync mode explicitly unchanged. |
| R5.3 | PASS | R06 requires `fs.watchFile`. |
| R5.4 | PASS | R06 watches `*-output.md`, not `*-progress.log`. |
| R5.5 | N/A | v1.0 does not parse streaming progress or frequent frontmatter writes. |
| R5.6 | N/A | Tail truncate/rotate is v1.1 dashboard scope. |
| R6.1 | PASS | R16 is the only host bridge and avoids `commands/*.md`. |
| R6.2 | PASS | v1.0 selects stdout JSONL only; OS toast is v1.1. |
| R6.3 | PASS | OpenCode native plugin is out of scope. |
| R6.4 | PASS | Codex CLI host is out of scope. |
| R6.5 | PASS | Dashboard is out of scope. |
| R7.1 | PASS | Final gate targets this Windows/Node 22 environment. |
| R7.2 | N/A | POSIX smoke belongs to execution, not N1 plan doc. |
| R7.3 | PASS | R06 verifies `renameSync` detection via `fs.watchFile`. |
| R7.4 | N/A | OS toast is v1.1. |
| R8.1 | PASS | Workflow constraints require atomic commits. |
| R8.2 | PASS | Workflow constraints ban push/amend/no-verify. |
| R8.3 | PASS | Workflow constraints cap file delta per commit. |
| R8.4 | PASS | Workflow constraints set `[T-PROG-XX]`. |
| R8.5 | PASS | Workflow constraints include deviation protocol. |
| R9.1 | PASS | Wave plan and dependency graph included. |
| R9.2 | PASS | Every R item has verification. |
| R9.3 | PASS | Every R item has a PRD source line. |
| R9.4 | PASS | Every R item has S/M estimate. |
| R9.5 | PASS | Risks are covered by redline checklist and scope boundary. |
