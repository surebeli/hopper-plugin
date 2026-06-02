---
description: "Use when editing .hopper queue, handoffs, MANIFEST, PING protocol, cost log, or other dogfood coordination files."
applyTo: ".hopper/**"
---
# Hopper State Guidance

- Treat `.hopper/` as live shared state, not archived notes.
- Fresh-read the specific `.hopper/` file immediately before editing it; another session may have changed it.
- Use [../../.hopper/PING.md](../../.hopper/PING.md) for queue and handoff workflow rules, [../../.hopper/MANIFEST.md](../../.hopper/MANIFEST.md) for the current phase cursor, and [../../.hopper/AGENTS.md](../../.hopper/AGENTS.md) for vendor/task routing.
- Make minimal edits to shared markdown tables and logs; do not rewrite unrelated rows, history, or timestamps.
- Keep queue status, handoff output, and cost-log updates consistent when the protocol requires all three.