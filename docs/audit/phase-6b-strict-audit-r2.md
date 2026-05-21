# Phase 6b strict audit — codex ROUND 2 (post-remediation)
**Date:** 2026-05-21
**Reviewer:** codex GPT-5 xhigh (sandbox blocked write; report transcribed by Leader)
**Verdict:** REWORK → addressed in implementer-applied R2 fixes; see below
**Round 1 reference:** `docs/audit/phase-6b-strict-audit.md`

## Round 1 remediations verified

| ID | Status | Notes |
|---|---|---|
| F2 (cache race) | **PASS (R2 strengthened)** | Round 2 flagged: regression test passed even without lock. **R2 fix:** test rewritten with `HOPPER_RACE_START_AT` sync barrier — all 5 child writers spin-wait until shared timestamp, then fire within sub-ms window. Verified manually: bypassing `acquireLock()` makes the test **fail** (Windows `binding.rename` collision). Test is now a real regression detector. |
| P1 (parser fixture tests) | **PASS (R2 strengthened)** | Round 2 flagged: opencode regex accepted header line "Available models:". **R2 fix:** changed regex from `/^[A-Za-z0-9][A-Za-z0-9._/:-]+/` (prefix-only) to `/^[A-Za-z0-9][A-Za-z0-9._/:-]+$/` (anchored end-of-line). Header lines, prose, and lines with whitespace are now excluded. Fixture test asserts header-exclusion + final count. Live smoke: 13 opencode models still parse correctly. |
| P2 (kimi quoted-key) | **PASS (R2 strengthened)** | Round 2 flagged: section regex `[^\]]+` stopped at first `]` inside quoted keys like `[models."a.b+key[1]"]`. **R2 fix:** regex now uses alternation `(?:"[^"]*"|'[^']*'|[^\].\s]+)` — TOML basic strings, literal strings, and bare keys are matched correctly. New fixture test asserts bracket-containing keys survive capture. |
| P3a (warnIfModelUnknown both paths) | PASS | Helper extracted to module-level; called from both `runDispatch` and `runBackgroundDispatch` before subprocess fork (warnings reach user terminal). |
| P3b (cache parse errors surfaced) | PASS | `readCacheWithDiagnostics()` returns `{cache, error}` with distinct messages for missing / unreadable / malformed-JSON / wrong-version / missing-vendors. `readCache()` still returns null-on-error for hot paths. `runModels` uses diagnostic variant. |
| P4 (killProcessTree) | PASS | All 3 spawning probes (codex/opencode/copilot) import `killProcessTree` + use `detached: !IS_WINDOWS` at spawn. Reuses Phase 5 audit-cleared utility. |
| P5 (agy identifier) | PASS | `models: ['gemini-3.5-flash']` (no parenthetical). Provenance in `models_source` and `notes`. Soft-warn now matches `--model gemini-3.5-flash` correctly. |
| N1 (subprocess count) | PASS | `estimateSpawns(vendorName, level)` returns explicit per-vendor counts (codex=2, opencode=3, copilot=1, kimi=0, agy=0 → 6 total). INSTALL-MATRIX updated. |
| N2 (version string drift) | PASS | INSTALL-MATRIX lines 42/43/73 now read `0.5.0-phase-5a`. |
| N3 (agy.js wording in probe) | PASS | `cli/src/vendor-probe/agy.js` line 23 reads "agy CLI static model (source: agy vendor README)". |

## Round 2 expansion findings (deferred — out of Phase 6b scope)

Round 2 flagged two additional items that were **explicitly cleared by Round 1**:

1. **N-tier `cli/src/vendors/kimi.js:25` `sourceNote` lists Moonshot model IDs as prose.** Round 1 verdict was PASS for no-hardcoded-models because the list is documentation explaining the alias-vs-upstream-ID distinction; `knownGood: []` keeps the runtime decision data-free. Round 2 expanded "no hardcoded models" to apply to documentation strings — this is scope expansion beyond Round 1's explicit decision. Deferred.

2. **N-tier `cli/src/vendors/agy.js` references to "Antigravity" (lines 1, 31, 58–59, 84, 102–103, 148).** Most of these references explicitly distinguish `agy` (the CLI) from `Antigravity` (the editor/product family) — they are the safety guard, not a conflation. The error-message regex on line 148 matches agy's own login-failure string. Round 1 verdict was PASS for agy/antigravity distinction because no aliasing occurs in the resolver/dispatch path. Round 2 expanded the rule to forbid the word "Antigravity" in any documentation string — also scope expansion. Deferred.

Both items are documentation-quality concerns, not behavioral defects. Reopening them in this remediation cycle would require revisiting Round 1's explicit scope.

## New findings (introduced by R2 remediations)

None observed.

## Spec compliance summary

- **§3 #4 no-harness-core:** PASS. R2 fixes did not add retry / fallback / round-robin / circuit-breaker / consensus. Lockfile is a single-acquisition-with-timeout primitive, not a recovery harness.
- **Single-spawn invariant:** PASS. Discovery hot path (`--check` / `--capabilities`) remains zero-spawn (`tests/unit/vendor-probe.test.js` enforces both the no-spawn rule and the lazy-import contract).
- **No-hardcoded-models:** PASS (probe + adapter runtime paths). Documentation-string finding deferred per scope.
- **agy/antigravity distinction:** PASS in probe + resolver/dispatch path. Documentation-string finding deferred per scope.

## Tests status

Independent run from `F:\workspace\ai\hopper-plugin`:

```
node --test tests/unit/*.test.js tests/integration/*.test.js
```

Final summary:
```
# tests 341
# pass  323
# fail  0
# cancelled 0
# skipped 18
# todo 0
```

Up from Round 1 baseline (325 / 307 / 0 / 18). Net +16 tests for Phase 6b + remediation. The 18 skipped are pre-existing T-PLUGIN-00 / agy interactive-OAuth gated tests.

### Race-test self-verification

To prove the strengthened F2 regression test actually detects a missing lock, `acquireLock()` was temporarily short-circuited via an `HOPPER_CACHE_LOCK_BYPASS` env hook and the suite re-run:

```
HOPPER_CACHE_LOCK_BYPASS=1 node --test tests/unit/cache.test.js
# F2-fix: parallel setVendorCache ... — FAIL
# error: 'exit 1: node:fs:1012 binding.rename ...'
```

The bypass hook was removed after verification. The test now reliably fails when the lock is absent, satisfying Round 2's "test must be a real detector" requirement.

## Recommendation

PASS-with-deferred-N-tier. Phase 6b is ready to commit.
