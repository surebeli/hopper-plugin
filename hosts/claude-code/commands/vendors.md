---
description: List registered vendor adapters (codex, kimi, opencode, copilot, agy).
allowed-tools: Bash
---

Print the registered vendor adapters:

```bash
node "$CLAUDE_PLUGIN_ROOT/cli/bin/hopper-dispatch" --vendors
```

Expected output (Phase 3, 5 functional vendors per spec v2.0.3):

```
hopper-dispatch v0.4.0-phase-3 — registered vendor adapters:
  - codex
  - kimi
  - opencode
  - copilot
  - agy
```

If a vendor is missing from this list but referenced in `.hopper/AGENTS.md`, dispatch will fail with `Unknown vendor: <name>` — flag this to the user and suggest checking the vendor name spelling in AGENTS.md (vendor names are normalized: trailing `-cli` and `_cli` are stripped).
