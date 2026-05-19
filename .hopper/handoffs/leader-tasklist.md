# Leader Task List — hopper-plugin (Demo)

Anchor: `.hopper/handoffs/leader-tasklist.md::root`

- Source spec: `F:\workspace\ai\llm-hopper\docs\plans\2026-05-19-hopper-plugin-demo-spec.md` (v1.1.1, post-codex)
- Issued by: Strategy Advisor (Claude Opus 4.7), 2026-05-20
- Status: T-PLUGIN-00 ready for dispatch; T-PLUGIN-01..10 pending T-PLUGIN-00 outputs

---

## Task conventions

- Each task = one git commit, prefix `[T-PLUGIN-NN]` or `[review:T-PLUGIN-NN]`
- Builder runs acceptance self-check, then writes `<task-id>-output.md` per upgraded schema (Verdict + Commit SHA + Checks + cursor-aware Next)
- §12 Recipient pre-execution gate (per llm-hopper commit `20c2df5`) is MANDATORY before Builder starts §1 of any task spec
- Critic review on T-PLUGIN-10 (independent verification)
- Severity: S = 1-2h, M = half-day, L = full day

---

## **T-PLUGIN-00** — Host-lifecycle spike (Phase 0, Day 1 morning)

- Role: builder
- Effort: S (4h hard cap)
- Priority: high
- Depends: none

### 1. Context (read first)

- Spec section: `docs/plans/2026-05-19-hopper-plugin-demo-spec.md` §6 Phase 0 (full task definition)
- Strategy dispatch: `.hopper/handoffs/strategy-2026-05-20-T-PLUGIN-00-dispatch.md` §3 (P0 of this dispatch)
- Hard acceptance criteria for the spike's outputs: `docs/plans/2026-05-19-hopper-plugin-demo-spec.md` §3 #2 Tier A/B/C definitions
- Background: this is a host-lifecycle smoke spike that proves OR KILLS three feasibility claims before any production code is written. Outputs become source-of-truth for T-PLUGIN-01..10.

### 2. Scope

Three prongs, each with concrete acceptance:

#### Prong 1: Claude Code plugin registration
- Write a minimal Claude Code plugin manifest (probably `.claude-plugin/plugin.json` per current Claude Code plugin docs — VERIFY actual schema by reading Claude Code docs / existing plugins; do NOT assume)
- Manifest declares a single slash command `/hopper:smoke` that prints "hopper smoke" to chat
- Install plugin in a Claude Code session, invoke `/hopper:smoke`, see expected output
- DOCUMENT in `docs/spikes/T-PLUGIN-00-resolved.md`:
  - Manifest file path (relative to repo root)
  - Manifest schema version
  - Validator command (if any)
  - Command namespace prefix (`hopper:` vs other)
  - Entrypoint shape (TypeScript? JavaScript? shell script?)
  - Package manager (npm / bun / pnpm) — recommendation + reasoning
  - TypeScript version (if using TS)

#### Prong 2: Codex CLI noninteractive subprocess
- Invoke `codex exec` (or `codex` with appropriate flags) noninteractively such that stdin "say HOPPER_OK" produces stdout containing "HOPPER_OK"
- Try with sandbox=read-only, model_reasoning_effort=medium, --json output
- DOCUMENT in `docs/spikes/T-PLUGIN-00-resolved.md`:
  - Exact codex invocation command line
  - Stdin contract (how task spec is passed)
  - Approval mode / sandbox flag chosen + reason
  - Recommended timeout value (seconds) + rationale
  - Process-tree kill behavior on Windows (since user is on Win11)
  - stderr handling (stream to chat? capture to log? both?)
  - cwd handling (`-C <path>`)
  - Auth-missing behavior (what does codex return? how should plugin surface?)

#### Prong 3: Standalone CLI baseline
- Write a 20-line Node/Bun script at `cli/bin/hopper-dispatch` that accepts a task-id arg and prints "hopper standalone got <task-id>" to stdout
- Make executable (chmod +x or PowerShell equivalent)
- Run from bare PowerShell / bash WITHOUT any Claude Code session, see expected output
- DOCUMENT in `docs/spikes/T-PLUGIN-00-resolved.md`:
  - Node vs Bun decision + reasoning
  - Shebang / Windows .cmd wrapper approach
  - Path resolution (where users add to PATH)

### 3. Acceptance criteria (machine-checkable)

1. ✓ Prong 1 — Manifest file exists at documented path; `/hopper:smoke` invocation in Claude Code session prints "hopper smoke" (manual verify, screenshot or text-paste evidence)
2. ✓ Prong 2 — `echo "say HOPPER_OK" | codex exec [flags]` (exact command from documented) prints "HOPPER_OK" to stdout in <30s
3. ✓ Prong 3 — `./cli/bin/hopper-dispatch T00-smoke` from bash prints "hopper standalone got T00-smoke"
4. ✓ `docs/spikes/T-PLUGIN-00-resolved.md` exists with all 3 prong's documented values (manifest schema/path/pkg-mgr/codex flags/timeout/kill/etc.)
5. ✓ Time spent ≤ 4 hours; if blocked or near cap, escalate (see §6)

### 4. Files Builder allowed to create/modify

- `cli/bin/hopper-dispatch` (Prong 3 — minimal script)
- `.claude-plugin/plugin.json` or wherever Prong 1 lands manifest (per resolved schema)
- `docs/spikes/T-PLUGIN-00-resolved.md` (NEW; the resolved-inputs source-of-truth)
- `.hopper/queue.md` (status flip per PING Step 3 / 7)
- `.hopper/COST-LOG.md` (Step 8 append)
- `.hopper/handoffs/T-PLUGIN-00-output.md` (Step 7.5 artifact)
- Optionally: `package.json` if Prong 1 requires it; document decision

### 5. Files Builder MUST NOT modify

- `.hopper/PING.md`
- `.hopper/MANIFEST.md` structure (data row addition OK, structure stays)
- `.hopper/AGENTS.md` role definitions
- Anything in sibling repo `F:\workspace\ai\llm-hopper`

### 6. Escalation path

- **Prong 1 fails** (e.g. Claude Code plugin manifest path not findable, slash command doesn't register): write `.hopper/handoffs/leader-ping-strategy-<dated>-T00-prong1-fail.md`, STOP. Strategy decides scope reduction.
- **Prong 2 fails** (e.g. codex doesn't accept noninteractive stdin cleanly, auth issues, sandbox blocks subprocess): write `leader-ping-strategy-<dated>-T00-prong2-fail.md`. This is more serious — Codex CLI host (Tier C) might be impossible.
- **Prong 3 fails** (rare): debug platform issue (Node/Bun on Windows). Should not fail.
- **Time cap (>4h)**: STOP regardless of progress, write `leader-status-<dated>-T00-progress.md` with what's done + what's blocked.

### 7. Closure mechanism

- Write `.hopper/handoffs/T-PLUGIN-00-output.md` per `F:\workspace\ai\llm-hopper\.hopper\templates\builder-output.md` schema (Verdict / Commit SHA / Checks / cursor-aware Next)
- `docs/spikes/T-PLUGIN-00-resolved.md` is the AUX deliverable — referenced by all downstream tasks
- Flip queue.md row pending → in-progress → done
- Commit prefix `[T-PLUGIN-00]`
- After commit: per goal-condition #2 (phase completion), Strategy auto-invokes `/codex` cross-audit on T-PLUGIN-00-resolved.md before T-PLUGIN-01 dispatch

### 8. Edge cases / known gotchas

- Claude Code plugin docs / schema may not be fully public; expect 30+ min reading docs / examples / experimenting
- Codex CLI on Windows may have quirks vs Linux; test specifically on Windows since that's the user's platform
- The "say HOPPER_OK" stdin test is a stand-in for full task-spec passing; if codex requires specific JSON or has prompt template overhead, document the gap

### 9. Open questions Builder might find

If Builder finds any of these during execution, write Open questions section in output.md + ping Leader before declaring done:
- "Should manifest live at repo root or under `hosts/claude-code/`?" → recommend `hosts/claude-code/.claude-plugin/plugin.json` so it's host-scoped from day 1
- "Should I commit `cli/bin/hopper-dispatch` even though it's just a stub?" → YES — it's part of the spike output proving baseline works
- "What if Claude Code plugin only loads when symlinked to a specific path?" → document the symlink requirement; that's exactly the kind of host-lifecycle gotcha the spike exists to find

### 10. Recipient pre-execution gate (per template §12)

Before starting Prong 1, Builder MUST complete:
1. Restate this task in 3-5 own-words bullets to chat
2. Identify top 3 hard prohibitions (see §5)
3. Identify most-likely-to-fire escalation trigger (probably Prong 2 codex sandbox issue)
4. State execution sequence (recommended: Prong 3 → Prong 1 → Prong 2 since Prong 3 is fastest and clearest baseline; document rationale if different order chosen)
5. Mirror §10 dispatcher self-check: any NO → ping Leader before executing

Skipping this gate = closure failure waiting to happen. The 2026-05-17 double-rework retro proved this.

---

## T-PLUGIN-01 to T-PLUGIN-10 — Pending T-PLUGIN-00 outputs

These tasks remain in `pending` status until T-PLUGIN-00 completes and `docs/spikes/T-PLUGIN-00-resolved.md` is written. Leader will detail each task spec post-spike, using the locked input values from the resolved doc.

Brief preview (full specs added post-spike):
- T-PLUGIN-01: Repo init + plugin manifest (uses resolved schema/path/pkg-mgr verbatim)
- T-PLUGIN-02 through 06: Core CLI logic (queue parser, agent resolver, spec extractor, subprocess wrapper, output writer)
- T-PLUGIN-07: Claude Code slash command wiring (Tier B full)
- T-PLUGIN-08: Cross-host adapters (Codex CLI Tier C if Prong 2 spike permits)
- T-PLUGIN-09: README + screencast
- T-PLUGIN-10: Critic end-to-end verification (3 hard acceptance criteria)

Refer to `F:\workspace\ai\llm-hopper\docs\plans\2026-05-19-hopper-plugin-demo-spec.md` §6 for current draft of each task.
