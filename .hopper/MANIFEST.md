# MANIFEST — hopper-plugin × llm-hopper Dogfood (self-bootstrap)

Anchor: `.hopper/MANIFEST.md::root`

This project IS hopper-plugin development. Its `.hopper/` directory is dogfooded using llm-hopper protocol (PING v5) to coordinate building hopper-plugin itself. Recursive dogfood — the protocol bootstraps its own reference implementation.

---

## Current Phase

**Phase**: Phase 4 partial complete (T-08a + T-08b done; T-09 + T-10 remaining). Phase 4 partial audit verdict PASS_WITH_CHANGES — T-09 GREEN-LIGHT; T-10 gated on T-09 + open user-action gates.

**Status**: Spec v2.0.3 final. Phase 0 (3 tasks). Phase 1 (5 tasks done). Phase 2 (5 tasks done). Phase 3 (2 tasks done). Phase 4 (2 of 4 done: T-08a Codex CLI host + T-08b OpenCode host; T-09 README/screencast + T-10 Critic acceptance pending). **197/206 tests passing** (9 Windows skips). Centralized task-id validation in `cli/src/validation.js` per Phase 4 audit P1.

**Current cursor**: Phase 3 deliverables landed:
- T-06 output.md writer (cli/src/output.js, ~250L) — codex mini-audit FIX_AND_RECHECK → PROCEED_TO_T07 (4 P1 findings fixed: format fidelity, lossy long outputs, task.id path safety, markdown injection)
- T-07 Tier B slash commands (4 commands/*.md files + .claude-plugin/plugin.json at repo root)
- Plugin install topology: symlink repo root → ~/.claude/plugins/hopper

Phase 4 (T-PLUGIN-08a Codex CLI host + T-PLUGIN-08b OpenCode host + T-PLUGIN-09 README/screencast + T-PLUGIN-10 Critic) gated on Phase 3 final audit clearing REWORK findings.

**Next action**:

1. ✅ Phase 0 done (T-00/T-00b/T-00.5 outputs at .hopper/handoffs/)
2. ✅ Phase 1 done (T-01/02/03/04/04.5 outputs at .hopper/handoffs/)
3. ✅ Phase 2 done (T-05a/b/c/d/e outputs at .hopper/handoffs/); codex Phase 2 audit PASS_WITH_CHANGES → 3 P1 findings fixed (envPreflight false-negatives, agy stderr handling, E2E spawn-count test)
4. ✅ Phase 3 done (T-06 + T-07 outputs); codex T-06 mini-audit FIX_AND_RECHECK → PROCEED_TO_T07; codex Phase 3 final audit REWORK → 6 findings (1 P0 + 3 P1 + 2 P2) all FIXED → recheck PASS_WITH_CHANGES with Phase 4 GREEN-LIGHT
5. ✅ Phase 4 partial: T-08a + T-08b done (both Tier C wrappers functional, exceeds spec ≥1 requirement). Phase 4 partial audit PASS_WITH_CHANGES, no P0, T-09 GREEN-LIGHT yes
6. ⏭️ Remaining Phase 4: T-PLUGIN-09 (README + 30-60s screencast showing 4-host dispatch equivalence) + T-PLUGIN-10 (Critic end-to-end acceptance of 5 hard criteria)
7. ⏳ Pending user-action gates (block T-10 final acceptance, not T-09 prep): T-PLUGIN-00 Prong 1 (Claude Code plugin install + /hopper:smoke); T-PLUGIN-05e (agy interactive OAuth)

**Escalation contract**: 8 carry-over from myWriteAssistant + 3 P1 + 6 spike-specific (Phase 0 v2.0):
- #9 T-PLUGIN-00 prong fail → ping
- #10 4h time-cap → STOP + progress digest
- #11 spike reveals spec inaccuracy → ping
- #12 T-PLUGIN-00b ≥2 of 4 vendors blocked → ping for scope downgrade
- #13 Antigravity OAuth proves possible headless → ping to upgrade adapter spec
- #14 T-PLUGIN-00.5 task-type boundary confusion → ping for boundary clarification

**Recently completed**: None (repo init only).

---

## Source of truth conventions

- **Phase cursor**: this file (`.hopper/MANIFEST.md`)
- **Role binding**: `.hopper/AGENTS.md`
- **Task spec**: `.hopper/handoffs/leader-tasklist.md`
- **Task status**: `.hopper/queue.md`
- **PING protocol**: `.hopper/PING.md` (v5 from llm-hopper main, frozen through 2026-11-15)
- **Per-handoff output**: `.hopper/handoffs/<task-id>-output.md`
- **Cost log**: `.hopper/COST-LOG.md`

## Cross-repo references

- Protocol home: `F:\workspace\ai\llm-hopper` (sibling repo, same disk)
- Demo spec: `F:\workspace\ai\llm-hopper\docs\plans\2026-05-19-hopper-plugin-demo-spec.md` (v1.1.1)
- Essay outline: `F:\workspace\ai\llm-hopper\docs\research\essay-v3-outline.md`
- Dispatch templates: `F:\workspace\ai\llm-hopper\.hopper\templates\dispatch-*.md`
- Usage guide: `F:\workspace\ai\llm-hopper\.hopper\USAGE-GUIDE.md`

## CLI bootstrap (at project root, NOT in this file)

- `AGENTS.md` (Codex CLI bootstrap) — created 2026-05-20
- `CLAUDE.md` — pending (Claude Code installation step)
- `GEMINI.md` — pending (if Gemini CLI used)

---

## 修改记录

| 日期 | Cursor 变化 | 由 |
|------|------------|---|
| 2026-05-20 | Repo initialized; .hopper/ skeleton populated; T-PLUGIN-00 spike queued per strategy-2026-05-20 dispatch v1.1.1; cross-audit protocol active per goal directive | Strategy Advisor (claude-opus-4-7) |
| 2026-05-20 | v2.0 migration: queue → v2 schema (Task-type col, 18 tasks); AGENTS.md → vendor binding; dispatch v2.0 supersedes v1.1.1 same-day; Phase 0 expanded to 3 tasks (T-00 + T-00b + T-00.5); per user goal directive (task-based, no-harness-core, 5-vendor) | Strategy Advisor (claude-opus-4-7) |
| 2026-05-20 | Phase 2 complete (T-05a/b/c/d/e); codex audit PASS_WITH_CHANGES; 3 P1 fixes (F1 envPreflight broadening across 4 adapters, F2 agy stderr+missing-log handling, F3 E2E spawn-count test). 117 tests passing. | Strategy Advisor (claude-opus-4-7) |
| 2026-05-20 | Phase 3 complete (T-06 output writer + T-07 Tier B slash wiring); codex mini-audit checkpoint after T-06 (FIX_AND_RECHECK → PROCEED_TO_T07, 4 P1 fixes); final Phase 3 audit REWORK → 6 findings (1 P0 + 3 P1 + 2 P2) ALL FIXED in commit 2b76c61 (plugin root hoisted to repo root, arg validation in slash commands, symlink-safe writes, MANIFEST cursor refresh, anti-persona phrasing, version drift); recheck PASS_WITH_CHANGES Phase 4 GREEN-LIGHT. 161/163 tests passing. | Strategy Advisor (claude-opus-4-7) |
| 2026-05-20 | Phase 4 partial (T-08a Codex CLI host + T-08b OpenCode host); T-08a mini-audit FIX_AND_RECHECK → PROCEED_TO_T08B (3 P1 fixes: '..' rejection, symlink-safe SCRIPT_DIR, no-soft-orchestration prompt clause); Phase 4 partial audit PASS_WITH_CHANGES with 4 P1 + 2 P2 findings, addressed: validation centralized in `cli/src/validation.js`, dispatcher CLI now validates task-id + flags at entry, T-08a/b output.md handoffs written, root README refreshed, MANIFEST cursor advanced. T-09 + T-10 remain. 197/206 tests passing. | Strategy Advisor (claude-opus-4-7) |
