---
description: "Use when editing the hopper dashboard UI, SSE views, probe action, or local dashboard server behavior."
applyTo:
  - "dashboard/**"
  - "cli/bin/hopper-dashboard"
  - "tests/unit/dashboard*.test.js"
---
# Dashboard Guidance

- Read [../../dashboard/README.md](../../dashboard/README.md) first and use [../../docs/sidequests/web-dashboard/SPEC.md](../../docs/sidequests/web-dashboard/SPEC.md) for the detailed design contract.
- Preserve the loopback-only invariant: the dashboard must bind to `127.0.0.1`, not `0.0.0.0`, `::`, or `*`.
- Treat the dashboard as read-mostly. Queue, task, log, progress, cost, and agents views stay file-backed via `.hopper/`; `--probe <vendor>` is the only intended mutation and must stay tightly allowlisted.
- Keep SSE channels, task detail behavior, and probe safety aligned with the dashboard README contract.
- Validate with `npm run dashboard:build` plus the narrowest relevant `node --test tests/unit/dashboard-*.test.js` check.