# Strategy → Leader handoff: hopper-plugin Phase 0 spike (2026-05-20)

Anchor: `.hopper/handoffs/strategy-2026-05-20-T-PLUGIN-00-dispatch.md::root`

**From**: Strategy Advisor (Claude Opus 4.7, observer mode)
**To**: Leader-primary (GPT-5.5 xhigh, Codex CLI in `F:\workspace\ai\hopper-plugin\`)
**Re**: First dispatch on new hopper-plugin dogfood project — T-PLUGIN-00 host-lifecycle spike
**Anchor refs**:
- `.hopper/PING.md`
- `.hopper/MANIFEST.md`
- `.hopper/AGENTS.md`
- `.hopper/queue.md`
- `.hopper/handoffs/leader-tasklist.md` (T-PLUGIN-00 full spec)
- `F:\workspace\ai\llm-hopper\docs\plans\2026-05-19-hopper-plugin-demo-spec.md` (v1.1.1, design source)
- `F:\workspace\ai\llm-hopper\.hopper\templates\dispatch-strategy-to-leader.md` (template used)

**Template used**: `llm-hopper/.hopper/templates/dispatch-strategy-to-leader.md` v1.0 + §12 recipient gate (commit `20c2df5`, 2026-05-19). This is the **third** real dogfood use of the template family after P0 + P1 dispatches on myWriteAssistant; treat template friction as feedback.

---

## 1. Background changes (FYI, don't review)

- **2026-05-20**: New repo `hopper-plugin` initialized at `F:\workspace\ai\hopper-plugin\`. Remote: `https://github.com/surebeli/hopper-plugin`. License: Apache-2.0.
- **2026-05-20**: Demo spec (v1.0 → v1.1 → v1.1.1) went through 2 codex cross-audit cycles. v1.1 fixed 5 codex findings (2 P0 + 3 P1); v1.1.1 fixed remaining F1 PARTIAL. Spec is now PASS-quality.
- **Goal directive (2026-05-20)**: TWO trigger conditions auto-invoke `/codex` GPT-5.5 xhigh cross-audit:
  1. New proposals (new dispatch handoff, spec revision, architectural decision) → audit BEFORE proceeding
  2. Phase completion (T-PLUGIN-XX done) → audit BEFORE dispatching next phase
- **2026-05-20 cumulative codex audit spend**: ~$0.65 (caught 2 P0 contradictions before any code written). Cheap insurance.

**Impact on this dispatch**: T-PLUGIN-00 is the host-lifecycle spike that resolves all "unknowns" that codex F4 finding flagged (Builders would bounce on manifest schema / codex flags / adapter contract). Pass = all downstream tasks have locked inputs. Fail = stop and reconsider scope.

---

## 2. Authority transfer

### Leader fully authorized to decide:

- T-PLUGIN-00 prong execution order, Builder candidate selection, retry strategy
- All Round 2 sustained escalation triggers (1-5 from myWriteAssistant) + 2 P1 additions (#9 Rust IPC, #10 client-runtime regression — NOT relevant here but contract carries) + NEW spike-specific trigger (see §4)
- Re-scope / split / merge of T-PLUGIN-00 prongs as long as 3-prong purpose preserved (Claude Code plugin / Codex CLI noninteractive / standalone CLI)
- Critic dispatch on `docs/spikes/T-PLUGIN-00-resolved.md` once written (Critic verifies the spike's resolved values are concrete, not hand-wave)
- Push T-PLUGIN-00 task row (already there); push update to status field

### Strategy retains decision on (you must ping):

- Any modification to `F:\workspace\ai\llm-hopper\*` files (different repo — Leader does not touch)
- Spec v1.1.1 modification proposals (if T-PLUGIN-00 reveals spec needs further revision)
- Scope expansion: do NOT silently add a "Prong 4" or pre-implement Phase 1 work during the spike
- T-PLUGIN-00 fail/escalation triggers — Strategy decides downgrade path (Claude Code-only / extend timeline / abandon plugin)
- Whether to push hopper-plugin repo to remote (`origin`) — Strategy authorizes pushes, not Leader

---

## 3. Task spec

### T-PLUGIN-00 (full spec in `.hopper/handoffs/leader-tasklist.md`)

- **Status**: `pending` in queue.md, ready for `ping` pop
- **Builder**: GPT-5.5 high (recommended — exploratory work, needs broad agentic capability). Acceptable secondary: deepseek-v4-pro (if cost-sensitive).
- **Effort**: S (4h hard cap)
- **Budget**: ≤ $1 (subscription tier; the spike is mostly local subprocess testing)
- **Deliverables**:
  1. `cli/bin/hopper-dispatch` — 20-line stub script
  2. Claude Code plugin manifest at resolved path (e.g. `hosts/claude-code/.claude-plugin/plugin.json`)
  3. `docs/spikes/T-PLUGIN-00-resolved.md` — THE source-of-truth for T-PLUGIN-01..10 input values
  4. `.hopper/handoffs/T-PLUGIN-00-output.md` — Step 7.5 output per upgraded schema
- **Verification (Leader self-verify)**:
  1. Run `./cli/bin/hopper-dispatch T00-smoke` from bash — prints expected string
  2. Run codex invocation per documented command line — prints "HOPPER_OK"
  3. Install Claude Code plugin per documented path — invoke `/hopper:smoke` — prints "hopper smoke" (manual verify)
  4. `docs/spikes/T-PLUGIN-00-resolved.md` has all 8+ resolved values from leader-tasklist.md §2 each prong
  5. Output.md satisfies upgraded schema (Verdict + Commit SHA + Checks + cursor-aware Next pointing at T-PLUGIN-01)

---

## 4. Escalation triggers

Carry-over from myWriteAssistant dogfood (sustained):
1. Manual-verify fail ≥2 times
2. Pair quality drop
3. Single task cost > 100% over estimate
4. New protocol gap / essay-grade insight
5. Round/Phase fully done

P1 dispatch additions (still active, project context):
6. AC18-style manual smoke fail (NOT relevant to T-00 but contract carries)
7. Scope creep temptation
8. Anthropic 6/15 community reaction surface

NEW for hopper-plugin Phase 0:
9. **T-PLUGIN-00 prong failure (Prong 1, 2, or 3) → STOP, ping Strategy**. Possible Strategy responses: downgrade cross-host claim further (e.g. Claude Code-only), extend timeline 6-7 days, or abandon plugin demo and revise essay v3 outline §8 to drop demo entirely.
10. **T-PLUGIN-00 time-cap (>4h) regardless of progress → STOP, write `leader-status-<dated>-T00-progress.md`**.
11. **Spike reveals spec inaccuracy** (e.g. resolved value contradicts what spec v1.1.1 §6 said T-PLUGIN-01 will need) → ping Strategy with diagnosis; do NOT silently fix spec.

### Ping format (unchanged from P0 dispatch)
File: `.hopper/handoffs/leader-ping-strategy-<YYYY-MM-DDTHHMM>-<slug>.md`. 5-field schema (Trigger / Context / What I tried / What I need / Cost+Time impact).

---

## 5. Reporting cadence

- **T-PLUGIN-00 done**: 1-line entry to `.hopper/HOPPER-FEEDBACK.md` IF you create one (this repo doesn't have one yet — you decide whether to create or skip); plus output.md per Step 7.5
- **Post-T-PLUGIN-00 phase-completion trigger**: Per goal directive, Strategy auto-invokes `/codex` cross-audit on `T-PLUGIN-00-resolved.md` to verify resolved inputs are concrete enough for T-PLUGIN-01..10. You don't trigger this — Strategy does. Just signal "T-PLUGIN-00 done, ready for codex pass" in output.md Next recommendation.
- **Before T-PLUGIN-01 dispatch (Strategy's call after codex passes)**: Strategy may write a Phase 1 dispatch refining T-PLUGIN-01..06 specs using the resolved values; OR may delegate to you to dispatch T-PLUGIN-01 directly using the leader-tasklist.md draft + spec doc.

---

## 6. Negative space (do NOT do)

- ❌ Do NOT touch `F:\workspace\ai\llm-hopper\*` (different repo)
- ❌ Do NOT modify `.hopper/PING.md` (frozen)
- ❌ Do NOT pre-implement Phase 1 work during the spike (no parser, no queue logic, no real subprocess wrapper — only the 3 proof-of-concept prongs)
- ❌ Do NOT skip writing `docs/spikes/T-PLUGIN-00-resolved.md` — it's the deliverable that unblocks T-PLUGIN-01..10
- ❌ Do NOT mark T-PLUGIN-00 done if any of 3 prongs failed (write blocker, escalate)
- ❌ Do NOT use Anthropic Agent SDK / `claude -p` / direct Anthropic SDK calls in the stub (this is the 6/15 cap sidestep — hard acceptance #3 in spec)
- ❌ Do NOT push the hopper-plugin repo to GitHub remote (Strategy authorizes pushes)

---

## 7. Suggested phase cursor (push to MANIFEST.md after ack)

```
**Status**: T-PLUGIN-00 host-lifecycle spike in progress per strategy-2026-05-20-T-PLUGIN-00-dispatch.md. Leader executing 3 prongs (Claude Code plugin / codex noninteractive / standalone CLI). 4h hard cap.

**Current cursor**: Builder (GPT-5.5 high) running prongs in order documented in §10 recipient gate.

**Next action**:
1. Builder completes 3 prongs.
2. Writes docs/spikes/T-PLUGIN-00-resolved.md.
3. Leader marks T-PLUGIN-00 done, signals "ready for codex pass" in output.md.
4. Strategy auto-invokes /codex cross-audit on resolved.md.
5. If codex PASSES: Strategy dispatches Phase 1 (T-PLUGIN-01).
6. If codex FAILS: revise spec, retry.
```

---

## 8. Acknowledge requirement

When you pop this handoff, create `.hopper/HOPPER-FEEDBACK.md` (this repo doesn't have one yet) and add as first line:

```
- 2026-05-20 Strategy → Leader hopper-plugin Phase 0 dispatch ack'd; T-PLUGIN-00 spike starting; will write docs/spikes/T-PLUGIN-00-resolved.md as primary deliverable; Strategy will auto-invoke /codex after I mark done.
```

OR if you prefer to skip HOPPER-FEEDBACK for now (since this repo is small + early), ack via chat output to user and proceed. Leader's call.

Execute after ack. Strategy out.

---

## 9. Cost / time projections

- **T-PLUGIN-00**: $1 ceiling (subscription tier, exploratory)
- **Codex cross-audit on resolved.md** (Strategy's out-of-band): ~$0.10-0.30 (smaller scope than spec audit)
- **Total Phase 0 spend**: ~$1.20-1.40
- **Time**: 4h hard cap on spike + ~10 min Strategy codex audit = same-day delivery (2026-05-20)
- **If spike succeeds**: Phase 1 dispatch by end-of-day 2026-05-20 OR morning 2026-05-21

---

## 10. Dispatcher self-check (Strategy ran this before sending)

All 5 answered YES:

1. **Leader-zero-context start?** YES — §3 references leader-tasklist.md which has full 3-prong spec; spec doc has additional context
2. **Knowable done without ping?** YES — §3 verification bullets are concrete; §4 escalation triggers explicit
3. **In-scope deviation vs blocker distinguishable?** YES — §4 has 3 new spike-specific triggers; §6 negative space explicit (no scope expansion, no early Phase 1 work)
4. **Output shape known?** YES — leader-tasklist.md §7 specifies output.md + resolved.md; upgraded builder-output template
5. **Cursor-aware Next?** YES — §3 verification bullet 5 explicitly forbids Next pointing outside Phase 0 cursor

---

## 11. Reference to prior dispatches

- **First dispatch on this repo** (no prior to supersede)
- **Sibling lineage**: myWriteAssistant `strategy-2026-05-15-p0-dispatch.md` (Round 2 P0) and `strategy-2026-05-19-p1-dispatch.md` (Round 2 P1) for protocol convention reference
- **Spec source**: `F:\workspace\ai\llm-hopper\docs\plans\2026-05-19-hopper-plugin-demo-spec.md` v1.1.1 (post 2 codex audit cycles)
- **Template version**: `dispatch-strategy-to-leader.md` v1.0 + §12 recipient gate (llm-hopper commits `626de85` + `20c2df5`)
- **Cross-audit lineage**: This dispatch IS itself a "new proposal" per goal-condition #1. Strategy invoked codex on the spec twice (v1.0 REWORK → v1.1 PASS_WITH_CHANGES → v1.1.1 fix); this dispatch encodes the post-audit truth. Re-auditing this dispatch separately would be redundant (already covered by spec audit). Codex's NEXT trigger fires on T-PLUGIN-00 completion (goal-condition #2).

---

## 12. Recipient pre-execution gate (MANDATORY — read this section twice)

> ⚠️ **STOP** before any work execution. Complete this gate first.
> ⚠️ Skipping = closure failure waiting to happen. Restate-then-think-then-execute is non-optional.
> ⚠️ Think before execute. The handoff already contains everything you need; do not guess, do not skim.

### Required actions (in order, BEFORE §1 begins)

1. **Restate** this dispatch in your own words, 3-5 bullets — to chat OR `.hopper/handoffs/leader-restate-T-PLUGIN-00.md`.
2. **Identify** the top 3 hard prohibitions from §6 (negative space). Concrete bullets — not vague.
3. **Identify** the escalation trigger most likely to fire (recommend: focus on #9 prong-2 codex sandbox failure — that's the highest-uncertainty prong).
4. **State** your execution sequence for the 3 prongs (recommend: Prong 3 standalone CLI first as simplest baseline, then Prong 2 codex subprocess, then Prong 1 Claude Code plugin which has most external doc-reading; document if you choose different order).
5. **Mirror §10 dispatcher self-check from recipient perspective**: ask each of the 5 questions about yourself. Any NO → ping back BEFORE executing.

### Strict adherence (repeat for emphasis)

> ⚠️ Execute only what §3 specifies (3 prongs). Nothing more. No silent Phase 1 pre-implementation. No "let me also write the parser while I'm here."
>
> ⚠️ If you find yourself reaching for files outside `cli/bin/`, `hosts/claude-code/.claude-plugin/`, `docs/spikes/`, `.hopper/` (queue/cost/output) — STOP. That's scope creep, trigger #7, ping Strategy.
>
> ⚠️ Triple emphasis on think-before-execute: the spike's purpose is INFORMATION GATHERING. Document everything; assume nothing. This is exactly the failure mode codex F4 flagged — Builders inventing values when handoffs were vague. Don't invent. Document what you actually observe.

### Trace

This gate is the recipient-side complement to §10 (dispatcher-side) self-check. Source principle: `llm-hopper` `USAGE-GUIDE.md` §3.3 Dispatcher Empathy (commit `20c2df5`, 2026-05-19). First real dogfood use: this dispatch.

---

Execute after gate complete. Strategy out, awaiting `T-PLUGIN-00-output.md` + signal "ready for codex pass".
