# T-PLUGIN-00 — Strategy-as-developer Output (Host-Lifecycle Spike)

## Summary
Phase 0 host-lifecycle spike completed in ~1h (under 4h cap). All 3 prongs investigated; 2 fully verified (Prong 2 codex + Prong 3 standalone CLI), 1 scaffolded with user-verify pending (Prong 1 Claude Code plugin install). Source-of-truth resolved values written to `docs/spikes/T-PLUGIN-00-resolved.md`. Spec assumption about OpenCode pin (v0.14.7) is being re-evaluated based on user's working 1.15.3 — see T-00b doc.

## Files touched
- `cli/bin/hopper-dispatch` (new, ~80 lines): Node.js shebang script implementing --smoke, --status, --help, --version, and task-id dispatch stub. No harness logic; one arg = one action = one exit
- `cli/bin/hopper-dispatch.cmd` (new, 4 lines): Windows wrapper invoking node on the shebang script
- `package.json` (new, ~25 lines): Node project metadata with bin field, npm scripts, Apache-2.0 license
- `hosts/claude-code/.claude-plugin/plugin.json` (new, ~40 lines): Claude Code plugin manifest with 3 slash commands. **Tentative schema** — needs user verification of actual Claude Code schema
- `hosts/claude-code/README.md` (new, ~50 lines): host adapter README with install steps + smoke test instructions + "thin layer" positioning per spec §3 #4
- `docs/spikes/T-PLUGIN-00-resolved.md` (new, ~150 lines): resolved-values source-of-truth document

## Acceptance verification (4/5 — Prong 1 install is user-blocked)
1. ✓ Prong 1 manifest file exists at documented path — `hosts/claude-code/.claude-plugin/plugin.json` ✓
2. ⚠️ Prong 1 `/hopper:smoke` invocation in Claude Code — `blocked-on-user-manual` (Strategy-as-developer is running INSIDE Claude Code, cannot test plugin install on self)
3. ✓ Prong 2 `echo "..." | codex exec [...] "say HOPPER_PRONG2_OK"` returned `HOPPER_PRONG2_OK` in <30s — verifier: `codex exec -s read-only -c 'model_reasoning_effort="low"'`
4. ✓ Prong 3 `./cli/bin/hopper-dispatch T00-smoke` prints expected stub output — verifier: `node cli/bin/hopper-dispatch --smoke` exit 0
5. ✓ `docs/spikes/T-PLUGIN-00-resolved.md` exists with all 3 prong's documented values

## Decisions / deviations from spec
- **OpenCode pin re-evaluated**: spec v2.0.2 §6 T-PLUGIN-05c said "pin opencode@0.14.7 per known regression #3213". User's installed 1.15.3 worked fine for `opencode run` smoke. Hypothesis: #3213 affects TUI mode only, not headless `run` subcommand. T-PLUGIN-05c can drop the hard pin requirement; keep as soft fallback. **Strategy decision**: documented in T-00b doc; do NOT modify spec v2.0.2 retroactively (audit trail preserved); T-PLUGIN-05c implementation will note this.
- **TypeScript deferred to T-PLUGIN-01**: Phase 0 stub kept as plain Node JS for simplicity. T-PLUGIN-01 will introduce TypeScript + tsc build per spec.
- **Prong 1 user-blocked is acceptable per PING.md Step 6**: manual verification cases are explicitly allowed; task stays `in-progress` until user confirms or moves to alternative verification (e.g. asking user to install + report).

## Open questions for Leader (Strategy-as-developer asks Strategy-as-supervisor)
1. Should Strategy proceed with T-PLUGIN-01 dispatch even though Prong 1 install hasn't been verified by user yet? Recommended: YES, proceed — Prong 1 verification can happen any time before T-PLUGIN-07 (Claude Code slash command wiring); Phase 1 plumbing (queue parser, frame loader) doesn't depend on plugin install
2. Should Kimi membership renewal be flagged to user as a pre-T-PLUGIN-05b blocker? Recommended: YES, document in user-facing summary so they can renew during Phase 1 work in parallel

## Commit
`dc78836` — "feat: Phase 0 complete — T-PLUGIN-00 + T-PLUGIN-00b + T-PLUGIN-00.5"
(post-codex-audit corrections in subsequent commit)

## Verdict
**IN_PROGRESS — blocked-on-user-manual on Prong 1** (downgraded from PASS_WITH_NOTE per codex Phase 0 audit F2 finding 2026-05-20).

Per PING.md Step 6: when a prong needs manual verification, task stays `in-progress` until user confirms. Strategy-as-developer wrote the manifest (scaffold) and verified Prong 2 + Prong 3, but cannot test Prong 1 install on self (running INSIDE Claude Code). User must:
1. Install plugin via `~/.claude/plugins/hopper-plugin/.claude-plugin` symlink OR copy
2. Reload Claude Code
3. Invoke `/hopper:smoke` and confirm output matches `hopper standalone (CLI v0.1.0-demo)`
4. Report PASS or specific failure mode (e.g. "manifest schema rejected")

Phase 1 plumbing tasks (T-PLUGIN-02/03/04 queue parser / frame loader / vendor router) do NOT depend on Prong 1 install — those test against `.hopper/queue.md` + `.hopper/tasks/*.md` files which exist locally. T-PLUGIN-07 (Claude Code slash command wiring) IS the task that completes Prong 1 verification — both block on user install.

## Checks
- `node cli/bin/hopper-dispatch --smoke` → exit 0, expected output ✓
- `node cli/bin/hopper-dispatch T-smoke-demo` → exit 0, dispatch stub output ✓
- `echo "say HOPPER_PRONG2_OK in one word" | codex exec -s read-only -c 'model_reasoning_effort="low"'` → returned HOPPER_PRONG2_OK ✓
- `docs/spikes/T-PLUGIN-00-resolved.md` exists ✓
- Manifest JSON validates as valid JSON (`node -e "JSON.parse(require('fs').readFileSync('hosts/claude-code/.claude-plugin/plugin.json'))"`) — manual check during writing ✓ (formally re-runnable)
- No harness logic in `cli/bin/hopper-dispatch` (`grep -E 'retry|fallback|backoff|circuit.break|consensus|round.?robin' cli/bin/hopper-dispatch` returns empty) ✓

## Next recommendation
**Within MANIFEST Phase 0 cursor**: T-PLUGIN-00.5 (tasks library bootstrap, already in progress this turn) → T-PLUGIN-00b (vendor invocation spike, already complete) → Strategy invokes codex Phase 0 completion audit per goal-condition #2 → if PASS → T-PLUGIN-01.

**NOT recommended**: jumping to T-PLUGIN-01 before Phase 0 completion audit. NOT recommended: addressing Prong 1 install verification as blocker for Phase 1; it's an independent user-action that can resolve any time before T-PLUGIN-07.
