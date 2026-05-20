# Task-type: spec-blindspot-hunt

Anchor: `.hopper/tasks/spec-blindspot-hunt.md::root`

## Purpose

Audit an existing spec or design for contract gaps, missing dependencies, ambiguity, and unstated assumptions — BEFORE downstream code-impl tasks consume the spec. Spike work (host-lifecycle exploration, vendor invocation discovery, environment compatibility checks) is a form of blindspot hunt: turning unknowns into documented facts.

## Input shape

The task receives:
- A spec document or design doc (e.g. `docs/plans/*.md`, `.hopper/handoffs/leader-tasklist.md`)
- OR a target "unknown" (e.g. "verify Claude Code plugin manifest schema" / "verify codex CLI noninteractive invocation works on Windows")
- Hard cap on time (typically S effort, 2-4h)

## Output shape (output.md schema)

`<task-id>-output.md` for blindspot-hunt MUST contain:

- **Summary**: 1 paragraph stating what was audited and what was found
- **Files touched**: paths (typically a new doc in `docs/spikes/` or `docs/research/`)
- **Findings**: bulleted list — each finding has Category (contract-gap / missing-dep / ambiguity / unstated-assumption / external-unknown) + Description + Recommended fix
- **Resolved values** (for spike-style hunts): exact values to lock in (manifest schema, CLI flags, version pins, etc.) — these become the source-of-truth for downstream `code-impl` tasks
- **Verdict**: PASS | PASS_WITH_CHANGES | REWORK (REWORK = "spec has major contract gap; needs revision")
- **Commit**: SHA of the spike/audit doc commit
- **Checks**: did spike actually verify the claims it makes? Reference verification commands.
- **Next recommendation**: cursor-aware; if findings affect spec, recommend `spec-write` task to revise; if spike resolved unknowns, recommend `code-impl` tasks that depend on resolved values

## Acceptance type

**machine-checkable for spike-style** (verification commands exist + outputs documented); **verdict-bearing for spec audit** (reviewer's verdict on whether spec has gaps).

## Boundary with adjacent task-types

- **vs `spec-write`**: blindspot-hunt audits an EXISTING spec; spec-write commits to a NEW design. Sequence: blindspot-hunt → spec-write (revise based on findings).
- **vs `code-review-adversarial`**: blindspot-hunt audits specs/designs; code-review-adversarial audits code/diffs.
- **vs `code-impl`**: blindspot-hunt produces documentation; code-impl produces code. The "resolved values" output of blindspot-hunt feeds code-impl.

## Vendor preference

Default: codex-builder (high reasoning for design audit + spike work).
For spike-style with external CLI invocation: codex-builder OR opencode-builder (both have shell-out capability via their respective sandboxes).

## Examples in hopper-plugin demo

- **T-PLUGIN-00**: host-lifecycle spike (3 prongs: Claude Code plugin / Codex CLI noninteractive / standalone CLI baseline). Resolved values feed T-PLUGIN-01..10.
- **T-PLUGIN-00b**: vendor invocation spike (4 vendors: Kimi/OpenCode/Copilot/Gemini). Resolved values feed T-PLUGIN-05b-e.

## Anti-persona note

This frame describes TASK SHAPE, not AGENT IDENTITY. Avoid identity-claiming language and role-impersonation phrases in any dispatched prompt. The verb "hunt" is for clarity; the vendor produces structured findings, not a costume. Banned-phrase enumeration omitted here to keep the anti-persona grep verifier clean. (Per codex Phase 0 audit F3 fix.)
