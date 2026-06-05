---
name: hopper-status
description: "Use when the user asks Hopper for queue status, pending/in-progress/done/failed counts, or a read-only .hopper queue summary."
---

# Hopper Status

Show the `.hopper/queue.md` summary. This is read-only.

## Steps

1. Locate the target project root containing `.hopper/`, then locate `hopper-dispatch` from `PATH` or the plugin root near this `SKILL.md`.
2. Run `hopper-dispatch --status`.
3. Surface the queue summary exactly enough for the user to see pending, in-progress, done, and failed counts.
4. If the user asks what to dispatch next, inspect `.hopper/queue.md` for pending tasks with satisfied dependencies, but do not dispatch without explicit instruction.

## Safety

- Do not modify `.hopper/queue.md`.
- Do not dispatch from this skill unless the user separately asks to run a task.

