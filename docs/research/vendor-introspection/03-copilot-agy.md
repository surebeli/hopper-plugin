# Vendor Introspection — Copilot CLI + Agy

> Research: 2026-05-21
> For: hopper-plugin Phase 6b probe-cache decision

## TL;DR

- **Copilot CLI** is highly probe-friendly: `--effort`/`--reasoning-effort` enum is empirically `{none, low, medium, high, xhigh, max}` with `{none, low, medium, high, xhigh}` confirmed in the official changelog (`max` UNCONFIRMED in docs but observed on dev machine); `--model auto` and `COPILOT_MODEL` env var are stable; custom agents live in two well-known paths (`~/.copilot/agents/`, `.github/agents/`) as `*.agent.md` files — but there is **no `copilot models` and no `copilot agents list` subcommand**, so a probe must enumerate by filesystem scan + parse subscription-tier docs.
- **Agy** is hostile to probing: no `--model` flag (empirically confirmed), no `models` subcommand, no `version` subcommand (only a `--version` flag), and the only documented model-selection surfaces are (a) the default Gemini 3 family baked into the binary and (b) plugin imports (`agy plugin import gemini`). Probe value is limited to capturing `agy --version`, plugin list via `agy plugin`, and presence of config under `~/.gemini/antigravity-cli/`.

---

## Copilot CLI

### Model list discovery

**No `copilot models` subcommand exists.** The official command reference enumerates only: `completion`, `help`, `init`, `login`, `mcp`, `plugin`, `update`, `version` (docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference).

Model selection is via:
- `--model=MODEL` flag (accepts `auto` as a sentinel for "let Copilot pick")
- `COPILOT_MODEL` environment variable
- Interactive `/model` slash command (full-screen picker UI)

Per-tier availability is **runtime-resolved** server-side based on the authenticated subscription. Changelog 1.0.47 (2026-05-13) notes "Copilot Max subscribers see the correct models available to their subscription tier" and 1.0.11 (2026-03-23) "Pro and trial users now see all models they are entitled to" — i.e., the truth-of-record for available models is the picker, not a static list.

**Implication for probe()**: There is no clean introspection path. Options:
1. Scrape the model picker (would require PTY automation — fragile).
2. Hard-code per-tier model list from docs.github.com (drift-prone but acceptable).
3. Accept `--model auto` as the "let server decide" default and skip model enumeration entirely.

### Reasoning effort introspection

`--effort` is an alias for `--reasoning-effort`, added in CLI **v1.0.4** (2026-03-11), alias added v1.0.1 (2026-03-06).

**Confirmed enum from official changelog**:
- `low`, `medium`, `high` — original v1.0.4 set
- `xhigh` — referenced in docs prose and zenn.dev coverage of GPT-5.2-Codex
- `none` — added v1.0.48 (2026-05-14): "Add 'None' reasoning effort option to disable model reasoning in the reasoning effort picker"

**`max`**: empirically observed in dev-machine `--help` output (per the briefing) but **UNCONFIRMED in official changelog or reference docs as of 2026-05-21**. May be a very recent addition (post-1.0.48) or a per-model alias that maps to `xhigh`. The `COPILOT_MODEL_EFFORT` env var (Issue #2559) is a feature request, not implemented.

**Stability**: The enum has expanded twice in two months (xhigh added between 1.0.4 and 1.0.12 per UI display changes; `none` added at 1.0.48). Treat as **unstable** — pin to a captured snapshot per probe run rather than baking into hopper-plugin source.

### Custom agents introspection

- File extension: `*.agent.md`
- Locations searched (priority: home wins on name collision):
  1. `~/.copilot/agents/` (user-level)
  2. `.github/agents/` (project-level, also `{org}/.github` repo)
- **Listing**: only via the interactive `/agent` slash command. **No `copilot agents list` CLI subcommand.**
- Schema: markdown with frontmatter — name, description, instructions, optional `tools` restriction list. `model` and `mcp_servers` fields are UNCONFIRMED in current docs.

**Probe path**: filesystem scan of the two known directories for `*.agent.md`, parse frontmatter. Cheap, deterministic, no PTY needed.

### Other useful commands

- `copilot version` — current version + update check (use this, not a `--version` flag).
- `copilot mcp [show|add|edit|delete|disable|enable|auth|reload]` — MCP introspection is rich; `copilot mcp show` is the right probe call for MCP server state.
- `copilot plugin` — manages plugins; `copilot plugin update --all` exists. Plugin listing subcommand not explicitly documented but likely `copilot plugin list`.
- `copilot init` — writes custom-instructions scaffolding.
- **No `copilot doctor` subcommand** — dropped from or never present in the documented reference.
- Session state: `$COPILOT_HOME` (default `$HOME/.copilot`) holds sessions; the briefing's `~/.copilot/session-state/` is consistent with this. Does **not** cache model lists (verified by absence of changelog mention).

### Recommended probe() implementation

```
copilot_probe() {
  copilot version                            # → cli_version
  copilot mcp show --output-format json      # → mcp_servers (best-effort)
  ls ~/.copilot/agents/*.agent.md \
     .github/agents/*.agent.md 2>/dev/null   # → custom_agents
  # Effort enum: hard-code snapshot from changelog
  echo '["none","low","medium","high","xhigh","max"]'
  # Models: hard-code per-tier from docs, mark "auto" as preferred default
}
```

Cache key: `cli_version + subscription_tier`. Invalidate on `copilot update`.

---

## Antigravity (agy) CLI

### Model identifier discovery

**Confirmed empirically on dev machine: no `--model` flag, no `models` subcommand.**

Default model is **Gemini 3.5 Flash** (per Google I/O 2026 launch coverage). The main agent can delegate to a separate browser-specialized model server-side, but that selection is not user-exposed.

**Model selection surfaces actually available**:
- `agy plugin import gemini` — imports legacy Gemini CLI config; model bound by plugin
- Config file: `~/.gemini/antigravity-cli/` (global) per agentpedia.codes deep-dive — schema undocumented
- **No `GEMINI_MODEL`, `ANTIGRAVITY_MODEL`, or equivalent env var** confirmed in any source

One third-party blog (aimadetools.com) claims `antigravity --model gemini-3.5-pro` works and `~/.config/antigravity/config.yaml` accepts `default_model:` — this **contradicts** the dev-machine empirical help output. Classify as **UNCONFIRMED / likely AI-generated speculation**; do not rely on.

### Thinking budget / reasoning config

**No documented thinking-budget flag, env var, or config knob** as of 2026-05-21. Antigravity 2.0 marketing references "parallel subagents" but they are server-orchestrated and not user-configurable from the CLI. The `--print-timeout` (default 5m) is the only timing-related knob and it governs wall-clock, not token budget.

### Plugin system metadata

- Plugin subcommand: `agy plugin` / `agy plugins` (both forms)
- Documented operation: `agy plugin import gemini` (migrates Gemini CLI configuration)
- Storage: undocumented in public sources; likely under `~/.gemini/antigravity-cli/plugins/` based on the migration guide's mention of that tree
- MCP config: `~/.gemini/antigravity-cli/mcp_config.json` (global) and `.agents/mcp_config.json` (workspace)
- Workspace agents: `.agents/` directory (replaces Gemini CLI's `.gemini/`)

### Other observations

- `--version` flag exists (confirmed via migration guide); `agy version` subcommand UNCONFIRMED.
- `--sandbox` flag: present in `--help` output but implementation (Seatbelt/bwrap/Docker?) is **undocumented** publicly.
- `agy install` subcommand: post-install path-setup hook; no model-list output.
- `agy changelog` / `agy update`: report and apply version updates; not model-aware.
- Auth: OAuth flow on first run (`agy` with no args). The `GEMINI_API_KEY` env var is honored by sibling Gemini CLI tooling but **UNCONFIRMED for agy itself** — agy appears to prefer OAuth.

### Recommended probe() implementation

```
agy_probe() {
  agy --version                              # → cli_version
  ls ~/.gemini/antigravity-cli/ 2>/dev/null  # → global_config_present
  ls .agents/ 2>/dev/null                    # → workspace_agents
  cat ~/.gemini/antigravity-cli/mcp_config.json 2>/dev/null  # → mcp_servers
  agy plugin 2>&1 | head -20                 # → plugin_list (parse output)
  # Model: hard-code "gemini-3.5-flash" as default; no per-call override
  # Effort: not applicable — agy has no reasoning enum
}
```

Cache key: `cli_version`. Probe value is **low** — most fields are empty or constant. Consider skipping probe() entirely for agy in Phase 6b and treating it as a fixed-capability vendor.

---

## Implications for hopper-plugin

| CLI     | Has model-list cmd? | Has reasoning enum?              | Recommended probe() output |
|---------|---------------------|----------------------------------|----------------------------|
| copilot | No (use `--model auto` + hard-coded tier list) | Yes: `{none, low, medium, high, xhigh, max?}` — **unstable**, snapshot per probe | `version`, custom agents (filesystem scan), MCP servers, effort-enum snapshot |
| agy     | No                  | No (no reasoning knob exposed)   | `--version`, plugin list, MCP config presence — mostly low-value |

**Strategic recommendation for Phase 6b**:
- **Build probe-cache for Copilot** — meaningful payload (agents, MCP, effort enum drift) and the underlying enum genuinely changes between versions.
- **Skip probe-cache for agy** — treat as a fixed-capability vendor with `model=gemini-3.5-flash`, `effort=n/a`. Add probe only if/when Google exposes model selection. Saves implementation cost and dodges the brittleness of parsing undocumented help output that has already shifted twice since the Antigravity 2.0 launch.

This asymmetry argues for `hopper-dispatch --probe <vendor>` being a **per-vendor capability**, not a uniform interface — each vendor adapter declares whether probing is supported and what payload shape it returns.

---

## Source citations

Copilot CLI:
- [GitHub Copilot CLI command reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference) — authoritative subcommand + flag list
- [copilot-cli changelog.md](https://github.com/github/copilot-cli/blob/main/changelog.md) — `--effort` added v1.0.4 (2026-03-11), `none` added v1.0.48 (2026-05-14), `--model auto` v1.0.32
- [Creating and using custom agents for GitHub Copilot CLI](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/create-custom-agents-for-cli) — `.agent.md` extension, `~/.copilot/agents/` + `.github/agents/`
- [Invoking custom agents](https://docs.github.com/en/copilot/how-tos/copilot-cli/use-copilot-cli/invoke-custom-agents) — `--agent` flag and `/agent` slash command
- [Issue #2559: Support COPILOT_MODEL_EFFORT](https://github.com/github/copilot-cli/issues/2559) — env-var proposal, **not yet implemented**
- [Issue #3074: Add an /effort command](https://github.com/github/copilot-cli/issues/3074) — confirms /model is current effort-switching surface
- [GitHub Changelog: Copilot CLI GA](https://github.blog/changelog/2026-02-25-github-copilot-cli-is-now-generally-available/)

Antigravity CLI:
- [Using AGY CLI (official)](https://www.antigravity.google/docs/cli-using) — sparse; mostly placeholder content as of 2026-05-21
- [Transitioning Gemini CLI to Antigravity CLI](https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/) — Google's official migration announcement (June 18 2026 cutover)
- [Gemini CLI → Antigravity CLI Migration Guide](https://agentpedia.codes/blog/gemini-cli-to-antigravity-cli-migration) — `~/.gemini/antigravity-cli/`, `.agents/`, `mcp_config.json` paths
- [Antigravity CLI Deep Dive (agentpedia)](https://agentpedia.codes/blog/antigravity-cli-deep-dive) — binary name `agy`, `--version`, `agy plugin import gemini`
- [Antigravity CLI on WSL: broken launcher report](https://discuss.ai.google.dev/t/antigravity-cli-agy-on-wsl-broken-launcher-missing-scripts-manual-repair-report/110717) — install layout (`AppData/Local/Programs/Antigravity/bin/`)
- [Google Antigravity 2.0 launch coverage (TechCrunch)](https://techcrunch.com/2026/05/19/google-launches-antigravity-2-0-with-an-updated-desktop-app-and-cli-tool-at-io-2026/) — Gemini 3.5 Flash as default
- [DeepWiki: google-antigravity/antigravity-cli](https://deepwiki.com/google-antigravity/antigravity-cli) — confirms repo identity
