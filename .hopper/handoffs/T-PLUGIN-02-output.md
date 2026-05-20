# T-PLUGIN-02 — Strategy-as-developer Output (queue.md parser)

## Summary
Implemented v2-schema queue.md parser (`parseQueue` / `parseQueueContent`) with task-type column primary + role column backward-compat fallback (per USAGE-GUIDE §3.4). Added `findEligibleTask` for status + dependency validation. Added `summarizeQueue` for `--status` command.

## Files touched
- `cli/src/queue.js` (new, ~140 lines): markdown table parser, column resolver, row extractor, eligibility check, queue summary
- `tests/unit/queue.test.js` (new, ~120 lines): 12 unit tests covering v2 schema, v1 legacy fallback, mixed-column conflict resolution, dependency validation, eligible/ineligible cases

## Acceptance verification (4/4)
1. ✓ Parses .hopper/queue.md v2 schema (Task-type column primary) — verifier: `parseQueueContent extracts v2 schema task rows` test PASSES
2. ✓ Falls back to Role column for v1 lineage projects — verifier: `parseQueueContent falls back to Role column if Task-type absent` test PASSES
3. ✓ Task-type wins when both columns present — verifier: `parseQueueContent treats Task-type as canonical when both present` test PASSES
4. ✓ Dependency validation rejects unsatisfied deps — verifier: `findEligibleTask rejects when dep not done` test PASSES + E2E smoke `hopper-dispatch T-PLUGIN-02` correctly errors with "dependency T-PLUGIN-01 status is 'pending', expected 'done'"

## Decisions / deviations from spec
- **Ignores non-table content**: parser skips prose / activity log entries / headings. Only parses markdown table rows that match the column header pattern.
- **Per-row Vendor column optional**: spec mentioned optional `Vendor` column for queue.md row-level override; implemented in parser as `task.vendor` field (null when absent). Supports codex F1 deterministic routing.
- **Status defaults to 'pending' if invalid**: defensive — better than crashing on typo in queue.md.

## Open questions for Leader
- none

## Commit
(pending — batched with all Phase 1 tasks)

## Verdict
PASS — Parser ready for dispatch orchestrator + `--status` command.

## Checks
- `node --test tests/unit/queue.test.js` → 12/12 pass ✓
- E2E: `hopper-dispatch --status` against actual queue.md returns 19 total / 16 pending / 1 in-progress / 2 done ✓
- E2E: `hopper-dispatch T-PLUGIN-02` correctly rejects (dep T-01 not done) ✓
- E2E: `hopper-dispatch T-PLUGIN-00` correctly rejects (status in-progress not pending) ✓

## Next recommendation
Within Phase 1 cursor: T-PLUGIN-03 + T-PLUGIN-04 (parallel-eligible with this; same turn). After Phase 1 done → codex audit.
