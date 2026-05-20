# T-PLUGIN-04 — Strategy-as-developer Output (AGENTS.md Parser + Vendor Router)

## Summary
Implemented `parseAgentsFile` / `parseAgentsContent` to extract agent bindings + task-type vendor preferences from .hopper/AGENTS.md. Added `resolveVendor(task, agentsData)` — a PURE FUNCTION per codex v2.0.3 F1: deterministic static lookup, no round-robin, no memoization across dispatches.

## Files touched
- `cli/src/agents.js` (new, ~150 lines): two-section markdown parser (Active Agent Instances + task-type preferences), agent binding extractor, preference table extractor, resolver with 4-step deterministic resolution order
- `tests/unit/agents.test.js` (new, ~100 lines): 7 unit tests including a 10-call determinism test verifying same input → same output (codex F1 anti-state-pollution)

## Acceptance verification (5/5)
1. ✓ Extracts agent bindings from `Active Agent Instances` table — verifier: `parseAgentsContent extracts agent bindings` test PASSES (4 agents from sample)
2. ✓ Extracts task-type preferences from preference table — verifier: `parseAgentsContent extracts task-type preferences` test PASSES
3. ✓ `resolveVendor` honors per-row Vendor column override — verifier: `resolveVendor uses per-row Vendor override` test PASSES
4. ✓ `resolveVendor` is deterministic (no state) — verifier: `resolveVendor is deterministic` test calls resolveVendor 10x with same input, asserts unique results count == 1
5. ✓ `resolveVendor` throws clear error when no resolution possible — verifier: `resolveVendor throws when no resolution available` test PASSES

## Decisions / deviations from spec
- **4-step resolution order**: (1) per-row Vendor override → (2) preferences table → (3) taskTypePref array on agent → (4) throw with helpful error message. Spec said "deterministic static lookup" — this is the explicit order.
- **Preferences table preference name resolution**: preferences map can point at nickname (e.g. "kimi-builder") OR direct vendor name (e.g. "kimi"). If nickname, resolved via agent binding; otherwise used as-is. Allows AGENTS.md table to use either form.
- **No retry-aware resolution**: even if previous dispatch to a vendor failed, `resolveVendor` returns the same vendor next time. No fallback chain. Per codex F1 — if user wants different vendor, edit queue.md row Vendor column.

## Open questions for Leader
- none

## Commit
(pending — batched with all Phase 1 tasks)

## Verdict
PASS — Router ready for dispatch orchestrator integration.

## Checks
- `node --test tests/unit/agents.test.js` → 7/7 pass ✓
- E2E: `hopper-dispatch --task-types` confirms 6 task-types match AGENTS.md preference table entries ✓
- Determinism: source code review confirms `resolveVendor` has no closure-captured state, no global cache, no Date/random/process.env reads ✓
- Codex F1 compliance: grep `retry|round.robin|backoff|fallback|circuit.break` in cli/src/agents.js → empty ✓

## Next recommendation
Within Phase 1 cursor: integration via `dispatch.js` orchestrator (already wired into bin/hopper-dispatch). After Phase 1 → codex audit per goal-condition #2.
