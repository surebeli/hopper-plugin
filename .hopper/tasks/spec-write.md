# Task-type: spec-write

Anchor: `.hopper/tasks/spec-write.md::root`

## Purpose

Produce a written specification that downstream `code-impl` tasks consume. A spec-write task converts user intent + prior context into a concrete, dispatchable task spec with TDD-shaped acceptance.

## Input shape

The task receives:
- A high-level goal statement (1-3 sentences from user / Strategy / Leader)
- Prior context: spec sections to extend, existing code touchpoints, dependencies on other tasks
- Hard constraints: files allowed/forbidden to touch, time budget, vendor budget

## Output shape (output.md schema)

`<task-id>-output.md` for a spec-write task MUST contain:

- **Summary**: 1 paragraph stating what was spec'd and why
- **Files touched**: paths + line counts (the spec is the artifact; usually `docs/plans/*.md` or `.hopper/handoffs/leader-tasklist.md`)
- **Acceptance verification**: meta-acceptance — the spec itself has acceptance bullets, each machine-checkable
- **Decisions / deviations**: any place the spec deviated from input intent + reason
- **Open questions for Leader**: list (or "none")
- **Commit**: real short-SHA
- **Verdict**: PASS | PASS_WITH_CHANGES | REWORK
- **Checks**: spec-grep checks (does spec reference real files? are acceptance bullets verifiable?)
- **Next recommendation**: which task-id to dispatch next; must respect MANIFEST cursor

## Acceptance type

**verdict-bearing + machine-checkable**. The spec itself contains acceptance criteria; the spec-write task verifies those criteria are well-formed (machine-checkable, scope-qualified, falsifiable).

## Boundary with adjacent task-types

- **vs `code-impl`**: spec-write produces a spec; code-impl consumes one. Spec-write does NOT write product code (only documentation that describes code).
- **vs `code-review-acceptance`**: spec-write proposes a new contract; code-review-acceptance evaluates whether existing code/work satisfied a prior contract.
- **vs `spec-blindspot-hunt`**: spec-write commits to a design; spec-blindspot-hunt audits an existing design for gaps. Sequence: blindspot-hunt → spec-write.

## Vendor preference

Default: codex-builder (high reasoning for design coherence).
Acceptable alternatives: kimi-builder (cheaper, for low-novelty specs).

## Anti-persona note

This frame describes TASK SHAPE, not AGENT IDENTITY. Avoid identity-claiming language and role-impersonation phrases in any dispatched prompt; the vendor invocation includes only the task spec + the input data, and the vendor brings its own behavior. Banned-phrase enumeration intentionally omitted here to keep the anti-persona grep verifier clean — see `llm-hopper/.hopper/USAGE-GUIDE.md` §3.4 for the full forbidden patterns list. (Per codex Phase 0 audit F3 fix.)
