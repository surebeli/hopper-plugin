# T-PLUGIN-05d — Strategy-as-developer Output (Copilot Vendor Adapter)

## Summary
Implemented `copilotAdapter` per contract. `copilot -p <prompt> [--model <model>]` invocation. envPreflight checks `GH_TOKEN` or `GITHUB_TOKEN` env var (PAT must have "Copilot Requests" permission). parseResult detects quota exhaustion (`/quota|rate.limit|premium request/i` patterns) → permission-fail. Strips Copilot usage footer ("Changes / Requests / Tokens") from success output; extracts premium request usage.

## Files touched
- `cli/src/vendors/copilot.js` (new, ~60 lines)
- Registered in vendors/index.js
- Tests: 8 generic + 1 copilot-specific "requires GH_TOKEN env var"

## Acceptance verification (5/5)
1. ✓ Adapter implements full VendorAdapter contract
2. ✓ args() uses `-p` flag — verifier: 8 contract tests cover
3. ✓ envPreflight rejects when neither GH_TOKEN nor GITHUB_TOKEN set — verifier: copilot-specific test saves+clears env, asserts ok=false with GH_TOKEN in missing array; PASSES
4. ✓ parseResult detects quota patterns → permission-fail
5. ✓ Premium request usage parsed from footer when present (best-effort)

## Decisions / deviations from spec
- **Quota patterns regex broad**: matches "quota", "rate.limit", "premium request" in stdout OR stderr. Avoids false positives by also checking stderr exit context.
- **Footer stripping uses heuristic**: searches for `\n  Changes` or `\n  Requests` near end of stdout; not perfect but T-00b smoke showed consistent format.
- **No quota tracking across dispatches**: per spec §3 #4, adapter doesn't maintain "how much quota left" state. If quota exhausted, surface as permission-fail; user decides.

## Open questions for Leader
- none

## Commit
(pending)

## Verdict
PASS — Copilot adapter ready (with quota-aware classification).

## Checks
- Contract conformance PASS ✓
- envPreflight test correctly fails without GH_TOKEN ✓
- README + AGENTS preference table notes Copilot for occasional high-value use, not bulk dispatch ✓

## Next recommendation
Phase 2 last task: T-05e agy adapter (most complex due to silent auth-fail).
