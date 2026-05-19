# MANIFEST — hopper-plugin × llm-hopper Dogfood (self-bootstrap)

Anchor: `.hopper/MANIFEST.md::root`

This project IS hopper-plugin development. Its `.hopper/` directory is dogfooded using llm-hopper protocol (PING v5) to coordinate building hopper-plugin itself. Recursive dogfood — the protocol bootstraps its own reference implementation.

---

## Current Phase

**Phase**: Phase 0 host-lifecycle spike (Day 1 morning, 2026-05-20)

**Status**: Repo initialized 2026-05-20. T-PLUGIN-00 dispatched per `.hopper/handoffs/strategy-2026-05-20-T-PLUGIN-00-dispatch.md`. No tasks complete yet.

**Current cursor**: Leader pops T-PLUGIN-00 from queue.md and runs the 3-prong host-lifecycle spike (Claude Code plugin registration / Codex CLI noninteractive invocation / standalone CLI baseline). Hard cap 4 hours. If any of 3 fails → escalate to Strategy before proceeding.

**Next action**:

1. Leader pops `.hopper/handoffs/strategy-2026-05-20-T-PLUGIN-00-dispatch.md` and completes §12 Recipient pre-execution gate per llm-hopper template discipline (commit `20c2df5`).
2. After §12 ack, Leader pops T-PLUGIN-00 from queue, runs the 3 prongs.
3. Writes `docs/spikes/T-PLUGIN-00-resolved.md` documenting actual values (manifest schema/path/pkg-mgr/codex flags/etc.) for T-PLUGIN-01..10 to reference.
4. If pass: per goal-condition #2 (phase completion), Strategy auto-invokes `/codex` cross-audit on the spike result before T-PLUGIN-01 dispatch.
5. If fail or >4h: escalate via `leader-ping-strategy-<dated>-T00-fail.md`.

**Escalation contract**: Inherits all 8 triggers from llm-hopper dogfood + 2 P1 dispatch additions + 1 NEW spike-specific trigger:
- #11 T-PLUGIN-00 prong failure or 4h time-cap → STOP, escalate. Possible outcomes: downgrade cross-host claim further (Claude Code-only); extend timeline to 6-7 days; abandon plugin demo and remove §8 from essay v3.

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
| 2026-05-20 | Repo initialized; .hopper/ skeleton populated; T-PLUGIN-00 spike queued per strategy-2026-05-20 dispatch; cross-audit protocol active per goal directive (codex on new proposals + phase completion) | Strategy Advisor (claude-opus-4-7) |
