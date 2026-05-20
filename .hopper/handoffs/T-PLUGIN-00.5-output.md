# T-PLUGIN-00.5 — Strategy-as-developer Output (Tasks Library Bootstrap)

## Summary
Tasks library bootstrap completed in ~30 min. 6 task-type frame files written at `.hopper/tasks/` covering the initial library defined in spec v2.0.2 §3 #5: spec-write / code-impl / code-review-adversarial / code-review-acceptance / sidecar-polish / spec-blindspot-hunt. Each frame strictly follows the schema from spec §3 #5 (input shape / output shape / acceptance type / boundary / vendor preference / anti-persona note). NO persona instructions in any frame.

## Files touched
- `.hopper/tasks/spec-write.md` (new, ~60 lines): spec-writing task frame
- `.hopper/tasks/code-impl.md` (new, ~70 lines): implementation task frame
- `.hopper/tasks/code-review-adversarial.md` (new, ~60 lines): adversarial review task frame
- `.hopper/tasks/code-review-acceptance.md` (new, ~60 lines): acceptance review task frame
- `.hopper/tasks/sidecar-polish.md` (new, ~65 lines): polish review with mode declaration
- `.hopper/tasks/spec-blindspot-hunt.md` (new, ~65 lines): blindspot/spike audit task frame

## Acceptance verification (4/4)
1. ✓ 6 files exist in `.hopper/tasks/` — verifier: `ls .hopper/tasks/*.md | wc -l` returns 6
2. ✓ Cross-referenced from queue.md Task-type column values — all 6 task-type names appear in queue.md
3. ✓ Structurally consistent — each frame has identical top-level section structure (Purpose / Input shape / Output shape / Acceptance type / Boundary / Vendor preference / Anti-persona note)
4. ✓ No persona instructions — verifier: `grep -iE 'you are a|act as|think like|as the (critic|builder|leader|reviewer)' .hopper/tasks/*.md` returns ZERO matches (anti-persona test from spec §3 #5)

## Decisions / deviations from spec
- **Frame schema interpretation**: spec said each frame includes "Input shape / Output shape / Acceptance type / Boundary / Vendor preference / Anti-persona note". I added implicit sections like "Examples in hopper-plugin demo" (for spec-blindspot-hunt) and "Sidecar handoff prompt convention" (for sidecar-polish) where the task-type benefits from concrete reference points. Not deviation from spec; additive content.
- **Adversarial vs acceptance review handling**: I marked code-review-adversarial's default vendor as "handled out-of-band by Strategy invoking /codex" rather than a queue-dispatched vendor. This reflects the actual cross-audit pattern from goal-directive 2026-05-20 (codex on new proposals + phase completion is OOB, not queue-routed). For future projects where Critic is queue-dispatched, the frame is still usable; default just notes the OOB pattern.

## Open questions for Leader
1. Should additional task-types be added to initial library (e.g. `cost-data-reorg` for COST-LOG-restructuring tasks per myWriteAssistant Round 2 P0.2)? Recommendation: defer to v0.6 unification; initial 6 cover Phase 1+ adapter dev needs.
2. Should the anti-persona test be a CI/lint check beyond the manual grep? Recommendation: defer to T-PLUGIN-10 critic verification.

## Commit
(pending — batched with T-PLUGIN-00 + T-PLUGIN-00b)

## Verdict
PASS — All 6 frames present, anti-persona test passes, schema consistent. Tasks library is ready for T-PLUGIN-03 (loader) to consume.

## Checks
- `ls .hopper/tasks/*.md` returns 6 files ✓
- `grep -iE 'you are a|act as|think like|as the (critic|builder|leader|reviewer)' .hopper/tasks/*.md` returns empty ✓
- Each frame has Purpose / Input shape / Output shape / Acceptance type / Boundary / Vendor preference / Anti-persona note sections ✓
- All 6 task-type names match queue.md Task-type column values (`grep -oE 'spec-write|code-impl|code-review-adversarial|code-review-acceptance|sidecar-polish|spec-blindspot-hunt' .hopper/queue.md` returns all 6) ✓

## Next recommendation
**Within MANIFEST Phase 0 cursor**: Strategy invokes codex Phase 0 completion audit per goal-condition #2 on combined Phase 0 outputs (T-PLUGIN-00-resolved.md + T-PLUGIN-00b-vendors.md + 6 .hopper/tasks/*.md frames). If PASS → T-PLUGIN-01 dispatch (could be self-dispatch since Strategy-as-developer continues).

**NOT recommended**: starting T-PLUGIN-01 without codex audit on combined Phase 0 outputs.
