# hopper-plugin host adapter: Claude Code

Anchor: `hosts/claude-code/README.md::root`

> **Status (2026-05-20)**: Phase 0 scaffold. Manifest schema is tentative pending T-PLUGIN-00 Prong 1 verification against current Claude Code plugin documentation.

## What this is

The Claude Code-specific host adapter. Registers three slash commands inside a Claude Code session:

- `/hopper:dispatch <task-id>` — dispatch a task from `.hopper/queue.md`
- `/hopper:status` — show queue summary
- `/hopper:smoke` — smoke test (T-PLUGIN-00 Prong 1 verifier)

All three commands shell out to `cli/bin/hopper-dispatch` (the host-agnostic standalone CLI in the repo root).

## Install (tentative; will be finalized in T-PLUGIN-09)

Approach A — symlink (Linux/macOS):

```bash
mkdir -p ~/.claude/plugins/hopper-plugin
ln -s /path/to/hopper-plugin/hosts/claude-code/.claude-plugin ~/.claude/plugins/hopper-plugin/.claude-plugin
```

Approach B — npm/marketplace (post-essay):

```
/plugin marketplace add surebeli/hopper-plugin
/plugin install hopper@surebeli-hopper
```

## Smoke test

After install:

```
/hopper:smoke
```

Expected output: `hopper smoke (standalone CLI v0.1.0-demo)`.

If you see anything else (plugin not loaded, command not found, slash command errors), Phase 0 Prong 1 hasn't completed — manifest schema needs verification.

## Why this is thin

Per spec §3 #4 (no harness reaction core), this adapter ONLY:
1. Receives slash command from Claude Code
2. Shells out to `cli/bin/hopper-dispatch` with the args
3. Streams stdout back to Claude Code chat
4. Exits

It does NOT:
- Maintain plugin state
- Retry on subprocess failure
- Fall back to alternative dispatch paths
- Cache queue.md
- Implement any orchestration logic

Vendor CLI is the harness. This adapter is the doorbell.

## Future hosts

Same pattern for `hosts/codex-cli/` (custom prompt wrapper) and `hosts/opencode/` (plugin module). Each host adapter is < 50 lines of glue, all calling the same `cli/bin/hopper-dispatch`.
