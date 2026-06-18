# ISSUE: codex adapter call-chain fails on Windows — false-success hijack + `CreateProcessWithLogonW 1326`

- **Filed**: 2026-06-18
- **hopper version**: 0.6.1-phase-6c
- **Host**: Windows (PowerShell 7), codex CLI on PATH (`codex.CMD`, `--check codex` → READY, auth OK)
- **Severity**: high — codex dispatches return `status=done exit=0` while producing **off-task output**, i.e. a *false success*. Affects every codex-routed task on this host.
- **Reproduced on task**: `S1-AGT-18-RVW-HX` (spec-blindspot-hunt → codex), x-agents project `.hopper/`.

## Summary

A `spec-blindspot-hunt` task was dispatched to the `codex` adapter with a tightly scope-locked, fully-specified brief (review a design proposal; write findings to a named path). The dispatch **plumbing worked perfectly** — resolved vendor, spawned detached, ran to completion (`done`, exit 0, 277.8s, 124k tokens, clean frontmatter/log/progress). **But the codex run did not perform the dispatched task.** Two compounding failures:

1. **Global-skill hijack (codex ignores the dispatched brief).** Instead of reviewing the proposal named in the brief, codex loaded a global orchestration skill, re-derived an *unrelated* task from the project's `AGENTS.md` "current-next-step" (`S1-M0-01`), ran its own owner/reviewer meta-orchestration for *that*, and wrote 3 spurious files about it. The requested output path was never written. **Brief-level scope-locking does not prevent this** — the brief explicitly said "do NOT trigger gstack-review/whole-repo review," and codex hijacked anyway. This matches two prior failures in the same queue: `S1-M3-03-FINAL-P7` and `-v2`, both `failed` with "codex global gstack-review skill hijacked the task and performed whole-repo diff review instead."

2. **Sub-spawn sandbox failure `CreateProcessWithLogonW failed: 1326`.** Inside its hijacked meta-orchestration, codex spawned its own "owner" and "reviewer" sub-processes; both were blocked by `windows sandbox: CreateProcessWithLogonW failed: 1326` and returned `blocked`. codex then self-adjudicated "not accepted." (`1326` = `ERROR_LOGON_TYPE_NOT_GRANTED` — codex's sandbox cannot create child processes with logon credentials on this Windows host.)

Net: codex exited 0 with confident-looking output that was entirely off-task. hopper reported `done`.

## Contrast — the codex path that DID work (codex-rescue, for reference)

The same review, routed through the **codex plugin's `codex-rescue` subagent** (codex running inside the Claude Code Agent sandbox), showed:

- **1st attempt** (codex asked to read the plan + memo files): blocked by the **same `CreateProcessWithLogonW 1326`** when codex tried to shell out / spawn to read files → returned an inconclusive "NO-GO, restore file access and re-run."
- **2nd attempt** (all file content **fully inlined** in the prompt; codex needed *no* file reads and *no* sub-spawns): **substantive, correct review** — concurring verdict + ranked risks + refinements, 157s, ~17k tokens.

**Conclusion: `1326` is intrinsic to the codex CLI's sandbox on this Windows box, not to any host wrapper — it afflicts both `codex-rescue` and `hopper→codex`.** The only configuration that produced real codex output was **single-shot + fully-inlined content + no file reads + no sub-orchestration**.

## Channel comparison

| | codex-rescue (codex-in-Agent) | hopper→codex (detached `codex.CMD`) |
|---|---|---|
| Dispatch plumbing | ok | **excellent** (queue, frames, background, progress) |
| Honors dispatched brief | yes (when inlined) | **no — global-skill hijack** |
| `1326` on file-read / sub-spawn | yes (1st try) | yes (codex's own sub-spawns) |
| Substantive output | ✅ when content inlined | ❌ off-task; `done`/exit 0 anyway |

## Root-cause hypotheses

- **H1 — codex global skills override the prompt.** codex auto-loads global skills (gstack-review / superpowers-style meta-orchestration). When invoked non-interactively by the adapter, these skills run *their* agenda (whole-repo review, or "current next step" from `AGENTS.md`) instead of the piped/argv brief.
- **H2 — codex sandbox uses `CreateProcessWithLogonW`, which is not granted on this host.** Any codex action that spawns a child (shell, file read via shell, sub-agent) fails `1326`. Only codex's *native* (non-spawning) reasoning works.

## Recommendations for the codex adapter

1. **Invoke codex in a pure single-shot mode with global skills disabled.** Add a codex-adapter flag/env that suppresses skill auto-load and meta-orchestration so the dispatched brief is the only instruction (e.g. whatever codex's equivalent of `--no-skills` / minimal-profile / non-interactive-exec is). This is the single most important fix — it addresses the false-success hijack.
2. **Set / surface codex sandbox + approval mode in the adapter.** On a trusted host, the adapter should be able to request a codex sandbox mode that does not depend on `CreateProcessWithLogonW` (e.g. full-access / no-sandbox), or document that codex sub-spawns are unsupported on this Windows host so tasks are authored single-shot.
3. **Detect off-task false-success.** `executeDispatch` could verify the task's declared output path was actually written (or that the requested artifact exists) before reporting `done`; if not, mark `failed` with a `codex-did-not-honor-brief` diagnostic instead of `done exit=0`. Currently a hijacked run reads as success.
4. **Document the working recipe** in the codex adapter notes / cookbook: *codex on Windows = single-shot, fully-inlined content, no file reads, no sub-orchestration.* Until (1)/(2) land, the codex adapter should compose self-contained prompts (inline the referenced file contents) rather than pointing codex at paths.

## Evidence pointers (x-agents project, may be transient)

- Queue row `S1-AGT-18-RVW-HX` (now `failed`, with inline diagnosis).
- Run artifacts: `.hopper/handoffs/S1-AGT-18-RVW-HX-output.{md,log}` — frontmatter `status: done, exit_code: 0`; log body shows the hijacked `S1-M0-01` work + `CreateProcessWithLogonW failed: 1326` on codex's owner/reviewer sub-spawns.
- Prior occurrences: queue rows `S1-M3-03-FINAL-P7`, `S1-M3-03-FINAL-P7-v2` (both `failed`, gstack-review hijack).

---

## Resolution (2026-06-18, hopper 0.12.0+ — `cli/src/vendors/codex.js`)

1. **Sandbox / 1326 (rec #2):** for `danger-full-access` (the dispatch default) the
   adapter now invokes codex with `--dangerously-bypass-approvals-and-sandbox`
   instead of `-s danger-full-access`. On Windows `-s danger-full-access` still
   runs the sandbox harness (CreateProcessWithLogonW → 1326 on every child); the
   bypass flag runs codex with no sandbox. `read-only` / `workspace-write` keep a
   real `-s` sandbox. Escape hatch: `HOPPER_CODEX_SANDBOX_BYPASS=0`.
2. **Global-skill / plugin hijack (rec #1):** codex 0.131.0 loads global skills as
   marketplace **plugins** (`[plugins."superpowers@openai-curated"]`) + Pre/Post/Stop
   **hooks** + **multi-agent** sub-spawns — none of which the old skills-only config
   strip removed. The adapter now (a) adds `--disable multi_agent --disable hooks
   --disable plugin_hooks` to every dispatch, and (b) extends the isolated-home
   config sanitizer to strip `[plugins.*]` / `[marketplaces.*]` / `[[hooks.*]]` (not
   just `[skills.*]`). Escape hatch: `HOPPER_CODEX_KEEP_ORCHESTRATION=1`.
3. **False-success detection (rec #3):** `parseResult` now classifies a run whose
   output contains `CreateProcessWithLogonW failed: 1326` as `permission-fail`, not
   `success`, so a blocked/hijacked run is no longer reported `done`/exit 0.

Verified live on this Windows host: `codex exec --dangerously-bypass-approvals-and-sandbox
--disable multi_agent --disable hooks --disable plugin_hooks` runs a shell command
(no 1326) and stays on the dispatched brief. Unit tests: tests/unit/codex-isolation.test.js
+ tests/unit/vendors-contract.test.js.

Note (rec #4 / environment): the host's `~/.codex/config.toml` also registers an
`agent-hopper` marketplace + curated plugins; the adapter's isolated CODEX_HOME +
broadened config strip keep those out of dispatched runs, but pruning stale
marketplaces from `~/.codex/config.toml` directly is also advisable.
