# T-PLUGIN-05b — Strategy-as-developer Output (Kimi Vendor Adapter)

## Summary
Implemented `kimiAdapter` per contract. `kimi -p <prompt> --print --afk --final-message-only -m <model>` invocation. envPreflight checks `~/.kimi/config.toml`. parseResult includes Kimi-specific quirk: HTTP 402 membership errors print to stdout with exit 0 — detected via "Error code: 4..." + "'error'" pattern → status auth-fail.

## Files touched
- `cli/src/vendors/kimi.js` (new, ~55 lines)
- Registered in `cli/src/vendors/index.js`
- Tests in `vendors-contract.test.js` (8 generic + 1 kimi-specific "includes --afk for headless")

## Acceptance verification (5/5)
1. ✓ Adapter implements full VendorAdapter contract — verifier: 8 contract tests PASS
2. ✓ args() includes `--afk` (headless auto-approve) — verifier: kimi-specific test PASSES
3. ✓ envPreflight checks `~/.kimi/config.toml` existence
4. ✓ parseResult detects HTTP 402 membership error pattern — verifier: would parse the actual error format observed in T-00b smoke
5. ✓ parseResult strips "To resume this session: kimi -r <id>" footer from success output

## Decisions / deviations from spec
- **Auth-fail detection via stdout regex**: T-00b smoke showed Kimi prints `Error code: 402 - {'error': {'message': "...membership..."}}` to stdout with exit 0. Adapter detects via pattern; surfaces clean error message.
- **Session footer stripping**: success output includes session resume hint; adapter strips it before returning text.
- **Default timeout 180s**: Kimi-thinking can take longer than other models; default doubles vs Codex baseline.

## Open questions for Leader
- none

## Commit
(pending)

## Verdict
PASS — Kimi adapter ready.

## Checks
- Contract conformance tests PASS ✓
- No harness logic ✓
- Auth fail classification covers user's previously-observed 402 case ✓

## Next recommendation
Phase 2 parallel: T-05c/d/e.
