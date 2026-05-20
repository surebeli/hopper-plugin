# T-PLUGIN-00b — Strategy-as-developer Output (Vendor Invocation Spike)

## Summary
Phase 0 vendor invocation spike completed in ~30 min (under 2h cap). Investigated 5 vendor CLIs (Codex Kimi OpenCode Copilot Gemini), discovered Antigravity desktop binary is NOT the agentic CLI. 2 vendors fully smoke-verified (Codex Prong 2 + OpenCode), 1 invocation-verified-auth-blocked (Kimi membership 402), 2 not-installed (Copilot Gemini). Source-of-truth documented in `docs/spikes/T-PLUGIN-00b-vendors.md`.

## Files touched
- `docs/spikes/T-PLUGIN-00b-vendors.md` (new, ~200 lines): Vendor invocation source-of-truth for T-PLUGIN-04.5 (adapter contract) + T-PLUGIN-05a-e (adapter implementations). Per-vendor sections with install status / auth status / smoke result / resolved invocation / adapter contract preview.

## Acceptance verification (final 2026-05-20T<later>, Path A resolved)

- ✅ Codex: Prong 2 prior verify (HOPPER_PRONG2_OK)
- ✅ Kimi: re-smoke after user restored membership (HOPPER_KIMI_OK)
- ✅ OpenCode: smoke (HOPPER_OPENCODE_OK via deepseek-flash)
- ✅ Copilot: smoke (HOPPER_COPILOT_OK, 0.33 premium request, 18.9k tokens in, 30 out, 8s)
- ✅ Gemini: smoke via direct npm prefix path (HOPPER_GEMINI_OK)
- ⚠️ Antigravity (agy): not installed; documented as post-essay per F4 correction

5 of 5 functional vendors smoke-verified. Spec acceptance exceeded.

## Decisions / deviations from spec
- **Antigravity discovery**: spec assumed Antigravity might have a separate agentic CLI binary. Verified on user's machine: installed `antigravity.exe` v1.107.0 is the **desktop IDE** with options like `--diff`, `--merge`, `--goto file:line`. NOT agent-callable in the way we need. Codex F4 correction stands: Antigravity stays doc-only `vendors/antigravity.ts.spec.md`.
- **OpenCode pin loosened**: spec said pin 0.14.7; user's 1.15.3 worked for `opencode run` smoke. Pin requirement reclassified as "if-user-reports-issues fallback" rather than mandatory. NOT updating spec v2.0.2 retroactively; T-PLUGIN-05c implementation will note this.
- **Kimi auth deferral**: smoke FAILED due to membership 402, not invocation error. Documented as user-action-required before T-PLUGIN-05b smoke. Adapter code can proceed.

## Open questions for Leader
1. Should we tighten spec acceptance for T-PLUGIN-00b from "≥3 of 4 vendors smoke" to "≥2 of 4 vendors smoke + 2 of 4 documented" to match observed reality? Recommendation: NO — keep spec as-is for spec discipline; document deviation in this output as honest record. User can read deviation + decide.
2. Should adapter code for Kimi/Copilot/Gemini be written before user resolves auth/install? Recommendation: YES (write code per documented invocations; user-runs smoke is a separate gate).

## Commit
`dc78836` (Phase 0 batch); status downgrade in subsequent codex-fix commit

## Verdict
**PASS** (upgraded from BLOCKED_ON_USER per Path A resolution 2026-05-20T<later>).

User chose Path A and unblocked all 4 remaining vendors. Re-smoke results:

| Vendor | Smoke result | Status |
|---|---|---|
| Codex | HOPPER_PRONG2_OK (Prong 2 prior verify) | ✅ |
| OpenCode | HOPPER_OPENCODE_OK (via deepseek-v4-flash) | ✅ |
| **Kimi** | **HOPPER_KIMI_OK** (membership restored; resumed session 754a6031) | ✅ NEW |
| **Copilot** | **HOPPER_COPILOT_OK** (0.33 premium request, 18.9k tokens in / 30 out, 8s) | ✅ NEW |
| **Gemini** | **HOPPER_GEMINI_OK** (via `gemini.cmd` at npm prefix path; bash PATH doesn't include npm prefix root, must use direct path or alias) | ✅ NEW |

5 of 5 functional vendors verified end-to-end. Spec v2.0.2 §6 acceptance ("≥3 of 4 vendors print expected output") now exceeded — 5/5.

**Antigravity status**: per user note "antigravity 需要访问 agy", the actual antigravity CLI binary should be `agy` (separate from the desktop IDE `antigravity.exe` already on the machine). `which agy` returns nothing → agy not installed on this machine. Codex F4 correction continues to stand: Antigravity stays as `cli/src/vendors/antigravity.ts.spec.md` documented-only, post-essay implementation when `agy` is installed + verified.

**5-vendor scope LOCKED**: Codex + Kimi + OpenCode + Copilot + Gemini all functional. Antigravity = documented post-essay. Phase 1 can proceed with full vendor adapter implementation plan.

**Gemini PATH note (resolved value for T-PLUGIN-05e adapter)**: gemini binary lives at `<npm-prefix>/gemini.cmd` (on this machine: `C:\Users\litianyi\nodejs\node-v22.22.2-win-x64\gemini.cmd`). Adapter must either (a) use full path resolved via `npm config get prefix`, or (b) require user to add npm prefix to PATH. Default approach in adapter: invoke via `gemini` and let user's shell PATH find it; document the PATH setup in README.

## Checks
- `which codex / kimi / opencode / copilot / gemini / antigravity` documented per vendor ✓
- `kimi --version` v1.41.0 ✓
- `opencode --version` v1.15.3 ✓
- `antigravity --version` v1.107.0 (desktop IDE, NOT agent CLI per options inspection) ✓
- OpenCode smoke `opencode run "say HOPPER_OPENCODE_OK..."` → returned `HOPPER_OPENCODE_OK` via deepseek-v4-flash ✓
- Kimi smoke `kimi -p "..." --print --afk --final-message-only` → 402 membership error; invocation syntax confirmed ⚠️
- Vendor-resolved doc structure consistent across all 5 vendor sections ✓
- No harness logic in adapter contract previews ✓

## Next recommendation
**Within MANIFEST Phase 0 cursor**: T-PLUGIN-00.5 (tasks library, already in progress this turn) → Strategy invokes codex Phase 0 completion audit → if PASS → T-PLUGIN-01.

**NOT recommended**: starting T-PLUGIN-05a-e before T-PLUGIN-04.5 (vendor adapter contract) lands. NOT recommended: requiring all 5 vendors auth-verified before T-PLUGIN-04 plumbing.
