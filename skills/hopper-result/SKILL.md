---
name: hopper-result
description: "Use when the user asks Hopper to show, fetch, print, inspect, or summarize the completed result of a dispatched task."
---

# Hopper Result

Print the closed result for a background-dispatched Hopper task. The CLI reads `.hopper/handoffs/<task-id>-output.md` and may return parser-designated output from its guarded sidecar.

## Steps

1. Locate the target project root containing `.hopper/`, then locate `hopper-dispatch` from `PATH` or the plugin root near this `SKILL.md`.
2. Validate the task ID with `^[A-Za-z][A-Za-z0-9._-]{0,99}$`; reject slashes, `..`, whitespace, quotes, shell metacharacters, and newlines.
3. Run `hopper-dispatch --result <task-id>`.
4. Surface the CLI output, including closed status, vendor, diagnostic, recovered-output advisory, and parser-designated output when `--full` is used.
5. If the task is still `in-progress`, tell the user to use `hopper-dispatch --watch <task-id>` or `hopper-dispatch --progress <task-id>`.

## Safety

- Do not modify the output, log, queue, or cost files.
- Do not re-dispatch on failure.
- `--result --full` returns only parser-designated output (the guarded sidecar when present). It never prints the raw vendor log. A failed task with `unknown-completeness` is advisory and may be incomplete; its terminal status remains failed.
- Do not surface raw vendor logs or infer completion beyond the closed recovery attestation.

