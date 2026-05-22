# Background Progress Notification v1-must Wave4 OUTPUT

Date: 2026-05-22
Scope: R16 Claude Code monitor bridge + R18 verification/redline gate.

## Summary

R16 adds the Claude Code plugin monitor bridge at plugin-root
`monitors/monitors.json`. The monitor runs `hopper-dispatch --watch-events` and
lets Claude Code deliver hopper terminal event JSONL lines to the interactive
session. R18 adds timeout integration coverage plus static redline gates.

## Acceptance Verification

| AC | Result | Evidence |
|---|---|---|
| AC-01 | PASS verified | `tests/integration/background-e2e.test.js` asserts background dispatch writes `output.md`, `output.log`, and `progress.log`. |
| AC-03 | PASS verified | `tests/integration/runner-single-spawn.test.js` success terminal test asserts exactly one terminal progress event. |
| AC-04 | PASS verified | `tests/integration/runner-single-spawn.test.js` failure and timeout terminal tests assert exactly one terminal event with correct status/phase. |
| AC-06 | PASS covered | Runner terminal events are vendor-neutral; fake adapter/codex shim exercises coarse terminal progress independent of Codex app-server. |
| AC-11 | PASS verified | `tests/unit/background.test.js` covers `reapStaleJobs` orphan terminal event idempotency. |
| AC-12 | PASS verified | `tests/unit/progress-watch.test.js` covers two concurrent `--watch-events` subscribers receiving terminal JSONL. |
| AC-13 | PASS verified | `tests/unit/progress-redline.test.js` asserts sync path files remain progress-free; prior sync regression tests remain green. |

## Redline Gate

- PASS: no `commands/*.md` changes in R16.
- PASS: Claude Code monitor is the only v1.0 native host wake bridge.
- PASS: `--watch-events` uses `fs.watchFile` and watches `*-output.md`, not `*-progress.log`.
- PASS: sync dispatch path remains progress-free.
- PASS: runner timeout path still uses `killProcessTree()` and now has explicit timeout terminal-event coverage.

## Reviewer Notes

- N-w3.1 acknowledged: strict `terminal_event_emitted === true` watch gate remains accepted for v1.0; partial-write orphan permissive fallback is deferred.
- N-w3.2 deferred: `readProgressEvents` still reads current `progress.log` only; rotated `.1` read can be handled in v1.1/v1.2.
- N-w3.3 acknowledged: 500 ms scan plus per-file `watchFile` polling is accepted for v1.0 scale.
- N-w3.4 documented: `--once` is first-event semantics, not drain-all semantics.

## Decisions And Deviations

- R16 path correction: packaging spike showed Claude Code expects plugin components at plugin root, so the monitor is `monitors/monitors.json`, not `.claude-plugin/monitors/monitors.json`.
- R18 `HOPPER_TEST_ONLY_TIMEOUT_MS` test-only timeout hook exists only to force a short runner timeout in integration tests; production behavior still uses adapter `timeoutMs()`.
