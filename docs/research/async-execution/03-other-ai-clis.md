# Async / Background — Kimi / Copilot / Agy Research

> Research date: 2026-05-21
> For: hopper-plugin spec amendment (async / background execution)
> Scope: Investigate native async / background-execution support in 3 vendor CLIs already wrapped by hopper-plugin (kimi, copilot, agy), with notes on both callee (dispatch target) and host (callers wrapping hopper-dispatch) framing.

---

## TL;DR

- **Kimi CLI** has the strongest native background story of the three: a documented `[background]` config section, `run_in_background=true` on its Shell + Agent tools, a `TaskList` / `TaskOutput` retrieval pair, and a `keep_alive_on_exit` knob. But none of this surfaces as a top-level `--background` flag on `kimi -p`; print-mode itself is still synchronous. Best fit as a host-side primitive.
- **GitHub Copilot CLI** has zero native local-background flag for `-p` mode. Its only "background" affordance is the `&` prefix / `/delegate` slash command which pushes work to the **cloud** coding agent (returns a PR link, not a file). Sessions are persisted under `~/.copilot/session-state/` + SQLite and resumable with `--resume` / `--continue`.
- **Agy (Antigravity CLI)** print-mode (`-p`) is synchronous and has no `--background` / `--detach`. It does ship `--log-file` (already used by our adapter) and a `--print-timeout` (default 5m). Agy's marketing emphasizes "parallel subagents" but those run *inside* a single CLI invocation; they don't change the external sync/async contract.

---

## Kimi CLI

Version pinned in our spike: **kimi 1.41.0** (T-PLUGIN-00b).

### Background mode

`kimi -p <prompt>` (alias: `--prompt`, `-c`, `--command`) is **synchronous**. There is no top-level `--background`, `--detach`, or `--async` flag on the `kimi` command itself. Print-mode is finished by the time the process exits.

However, kimi exposes a **first-class background-task subsystem at the tool layer**:

- **Shell tool** accepts `run_in_background=true`; the tool returns a task ID immediately and the agent loop continues. The system "automatically sends a notification when the task completes."
- **Agent tool** (subagent) likewise supports `run_in_background=true`. Each instance keeps its own context history.
- **`TaskList`** — enumerate background tasks in the current session.
- **`TaskOutput`** — non-blocking snapshot of status + stdout; "if output is truncated, use ReadFile to page through the full log."
- Config section `[background]` (kimi config file):
  - `max_running_tasks` — default `4`
  - `keep_alive_on_exit` — default `false` (background processes terminate when CLI exits)
  - `kill_grace_period_ms` — default `2000`
  - `agent_task_timeout_s` — default `900` (15 min)
  - `print_wait_ceiling_s` — default `3600` (hard cap when print-mode is *waiting on* a background task to finish)

The `print_wait_ceiling_s` knob is interesting: it implies that even in `-p` mode, kimi *can* be told to wait on a background task — but it still blocks the outer process until that ceiling.

UNCONFIRMED: whether `keep_alive_on_exit=true` truly survives the `kimi -p` process exit on Windows (process-tree teardown semantics differ).

### Output file redirection

Not found as a flag. Kimi `-p` writes to stdout. The closest analogues are:
- `--output-format text` (default) / `--output-format stream-json` for structured output
- `--final-message-only` to strip intermediate tool calls
- `--quiet` (shortcut for `--print --output-format text --final-message-only`)

To get a result file, hopper-plugin must continue to redirect stdout (`> out.md`) at the shell level — kimi does not write to a file natively.

### Session persistence

Strong support:
- `--session [ID]` / `--resume [ID]` / `-S` / `-r` — resume a specific session, or open a session picker if no ID given.
- `--continue` / `-C` — continue the most recent session in the current working directory.

This is the key affordance: a hopper-plugin caller can capture the session ID from the first `kimi -p` run (already done in T-PLUGIN-00b — session `754a6031-...` recorded) and **resume from a different process**, which is exactly what we'd need for a "start now, poll later" async pattern.

### Tool-call (kimi as host)

Kimi's Shell tool with `run_in_background=true` is the cleanest cross-CLI primitive of the three for the host-side case. If a user opens `kimi` interactively and we want it to fire-and-forget a `hopper-dispatch ... --queue-only` call, kimi's own tool layer can do it without hopper-plugin needing to add anything — kimi will spawn it, hand back a task ID, and the user keeps typing. `TaskOutput` then becomes the polling mechanism.

### Cross-platform

Kimi installs as a Python package (`pip install kimi-cli`, PyPI). On user's machine it lives at `/c/Users/litianyi/.local/bin/kimi` (Git Bash path). No Windows-specific quirks documented for background tasks, but the `kill_grace_period_ms` + process-tree teardown story under PowerShell vs cmd.exe vs Git Bash is UNCONFIRMED.

### Implications for hopper-plugin

1. As a **callee**: keep current `kimi -p ... --print --afk --final-message-only` invocation. For async, run it under our own thin background layer (e.g. detached subprocess + result file). Native kimi flags add nothing here.
2. As a **host**: kimi's background tool subsystem is the model to study. Our background layer's `task_id` / `task_status` API should rhyme with kimi's `TaskList` / `TaskOutput` so users coming from kimi feel at home.
3. The session-resume affordance (`--session <ID>`) is the best native primitive for a "non-blocking, retrievable later" pattern *if* hopper-plugin wants vendor-native semantics for kimi only.

---

## GitHub Copilot CLI

Latest GA: **Feb 2026**, npm package `@github/copilot`, command `copilot`.

### Background mode

No local `--background` / `--detach` / `--async` flag on `copilot -p`. The two "background" affordances both push work *off* the local machine:

- **`&` prefix** — prefix any prompt with `&` to delegate to the **Copilot coding agent in the cloud**. Example: `& complete the API integration tests and fix any failing edge cases`. Returns a draft PR link.
- **`/delegate` slash command** — interactive equivalent of `&`.

Critical for our use case: **the docs do not state whether `&` works in `-p` mode**. The cloud-delegation flow also requires Copilot to "commit any unstaged changes as a checkpoint in a new branch it creates" — this is a *git-mutating* operation, not a file-based result drop. Doesn't fit our constraint #3 (`results retrieved via .md files`).

There is also an `--autopilot` mode referenced in the docs for programmatic / non-interactive use, but it's separate from cloud delegation.

### Output file redirection

NOT FOUND. Copilot CLI writes to stdout; redirect at the shell level.

### Session persistence

Strong:
- Sessions stored locally under `~/.copilot/session-state/` (per-session directories) + a SQLite database at `~/.copilot/session-store.db`.
- `--resume` — interactive picker for previous sessions.
- `--continue` — resume the most recent session.
- `/chronicle reindex` slash command rebuilds the session store from history files.

UNCONFIRMED: whether the session ID surfaces in a machine-readable form (stdout / env var / file) that an external process could grab and pass back to `copilot --resume <id>`. The docs describe `--resume` as a picker, not as an ID-taking flag — which would make cross-process resume awkward.

### Auth: GH_TOKEN

The reference docs we hit didn't enumerate `GH_TOKEN` explicitly (UNCONFIRMED). What is documented: Copilot CLI runs on "Linux, macOS, Windows from within PowerShell and Windows Subsystem for Linux (WSL)." No mention of background-mode-specific auth gotchas — auth is acquired once and persists.

### Quota / rate limit

Auto-compression kicks in at 95% of token limit (in-conversation, not parallel-dispatch). No documented per-minute rate-limit for parallel invocations from the CLI docs surface — UNCONFIRMED whether spinning up 5 parallel `copilot -p` calls is rate-allowed. Treat as a runtime constraint to discover empirically.

### Tool-call (copilot as host)

Copilot CLI does have a tool/agent system (custom agents via `--agent=<name>`, e.g. `--agent=refactor-agent`), but does not document a `run_in_background` equivalent. If a user wants their interactive copilot session to fire a hopper-dispatch and not block, they have to rely on shell-level `&` (POSIX) or `Start-Process` (PowerShell) — copilot itself won't manage it.

### Cross-platform

Officially supported: Linux, macOS, Windows (PowerShell + WSL). No documented Windows-specific async behavior.

### Implications for hopper-plugin

1. As a **callee**: copilot `-p` is fully synchronous from hopper's perspective. The `&` cloud-delegation mode is NOT usable for hopper because results land as a PR, not a file. Our background layer must wrap copilot the same way as any other sync CLI — detached subprocess + stdout-to-file.
2. As a **host**: no native primitive to leverage. Users embedding hopper-dispatch in interactive copilot sessions must shell out.
3. **Session-resume IS usable**: but only if we can extract the session ID. If `--resume` only opens a picker (no `--resume <id>`), then cross-process resume is blocked — verify this empirically in a follow-up spike.

---

## Antigravity (agy)

Version: Antigravity 2.0 (announced at Google I/O 2026-05-19, replacing Gemini CLI). Our adapter (`cli/src/vendors/agy.js`) already uses `agy -p ... --dangerously-skip-permissions --log-file <path>`. There is some confusion in third-party docs between `agy` the **VS-Code-style editor launcher** (per linuxcommandlibrary man page: `--new-window`, `--goto`, `--diff`, etc.) and `agy` the **agentic CLI** — the binary we invoke is the latter, which accepts `-p / --print`, `--log-file`, `--dangerously-skip-permissions`, and `--print-timeout` (default 5m0s). Confirmed by our T-PLUGIN-00b spike + cross-referenced search hits.

### Background mode

NOT FOUND. No `--background`, `--detach`, or `--async` flag on `agy -p`. Print-mode is synchronous and bounded by `--print-timeout` (default 5m).

Marketing material ("parallel background subagents", "scheduling primitive") refers to **intra-invocation** subagent orchestration: a single `agy` process can spawn parallel sub-agents internally, but the outer CLI call still blocks until the top-level agent's print-mode response completes. This does not give hopper-plugin any external async knob.

There is a non-interactive subcommand form (third-party blog reference): `antigravity agent run "..." --repo ./services/api --model gemini-3.5-flash`. UNCONFIRMED whether `antigravity agent run` ships as a separate binary in the user's Antigravity 2.0 install, or whether it's marketing pseudo-code.

### Output file redirection / `--log-file`

`--log-file <path>` is already used by our adapter and is the closest thing to a "result file" — but per our adapter comments (F2 audit), the log file primarily captures **diagnostic / error signal**, not the answer text. The actual response goes to stdout.

For hopper's "result via .md file" constraint, we must continue redirecting stdout at the shell layer. `--log-file` is a useful secondary artifact for failure classification (the agy adapter already inspects it for auth-fail, deadline-exceeded, and permission patterns).

### Session persistence

UNCONFIRMED. Antigravity 2.0 marketing says "persistent history" and sessions can be "exported to the Antigravity 2.0 GUI", but no `--resume <id>` flag surfaced in our research. This is a gap to fill in a follow-up spike.

### OAuth

First-run requires interactive browser OAuth. Our adapter's `envPreflight` already encodes the "agy is not OAuth-authed → silent exit 0 + empty stdout" failure mode and probes `~/.gemini/` for auth artifacts. After OAuth is established and the keyring is populated, later `agy -p` invocations are fully headless — confirmed by our smoke tests. So OAuth is a **one-time interactive setup cost**, not an ongoing async blocker.

WSL has documented persistence bugs (Google AI Developers Forum discussion threads from May 2026 about auth state not surviving WSL2 restarts). Native Windows install (AppData/Local/agy/bin/) appears to work; pure WSL2 is rough.

### Tool-call (agy as host)

Agy has subagents + skills + MCP server config (`/skills`, `/mcp` slash commands), and the marketing claim that "the main agent can spawn focused subagents for parallel work." But none of that exposes a `fire-and-forget shell command` semantic the way kimi's Shell tool does. Treat agy as host: same shell-out story as copilot.

### Cross-platform

Windows binary lives at `AppData/Local/Programs/Antigravity/bin/antigravity` (per WSL-bridge path `/mnt/c/Users/<USER>/AppData/Local/Programs/Antigravity/bin/antigravity`). macOS install via curl bash script. Windows native works; WSL2 has open auth-persistence bugs as of May 2026.

### Implications for hopper-plugin

1. As a **callee**: keep current invocation. Wrap with hopper's own background layer for async. `--log-file` already serves as our secondary failure-signal source.
2. As a **host**: no useful native primitive. Same shell-out fallback as copilot.
3. **Session resume is the biggest gap** — if Antigravity 2.0 has not yet exposed `--resume <id>`, hopper cannot do "start now, retrieve later via session ID" for agy. Must use our own task-ID / result-file layer.

---

## Comparative summary

| CLI | Native background flag on `-p`? | File output? | Session resume across processes? | As host (fire-and-forget tool)? |
|---|---|---|---|---|
| **kimi** | NO (but rich `[background]` config + tool-level `run_in_background`) | NO (stdout only) | YES — `--session <id>` / `--resume <id>` / `-C` | YES — Shell + Agent tools support `run_in_background=true` |
| **copilot** | NO (only `&` cloud delegation → PR, not file) | NO (stdout only) | PARTIAL — `--resume` / `--continue` exist; UNCONFIRMED whether `--resume <id>` accepts ID arg | NO native primitive |
| **agy** | NO | NO answer to file; `--log-file` is for diagnostics | UNCONFIRMED (no `--resume <id>` flag found) | NO native primitive (subagents are intra-process only) |

---

## Recommended approach per CLI for hopper-plugin

### Kimi (as vendor in background mode)

- **Wrap with hopper's own background layer**; do not depend on kimi's `[background]` config — it governs tool-level tasks *inside* a kimi run, not the kimi process itself.
- **Capture and persist the session ID** on first dispatch. Store under the task's result-file directory. This unlocks future `kimi --session <id> -p "..."` follow-up calls, which is the best vendor-native async-ish primitive of the three.
- **Use `--quiet`** (shortcut for `--print --output-format text --final-message-only`) for cleanest stdout-to-`.md` capture.
- Optional / future: if hopper needs to expose a "task list" UX, model the surface on kimi's `TaskList` + `TaskOutput` pair.

### Copilot (as vendor in background mode)

- **Wrap with hopper's own background layer**; copilot has no usable native async on the local execution path.
- **Explicitly reject `&` / `/delegate` cloud-delegation inside hopper-dispatch input** — those write a PR, not a `.md`, and violate constraint #3.
- **Session resume**: capture session ID if discoverable (run `--resume` empirically to check whether it accepts an ID argument or only opens a picker). If picker-only, do not advertise session resume for copilot in our spec.
- Test parallel-dispatch rate limits empirically before promising N-way parallelism on copilot.

### Agy (as vendor in background mode)

- **Wrap with hopper's own background layer**.
- **Keep `--log-file`** as failure-signal secondary; primary result is still stdout-to-`.md`.
- **Note the 5-min default print-timeout** explicitly in the async spec — long-running agy tasks need either `--print-timeout` override or hopper-side polling that tolerates the truncation.
- **OAuth must be done interactively once** before any async dispatch (our adapter already enforces this via `envPreflight`). Document this prerequisite in the async section.
- Spike whether `antigravity agent run` is a real separate binary; if so, evaluate whether it has better headless semantics than `agy -p`.

---

## Cross-cutting recommendations for the spec amendment

1. **None of the three vendors gives hopper-plugin a turnkey native async story.** Constraint #4 ("prefer host-native; custom fallback only when none") resolves to: build the thin background layer. All three CLIs need it.
2. **Session ID is the only meaningfully native async primitive** and only kimi exposes it cleanly with a documented `--resume <id>`. If we want spec-level "vendor-native preferred" language, scope it to kimi.
3. **`.md` result files must come from shell-level stdout redirect** for all three. None of the three writes the answer text to a file natively. (Agy's `--log-file` is diagnostic, not answer.)
4. **Cross-platform**: kimi and copilot are clean on both OSes; agy is clean on Windows-native and macOS but rough in WSL2 (auth persistence bugs as of May 2026 — flag as known-issue in spec).
5. **Host-side fire-and-forget**: only kimi has a native tool-level primitive (`run_in_background=true` on Shell/Agent tools). For copilot and agy, hopper users invoking hopper-dispatch from inside an interactive vendor session must rely on OS-level backgrounding (POSIX `&`, PowerShell `Start-Process -NoNewWindow`).

---

## Source citations

- Kimi CLI docs: https://moonshotai.github.io/kimi-cli/en/reference/kimi-command.html
- Kimi print mode: https://moonshotai.github.io/kimi-cli/en/customization/print-mode.html
- Kimi config (background section): https://moonshotai.github.io/kimi-cli/en/configuration/config-files.html
- Kimi GitHub: https://github.com/MoonshotAI/kimi-cli
- Copilot CLI docs (overview): https://docs.github.com/copilot/how-tos/use-copilot-agents/use-copilot-cli
- Copilot CLI chronicle / session data: https://docs.github.com/en/copilot/concepts/agents/copilot-cli/chronicle
- Copilot CLI delegate-to-cloud: https://docs.github.com/en/copilot/how-tos/copilot-cli/use-copilot-cli-agents/delegate-tasks-to-cca
- Copilot CLI GA announcement (Feb 2026): https://github.blog/changelog/2026-02-25-github-copilot-cli-is-now-generally-available/
- Copilot CLI delegate changelog: https://github.blog/changelog/2025-10-28-github-copilot-cli-use-custom-agents-and-delegate-to-copilot-coding-agent/
- Antigravity CLI docs: https://antigravity.google/docs/cli-using
- Antigravity 2.0 launch (I/O 2026): https://www.marktechpost.com/2026/05/19/google-launches-antigravity-2-0-at-i-o-2026-a-standalone-agent-first-platform-with-cli-sdk-managed-execution-and-enterprise-support/
- Antigravity deep-dive (third party): https://agentpedia.codes/blog/antigravity-cli-deep-dive
- Antigravity CLI repo: https://github.com/google-antigravity/antigravity-cli
- Antigravity CLI man page (launcher form): https://linuxcommandlibrary.com/man/agy
- Gemini→Antigravity transition: https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/
- WSL2 agy auth bugs: https://discuss.ai.google.dev/t/bug-antigravity-cli-agy-fails-to-persist-authentication-state-in-wsl-2-environment/146059
- hopper-plugin internal: `F:\workspace\ai\hopper-plugin\cli\src\vendors\agy.js`, `F:\workspace\ai\hopper-plugin\docs\spikes\T-PLUGIN-00b-vendors.md`
