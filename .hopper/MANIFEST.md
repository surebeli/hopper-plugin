# MANIFEST — hopper-plugin × llm-hopper Dogfood (self-bootstrap)

Anchor: `.hopper/MANIFEST.md::root`

This project IS hopper-plugin development. Its `.hopper/` directory is dogfooded using llm-hopper protocol (PING v5) to coordinate building hopper-plugin itself. Recursive dogfood — the protocol bootstraps its own reference implementation.

---

## Current Phase

**Phase**: Phase 0 spikes (T-00 + T-00b) + Phase 0.5 tasks library bootstrap (Day 1, 2026-05-20). v2.0 schema after user pivot to task-based + no-harness-core + 5-vendor.

**Status**: Repo initialized 2026-05-20. Spec migrated v1.1.1 → v2.0 (codex audit pending). queue.md migrated to v2 schema (Task-type column, 18 tasks). AGENTS.md migrated to vendor-binding (no role). Dispatch v2.0 supersedes earlier v1.1.1 same file. No tasks complete yet.

**Current cursor**: Leader pops dispatch v2.0 + completes §12 recipient gate + runs Phase 0 = three tasks: T-PLUGIN-00 (3-prong host-lifecycle), T-PLUGIN-00b (4-vendor invocation), T-PLUGIN-00.5 (6 task-type frames). Total 9h focused work; can run parallel.

**Next action**:

1. Leader pops `.hopper/handoffs/strategy-2026-05-20-T-PLUGIN-00-dispatch.md` v2.0 and completes §12 gate.
2. Ack per §8 (chat OR HOPPER-FEEDBACK entry).
3. Execute T-PLUGIN-00 (4h cap), T-PLUGIN-00b (2h cap, parallel-OK), T-PLUGIN-00.5 (3h, depends on both).
4. Writes 3 deliverables: `docs/spikes/T-PLUGIN-00-resolved.md`, `docs/spikes/T-PLUGIN-00b-vendors.md`, 6 `.hopper/tasks/*.md` frames.
5. Signal "Phase 0 complete, ready for codex pass" in final output.md Next.
6. Strategy auto-invokes /codex cross-audit (goal-condition #2 — phase completion) on combined Phase 0 outputs before T-PLUGIN-01 dispatch.

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
