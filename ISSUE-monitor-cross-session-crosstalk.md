# ISSUE: hopper monitor crosses sessions — a new Claude session in a hopper project immediately receives ANOTHER session's terminal/monitor events

> Reporter: user (observed live) + governance-fusion session (corroborated in code)
> Date: 2026-06-17
> Severity: medium-high (UX correctness: a session is woken/notified by work it did not start; confusing and potentially actionable on the wrong task)
> Status: open
> Env: Claude Code with the hopper plugin installed; multiple sessions in the same project dir.

## Symptom (observed)

Starting a *second* Claude Code session in the same project directory that contains `.hopper/` causes the new session to **immediately** receive events belonging to a different session that is using hopper — e.g.:

```
● Agent "Re-investigate stop-500 in deployed fd5b739" completed · 10m 4s
● Monitor event: "Forward hopper terminal task events from .hopper/handoffs to Claude Code notifications"
```

The new session never dispatched that work, yet it is notified about it on startup ("串台" / crosstalk).

## Root cause (confirmed in code)

Three reinforcing factors:

1. **Project-wide monitor registration.** `monitors/monitors.json` registers:
   ```json
   { "name": "hopper-watch-events",
     "command": "node \"${CLAUDE_PLUGIN_ROOT}/cli/bin/hopper-dispatch\" --watch-events",
     "description": "Forward hopper terminal task events from .hopper/handoffs to Claude Code notifications" }
   ```
   Because this ships with the plugin, **every** Claude session opened in the project auto-starts the monitor against the **same** `.hopper/handoffs/`.

2. **No session scoping.** `runWatchEvents` (`cli/bin/hopper-dispatch`) watches the shared handoff dir and `listOutputMarkdownFiles()` returns **all** `*-output.md`; it emits a terminal event for every one of them. There is no filter by which session dispatched the task. Task `output.md` frontmatter even carries `session_id: null` — tasks are not tagged with the dispatching session, so no filtering is possible today.

3. **Startup replay of historical terminal events.** On launch, `runWatchEvents` calls `scanOutputs()` → `watchOutput()` → `maybeEmit()` for each existing file. `maybeEmit` emits whenever `isTerminalFrontmatter(fm)` is true and the seq hasn't been seen by *this* monitor instance (`lastSeenSeq` starts empty). So a freshly started monitor **immediately re-emits terminal events for tasks that were already done before it started** — including tasks from other sessions. This is the "immediately on startup" part of the symptom.

(The `Agent "...stop-500..." completed` line is an adjacent symptom that may be Claude-Code-side agent/notification routing rather than hopper directly; the **monitor event** and the immediate replay are squarely hopper. Both should be considered together since they co-occur in the same project.)

## Impact

- A new session is woken/notified by another session's (or historical) hopper task completions — noisy and misleading.
- A session cannot tell which of its own dispatches a completion belongs to vs. another session's.
- With several sessions in one repo (a normal multi-agent / dogfooding setup), terminal notifications fan out to all of them.

## Reproduction

1. In a project with the hopper plugin + a `.hopper/` that has at least one completed `*-output.md`, open Claude session A and dispatch a background task.
2. Open Claude session B in the **same** directory.
3. Session B immediately surfaces the `hopper-watch-events` monitor event and terminal events for tasks it never dispatched (including the already-completed ones).

## Suggested fix direction

1. **Tag tasks with the dispatching session.** Populate the existing `session_id` frontmatter field at dispatch time (from a `HOPPER_SESSION_ID` / Claude session id), and have `--watch-events` accept a target session (`--session <id>` or `HOPPER_SESSION_ID`) and emit only events for tasks matching it. Default the monitor command to the current session.
2. **Do not replay history on startup.** Seed `lastSeenSeq` from the current terminal state of each existing `*-output.md` on the first scan so the monitor only emits events for transitions that happen **after** it starts — never for tasks already terminal at startup.
3. Optionally make the project-wide monitor opt-in, or namespace its delivery per session, so two concurrent sessions don't both consume the same shared terminal events.
