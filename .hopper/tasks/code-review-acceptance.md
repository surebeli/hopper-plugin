# Task-type: code-review-acceptance

Anchor: `.hopper/tasks/code-review-acceptance.md::root`

## Purpose

Evaluate whether submitted work satisfies a pre-written acceptance contract. Produces a verdict (accept / accept-with-note / rework / revert) that gates whether the submitted task progresses or returns for revision.

## Input shape

The task receives:
- The submitted artifact: `<task-id>-output.md` from a completed `code-impl` (or other) task
- The original acceptance contract: from `.hopper/handoffs/leader-tasklist.md` or `docs/plans/*.md`
- The relevant commit SHA(s) for verification

## Output shape (output.md schema)

Acceptance review appends a `## Leader review` section to the original `<task-id>-output.md` (NOT a separate critic file). Section contains:

- **Verdict**: `accept` | `accept-with-note` | `rework` | `revert`
- **Date**: ISO timestamp
- **Reviewed-by**: `<role-or-task-type-or-out-of-band>` (`<vendor-nickname>`)
- **Notes**: bulleted list of findings (verification, deviations, concerns)
- **Follow-up tasks queued**: list of new task IDs in queue.md, or "none"

The acceptance review's OWN output (if dispatched as a queue task) MUST have:
- **Commit**: SHA of the review commit
- **Checks**: which acceptance bullets were verified, with evidence
- **Verdict**: the same verdict as appended to output.md
- **Next recommendation**: cursor-aware

## Acceptance type

**verdict-bearing**. Reviewer's verdict is the primary signal. Verdicts have specific protocol consequences:
- `accept`: task fully closes; no further action
- `accept-with-note`: task closes; concerns logged for future visibility, no rework
- `rework`: new task `<task-id>-rework-N` queued with spec for fixes; original task remains `done` (preserves history)
- `revert`: not auto-revert; user told to revert commit; `<task-id>-revert` task queued; `blocker-<task-id>.md` written

## Boundary with adjacent task-types

- **vs `code-review-adversarial`**: acceptance grades against a contract (was acceptance met?); adversarial finds anything wrong regardless of contract.
- **vs `code-impl`**: review writes review section in output.md; doesn't edit product code.
- **vs `sidecar-polish`**: polish allows code changes within scope; acceptance is review-only.

## Vendor preference

Default: codex-builder (sticky Leader-equivalent from myWriteAssistant continuity).
Sometimes: claude-opus-via-out-of-band-strategy (when fresh subagent semantics matter for review of critical contracts).

## Anti-persona note

This frame describes TASK SHAPE, not AGENT IDENTITY. Do NOT prefix dispatched work with "you are a Leader" / "act as the lead reviewer." The vendor produces the structured verdict; the verb "acceptance" describes the review's purpose, not a role to inhabit.
