# T-PLUGIN-05e — Strategy-as-developer Output (Antigravity agy Adapter)

## Summary
Implemented `agyAdapter` per contract with full codex v2.0.3 audit F2/F3 quirk handling. `agy -p <prompt> --dangerously-skip-permissions --log-file <unique-tmp>` invocation. envPreflight is permissive (returns ok=true with soft warning) because the OAuth cred path is TBD; parseResult is the actual gate — inspects `--log-file` content for failure pattern classification:
- "You are not logged into Antigravity" / "Failed to get OAuth token" / "error getting token source" → auth-fail
- "deadline exceeded" / "context cancelled" → timeout
- "permission" / "access denied" / "forbidden" → permission-fail
- exit 0 + non-empty stdout → success
- exit 0 + empty stdout + no error pattern → unknown-fail (the silent-fail case per codex F2)

Per codex F2: unique `--log-file` per dispatch via `makeUniqueLogPath` (no stale-log false positives).

## Files touched
- `cli/src/vendors/agy.js` (new, ~115 lines — biggest adapter due to quirks)
- Registered in vendors/index.js
- Tests in `vendors-contract.test.js`: 8 generic + 1 "prepareLog method" + 1 "args includes --dangerously-skip-permissions"
- **Separate test suite**: `tests/unit/vendors-agy-quirks.test.js` (~120 lines, 12 tests) covering EVERY failure classification path

## Acceptance verification (8/8 — agy has more acceptance criteria due to quirks)
1. ✓ Adapter implements full VendorAdapter contract (8 generic tests pass)
2. ✓ `prepareLog` method exists + generates unique paths (codex F2 fix verified)
3. ✓ args includes `--dangerously-skip-permissions` for headless mode
4. ✓ args includes `--log-file <path>` when opts.logFile provided; omits when not
5. ✓ parseResult detects "not logged into Antigravity" → auth-fail with helpful error
6. ✓ parseResult detects "deadline exceeded" → timeout
7. ✓ parseResult detects "permission" patterns → permission-fail
8. ✓ Empty stdout + no error pattern in log → unknown-fail (silent-fail case captured)

## Decisions / deviations from spec
- **envPreflight permissive**: per codex F2, OAuth cred path is unverified. Adapter does NOT block on missing `~/.gemini/oauth_creds.json` (path not confirmed). Instead, preflight returns ok=true with soft warning; parseResult inspects log file to detect auth issues post-spawn.
- **Timeout 360s (6min)**: agy default print-timeout is 5min; adapter sets hard cap 6min for safety margin. Subprocess wrapper will kill via Windows taskkill /T /F or Unix process-group SIGKILL (per codex F3).
- **Multi-pattern detection order matters**: timeout check first (hard signal), then log-based auth/timeout/permission/unknown. Exit 0 + empty stdout + no pattern = "unknown silent fail" — surfaces log excerpt for user diagnosis.

## Open questions for Leader / User
1. **Adapter envPreflight cred path verification**: when user completes interactive `agy` OAuth login, please inspect `~/.gemini/` for the actual auth artifact file. If a specific file name is consistently created (e.g. `oauth_creds.json` or `credentials.json`), update envPreflight to check that path specifically. Currently it checks 4 candidates + soft warns.
2. **Real agy smoke after OAuth**: smoke verification is BLOCKED on user-action (OAuth interactive). After OAuth, expected: `hopper-dispatch T-smoke-agy` (or similar smoke task) returns HOPPER_AGY_OK with status='success'. If smoke fails post-OAuth, escalate.

## Commit
(pending)

## Verdict
PASS_WITH_NOTE — Adapter code complete with full quirk handling per codex F2/F3. Live smoke gated on user OAuth (unified user-action gate spec §11). Adapter is structurally sound; field verification pending.

## Checks
- Contract conformance: 10 tests pass (8 generic + 2 agy-specific) ✓
- Quirks test suite: 12/12 pass ✓
- Codex F2 unique log file: verified via prepareLog determinism test ✓
- Codex F3 subprocess kill: inherited from shared runSubprocessOnce wrapper ✓
- No harness logic: `grep -E 'retry|backoff|fallback|circuit.break|consensus|round.?robin' cli/src/vendors/agy.js` empty ✓
- No Antigravity-related SDK references: `grep -E 'antigravity-sdk|@google/antigravity' cli/` empty ✓

## Next recommendation
Within Phase 2 cursor: all 5 adapters done + dispatch.js wired with executeDispatch. After Phase 2 → codex Phase 2 audit per goal-condition #2.

Per unified user-action gate: T-PLUGIN-05e smoke remains gated on user OAuth. T-PLUGIN-00 Prong 1 (Claude Code plugin install) similarly gated. Phase 3 (output writer + slash command wiring) proceeds in parallel without waiting on either user-action.
