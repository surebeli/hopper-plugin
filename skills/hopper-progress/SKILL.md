---
name: hopper-progress
description: "Use when the user asks Hopper to check progress, watch a background task, stream terminal events, inspect in-progress state, or monitor completion."
---

# Hopper Progress

Use progress commands for background-dispatched Hopper tasks. These commands read file-backed state from `.hopper/handoffs/`.

## Steps

1. Locate the target project root containing `.hopper/`, then locate `hopper-dispatch` from `PATH` or the plugin root near this `SKILL.md`.
2. For task-specific commands, validate the task ID with `^[A-Za-z][A-Za-z0-9._-]{0,99}$`.
3. For a snapshot, run `hopper-dispatch --progress <task-id>`.
4. To follow one task until terminal state, run `hopper-dispatch --watch <task-id>` only when the user wants a blocking watch.
5. To stream terminal events across tasks, run `hopper-dispatch --watch-events`; add `--once` only for scripts or when the user asks for one event.
6. Report status, phase, elapsed time, last progress text, output paths, and terminal event details.

## Safety

- Do not poll faster than needed; for waiting users, about every 10 seconds is enough.
- Do not re-dispatch failed or orphaned tasks from this skill.
- Do not edit output files, queue files, or cost logs unless the user explicitly asks.

