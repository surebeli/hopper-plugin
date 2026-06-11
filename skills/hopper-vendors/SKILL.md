---
name: hopper-vendors
description: "Use when the user asks Hopper to list registered vendor adapters, confirm supported vendors, or check vendor naming."
---

# Hopper Vendors

List Hopper's registered vendor adapters.

## Steps

1. Locate the target project root containing `.hopper/`, then locate `hopper-dispatch` from `PATH` or the plugin root near this `SKILL.md`.
2. Run `hopper-dispatch --vendors`.
3. Surface the registered adapter list. Current functional vendors should include `codex`, `kimi`, `opencode`, `copilot`, `agy`, `grok`, and `mimo`.
4. If `.hopper/AGENTS.md` references a missing vendor, flag the spelling mismatch; Hopper normalizes trailing `-cli` and `_cli`.

## Safety

- Do not probe vendors here; use `hopper-probe` for live capability refresh.
- Do not edit `.hopper/AGENTS.md` unless the user explicitly asks.
