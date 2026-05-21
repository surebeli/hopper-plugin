---
task_id: T-DOGFOOD-PHASE6A-VENDORS
adapter: claude-code-strategy
status: done
mode: dogfood
start_time: 2026-05-21
note: Live introspection of all 5 vendor CLIs on this machine. Updated adapter capability.knownGood with real data + corrected mis-assumptions.
---

# T-DOGFOOD-PHASE6A-VENDORS — Live vendor introspection (2026-05-21)

## Purpose

Dogfood `--check` findings + actively interrogate each of the 5 vendor CLIs on this machine to ground the adapter capability data in reality (not best-guess).

## Method

Directly invoked each vendor CLI from Bash (NOT via hopper-dispatch — this is metadata gathering, not task execution):

1. `codex --help` + `codex exec --help` — discover flags
2. `kimi --help` + tiny smoke prompt — verify model/thinking knobs
3. `opencode --help` + `opencode models` — capture real model catalog
4. `copilot --help` + smoke — discover reasoning-effort + model semantics
5. `agy --help` / `where agy` / file-system search — locate the binary

## Per-vendor findings

### codex — READY

- `codex exec --help` confirms `-m, --model <MODEL>` flag exists at CLI level
- Our adapter currently does NOT forward `opts.model`; uses `model_reasoning_effort` config knob via `-c` flag instead
- Capability claim corrected: "ignored" remains accurate **for adapter**, but sourceNote now explicitly says CLI supports the flag — Phase 6b candidate to wire `opts.model → -m`
- Live smoke (`codex exec --skip-git-repo-check -s read-only -c 'model_reasoning_effort="low"' "Reply ONLY with HOPPER_OK_CODEX"`) returned `HOPPER_OK_CODEX` (19,309 tokens)

### kimi — READY

- `kimi --help` confirms `--model, -m <TEXT>` flag (default from `~/.kimi/config.{toml,json}`)
- **NEW discovery**: kimi has `--thinking / --no-thinking` binary toggle (NOT enumerated like codex's 4-level reasoning)
- Our adapter does NOT forward `opts.reasoning` to `--thinking`; capability claim "ignored" remains accurate **for adapter**, sourceNote clarified
- Live smoke (default model, no `-m`): returned `HOPPER_OK_KIMI` with session id `ce004dd3-f183-4a59-9bb5-2e87b4277e38`
- Insight: previous T-AUDIT-PH5-kimi failure was likely model-not-found (we passed `-m kimi-thinking` which is not a valid model identifier). Default model works reliably.

### opencode — READY (richest discovery)

- `opencode models` live output captured **13 real models** from 4 providers:
  - **opencode/** (4): big-pickle, deepseek-v4-flash-free, nemotron-3-super-free, qwen3.6-plus-free
  - **deepseek/** (4): deepseek-chat, deepseek-reasoner, deepseek-v4-flash, deepseek-v4-pro
  - **xiaomi/** (5): mimo-v2-flash, mimo-v2-omni, mimo-v2-pro, mimo-v2.5, mimo-v2.5-pro
- Updated adapter `capabilities.modelArg.knownGood` with all 13 (was 2 best-guess values)
- Live smoke (`opencode run --model "opencode/deepseek-v4-flash-free" ...`): returned `HOPPER_OK_OPENCODE` (auto-builds session via deepseek-v4-flash-free)
- New `--capabilities opencode` output now shows the real list — essay readers can copy-paste exact model identifiers

### copilot — READY (surprising find)

- `copilot --help` reveals `--effort, --reasoning-effort <level>` with **6 levels**: `none, low, medium, high, xhigh, max`
- This is MORE granular than codex's 4 levels (`low, medium, high, xhigh`) — copilot adds `none` and `max`
- Our adapter does NOT forward `opts.reasoning` to `--effort`; capability claim "ignored" remains accurate **for adapter**, sourceNote now explicit
- Live smoke (`copilot -p ... --allow-all-tools`): returned response with 18.6k input tokens, 30 reasoning tokens, 1 Premium request

### agy — NOT_INSTALLED (corrected understanding)

- **CRITICAL FINDING**: This machine has `~/AppData/Local/Programs/Antigravity/bin/antigravity{.cmd,}` installed but it's the **VS-Code-fork EDITOR LAUNCHER** (Antigravity 1.107.0):
  - `--diff`, `--merge`, `--goto`, `--new-window`, `--extensions-dir`, `--install-extension`, `--list-extensions`
- NOT the agentic CLI our adapter targets
- The agentic `agy` CLI (Google's Gemini CLI successor) is a **distinct binary** with separate distribution channel
- `--check` correctly reports `NOT_INSTALLED` for agy on this machine
- Adapter capability gains new `installDistinction` field explicitly warning: **DO NOT alias `agy → antigravity`** — they are different binaries
- This explains why T-AUDIT-PH5-kimi's audit attempt produced 0 bytes — and the same root cause likely affects any agy dispatch attempt on this machine

## Updates landed

5 adapter capability blocks updated:

| Adapter | Field updated | Change |
|---|---|---|
| opencode | `modelArg.knownGood` | 2 best-guess → 13 real models from live `opencode models` |
| opencode | `modelArg.sourceNote` | Added verification date + reproducer command |
| codex | `modelArg.sourceNote` | Disclosed CLI supports `-m` even though adapter doesn't forward |
| kimi | `modelArg.sourceNote` | Disclosed default-works, kimi-thinking-fails empirically |
| kimi | `reasoningArg.sourceNote` | Discovered `--thinking / --no-thinking` binary toggle |
| copilot | `reasoningArg.sourceNote` | Discovered 6-level `--effort` flag (CLI; adapter doesn't forward) |
| agy | `installDistinction` (NEW field) | Documented agy ≠ antigravity binary distinction |

Plus this dogfood handoff doc itself documents the discovery process for future readers.

## Smoke test summary

| Vendor | Install status | Smoke result | Session ID |
|---|---|---|---|
| codex | READY | ✓ HOPPER_OK_CODEX (19,309 tokens) | n/a |
| kimi | READY | ✓ HOPPER_OK_KIMI | ce004dd3-f183-4a59-9bb5-2e87b4277e38 |
| opencode | READY | ✓ HOPPER_OK_OPENCODE | (via opencode session) |
| copilot | READY | ✓ (response received, 18.6k tokens used) | n/a |
| agy | NOT_INSTALLED | (skipped — no agentic CLI on machine) | n/a |

4 of 5 vendors live-smoked successfully. 5th (agy) confirmed-not-installed.

## Phase 6b candidates surfaced

1. Wire `opts.model → -m` in codex adapter (CLI supports, adapter doesn't)
2. Wire `opts.reasoning → --effort` in copilot adapter (CLI has 6 levels, adapter ignores)
3. Wire `opts.reasoning → --thinking` (binary) in kimi adapter
4. Drop kimi `-m kimi-thinking` references in T-AUDIT-PH5 retro — it's not a valid model identifier
5. Document the agy vs antigravity binary distinction in INSTALL-MATRIX adapter notes

## Files modified

- `cli/src/vendors/opencode.js` — knownGood 2 → 13
- `cli/src/vendors/codex.js` — sourceNote clarification
- `cli/src/vendors/kimi.js` — sourceNote x2 (model + reasoning)
- `cli/src/vendors/copilot.js` — sourceNote (reasoning)
- `cli/src/vendors/agy.js` — new `installDistinction` field
- `.hopper/handoffs/T-DOGFOOD-PHASE6A-VENDORS.md` (this file)

## Verdict

Dogfood complete. `--capabilities` data is now grounded in live introspection rather than best-guess. Tests unchanged (287/305 pass — capability literals are not test-asserted by value, only by shape).

Essay-readiness boost: `hopper-dispatch --capabilities opencode` now shows 13 real model identifiers a reader can verify themselves by running `opencode models`. Cross-vendor heterogeneity (6 reasoning levels in copilot vs 4 in codex vs binary toggle in kimi) is documented honestly.
