# T-PLUGIN-10 — Strategy-as-developer Output (Critic Acceptance)

## Summary

Codex invoked as T-10 Critic. Independent acceptance review of the 5 hard criteria from spec §1 based on code + tests + .hopper/ artifacts (per user directive 2026-05-20). User-action gates noted as PENDING, not blocking. Critic ran focused evidence tests (83/83 pass; 2 Windows symlink skipped). Returned per-criterion verdicts + overall + top-3 concerns + top-3 strengths.

## Files touched

- `docs/release/PASS-RATIONALE.md` updated: over-claim language tightened (5 registered + 4 live-smoked instead of "all 5 functional"); added 2 new caveats (sidecar .txt + OpenCode ANTHROPIC_API_KEY env-var fallback) per Critic OVER-CLAIM CHECK
- `README.md` status section refreshed: same tightening + replaced "Install: pending T-09" with pointer to INSTALL-MATRIX.md + quick-start snippet
- `.hopper/queue.md` T-10 flipped to done with Critic verdict summary

## Acceptance verification (5/5 per Critic verdict)

1. **#1 file-state** — PASS_WITH_NOTE (sidecar .txt path inside .hopper/ but not .md)
2. **#2 cross-host portable** — PASS_WITH_NOTE (4/5 live-smoked, structural cross-host, prompt-enforced at host boundary)
3. **#3 no Agent SDK** — PASS_WITH_NOTE (zero deps in package.json, OpenCode provider env var disclosed)
4. **#4 no harness reaction core** — **PASS clean** (counter-test proven at runSubprocessOnce, executeDispatch, executeWithAdapter)
5. **#5 task-based** — PASS_WITH_NOTE (Task-type primary in code, role vocab retained as legacy)

**Overall**: PASS_WITH_NOTES. GO for essay material with framing constraints.

## Decisions / deviations from spec

- Critic Top-3 Concerns each got a remediation:
  1. Vendor proof drift → README + PASS-RATIONALE updated to "5 registered + 4 live-smoked; agy code-complete pending OAuth"
  2. Cross-host proof structural-not-live → already disclosed in scripts/cross-host-verify.sh header + now explicit in PASS-RATIONALE caveats
  3. README "Install: pending T-09" drift → replaced with INSTALL-MATRIX.md pointer + quick-start snippet

- Critic Top-3 Strengths preserved as essay-quotable framing:
  1. "No harness core" claim unusually well-tested with counter-based spawn tests
  2. Task-type routing not just documented but integrated end-to-end
  3. File-write safety stronger than typical demo (canonical validation + lstat + realpath + symlink rejection)

## Open questions for Leader

- None. Phase 4 substantively complete. Remaining work is user-action: Prong 1 + agy OAuth + (deferred) screencast.

## Commit

- `03b34255` — T-09 PASS materials
- (this commit) — Critic verdict + remediation of 3 Top Concerns

## Verdict

**PASS_WITH_NOTES — GO for essay material.** Strategy-as-developer phase of hopper-plugin demo is structurally complete. Essay can claim:

- "Code-and-test-backed thin router with **4 live-smoked vendors out of 5 registered** and structural cross-host equivalence across 4 host adapters."
- "9 adversarial codex audit cycles caught real issues at every phase; the discipline of per-phase audit + recheck worked."
- "Single-spawn invariant proven by counter-tests at 3 layers."

Essay should NOT claim:
- "All 5 vendors live-smoked" (agy pending OAuth)
- "Live 4-host demo proven" (structural only)
- "Roles are gone" (legacy vocabulary retained)

## Checks

- Codex ran 83/83 focused evidence tests (validation + execute-dispatch-e2e + subprocess spawn-count + output writer + queue + tasks + agents + real-fixtures) — all PASS, 2 Windows symlink skipped ✓
- All 3 Top Concerns from Critic addressed in same commit cycle ✓
- Critic flagged sidecar .txt + ANTHROPIC_API_KEY env-var nuances; both disclosed in PASS-RATIONALE caveats ✓

## Next recommendation

**Phase 4 close-out**: Strategy work is complete. Hand back to user for:
1. T-PLUGIN-00 Prong 1 (Claude Code plugin install + /hopper:smoke verify) — to be done during demo testing
2. T-PLUGIN-05e (agy interactive OAuth + post-OAuth smoke) — to be done during demo testing
3. T-PLUGIN-09 screencast — deferred TODO

Essay-material readiness: **YES**. PASS-RATIONALE.md + INSTALL-MATRIX.md + scripts/cross-host-verify.sh + the 197/206 test suite + the 9-cycle audit trail constitute the essay-grade evidence base. Framing constraints from this Critic verdict noted.
