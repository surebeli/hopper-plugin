---
name: hopper
description: "Use when the user asks to operate Hopper or llm-hopper broadly, troubleshoot Hopper's file-backed .hopper protocol, or choose among Hopper dispatch, status, progress, result, probe, models, vendors, setup/doctor (vendor readiness), and smoke workflows."
---

# Hopper

Use Hopper as a thin, file-backed dispatcher. State lives in the target project's `.hopper/` directory. The dispatcher must not add hidden state, retry a failed vendor automatically, or switch vendors unless the user explicitly asks for that separate action.

## Locate The Target

1. Use the current working directory when it contains `.hopper/`.
2. Otherwise walk upward to the nearest directory containing `.hopper/`.
3. If no `.hopper/` exists, ask the user for the project root or `HOPPER_DIR`.
4. Run commands from the project root, or set `HOPPER_DIR` to the target `.hopper` path.

## Locate The CLI

Prefer `hopper-dispatch` on `PATH`. If it is not available, resolve the loaded `SKILL.md` path and search upward for `cli/bin/hopper-dispatch`. Marketplace installs should have the CLI two directories above the skill file:

```powershell
node <plugin-root>\cli\bin\hopper-dispatch <args>
```

When working inside the source repository, `node .\cli\bin\hopper-dispatch <args>` is also valid.

## Commands

- Queue status: `hopper-dispatch --status`
- Resolve a task without dispatching: `hopper-dispatch --resolve <task-id>`
- Dispatch one task: `hopper-dispatch <task-id> --background`
- Snapshot progress: `hopper-dispatch --progress <task-id>`
- Watch a task until terminal state: `hopper-dispatch --watch <task-id>`
- Read final output and log tail: `hopper-dispatch --result <task-id>`
- Watch terminal events: `hopper-dispatch --watch-events`
- Probe vendor capabilities: `hopper-dispatch --probe <vendor>`
- Read cached models: `hopper-dispatch --models <vendor>`
- Assert a model before dispatching: `hopper-dispatch --check-model <vendor> <model>` (verified/catalog-only/not-found; add `--json` for machine-readable output)
- List vendors: `hopper-dispatch --vendors`
- Vendor readiness (doctor): `hopper-dispatch --setup` (alias `--doctor`; add `--deep` for flag + model-catalog drift)
- Smoke check: `hopper-dispatch --smoke`

Diagnostics that read only the adapter registry — `--vendors`, `--rules`, `--setup`/`--doctor`, `--capabilities`, `--check-model`, `--probe`, `--models`, `--smoke` — do NOT need a `.hopper/` directory and run from anywhere. The project-context steps above apply to dispatch/status/result/progress, which operate on `.hopper/`.

## Safety Rules

- Validate task IDs before shelling out: `^[A-Za-z][A-Za-z0-9._-]{0,99}$`.
- Dispatch only one task per user request unless the user explicitly asks for multiple task IDs.
- Do not modify `.hopper/queue.md`, `.hopper/AGENTS.md`, or `.hopper/COST-LOG.md` unless the user explicitly asks for those file edits.
- Do not auto-retry, auto-fallback, or silently reroute on failure. Surface the dispatcher status, stderr, and output paths.
- For long tasks, prefer `--background`, then use `--progress`, `--watch`, `--watch-events`, or `--result`.
