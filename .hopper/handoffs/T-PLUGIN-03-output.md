# T-PLUGIN-03 — Strategy-as-developer Output (Tasks Library Loader)

## Summary
Implemented `loadTaskFrame(hopperDir, taskType)` to load .hopper/tasks/<task-type>.md frame content. Added `listTaskTypes` for `--task-types` command. Added `verifyFrameAntiPersona` static check (codex v2.0.3 audit F3 — anti-persona warning text in frames was rewritten to avoid containing literal banned phrases, so this grep verifier actually works now).

## Files touched
- `cli/src/tasks.js` (new, ~60 lines): frame loader, list, anti-persona verifier, prompt composer
- `tests/unit/tasks.test.js` (new, ~120 lines): 11 unit tests covering valid frame load, missing/empty frame errors, anti-persona positive + negative cases, list filtering, compose prompt

## Acceptance verification (5/5)
1. ✓ Loads .hopper/tasks/<type>.md content for valid task-type — verifier: `loadTaskFrame loads existing frame file` test PASSES
2. ✓ Throws helpful error on missing frame — verifier: `loadTaskFrame throws on missing frame with helpful error` test PASSES
3. ✓ Anti-persona verifier catches "you are a" / "act as" / "think like" / "as the <role>" patterns — verifier: 4 separate anti-persona rejection tests PASS
4. ✓ Anti-persona verifier accepts neutral task-shape frames — verifier: `verifyFrameAntiPersona accepts task-shape frame` + `verifyFrameAntiPersona allows neutral verbs` tests PASS
5. ✓ `composePrompt` joins frame + task spec with separator — verifier: `composePrompt joins frame + spec with separator` test PASSES

## Decisions / deviations from spec
- **Anti-persona patterns regex set**: covers "you are a", "act as", "think like", "as the (critic|builder|leader|reviewer|architect|engineer)", "pretend to be", "pretend you're/are", "impersonate". May need to extend if new role nouns appear in future frames.
- **No caching**: each `loadTaskFrame` re-reads the file. Per spec §3 #4 "no state across dispatches" — caching would be state. Frames are small markdown files; filesystem read is cheap enough.
- **`listTaskTypes` filters to `.md`**: ignores non-frame files in tasks/ dir (allows future README.md / index.md etc.).

## Open questions for Leader
- none

## Commit
(pending — batched with all Phase 1 tasks)

## Verdict
PASS — Tasks library loader + anti-persona verifier ready.

## Checks
- `node --test tests/unit/tasks.test.js` → 11/11 pass ✓
- E2E: `hopper-dispatch --task-types` against actual hopper-plugin returns 6 frames (spec-write, code-impl, code-review-adversarial, code-review-acceptance, sidecar-polish, spec-blindspot-hunt) ✓
- Anti-persona verifier run against all 6 existing .hopper/tasks/*.md frames → all pass (post-F3 rewrite) ✓

## Next recommendation
Within Phase 1 cursor: T-PLUGIN-04 router (uses both queue + tasks output). After Phase 1 → codex audit.
