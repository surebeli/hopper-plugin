---
name: hopper-smoke
description: "Use when the user asks Hopper to verify plugin installation, check CLI readiness, run a smoke test, or confirm hopper-dispatch is callable."
---

# Hopper Smoke

Run Hopper's standalone CLI smoke check to verify the plugin host lifecycle and packaged CLI.

## Steps

1. Locate `hopper-dispatch`: prefer `PATH`; otherwise search upward from this `SKILL.md` for `cli/bin/hopper-dispatch`.
2. Run `hopper-dispatch --smoke` or `node <plugin-root>/cli/bin/hopper-dispatch --smoke`.
3. Expect a banner beginning with `hopper standalone (CLI v...` and exit code 0.
4. If it fails, surface the exact error and distinguish missing CLI, missing Node 18+, and other runtime errors.

## Safety

- Smoke is read-only and should not touch `.hopper/`.
- Do not treat a failed smoke as a dispatch failure; it is an install or runtime readiness failure.

