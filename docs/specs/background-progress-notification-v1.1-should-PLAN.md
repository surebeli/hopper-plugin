---
plan: background-progress-notification-v1.1-should
source_prd: docs/specs/background-progress-notification-prd-trd.md
prd_version: 0.4
scope: v1.1-should
status: ready-for-review
created: 2026-05-22
revision_items_count: 4
acceptance_criteria_count: 3
wave_count: 3
---

# Background Progress and Completion Notification PLAN-v1.1

## Objective

Add SHOULD-layer user-facing notification and dashboard visibility on top of the v1.0 terminal-event contract, without changing runner stdio, provider metadata, OpenCode native plugin behavior, or Codex app-server behavior.

## Scope Boundary

In scope:

- R07 OS notification helper.
- R14 dashboard watcher/tail increments.
- R15 dashboard progress UI.
- R17 release docs and host/vendor matrix update.

Out of scope:

- v1.0 core state and terminal writers, except as consumed by this plan.
- v1.2 runner pipe+tee, stream-parser, provider capability metadata, OpenCode plugin progress, Codex app-server provider.
- No runtime retry or alternate-provider switching.
- No change to `.hopper/queue.md` or `.hopper/AGENTS.md`.

## Locked Truths

1. v1.1 consumes v1.0 terminal events; it does not redefine their schema.
2. OS notification is best effort and must never fail a job or watcher JSONL output.
3. Dashboard remains read-only for progress state.
4. Dashboard may use `chokidar`; CLI watcher remains `fs.watchFile`.
5. No host wrapper completion is authoritative.

## Wave Plan

| Wave | Items | Goal | Dependencies |
|---|---|---|---|
| 1 | R07 | OS toast helper for watcher consumers | v1.0 R06 |
| 2 | R14, R15 | Dashboard progress read/render path | v1.0 R01-R04 |
| 3 | R17 | Release docs and compatibility matrix | Waves 1-2 |

Dependency graph:

```text
v1.0 -> R07
v1.0 -> R14 -> R15 -> R17
R07 -> R17
```

## Revision Items

### R07 - Add OS notification helper

Source: PRD v0.4 §4 FR-011 + §6.6

Estimate: M

Files:

- `cli/src/notify.js` (new)
- `tests/unit/notify.test.js` (new)
- `cli/bin/hopper-dispatch`

Implement:

- Best-effort OS toast helper called alongside stdout JSONL by `--watch-events`.
- Windows: PowerShell/BurntToast if available, otherwise no-op with debug note.
- macOS: `osascript -e 'display notification ...'`.
- Linux: `notify-send`.
- Disable with `HOPPER_NOTIFY=0`.
- Shell-escape all user-controlled strings.

Verification:

- Unit: command construction is shell-safe.
- Unit: helper failure does not alter watcher exit code.
- Unit: stdout JSONL still emits if toast command fails.

### R14 - Wire dashboard server to progress events

Source: PRD v0.4 §3.1 #3 + §6.6 dashboard

Estimate: M

Files:

- `dashboard/server/events/watcher.js`
- `dashboard/server/lib/tail.js`
- `dashboard/server/routes/task.js`
- `tests/unit/dashboard-sse.test.js`
- `tests/unit/dashboard-log.test.js`

Implement:

- Watch `*-progress.log` in dashboard server only.
- Expose recent progress events in task detail response or a dedicated progress SSE route.
- Add tail logic for truncate and rotate:
  - `curr.size < prev.size` resets offset.
  - inode/path identity change resets offset and re-stats before reading.
- Preserve existing live raw-log behavior.

Verification:

- Unit: progress file change maps to a dashboard SSE channel.
- Unit: truncate resets offset.
- Unit: rotate reads first line of the new file once and does not re-read old content.

### R15 - Add dashboard progress UI

Source: PRD v0.4 §3.1 #3 + §6.6 dashboard

Estimate: M

Files:

- `dashboard/client/src/**`
- `tests/unit/dashboard-task.test.js`

Implement:

- Show `phase`, `last_progress_at`, `last_progress`, and recent progress events in task detail.
- Show terminal event in task detail for terminal tasks.
- Keep the UI compact and consistent with existing dashboard design.
- Do not add instructional or marketing copy.

Verification:

- Unit: task detail renders progress fields with missing-value fallback.
- Unit: terminal task renders terminal event.
- Build: `npm run dashboard:build`.

### R17 - Update release docs and host/vendor matrix

Source: PRD v0.4 §6.7

Estimate: S

Files:

- `docs/release/INSTALL-MATRIX.md`
- `docs/release/PASS-RATIONALE.md`
- `README.md`

Implement:

- Document `--progress`, `--watch-events`, and OS toast behavior.
- Document dashboard progress visibility.
- Document that Codex CLI and OpenCode wrapper path do not have native session wake.
- Keep OpenCode native plugin limitation explicit.

Verification:

- Static: no doc claims hidden reasoning access.
- Static: no doc claims Codex CLI native wake for hopper terminal events.
- Static: host/vendor matrix matches PRD §6.7.

## Acceptance Criteria Matrix

| AC | Requirement | v1.1 revisions | Verification |
|---|---|---|---|
| AC-10 | Dashboard renders progress/terminal updates from the same state files. | R14, R15 | dashboard tests/build |
| AC-16 | Non-native hosts can surface exactly one OS toast per terminal event alongside stdout JSONL. | R07 | notify unit/manual smoke |
| AC-18 | Tail implementation handles truncate and rotate without losing/re-reading content. | R14 | dashboard log tests |

## Redline Checklist

- [ ] OS notify failures never fail a job or JSONL watcher output.
- [ ] No runner stdio changes.
- [ ] No stream-parser or provider capability metadata.
- [ ] No OpenCode native plugin changes.
- [ ] No Codex app-server provider work.
- [ ] Dashboard remains a reader of `.hopper/handoffs` state.
- [ ] No required state outside `.hopper/handoffs`.
- [ ] No hidden reasoning capture.
- [ ] No automatic retry or alternate-provider switching.

## Executor Routing

Suggested split:

- Agent A: R07 OS notification helper.
- Agent B: R14 dashboard server/tail.
- Agent C: R15 dashboard UI.
- Agent D: R17 release docs.

Merge order:

1. R07
2. R14
3. R15
4. R17

## Final Verification Gate

```powershell
npm test
npm run dashboard:build
node --test tests/unit/dashboard-sse.test.js
node --test tests/unit/dashboard-log.test.js
git diff --check -- docs/specs/background-progress-notification-v1.1-should-PLAN.md
```

## Workflow Constraints

- Commit prefix: `[T-PROG-XX]` where `XX` equals the R item number.
- Single commit file delta <= 300 lines, except lockfiles.
- Do not push.
- Do not use `--amend`.
- Do not use `--no-verify`.
- Phase commits must be atomic: schema consumption, implementation, and tests are separated.
- Deviation protocol: small deviations are recorded in the relevant `OUTPUT.md` deviations section; large deviations return to N1 reviewer before implementation continues.

## N1 Self-check

| Rubric | Result | Evidence |
|---|---|---|
| R1.1 | N/A | v1.1 is SHOULD scope, not v1.0 MUST. |
| R1.2 | PASS | Scope boundary excludes v1.2 items and v1.0 implementation details. |
| R1.3 | PASS | This file is the SHOULD placeholder/plan. |
| R1.4 | PASS | Only R07/R14/R15/R17 are present. |
| R2.1 | PASS | AC-10/AC-16/AC-18 map to R07/R14/R15. |
| R2.2 | PASS | Every R item has verification. |
| R2.3 | PASS | Unit/build/static checks are distinguished. |
| R2.4 | N/A | AC-03 is v1.0 scope. |
| R3.1 | PASS | No runner spawn changes in v1.1. |
| R3.2 | PASS | No retry or alternate-provider switching appears in this plan. |
| R3.3 | N/A | Frontmatter schema is v1.0 scope. |
| R3.4 | PASS | Final gate keeps existing unit/build tests. |
| R3.5 | PASS | No `cli/src/dispatch.js::executeDispatch` changes. |
| R3.6 | PASS | No `.hopper/queue.md` or `.hopper/AGENTS.md` edits. |
| R4.1 | PASS | Dashboard consumes existing v1.0 progress path. |
| R4.2 | N/A | JSONL schema is v1.0 scope. |
| R4.3 | N/A | Frontmatter field definition is v1.0 scope. |
| R4.4 | N/A | Terminal writer definition is v1.0 scope. |
| R4.5 | N/A | Atomic frontmatter write strategy is v1.0 scope. |
| R4.6 | N/A | Rotation definition is v1.0 scope; v1.1 verifies tail behavior. |
| R4.7 | N/A | Field order is not required. |
| R5.1 | N/A | Reap terminal event is v1.0 scope. |
| R5.2 | PASS | Sync path remains out of scope. |
| R5.3 | N/A | CLI watch-events is v1.0 scope. |
| R5.4 | N/A | CLI watch object is v1.0 scope. |
| R5.5 | N/A | v1.1 does not write progress frontmatter. |
| R5.6 | PASS | R14 explicitly covers truncate/rotate tail behavior. |
| R6.1 | N/A | Claude monitor bridge is v1.0 scope. |
| R6.2 | PASS | R07 implements OS toast helper as SHOULD scope. |
| R6.3 | PASS | OpenCode native plugin is out of scope. |
| R6.4 | PASS | Codex CLI host integration is out of scope. |
| R6.5 | PASS | Dashboard work is intentionally v1.1 scope. |
| R7.1 | PASS | Final gate runs in current Windows/Node environment. |
| R7.2 | N/A | POSIX smoke is execution-level. |
| R7.3 | N/A | CLI `fs.watchFile` atomic rename test is v1.0 scope. |
| R7.4 | PASS | R07 supports OS toast smoke path. |
| R8.1 | PASS | Workflow constraints require atomic commits. |
| R8.2 | PASS | Workflow constraints ban push/amend/no-verify. |
| R8.3 | PASS | Workflow constraints cap file delta per commit. |
| R8.4 | PASS | Workflow constraints set `[T-PROG-XX]`. |
| R8.5 | PASS | Workflow constraints include deviation protocol. |
| R9.1 | PASS | Wave plan and dependency graph included. |
| R9.2 | PASS | Every R item has verification. |
| R9.3 | PASS | Every R item has a PRD source line. |
| R9.4 | PASS | Every R item has S/M estimate. |
| R9.5 | PASS | Risks are covered by scope boundary and redlines. |
| M2 | N/A | R11 is not in v1.1. |
| Scope split | PASS | Only R07/R14/R15/R17 are present. |
