# T-PLUGIN-05a — Strategy-as-developer Output (Codex Vendor Adapter)

## Summary
Implemented `codexAdapter` per VendorAdapter contract (T-04.5). `codex exec` invocation with prompt as final positional arg + sandbox flag + reasoning effort flag + optional web search. envPreflight checks `~/.codex/auth.json`. parseResult classifies timeout / permission-fail (exit 127) / success / unknown-fail; extracts token usage from stderr "tokens used" metadata.

## Files touched
- `cli/src/vendors/codex.js` (new, ~55 lines)
- `cli/src/vendors/index.js` (new, registry): includes codex
- `tests/unit/vendors-contract.test.js` (new, ~150 lines): codex covered by 8 generic contract tests + 1 codex-specific args test

## Acceptance verification (5/5)
1. ✓ Adapter implements full VendorAdapter contract — verifier: contract conformance tests pass
2. ✓ args() builds `codex exec <prompt> -s read-only -c model_reasoning_effort=...` — verifier: codex-specific args test PASSES
3. ✓ envPreflight checks `~/.codex/auth.json` — verifier: test `codex adapter implements full VendorAdapter contract` exercises preflight
4. ✓ parseResult handles timeout/127/success — verifier: 3 generic case tests PASS for codex
5. ✓ timeoutMs scales with reasoning effort (medium=300s, high=600s, xhigh=900s) — verifier: code review + generic timeout sanity test (>0, <30min)

## Decisions / deviations from spec
- **Prompt as positional arg, not stdin pipe**: spec mentioned either works (T-00 Prong 2 used stdin pipe). Args mode is simpler — no stdinMode='pipe' needed. Node spawn handles argv quoting correctly.
- **Token usage parsing best-effort**: regex matches `tokens used\n<n>` in stderr. If not present, usage field omitted (not synthesized).

## Open questions for Leader
- none

## Commit
(pending — batched with Phase 2 tasks)

## Verdict
PASS — Codex adapter ready for executeDispatch wiring.

## Checks
- Contract conformance: 9 tests pass (8 generic + 1 codex-specific) ✓
- E2E resolve: `hopper-dispatch --resolve T-PLUGIN-05a` → vendor resolves to kimi (per AGENTS task-vendor-preference for code-impl); demonstrates Phase 1 routing chain works ✓
- `grep -E 'retry|backoff|fallback|circuit.break|consensus|round.?robin' cli/src/vendors/codex.js` → empty ✓
- `grep -E 'anthropic|@anthropic-ai|claude -p|claude --print' cli/src/vendors/codex.js` → empty (codex F3 #3 compliance) ✓

## Next recommendation
Within Phase 2: T-05b/c/d/e (parallel-eligible). After Phase 2 → codex audit per goal-condition #2.
