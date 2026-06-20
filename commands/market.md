---
description: Directed market research — dispatch a one-off web-search-backed market/competitor research task (no queue.md row), then surface the full brief.
allowed-tools: Bash, Read
argument-hint: <topic> [--vendor <name>]
---

One-shot market research via hopper's **ad-hoc** dispatch (no `queue.md` row). The `market-research` task-type auto-enables **web search** and a **read-only** sandbox, and routes to **codex** unless `--vendor` overrides.

## What this does
1. Build a market-research brief from `$ARGUMENTS`.
2. Dispatch a one-off `market-research` task via `hopper-dispatch --adhoc`.
3. Surface the **full** brief with `--result <id> --full` (market briefs are long — always use `--full`).

## Steps
1. Parse `$ARGUMENTS`: the leading text is the market TOPIC/question. Optional `--vendor <name>` overrides the vendor (validate it is a lowercase registered vendor).
2. Compose a focused brief: the topic + "use web search; produce a sourced, structured market brief — sizing (TAM/SAM where possible), key players/competitors, trends, pricing signals, and risks; cite sources; research only — no code."
3. Pick a short id matching `^[A-Za-z][A-Za-z0-9._-]{0,99}$`, e.g. `market-<8-char-slug>`.
4. Resolve the binary as in `/hopper:dispatch`, then dispatch in the background (Bash tool with `run_in_background: true`):

```bash
node "$HOPPER_BIN" --adhoc --task-type market-research --brief "<composed brief>" --id "<id>" --background
# add --vendor <name> to override (default = codex; web search auto-enabled by the task-type)
```

5. Poll, then surface the FULL result:

```bash
node "$HOPPER_BIN" --result "<id>" --full
```

Surface verbatim.

## Notes
- Only **codex** is wired for headless web search today; non-codex `--vendor` may not actually search.
- For product-requirement / feature research, use `/hopper:research`.

## MUST NOT
- Do NOT re-dispatch on failure (single-spawn).
- Do NOT edit the repo or `queue.md` (read-only by task-type default).
- Do NOT splat unvalidated `$ARGUMENTS`; build + quote the brief.
