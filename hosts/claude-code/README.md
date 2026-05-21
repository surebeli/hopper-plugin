# hopper-plugin host adapter: Claude Code (Tier B)

Anchor: `hosts/claude-code/README.md::root`

> **Status (2026-05-20)**: Phase 3 — slash commands wired. Plugin install gate (T-PLUGIN-00 Prong 1) remains blocked-on-user per spec §11 (unified user-action gate). Strategy-as-developer cannot install the plugin on itself.

## What this is

The Claude Code host adapter for [hopper-plugin](https://github.com/surebeli/hopper-plugin). Registers slash commands inside a Claude Code session that shell out to the host-agnostic `cli/bin/hopper-dispatch`.

This is **Tier B** of the cross-host architecture:

- **Tier A** — Standalone CLI (`hopper-dispatch <task-id>` from any terminal) — already works
- **Tier B** — Claude Code host adapter — what this README covers
- **Tier C** — Codex CLI / OpenCode host adapters (separate dirs) — Phase 4
- **Tier D** — Documented adapters for hosts that don't reach functional — case-by-case

## Slash commands provided

| Command                | What it does                                                                     |
|------------------------|----------------------------------------------------------------------------------|
| `/hopper:dispatch <task-id> [--write] [--force]` | Dispatch a task; with `--write` also creates `.hopper/handoffs/<task-id>-output.md` |
| `/hopper:status`        | Show queue summary (pending / in-progress / done / failed)                       |
| `/hopper:smoke`         | Plugin host-lifecycle smoke test (Prong 1 verifier)                              |
| `/hopper:vendors`       | List registered vendor adapters (codex, kimi, opencode, copilot, agy)            |

Slash command source files: `commands/*.md` at the **repo root** (one prompt template per command).

## Plugin layout

Per codex Phase 3 audit P0 fix (2026-05-20), the plugin manifest lives at the **repo root**, not under `hosts/claude-code/`. Layout:

```
hopper-plugin/                  ← THIS IS THE PLUGIN ROOT
├── .claude-plugin/
│   └── plugin.json             ← discovered by Claude Code
├── commands/
│   ├── dispatch.md
│   ├── status.md
│   ├── smoke.md
│   └── vendors.md
├── cli/
│   └── bin/
│       └── hopper-dispatch     ← invoked by every slash command
└── hosts/claude-code/README.md ← this file (documentation only)
```

`$CLAUDE_PLUGIN_ROOT` (set by Claude Code at runtime) resolves to the **repo root**. Therefore `$CLAUDE_PLUGIN_ROOT/cli/bin/hopper-dispatch` is the correct path inside all slash command prompts.

## Install

### Option A — manual symlink the **repo root** (recommended for dogfood / development)

Linux / macOS:

```bash
mkdir -p ~/.claude/plugins
ln -s /absolute/path/to/hopper-plugin ~/.claude/plugins/hopper
```

Windows (PowerShell, admin):

```powershell
New-Item -ItemType SymbolicLink `
  -Path "$HOME\.claude\plugins\hopper" `
  -Target "F:\absolute\path\to\hopper-plugin"
```

**Important**: symlink the repo root (e.g. `hopper-plugin/`), not `hosts/claude-code/`. The plugin manifest and `cli/` binary must coexist at the same level — symlinking `hosts/claude-code/` will leave the binary unreachable.

After symlinking, **restart Claude Code** for the plugin to register.

### Option B — marketplace install

```
/plugin marketplace add surebeli/hopper-plugin
/plugin install hopper@agent-hopper
```

The repo doubles as a single-plugin marketplace via `.claude-plugin/marketplace.json` (marketplace name: `agent-hopper`; plugin name: `hopper`).

## Verify install (T-PLUGIN-00 Prong 1)

After install + restart, type:

```
/hopper:smoke
```

Expected: a `hopper standalone (CLI v0.4.0-phase-3)` banner. If you see it, **Prong 1 PASSES** — record this in `.hopper/HOPPER-FEEDBACK.md` per the unified user-action gate (spec §11).

If the slash command is not recognized:
- The plugin manifest may not match current Claude Code schema. Run `claude --debug` to inspect plugin discovery
- `$CLAUDE_PLUGIN_ROOT` may not be set. Check via `echo $CLAUDE_PLUGIN_ROOT` inside a Claude Code Bash invocation
- File a finding in `.hopper/HOPPER-FEEDBACK.md` so this README can be corrected

## Authentication prerequisites per vendor

The plugin spawns vendor subprocesses; each needs its own auth set up **outside** the plugin (per spec §1 #1: no runtime protocol state outside `.hopper/`).

| Vendor    | Auth artifact / env var                                                      |
|-----------|-------------------------------------------------------------------------------|
| codex     | `~/.codex/auth.json` (`codex login`) OR `CODEX_API_KEY` / `OPENAI_API_KEY` env |
| kimi      | `~/.kimi/config.toml` (`kimi /connect`) OR `KIMI_API_KEY` / `MOONSHOT_API_KEY` |
| opencode  | `~/.local/share/opencode/auth.json` etc. OR provider env keys                  |
| copilot   | `GH_TOKEN` / `GITHUB_TOKEN` / `COPILOT_GITHUB_TOKEN` env OR `gh auth status`  |
| agy       | Interactive OAuth via `agy` (one-time), then `agy -p` headless                |

Run `/hopper:vendors` after install to confirm all 5 are registered.

## What this plugin does NOT do

Per spec §3 #4 (no harness reaction core):

- No retry on vendor failure (single subprocess spawn per dispatch)
- No fallback chains (vendor A failed -> try vendor B)
- No consensus / multi-vendor voting
- No streaming output back to Claude Code session (output is captured + surfaced at end)
- No automatic queue.md / COST-LOG.md mutation (user must approve every edit)
- No Anthropic Agent SDK / `claude -p` / direct Anthropic SDK usage (sidesteps 2026-06-15 SDK credit policy)

These are intentional. The plugin is a router, not a runtime.

## Troubleshooting

| Symptom                                | Likely cause                                                              | Fix                                                          |
|----------------------------------------|---------------------------------------------------------------------------|--------------------------------------------------------------|
| `/hopper:dispatch` not recognized      | Plugin not registered                                                      | Symlink repo root + restart Claude Code; verify with `/hopper:smoke` |
| `node: command not found`              | Node 18+ not on PATH                                                       | Install Node 18+ and ensure it's on PATH                     |
| `Error: no .hopper/ directory found`   | Running outside a hopper project                                           | `cd` into the project root OR set `HOPPER_DIR` env var       |
| `Adapter <vendor> preflight failed`    | Vendor auth not configured                                                 | See auth table above; rerun after fixing                     |
| Dispatch hangs                          | Vendor subprocess waiting on stdin                                         | Hard timeout fires after vendor's `timeoutMs`; check stderr  |
| `auth-fail` despite valid credentials   | adapter's preflight is too strict OR vendor uses non-standard auth path    | File issue with adapter name + actual auth artifact location |
