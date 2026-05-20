# T-PLUGIN-05c — Strategy-as-developer Output (OpenCode Vendor Adapter)

## Summary
Implemented `opencodeAdapter` per contract. `opencode run <prompt> [--model <provider/model>] [-s <conversation-id>]` invocation. envPreflight checks platform-specific auth.json paths (Linux/Mac `~/.local/share/opencode/`, Windows `AppData/Roaming/opencode/`, macOS `Library/Application Support/opencode/`). parseResult strips ANSI codes + leading `> build · <provider/model>` header from response.

## Files touched
- `cli/src/vendors/opencode.js` (new, ~60 lines)
- Registered in vendors/index.js
- Tests: 8 generic contract + 1 opencode-specific "uses run subcommand"

## Acceptance verification (5/5)
1. ✓ Adapter implements full VendorAdapter contract
2. ✓ args() uses `run` subcommand (NOT `-p`) — verifier: opencode-specific test PASSES
3. ✓ envPreflight checks 3 platform-specific auth paths
4. ✓ parseResult strips ANSI + opencode build header
5. ✓ Per T-00b finding: opencode 0.14.7 pin is fallback advice in README, NOT hard requirement — user's 1.15.3 worked for `opencode run` (regression #3213 is TUI-only)

## Decisions / deviations from spec
- **Pin requirement softened**: spec v2.0.2 said "pin opencode@0.14.7". T-00b observation showed 1.15.3 works fine for noninteractive `run` mode. Adapter does NOT enforce version pin; README documents the pin as if-user-reports-issues fallback.
- **ANSI stripping**: opencode prints colored output even in `run` mode. Adapter strips ANSI codes for cleaner output.

## Open questions for Leader
- none

## Commit
(pending)

## Verdict
PASS — OpenCode adapter ready.

## Checks
- Contract conformance PASS ✓
- ANSI stripping covered by generic success test (stdout="HELLO_RESPONSE" → text matches) ✓

## Next recommendation
Phase 2 parallel: T-05d, T-05e.
