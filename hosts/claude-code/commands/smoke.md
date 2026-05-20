---
description: Plugin host-lifecycle smoke test. Prints hopper-dispatch version + readiness banner. Verifies T-PLUGIN-00 Prong 1.
allowed-tools: Bash
---

Run the dispatcher's standalone smoke test:

```bash
node "$CLAUDE_PLUGIN_ROOT/cli/bin/hopper-dispatch" --smoke
```

Expected output starts with `hopper standalone (CLI v0.4.0-phase-3)` (or current version). If the binary runs and exits 0, the Claude Code plugin host adapter is functional (Tier B verified).

If the binary is not found:
- `$CLAUDE_PLUGIN_ROOT` is not set or points to wrong directory → plugin install issue
- node binary missing → user needs Node 18+ on PATH
- Surface the exact error to the user and suggest checking install instructions in `hosts/claude-code/README.md`

This command is the verifier for T-PLUGIN-00 Prong 1 (Claude Code plugin install gate). Reports PASS if the smoke banner prints; otherwise reports the specific failure mode without retrying.
