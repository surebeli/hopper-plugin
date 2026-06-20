---
description: Directed code review — dispatch a one-off read-only review of a diff/path/PR to a reviewer vendor (no queue.md row), then surface the full verdict.
allowed-tools: Bash, Read
argument-hint: <target> [--vendor <name>] [--adversarial]
---

One-shot code review via hopper's **ad-hoc** dispatch (no `queue.md` row). The target is what to review — a path, a `git diff`/`git show` ref, a PR description, or pasted code. Read-only by design: the `code-review-*` task-type auto-applies a **read-only** sandbox, so the reviewer never edits the repo.

## What this does
1. Build a review brief from `$ARGUMENTS`.
2. Dispatch a one-off `code-review-acceptance` task (or `code-review-adversarial` with `--adversarial`) via `hopper-dispatch --adhoc`.
3. Surface the **full** verdict with `--result <id> --full`.

## Steps
1. Parse `$ARGUMENTS`: the leading text is the review TARGET. Optional `--vendor <name>` overrides the reviewer; `--adversarial` selects the adversarial task-type. Validate `--vendor` is a lowercase registered vendor (codex/kimi/opencode/copilot/agy/grok/mimo/claude).
2. Task-type: `code-review-adversarial` if `--adversarial`, else `code-review-acceptance`.
3. Compose a focused brief: name the target and tell the reviewer how to see it (e.g. "run `git show <ref>` / read `<path>`"); state the acceptance criteria, or for adversarial: "hunt for defects the author would miss." If the user pasted code, include it. Review only — no edits.
4. Pick a short id matching `^[A-Za-z][A-Za-z0-9._-]{0,99}$`, e.g. `review-<8-char-slug>`.
5. Resolve the binary as in `/hopper:dispatch` (use `$CLAUDE_PLUGIN_ROOT/cli/bin/hopper-dispatch` if it exists, else search `~/.claude/plugins/hopper`), then dispatch in the background (Bash tool with `run_in_background: true`):

```bash
node "$HOPPER_BIN" --adhoc --task-type code-review-acceptance --brief "<composed brief>" --id "<id>" --background
# add --vendor <name> to override (default reviewer = the task-type preference: codex for acceptance, grok for adversarial)
```

6. Poll, then surface the FULL verdict (reviews can exceed the inline preview):

```bash
node "$HOPPER_BIN" --result "<id>" --full
```

Surface verbatim.

## MUST NOT
- Do NOT re-dispatch on failure (single-spawn invariant, spec §3 #4).
- Do NOT edit the repo or `queue.md` (review is read-only by task-type default).
- Do NOT splat unvalidated `$ARGUMENTS` — build the brief explicitly and quote it.
- Do NOT poll faster than ~10s.
