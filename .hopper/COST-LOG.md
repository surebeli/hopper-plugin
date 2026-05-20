# Cost Log — hopper-plugin

Anchor: `.hopper/COST-LOG.md::root`

Tier key: `sub` = subscription quota (ChatGPT Plus for Codex CLI, Claude Pro for Claude Code TUI, etc.), `API` = per-token billing, `mixed` = subscription with API overflow, `n/a` = unknown / not measured

---

## Phase 0 — Host-lifecycle spike + vendor invocation spike + tasks library bootstrap (2026-05-20)

| Date | Task | Task-type | Model | Tokens In/Out | Approx $ | Tier | Notes |
|------|------|-----------|-------|---------------|----------|------|-------|
| 2026-05-20 | T-PLUGIN-00 | spec-blindspot-hunt | claude-opus-4-7 (Strategy-as-developer in Claude Code TUI) | n/a (interactive session) | $0 marginal | sub | Host-lifecycle spike; 3 prongs investigated; PASS_WITH_NOTE |
| 2026-05-20 | T-PLUGIN-00 Prong 2 smoke | spec-blindspot-hunt | codex GPT-5 (low reasoning) | ~19,000/~50 | ~$0.02 | sub | Smoke `echo "say HOPPER_PRONG2_OK" \| codex exec ...` returned expected |
| 2026-05-20 | T-PLUGIN-00b | spec-blindspot-hunt | claude-opus-4-7 (Strategy-as-developer) | n/a | $0 marginal | sub | Vendor invocation spike; OpenCode smoke verified end-to-end; Kimi syntax-verified auth-blocked |
| 2026-05-20 | T-PLUGIN-00b OpenCode smoke | spec-blindspot-hunt | deepseek-v4-flash (via OpenCode) | ~100/~50 | ~$0.0001 | API | Smoke returned HOPPER_OPENCODE_OK |
| 2026-05-20 | T-PLUGIN-00b Kimi smoke | spec-blindspot-hunt | kimi-thinking | ~50/0 | $0 | sub | HTTP 402 membership error; invocation syntax verified |
| 2026-05-20 | T-PLUGIN-00.5 | spec-write | claude-opus-4-7 (Strategy-as-developer) | n/a | $0 marginal | sub | 6 task-type frame files written |

**Phase 0 subtotal (initial)**: ~$0.02 API + 0 marginal subscription cost.

### Phase 0 re-smoke (Path A resolution 2026-05-20T<later>)

| Date | Task | Task-type | Model | Tokens In/Out | Approx $ | Tier | Notes |
|------|------|-----------|-------|---------------|----------|------|-------|
| 2026-05-20 | T-PLUGIN-00b Kimi re-smoke | spec-blindspot-hunt | kimi-thinking | ~100/~20 | ~$0.001 | sub (membership) | Post-restore; HOPPER_KIMI_OK |
| 2026-05-20 | T-PLUGIN-00b Copilot smoke | spec-blindspot-hunt | claude-sonnet-4-5 (via Copilot) | ~18,900/~30 | ~$0.06 (estimated; 0.33 premium request) | sub (Copilot Business) | HOPPER_COPILOT_OK |
| 2026-05-20 | T-PLUGIN-00b Gemini smoke | spec-blindspot-hunt | gemini-pro-default | ~50/~10 | ~$0.001 | sub (Google) | HOPPER_GEMINI_OK |

**Phase 0 final subtotal**: ~$0.08 API + sub-quota consumption. 5/5 vendors smoke-verified.

### Phase 1 plumbing (2026-05-20)

| Date | Task | Task-type | Model | Tokens In/Out | Approx $ | Tier | Notes |
|------|------|-----------|-------|---------------|----------|------|-------|
| 2026-05-20 | T-PLUGIN-04.5 | spec-write | claude-opus-4-7 (Strategy-as-developer) | n/a | $0 marginal | sub | VendorAdapter contract + runSubprocessOnce; 11 unit tests pass |
| 2026-05-20 | T-PLUGIN-02 | code-impl | claude-opus-4-7 | n/a | $0 marginal | sub | queue.md v2 parser; 12 unit tests pass |
| 2026-05-20 | T-PLUGIN-03 | code-impl | claude-opus-4-7 | n/a | $0 marginal | sub | tasks library loader + anti-persona verifier; 11 unit tests pass |
| 2026-05-20 | T-PLUGIN-04 | code-impl | claude-opus-4-7 | n/a | $0 marginal | sub | AGENTS parser + deterministic vendor router; 7 unit tests pass |
| 2026-05-20 | T-PLUGIN-01 | code-impl | claude-opus-4-7 | n/a | $0 marginal | sub | Repo init + plugin manifest expanded with test scripts + dispatch wiring |

**Phase 1 subtotal**: $0 marginal cost (Strategy-as-developer in Claude Code TUI subscription). 5 tasks done. 42 total unit tests passing.

### Phase 2 adapter implementations (2026-05-20)

| Date | Task | Task-type | Model | Tokens In/Out | Approx $ | Tier | Notes |
|------|------|-----------|-------|---------------|----------|------|-------|
| 2026-05-20 | T-PLUGIN-05a | code-impl | claude-opus-4-7 | n/a | $0 marginal | sub | Codex adapter; 9 tests pass |
| 2026-05-20 | T-PLUGIN-05b | code-impl | claude-opus-4-7 | n/a | $0 marginal | sub | Kimi adapter; HTTP 402 detection |
| 2026-05-20 | T-PLUGIN-05c | code-impl | claude-opus-4-7 | n/a | $0 marginal | sub | OpenCode adapter; ANSI strip |
| 2026-05-20 | T-PLUGIN-05d | code-impl | claude-opus-4-7 | n/a | $0 marginal | sub | Copilot adapter; quota detection |
| 2026-05-20 | T-PLUGIN-05e | code-impl | claude-opus-4-7 | n/a | $0 marginal | sub | agy adapter with silent auth-fail; 22 tests |

**Phase 2 subtotal**: $0 marginal. 5 adapters + dispatch wiring + 55 new tests = 107 total tests passing.

**Cumulative (Phase 0 + Phase 1)**: ~$0.08 API + 6 codex audit cycles ~$3.30 + 1 phase-0 audit ~$0.55 + 3 v2.0.3 audit iterations ~$1.50 = **~$5.43 total** demo development cost so far.

---

## Phase 1+ (post-spike, 2026-05-20 to 2026-05-25)

| Date | Task | Role | Model | Tokens In/Out | Approx $ | Tier | Notes |
|------|------|------|-------|---------------|----------|------|-------|

---

## Strategy cross-audit cost (out-of-band)

| Date | Trigger | Model | Tokens | Approx $ | Notes |
|------|---------|-------|--------|----------|-------|
| 2026-05-20 | Spec v1.0 review (new proposal) | codex GPT-5 xhigh | ~58000 | ~$0.55 | VERDICT REWORK; 5 findings (F1-F5); fixes committed `5971921` + `b2ac26b` |
| 2026-05-20 | Spec v1.1 verification | codex GPT-5 xhigh | ~estimate | ~$0.10 | VERDICT PASS_WITH_CHANGES; F2-F5 FIXED, F1 PARTIAL → fixed in v1.1.1 |

---

## Summary

Pending T-PLUGIN-10 completion. Phase 0 + Phase 1-5 budget ceiling: ≤ $6 task work + audit cost. Current audit spend: ~$0.65.

## Phase 3 + Phase 4 — Strategy-as-developer (2026-05-20)

| Date | Task | Task-type | Model | Tokens In/Out | Approx $ | Tier | Notes |
|------|------|-----------|-------|---------------|----------|------|-------|
| 2026-05-20 | T-PLUGIN-06 | code-impl | claude-opus-4-7 (Strategy) | n/a (interactive) | $0 marginal | sub | Output.md writer; mini-audit FIX_AND_RECHECK → PROCEED_TO_T07 |
| 2026-05-20 | T-PLUGIN-06 codex audit | code-review-adversarial | codex GPT-5.5 xhigh | ~25,000/~3,000 | ~$0.06 | sub | mini-audit + recheck; 4 P1 findings fixed |
| 2026-05-20 | T-PLUGIN-07 | code-impl | claude-opus-4-7 (Strategy) | n/a | $0 marginal | sub | Tier B Claude Code slash wiring |
| 2026-05-20 | T-PLUGIN-07 codex audit | code-review-adversarial | codex GPT-5.5 xhigh | ~30,000/~3,500 | ~$0.08 | sub | Phase 3 final audit + recheck; 6 findings (1 P0 + 3 P1 + 2 P2) all fixed |
| 2026-05-20 | T-PLUGIN-08a | code-impl | claude-opus-4-7 (Strategy) | n/a | $0 marginal | sub | Tier C #1 Codex CLI wrapper |
| 2026-05-20 | T-PLUGIN-08a codex audit | code-review-adversarial | codex GPT-5.5 xhigh | ~20,000/~2,500 | ~$0.05 | sub | mini-audit + recheck; 3 P1 fixes |
| 2026-05-20 | T-PLUGIN-08b | code-impl | claude-opus-4-7 (Strategy) | n/a | $0 marginal | sub | Tier C #2 OpenCode wrapper |
| 2026-05-20 | Phase 4 partial codex audit | code-review-adversarial | codex GPT-5.5 xhigh | ~22,000/~3,000 | ~$0.06 | sub | Phase 4 partial audit; 4 P1 + 2 P2; key P1 (centralize validation) fixed in same cycle |

**Phase 3 + Phase 4 partial subtotal**: ~$0.25 API (codex audit costs) + 0 marginal sub cost (Strategy work).

**Cumulative**: Phase 0 (~$0.08) + Phase 1 (codex audit ~$0.05) + Phase 2 (codex audit ~$0.08) + Phase 3 (~$0.14) + Phase 4 partial (~$0.11) ≈ ~$0.46 API + sub.

### T-09 + T-10 (2026-05-20 evening)

| Date | Task | Task-type | Model | Tokens In/Out | Approx $ | Tier | Notes |
|------|------|-----------|-------|---------------|----------|------|-------|
| 2026-05-20 | T-PLUGIN-09 | spec-write | claude-opus-4-7 (Strategy) | n/a | $0 marginal | sub | PASS materials (no-screencast variant per user) |
| 2026-05-20 | T-PLUGIN-10 Critic | code-review-acceptance | codex GPT-5.5 xhigh | ~28,000/~3,500 | ~$0.07 | sub | End-to-end Critic acceptance; PASS_WITH_NOTES; GO for essay |

**T-09 + T-10 subtotal**: ~$0.07 API + 0 marginal subscription.

**Cumulative (entire demo)**: Phase 0 (~$0.08) + Phase 1 codex audit (~$0.05) + Phase 2 audit (~$0.08) + Phase 3 (~$0.14) + Phase 4 partial (~$0.11) + T-09/10 (~$0.07) ≈ **~$0.53 API + sub-tier consumption**.
