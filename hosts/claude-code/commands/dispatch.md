---
description: Dispatch a task from .hopper/queue.md to its preferred vendor CLI via hopper-dispatch.
allowed-tools: Bash, Read
argument-hint: <task-id> [--write] [--force]
---

You are the **hopper plugin host adapter** running inside a Claude Code session.

## What this command does

Invokes the host-agnostic `hopper-dispatch` CLI to dispatch a task:

1. Read `.hopper/queue.md` to find the task and validate eligibility (pending + deps done)
2. Resolve the vendor via `.hopper/AGENTS.md` (task-vendor-preference > task.vendor > taskType default)
3. Load the task-type frame from `.hopper/tasks/<task-type>.md`
4. Spawn the vendor CLI subprocess **once** (no retry, no fallback — per llm-hopper spec §3 #4)
5. Parse the result and classify (success / auth-fail / timeout / permission-fail / unknown-fail)
6. If `--write` was passed, write `.hopper/handoffs/<task-id>-output.md` and emit suggested queue/cost edits

## Steps

Run the dispatcher with the user-supplied arguments using the Bash tool:

```bash
node "$CLAUDE_PLUGIN_ROOT/cli/bin/hopper-dispatch" $ARGUMENTS
```

If `$CLAUDE_PLUGIN_ROOT` is not set (older Claude Code versions or non-plugin invocation), fall back to looking up the path:

```bash
# Fallback: search common install locations
for root in \
  "$HOME/.claude/plugins/hopper" \
  "$HOME/.claude/plugins/hopper-plugin" \
  "./hopper-plugin"; do
  if [ -f "$root/cli/bin/hopper-dispatch" ]; then
    node "$root/cli/bin/hopper-dispatch" $ARGUMENTS
    break
  fi
done
```

## After dispatch returns

Show the user:
- Task ID, resolved vendor, status, duration
- The full `--- OUTPUT ---` block on success, or the error context on failure

**If `--write` was in the arguments**:
- Confirm the output.md path that was written
- Show the suggested queue.md edit and suggested COST-LOG.md row that the dispatcher printed
- **Do NOT auto-apply** these edits. Per spec §11 (unified user-action gate), only the user can mark a task done. Ask the user: "Apply the suggested edits?" before touching `.hopper/queue.md` or `.hopper/COST-LOG.md`.

**If dispatch failed** (status != success):
- Surface the error block verbatim
- Suggest concrete next steps based on the status:
  - `auth-fail` → vendor needs auth setup (point at the specific env var / config path the adapter mentions)
  - `timeout` → consider retrying with `--write` after fixing root cause; do NOT auto-retry
  - `permission-fail` → vendor binary missing or sandbox blocking
  - `unknown-fail` → escalate to user; do not guess at fixes

## What this command MUST NOT do

- Do NOT re-invoke `hopper-dispatch` on failure (single-spawn invariant)
- Do NOT modify `.hopper/queue.md`, `.hopper/AGENTS.md`, or `.hopper/COST-LOG.md` without explicit user approval
- Do NOT batch-dispatch multiple tasks in one slash invocation (one slash = one task)
- Do NOT swallow errors silently — always surface vendor stderr / exit code if available
