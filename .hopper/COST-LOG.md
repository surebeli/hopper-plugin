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
