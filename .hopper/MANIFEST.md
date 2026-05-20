# MANIFEST — hopper-plugin × llm-hopper Dogfood (self-bootstrap)

Anchor: `.hopper/MANIFEST.md::root`

This project IS hopper-plugin development. Its `.hopper/` directory is dogfooded using llm-hopper protocol (PING v5) to coordinate building hopper-plugin itself. Recursive dogfood — the protocol bootstraps its own reference implementation.

---

## Current Phase

**Phase**: Phase 1 complete (2026-05-20). Ready for Phase 2 (vendor adapter implementations T-PLUGIN-05a-e).

**Status**: Spec v2.0.3 final after Gemini→agy swap + 6 codex audit cycles. Phase 0: 3 tasks (T-00 in-progress per user-action gate; T-00b done with 4/5 vendors verified + agy pending OAuth; T-00.5 done). Phase 1: 5 tasks all done (T-01/02/03/04/04.5). 52 tests passing (42 unit + 7 integration + 3 spawn-count).

**Current cursor**: All Phase 1 plumbing wired:
- VendorAdapter contract + runSubprocessOnce shared wrapper (T-04.5)
- queue.md v2 parser (T-02)
- tasks library loader + anti-persona verifier (T-03)
- AGENTS parser + deterministic vendor router (T-04)
- bin/hopper-dispatch orchestrator (T-01)

Phase 2 (T-PLUGIN-05a-e) ready to start. Adapter implementations: codex, kimi, opencode, copilot, agy. Agy smoke gated on user OAuth per unified user-action gate (spec §11). T-PLUGIN-00 Prong 1 user-install also gated separately.

**Next action**:

1. ✅ Phase 0 done (T-00/T-00b/T-00.5 outputs at .hopper/handoffs/)
2. ✅ Phase 1 done (T-01/02/03/04/04.5 outputs at .hopper/handoffs/)
3. ✅ Codex Phase 1 audit PASS_WITH_CHANGES → 4 findings fixed (F1 spawn-count test, F2 vendor name normalization, F3 MANIFEST cursor, F4 integration tests)
4. ⏭️ Phase 2 ready: T-PLUGIN-05a (Codex adapter), T-05b (Kimi), T-05c (OpenCode), T-05d (Copilot), T-05e (agy with silent-auth-fail handling)
5. ⏳ Pending user-action: T-PLUGIN-00 Prong 1 (Claude Code plugin install + /hopper:smoke verify); T-PLUGIN-05e (agy interactive OAuth login)

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
