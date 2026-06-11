---
description: List registered vendor adapters (codex, kimi, opencode, copilot, agy, grok, mimo).
allowed-tools: Bash
---

This command runs inside a Claude Code session. It accepts no arguments.

Print the registered vendor adapters:

```bash
node "$CLAUDE_PLUGIN_ROOT/cli/bin/hopper-dispatch" --vendors
```

The dispatcher will print its own version banner and the registered adapter list. As of v0.8.0, 7 functional vendors are registered: codex, kimi, opencode, copilot, agy, grok, mimo.

If a vendor is missing from this list but referenced in `.hopper/AGENTS.md`, dispatch will fail with `Unknown vendor: <name>` — flag this to the user and suggest checking the vendor name spelling in AGENTS.md (vendor names are normalized: trailing `-cli` and `_cli` are stripped).
