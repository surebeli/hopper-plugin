# Strategy → Leader handoff: hopper-plugin Phase 0 spike (2026-05-20, v2.0 supersedes earlier v1.1.1 dispatch)

Anchor: `.hopper/handoffs/strategy-2026-05-20-T-PLUGIN-00-dispatch.md::root`

> **Supersedes**: this file's earlier content (v1.1.1 dispatch, committed `82ed578`). Reasoning: user goal-directive 2026-05-20 introduced (a) task-based orchestration, (b) no-harness-core constraint, (c) 5-vendor adapter scope (C+ decision). Earlier dispatch referenced v1.1.1 spec; v2.0 spec required restructuring this dispatch BEFORE Leader pops. Audit trail in git history (commit `82ed578` → this file's update).

**From**: Strategy Advisor (Claude Opus 4.7, observer mode)
**To**: Leader-primary (GPT-5.5 xhigh, Codex CLI in `F:\workspace\ai\hopper-plugin\`)
**Re**: Phase 0 spikes (T-PLUGIN-00 host-lifecycle + T-PLUGIN-00b vendor invocation) + Phase 0.5 tasks library bootstrap
**Anchor refs**:
- `.hopper/PING.md`
- `.hopper/MANIFEST.md`
- `.hopper/AGENTS.md` (v2.0 schema — task-vendor-preference, not role binding)
- `.hopper/queue.md` (v2 schema — Task-type column; 18 tasks queued)
- `.hopper/handoffs/leader-tasklist.md` (will be updated in T-PLUGIN-00.5 to use task-type frames)
- `F:\workspace\ai\llm-hopper\docs\plans\2026-05-19-hopper-plugin-demo-spec.md` (v2.0, post 2 codex audit cycles)
- `F:\workspace\ai\llm-hopper\.hopper\USAGE-GUIDE.md` §3.4 (task-type vs role explanation, NEW v2.0)

**Template used**: `llm-hopper/.hopper/templates/dispatch-strategy-to-leader.md` v1.0 + §12 recipient gate. Per Dispatcher Empathy + Recipient gate disciplines.

---

## 1. Background changes (FYI, don't review)

Since the v1.1.1 dispatch on this same file:

- **2026-05-20 user goal directive (later in day)**: introduced 2 architectural pivots — (A) task-based orchestration instead of role-based; (B) no harness reaction core (leverage vendor CLI native harnesses). Plus 5-vendor adapter scope (Codex + Kimi + OpenCode + Copilot + Antigravity-or-Gemini).
- **Spec v2.0 written** (pre-codex-v2.0-audit; audit currently pending). 18 tasks queued (vs v1.1.1's 11), timeline 10-12 days (vs 5).
- **Subagent research 2026-05-20** confirmed all 5 vendors are agent-callable with caveats: Kimi best ergonomics, OpenCode requires pin 0.14.7, Copilot has quota meter, Antigravity OAuth uncertain (Gemini bridge until 2026-06-18 deadline).
- **AGENTS.md schema v2.0** — vendor binding replaces role binding. T-PLUGIN-00.5 tasks library bootstraps 6 task-type frames.

**Impact on this dispatch**: T-PLUGIN-00 (host-lifecycle spike) **scope is unchanged** — still 3 prongs (Claude Code plugin / Codex CLI noninteractive / standalone CLI). But T-PLUGIN-00b is NEW — vendor invocation spike for 4 additional vendors (Kimi/OpenCode/Copilot/Gemini). And T-PLUGIN-00.5 follows immediately after to bootstrap the tasks library that all downstream code-impl tasks depend on.

---

## 2. Authority transfer

### Leader fully authorized to decide:

- T-PLUGIN-00 / T-PLUGIN-00b / T-PLUGIN-00.5 prong execution order, Builder selection, retry strategy
- Whether to run T-PLUGIN-00 and T-PLUGIN-00b serially or in parallel (Builder bandwidth permitting)
- Critic dispatch on resolved.md outputs once written (Critic verifies resolved values are concrete, not hand-wave)
- All Round 2 escalation triggers (sustained) + P1 additions + Phase 0 spike-specific (see §4)
- Re-scope of spike prongs as long as the 3 (T-00) + 4 (T-00b) prongs' purpose is preserved
- Push T-PLUGIN-00/00b/00.5 status rows (already queued)

### Strategy retains decision on (you must ping):

- Any modification to `F:\workspace\ai\llm-hopper\*` files (different repo)
- Spec v2.0 modification proposals (if Phase 0 spikes reveal spec needs further revision)
- Scope expansion: do NOT silently add a 4th prong to T-00 or 5th vendor to T-00b
- Vendor downgrade decisions: if T-00b reveals a vendor blocked (e.g. Antigravity OAuth headless impossible), ping Strategy before marking that vendor doc-only; Strategy decides whether to downgrade spec
- Whether to push hopper-plugin repo to remote (Strategy authorizes pushes)
- Whether T-PLUGIN-00.5 task-type frames need iteration (Strategy may want to review the 6 frames before they're committed)

---

## 3. Task spec (Phase 0 + Phase 0.5)

### T-PLUGIN-00 — Host-lifecycle spike (UNCHANGED scope from v1.1.1)

- Task-type: `spec-blindspot-hunt`
- Vendor: codex-builder (gpt-5.5-xhigh via Codex CLI)
- Effort: S (4h hard cap)
- Spec: full in `.hopper/handoffs/leader-tasklist.md` T-PLUGIN-00 section
- Deliverable: `docs/spikes/T-PLUGIN-00-resolved.md`
- 3 prongs: Claude Code plugin registration / Codex CLI noninteractive / Standalone CLI baseline

### T-PLUGIN-00b — Vendor invocation spike *(NEW v2.0)*

- Task-type: `spec-blindspot-hunt`
- Vendor: codex-builder (same Builder runs both spikes for context efficiency)
- Effort: S (2h hard cap, parallel-eligible with T-PLUGIN-00)
- Spec: validate 4 vendor CLIs noninteractive invocation:
  - **Kimi**: install `kimi-cli` (PyPI), run `echo "say KIMI_OK" | kimi -p --print --afk`, document flag confirmation
  - **OpenCode**: install `opencode@0.14.7` (pin per #3213), run `opencode run "say OPENCODE_OK"`, document flag confirmation
  - **Copilot**: install `@github/copilot` (npm), run `copilot -p "say COPILOT_OK"` with `GH_TOKEN` PAT having "Copilot Requests" permission, document
  - **Gemini** (Antigravity bridge): install `gemini` CLI, run `gemini -p "say GEMINI_OK"`, document (acknowledge: 2026-06-18 deprecation deadline for non-enterprise users)
- Per-vendor documentation in `docs/spikes/T-PLUGIN-00b-vendors.md`: exact invocation, auth requirement, observed quirks, version pinned
- **If a vendor fails to run noninteractively**: mark as Tier D (doc-only adapter spec), continue with remaining; do NOT block other vendors
- **Antigravity specifically deferred**: subagent research said OAuth blocks headless auth; do NOT attempt headless install during spike; document spec for Antigravity adapter as future work
- Acceptance: ≥ 3 of 4 vendors print expected output; resolved.md exists

### T-PLUGIN-00.5 — Tasks library bootstrap *(NEW v2.0)*

- Task-type: `spec-write` (writing a frame is a spec-shaped activity)
- Vendor: codex-builder (high reasoning for prompt design)
- Effort: S (3h)
- Depends: T-PLUGIN-00 + T-PLUGIN-00b complete (need resolved values to fully spec frames)
- Scope: write 6 `.hopper/tasks/<type>.md` files at hopper-plugin repo. Each frame includes:
  - **When to apply**: clear use cases
  - **Acceptance shape**: what kind of acceptance criteria this task-type uses (machine-check? manual verify? verdict-based?)
  - **Output.md schema requirements**: required fields specific to this task-type
  - **Negative space**: what this task-type does NOT do (boundary with adjacent types)
  - **Vendor preference**: default vendor for this task-type (matches AGENTS.md table)
- Initial 6 frames:
  - `spec-write.md`
  - `code-impl.md`
  - `code-review-adversarial.md`
  - `code-review-acceptance.md`
  - `sidecar-polish.md`
  - `spec-blindspot-hunt.md`
- Acceptance: 6 files in `.hopper/tasks/`; cross-referenced from queue.md task-type column values; structurally consistent (similar layout across all 6)

---

## 4. Escalation triggers

Carry-over from myWriteAssistant + P1 dispatch (sustained):
1-8: same as previous dispatch

NEW for hopper-plugin Phase 0:
9. **T-PLUGIN-00 prong failure** → STOP, ping Strategy. Possible: downgrade cross-host claim, extend timeline, abandon plugin demo
10. **T-PLUGIN-00 time-cap (>4h)** → STOP, write progress digest
11. **Spike reveals spec inaccuracy** → ping Strategy with diagnosis

NEW v2.0:
12. **T-PLUGIN-00b vendor catastrophe**: if ≥2 of 4 vendors are noninteractive-blocked → ping Strategy. Strategy may downgrade spec v2.0 scope from 5 vendors to 3 (Codex + Kimi + OpenCode minimum).
13. **T-PLUGIN-00b Antigravity OAuth proves possible headless**: this is a positive surprise — ping Strategy to upgrade spec to include Antigravity adapter implementation (instead of doc-only).
14. **T-PLUGIN-00.5 task-type confusion**: if while writing the 6 frames you find boundaries between task-types are ambiguous (e.g. spec-write vs code-impl for a borderline task), ping Strategy for boundary clarification before continuing. Don't invent boundary decisions silently — those become long-term protocol decisions.

---

## 5. Reporting cadence

- **T-PLUGIN-00 done**: brief HOPPER-FEEDBACK entry + output.md per Step 7.5
- **T-PLUGIN-00b done**: same
- **T-PLUGIN-00.5 done**: same
- **After all 3 Phase 0 tasks done**: per goal-condition #2 (phase completion), Strategy auto-invokes `/codex` cross-audit on `T-PLUGIN-00-resolved.md` + `T-PLUGIN-00b-vendors.md` + 6 tasks/*.md frames. You don't trigger this — Strategy does. Just signal "Phase 0 done, ready for codex pass" in final output.md Next recommendation.
- **Before T-PLUGIN-01 dispatch (Strategy's call after codex passes)**: Strategy may write Phase 1 dispatch refining T-PLUGIN-01..04 specs using resolved values; OR delegate to you.

---

## 6. Negative space (do NOT do)

- ❌ Do NOT touch `F:\workspace\ai\llm-hopper\*` (different repo)
- ❌ Do NOT modify `.hopper/PING.md` (frozen)
- ❌ Do NOT pre-implement Phase 1+ work during Phase 0 (no parser, no real queue logic, no real adapter code — only proof-of-concept stubs + documentation)
- ❌ Do NOT skip writing the 3 resolved.md / vendors.md / tasks/*.md deliverables — they're the source-of-truth for everything downstream
- ❌ Do NOT mark Phase 0 done if any prong failed without Strategy ack
- ❌ Do NOT use Anthropic Agent SDK / `claude -p` / direct Anthropic SDK in any code (hard acceptance #3 in spec)
- ❌ Do NOT push hopper-plugin repo to GitHub remote (Strategy authorizes pushes)
- ❌ Do NOT design retry/fallback/circuit-breaker logic during T-PLUGIN-00b spike (hard acceptance #4 — no harness core; spike just confirms each vendor's noninteractive invocation, no orchestration)
- ❌ Do NOT use Role-based language in 6 task-type frames (hard acceptance #5 — task-based dispatch; frames describe TASK shape, not AGENT role)

---

## 7. Suggested phase cursor (push to MANIFEST.md after ack)

```
**Status**: Phase 0 spikes + Phase 0.5 tasks library in progress per strategy-2026-05-20 v2.0 dispatch. Leader executing T-PLUGIN-00 (host-lifecycle) + T-PLUGIN-00b (vendor invocation) + T-PLUGIN-00.5 (tasks library bootstrap).

**Current cursor**: Builder running prongs in order documented in §12 recipient gate. 4h cap on T-00, 2h cap on T-00b, 3h cap on T-00.5.

**Next action**:
1. Builder completes 3 prongs (T-00) + 4 vendor checks (T-00b) + 6 task-type frames (T-00.5).
2. Writes docs/spikes/T-PLUGIN-00-resolved.md, docs/spikes/T-PLUGIN-00b-vendors.md, .hopper/tasks/*.md (6 files).
3. Leader marks all 3 tasks done; signals "Phase 0 complete, ready for codex pass" in final output.md Next.
4. Strategy auto-invokes /codex cross-audit on combined Phase 0 outputs (per goal-condition #2).
5. If codex PASSES: Strategy dispatches Phase 1 (T-PLUGIN-01..04 plumbing).
6. If codex FAILS: revise + retry.
```

---

## 8. Acknowledge requirement

Append to top of `.hopper/HOPPER-FEEDBACK.md` (create if not exists):

```
- 2026-05-20 Strategy → Leader hopper-plugin Phase 0 dispatch v2.0 ack'd; T-PLUGIN-00 + T-PLUGIN-00b + T-PLUGIN-00.5 starting; will produce docs/spikes/*-resolved.md + 6 .hopper/tasks/*.md as primary deliverables; Strategy will auto-invoke /codex after I mark all 3 done.
```

OR ack via chat output if you prefer to skip HOPPER-FEEDBACK for now (small early project).

Execute after ack. Strategy out, awaiting Phase 0 completion signal.

---

## 9. Cost / time projections

- **T-PLUGIN-00**: $1 ceiling (subscription tier, exploratory)
- **T-PLUGIN-00b**: $0.50 ceiling (4 vendor smoke tests, each one $0.10-0.15)
- **T-PLUGIN-00.5**: $0.50 ceiling (6 frame writes, reuse research)
- **Codex Phase 0 audit (Strategy OOB)**: $0.30-0.60
- **Total Phase 0 + Phase 0.5**: ~$2.30-2.60
- **Time**: 4h + 2h + 3h = 9h focused work; calendar 1 day (parallel-eligible)

---

## 10. Dispatcher self-check (Strategy ran this before sending v2.0)

All 5 answered YES:

1. **Leader-zero-context start?** YES — §3 references leader-tasklist.md (will be updated for v2.0 tasks); spec v2.0 doc available cross-repo
2. **Knowable done without ping?** YES — §3 acceptance bullets are concrete per spike; §4 escalation explicit
3. **In-scope deviation vs blocker distinguishable?** YES — §4 has 6 new spike-specific triggers; §6 negative space explicit
4. **Output shape known?** YES — 3 deliverables (resolved.md, vendors.md, tasks/*.md) specified
5. **Cursor-aware Next?** YES — §7 explicitly forbids Phase 1+ pre-implementation

---

## 11. Reference to prior dispatches

- **First dispatch on this repo** (this file supersedes its own v1.1.1 version 6h earlier today; audit trail in git)
- **Sibling lineage**: myWriteAssistant strategy-2026-05-15-p0 (Round 2 P0) and strategy-2026-05-19-p1 (Round 2 P1) for protocol convention reference
- **Spec source**: `F:\workspace\ai\llm-hopper\docs\plans\2026-05-19-hopper-plugin-demo-spec.md` v2.0 (codex audit pending)
- **Template version**: `dispatch-strategy-to-leader.md` v1.0 + §12 recipient gate
- **v2.0 origin**: user goal directive 2026-05-20 introduced task-based orchestration + no-harness-core + 5-vendor scope decisions

---

## 12. Recipient pre-execution gate (MANDATORY — read this section twice)

> ⚠️ **STOP** before any work execution. Complete this gate first.
> ⚠️ Skipping = closure failure waiting to happen. Restate-then-think-then-execute is non-optional.
> ⚠️ Think before execute. The handoff already contains everything you need; do not guess, do not skim.

### Required actions (in order, BEFORE §1 begins)

1. **Restate** this v2.0 dispatch in your own words, 3-5 bullets — to chat OR `.hopper/handoffs/leader-restate-T-PLUGIN-00-v2.md`. Include explicitly: "v2.0 added T-PLUGIN-00b vendor spike + T-PLUGIN-00.5 tasks library on top of v1.1.1's T-PLUGIN-00".
2. **Identify** the top 3 hard prohibitions from §6 (negative space). The new v2.0-specific prohibition #8 (no retry/fallback logic during T-00b) and #9 (no role language in task-type frames) MUST be in your top 3 — they're the architectural anti-patterns this dispatch is built to prevent.
3. **Identify** the escalation trigger most likely to fire. Recommend focus: #12 vendor catastrophe (if ≥2 of 4 vendors blocked, scope downgrade needed). Antigravity OAuth is the most uncertain — but per §3 we're using Gemini bridge, so Antigravity blocking isn't catastrophic.
4. **State** your execution sequence. Recommended:
   - Morning: T-PLUGIN-00 (host-lifecycle, 4h cap) — most uncertain, longest cap
   - Afternoon: T-PLUGIN-00b (vendor invocation, 2h cap) — parallel possible if Builder bandwidth allows
   - Evening: T-PLUGIN-00.5 (tasks library, 3h) — depends on both spike outputs
   - Document if you choose different order
5. **Mirror §10 dispatcher self-check from recipient perspective**: any NO → ping Strategy BEFORE executing.

### Strict adherence (repeat for emphasis)

> ⚠️ Execute only what §3 specifies (3 tasks). Nothing more. No Phase 1 pre-implementation. No "let me also write the parser while I'm here."
>
> ⚠️ If you find yourself reaching for files outside `cli/bin/`, `hosts/claude-code/.claude-plugin/`, `docs/spikes/`, `.hopper/tasks/`, `.hopper/` (queue/cost/output/handoffs) — STOP. That's scope creep. Trigger #7. Ping Strategy.
>
> ⚠️ Triple emphasis on think-before-execute: the spike's purpose is INFORMATION GATHERING + LIBRARY BOOTSTRAP. Document everything. Assume nothing. Invent nothing.

### Trace

This gate is the recipient-side complement to §10 (dispatcher-side) self-check. Source: `llm-hopper` `USAGE-GUIDE.md` §3.3 Dispatcher Empathy (commit `20c2df5`, 2026-05-19). This is the second dogfood-validated use of the template on Phase 0 spike work.

---

Execute after gate complete. Strategy out, awaiting Phase 0 completion + codex audit pass before dispatching Phase 1.
