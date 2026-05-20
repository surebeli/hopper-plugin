# Task-type: code-impl

Anchor: `.hopper/tasks/code-impl.md::root`

## Purpose

Implement code that satisfies a pre-written spec's acceptance criteria. The default "do the work" task-type — covers Builder-style implementation, executor-style small mechanical tasks, and most refactors.

## Input shape

The task receives:
- A task spec section from `.hopper/handoffs/leader-tasklist.md` (or `docs/plans/*.md` referenced by it)
- Acceptance criteria (TDD shape preferred: RED → GREEN → REFACTOR, each verifiable via shell command or grep)
- Files allowed to touch (positive scope)
- Files MUST NOT touch (negative scope)
- Budget: time + vendor cost ceiling

## Output shape (output.md schema)

`<task-id>-output.md` for code-impl MUST contain:

- **Summary**: 1 paragraph stating what was implemented
- **Files touched**: paths + line counts, brief purpose
- **Acceptance verification (X/Y)**: each acceptance bullet → ✓ + evidence (command output, file:line citation, grep match)
- **Decisions / deviations from spec**: any in-flight decisions (folded fixes, scope re-scoping); if none, write "无偏离"
- **Open questions for Leader**: list (or "none")
- **Commit**: `<short-sha> "[<task-id>] <message>"`
- **Verdict**: PASS | PASS_WITH_CHANGES | REWORK
- **Checks**: `git diff --check <base>^ <commit>` (whitespace) + scoped eslint (if TS) + focused tests + tsc (if public types changed)
- **Next recommendation**: cursor-aware (respects MANIFEST.md current cursor)

## Acceptance type

**machine-checkable**. Every acceptance bullet must have a `verifier:` line with a runnable command or grep pattern. Manual verification is allowed but explicitly marked "manual verification needed: <X>" — leaves task `in-progress` until user confirms.

## Boundary with adjacent task-types

- **vs `spec-write`**: code-impl writes product code (src/, tests/, etc.); spec-write writes documentation only.
- **vs `sidecar-polish`**: code-impl is substantive work; sidecar-polish is review/cleanup on someone else's substantive output. Sidecar has explicit mode declaration (review-only vs code-change-allowed); code-impl assumes code-change-allowed by default.
- **vs `code-review-acceptance`**: code-impl produces code; code-review-acceptance evaluates code (no edits).

## Vendor preference

Default: kimi-builder (cost-optimized for bulk work per AGENTS.md static default).
Acceptable alternatives:
- codex-builder for high-reasoning tasks (complex refactors, ambiguous specs)
- opencode-builder for tasks where OpenCode's plugin ecosystem helps
- copilot-builder for tasks closely tied to GitHub workflows (sparingly; quota meter)
- gemini-builder for tasks needing alternative perspective (until 2026-06-18 deprecation)

Vendor selection is per-row in queue.md (optional `Vendor` column) OR per task-vendor-preference table — **static lookup, not round-robin / not retry-aware** (codex F1 constraint).

## Anti-persona note

This frame describes TASK SHAPE, not AGENT IDENTITY. Do NOT prefix dispatched work with "you are a Builder" / "act as a senior engineer" / "think like a Rust developer." The vendor brings its own behavior — frame just describes what kind of output the protocol expects.
