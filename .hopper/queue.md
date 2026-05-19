# Hopper Queue — hopper-plugin

Anchor: `.hopper/queue.md::root`

- Schema version: 1 (see `.hopper/PING.md`)
- 任务详情: `.hopper/handoffs/leader-tasklist.md`
- Status values: `pending` / `in-progress` / `done` / `failed` / `removed`
- Push privilege: Leader only (see PING.md §Push protocol)
- Pop protocol: see `.hopper/PING.md`

---

## Tasks

| ID | Role | Status | Depends | Priority | Brief |
|----|------|--------|---------|----------|-------|
| T-PLUGIN-00 | builder | pending | | high | Phase 0 host-lifecycle spike: 3 prongs (Claude Code plugin / Codex CLI noninteractive / standalone CLI). 4h hard cap. Outputs `docs/spikes/T-PLUGIN-00-resolved.md` with locked inputs for T-PLUGIN-01..10. |
| T-PLUGIN-01 | builder | pending | T-PLUGIN-00 | normal | Repo init + plugin manifest (uses T-00-resolved values verbatim) |
| T-PLUGIN-02 | builder | pending | T-PLUGIN-01 | normal | Core queue.md parser |
| T-PLUGIN-03 | builder | pending | T-PLUGIN-02 | normal | AGENTS.md parser + role-to-command resolver |
| T-PLUGIN-04 | builder | pending | T-PLUGIN-03 | normal | leader-tasklist.md spec extractor |
| T-PLUGIN-05 | builder | pending | T-PLUGIN-00, T-PLUGIN-04 | normal | Subprocess wrapper for Codex CLI (uses T-00-resolved invocation contract) |
| T-PLUGIN-06 | builder | pending | T-PLUGIN-05 | normal | Output.md writer + queue/cost prompts |
| T-PLUGIN-07 | builder | pending | T-PLUGIN-06 | normal | Slash command wiring (Claude Code, Tier B) |
| T-PLUGIN-08 | builder | pending | T-PLUGIN-00, T-PLUGIN-07 | normal | Cross-host adapters (Codex CLI Tier C if spike permits; OpenCode doc only) |
| T-PLUGIN-09 | builder-ui | pending | T-PLUGIN-08 | normal | README + screencast |
| T-PLUGIN-10 | critic | pending | T-PLUGIN-09 | high | Independent end-to-end verification of all 3 hard acceptance criteria |

---

## Activity log

> 每次 pop / done / failed by popping session 追加一行。Format per PING.md §Step 3 and §Step 7.

- queue initialized at 2026-05-20T02:42:00+08:00 by strategy-primary (claude-opus-4-7) — 11 tasks pre-queued per `docs/plans/2026-05-19-hopper-plugin-demo-spec.md` v1.1.1 (post codex cross-audit PASS_WITH_CHANGES)
