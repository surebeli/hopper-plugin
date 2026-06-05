---
name: hopper-dispatch
description: "Use when the user asks Hopper to dispatch, run, start, resolve, or preflight one .hopper queue task through hopper-dispatch."
---

# Hopper Dispatch

Dispatch exactly one Hopper task unless the user explicitly provides multiple task IDs.

## Steps

1. Locate the target project root: use the current directory when it contains `.hopper/`; otherwise walk upward. If no `.hopper/` exists, ask for the project root or `HOPPER_DIR`.
2. Locate the CLI: prefer `hopper-dispatch` on `PATH`; otherwise search upward from this `SKILL.md` for `cli/bin/hopper-dispatch` and run it with `node`.
3. Validate the task ID before shelling out: `^[A-Za-z][A-Za-z0-9._-]{0,99}$`. Reject `/`, `\`, `..`, shell metacharacters, quotes, whitespace, and newlines.
4. Validate optional flags only from this set: `--background`, `--write`, `--force`, `--model <name>`, `--reasoning <low|medium|high|xhigh>`, `--resolve`, `--check`, `--capabilities`.
5. For long-running tasks, prefer `--background`; for dry routing checks, use `--resolve <task-id>` or `--check <task-id>`.
6. Surface the dispatcher output, including vendor, status, duration, output paths, stderr, and any failure context.

## Safety

- Do not modify `.hopper/queue.md`, `.hopper/AGENTS.md`, or `.hopper/COST-LOG.md` unless the user explicitly asks for those edits.
- Do not retry, fall back to another vendor, or reroute after a failure unless the user asks for a separate follow-up action.
- Do not pass unvalidated user text into the shell.

