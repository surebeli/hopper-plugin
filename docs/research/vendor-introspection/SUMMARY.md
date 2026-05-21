# Vendor Introspection Research — Synthesis

> Synthesis: 2026-05-21
> Source docs:
> - `01-codex-opencode.md`
> - `02-kimi.md`
> - `03-copilot-agy.md`

## TL;DR per CLI

| CLI | Has `models` cmd | Has reasoning enum | Probe support | Recommended impl |
|---|---|---|---|---|
| **codex** | ✓ `codex debug models [--bundled]` JSON | ✓ 5 levels: `minimal\|low\|medium\|high\|xhigh` | **FULL** | parse `codex debug models --bundled` + `codex --version` |
| **opencode** | ✓ `opencode models` text only (no `--json`) | ✗ per-provider via `--variant <name>` | **FULL** | parse `opencode models` + `opencode auth list` + `opencode --version` |
| **kimi** | ✗ no `kimi models` cmd | ✗ `--thinking / --no-thinking` binary only | **CONFIG-ONLY** | parse `~/.kimi/config.{toml,json}` `[models.NAME]` blocks |
| **copilot** | ✗ no `copilot models` cmd (server-side) | ✓ `--effort` enum (doc: 5 levels; empirical: 6 incl `max`) | **PARTIAL** | `copilot version` + scan `~/.copilot/agents/` + `.github/agents/` |
| **agy** | ✗ none | ✗ none | **FIXED** (skip probe) | declare `model=gemini-3.5-flash`, `effort=n/a` static |

## Bombshells the research surfaced

### 1. Codex CLI has machine-readable introspection — we missed it entirely

`codex debug models [--bundled]` outputs the full model catalog as JSON. Nested under `debug` subcommand, NOT surfaced in top-level `codex --help`. Confirmed via [official reference](https://developers.openai.com/codex/cli/reference) + [openai/codex models.json](https://github.com/openai/codex/blob/main/codex-rs/models-manager/models.json).

Implication: our codex adapter's `capabilities.knownGood: []` with sourceNote "no introspection" is **wrong** — there IS a way to introspect, we just didn't know.

### 2. Codex reasoning enum is 5 levels, not 4

Real values: **`minimal | low | medium | high | xhigh`**.

Our `cli/src/validation.js` `ALLOWED_REASONING = ['low','medium','high','xhigh']` is **missing `minimal`**. That's an active bug — user trying `--reasoning minimal` for cheap routing/extraction tasks would be rejected by our CLI but accepted by codex.

**Immediate fix candidate** (independent of probe-cache work): add `minimal` to whitelist.

### 3. Kimi's `-m kimi-thinking` failure root cause finally explained

Kimi config has TWO model identifiers:
- **Alias key** in `[models.NAME]` block — what user passes to `-m`
- **`model =` field** inside the block — upstream Moonshot model ID

User passes the ALIAS, not the upstream ID. `kimi-thinking` was almost certainly typed as the upstream ID (kimi-cli docs do use that string) but wasn't aliased in user's config → "LLM not set" error.

**Implication for probe()**: read `~/.kimi/config.toml` `[models]` block keys — those are the user-callable aliases. NOT the upstream IDs.

### 4. Copilot has 5-or-6 reasoning levels (drift indicator)

Empirical (dev machine): `none|low|medium|high|xhigh|max` (6 levels).
Official changelog: `none|low|medium|high|xhigh` (5 levels). `max` UNCONFIRMED in docs.

Two months prior, the enum was just `low|medium|high|xhigh` (4). The set is GROWING. Probe should NOT enumerate this client-side — copilot itself rejects invalid values, let CLI validate.

### 5. Agy ≠ probeable

Confirmed via dev-machine smoke + Antigravity docs cross-check:
- No `--model`, no `models`, no `--version`-as-subcommand
- Default `gemini-3.5-flash` baked into binary
- Reasoning/thinking knobs not exposed via flags
- One third-party blog claims `--model` works → contradicts empirical + docs → classified as AI-slop

**Implication**: don't implement `agy.probe()`. Declare capability statically.

## Asymmetric probe — recommended Phase 6b shape

Per-adapter `introspectionSupported` field declares what `probe()` can return:

| Adapter | `introspectionSupported` | `probe()` body |
|---|---|---|
| codex | `'full'` | spawn `codex debug models --bundled` → parse JSON → model list + spawn `codex --version` |
| opencode | `'full'` | spawn `opencode models` → text split → model list + `opencode auth list` → provider auth state |
| kimi | `'config-only'` | read `~/.kimi/config.toml` → parse `[models.X]` blocks → alias list + capability flags |
| copilot | `'partial'` | spawn `copilot version` + filesystem scan `~/.copilot/agents/*.agent.md` + `.github/agents/*.agent.md` |
| agy | `'none'` | return static `{model: 'gemini-3.5-flash', reasoning: 'n/a'}` — no spawn |

Total subprocess spawns by `--probe` (all vendors):
- codex: 2 (`debug models --bundled` + `--version`)
- opencode: 3 (`models` + `auth list` + `--version`)
- kimi: 0 (config-file read only)
- copilot: 1 (`version`) + N filesystem reads
- agy: 0

So `--probe` in full mode would spawn ~6 subprocesses total. Each is **single attempt, opt-in, diagnostic** — clearly out-of-band from dispatch single-spawn invariant. Spec §3 #4 carve-out is documented per `Phase 5 audit P2 #5` precedent.

## Immediate actionable items (independent of probe-cache impl)

1. **`cli/src/validation.js`**: add `minimal` to `ALLOWED_REASONING` (current bug; codex would accept `minimal` but our CLI rejects). 1-line fix.
2. **`cli/src/vendors/codex.js`** `capabilities.reasoningArg.knownGood`: `['low','medium','high','xhigh']` → `['minimal','low','medium','high','xhigh']`.
3. **`cli/src/vendors/codex.js`** sourceNote: mention `codex debug models --bundled` exists for those manually curious.
4. **kimi adapter** sourceNote: clarify "user passes ALIAS key from `~/.kimi/config.toml` `[models]`, not upstream Moonshot model ID — that's why `-m kimi-thinking` fails on default install."

These are all factual corrections that should land regardless of whether we build the full probe-cache surface.

## Probe scope decision matrix

If we implement Phase 6b probe-cache based on these findings, recommended scope:

| Scope option | Adapters with `probe()` | LOC estimate | What user gets |
|---|---|---|---|
| **Minimal** | codex + opencode only (the 2 with real model lists) | ~300 | Real model catalogs cached for the 2 vendors that have them; others fall back to static capability |
| **Full asymmetric** | All 5 with appropriate `introspectionSupported` levels | ~600 | Every vendor has a probe path, including config-file reading for kimi + filesystem scan for copilot agents |
| **None** | (cache only, no probe) | ~150 | User pastes `opencode models` output into cache manually; no automated refresh |

## Subprocess audit (single-spawn invariant impact)

`--probe` would introduce subprocess calls in the dispatcher CLI for the first time. Per spec §3 #4 + §14.6, dispatcher subprocess calls must be opt-in + diagnostic + non-retrying. Probe satisfies all three:
- Opt-in: user must explicitly run `--probe`
- Diagnostic: result is cached, not dispatched
- Non-retrying: one attempt per vendor; failure → cache notes "probe failed" + reason

But the existing test `tests/unit/discovery.test.js` "no spawn in discovery surface" would need amendment to permit `--probe` path while preserving the `--check`/`--capabilities` zero-spawn invariant.

## Recommendation

Land **immediate fixes #1-4** above now (independent of probe-cache decision). Then choose probe scope (Minimal / Full asymmetric / None) based on demo-readiness needs vs implementation budget.
