---
description: Show .hopper/queue.md summary (pending / in-progress / done / failed counts). Read-only.
allowed-tools: Bash
---

This command runs inside a Claude Code session. It accepts no arguments.

Invoke the host-agnostic dispatcher in `--status` mode:

```bash
node "$CLAUDE_PLUGIN_ROOT/cli/bin/hopper-dispatch" --status
```

Surface the output to the user. This is a read-only query — it touches nothing under `.hopper/`.

If the user asks "what should I dispatch next?" after seeing status, suggest looking at `.hopper/queue.md` for the next pending row whose dependencies are all `done`, but do **not** auto-dispatch without explicit user instruction.
