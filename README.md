# hopper-plugin

> Reference implementation of [llm-hopper](https://github.com/surebeli/llm-hopper) protocol as a thin plugin layer. Demo-stage; see `docs/plans/2026-05-19-hopper-plugin-demo-spec.md` in the llm-hopper repo for the full spec.

**Status (2026-05-20)**: Phase 4 complete. T-PLUGIN-10 Critic verdict PASS_WITH_NOTES; demo cleared for essay material with framing constraints noted below.

- **Hosts (4)**: Tier A standalone CLI + Tier B Claude Code (4 slash commands) + Tier C #1 Codex CLI wrapper + Tier C #2 OpenCode wrapper. Cross-host equivalence verified structurally; live 4-host demo is a user-action exercise.
- **Async dispatch (spec v2.1.0 §14, added 2026-05-21)**: `--background` opt-in keeps caller session responsive for long-running tasks. Native-preferred paths: Claude Code via Bash run_in_background + Monitor; OpenCode via bundled plugin + `prompt_async`. Codex CLI / Kimi / Copilot / Agy use the `hopper-runner` detached fallback. State in `output.md` frontmatter.
- **Vendors (5 registered)**: codex, kimi, opencode, copilot, agy. **4 live-smoke-verified**; agy code-complete with live OAuth-gated smoke pending (T-PLUGIN-05e). Spec required ≥3 live-smoked; demo exceeds with 4.
- **PASS materials**: see `docs/release/PASS-RATIONALE.md` (5 hard criteria self-assessment) + `docs/release/INSTALL-MATRIX.md` (install patterns + Phase 6a self-diagnostics) + `scripts/cross-host-verify.sh` (structural equivalence proof — all PASS).
- **Self-diagnostics (Phase 6a)**: `hopper-dispatch --check` shows install + auth status per vendor (binary on PATH? auth configured?); `hopper-dispatch --capabilities <vendor>` shows what each adapter accepts (`--model` / `--reasoning` / features). Zero subprocess spawned — pure PATH walk + adapter static metadata. See INSTALL-MATRIX.md §Self-diagnostics.
- **Test suite**: 270/285 passing (15 Windows skips by design). **12 codex audit cycles** cleared (8 phase + T-10 Critic + final strict + flags audit + Phase 5 audit).
- **Open user-action gates (do not block code/test-based verdict; required for live release)**: T-PLUGIN-00 Prong 1 (Claude Code plugin install + `/hopper:smoke`), T-PLUGIN-05e (agy interactive OAuth + post-OAuth smoke).
- **Deferred**: T-PLUGIN-09 screencast — defer per user directive 2026-05-20.

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
├── tests/                      ← unit + integration tests (270/285 passing)
├── docs/                       ← spec, spikes, audit trail
└── .hopper/                    ← THIS repo's own dogfood protocol state
```

Each host route resolves to the same `cli/bin/hopper-dispatch`. Vendor selection comes from `.hopper/AGENTS.md`, not the host. Same task-id → same vendor → same output across all 4 hosts (cross-host equivalence claim per spec §1 #2).

## Install

See `docs/release/INSTALL-MATRIX.md` for the full per-host install patterns + symlink targets + verification steps.

Quick start (Tier A standalone CLI):

```bash
git clone https://github.com/surebeli/hopper-plugin
cd hopper-plugin
node cli/bin/hopper-dispatch --smoke    # expect: hopper standalone (CLI v0.4.0-phase-3)
```

To verify the cross-host equivalence claim without installing all 4 hosts:

```bash
bash scripts/cross-host-verify.sh       # static checks; expect ALL STRUCTURAL CHECKS PASSED
```

## License

Apache-2.0. See `LICENSE`.

## Related

- Protocol spec: https://github.com/surebeli/llm-hopper (PING.md + USAGE-GUIDE.md)
- Demo design spec: https://github.com/surebeli/llm-hopper/blob/main/docs/plans/2026-05-19-hopper-plugin-demo-spec.md
- Essay (pending): publishes 2026-06-15 → 2026-06-29 window
