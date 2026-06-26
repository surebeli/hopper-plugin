# hopper-plugin host adapter: Claude Code (Tier B)

Anchor: `hosts/claude-code/README.md::root`

> **Status (2026-05-22)**: v1.0 progress monitor wired. Plugin install gate remains blocked-on-user per spec §11 (unified user-action gate). Strategy-as-developer cannot install the plugin on itself.

## What this is

The Claude Code host adapter for [hopper-plugin](https://github.com/surebeli/hopper-plugin). Registers slash commands inside a Claude Code session that shell out to the host-agnostic `cli/bin/hopper-dispatch`.

This is **Tier B** of the cross-host architecture:

- **Tier A** — Standalone CLI (`hopper-dispatch <task-id>` from any terminal) — already works
- **Tier B** — Claude Code host adapter — what this README covers
- **Tier C** — Codex CLI / OpenCode / Copilot CLI / Grok Build / Cursor CLI host adapters (separate dirs)
- **Tier D** — Documented adapters for hosts that don't reach functional — case-by-case

## Slash commands provided

| Command                | What it does                                                                     |
|------------------------|----------------------------------------------------------------------------------|
| `/hopper:dispatch <task-id> [--write] [--force] [--model <name>] [--reasoning <level>] [--sandbox <mode>]` | Dispatch a task; with `--write` also creates `.hopper/handoffs/<task-id>-output.md` |
| `/hopper:status`        | Show queue summary (pending / in-progress / done / failed)                       |
| `/hopper:smoke`         | Plugin host-lifecycle smoke test (Prong 1 verifier)                              |
| `/hopper:vendors`       | List registered vendor adapters (codex, kimi, opencode, copilot, agy, grok, mimo, claude) |

Slash command source files: `commands/*.md` at the **repo root** (one prompt template per command).
The completion monitor lives at `monitors/monitors.json` at the **repo root**.

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
├── monitors/
│   └── monitors.json          ← starts hopper-dispatch --watch-events
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

Expected: a `hopper standalone (CLI v0.8.1)` banner. If you see it, **Prong 1 PASSES** — record this in `.hopper/HOPPER-FEEDBACK.md` per the unified user-action gate (spec §11).

If the slash command is not recognized:
- The plugin manifest may not match current Claude Code schema. Run `claude --debug` to inspect plugin discovery
- `$CLAUDE_PLUGIN_ROOT` may not be set. Check via `echo $CLAUDE_PLUGIN_ROOT` inside a Claude Code Bash invocation
- File a finding in `.hopper/HOPPER-FEEDBACK.md` so this README can be corrected

## Completion monitor

Claude Code v2.1.105+ discovers plugin monitors from `monitors/monitors.json`
at the plugin root. hopper's v1.0 monitor is `hopper-watch-events`; it runs:

```bash
node "${CLAUDE_PLUGIN_ROOT}/cli/bin/hopper-dispatch" --watch-events
```

`hopper-dispatch --watch-events` watches `.hopper/handoffs/*-output.md`
frontmatter and emits one stdout JSONL line for each terminal task event.
Claude Code delivers those stdout lines to the interactive session as monitor
notifications. The monitor is active only in Claude Code hosts where the
Monitor tool is available.

**Backlog baselining (default):** on each (re)start the watcher records the tasks
that are ALREADY terminal as a silent baseline and emits ONLY tasks that reach a
terminal state AFTER it starts. This stops a fresh session from re-firing one
notification per historical task in `handoffs/` (which spammed the chat on startup
when a project had accumulated completed tasks). Use `--once` to emit the first event
then exit, or `--replay` to deliberately emit the existing backlog too.

**Keeping `handoffs/` lean (archival):** baselining stops the monitor from *replaying*
the backlog; `hopper-dispatch --archive` *removes* it. It moves finished task artifacts
to `.hopper/archive/<date>/` (results stay retrievable — `--result` falls back to the
archive), never touching pending / in-progress / live-runner tasks. Recommended cadence and
the full when/how policy: `docs/specs/handoff-archival.md`. Quick start:
`hopper-dispatch --archive --older-than 7 --dry-run`.

If Claude Code starts in a directory that is not a hopper workspace, the monitor
quietly exits without notifications. Set `HOPPER_DIR=/path/to/.hopper` when you
want the monitor to follow a different workspace.

The runner terminal state is authoritative: a task is complete only when
`.hopper/handoffs/<task-id>-output.md` reaches a terminal status with
`terminal_event_emitted: true`. Wrapper completion, background Bash completion,
or subagent completion is not authoritative task completion; it may only mean a
wrapper handed off work to hopper.

This Claude Code monitor bridge is the only v1.0 host integration. Codex CLI has no native wake in v1.0, and OpenCode native wake is not enabled in v1.0; those hosts use `hopper-dispatch --progress`, `hopper-dispatch --watch-events`, or later OS notification work.

## Authentication prerequisites per vendor

The plugin spawns vendor subprocesses; each needs its own auth set up **outside** the plugin (per spec §1 #1: no runtime protocol state outside `.hopper/`).

| Vendor    | Auth artifact / env var                                                      |
|-----------|-------------------------------------------------------------------------------|
| codex     | `~/.codex/auth.json` (`codex login`) OR `CODEX_API_KEY` / `OPENAI_API_KEY` env |
| kimi      | `~/.kimi-code/config.toml` (`kimi` then `/login`; Kimi Code 0.x) OR `KIMI_API_KEY` / `MOONSHOT_API_KEY` |
| opencode  | `~/.local/share/opencode/auth.json` etc. OR provider env keys                  |
| copilot   | `GH_TOKEN` / `GITHUB_TOKEN` / `COPILOT_GITHUB_TOKEN` env OR `gh auth status`  |
| agy       | Interactive OAuth via `agy` (one-time), then `agy -p` headless                |
| grok      | `XAI_API_KEY` OR `~/.grok/` credentials from `grok login --device-auth` / browser OAuth |
| mimo      | `~/.local/share/mimocode/auth.json` or first-launch MiMo Auto setup via `mimo` |
| claude    | `ANTHROPIC_API_KEY` OR `CLAUDE_CODE_OAUTH_TOKEN` (`claude setup-token`) OR `~/.claude` OAuth (`claude` then `/login`) |

Run `/hopper:vendors` after install to confirm all 8 are registered.

## Dispatch permissions

Vendor dispatch defaults to `danger-full-access` so implementation tasks can edit files. Hopper automatically downgrades to `read-only` only when the queue brief or detailed task spec explicitly says `read-only` / `只读`. You can override one dispatch with `--sandbox <read-only|workspace-write|danger-full-access>`.

## What this plugin does NOT do

Per spec §3 #4 (no harness reaction core):

- No retry on vendor failure (single subprocess spawn per dispatch)
- No fallback chains (vendor A failed -> try vendor B)
- No consensus / multi-vendor voting
- No streaming vendor stdout back to Claude Code session. v1.0 only sends terminal-event JSONL through the monitor.
- No automatic queue.md / COST-LOG.md mutation (user must approve every edit)
- The Claude Code **host** integration itself never routes its own work through `claude -p` / the Anthropic Agent SDK — it only emits terminal-event JSONL through the monitor. This sidesteps the 2026-06-15 Agent SDK credit policy for the host path.

These are intentional. The plugin is a router, not a runtime.

> **`claude` as a VENDOR (v0.9.0+).** Distinct from the above: there is now a `claude` *vendor* adapter, so a hopper running under a DIFFERENT host (codex / opencode / grok / standalone CLI) can dispatch a task TO `claude -p`. The host≠vendor guard (`validateHostVendorSeparation`) blocks the only nonsensical case — a Claude Code host dispatching back to the `claude` vendor (self-dispatch). Billing for `claude -p` against a Claude plan churned through 2026 (the 2026-06-15 separate-Agent-SDK-credit split was later rolled back), so the adapter is billing-agnostic — verify the live policy at anthropic.com if cost matters. See `cli/src/vendors/claude.js` for the isolation/permission knobs (`HOPPER_CLAUDE_BARE=1` for deterministic CI isolation, `HOPPER_CLAUDE_PERMISSION_MODE` to override the permission mode).

## Troubleshooting

| Symptom                                | Likely cause                                                              | Fix                                                          |
|----------------------------------------|---------------------------------------------------------------------------|--------------------------------------------------------------|
| `/hopper:dispatch` not recognized      | Plugin not registered                                                      | Symlink repo root + restart Claude Code; verify with `/hopper:smoke` |
| `node: command not found`              | Node 18+ not on PATH                                                       | Install Node 18+ and ensure it's on PATH                     |
| `Error: no .hopper/ directory found`   | Running outside a hopper project                                           | `cd` into the project root OR set `HOPPER_DIR` env var       |
| `Adapter <vendor> preflight failed`    | Vendor auth not configured                                                 | See auth table above; rerun after fixing                     |
| Dispatch hangs                          | Vendor subprocess waiting on stdin                                         | Hard timeout fires after vendor's `timeoutMs`; check stderr  |
| `auth-fail` despite valid credentials   | adapter's preflight is too strict OR vendor uses non-standard auth path    | File issue with adapter name + actual auth artifact location |
