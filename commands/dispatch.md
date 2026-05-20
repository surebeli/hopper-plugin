---
description: Dispatch a task from .hopper/queue.md to its preferred vendor CLI via hopper-dispatch.
allowed-tools: Bash, Read
argument-hint: <task-id> [--write] [--force] [--model <name>] [--reasoning <low|medium|high|xhigh>]
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
   - Bare flag: `--write` or `--force` (no value follows)
   - Value flag: `--model <name>` (consumes next token) — `<name>` must match `^[A-Za-z][A-Za-z0-9._/:-]{0,99}$`
   - Value flag: `--reasoning <level>` (consumes next token) — `<level>` must be exactly one of `low`, `medium`, `high`, `xhigh`
   - Reject anything else.
4. If validation fails: STOP. Print the offending input verbatim and ask the user to correct it. Do **not** invoke Bash with rejected input.

**What `--model` and `--reasoning` do**: they forward to the vendor adapter via `executeDispatch`'s `adapterOpts`. Adapters honor them differently:
- `--model` honored by: kimi, opencode, copilot (becomes `-m / --model <name>` to the vendor CLI)
- `--reasoning` honored by: codex (becomes `model_reasoning_effort=<level>`); other adapters ignore it harmlessly

## Invocation (only after validation passes)

Build an explicit, properly-quoted command. Do not splat raw `$ARGUMENTS`. Examples:

```bash
# Plain dispatch + write
node "$CLAUDE_PLUGIN_ROOT/cli/bin/hopper-dispatch" "T-PLUGIN-05a" --write

# With adapter opts
node "$CLAUDE_PLUGIN_ROOT/cli/bin/hopper-dispatch" "T-PLUGIN-05a" --write --model "kimi-thinking" --reasoning "high"
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
- Surface the error block verbatim. Do NOT auto-retry.
- Do NOT propose fixes, retries, or vendor-switches as soft-orchestration. If the user explicitly asks for diagnosis, you may then explain the failure mode (auth-fail / timeout / permission-fail / unknown-fail) and what the adapter's error message means. Otherwise, dispatch + surface is the full scope.

Per codex final strict audit (Category C): Tier B's previous prompt suggested status-specific next steps, inconsistent with Tier C's "no soft-orchestration" stance. Now aligned across all 4 hosts: surface only, diagnose only if user explicitly asks.

## What this command MUST NOT do

- Do NOT re-invoke `hopper-dispatch` on failure (single-spawn invariant per spec §3 #4)
- Do NOT modify `.hopper/queue.md`, `.hopper/AGENTS.md`, or `.hopper/COST-LOG.md` without explicit user approval
- Do NOT batch-dispatch multiple tasks in one slash invocation (one slash = one task)
- Do NOT swallow errors silently — always surface vendor stderr / exit code if available
- Do NOT splat unvalidated `$ARGUMENTS` directly into a Bash command line
