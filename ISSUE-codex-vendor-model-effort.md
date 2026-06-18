# ISSUE: codex adapter ignores `--model`; cross-vendor model/effort forwarding audit

**Reported:** 2026-06 (user dogfood). **Area:** `cli/src/vendors/*.js`. **Severity:** medium (capability gap, not a crash).

## Symptom (user report)

Dispatching codex with a model/effort hint failed at the environment edge:

1. `-m gpt-5.5-xhigh` → `The 'gpt-5.5-xhigh' model is not supported when using Codex
   with a ChatGPT account`. Dropping `-m` silently used the codex account default.
2. Separately: `-s read-only` → `CreateProcessWithLogonW failed: 1326` (the Windows
   sandbox issue tracked in ISSUE-codex-callchain-windows, already fixed for the
   `danger-full-access` dispatch path).

Root cause of (1) is twofold: `gpt-5.5-xhigh` conflates a **model** (`gpt-5.5`) with a
**reasoning effort** (`xhigh`) — they are separate knobs — AND the hopper codex
adapter did **not forward `--model` at all** (it was declared `modelArg.accepted:
'ignored'`), so model selection through hopper was impossible.

## Web-validated facts (2026-06)

- **codex** `exec -m <MODEL>` works. ChatGPT-account auth accepts **bare** names only
  (`gpt-5.5`, `gpt-5.4-mini`, `gpt-5.3-codex-spark`); provider-prefixed ids like
  `openai-codex/gpt-5.1-codex` are rejected (openai/codex#12295). Effort is a separate
  `-c model_reasoning_effort` config, not part of the model name. Catalog:
  `codex debug models --bundled`.
- **copilot** has `--effort` (alias `--reasoning-effort`). Enum is **model-dependent**
  (GPT models: low|medium|high; some models add none/max) and has grown across releases.
- **opencode** has `opencode run --variant <name>` ("provider-specific reasoning
  effort") — the adapter's old note ("no reasoning knob via CLI flags") was **stale**.
  Variant values are per-model/provider and validated server-side.

## Horizontal audit — model & effort forwarding across all 8 vendors (before → after)

| vendor   | model (before) | model (after) | effort (before) | effort (after) |
|----------|----------------|---------------|-----------------|----------------|
| codex    | **ignored** (gap) | `-m` forwarded | `-c model_reasoning_effort` | unchanged |
| copilot  | `--model` ✓ | unchanged | **ignored** (gap) | `--effort` (clamped) |
| opencode | `--model` ✓ | unchanged | **ignored** (stale note) | opt-in `--variant` (env) |
| grok     | `-m` ✓ | unchanged | `--effort` (clamped) ✓ | unchanged |
| mimo     | `--model` ✓ | unchanged | `--variant` (xhigh→max) ✓ | unchanged |
| kimi     | `-m` ✓ | unchanged | none (genuine: no per-call argv) | unchanged |
| claude   | `--model` ✓ | unchanged | none (genuine: `claude -p` has no effort flag) | unchanged |
| agy      | none (genuine: `agy -p` has no --model) | unchanged | none (internal subagents) | unchanged |

Genuine CLI limitations (correctly left as-is): kimi/claude/agy effort, agy model.

## Resolution

**codex** (`cli/src/vendors/codex.js`): forward `opts.model` as `-m <MODEL>` (opt-in,
verbatim; omitted → account default). `modelArg.accepted` `ignored` → `freeform`,
`knownGood` set to the ChatGPT-account bare names. Reasoning effort stays the separate
`--reasoning` → `model_reasoning_effort` path.

**copilot** (`cli/src/vendors/copilot.js`): forward `opts.reasoning` as `--effort`,
**clamped** to copilot's universal `{low,medium,high}` (minimal→low, xhigh→high) so the
canonical `xhigh` dispatch default never trips a server-side enum rejection. Escape
hatch: `HOPPER_COPILOT_EFFORT=<raw>` passes a value verbatim (e.g. `max`/`none`), `=''`
omits `--effort`. `reasoningArg.accepted` `ignored` → `enumerated`.

**opencode** (`cli/src/vendors/opencode.js`): correct the stale note; `--variant` is
**opt-in** via `HOPPER_OPENCODE_VARIANT=<variant>` (NOT auto-forwarded — opencode runs
arbitrary provider models whose variant set is unknown, so auto-forwarding the `xhigh`
default could break non-reasoning models). Default path stays `ignored`.

### How to use

- codex model: `/hopper:dispatch ... --model gpt-5.4-mini` (bare name; no provider prefix).
- codex effort: `--reasoning <minimal|low|medium|high|xhigh>` (default `xhigh`).
- copilot effort: `--reasoning <level>` (auto-clamped); raw override `HOPPER_COPILOT_EFFORT`.
- opencode variant: `HOPPER_OPENCODE_VARIANT=<variant>` then dispatch as usual.

Tests: `tests/unit/vendor-preset-fixes.test.js` (args), `tests/unit/discovery.test.js`
(capabilities), `tests/unit/rules.test.js` (generated matrix).
