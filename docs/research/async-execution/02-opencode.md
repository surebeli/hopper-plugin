# Async / Background Execution — OpenCode Research

> Research date: 2026-05-21
> For: hopper-plugin spec amendment
> Subject: OpenCode (sst/opencode, https://opencode.ai), the multi-provider AI coding agent — NOT VSCode and NOT GitHub OpenCode

## TL;DR

- OpenCode has a **first-class HTTP server** (`opencode serve`) with a documented OpenAPI 3.1 spec, an SDK, and a dedicated **`POST /session/:id/prompt_async`** endpoint that returns `204 No Content` immediately. Session state is persisted to disk and addressable by session ID. This is the strongest native async story of any host researched so far.
- The CLI `opencode run` itself has **no `--background` / `--detach` / `--output` flag**, but it can `--attach` to a running `serve` instance, and sessions resume via `--continue` / `--session <id>`. There is no `--quiet` flag at the `run` level.
- A community plugin (`kdco/background-agents`) already implements exactly the pattern hopper-plugin wants — fire-and-forget sub-agents that **write results to disk as `.md` files under `~/.local/share/opencode/delegations/`**. This validates the architecture but also shows the official feature request (#5895) for native on-idle processing is closed-as-discussion, so the plugin path is the canonical answer today.

## OpenCode modes overview

OpenCode is a single binary with subcommands (Bun/TypeScript core, Go-based TUI):

| Mode | Command | Notes |
|---|---|---|
| TUI | `opencode` (default) | Interactive terminal UI; supports `--continue`, `--session`, `--fork`, `--prompt`, `--agent` |
| One-shot CLI | `opencode run` | Non-interactive; streams events to stdout and exits when idle |
| Headless server | `opencode serve` | HTTP + SSE on 127.0.0.1:4096 by default; OpenAPI spec at `/doc` |
| Web UI | `opencode web` | Browser-based interface backed by same server |
| Attached TUI | `opencode attach` | TUI that connects to a remote `serve` |
| ACP | `opencode acp` | Agent Client Protocol server |
| Utility | `auth`, `mcp`, `models`, `session`, `stats`, `export`, `import`, `plugin`, `agent`, `github`, `pr`, `db`, `debug`, `upgrade`, `uninstall` | |

`opencode session list/delete` and `opencode export` provide CLI-level access to persisted sessions.

## Background / detach mode

**FOUND — native HTTP async endpoint; FOUND — community plugin pattern; NOT FOUND — CLI-level `--detach` flag on `run`.**

Three native vectors exist:

1. **`POST /session/:id/prompt_async`** (server). The OpenCode HTTP API exposes a documented async prompt endpoint that "returns `204 No Content` immediately without waiting for the response." Same request body as the sync `/message` endpoint. (Source: opencode.ai/docs/server, DeepWiki 7.2 OpenAPI Specification.)
2. **`opencode serve` + `opencode run --attach`**. You can start a long-lived server, then have `run` attach to it to avoid MCP cold-boot and to share session state across multiple invocations.
3. **Plugin-based delegation** (community pattern: `kdco/background-agents`). Plugin spawns isolated sub-agent sessions, writes results to `~/.local/share/opencode/delegations/*.md`, and exposes `delegate()` / `delegation_read()` / `delegation_list()` tools.

What is **not** found: there is no `opencode run --background`, no `--detach`, no `--async` flag, and no `--output <file>` redirection. Stdout streaming + shell redirection is the only file-output path from the CLI.

Feature request #5895 ("On-idle background processing") was closed as discussion; the maintainers' steering is toward plugins + server mode, not new CLI flags.

## Plugin system

### What plugins can do

OpenCode plugins are JavaScript/TypeScript modules loaded from `.opencode/plugins/` (project) or `~/.config/opencode/plugins/` (global), or via npm packages declared in `opencode.json`. A plugin exports an `async` function receiving `{ client, project, $, directory }` and returns hook handlers.

Plugins can:
- **Subscribe to ~25 lifecycle events**: `session.created`, `session.idle`, `session.error`, `session.compacted`, `session.deleted`, `session.status`, `session.updated`, `message.updated`, `message.part.updated`, `tool.execute.before`, `tool.execute.after`, `permission.asked`, `permission.replied`, `file.edited`, `file.watcher.updated`, `command.executed`, `server.connected`, `todo.updated`, `shell.env`, `tui.prompt.append`, `tui.command.execute`, `tui.toast.show`, `lsp.*`, `installation.updated`.
- **Register custom tools** with Zod-typed args; plugin tool names take precedence over built-ins.
- **Intercept stop attempts** (Stop Hook).
- **Transform system prompts** and **inject compaction context** (`experimental.session.compacting`).
- **Execute shell** via the injected Bun `$` helper.
- Use the injected `client` (the same SDK that talks to the server) to **create new sessions and send prompts programmatically**, including fire-and-forget via `noReply: true`.

### Whether plugins can implement async dispatch

**YES — confirmed in production.** The `kdco/background-agents` plugin is direct evidence: it adds a `delegate()` tool that spawns isolated sub-agent sessions, returns immediately, and persists results to `~/.local/share/opencode/delegations/*.md`. "Results are saved to disk and survive context compaction, session restarts, and process crashes." It explicitly does **not** use `prompt_async` — it manages independent sessions outside the main session tree.

Plugins receive `session.idle` (fires when an agent finishes responding) and `session.error` callbacks, so a dispatcher plugin can update an `output.md` frontmatter status field at completion time. This maps directly onto hopper's Tier C #2 amendment (status in output.md frontmatter).

Sources: opencode.ai/docs/plugins, johnlindquist OpenCode Plugins Guide, lushbinary.com plugin dev guide.

## Streaming and output

### `opencode run` streaming behavior

`opencode run` "supports single prompt execution, streaming events to stdout, and exiting when idle" (DeepWiki 6.1). Output streams in real time; the process exits when the session goes idle. There is specialized rendering for tool execution status.

`--format default|json` controls output formatting. `json` is the machine-readable mode hopper-plugin should prefer for parsing.

### Native output-to-file redirection

**Not natively supported.** There is no `--output` / `-o` flag on `run`. The only path is shell redirection: `opencode run --format json "..." > result.md`. This works on macOS, and on Windows requires PowerShell `> result.md` or `Out-File`.

The `share` flag (`--share`) creates a shareable web link but is not a local file artifact.

## Persistence

### Session resumption

`opencode run --continue` resumes the last session; `opencode run --session <id>` resumes by ID; `opencode run --fork` branches. The same flags exist on `opencode` (TUI) and `opencode attach`. **You can start a task, kill the process, reopen, and resume by ID** — sessions are persisted by design.

`opencode session list --format json` enumerates sessions; `opencode export` dumps a session to JSON.

### State files we could inspect externally

Default data directory (overridable via `$OPENCODE_DATA_DIR`):

- macOS / Linux: `~/.local/share/opencode/`
- Windows: `%USERPROFILE%\.local\share\opencode\`

Structure:
- `auth.json` — credentials (do not touch)
- `log/` — application logs
- `project/<project-slug>/storage/` — per-project session and message data (if in a git repo)
- `global/storage/` — non-git sessions

This means an external watcher (the hopper-plugin host) can poll a known directory to detect new messages on a session — a viable fallback if SSE is too heavy.

## Tool-call mechanism (opencode AS host)

### Fire-and-forget tool calls?

**No first-class fire-and-forget flag on tool calls.** OpenCode awaits tool execution before continuing the model turn (this is standard agent-loop behavior, and is the reason #6573 reports the Task tool hanging when sub-agents are spawned via the REST API).

However, there are three workable patterns when OpenCode is the host calling `hopper-dispatch`:

1. **Tool returns immediately with a job ID.** The dispatched hopper task writes to `output.md` out-of-band; the model is told "poll later." The tool itself does not block.
2. **Plugin-registered `delegate`-style tool.** Same as `kdco/background-agents`: plugin tool spawns a process and returns a handle.
3. **`prompt_async` indirection.** The dispatch tool POSTs to a sibling `opencode serve` instance's `/prompt_async` endpoint and returns the new session ID; the model can later read the transcript file.

### Streaming tool output

Tool output is captured and rendered by the TUI/CLI (visible status during execution), but the model receives the full tool result after the tool returns, not incrementally. `tool.execute.before` and `tool.execute.after` hooks let plugins observe and mutate this flow.

## Cross-platform notes

- **Windows is a tier-2 platform.** Official docs steer users to WSL (`opencode.ai/docs/windows-wsl`). Native Windows binaries exist (data dir at `%USERPROFILE%\.local\share\opencode\`) but the canonical experience is WSL.
- **Cross-platform session-sharing bug** (#10349): syncing the data directory between platforms does not make sessions visible across them — there is a path-canonicalization issue. Practical implication: hopper-plugin should not assume session IDs are portable across Windows ↔ macOS.
- **Bun runtime**: OpenCode is a Bun app. Bun's `$` shell helper works on both macOS and Windows, so plugin shell-out logic is portable.
- Server mode (`opencode serve`) is identical on both OSes — same OpenAPI, same SSE.

## Implications for hopper-plugin

### Native capabilities we can use for Tier C #2

1. **`opencode serve` + `POST /session/:id/prompt_async`** is the cleanest native fire-and-forget primitive of any host studied so far. A hopper-opencode wrapper can:
   - Ensure a long-lived `opencode serve` is running (per-user or per-project daemon).
   - On dispatch: `POST /session` to create, then `POST /session/:id/prompt_async` to fire.
   - Persist the session ID in the task manifest.
   - Either poll `GET /session/:id/message` or subscribe to SSE `session.idle` to detect completion.
   - Dump the final message to `output.md` and set frontmatter `status: done`.
2. **Plugin lifecycle hooks** (`session.idle`, `session.error`) give a pure-in-process way to update `output.md` frontmatter without an external watcher — this is the recommended Tier C #2 implementation.
3. **Disk persistence** (`~/.local/share/opencode/project/.../storage/`) is a fallback "is it done?" signal if SSE/HTTP polling is undesirable.

### What requires custom fallback

- **`output.md` file production**: OpenCode does not write per-session markdown summaries by default. The hopper plugin must do this — either via a `session.idle` hook that calls `session.messages()` and renders to markdown, or via shell redirection from `opencode run --format json`.
- **Job-ID surfacing in CLI mode**: `opencode run` has no `--detach` mode, so if the host wants pure-CLI invocation (no server), hopper must fall back to spawning a detached child process and managing a sidecar PID/lock file. This is platform-specific (PowerShell `Start-Process -NoNewWindow` vs `nohup &`).
- **Cross-platform session-ID portability** is broken (#10349), so hopper task manifests must scope session IDs by host machine.

### Recommended approach for hopper-opencode wrapper

Two-tier strategy aligned with the existing Tier C #2 amendment:

- **Tier C-native (preferred)**: Require `opencode serve` running. Dispatch via `prompt_async`. Install a small bundled hopper plugin (~50 lines, modeled on `kdco/background-agents`) that listens for `session.idle` on hopper-tagged sessions and renders the transcript to `output.md` with `status: done` frontmatter. No subprocess polling, no detached jobs.
- **Tier C-fallback (no server)**: `opencode run --format json --session <id> "<prompt>" > output.md.tmp` launched as a detached process; hopper writes `status: running` to a sidecar `output.md` immediately, and an external watcher promotes it to `status: done` when the JSON file finalizes and EOF is observed.

Net: OpenCode is the most accommodating host for hopper's async model and the bundled-plugin route is realistic — a working precedent already ships.

## Source citations

- OpenCode CLI docs: https://opencode.ai/docs/cli/
- OpenCode commands: https://opencode.ai/docs/commands/
- OpenCode plugins: https://opencode.ai/docs/plugins/
- OpenCode SDK: https://opencode.ai/docs/sdk/
- OpenCode server: https://opencode.ai/docs/server/
- OpenCode troubleshooting (data directory): https://opencode.ai/docs/troubleshooting/
- OpenCode Windows/WSL: https://opencode.ai/docs/windows-wsl/
- DeepWiki — CLI: https://deepwiki.com/sst/opencode/6.1-command-line-interface-(cli)
- DeepWiki — OpenAPI spec (prompt_async, endpoints): https://deepwiki.com/sst/opencode/7.2-openapi-specification
- Plugin authoring guide (johnlindquist): https://gist.github.com/johnlindquist/0adf1032b4e84942f3e1050aba3c5e4a
- Plugin dev guide (lushbinary): https://lushbinary.com/blog/opencode-plugin-development-custom-tools-hooks-guide/
- Plugin dev guide (rstacruz): https://gist.github.com/rstacruz/946d02757525c9a0f49b25e316fbe715
- Background agents plugin (kdcokenny): https://github.com/kdcokenny/opencode-background-agents
- Feature request #5895 (on-idle background processing): https://github.com/anomalyco/opencode/issues/5895
- Issue #6573 (Task tool hangs via REST API): https://github.com/sst/opencode/issues/6573
- Cross-platform session visibility bug #10349: https://github.com/anomalyco/opencode/issues/10349
- DEV Community — OpenCode hooks overview: https://dev.to/einarcesar/does-opencode-support-hooks-a-complete-guide-to-extensibility-k3p
