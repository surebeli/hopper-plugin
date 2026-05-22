---
plan: background-progress-notification-v1.2-later
source_prd: docs/specs/background-progress-notification-prd-trd.md
prd_version: 0.4
scope: v1.2-later
status: ready-for-review
created: 2026-05-22
revision_items_count: 6
acceptance_criteria_count: 4
wave_count: 4
---

# Background Progress and Completion Notification PLAN-v1.2

## Objective

Plan the LATER lane for richer vendor output parsing and host/plugin parity after v1.0 state/terminal events and v1.1 UI/notification surfaces are stable.

Important M2 decision: v1.2 does not introduce a Codex app-server provider. Codex v1.2 progress uses the same stream-parser path as other vendors. Codex app-server provider work is deferred to v1.3.

## Scope Boundary

In scope:

- R08 pipe+tee runner stdio migration.
- R09 generic stream-parser.
- R10 provider capability metadata.
- R11 Codex app-server provider deferral guard for v1.3.
- R12 single-spawn invariant reconciliation for pipe+tee and future provider work.
- R13 OpenCode native plugin progress parity.

Out of scope:

- v1.0 core state and terminal writers, except as consumed by this plan.
- v1.1 OS notify and dashboard UI, except compatibility tests.
- Codex app-server provider implementation.
- Dispatch-time app-server probing.
- Runtime provider switching.
- Automatic retry or alternate-provider switching.
- Changes to `.hopper/queue.md` or `.hopper/AGENTS.md`.

## Locked Truths

1. Runner still owns exactly one vendor process in the generic path.
2. Pipe+tee must preserve stdout/stderr stream identity for `parseResult`.
3. Stream-parser failure must not affect final job status.
4. Generic vendors get coarse progress only.
5. Capability metadata describes progress support; it must not trigger runtime alternate-provider switching.
6. R11 is a deferral guard, not app-server implementation.
7. OpenCode native plugin remains OpenCode-only unless a separate dispatcher-routing design is approved.

## Wave Plan

| Wave | Items | Goal | Dependencies |
|---|---|---|---|
| 1 | R08 | Safe pipe+tee runner capture | v1.0 terminal writer |
| 2 | R09, R10 | Stream parser and metadata | R08 |
| 3 | R11, R12 | App-server deferral and invariant docs/tests | R09-R10 |
| 4 | R13 | OpenCode native plugin progress parity | v1.0 schema |

Dependency graph:

```text
v1.0 -> R08 -> R09 -> R10 -> R12
R10 -> R11
v1.0 -> R13
```

## Revision Items

### R08 - Replace fd redirect with safe pipe+tee

Source: PRD v0.4 §6.4 + §6.5

Estimate: L

Files:

- `cli/bin/hopper-runner`
- `tests/integration/runner-single-spawn.test.js`
- `tests/unit/runner-pipe.test.js` (new)

Implement:

- Use `stdio: ['ignore', 'pipe', 'pipe']` in the progress-capable runner path.
- Tee stdout/stderr to raw log write streams.
- Pause source stream when `write()` returns false and resume on `drain`.
- Wait for child `close` and raw-log stream `finish` before final parse.
- Preserve process-tree kill behavior.
- Preserve stdout/stderr stream tags into final parse inputs.

Verification:

- High-volume output does not deadlock.
- Runner memory remains bounded.
- stdout/stderr tags survive.
- Existing generic single-spawn test still passes.

### R09 - Add generic stream-parser

Source: PRD v0.4 §6.4 + §6.5

Estimate: L

Files:

- `cli/src/progress-parser.js` (new)
- `tests/unit/progress-parser.test.js` (new)
- `cli/bin/hopper-runner`

Implement:

- Coarse phase events only:
  - `starting`
  - `running`
  - terminal phases from final status
- Strip ANSI safely.
- Bound memory with ring/tail buffers.
- Catch parser exceptions and emit non-terminal parser-error progress only if safe.
- Parser failure must not affect final runner status.

Verification:

- Parser handles chunk boundaries.
- Parser handles ANSI.
- Parser exceptions do not fail the task.
- Long chunks do not grow memory unbounded.

### R10 - Add provider capability metadata

Source: PRD v0.4 §6.4 capability field

Estimate: M

Files:

- `cli/src/types.js`
- `cli/src/vendors/*.js`
- `tests/unit/vendors-contract.test.js`

Implement:

- Add metadata fields:
  - `progressProvider`
  - `progressCapability`
- v1.2 values:
  - `stream-parser`
  - `coarse-phase`
  - `terminal-only` where needed
- Do not add `native-app-server` as an executable v1.2 provider.

Verification:

- Every adapter declares a valid progress capability.
- Invalid capability fails unit tests.
- No provider metadata causes runtime provider switching.

### R11 - Defer Codex app-server provider to v1.3

Source: PRD v0.4 §6.4 native-app-server

Estimate: S

Files:

- `docs/specs/background-progress-notification-v1.2-later-PLAN.md`
- optional future ADR placeholder under `docs/specs/` if N1 reviewer requests it

Implement:

- v1.2 explicitly does not implement Codex app-server provider.
- Codex v1.2 progress uses stream-parser.
- App-server provider is deferred to v1.3.
- v1.3 must choose one design before implementation:
  - dispatch-time capability probe before any vendor work starts, with no switching after dispatch begins; or
  - no app-server provider.
- No runtime app-server-to-stream-parser switching text is allowed in v1.2 tasks.

Verification:

- Static grep: no task says to switch providers after dispatch begins.
- Static grep: no R11 implementation files are created for app-server provider in v1.2.
- N1 reviewer confirms M2 option b is applied.

### R12 - Reconcile single-spawn invariant for pipe+tee and future providers

Source: PRD v0.4 §6.4 + spec §3 #4

Estimate: M

Files:

- `tests/integration/runner-single-spawn.test.js`
- `docs/release/PASS-RATIONALE.md`
- `docs/specs/background-progress-notification-v1.2-later-PLAN.md`

Implement:

- Keep generic runner path at exactly one vendor `spawn()`.
- Update tests for pipe+tee without weakening single-spawn assertions.
- Document that future app-server provider requires a separate invariant note before implementation.

Verification:

- Generic single-spawn tests pass.
- Docs do not claim app-server provider exists in v1.2.
- No retry or alternate-provider switching is introduced.

### R13 - Add OpenCode native plugin progress parity

Source: PRD v0.4 §6.7 OpenCode native plugin row

Estimate: M

Files:

- `hosts/opencode/plugins/hopper-async.ts`
- `hosts/opencode/plugins/README.md`
- `tests/unit/opencode-plugin-static.test.js`

Implement:

- Seed progress frontmatter fields when native plugin writes initial `output.md`.
- On `session.idle` / `session.error`, append one terminal progress event.
- Set `terminal_event_emitted: true`.
- Do not add heartbeat rows.
- Keep plugin clearly marked OpenCode-only.

Verification:

- Static test confirms progress write path.
- Static test confirms terminal dedup check.
- Static test confirms no heartbeat rows.
- README states heterogeneous vendor jobs must use wrapper/dispatcher path.

## Acceptance Criteria Matrix

| AC | Requirement | v1.2 revisions | Verification |
|---|---|---|---|
| AC-07 | Pipe/tee path does not deadlock under high output volume. | R08 | high-output integration |
| AC-14 | Codex `parseResult` still extracts stderr tokens after pipe+tee migration. | R08, R12 | vendor parse test |
| AC-15 | >=10 MB output keeps runner RSS bounded; `progress.log` rotation remains compatible. | R08, R09 | high-output test |
| AC-17 | OpenCode native plugin writes one terminal row on `session.idle` / `session.error`; no heartbeat rows. | R13 | opencode plugin static test |

Deferred AC:

- AC-05 is explicitly deferred to v1.3 by M2 option b. v1.2 only records the decision gate in R11.

## Redline Checklist

- [ ] No runtime provider switching.
- [ ] No automatic retry or alternate-provider switching.
- [ ] No Codex app-server provider implementation in v1.2.
- [ ] Generic runner path still has exactly one vendor `spawn()`.
- [ ] stdout/stderr identity is preserved into `parseResult`.
- [ ] Parser failure cannot change final task status.
- [ ] No hidden reasoning capture.
- [ ] OpenCode native plugin remains OpenCode-only.
- [ ] No changes to `.hopper/queue.md` or `.hopper/AGENTS.md`.

## Executor Routing

Suggested split:

- Agent A: R08 pipe+tee.
- Agent B: R09-R10 parser and metadata.
- Agent C: R11-R12 invariant and deferral docs/tests.
- Agent D: R13 OpenCode native plugin parity.

Merge order:

1. R08
2. R09-R10
3. R11-R12
4. R13

## Final Verification Gate

```powershell
npm test
node --test tests/integration/runner-single-spawn.test.js
node --test tests/unit/vendors-contract.test.js
node --test tests/unit/opencode-plugin-static.test.js
git diff --check -- docs/specs/background-progress-notification-v1.2-later-PLAN.md
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
| R1.1 | N/A | v1.2 is LATER scope, not v1.0 MUST. |
| R1.2 | PASS | Scope boundary excludes v1.0/v1.1 work and app-server implementation. |
| R1.3 | PASS | This file is the LATER placeholder/plan. |
| R1.4 | PASS | Only R08-R13 are present. |
| R2.1 | PASS | AC-07/AC-14/AC-15/AC-17 map to R08/R09/R12/R13; AC-05 is deferred by M2. |
| R2.2 | PASS | Every R item has verification. |
| R2.3 | PASS | Unit/integration/static checks are distinguished. |
| R2.4 | N/A | AC-03 is v1.0 scope. |
| R3.1 | PASS | R12 preserves generic single-spawn invariant. |
| R3.2 | PASS | No retry or runtime provider switching is allowed. |
| R3.3 | N/A | Frontmatter schema is v1.0 scope. |
| R3.4 | PASS | Final gate keeps unit and single-spawn tests. |
| R3.5 | PASS | No `cli/src/dispatch.js::executeDispatch` changes. |
| R3.6 | PASS | No `.hopper/queue.md` or `.hopper/AGENTS.md` edits. |
| R4.1 | N/A | Progress path is defined in v1.0. |
| R4.2 | N/A | JSONL schema is defined in v1.0. |
| R4.3 | N/A | Frontmatter fields are defined in v1.0. |
| R4.4 | PASS | R13 uses the v1.0 terminal-event dual track for OpenCode native plugin. |
| R4.5 | N/A | Atomic write strategy is v1.0/plugin implementation detail. |
| R4.6 | N/A | Rotation is v1.0/v1.1 validation scope. |
| R4.7 | N/A | Field order is not required. |
| R5.1 | N/A | Reap terminal event is v1.0 scope. |
| R5.2 | PASS | Sync path remains out of scope. |
| R5.3 | N/A | CLI watch-events is v1.0 scope. |
| R5.4 | N/A | CLI watch object is v1.0 scope. |
| R5.5 | PASS | R09 parser cannot affect final status and should not spam frontmatter. |
| R5.6 | N/A | Tail truncate/rotate is v1.1 dashboard scope. |
| R6.1 | N/A | Claude monitor bridge is v1.0 scope. |
| R6.2 | N/A | OS toast is v1.1 scope. |
| R6.3 | PASS | OpenCode native plugin work is explicitly v1.2 scope. |
| R6.4 | PASS | Codex CLI host remains out of scope. |
| R6.5 | N/A | Dashboard is v1.1 scope. |
| R7.1 | PASS | Final gate runs in current Windows/Node environment. |
| R7.2 | N/A | POSIX smoke is execution-level. |
| R7.3 | N/A | CLI atomic rename watch test is v1.0 scope. |
| R7.4 | N/A | OS toast is v1.1 scope. |
| R8.1 | PASS | Workflow constraints require atomic commits. |
| R8.2 | PASS | Workflow constraints ban push/amend/no-verify. |
| R8.3 | PASS | Workflow constraints cap file delta per commit. |
| R8.4 | PASS | Workflow constraints set `[T-PROG-XX]`. |
| R8.5 | PASS | Workflow constraints include deviation protocol. |
| R9.1 | PASS | Wave plan and dependency graph included. |
| R9.2 | PASS | Every R item has verification. |
| R9.3 | PASS | Every R item has a PRD source line. |
| R9.4 | PASS | Every R item has S/M/L estimate. |
| R9.5 | PASS | Risks are covered by scope boundary and redlines. |
| M2 | PASS | Option b chosen: app-server provider deferred to v1.3. |
| Scope split | PASS | Only R08-R13 are present. |
