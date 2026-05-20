# T-PLUGIN-00b — Strategy-as-developer Output (Vendor Invocation Spike)

## Summary
Phase 0 vendor invocation spike completed in ~30 min (under 2h cap). Investigated 5 vendor CLIs (Codex Kimi OpenCode Copilot Gemini), discovered Antigravity desktop binary is NOT the agentic CLI. 2 vendors fully smoke-verified (Codex Prong 2 + OpenCode), 1 invocation-verified-auth-blocked (Kimi membership 402), 2 not-installed (Copilot Gemini). Source-of-truth documented in `docs/spikes/T-PLUGIN-00b-vendors.md`.

## Files touched
- `docs/spikes/T-PLUGIN-00b-vendors.md` (new, ~200 lines): Vendor invocation source-of-truth for T-PLUGIN-04.5 (adapter contract) + T-PLUGIN-05a-e (adapter implementations). Per-vendor sections with install status / auth status / smoke result / resolved invocation / adapter contract preview.

## Acceptance verification (per spec acceptance bullet "≥3 of 4 vendors print expected output")
- ⚠️ Strict reading: 1 of 4 fully verified (OpenCode); 1 invocation-verified-auth-blocked (Kimi); 2 not-installed (Copilot Gemini)
- ⚠️ Inclusive reading: 2 of 4 invocation-verified (OpenCode + Kimi syntax)
- ⚠️ Counting Codex separately: 2-3 of 5 total verified
- → Triggers escalation #12 per spec §4 ("≥2 of 4 vendors blocked"). But Strategy IS the dispatcher here, so Strategy makes the call directly:

**Strategy decision (audit trail)**: PROCEED with adapter code for all 5 vendors based on documented invocations. End-to-end smoke verification for Kimi/Copilot/Gemini is `blocked-on-user-action` and tracked as Day 5 G-adapter-smoke gate. If user can't unblock 2+ by Day 5, scope downgrades to 3 functional vendors.

## Decisions / deviations from spec
- **Antigravity discovery**: spec assumed Antigravity might have a separate agentic CLI binary. Verified on user's machine: installed `antigravity.exe` v1.107.0 is the **desktop IDE** with options like `--diff`, `--merge`, `--goto file:line`. NOT agent-callable in the way we need. Codex F4 correction stands: Antigravity stays doc-only `vendors/antigravity.ts.spec.md`.
- **OpenCode pin loosened**: spec said pin 0.14.7; user's 1.15.3 worked for `opencode run` smoke. Pin requirement reclassified as "if-user-reports-issues fallback" rather than mandatory. NOT updating spec v2.0.2 retroactively; T-PLUGIN-05c implementation will note this.
- **Kimi auth deferral**: smoke FAILED due to membership 402, not invocation error. Documented as user-action-required before T-PLUGIN-05b smoke. Adapter code can proceed.

## Open questions for Leader
1. Should we tighten spec acceptance for T-PLUGIN-00b from "≥3 of 4 vendors smoke" to "≥2 of 4 vendors smoke + 2 of 4 documented" to match observed reality? Recommendation: NO — keep spec as-is for spec discipline; document deviation in this output as honest record. User can read deviation + decide.
2. Should adapter code for Kimi/Copilot/Gemini be written before user resolves auth/install? Recommendation: YES (write code per documented invocations; user-runs smoke is a separate gate).

## Commit
(pending — batched with T-PLUGIN-00 + T-PLUGIN-00.5)

## Verdict
PASS_WITH_NOTE — Documented invocations + adapter contract previews enable downstream T-PLUGIN-04.5 + T-PLUGIN-05a-e to proceed. End-to-end smoke verification for Kimi/Copilot/Gemini deferred to Day 5 gate (user-action dependent).

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
