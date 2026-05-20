# Async / Background Execution — OpenAI Hosts Research

> Research date: 2026-05-21
> For: hopper-plugin spec amendment (async execution support)

## TL;DR

- **Codex CLI has no native `--background` / `--detach` / `--async` flag.** `codex exec` runs strictly synchronous-to-completion. The feature has been requested (openai/codex#3968, open since Sep 2025) but is unimplemented as of 2026-05; OpenAI's own workaround suggestion is `tmux` / `screen` / `nohup`.
- **Codex CLI does give us two useful primitives we can lean on**: `--output-last-message <path>` (writes the final agent message to a file — perfect for the `.md` handoff contract) and `codex exec resume --last` / `resume <SESSION_ID>` (cross-process session retrieval via rollout files).
- **Codex Desktop (the OpenAI Codex app) has automations + a `codex://threads/{threadId}` deep link, but they are not an automation surface for external dispatchers.** Automations are user-scheduled cron-like jobs internal to the app; the deep link is read-only navigation, has no "submit task" semantics, and is broken on Windows (openai/codex#14686, #18314). For hopper-plugin purposes the desktop app is **not usable** as a background backend.

## Codex CLI

### Background / detach mode
**NOT FOUND.** The official command reference (`developers.openai.com/codex/cli/reference`) lists no `--background`, `--detach`, `--async`, `--fire-and-forget`, or daemon flag for `codex exec`. The documented exec flags are: `--image/-i`, `--model`, `--output-schema`, `--json`, `--output-last-message/-o`, `--ephemeral`, `--skip-git-repo-check`, `--full-auto`, `--sandbox`, plus subcommands `resume` and `review`. Source: developers.openai.com/codex/cli/reference and the deepwiki mirror of the openai/codex repo.

The feature has been formally requested in **openai/codex#3968 — "Background Terminal Sessions"** (opened 2025-09-20, still open, no maintainer response, no linked PRs). The issue explicitly notes that today users *"must keep codex-cli in the foreground or rely on external tools like tmux, screen, or nohup."*

### Streaming during exec
**FOUND.** `codex exec` streams progress to **stderr** during execution and writes only the final agent message to **stdout**. With `--json`, stdout becomes a JSONL event stream (`thread.started`, `turn.started`, `turn.completed`, `item.*`, `error`, etc.) emitted as the run progresses. So output *is* available incrementally, but the **process itself does not return until the agent finishes** — streaming does not help the caller-blocking problem.

### Tool-call fire-and-forget
**NOT FOUND (within Codex's built-in tools).** The official `@openai/codex-shell-tool-mcp` shell tool runs commands in a sandboxed Bash and blocks the agent turn until the command returns. There is no documented "spawn-and-return" / "detach" flag on the shell tool.

**UNCONFIRMED / community workaround:** there is a third-party `codex-mcp-async` MCP wrapper (lobehub registry, non-official) that exposes a `start_task → task_id → poll` pattern by wrapping `codex exec` itself. We could not fetch its README to verify quality, but its existence confirms (a) the gap is real and (b) the standard fix is an external wrapper, not a CLI flag.

Within an agent loop, the safe pattern is: invoke a shell tool that *itself* daemonizes (e.g. `nohup … &` on POSIX, `Start-Process -WindowStyle Hidden` on PowerShell) and returns immediately with a PID printed to stdout. Codex will treat that as a normal completed tool call.

### Long-running task handling
No documented per-task timeout, no "save state + return later" mechanism inside a single `codex exec` invocation. Sessions *are* persisted as rollout files on disk by default (disabled with `--ephemeral`), but persistence is post-hoc transcript storage, not checkpoint/resume during a turn. If the process is killed mid-run, the rollout file may be resumable via `codex exec resume <SESSION_ID>`, but the in-flight turn is lost.

### Session persistence
**FOUND and useful.** Every non-ephemeral `codex exec` invocation writes a rollout file. From a different process / session:

- `codex exec resume --last [prompt]` — resume most recent session in cwd
- `codex exec resume --last --all [prompt]` — most recent across all dirs
- `codex exec resume <SESSION_ID> [prompt]` — resume specific session by ID

This means hopper-plugin **can** address sessions across processes by capturing the session ID at dispatch time and re-attaching later from any caller. Session ID is emitted in the `thread.started` event when `--json` is used.

### Exit codes
**UNCONFIRMED.** The official docs do not specify exit code semantics for `codex exec`. The community cheatsheets and deepwiki entry are silent. Empirically expected to be 0 on success / non-zero on agent or process error, but we should not rely on exit code as part of the result contract — which aligns with constraint #3 (results via `.md` only).

### Cross-platform (Windows vs macOS)
The Codex CLI is supported on both, but Windows has known quirks:
- The CLI runs in PowerShell / Windows Terminal; no native `nohup` equivalent — fallback dispatchers will need PowerShell `Start-Process -WindowStyle Hidden` or `Start-Job`.
- File-system path handling has known bugs (#17591 — local file links copied as `app://` URLs).
- For background dispatch, both OSes are equally bare on Codex's side: there is nothing native to use, so the fallback shape is the same.

## Codex Desktop (the OpenAI Codex app)

### URL handler / file-watch / pipe input
**Partial.** The app registers a `codex://` URL scheme with the form `codex://threads/{threadId}` (and per gist documentation, additional parameters for workspace path / origin). This is **navigation-only** — opening such a link focuses the app on an existing thread; it does **not** create a new task or inject a prompt. There is no documented file-watch, named-pipe, or local HTTP API for external task submission. On **Windows the deep-link handler is broken** (#14686, #18314) — markdown links get rewritten to `app://-/index.html?hostId=local` and the `codex://` URI handler is not reliably registered.

There is an **open feature request** (#21779 — "stable deep link or app-server API to open a local conversation by ID") confirming there is no stable programmatic surface today.

### Job tray / background task notion
**FOUND, but app-internal.** The app has Automations — cron-style scheduled tasks created in-app, plus a Triage/inbox pane where completed automation runs land. Automations currently run on the user's machine on a schedule (cloud-triggered automations are announced as upcoming). There is **no documented way to push a task into the automation queue from an external process** — the scheduler is the trigger source, not an external command.

### CLI ↔ Desktop integration
**NOT FOUND.** The CLI's rollout files and the Desktop app's thread store are not documented as a shared substrate that an external caller can write into and have the Desktop pick up. Codex Web (cloud agents at developers.openai.com/codex/cloud) does offer background execution, but it is a separate cloud-hosted product, not a host that hopper-plugin runs as a vendor subprocess.

### Plugin / extension system
Codex CLI exposes MCP (Model Context Protocol) for tool extensions — stdio-based child processes with stdin/stdout JSON-RPC. There is a community "Codex Plugin Marketplace" and a "Hooks" surface (per agenticcontrolplane.com analysis), but neither offers a documented "background dispatch" injection point. MCP is the right extension surface but it does not change the parent invocation's blocking semantics.

### Windows vs macOS parity
Desktop app ships on both; deep-link and file-path handling on Windows are demonstrably weaker (multiple open issues). For our purposes, both platforms lack what we need, so parity is academic.

## Implications for hopper-plugin

### What we can use natively
- `--output-last-message <path>` → write final agent message to a `.md` file. This is exactly the `.md`-only result-retrieval contract (constraint #3) and we should make it mandatory in the Codex host wrapper.
- `--json` + capture of `thread.started.session_id` → record session ID in the output frontmatter for future `resume`.
- `codex exec resume <SESSION_ID>` → cross-process result/continuation retrieval (constraint #2 / #6).
- `--ephemeral` is the **opposite** of what we want — make sure the wrapper does **not** pass it when async is in play.

### What we cannot use, fallback needed
- No `--background` flag → the host wrapper must handle detachment itself.
- No fire-and-forget tool call inside the agent loop → if a Codex *agent* (not the host) needs to dispatch to another vendor, it must shell out to `hopper-dispatch --background` (our fallback), not rely on a Codex-native mechanism.
- No Codex Desktop task-submission API → desktop is out of scope as an async backend.
- No OS-level uniformity → the fallback must branch on platform: POSIX uses `nohup … &` or `setsid`, Windows uses PowerShell `Start-Process -WindowStyle Hidden` (or `Start-Job` for in-session backgrounding).

### Recommended approach for Tier C Codex CLI host wrapper

Treat Codex CLI as a **synchronous-only vendor** and implement async at the hopper-plugin layer, not by asking Codex to detach itself. Concretely: the host wrapper for Codex should invoke `codex exec --output-last-message <output.md> --json [--full-auto] "<prompt>"`, parse `thread.started` from the JSON stream to extract `session_id`, and on completion write the final agent message plus session ID to the handoff `.md`. That gives us a clean, deterministic synchronous path that satisfies constraints #1, #3, and #5.

For async, add a thin `hopper-dispatch --background <task-id>` fallback that wraps the *synchronous* host invocation in a platform-appropriate detached subprocess (POSIX: `setsid nohup … >/dev/null 2>&1 &`; Windows: `Start-Process -WindowStyle Hidden -FilePath pwsh -ArgumentList …`). The detached process writes PID + `status: running|done|failed` + `session_id` into the output `.md` frontmatter (constraint #6), updating on completion. Callers poll the frontmatter. This avoids a separate JSON state file and keeps the entire contract in one `.md`. The Codex `resume` capability becomes a bonus: even after a background run completes, the agent thread can be re-entered from any session via the recorded `session_id`.

## Source citations

- [Command line options – Codex CLI | OpenAI Developers](https://developers.openai.com/codex/cli/reference)
- [Non-interactive mode – Codex | OpenAI Developers](https://developers.openai.com/codex/noninteractive)
- [Features – Codex CLI | OpenAI Developers](https://developers.openai.com/codex/cli/features)
- [Headless Execution Mode (codex exec) – DeepWiki mirror of openai/codex](https://deepwiki.com/openai/codex/4.2-headless-execution-mode-(codex-exec))
- [Non-interactive mode · Codex Docs (community mirror)](https://docs.onlinetool.cc/codex/docs/exec.html)
- [Codex CLI Resume, Continue, and Save Chat Explained – Verdent](https://www.verdent.ai/guides/codex-cli-resume-continue-save-chat)
- [Background Terminal Sessions · Issue #3968 · openai/codex](https://github.com/openai/codex/issues/3968)
- [Codex Desktop: stable deep link or app-server API · Issue #21779](https://github.com/openai/codex/issues/21779)
- [Deeplink Not Handled on Windows · Issue #14686 · openai/codex](https://github.com/openai/codex/issues/14686)
- [Custom URL scheme links rewritten to app://-/index.html · Issue #18314](https://github.com/openai/codex/issues/18314)
- [Windows desktop app copies local file links as app:// URLs · Issue #17591](https://github.com/openai/codex/issues/17591)
- [Automations – Codex app | OpenAI Developers](https://developers.openai.com/codex/app/automations)
- [App – Codex | OpenAI Developers](https://developers.openai.com/codex/app)
- [Introducing the Codex app | OpenAI](https://openai.com/index/introducing-the-codex-app/)
- [@openai/codex-shell-tool-mcp – npm](https://www.npmjs.com/package/@openai/codex-shell-tool-mcp)
- [codex-mcp-async (community MCP wrapper) – LobeHub registry](https://lobehub.com/mcp/yourusername-codex-mcp-async)
- [Codex app deep link schemes (community gist)](https://gist.github.com/zhuowei/98005fb9f2a42d5fd376f0fa71f204cc)
- [Codex CLI hook governance – Agentic Control Plane](https://agenticcontrolplane.com/blog/codex-cli-hooks-reference)
