# hopper-plugin

> Reference implementation of [llm-hopper](https://github.com/surebeli/llm-hopper) protocol as a thin plugin layer. Demo-stage; see `docs/plans/2026-05-19-hopper-plugin-demo-spec.md` in the llm-hopper repo for the full spec.

**Status (2026-05-20)**: Phase 4 functional. Tier A (standalone CLI) + Tier B (Claude Code plugin, 4 slash commands) + Tier C #1 (Codex CLI wrapper) + Tier C #2 (OpenCode wrapper) all wired. 5 vendor adapters (codex, kimi, opencode, copilot, agy). 197/206 tests pass. T-09 (README + screencast) + T-10 (Critic acceptance) next. User-action gates open: T-00 Prong 1 (Claude Code plugin install verification) + T-05e (agy interactive OAuth).

**Protocol-vs-tool positioning**: hopper-plugin is a CONVENIENCE LAYER for the llm-hopper protocol, NOT a runtime. Remove the plugin and the same `.hopper/` directory remains operable via manual CLI sessions.

## What this is

A thin CLI + host adapters that automate the manual dispatch step in llm-hopper protocol. Without the plugin you open a CLI session and paste a task spec; with the plugin you type `/hopper:dispatch T07` from inside Claude Code (or any future host adapter) and the plugin handles subprocess spawning + output capture.

State remains in plain markdown under `.hopper/` (git-tracked, hand-editable). Plugin owns convenience; protocol owns truth.

## What this is NOT

- NOT a multi-agent orchestrator (see [claude-octopus](https://github.com/nyldn/claude-octopus) for that style)
- NOT a tmux/Zellij multiplexer
- NOT a replacement for the file-based protocol — works in addition to it
- NOT polished — this is a demo built to validate an essay's claim

## Architecture (per spec §3 #2 Tier model)

```
hopper-plugin/                  ← repo root = plugin install root
├── .claude-plugin/             ← Claude Code plugin manifest (Tier B)
│   └── plugin.json
├── commands/                   ← Claude Code slash command prompt templates (Tier B)
│   ├── dispatch.md
│   ├── status.md
│   ├── smoke.md
│   └── vendors.md
├── cli/
│   ├── bin/
│   │   └── hopper-dispatch     ← Tier A standalone CLI (host-agnostic)
│   └── src/                    ← dispatcher core + vendor adapters
├── hosts/
│   ├── claude-code/README.md   ← Tier B documentation
│   ├── codex-cli/bin/hopper-codex   ← Tier C #1 wrapper
│   └── opencode/bin/hopper-opencode ← Tier C #2 wrapper
├── tests/                      ← unit + integration tests (197/206 passing)
├── docs/                       ← spec, spikes, audit trail
└── .hopper/                    ← THIS repo's own dogfood protocol state
```

Each host route resolves to the same `cli/bin/hopper-dispatch`. Vendor selection comes from `.hopper/AGENTS.md`, not the host. Same task-id → same vendor → same output across all 4 hosts (cross-host equivalence claim per spec §1 #2).

## Install

Pending T-PLUGIN-09 (README + screencast task). Check back after 2026-05-25.

## License

Apache-2.0. See `LICENSE`.

## Related

- Protocol spec: https://github.com/surebeli/llm-hopper (PING.md + USAGE-GUIDE.md)
- Demo design spec: https://github.com/surebeli/llm-hopper/blob/main/docs/plans/2026-05-19-hopper-plugin-demo-spec.md
- Essay (pending): publishes 2026-06-15 → 2026-06-29 window
