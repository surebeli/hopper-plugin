# Task-type: code-review-adversarial

Anchor: `.hopper/tasks/code-review-adversarial.md::root`

## Purpose

Find bugs, edge cases, security issues, performance regressions, and design holes in submitted work — WITHOUT fixing them. Output is a findings document; not a code change.

## Input shape

The task receives:
- A target artifact: **PR diff or output.md from a `code-impl` task** (NOT spec docs — those belong to `spec-blindspot-hunt`; boundary tightened per codex Phase 0 audit F4)
- Scope qualifier: "review the diff against base branch" / "review the architecture for race conditions in this implementation"
- Optional focus: security / performance / correctness / API design

## Output shape (output.md schema)

`<task-id>-output.md` (or `critic-<target-id>.md` for backwards compat) MUST contain:

- **Summary**: 1 paragraph stating what was reviewed and what severity profile the findings have
- **Files reviewed**: paths + LOC reviewed
- **Findings (severity-ordered)**: each finding as `[F<N>] <severity P0/P1/P2>: <one-line>` + Root cause (2-3 sentences) + Recommended fix
- **Verdict**: PASS | PASS_WITH_CHANGES | REWORK (consumers of adversarial review may convert REWORK into a follow-up task)
- **Commit**: `<short-sha>` of the review commit itself (the findings doc is the artifact)
- **Checks**: did review touch only the findings doc? (`git diff --name-only` should show only review file + queue.md status flip)
- **Next recommendation**: cursor-aware; if REWORK, suggest the rework task ID

## Acceptance type

**verdict-bearing**. The reviewer's verdict is the primary acceptance signal. Reviewer does NOT need to prove anything — they emit findings + verdict. Consumer of review (Leader / Strategy) decides whether to act.

## Boundary with adjacent task-types

- **vs `code-review-acceptance`**: adversarial finds bugs, doesn't grade against acceptance. Acceptance review grades against pre-written acceptance criteria (accept / accept-with-note / rework / revert).
- **vs `code-impl`**: adversarial review writes a findings doc; code-impl writes product code. Reviewer MUST NOT edit product code.
- **vs `spec-blindspot-hunt`** *(boundary tightened per codex F4)*: **adversarial scope = code / diffs / implementation outputs ONLY. Spec documents and design proposals are handled by `spec-blindspot-hunt`.** If a single dispatch needs both spec-level audit and code-level audit, that's TWO tasks (one of each type), not one.

## Vendor preference

Default: handled out-of-band by Strategy invoking `/codex` GPT-5 xhigh (cross-audit pattern per goal directive 2026-05-20). NOT typically dispatched through queue.md to a vendor adapter, because the dispatcher (Strategy) needs the adversarial findings raw to decide downstream.

If queued via plugin: codex-builder OR claude-opus-via-out-of-band-strategy-invocation (the latter is preferred for "fresh subagent" semantics).

## Anti-persona note

This frame describes TASK SHAPE, not AGENT IDENTITY. Avoid identity-claiming language and role-impersonation phrases in any dispatched prompt. The verb "adversarial" is in the task-type name to signal intent; the vendor doesn't need a costume. Vendor brings its own rigor. Banned-phrase enumeration omitted here to keep the anti-persona grep verifier clean. (Per codex Phase 0 audit F3 fix.)
