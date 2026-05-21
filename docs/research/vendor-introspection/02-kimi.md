# Vendor Introspection — Kimi CLI

> Research: 2026-05-21
> For: hopper-plugin Phase 6b probe-cache decision
> Tested against: kimi-cli 1.41.0 (Python pip install kimi-cli) on Windows dev machine

## TL;DR

- **No machine-readable model list command.** `kimi info` only outputs version/protocol/python data — not the active model and not available models. There is no `kimi models` subcommand.
- **Config file IS the source of truth.** `~/.kimi/config.{toml,json}` carries a `default_model` field and an enumerated `[models.X]` block per model. Schema is documented and stable. This is the only programmatic introspection path.
- **`--thinking / --no-thinking` is strictly binary.** No hidden levels, no `thinking_budget` / `max_thinking_tokens` / `reasoning_effort` keys exist. Granularity comes from picking a `*-thinking*` model variant, not from a flag level. Recommended probe strategy: **config-only**, with a static known-good model list from Moonshot's docs as a fallback.

## Model list discovery

### Direct command (`kimi info` / `kimi models` / etc.)

`kimi info` is **not** a model-listing command. Per official docs its full output is exactly:

```
kimi-cli version: 1.20.0
agent spec versions: 1
wire protocol: 1.10
python version: 3.13.1
```

JSON form: `{"kimi_cli_version": "...", "agent_spec_versions": ["1"], "wire_protocol_version": "...", "python_version": "..."}`.

No model field. No provider field. No capability field. The empirical evidence (kimi-cli 1.41.0 help output, no `kimi models` subcommand visible) is confirmed by the docs — there is no model-introspection subcommand at all.

`kimi mcp list` exists but lists **MCP servers**, not models. `kimi mcp test` reports tool availability, not model availability. `kimi plugin` manages **local tool plugins** (executables declared in `plugin.json`); plugins explicitly cannot register model identifiers — `plugin.json` only accepts `name`, `version`, `description`, `config_file`, `inject`, `tools`. `kimi vis` is an agent trace visualizer (post-hoc) — not a capability introspection surface. `kimi acp` / `kimi web` / `kimi term` are alternate runtimes, not metadata endpoints.

### Config-file inspection (`~/.kimi/config.{toml,json}`)

This is the **only** reliable programmatic surface. Schema (from official docs):

Top-level keys:
- `default_model` (string) — must reference a key in `[models]`
- `default_thinking` (boolean)
- `default_yolo`, `default_plan_mode`, `default_editor`, `theme`, `show_thinking_stream`, `merge_all_available_skills`, `skip_afk_prompt_injection`, `telemetry`
- `[providers]`, `[models]`, `[services]`, `[loop_control]`, `[background]`, `[mcp]`, `[hooks]`

Each `[models.NAME]` entry is:

```toml
[models.gemini-3-pro-preview]
provider = "gemini"
model = "gemini-3-pro-preview"
max_context_size = 262144
capabilities = ["thinking", "image_in"]
```

Capability flags documented: `"thinking"` (toggleable), `"always_thinking"` (cannot be disabled), `"image_in"`, `"video_in"`.

Supported provider types: `kimi`, `openai_legacy`, `openai_responses`, `anthropic`, `gemini`, `vertexai`. Note: the user-facing login wizard targets Kimi Code platform, Moonshot AI Open Platform (moonshot.cn — China), and Moonshot AI Open Platform (moonshot.ai — Global).

**Implication:** every model the user can actually invoke must appear as a key under `[models]`. So parsing the config TOML yields an authoritative, user-specific model list — better than any static catalog.

### Official Moonshot docs — known model identifiers

From `platform.kimi.ai/docs/models.md` (authoritative model catalog, 2026-05-21):

Multi-modal:
- `kimi-k2.6` (256k)
- `kimi-k2.5` (256k)

Kimi K2 series:
- `kimi-k2-0905-preview` (256k)
- `kimi-k2-0711-preview` (128k)
- `kimi-k2-turbo-preview` (256k)
- `kimi-k2-thinking` (256k)
- `kimi-k2-thinking-turbo` (256k)

Moonshot V1:
- `moonshot-v1-8k`, `moonshot-v1-32k`, `moonshot-v1-128k`
- `moonshot-v1-8k-vision-preview`, `moonshot-v1-32k-vision-preview`, `moonshot-v1-128k-vision-preview`

Discontinued: `kimi-latest` (2026-01-28), `kimi-thinking-preview` (2025-11-11).

These are **upstream API identifiers** — they must still be wrapped in a `[models.X]` block to be passed to `-m`. This explains the empirical "`-m kimi-thinking` → 'LLM not set'" — `kimi-thinking` is a config alias name, not an API ID, and the user's config did not define it. The user must define e.g. `[models.kimi-thinking]` with `provider=moonshot`, `model=kimi-k2-thinking-turbo` first.

## Thinking mode introspection

### `--thinking / --no-thinking` semantics

**Strictly binary.** Docs describe them as mutually exclusive toggles: "If not specified, uses the last session's setting." Empirical kimi-cli 1.41.0 help also shows the `/` separator pattern (`--thinking / --no-thinking`) — Click's idiomatic boolean flag form. No `--thinking-effort low|medium|high` and no integer-accepting variant.

Whether thinking is even available is gated by the model's `capabilities` array — `"thinking"` (toggleable) vs `"always_thinking"` (locked on). So the truth table is:
- Model lacks `thinking` & `always_thinking` → `--thinking` is a no-op / error
- Model has `thinking` → `--thinking/--no-thinking` works as binary toggle
- Model has `always_thinking` → flag effectively ignored, thinking is always on

### Hidden config keys

**None found.** The configuration reference enumerates all top-level keys; there is no `thinking_budget`, `max_thinking_tokens`, `reasoning_effort`, `reasoning_level`, or equivalent. Reasoning granularity in Kimi is **selected via model identifier**, not via a numeric budget (contrast with OpenAI's `reasoning_effort` or Anthropic's `thinking_budget_tokens`).

The closest knobs are loop-control limits (`max_steps_per_turn`, `max_retries_per_step`, `max_ralph_iterations`, `reserved_context_size`, `compaction_trigger_ratio`) — these govern agent loop behavior, not per-call thinking depth.

## Plugin + MCP capability

Neither extends the model list.

- **Plugins** (`kimi plugin`) declare tools (local executables). `plugin.json` schema has no model field.
- **MCP servers** (`kimi mcp add/list/test`) declare tools the agent can call. MCP cannot add an LLM model — it serves the orthogonal "what tools can the model use" axis.

So for `hopper-dispatch --probe kimi`, plugins and MCP can be ignored.

## Recommended `probe()` implementation

Declare `introspectionSupported: 'config-only'` for kimi.

**Probe flow:**

1. Run `kimi info` (or `kimi info --output-format json` if supported) to confirm the binary is installed and capture `kimi_cli_version`, `wire_protocol_version`. Use this for version-gating only.
2. Read `~/.kimi/config.toml` (fall back to `~/.kimi/config.json`). Honor `--config-file PATH` env override if hopper supports it.
3. Parse the TOML. Emit:
   - `defaultModel` = top-level `default_model`
   - `defaultThinking` = top-level `default_thinking`
   - `models[]` = each key under `[models]`, surfacing `provider`, `model` (upstream ID), `max_context_size`, `capabilities[]`
   - `thinkingMode` per model = `'always'` if `always_thinking` in capabilities, `'toggleable'` if `thinking`, else `'unsupported'`
4. If `~/.kimi/config.toml` is missing or empty, fall back to a static known-good catalog (Moonshot K2 family above) annotated as `source: 'static-catalog'` rather than `source: 'user-config'`.
5. Cache result keyed on `(kimi_cli_version, config-file-mtime)`.

**Pseudocode sketch:**

```python
def probe_kimi():
    info = run_json(['kimi', 'info'])          # version gate only
    cfg_path = os.path.expanduser('~/.kimi/config.toml')
    if not os.path.exists(cfg_path):
        return static_catalog(reason='no-config')
    cfg = tomllib.load(open(cfg_path, 'rb'))
    models = []
    for alias, m in cfg.get('models', {}).items():
        caps = m.get('capabilities', [])
        models.append({
            'alias': alias,                    # what user passes to -m
            'provider': m['provider'],
            'upstream_id': m['model'],
            'context': m.get('max_context_size'),
            'thinking': 'always' if 'always_thinking' in caps
                        else 'toggleable' if 'thinking' in caps
                        else 'unsupported',
            'image_in': 'image_in' in caps,
        })
    return {
        'cli_version': info['kimi_cli_version'],
        'wire_protocol': info['wire_protocol_version'],
        'default_model': cfg.get('default_model'),
        'default_thinking': cfg.get('default_thinking', False),
        'models': models,
        'source': 'user-config',
    }
```

**What `-m` accepts:** the **alias key** (e.g. `[models.foo]` → `-m foo`), NOT the upstream `model` value. This matches the empirical "`-m kimi-thinking` → 'LLM not set'" error: that string wasn't a configured alias.

## Implications for hopper-plugin

Kimi has **no `kimi models` command**, and `kimi info` is version-only. Mark `introspectionSupported: 'config-only'`.

- `probe()` MUST read `~/.kimi/config.toml` — that's the only authoritative source for the user's actually-callable models.
- Document the static Moonshot catalog (kimi-k2-0905-preview, kimi-k2-thinking-turbo, kimi-k2.5, kimi-k2.6, moonshot-v1-*k) as a **reference list of upstream IDs** users can wrap in `[models.X]` blocks — but do NOT pass these directly to `-m`.
- For thinking-mode dispatch: emit `--thinking` or `--no-thinking` only when the resolved model has `capabilities = [..., "thinking", ...]`. For `always_thinking` models, omit the flag. Do not synthesize a "thinking level" abstraction for kimi — it doesn't exist.
- Cache invalidation: hash `(kimi_cli_version, mtime(config.toml))`. Both rarely change; this is cheap.
- Out of scope for probe: plugins, MCP servers, vis traces — none affect model availability.

UNCONFIRMED: whether `kimi info` supports `--output-format json` (docs show JSON form exists; the empirical 1.41.0 help shows `--output-format` at the main-command level, not confirmed for the `info` subcommand specifically). Probe should try JSON first and fall back to text regex parsing.

## Source citations

- [Kimi Code CLI — `kimi` Command Reference](https://moonshotai.github.io/kimi-cli/en/reference/kimi-command.html)
- [Kimi Code CLI — `kimi info` Reference](https://moonshotai.github.io/kimi-cli/en/reference/kimi-info.html)
- [Kimi Code CLI — `kimi mcp` Subcommand](https://moonshotai.github.io/kimi-cli/en/reference/kimi-mcp.md)
- [Kimi Code CLI — Config Files](https://moonshotai.github.io/kimi-cli/en/configuration/config-files.html)
- [Kimi Code CLI — Providers and Models](https://moonshotai.github.io/kimi-cli/en/configuration/providers.html)
- [Kimi Code CLI — Custom Plugins (Beta)](https://moonshotai.github.io/kimi-cli/en/customization/plugins.html)
- [Moonshot Platform — Model Catalog](https://platform.kimi.ai/docs/models.md)
- [Moonshot Platform — llms.txt index](https://platform.kimi.ai/docs/llms.txt)
- [MoonshotAI/kimi-cli GitHub repo](https://github.com/MoonshotAI/kimi-cli)
- Empirical: `F:\workspace\ai\hopper-plugin\.hopper\handoffs\T-DOGFOOD-PHASE6A-VENDORS.md` (kimi-cli 1.41.0 `--help` output, dev machine 2026-05-20)
