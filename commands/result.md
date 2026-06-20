---
description: Print the completed result of a hopper-dispatched task in the host session (vendor verdict + log tail).
allowed-tools: Bash, Read
argument-hint: <task-id> [--full]
---

This command surfaces a background-dispatched task's result in the current Claude Code session. Phase 6b/6c dispatched tasks land their output in `.hopper/handoffs/<task-id>-output.md` (frontmatter + body) and matching `.log` (raw vendor stdout) — invisible to the host session without explicit retrieval. This command performs that retrieval.

## What this command does

1. Validate the task-id (`^[A-Za-z][A-Za-z0-9._-]{0,99}$`)
2. Invoke `hopper-dispatch --result <task-id>` which:
   - Reads frontmatter for status (done/failed/orphaned/in-progress)
   - Prints a chat-friendly summary (vendor · status · duration · exit code)
   - Prints the output.md body (verdict + findings, when the vendor wrote there)
   - Prints the last ~4000 bytes of the .log (vendor's stdout tail — useful for vendors like codex that emit their final message to stdout rather than output.md)
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

The printed body is a **preview** (capped ~8000 chars background / ~4096 sync). When the vendor output is longer (common for review/research/market briefs), the CLI prints a `--full` hint and the COMPLETE text is preserved in the sidecar `<task-id>-output-raw.txt`. To surface the full text, add `--full`:

```bash
node "$CLAUDE_PLUGIN_ROOT/cli/bin/hopper-dispatch" --result "<validated-task-id>" --full
```

For research / market results (usually long), prefer `--full` by default so the user sees the complete brief. The inline preview cap can also be raised globally with `HOPPER_OUTPUT_PREVIEW_MAX=<chars>`.

## Exit code handling

- **Exit 0**: task is `done` (success). Surface the full output to the user.
- **Exit 1**: task is `failed` or `orphaned`. Surface the output + failure context.
- **Exit 2**: task is still `in-progress`. Tell the user the task is still running and recommend `hopper-dispatch --watch <task-id>` to follow until done. Do NOT auto-watch from this slash command (would block this Claude Code turn for up to 30 min).

## Output formatting in chat

The CLI prints three sections in this order:

```
=== <task-id> — <STATUS> ===
Vendor:    <vendor>
Status:    <status>
Duration:  <s>s
Exit code: <n>

--- OUTPUT.MD BODY ---
<verdict + findings, when present>
--- END BODY ---

--- LOG TAIL (last N bytes) ---
<vendor's stdout tail; for codex/copilot the final verdict often lives here>
--- END LOG ---
```

Surface this verbatim. Do NOT summarize or paraphrase unless the user explicitly asks — the raw output IS the chat artifact.

## What this command MUST NOT do

- Do NOT modify the output.md, log, or queue.md (read-only)
- Do NOT auto-watch in-progress tasks (use `hopper-dispatch --watch` separately if the user wants live tail)
- Do NOT re-dispatch on failure (single-spawn invariant per spec §3 #4)
- Do NOT splat unvalidated `$ARGUMENTS` into a Bash command line
