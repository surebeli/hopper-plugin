# T-PLUGIN-04.5 — Strategy-as-developer Output (Vendor Adapter Contract + Subprocess Wrapper)

## Summary
Defined the `VendorAdapter` JSDoc contract + implemented shared `runSubprocessOnce` wrapper per codex F1/F2/F3/F5 audit findings. Contract enforces SINGLE-ATTEMPT dispatch: one vendor selected, one subprocess spawn, one timeout, success or specific failure classification. NO retry, NO fallback, NO state across dispatches.

## Files touched
- `cli/src/types.js` (new, ~80 lines): JSDoc type definitions for TaskRow / AgentBinding / VendorAdapter / AdapterOpts / PreflightResult / SubprocessResult / TaskOutput
- `cli/src/subprocess.js` (new, ~110 lines): `runSubprocessOnce` shared wrapper with Windows `taskkill /T /F` + Unix detached process-group SIGKILL; `makeUniqueLogPath` for per-dispatch unique log files (codex F2 stale-log prevention)
- `tests/unit/subprocess.test.js` (new, ~150 lines): 11 unit tests covering stdout/stderr capture, exit propagation, stdin pipe, timeout-and-kill, durationMs, missing-command (127), log-file read, single-attempt verification, unique log paths

## Acceptance verification (5/5)
1. ✓ `VendorAdapter` interface defined in `cli/src/types.js` — verifier: file exists + grep `VendorAdapter` returns the typedef
2. ✓ `runSubprocessOnce(adapter, input, opts) → Promise<SubprocessResult>` implemented with proper kill propagation — verifier: timeout test kills hung process (`runSubprocessOnce times out and kills the process` test PASSES)
3. ✓ Single-spawn behavior verified via test — verifier: `runSubprocessOnce does NOT retry on failure` test PASSES + source code grep shows zero retry/backoff/fallback patterns
4. ✓ Contract documented in this output + source JSDoc comments cross-reference spec §3 #4 and codex F1-F5 findings
5. ✓ All 11 subprocess tests pass — verifier: `node --test tests/unit/subprocess.test.js` exits 0

## Decisions / deviations from spec
- **JSDoc instead of TypeScript build**: spec said T-PLUGIN-01 would introduce TypeScript build pipeline. Decided JSDoc-only types are sufficient + keep the plugin dependency-free (no tsx, no tsc). Aligned with "thin plugin" philosophy. Re-evaluate at T-PLUGIN-09 README phase.
- **Adapter interface includes `prepareLog`**: optional method for adapters that need vendor-specific log file handling (e.g. agy `--log-file` per codex F2 silent auth-fail detection). Per-vendor, not in core spec.
- **Subprocess wrapper writes NOTHING to file system**: it reads log file IF adapter requested one, but does not write. Adapter or caller writes output.md.

## Open questions for Leader
- none

## Commit
(pending — batched with all Phase 1 tasks)

## Verdict
PASS — Contract + shared wrapper ready for T-PLUGIN-05a-e adapter implementations (Phase 2).

## Checks
- `node --test tests/unit/subprocess.test.js` → 11/11 pass ✓
- `grep -rE 'retry|backoff|fallback|circuit.break|consensus|round.?robin' cli/src/subprocess.js` → no orchestration patterns ✓
- `grep -E 'process.kill\(|taskkill' cli/src/subprocess.js` → tree-kill implemented for both platforms ✓
- JSDoc validates structurally (manual review; tsserver in user's IDE will surface any issues)

## Next recommendation
Within MANIFEST Phase 1 cursor: T-PLUGIN-02 / T-PLUGIN-03 / T-PLUGIN-04 (parallel-eligible). T-PLUGIN-01 lightweight expansion. After all Phase 1 tasks done → codex Phase 1 audit per goal-condition #2.

NOT recommended: starting T-PLUGIN-05a-e adapter implementations in Phase 1 (Phase 2 territory).
