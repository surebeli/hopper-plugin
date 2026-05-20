# Task-type: sidecar-polish

Anchor: `.hopper/tasks/sidecar-polish.md::root`

## Purpose

Polish-pass review on a recently-completed substantive task. Goal: catch metadata gaps, lint issues, EOF whitespace, output.md schema drift, and small surgical fixes that don't require redoing the substantive work.

## Input shape

The task receives:
- The substantive task's `<task-id>-output.md`
- The substantive task's commit SHA
- **Mode declaration (MANDATORY)**:
  - `review-only`: produce verdict only; no file edits permitted outside `<polish-task-id>-output.md`
  - `code-change-allowed`: small fixes permitted (lint, EOF whitespace, metadata repair, unused imports); upgraded acceptance gate applies (`git diff --check`, scoped eslint, focused tests)

## Output shape (output.md schema)

`<polish-task-id>-output.md` (e.g. `T-CLIENT-RUNTIME-polish-output.md`) MUST contain:

- **Summary**: 1 paragraph stating what was polished
- **Files touched** (only if code-change-allowed mode):
  - List with reason per file ("removed unused import" / "fixed EOF whitespace" / etc.)
  - In review-only mode: this field reads "review-only mode; no file edits"
- **Acceptance verification**: per concern from substantive task's sidecar handoff prompt — addressed/unaddressed/n-a
- **Mode**: explicit declaration repeated (review-only OR code-change-allowed)
- **Checks** (only if code-change-allowed): `git diff --check` / scoped eslint / focused tests — pass/fail each
- **Verdict**: PASS | PASS_WITH_CHANGES | REWORK
- **Commit**: SHA of polish commit
- **Next recommendation**: cursor-aware

## Acceptance type

**verdict-bearing + mode-conditional**. In review-only mode, only verdict + concerns mapping. In code-change-allowed mode, additional machine-checkable file change verification.

## Boundary with adjacent task-types

- **vs `code-impl`**: sidecar is polish on completed substantive work; code-impl is the substantive work itself.
- **vs `code-review-adversarial`**: adversarial seeks bugs; sidecar handles hygiene. Adversarial finds "this could deadlock under load"; sidecar finds "unused import on line 42."
- **vs `code-review-acceptance`**: acceptance grades against contract (verdict gates progression); sidecar polishes within an already-passing task.

## Vendor preference

Default: kimi-builder (cheap, fast — sidecar is small-scope work).
Acceptable: deepseek-flash-via-future-adapter, gemini-flash, mimo-flash (cost-efficient tier for hygiene checks).

NOT recommended: codex-builder (overkill for hygiene; use the high reasoning vendor for substantive work).

## Sidecar handoff prompt convention

When a substantive `code-impl` task wants to queue a polish, it embeds a "Sidecar handoff prompt" section in its OWN output.md (per llm-hopper template `dispatch-builder-to-pair.md`). The polish task spec then references that embedded prompt. Mode declaration MUST be explicit in the embedded prompt.

## Anti-persona note

This frame describes TASK SHAPE, not AGENT IDENTITY. Avoid identity-claiming language and role-impersonation phrases in any dispatched prompt; the vendor brings its own behavior; the task-type signals "this is a polish pass with specific mode constraints." Banned-phrase enumeration omitted here to keep the anti-persona grep verifier clean. (Per codex Phase 0 audit F3 fix.)
