# hopper-plugin

> Reference implementation of [llm-hopper](https://github.com/surebeli/llm-hopper) protocol as a thin plugin layer. Demo-stage; see `docs/plans/2026-05-19-hopper-plugin-demo-spec.md` in the llm-hopper repo for the full spec.

**Status**: pre-development. Phase 0 spike (T-PLUGIN-00) pending dispatch as of 2026-05-20.

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
cli/                      Standalone CLI: hopper-dispatch <task-id> (cross-host BASELINE)
hosts/
├── claude-code/          Claude Code plugin wrapper (FULL)
├── codex-cli/            Codex CLI host adapter (MINIMAL if Day-1 spike permits)
└── opencode/             OpenCode adapter (post-essay doc only)
```

## Install

Pending T-PLUGIN-09 (README + screencast task). Check back after 2026-05-25.

## License

Apache-2.0. See `LICENSE`.

## Related

- Protocol spec: https://github.com/surebeli/llm-hopper (PING.md + USAGE-GUIDE.md)
- Demo design spec: https://github.com/surebeli/llm-hopper/blob/main/docs/plans/2026-05-19-hopper-plugin-demo-spec.md
- Essay (pending): publishes 2026-06-15 → 2026-06-29 window
