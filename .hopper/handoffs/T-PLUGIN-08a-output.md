# T-PLUGIN-08a — Strategy-as-developer Output (Codex CLI Host Adapter, Tier C #1)

## Summary

Tier C #1 host adapter built as a thin bash wrapper that invokes `codex exec` once with a prompt instructing codex to call `hopper-dispatch` via its built-in shell tool. Single-spawn invariant preserved across the 3-layer chain (wrapper → codex → hopper-dispatch). Cross-host parity with Tier B Claude Code achieved through shared task-id regex, '..' rejection, and flag whitelist. Codex mini-audit FIX_AND_RECHECK → PROCEED_TO_T08B after 2 P1 + 1 P2 fixes.

## Files touched

- `hosts/codex-cli/bin/hopper-codex` (new, ~110 lines): bash wrapper with arg validation, symlink-safe SCRIPT_DIR resolution, codex exec invocation
- `hosts/codex-cli/bin/hopper-codex.cmd` (new, 4 lines): Windows delegation wrapper
- `hosts/codex-cli/README.md` (new): install + prerequisites + cross-host equivalence + troubleshooting
- `tests/unit/codex-cli-host.test.js` (new, ~180 lines): 18 tests (14 static + 4 dry-run)

## Acceptance verification (4/4)

1. ✓ Bash wrapper validates task-id with `^[A-Za-z][A-Za-z0-9._-]{0,99}$` + explicit '..' rejection — verifier: 4 static + 1 dry-run test
2. ✓ Wrapper resolves cli/bin/hopper-dispatch via HOPPER_PLUGIN_ROOT or wrapper-relative + symlink-safe — verifier: resolve_script_dir test + dry-run missing-binary test
3. ✓ Wrapper invokes `codex exec` exactly once with single-spawn-compliant prompt — verifier: single-exec line count + no-active-retry assertion
4. ✓ Prompt forbids soft-orchestration (no diagnose / propose fixes / suggest next steps) — verifier: forbidden-soft-orchestration regex assertion

## Decisions / deviations from spec

- **Implementation as bash wrapper (not codex CLI plugin module)**: spec §6 says "custom prompt wrapper" — Codex CLI does not have a plugin system equivalent to Claude Code, so the integration is a wrapper script that uses `codex exec`. This is the practical interpretation of "custom prompt wrapper."
- **Symlink resolution via portable shell**: did not use `readlink -f` (BSD readlink lacks `-f` flag). Wrote a portable `resolve_script_dir` helper instead.
- **Sandbox default `workspace-write`**: codex sandbox default is too restrictive for shell tool use; the prompt requires `workspace-write` to let codex spawn hopper-dispatch. User can override via `CODEX_SANDBOX` env var.

## Open questions for Leader

- None blocking. Cross-host parity question (Tier B dispatch.md says "suggest concrete next steps" on failure while Tier C forbids it) noted as intentional divergence per codex audit: Claude Code is a richer host where the agent helps diagnose; Codex CLI host is intentionally thinner.

## Commit

- `aa994e2` — initial T-08a (Tier C #1 wrapper + tests)
- `78a7842` — apply T-08a mini-audit findings (P1 F1 '..' rejection, P1 F2 symlink-safe SCRIPT_DIR, P2 F4 no-soft-orchestration clause)

## Verdict

PASS — codex T-08a mini-audit RECHECK verdict PROCEED_TO_T08B with all 3 P1s FIXED, no new findings.

## Checks

- Static artifact tests: 14 pass (shebang, .cmd delegation, README sections, parity regex, '..' check, symlink resolver, single-spawn, no-orchestration, prompt §11, etc.) ✓
- Dry-run tests: 4 (3 skipped on Windows by design, 1 runs everywhere) ✓
- `grep -E 'retry|fallback|circuit.break|consensus' hosts/codex-cli/bin/hopper-codex` matches only the prompt prose ("Do NOT retry") which the audit explicitly identified as compliance language, not retry logic ✓
- `grep -E 'anthropic|@anthropic-ai|claude -p|claude --print|claude_agent_sdk' hosts/codex-cli/` → empty (spec §3 #3) ✓

## Next recommendation

Proceed to T-08b (OpenCode host adapter, Tier C #2) using the same wrapper pattern. T-08b should reuse the validation logic byte-equivalently for cross-host parity.
