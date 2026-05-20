---
description: Dispatch a task from .hopper/queue.md to its preferred vendor CLI via hopper-dispatch.
allowed-tools: Bash, Read
argument-hint: <task-id> [--write] [--force]
---

This command runs inside a Claude Code session and invokes the host-agnostic `hopper-dispatch` CLI to dispatch one task.

## What this command does

1. Read `.hopper/queue.md` to find the task and validate eligibility (pending + deps done)
2. Resolve the vendor via `.hopper/AGENTS.md` (task-vendor-preference > task.vendor > taskType default)
3. Load the task-type frame from `.hopper/tasks/<task-type>.md`
4. Spawn the vendor CLI subprocess **once** (no retry, no fallback — per llm-hopper spec §3 #4)
5. Parse the result and classify (success / auth-fail / timeout / permission-fail / unknown-fail)
6. If `--write` was passed, write `.hopper/handoffs/<task-id>-output.md` and emit suggested queue/cost edits

## Argument validation (do this BEFORE invoking Bash)

`$ARGUMENTS` is supplied by the user. Before passing to a subprocess, parse and validate:

1. Split `$ARGUMENTS` on whitespace into tokens.
2. The **first** token MUST be a task ID matching this exact regex: `^[A-Za-z][A-Za-z0-9._-]{0,99}$`. Reject anything containing `/`, `\`, `..`, shell metacharacters (`;`, `|`, `&`, `` ` ``, `$`, `(`, `)`, `<`, `>`, quotes), or newlines.
3. The **remaining** tokens MUST each be exactly one of: `--write`, `--force`. Reject anything else.
4. If validation fails: STOP. Print the offending input verbatim and ask the user to correct it. Do **not** invoke Bash with rejected input.

## Invocation (only after validation passes)

Build an explicit, properly-quoted command. Do not splat raw `$ARGUMENTS`. Example for task `T-PLUGIN-05a` with `--write`:

```bash
node "$CLAUDE_PLUGIN_ROOT/cli/bin/hopper-dispatch" "T-PLUGIN-05a" --write
```

If `$CLAUDE_PLUGIN_ROOT` is unset (older Claude Code or non-plugin invocation), fall back to a path search:

```bash
for root in \
  "$HOME/.claude/plugins/hopper" \
  "$HOME/.claude/plugins/hopper-plugin" \
  "./"; do
  if [ -f "$root/cli/bin/hopper-dispatch" ]; then
    node "$root/cli/bin/hopper-dispatch" "<validated-task-id>" <validated-flags>
    break
  fi
done
```

## After dispatch returns

Show the user:
- Task ID, resolved vendor, status, duration
- The full `--- OUTPUT ---` block on success, or the error context on failure

**If `--write` was in the validated arguments**:
- Confirm the output.md path that was written
- Show the suggested queue.md edit and suggested COST-LOG.md row that the dispatcher printed
- **Do NOT auto-apply** these edits. Per spec §11 (unified user-action gate), only the user can mark a task done. Ask the user: "Apply the suggested edits?" before touching `.hopper/queue.md` or `.hopper/COST-LOG.md`.

**If dispatch failed** (status != success):
- Surface the error block verbatim
- Suggest concrete next steps based on the status:
  - `auth-fail` — vendor needs auth setup (point at the specific env var / config path the adapter mentions)
  - `timeout` — consider retrying with `--write` after fixing root cause; do NOT auto-retry
  - `permission-fail` — vendor binary missing or sandbox blocking
  - `unknown-fail` — escalate to user; do not guess at fixes

## What this command MUST NOT do

- Do NOT re-invoke `hopper-dispatch` on failure (single-spawn invariant per spec §3 #4)
- Do NOT modify `.hopper/queue.md`, `.hopper/AGENTS.md`, or `.hopper/COST-LOG.md` without explicit user approval
- Do NOT batch-dispatch multiple tasks in one slash invocation (one slash = one task)
- Do NOT swallow errors silently — always surface vendor stderr / exit code if available
- Do NOT splat unvalidated `$ARGUMENTS` directly into a Bash command line
