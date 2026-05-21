# OpenCode hopper-async plugin

Anchor: `hosts/opencode/plugins/README.md::root`

> **Status**: Phase 5b, spec v2.1.0 §14.9 native-preferred path for Tier C #2 OpenCode host.
>
> **⚠ EXPERIMENTAL DIVERGENCE (codex Phase 5 F5)**: this plugin path is a SECOND
> dispatcher implementation. It uses OpenCode's `prompt_async` + `session.idle`
> hook directly and does NOT route through `cli/src/dispatch.js → resolveDispatch`.
> Consequence:
>
> - **Bypasses task-type frame composition** (`.hopper/tasks/<type>.md` not loaded)
> - **Bypasses vendor routing** (AGENTS.md `task-vendor-preference` ignored — plugin
>   always uses OpenCode itself as the vendor)
> - **Bypasses heterogeneous-only warning** (HOPPER_HOST_VENDOR check skipped)
> - **Marks success if any assistant message exists** (no adapter.parseResult chain)
>
> For full dispatcher-parity behavior (frame + routing + warning), use **Tier A
> `hopper-dispatch --background`** invoked from a shell tool inside the OpenCode
> session instead of this plugin's `hopper_dispatch` tool.

## What this is

A bundled OpenCode plugin (`hopper-async.ts`) that lets an OpenCode session dispatch a hopper task as a true fire-and-forget background job — using OpenCode's native `POST /session/:id/prompt_async` endpoint + `session.idle` / `session.error` lifecycle hooks.

Result lands in `.hopper/handoffs/<task-id>-output.md` per spec §14 frontmatter contract, just like the dispatcher's own `--background` mode.

## When to use

- **Use this plugin** when invoking hopper-dispatch from inside an OpenCode session (`opencode` TUI / `opencode run`) and you want the OpenCode session to NOT block while the dispatched task runs.
- **Use `hopper-opencode --background <task-id>`** (the wrapper CLI) when running from outside any OpenCode session — the wrapper forwards `--background` to the inner `hopper-dispatch`, which uses the `hopper-runner` detached fallback path.

The plugin path is **spec §14.4 constraint #4 native-preferred**; the wrapper path is the fallback. Per the design, both write to the same output.md frontmatter schema, so consumers can ignore which path produced the result.

## Install

### Project-local

```bash
mkdir -p .opencode/plugins/
cp /path/to/hopper-plugin/hosts/opencode/plugins/hopper-async.ts .opencode/plugins/
```

Then restart `opencode serve` (or the TUI).

### Global

```bash
mkdir -p ~/.config/opencode/plugins/
cp /path/to/hopper-plugin/hosts/opencode/plugins/hopper-async.ts ~/.config/opencode/plugins/
```

### npm package (post-essay)

Once we publish hopper-plugin to npm, you'll be able to:

```bash
opencode plugin add @surebeli/hopper-async
```

Until then, manual copy is the install path.

## Usage from inside an OpenCode session

Once the plugin is loaded, the OpenCode model has access to a new tool: `hopper_dispatch`.

Example session:

> You: "Dispatch T-PLUGIN-05a as a background task; I'll check back later."
> OpenCode (uses hopper_dispatch tool): "Dispatched. Output will appear at `.hopper/handoffs/T-PLUGIN-05a-output.md`. I'll let you know when it's done."

The plugin internally:
1. Validates task-id (same regex + `..` check as Tier A/B/C #1 — cross-host parity per spec §3 #5)
2. Creates a NEW isolated OpenCode session (separate from the main session)
3. Posts the prompt via `prompt_async` (returns 204 immediately)
4. Writes initial frontmatter to output.md with `status: in-progress`
5. Registers itself on `session.idle` hook
6. When the dispatched session goes idle, reads transcript + writes final frontmatter (`status: done` / `failed`) + log sidecar

## Prerequisites

- OpenCode CLI installed
- `opencode serve` running OR OpenCode TUI in plugin-aware mode
- Project has `.hopper/` directory (auto-detected via `HOPPER_DIR` env or project root)

## Behavior on failure

- **OpenCode `session.error` fires**: plugin writes `status: failed` to frontmatter, log sidecar contains the error message
- **Plugin can't create session** (server unreachable, auth issue): tool call throws; the dispatching model surfaces the error to the user
- **Task-id validation fails**: tool call throws BEFORE creating any session or writing any file

## Limits

- **No streaming progress** — the model that called `hopper_dispatch` doesn't see live output; it sees the final result via output.md after `session.idle`. If progress monitoring is needed, the model can periodically read the output.md frontmatter (cheap, just reads top of file).
- **Plugin sandbox** — plugins run in OpenCode's plugin sandbox; SDK access is limited to what `client` exposes. We use `client.session.create()` + `client.session.prompt_async()` + `client.session.messages()` only.
- **No cross-session cancellation** — user can `opencode session delete <id>` to abort, but the plugin doesn't expose a `cancel_hopper_dispatch` tool. Add later if needed.

## Spec compliance

Per spec v2.1.0 §14:
- §14.4 native-preferred: ✓ uses OpenCode's own primitives
- §14.6 single-spawn: ✓ one tool call → one OpenCode session → one prompt → one model response. No retry, no fallback, no orchestration.
- §14.10 forbidden behaviors: ✓ plugin does NOT auto-retry, does NOT mutate queue.md, does NOT cross-orchestrate

## Source

Pattern modeled on `kdcokenny/opencode-background-agents` (production precedent). Original idea: plugin + isolated sessions + markdown result files.
