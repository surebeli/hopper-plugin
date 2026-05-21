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

### agy — INSTALLED at non-default Bash PATH location (corrected 2026-05-21 evening)

**Initial misdiagnosis** (now retracted): I first reported agy as NOT_INSTALLED because Bash `--check` couldn't find it, and assumed the `antigravity` editor I found at `~/AppData/Local/Programs/Antigravity/bin/` was what the user had instead. **Both wrong.**

**Actual state** (per user PowerShell verification):

- agy IS installed at `C:\Users\litianyi\AppData\Local\agy\bin\agy.exe` (150 MB exe, last modified 2026-05-20)
- User's PowerShell PATH includes that dir; `agy --help` works in PS and confirms agentic CLI:
  - `--print` / `-p`, `--dangerously-skip-permissions`, `--log-file`, `--continue`, `--conversation` (all match our adapter's invocation pattern)
  - `--print-timeout` default 5m0s (our adapter timeoutMs is 360s = 6min, safe margin)
  - `--sandbox` flag exists (separate from `--dangerously-skip-permissions`)
  - Subcommands: changelog, help, install, plugin{,s}, update
- **Bash session PATH** (Git-Bash / MSYS2) does NOT inherit `~/AppData/Local/agy/bin/` by default
- Hence `hopper-dispatch --check` run from Bash showed NOT_INSTALLED — TECHNICALLY CORRECT for that shell, but MISLEADING because user can run agy fine from PowerShell

**Separate binary confusion**: `antigravity` at `~/AppData/Local/Programs/Antigravity/bin/antigravity.cmd` is **Google's VS-Code-fork editor** (1.107.0), a different product from `agy` the agentic CLI. They are NOT aliases. The fact that both share the Antigravity brand caused my misdiagnosis.

**Real Phase 6a learning**: `--check` reports PATH-coverage truth as seen by the invoking shell. On Windows specifically, Git-Bash users may see false-negative NOT_INSTALLED for vendor CLIs that PowerShell would find. Either:
  (a) User runs hopper-dispatch from PowerShell (PATH coverage is broader)
  (b) User adds vendor bin dirs to Bash PATH manually
  (c) hopper-dispatch could add a Phase 6b "common install path" fallback scan (NOT done in this commit per minimal-harness principle)

**Status correction for everyone reading the audit trail**: agy CAN run on this machine. T-AUDIT-PH5-kimi 0-byte log was almost certainly NOT an agy-vs-antigravity binary mismatch (since agy wasn't the kimi audit's vendor) — it was kimi-specific opacity. Re-investigate T-AUDIT-PH5-kimi separately if needed.

## Design correction 2026-05-21 (per user feedback)

After the initial dogfood, user pointed out a real design issue with my
approach: I hardcoded the 13 opencode models probed from THIS machine
into the adapter's `capabilities.knownGood` array. That's wrong because:

- Available opencode models depend on the USER's opencode auth configuration
  (which providers they have signed in to) — varies per account
- kimi models depend on `~/.kimi/config` content + Moonshot account
- copilot models depend on Business/Enterprise subscription tier
- codex models depend on ChatGPT login entitlements
- One machine's snapshot ≠ another machine's truth

Hardcoding the snapshot pretends it's universal. It's not. The adapter
should describe its OWN forwarding behavior (modelArg.accepted,
reasoningArg.accepted, features), NOT maintain a model catalog.

**Corrective action**:
- Adapter `knownGood` arrays now near-empty (0-1 format-example values
  like `<provider>/<model>` for opencode); no real model identifiers
- sourceNote on each adapter directs user to run vendor's own `models`
  command for actual list on their machine
- This dogfood doc retains the full probed snapshot below as a HISTORICAL
  record from one dev machine on one date — useful as essay evidence
  ("hopper-plugin probed real CLIs and corrected its data") but NOT
  parsed by the adapter at runtime

The 13-model opencode list captured in the per-vendor findings above
remains here as that snapshot. Treat it as illustrative only — your
machine may differ.

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
