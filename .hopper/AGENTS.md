# hopper-plugin Agent Instances

Generated: 2026-05-20T00:00:00+08:00
Role System: llm-hopper v0.3 (Strategy formalized 2026-05-17)
Direction: dev (TypeScript/Node CLI + Claude Code plugin)

## Active Agent Instances

Role-to-agent binding for hopper-plugin dogfood. Sticky from myWriteAssistant Round 2 binding (per user goal directive 2026-05-20) for cost / quality continuity.

| Nickname | UUID | Role | Model | Permissions |
|----------|------|------|-------|-------------|
| `strategy-primary` | `825ab5bf-84c6-484b-b144-3e5e37595054` | Strategy | `claude-opus-4-7` | Observer/supervisor above Leader; file-protocol comms only |
| `leader-primary` | `2620cc7a-25e6-4059-999e-17af54bdcaf4` | Leader | `gpt-5.5-xhigh` (Codex CLI) | gstack + GSD phases; full coverage |
| `builder-primary` | `6c5ac7fa-7a5e-40b4-920a-b4fe1d562876` | Builder | `gpt-5.5-high` (Codex CLI) | Superpowers + Review |
| `builder-secondary` | `6db17b47-ba7f-4a16-8890-832ce18c43cb` | Builder | `kimi-v2.6-thinking` OR `mimo-v2.5-pro` OR `deepseek-v4-pro` (rotate per task per Round 2 binding) | Superpowers + Review |
| `builder-pair-A` | TBD | Builder-pair | `deepseek-v4-flash` | Sidecar polish review |
| `builder-pair-B` | TBD | Builder-pair | `Gemini-flash` | Sidecar polish review |
| `executor-1` | `820cba1c-80de-45fc-a514-2f5de38fd804` | Executor | `kimi-2.6` | Superpowers execution only |
| `critic-primary` | TBD | Critic | `claude-opus-xhigh` (fresh subagent per task) | Adversarial review |

## Role Permissions Summary

- **Strategy** — Long-horizon decisions, escalation, protocol evolution. No queue push, no code edits.
- **Leader** — Strategy/architecture/spec authoring/review. Full coverage. Pushes queue, dispatches Builders, runs Leader Review Protocol.
- **Builder** — Receives Leader spec, owns design + execution.
- **Builder-pair** — Sidecar polish on substantive Builder output. Mode declaration mandatory (review-only vs code-change-allowed).
- **Executor** — Pure execution. No design.
- **Critic** — Adversarial review only, no code edits.

## Reassignment

Edit this file + update `.hopper/MANIFEST.md` together. UUIDs persist across model swaps; nicknames may be swapped freely.

## Cross-audit binding (per goal directive 2026-05-20)

Two trigger conditions auto-invoke `/codex` GPT-5.5 xhigh as adversarial second opinion:
1. **New proposals**: any new dispatch handoff, spec revision, or significant architectural decision
2. **Phase completion**: any T-PLUGIN-XX task done

Strategy invokes codex via `codex exec` with `model_reasoning_effort="xhigh"`. Codex is NOT a role in queue.md; it is an out-of-band audit layer.
