# T-PLUGIN-08b — Strategy-as-developer Output (OpenCode Host Adapter, Tier C #2)

## Summary

Tier C #2 host adapter built as a bash wrapper parallel to T-08a, invoking `opencode run` instead of `codex exec`. Cross-host parity through byte-equivalent validation logic (regex, '..' rejection, flag whitelist, symlink resolver, no-soft-orchestration prompt clause). Phase 4 partial audit PASS_WITH_CHANGES (no P0) confirms cross-host architecture (spec §1 #2) functional with both Tier C hosts.

## Files touched

- `hosts/opencode/bin/hopper-opencode` (new, ~110 lines): bash wrapper parallel to T-08a
- `hosts/opencode/bin/hopper-opencode.cmd` (new, 4 lines): Windows delegation wrapper
- `hosts/opencode/README.md` (new): install + prerequisites + cross-host equivalence with 4-route verification snippet + troubleshooting
- `tests/unit/opencode-host.test.js` (new, ~170 lines): 16 tests (13 static + 3 dry-run) including cross-host parity test asserting byte-equivalent validation patterns with Tier C #1

## Acceptance verification (4/4)

1. ✓ Wrapper validates task-id with identical regex + '..' check as Tier B + Tier C #1 — verifier: cross-host parity test reads BOTH Codex CLI + OpenCode wrappers and asserts both contain canonical pattern literal
2. ✓ Wrapper symlink-safe SCRIPT_DIR resolution — verifier: resolve_script_dir matches Codex CLI wrapper byte-for-byte
3. ✓ Single-spawn invariant maintained — verifier: one `exec opencode` line + no active retry constructs
4. ✓ Cross-host parity test passes: same validation logic in both Tier C wrappers

## Decisions / deviations from spec

- **Implementation as bash wrapper (not opencode plugin module)**: spec §6 says "plugin module" — OpenCode v1.15.x does not have a slash-command plugin equivalent to Claude Code. The wrapper pattern is the practical equivalent.
- **OPENCODE_MODEL env var override**: spec did not specify model selection; added because OpenCode supports multiple providers. If unset, uses opencode's configured default.

## Open questions for Leader

- Phase 4 audit P1 finding: validation logic is duplicated across wrappers + Tier A + output.js (different regexes). Recommended fix landed in same commit cycle: centralized in `cli/src/validation.js`. Wrappers still keep inline regex for fast-fail before subprocess invocation.

## Commit

- `8fc09b6` — T-08b initial (Tier C #2 wrapper + tests)
- (validation centralization landed as part of Phase 4 audit fix commit)

## Verdict

PASS — codex Phase 4 partial audit verdict PASS_WITH_CHANGES, T-09 GREEN-LIGHT yes. T-10 GREEN-LIGHT no (depends on T-09 demo evidence + user-action gates).

## Checks

- 16 wrapper tests pass + cross-host parity assertion ✓
- 197/206 total tests pass (9 skipped on Windows by design) ✓
- Both Tier C wrappers byte-equivalent on validation lines ✓
- `grep -E 'retry|fallback|circuit.break' hosts/opencode/bin/hopper-opencode` matches only compliance prose ✓
- Cross-host claim mechanically true through hopper-dispatch (deterministic vendor resolution from .hopper/AGENTS.md) ✓

## Next recommendation

Phase 4 has both Tier C adapters functional + Tier A standalone CLI + Tier B Claude Code. T-09 (README + screencast) can start, addressing Phase 4 audit P1s as part of release prep:
1. Refresh root README.md (currently pre-development)
2. Update MANIFEST.md cursor to Phase 4
3. Add Phase 4 cost rows to COST-LOG.md
4. Install matrix in README showing 4-host install patterns + which symlink target each uses
5. 30-60s screencast: same task-id dispatched via all 4 hosts → same vendor → same output

T-10 (Critic acceptance) blocks on T-09 + the still-open user-action gates (T-00 Prong 1, T-05e agy OAuth).
