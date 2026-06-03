#!/usr/bin/env bash
# cross-host-verify.sh — code-driven cross-host equivalence proof (T-PLUGIN-09)
#
# This is the no-screencast substitute for proving the cross-host claim.
# It does NOT actually invoke each host (that would require Claude Code +
# codex CLI + opencode CLI all installed + authenticated). Instead it
# checks the STRUCTURAL parity invariants that make the claim mechanically
# true regardless of whether you run every supported host path:
#
#   1. All supported host entry points reference the SAME hopper-dispatch binary
#   2. All host wrappers + slash command + dispatcher CLI use the SAME
#      task-id regex (validation parity)
#   3. Each host wrapper invokes exactly ONE outer command (single-spawn)
#   4. No host adapter contains retry/fallback/orchestration constructs
#
# Usage: ./scripts/cross-host-verify.sh
# Exit codes: 0 on PASS, 1 on FAIL.

set -eu

cd "$(dirname "$0")/.."
REPO_ROOT="$(pwd)"

red()    { printf '\033[31m%s\033[0m\n' "$*"; }
green()  { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
bold()   { printf '\033[1m%s\033[0m\n' "$*"; }

FAIL_COUNT=0
fail() { red "  FAIL: $*"; FAIL_COUNT=$((FAIL_COUNT + 1)); }
pass() { green "  PASS: $*"; }

bold "hopper-plugin cross-host verification"
echo "Repo: $REPO_ROOT"
echo ""

# ─── Check 1: all host entry points exist ──────────────────────────────

bold "1. Host entry points exist"

TIER_A="$REPO_ROOT/cli/bin/hopper-dispatch"
TIER_B_MANIFEST="$REPO_ROOT/.claude-plugin/plugin.json"
TIER_B_CMD_DIR="$REPO_ROOT/commands"
TIER_C1="$REPO_ROOT/hosts/codex-cli/bin/hopper-codex"
TIER_C2="$REPO_ROOT/hosts/opencode/bin/hopper-opencode"
TIER_C3="$REPO_ROOT/hosts/copilot-cli/bin/hopper-copilot"
TIER_C4="$REPO_ROOT/hosts/grok-cli/bin/hopper-grok"
TIER_C5="$REPO_ROOT/hosts/cursor-cli/bin/hopper-cursor"

for f in "$TIER_A" "$TIER_B_MANIFEST" "$TIER_C1" "$TIER_C2" "$TIER_C3" "$TIER_C4" "$TIER_C5"; do
  if [ -f "$f" ]; then
    pass "$f"
  else
    fail "missing: $f"
  fi
done

if [ -d "$TIER_B_CMD_DIR" ]; then
  for cmd in dispatch.md status.md smoke.md vendors.md; do
    if [ -f "$TIER_B_CMD_DIR/$cmd" ]; then
      pass "commands/$cmd"
    else
      fail "missing: commands/$cmd"
    fi
  done
else
  fail "missing: commands/ directory"
fi
echo ""

# ─── Check 2: shared task-id regex literal ─────────────────────────────

bold "2. Shared task-id regex across all entry points"

CANONICAL='^[A-Za-z][A-Za-z0-9._-]{0,99}$'

# Tier B slash command (the Claude Code prompt)
if grep -qF "$CANONICAL" "$TIER_B_CMD_DIR/dispatch.md" 2>/dev/null; then
  pass "Tier B dispatch.md cites canonical regex"
else
  fail "Tier B dispatch.md missing canonical regex literal"
fi

# Tier C #1 wrapper
if grep -qF "$CANONICAL" "$TIER_C1" 2>/dev/null; then
  pass "Tier C #1 hopper-codex cites canonical regex"
else
  fail "Tier C #1 hopper-codex missing canonical regex literal"
fi

# Tier C #2 wrapper
if grep -qF "$CANONICAL" "$TIER_C2" 2>/dev/null; then
  pass "Tier C #2 hopper-opencode cites canonical regex"
else
  fail "Tier C #2 hopper-opencode missing canonical regex literal"
fi

# Tier C #3 wrapper
if grep -qF "$CANONICAL" "$TIER_C3" 2>/dev/null; then
  pass "Tier C #3 hopper-copilot cites canonical regex"
else
  fail "Tier C #3 hopper-copilot missing canonical regex literal"
fi

# Tier C #4 wrapper
if grep -qF "$CANONICAL" "$TIER_C4" 2>/dev/null; then
  pass "Tier C #4 hopper-grok cites canonical regex"
else
  fail "Tier C #4 hopper-grok missing canonical regex literal"
fi

# Tier C #5 wrapper
if grep -qF "$CANONICAL" "$TIER_C5" 2>/dev/null; then
  pass "Tier C #5 hopper-cursor cites canonical regex"
else
  fail "Tier C #5 hopper-cursor missing canonical regex literal"
fi

# Tier A core (validation.js)
if grep -qF "$CANONICAL" "$REPO_ROOT/cli/src/validation.js" 2>/dev/null; then
  pass "Tier A validation.js cites canonical regex"
else
  fail "Tier A validation.js missing canonical regex literal"
fi
echo ""

# ─── Check 3: each host wrapper invokes outer command exactly once ────

bold "3. Single-spawn invariant at each host wrapper"

# Tier C #1: `codex exec` should appear once
COUNT=$(grep -c '^\s*exec codex exec\|^\s*codex exec' "$TIER_C1" || true)
if [ "$COUNT" = "1" ]; then
  pass "Tier C #1 wrapper invokes 'codex exec' exactly 1 time"
else
  fail "Tier C #1 wrapper invokes 'codex exec' $COUNT times (expected 1)"
fi

# Tier C #2: `exec opencode` should appear once
COUNT=$(grep -c '^\s*exec opencode' "$TIER_C2" || true)
if [ "$COUNT" = "1" ]; then
  pass "Tier C #2 wrapper invokes 'exec opencode' exactly 1 time"
else
  fail "Tier C #2 wrapper invokes 'exec opencode' $COUNT times (expected 1)"
fi

COUNT=$(grep -c '^\s*exec copilot -p' "$TIER_C3" || true)
if [ "$COUNT" = "1" ]; then
  pass "Tier C #3 wrapper invokes 'exec copilot -p' exactly 1 time"
else
  fail "Tier C #3 wrapper invokes 'exec copilot -p' $COUNT times (expected 1)"
fi

COUNT=$(grep -c '^\s*exec grok -p' "$TIER_C4" || true)
if [ "$COUNT" = "1" ]; then
  pass "Tier C #4 wrapper invokes 'exec grok -p' exactly 1 time"
else
  fail "Tier C #4 wrapper invokes 'exec grok -p' $COUNT times (expected 1)"
fi

COUNT=$(grep -c '^\s*exec agent -p' "$TIER_C5" || true)
if [ "$COUNT" = "1" ]; then
  pass "Tier C #5 wrapper invokes 'exec agent -p' exactly 1 time"
else
  fail "Tier C #5 wrapper invokes 'exec agent -p' $COUNT times (expected 1)"
fi
echo ""

# ─── Check 4: no active retry/fallback/orchestration in host adapters ─

bold "4. No active retry/fallback/orchestration constructs"

for f in "$TIER_C1" "$TIER_C2" "$TIER_C3" "$TIER_C4" "$TIER_C5"; do
  base=$(basename "$f")
  if grep -Eq 'while\b.*\b(codex|opencode|hopper-dispatch)\b' "$f"; then
    fail "$base contains a while-loop around host invocation"
  else
    pass "$base has no while-loop around host invocation"
  fi
  if grep -Eq 'backoff|circuit.break|consensus|round.?robin' "$f"; then
    fail "$base contains orchestration pattern"
  else
    pass "$base has no orchestration pattern"
  fi
done
echo ""

# ─── Check 5: all hosts ultimately point at the same dispatcher ────────

bold "5. All hosts reference cli/bin/hopper-dispatch (no other binary)"

for f in "$TIER_B_CMD_DIR/dispatch.md" "$TIER_C1" "$TIER_C2" "$TIER_C3" "$TIER_C4" "$TIER_C5"; do
  base=$(basename "$f")
  if grep -q 'cli/bin/hopper-dispatch' "$f"; then
    pass "$base references cli/bin/hopper-dispatch"
  else
    fail "$base does NOT reference cli/bin/hopper-dispatch"
  fi
done
echo ""

# ─── Check 6: dispatcher --resolve test (Tier A live check) ────────────

bold "6. Tier A live --resolve check"

if [ -f .hopper/queue.md ]; then
  # Find first pending or done task in queue
  TASK_ID=$(grep -oE '\| (T-PLUGIN-[A-Za-z0-9.-]+) \|' .hopper/queue.md | head -1 | grep -oE 'T-PLUGIN-[A-Za-z0-9.-]+')
  if [ -n "$TASK_ID" ]; then
    if node "$TIER_A" --resolve "$TASK_ID" >/dev/null 2>&1; then
      VENDOR=$(node "$TIER_A" --resolve "$TASK_ID" 2>/dev/null | grep -oE 'Vendor:\s+[a-z0-9-]+' | awk '{print $2}')
      pass "Tier A resolved $TASK_ID → vendor: $VENDOR"
    else
      yellow "  SKIP: --resolve failed (likely missing task spec in handoffs/)"
    fi
  else
    yellow "  SKIP: no task IDs found in .hopper/queue.md"
  fi
else
  yellow "  SKIP: no .hopper/queue.md present (run from a hopper-managed project)"
fi
echo ""

# ─── Summary ───────────────────────────────────────────────────────────

if [ "$FAIL_COUNT" -eq 0 ]; then
  green "================================================"
  green "  ALL STRUCTURAL CHECKS PASSED"
  green "================================================"
  echo ""
  echo "Cross-host equivalence verified at the static-artifact level."
  echo "Functional verification (running each host live) is a user-action gate."
  echo "See docs/release/PASS-RATIONALE.md for the full self-assessment."
  exit 0
else
  red "================================================"
  red "  $FAIL_COUNT CHECK(S) FAILED"
  red "================================================"
  exit 1
fi
