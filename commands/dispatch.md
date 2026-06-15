---
description: Dispatch a task from .hopper/queue.md to its preferred vendor CLI via hopper-dispatch. Supports --background for long-running tasks (spec §14).
allowed-tools: Bash, Read
argument-hint: <task-id> [--background] [--write] [--force] [--model <name>] [--reasoning <minimal|low|medium|high|xhigh>] [--sandbox <read-only|workspace-write|danger-full-access>]
---

This command runs inside a Claude Code session and invokes the host-agnostic `hopper-dispatch` CLI to dispatch one task.

## What this command does

1. Read `.hopper/queue.md` to find the task and validate eligibility (pending + deps done)
2. Resolve the vendor via `.hopper/AGENTS.md` (lookup order: queue.md row override > task-vendor-preference table > taskType default > `Active Agent Instances` table)
3. Load the task-type frame from `.hopper/tasks/<task-type>.md`
4. Spawn the vendor CLI subprocess **once** (no retry, no fallback — per llm-hopper spec §3 #4)
5. Parse the result and classify (success / auth-fail / timeout / permission-fail / unknown-fail)
6. If `--write` was passed, write `.hopper/handoffs/<task-id>-output.md` and emit suggested queue/cost edits

## Argument validation (do this BEFORE invoking Bash)

`$ARGUMENTS` is supplied by the user. Before passing to a subprocess, parse and validate:

1. Split `$ARGUMENTS` on whitespace into tokens.
2. The **first** token MUST be a task ID matching this exact regex: `^[A-Za-z][A-Za-z0-9._-]{0,99}$`. Reject anything containing `/`, `\`, `..`, shell metacharacters (`;`, `|`, `&`, `` ` ``, `$`, `(`, `)`, `<`, `>`, quotes), or newlines.
3. The **remaining** tokens are one of these forms:
   - Bare flag: `--write`, `--force`, or `--background` (no value follows)
   - Value flag: `--model <name>` (consumes next token) — `<name>` must match `^[A-Za-z][A-Za-z0-9._/:-]{0,99}$`
   - Value flag: `--reasoning <level>` (consumes next token) — `<level>` must be exactly one of `minimal`, `low`, `medium`, `high`, `xhigh`
   - Value flag: `--sandbox <mode>` (consumes next token) — `<mode>` must be exactly one of `read-only`, `workspace-write`, `danger-full-access`
   - Reject anything else.
4. If validation fails: STOP. Print the offending input verbatim and ask the user to correct it. Do **not** invoke Bash with rejected input.

**What `--model`, `--reasoning`, and `--sandbox` do**: they forward to the vendor adapter via `executeDispatch`'s `adapterOpts`. Adapters honor them differently:
- `--model` honored by: kimi, opencode, copilot, grok, mimo (becomes `-m / --model <name>` to the vendor CLI)
- `--reasoning` honored by: codex (becomes `model_reasoning_effort=<level>`) and mimo (becomes `--variant <level>`, with `xhigh` mapped to `max`); other adapters ignore it harmlessly
- `--sandbox` default: `danger-full-access` unless the task brief/spec explicitly says `read-only` / `只读`; explicit `--sandbox` overrides the auto default
- `--sandbox` mappings: codex uses `-s <mode>`; opencode/agy map `danger-full-access` to `--dangerously-skip-permissions`; copilot maps it to `--allow-all-tools --allow-all-paths`; grok maps it to `--always-approve`; mimo maps default full access to `--agent build --dangerously-skip-permissions` and read-only to `--agent plan`; kimi `-p` uses Kimi's native auto permission policy and rejects `--prompt` combined with `--yolo` / `--auto` / `--plan`, so hopper does not forward sandbox argv

## Invocation modes — pick ONE based on arguments

### Mode A: SYNC dispatch (default — no `--background` flag)

The Bash tool blocks until the dispatcher returns. Best for fast tasks (<30s) or when you want immediate result inline.

Build an explicit, properly-quoted command. Do not splat raw `$ARGUMENTS`:

```bash
# Plain dispatch + write
node "$CLAUDE_PLUGIN_ROOT/cli/bin/hopper-dispatch" "T-PLUGIN-05a" --write

# With adapter opts
node "$CLAUDE_PLUGIN_ROOT/cli/bin/hopper-dispatch" "T-PLUGIN-05a" --write --model "kimi-code/kimi-for-coding" --reasoning "high" --sandbox "danger-full-access"
```

### Mode B: BACKGROUND dispatch (`--background` flag present)

**Per spec §14**: the dispatcher returns immediately (<100ms) with a PID. The vendor subprocess runs detached, writes result to `.hopper/handoffs/<task-id>-output.md` (frontmatter + sidecar `.log`). Use this mode for long-running tasks (>1 min, e.g. kimi thinking-enabled models / codex xhigh / agy long reasoning).

**You MUST use Claude Code's native background-Bash mechanism** to avoid freezing this session:

```bash
# Invoke the dispatcher as a background Bash tool call
# Set run_in_background=true on the Bash tool invocation
node "$CLAUDE_PLUGIN_ROOT/cli/bin/hopper-dispatch" "T-PLUGIN-05a" --background
```

When you call the Bash tool, use `{ "run_in_background": true }` — this returns immediately with a shell-id but does NOT block your turn.

**After dispatch returns** (the dispatcher's own output, NOT the vendor's):
- Note the task ID, runner PID, output paths from the dispatcher's stdout
- Tell the user: "Background dispatch started for `T-PLUGIN-XX`. Vendor: `<X>`. I'll check progress periodically; you can also follow with `/hopper:dispatch --watch T-PLUGIN-XX` in another session."

**Polling progress** (when user asks "how's it going?" OR every ~30s if they're waiting):

Use the Monitor tool on the background Bash shell (if it's still alive), OR poll the output.md frontmatter via:

```bash
# Read frontmatter only (cheap)
head -20 "<repo-root>/.hopper/handoffs/T-PLUGIN-XX-output.md"
```

Look for `status:` line. While `status: in-progress`, report ongoing. When status flips to `done`, `failed`, or `orphaned`, surface the final state and the sidecar `.log` excerpt to the user.

**Do NOT poll faster than ~10s intervals** — wastes Bash tool budget. The user can manually invoke `/hopper:dispatch --watch T-X` in a separate session for real-time tail.

### Mode C: Robust dispatcher resolution (handles unset OR wrong `$CLAUDE_PLUGIN_ROOT`)

Both sync and background modes must locate the dispatcher binary. `$CLAUDE_PLUGIN_ROOT`
may be **unset** OR **set to a wrong path** — the 2026-06-04 field retrospective observed
it pointing at `/`, which made `node "$CLAUDE_PLUGIN_ROOT/cli/bin/hopper-dispatch"` resolve
to `/cli/bin/hopper-dispatch` and fail with `MODULE_NOT_FOUND`. So **validate the path before
using it**, and fall back to a search otherwise:

```bash
# Resolve hopper-dispatch robustly: use $CLAUDE_PLUGIN_ROOT only if it actually
# contains the binary; otherwise search known install locations.
HOPPER_BIN=""
if [ -n "$CLAUDE_PLUGIN_ROOT" ] && [ -f "$CLAUDE_PLUGIN_ROOT/cli/bin/hopper-dispatch" ]; then
  HOPPER_BIN="$CLAUDE_PLUGIN_ROOT/cli/bin/hopper-dispatch"
else
  for root in \
    "$HOME/.claude/plugins/hopper" \
    "$HOME/.claude/plugins/hopper-plugin" \
    "./"; do
    if [ -f "$root/cli/bin/hopper-dispatch" ]; then
      HOPPER_BIN="$root/cli/bin/hopper-dispatch"
      break
    fi
  done
fi
if [ -z "$HOPPER_BIN" ]; then
  echo "hopper-dispatch not found. Set CLAUDE_PLUGIN_ROOT to the plugin root, or install the plugin under ~/.claude/plugins/hopper." >&2
  exit 1
fi
node "$HOPPER_BIN" "<validated-task-id>" <validated-flags>
```

You do NOT need to `cd` into the plugin's CLI directory: `hopper-dispatch` locates its own
helpers via `import.meta.url`, and (per the retro #3 fix) the dispatched vendor runs in the
repo root that owns `.hopper/`, regardless of your shell's CWD. Run from the project, or set
`HOPPER_DIR=/path/to/project/.hopper`.

## After dispatch returns (sync mode only)

Show the user:
- Task ID, resolved vendor, status, duration
- The full `--- OUTPUT ---` block on success, or the error context on failure

**If `--write` was in the validated arguments**:
- Confirm the output.md path that was written
- Show the suggested queue.md edit and suggested COST-LOG.md row that the dispatcher printed
- **Do NOT auto-apply** these edits. Per spec §11 (unified user-action gate), only the user can mark a task done. Ask the user: "Apply the suggested edits?" before touching `.hopper/queue.md` or `.hopper/COST-LOG.md`.

**If dispatch failed** (status != success):
- Surface the error block verbatim. Do NOT auto-retry.
- Do NOT propose fixes, retries, or vendor-switches as soft-orchestration. If the user explicitly asks for diagnosis, you may then explain the failure mode (auth-fail / timeout / permission-fail / unknown-fail) and what the adapter's error message means. Otherwise, dispatch + surface is the full scope.

Per codex final strict audit (Category C): Tier B's previous prompt suggested status-specific next steps, inconsistent with Tier C's "no soft-orchestration" stance. Now aligned across all supported host paths: surface only, diagnose only if the user explicitly asks.

## What this command MUST NOT do

- Do NOT re-invoke `hopper-dispatch` on failure (single-spawn invariant per spec §3 #4 + §14.10)
- Do NOT modify `.hopper/queue.md`, `.hopper/AGENTS.md`, or `.hopper/COST-LOG.md` without explicit user approval
- Do NOT batch-dispatch multiple tasks in one slash invocation (one slash = one task)
- Do NOT swallow errors silently — always surface vendor stderr / exit code if available
- Do NOT splat unvalidated `$ARGUMENTS` directly into a Bash command line
- Do NOT poll background tasks faster than ~10s — wastes Bash tool budget
- Do NOT use sync mode for tasks known to exceed 1 min — use `--background` instead to keep the user's session responsive
