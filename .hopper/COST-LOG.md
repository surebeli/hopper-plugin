# Cost Log — hopper-plugin

Anchor: `.hopper/COST-LOG.md::root`

Tier key: `sub` = subscription quota (ChatGPT Plus for Codex CLI, Claude Pro for Claude Code TUI, etc.), `API` = per-token billing, `mixed` = subscription with API overflow, `n/a` = unknown / not measured

---

## Phase 0 — Host-lifecycle spike (2026-05-20)

| Date | Task | Role | Model | Tokens In/Out | Approx $ | Tier | Notes |
|------|------|------|-------|---------------|----------|------|-------|

(No tasks completed yet. First entry will land after T-PLUGIN-00 completes.)

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
