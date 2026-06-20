---
description: Vendor readiness report — for every registered vendor show installed/auth/models/sandbox-control/web-search in one table, so you know what's usable before dispatching.
allowed-tools: Bash
argument-hint: [vendor] [--deep]
---

This command runs inside a Claude Code session. It accepts an optional vendor name and an optional `--deep` flag.

Print the consolidated vendor readiness report:

```bash
node "$CLAUDE_PLUGIN_ROOT/cli/bin/hopper-dispatch" --setup
```

For a single vendor, or to also probe flag/parameter drift (`<vendor> --help` vs the flags the adapter emits — one spawn per vendor):

```bash
node "$CLAUDE_PLUGIN_ROOT/cli/bin/hopper-dispatch" --setup codex --deep
```

## What it reports (per vendor)

- **Installed** — is the vendor CLI resolvable on PATH (or a known install path)?
- **Auth** — is auth detected (`ok`), or missing/unverified (`NO`)? See the auth notes for how to fix.
- **Sandbox** — `argv` means hopper can force `read-only` / `danger-full-access` via flags (so a review dispatch is genuinely locked down); `native` means the vendor only honors its own permission policy and is NOT argv-downgradable (e.g. kimi).
- **WebSrch** — `yes` means the adapter plumbs a web-search toggle (needed for research / market-research tasks). Today only **codex** does.
- **Models** — how many models are in the probe cache; run `/hopper:probe <vendor>` (or `--probe`) to populate.
- **Caps stale** — the date the adapter's hand-recorded capability metadata should be re-verified; `STALE …` means it has passed.

## How to use the output

- Before routing a task to a vendor, confirm it shows Installed=yes + Auth=ok.
- For a **research / PRD / market** task that needs the web, route only to a vendor whose **WebSrch=yes**.
- For a **review / read-only** task, prefer a vendor whose **Sandbox=argv** so read-only is actually enforced.
- The authoritative model/effort/sandbox matrix is `/hopper:vendors` + `hopper-dispatch --rules`; `--setup` is the readiness layer on top.

Surface the table to the user. If any vendor is NOT installed or Auth=NO, point them at `/hopper:smoke` and the install matrix; do not auto-install or auto-authenticate.
