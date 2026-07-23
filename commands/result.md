---
description: Print the completed result of a hopper-dispatched task in the host session (closed attestation + parser-designated output).
allowed-tools: Bash, Read
argument-hint: <task-id> [--full]
---

This command surfaces a background-dispatched task's closed result in the current Claude Code session. It reads `.hopper/handoffs/<task-id>-output.md` and, when present, the guarded parser-designated sidecar. It does not expose raw vendor logs.

## What this command does

1. Validate the task-id (`^[A-Za-z][A-Za-z0-9._-]{0,99}$`)
2. Invoke `hopper-dispatch --result <task-id>` which:
   - Reads frontmatter for status (done/failed/orphaned/in-progress)
   - Prints a closed attestation summary (vendor · status · diagnostic · recovered-output state)
   - With `--full`, prints only parser-designated output from the guarded sidecar, or the sanitized output.md body when no eligible sidecar exists
3. Surface that output verbatim to the user

## Argument validation (BEFORE Bash)

`$ARGUMENTS` is supplied by the user. Validate the single positional argument is a task-id matching `^[A-Za-z][A-Za-z0-9._-]{0,99}$`. Reject anything with `/`, `\`, `..`, shell metacharacters, or whitespace. If invalid: STOP, surface the offending input, and ask the user to retry.

## Invocation

```bash
node "$CLAUDE_PLUGIN_ROOT/cli/bin/hopper-dispatch" --result "<validated-task-id>"
```

Fallback if `$CLAUDE_PLUGIN_ROOT` is unset:

```bash
for root in \
  "$HOME/.claude/plugins/hopper" \
  "$HOME/.claude/plugins/hopper-plugin" \
  "./"; do
  if [ -f "$root/cli/bin/hopper-dispatch" ]; then
    node "$root/cli/bin/hopper-dispatch" --result "<validated-task-id>"
    break
  fi
done
```

## Long output (review / research)

The printed body is a **preview** (capped ~8000 chars background / ~4096 sync). When parser-designated output is longer (common for review/research/market briefs), the CLI prints a `--full` hint and the complete parser-designated text is preserved in the guarded sidecar `<task-id>-output-raw.txt`. To surface that text, add `--full`:

```bash
node "$CLAUDE_PLUGIN_ROOT/cli/bin/hopper-dispatch" --result "<validated-task-id>" --full
```

`--result --full` returns only parser-designated output (the guarded sidecar when present). It never prints the raw vendor log. A failed task with `unknown-completeness` is advisory and may be incomplete; its terminal status remains failed.

For research / market results (usually long), prefer `--full` by default so the user sees the complete parser-designated brief. The inline preview cap can also be raised globally with `HOPPER_OUTPUT_PREVIEW_MAX=<chars>`.

## Exit code handling

- **Exit 0**: task is `done` (success). Surface the full output to the user.
- **Exit 1**: task is `failed` or `orphaned`. Surface the output + failure context.
- **Exit 2**: task is still `in-progress`. Tell the user the task is still running and recommend `hopper-dispatch --watch <task-id>` to follow until done. Do NOT auto-watch from this slash command (would block this Claude Code turn for up to 30 min).

## Output formatting in chat

The CLI prints the closed attestation first, then parser-designated output when `--full` is requested:

```
=== <task-id> — <STATUS> ===
Vendor:    <vendor>
Status:    <status>
Recovered output: <none|state (advisory)>

--- FULL OUTPUT (sidecar) ---
<parser-designated verdict + findings, when present>
--- END FULL OUTPUT ---
```

Surface the closed attestation and parser-designated output verbatim. Do NOT surface raw vendor logs.

## What this command MUST NOT do

- Do NOT modify the output.md, sidecar, log, or queue.md (read-only)
- Do NOT auto-watch in-progress tasks (use `hopper-dispatch --watch` separately if the user wants live tail)
- Do NOT re-dispatch on failure (single-spawn invariant per spec §3 #4)
- Do NOT splat unvalidated `$ARGUMENTS` into a Bash command line
