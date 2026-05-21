# Vendor Introspection — Codex CLI + OpenCode

> Research: 2026-05-21
> For: hopper-plugin Phase 6b probe-cache decision

## TL;DR

- **Codex CLI**: `codex debug models` prints the raw model catalog as JSON (with `--bundled` to skip remote refresh). This contradicts the empirical evidence that "no list command exists" — it's under the `debug` subcommand, not a top-level command, and is not surfaced in `codex --help`. Reasoning effort is a closed enum: `minimal | low | medium | high | xhigh` (5 levels, not 4). Probe is fully feasible.
- **OpenCode**: `opencode models [provider]` is the canonical introspection, with `--refresh` and `--verbose` flags but **no `--json`**. Output is line-oriented `<provider>/<model>` text. A structured alternative exists via `opencode serve` HTTP API (`/config/providers`, `/provider`) which exposes models via OpenAPI 3.1 — strictly more useful than the CLI text output, but requires running a server.

## Codex CLI

### Model list discovery

**FOUND — via `codex debug models`.**

The official command-line reference at developers.openai.com documents a `codex debug` subcommand tree, including `codex debug models` which "prints the raw model catalog Codex sees as JSON." The `--bundled` flag skips the remote refresh and prints only the catalog bundled with the current binary. This is the single canonical introspection path.

The empirical evidence in `T-DOGFOOD-PHASE6A-VENDORS.md` ("no `codex models` subcommand listed in `codex --help`") is consistent — `debug` is the parent command; `codex --help` only shows top-level subcommands. The full list per the official reference is: `app, apply, cloud, completion, debug, exec, execpolicy, features, fork, login, logout, mcp, plugin marketplace, remote-control, resume, sandbox`. Note: **`codex doctor` does NOT appear in the current official reference** — the empirical claim that it exists may reflect an older Codex version or be a misread. UNCONFIRMED whether `doctor` is present in current builds; cross-check against the locally installed version if you depend on it.

The bundled catalog source-of-truth lives at `codex-rs/models-manager/models.json` in the openai/codex repo. As of fetch, it enumerates three model IDs: `gpt-5.5` (frontier), `gpt-5.4` (everyday), `gpt-5.4-mini` (small/fast). Each model entry includes a `reasoning_effort` block with descriptions for low/medium/high/xhigh. The minimal level appears in config docs but is not described per-model in the bundled JSON (probably because it's a universal floor).

The `codex features` subcommand lists/toggles feature flags persisted to `config.toml` — useful for capability detection but **does not** enumerate models.

`codex completion` (shell completion) likely encodes the `-m/--model` flag's completion candidates but UNCONFIRMED whether it surfaces the full catalog; it's a fallback if `debug models` is removed.

### Reasoning effort introspection

**FOUND — closed enum in config reference.**

Per `developers.openai.com/codex/config-reference`, `model_reasoning_effort` accepts exactly: `minimal | low | medium | high | xhigh`. There is **no `none` value** for this key.

A separate key, `model_reasoning_summary`, accepts `auto | concise | detailed | none` — `none` is valid here but it controls summary output, not effort. Do not conflate these in adapter code.

Five levels total — the empirical evidence's `low|medium|high|xhigh` is missing `minimal`, which is the lowest setting (used for routing/extraction/lookups where reasoning depth doesn't matter). Add `minimal` to the hopper-plugin enum.

The bundled `models.json` confirms reasoning-effort metadata travels with the model — each model can describe its own effort levels. This means future Codex updates could in principle make effort levels model-dependent. Today they appear uniform, but `codex debug models --bundled | jq '.models[].reasoning_effort'` is the right place to look if that assumption needs validating.

### Other useful introspection commands

- `codex debug models [--bundled]` — JSON model catalog (primary)
- `codex features` — list/enable/disable feature flags
- `codex --version` — version string only; **not** machine-readable beyond the number itself per the reference (no `--version --json` documented)
- `codex doctor` — UNCONFIRMED in current docs; treat as best-effort
- `model_catalog_json` config key — points to a custom catalog file, can override per-profile; relevant if a user has remapped the catalog

### Recommended probe() implementation

Run two commands, both with short timeouts (~5s) and graceful failure:

1. `codex debug models --bundled` — captures the **bundled** catalog without hitting OpenAI's remote refresh endpoint. Parse the JSON, extract `models[].id` and `models[].reasoning_effort` keys. Mark `introspectionSupported: true` if exit 0 and JSON parses.
2. `codex --version` — record the version string. Use it as a cache key, since the bundled catalog is tied to binary version.

For the reasoning enum, hardcode `["minimal", "low", "medium", "high", "xhigh"]` (sourced from the official config reference, stable across model versions) rather than parsing it from each model entry. If a future model exposes a narrower set, fall back to per-model overrides.

Do **not** rely on `codex doctor` — not in the current official reference.

## OpenCode

### `opencode models` deep dive

**Confirmed canonical. No JSON flag.**

Per opencode.ai/docs/cli, the command is `opencode models [provider]`:
- Without arguments: lists all models from all configured providers, format `<provider>/<model>` one per line.
- With provider ID (e.g., `opencode models anthropic`, `opencode models openai`, `opencode models opencode`): filters to that provider. This matches the help text the empirical evidence references.
- Flags: `--refresh` (force-refresh the cached list from models.dev) and `--verbose` (print metadata: context length, costs, capabilities).
- **No `--json` flag documented.** Output is plain text. To get structured data via the CLI, parse `--verbose` text — fragile.

Auth dependency: the underlying registry is models.dev (a public catalog), so `opencode models` returns the **catalog** of what each configured provider exposes, **regardless of whether you're authenticated to that provider**. Authentication only gates actual inference, not listing. This means the empirical 13-model result reflects which providers are *configured*, not which are *signed in*. UNCONFIRMED how `opencode models` behaves when zero providers are configured — likely empty output.

Cross-platform: opencode is a single Bun-compiled binary; output format does not vary by OS. The line ending (CRLF on Windows vs LF elsewhere) is the only Win/Mac/Linux difference probe() needs to handle — split on `\r?\n`.

### Plugin / HTTP API introspection

**FOUND — much better than CLI text parsing.**

`opencode serve` exposes an HTTP server (default port 4096, customizable via `--port`) with an OpenAPI 3.1 spec at `/doc`. Per opencode.ai/docs/server, the relevant endpoints are:

- **`GET /config/providers`** — "List providers and default models" — the structured equivalent of `opencode models`.
- **`GET /provider`** — Lists all providers with connection status (auth state).
- **`GET /config`** — Full configuration.

There is **no standalone `/models` endpoint**; models are nested inside the provider listing. The `@opencode-ai/sdk` TypeScript package is auto-generated from this OpenAPI spec and offers a typed client.

For probe(), this is the cleaner path — `curl http://localhost:4096/config/providers` returns JSON. But it requires `opencode serve` to be running, which is **not** how hopper would invoke opencode (one-shot CLI). Booting a server purely for introspection is heavyweight; recommended only as fallback when text parsing fails.

`opencode auth list` (aliases: `opencode auth ls`) lists authenticated providers (credentials stored in `~/.local/share/opencode/auth.json`). Complementary to `models` — tells you which providers will actually serve a request.

### Reasoning / thinking introspection

**PARTIAL — variant cycling exists, no global enum command.**

OpenCode's reasoning model is provider-specific, exposed via the **`variant`** concept:
- `opencode run --variant <name>` — described in CLI docs as "Model variant (provider-specific reasoning effort)."
- `opencode run --thinking` — "show thinking blocks" (display flag, not effort selection).
- In-TUI: `variant_cycle` keybind cycles between variants.

Per-provider mapping documented at opencode.ai/docs/models:
- Anthropic: `thinking.budgetTokens` (e.g., 16000)
- OpenAI: `reasoningEffort` ("high", "low", etc.)
- Google: budget-based "low"/"high" variants

There is no single command to enumerate available variants for a model. Variants are defined per-model in the model catalog — `opencode models <provider> --verbose` may surface them; otherwise the `/config/providers` HTTP endpoint should expose them under each model entry. UNCONFIRMED without empirical run.

### Recommended probe() implementation

Three-tier strategy with graceful degradation:

1. **Primary:** `opencode models` → split lines on `\r?\n` → record raw model IDs. Mark `introspectionSupported: true`.
2. **Enrichment (optional):** `opencode models <provider> --verbose` per detected provider → regex-extract context length, capabilities, variants. Skip if `--verbose` parsing fails; not load-bearing.
3. **Auth sidecar:** `opencode auth list` → record which providers are signed in. Useful for hopper to skip "configured but unauthenticated" models.

Do **not** boot `opencode serve` for probe() — too heavy. The OpenAPI route is a documented fallback if SST changes the text format.

Record `opencode --version` as the cache key.

## Implications for hopper-plugin probe()

| CLI | Has model-list cmd? | Has reasoning enum? | Recommended probe() |
|---|---|---|---|
| codex | YES (`codex debug models [--bundled]`, JSON) | YES (closed enum: minimal/low/medium/high/xhigh) | `codex debug models --bundled` + `codex --version`; hardcode reasoning enum |
| opencode | YES (`opencode models [provider]`, text) | PARTIAL (per-provider variants, no global enum) | `opencode models` + `opencode auth list` + `opencode --version`; line-parse text |

Both CLIs support probe() well enough to implement. Codex's introspection is **structurally superior** (single JSON command, closed reasoning enum). OpenCode's is **text-based but stable**, with a richer HTTP fallback if text parsing breaks.

Recommendation: implement probe() for both. Codex is straightforward; OpenCode needs a text parser but the format is simple. Mark `introspectionSupported: true` for both in the adapter manifest.

## Source citations

- [Command line options – Codex CLI | OpenAI Developers](https://developers.openai.com/codex/cli/reference)
- [Configuration Reference – Codex | OpenAI Developers](https://developers.openai.com/codex/config-reference)
- [Advanced Configuration – Codex | OpenAI Developers](https://developers.openai.com/codex/config-advanced)
- [Models – Codex | OpenAI Developers](https://developers.openai.com/codex/models)
- [openai/codex models.json (bundled catalog)](https://github.com/openai/codex/blob/main/codex-rs/models-manager/models.json)
- [openai/codex GitHub repo](https://github.com/openai/codex)
- [CLI | OpenCode docs](https://opencode.ai/docs/cli/)
- [Models | OpenCode docs](https://opencode.ai/docs/models/)
- [Providers | OpenCode docs](https://opencode.ai/docs/providers/)
- [Server | OpenCode docs](https://opencode.ai/docs/server/)
- [Provider and Model Configuration | sst/opencode DeepWiki](https://deepwiki.com/sst/opencode/3.3-provider-and-model-configuration)
- [Authentication and Authorization | sst/opencode DeepWiki](https://deepwiki.com/sst/opencode/4.2-authentication-and-authorization)
