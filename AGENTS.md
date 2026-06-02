# Codex CLI bootstrap

Anchor: `AGENTS.md::root`

When a Codex CLI session enters this directory, read `.hopper/PING.md` to load the protocol. When the user types `ping`, follow PING.md procedure. When the user types `review <task-id>`, follow PING.md Leader Review Protocol.

Project context: `.hopper/MANIFEST.md` (phase cursor).
Active dispatches: `.hopper/handoffs/strategy-*.md` (latest dispatch is the active cursor).
Role binding: `.hopper/AGENTS.md` (NOT this file — this file is the Codex CLI bootstrap pointer).

## Workspace Guidance

This file remains the repo's single always-on instruction surface. Add narrower guidance under `.github/instructions/` instead of creating a second project-wide instructions file.

### Start Here

- Read [README.md](README.md) for the product overview, quick-start commands, and top-level architecture.
- Use [docs/cookbook.md](docs/cookbook.md) for concrete dispatch, progress, watch-events, probe, and reap flows.
- Read the closest area README before editing a subsystem: [dashboard/README.md](dashboard/README.md), [hosts/claude-code/README.md](hosts/claude-code/README.md), or the matching README under `hosts/`.

### Architecture Boundaries

- `cli/bin/` contains the user-facing CLIs such as `hopper-dispatch` and `hopper-dashboard`.
- `cli/src/*.js` contains the thin file-protocol implementation: dispatch, queue/progress/output handling, validation, subprocess orchestration, and vendor adapters.
- `commands/*.md` and `monitors/monitors.json` are shipped host-integration assets. Keep them aligned with CLI flags and the host README docs.
- `dashboard/client/` is the React/Vite UI. It consumes the same `.hopper/` state and must remain loopback-only and read-mostly.
- `.hopper/` is live dogfood state, not passive docs. Follow [`.hopper/PING.md`](.hopper/PING.md), [`.hopper/MANIFEST.md`](.hopper/MANIFEST.md), and [`.hopper/AGENTS.md`](.hopper/AGENTS.md) before changing shared coordination files or vendor routing.

### Build and Validation

- Use Node `>=18` and `npm`; this repo ships `package-lock.json`.
- `npm test` runs the unit suite. Prefer narrow `node --test tests/unit/<name>.test.js` or `node --test tests/integration/<name>.test.js` checks for the touched slice first.
- `npm run smoke` exercises the CLI install surface.
- For dashboard work, run `npm run dashboard:build`; use `npm run dashboard:dev` when you need HMR.

### Project-Specific Gotchas

- Keep the plugin thin and file-backed. Do not add hidden databases, automatic vendor retry/fallback, or runtime orchestration that contradicts [README.md](README.md).
- Preserve the dashboard's `127.0.0.1`-only binding and read-mostly contract; probing a vendor is the only intended write path there.
- Avoid unnecessary line-ending churn in `commands/*.md`; on Windows, CRLF can trip strict frontmatter tests called out in [dashboard/README.md](dashboard/README.md).
