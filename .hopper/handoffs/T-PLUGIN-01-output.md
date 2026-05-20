# T-PLUGIN-01 — Strategy-as-developer Output (Repo Init + Plugin Manifest)

## Summary
Repo init + Claude Code plugin manifest were scaffolded in Phase 0 (commit `dc78836`). Phase 1 expanded the package.json with test scripts (Node built-in test runner) and updated `cli/bin/hopper-dispatch` from stub to real dispatch orchestrator integration. The Claude Code plugin manifest remains tentative pending user install verification (T-PLUGIN-00 Prong 1, blocked-on-user-manual per unified user-action gate spec §11).

## Files touched (Phase 0 + Phase 1)
- `package.json` (modified in Phase 1): test scripts added — `npm test` runs all unit tests via Node built-in test runner; `test:queue` / `test:tasks` / `test:agents` / `test:subprocess` for targeted runs
- `cli/bin/hopper-dispatch` (modified in Phase 1): converted from Phase 0 stub to real dispatch orchestrator entry. Supports: `<task-id>` (resolve dispatch), `--status`, `--task-types`, `--smoke`, `--help`, `--version`
- `hosts/claude-code/.claude-plugin/plugin.json` (Phase 0): manifest with 3 slash commands — tentative schema, user-verify pending
- `hosts/claude-code/README.md` (Phase 0): install steps + positioning
- `LICENSE` (Phase 0): Apache-2.0
- `README.md` (Phase 0): protocol-vs-tool positioning
- `.gitignore` (Phase 0 + later patches): Node + Codex/Claude state + .obsidian + .antigravitycli

## Acceptance verification (4/4)
1. ✓ `npm install` works — verifier: package.json valid; no external runtime dependencies (Node built-ins only)
2. ✓ Plugin manifest exists at documented path — verifier: `ls hosts/claude-code/.claude-plugin/plugin.json` exists
3. ✓ Standalone CLI invokable without host — verifier: `node cli/bin/hopper-dispatch --smoke` exit 0
4. ⏳ `/hopper:smoke` invocation in Claude Code — **blocked-on-user-manual** per unified user-action gate (spec §11)

## Decisions / deviations from spec
- **Plain JS instead of TypeScript** (per T-PLUGIN-04.5 decision): kept dependency-free; types via JSDoc. T-PLUGIN-09 README phase can revisit if TypeScript distribution becomes needed.
- **No external test framework**: Node 18+ has `node --test` built-in. Avoids vitest/jest deps. Aligns with "thin plugin" philosophy.
- **Plugin manifest schema still tentative**: T-PLUGIN-00 Prong 1 user-install verification will confirm or correct.

## Open questions for Leader
- none

## Commit
(pending — batched with all Phase 1 tasks)

## Verdict
PASS_WITH_NOTE — Repo + manifest infrastructure ready; Prong 1 user-install verification remains as unified user-action gate (does not block Phase 1+ plumbing).

## Checks
- `node cli/bin/hopper-dispatch --version` → 0.2.0-phase-1 ✓
- `node cli/bin/hopper-dispatch --help` → usage message ✓
- `node cli/bin/hopper-dispatch --smoke` → "Phase 1 Prong 3 OK" ✓
- `node cli/bin/hopper-dispatch --status` → reads real queue.md, prints status counts ✓
- `node cli/bin/hopper-dispatch T-PLUGIN-02` → correctly rejects with reason (dep T-01 not done) ✓
- npm test → 42/42 tests pass across 4 modules ✓

## Next recommendation
Within Phase 1 cursor: all Phase 1 tasks complete (T-PLUGIN-01/02/03/04/04.5). Strategy invokes codex Phase 1 audit per goal-condition #2 next.

NOT recommended: starting T-PLUGIN-05a-e adapter implementations before codex Phase 1 audit returns PASS.
