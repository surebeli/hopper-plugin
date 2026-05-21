---
task_id: T-AUDIT-PH6C-kimi-v2
adapter: kimi
status: done
pid: null
start_time: "2026-05-21T11:00:39.151Z"
end_time: "2026-05-21T11:12:44.578Z"
exit_code: 0
duration_ms: 725361
mode: background
host_native: null
session_id: null
log: ./T-AUDIT-PH6C-kimi-v2-output.log
started_by_pid: 52036
adapter_status: success
signal: null
timed_out: null
---

# T-AUDIT-PH6C-kimi-v2 — Adversarial Code Review (kimi default model + --thinking)

## Summary

Reviewed Phase 6c implementation (commits `ed16903` → `fe9a79f` → `fb769e9`) comprising task-type-aware timeout floors (`applyTaskTypeFloor`), deterministic known-install-path resolution (`resolveCommandWithKnownPaths`), kimi `--thinking` / `--no-thinking` forwarding, copilot `--allow-all-tools` / `--allow-all-paths` hardening, and the Phase 6c follow-up qualified-path hijack fix. The core mechanisms are sound and directly address the Phase 6b meta-finding (all 5 vendors timing out on review tasks). Severity profile: 2 P1 (test gap + mutable global), 5 P2 (documentation, validation, consistency, edge cases). No P0 or security findings. Verdict: **PASS_WITH_CHANGES** — the P1s should be remediated before this code path is considered fully hardened against regression.

## Files reviewed

| File | LOC reviewed | Notes |
|------|-------------|-------|
| `cli/src/subprocess.js` | 177 | `applyTaskTypeFloor`, `REVIEW_TASK_TYPES`, `REVIEW_TASK_FLOOR_MS` |
| `cli/src/path-resolve.js` | 174 | `resolveCommandWithKnownPaths` + follow-up P1 fix |
| `cli/src/dispatch.js` | 186 | `executeWithAdapter` taskType threading, spawn command resolution |
| `cli/bin/hopper-runner` | 249 | Background-mode `timeoutMs` call, `HOPPER_ADAPTER_OPTS` deserialization |
| `cli/bin/hopper-dispatch` | ~80 relevant lines | `runBackgroundDispatch`, `warnIfModelUnknown` kimi hint |
| `cli/src/vendors/kimi.js` | 118 | `--thinking` / `--no-thinking` wiring, `timeoutMs` floor |
| `cli/src/vendors/codex.js` | 111 | `timeoutMs` floor wiring |
| `cli/src/vendors/copilot.js` | ~80 | `--allow-all-tools` / `--allow-all-paths`, `timeoutMs` floor |
| `cli/src/vendors/opencode.js` | ~90 | `timeoutMs` floor wiring |
| `cli/src/vendors/agy.js` | 199 | `knownInstallPaths`, `timeoutMs` floor wiring |
| `cli/src/vendors/index.js` | ~80 | `installCheckForAdapter` with `resolveCommandWithKnownPaths` |
| `cli/src/vendor-probe/*.js` | ~80 total | Probe path consistency |
| `cli/src/types.js` | 100 | `AdapterOpts` + `VendorAdapter` JSDoc updates |
| `tests/unit/phase6c.test.js` | 196 | Unit tests for floors, path resolution, kimi thinking, copilot allow flags |
| `docs/audit/phase-6b-dogfood-5vendor.md` | 119 | Meta-audit context |
| `docs/audit/phase-6c-dogfood-5vendor.md` | 155 | Follow-up dogfood context |

Total: ~2,150 LOC across 16 files.

---

## Findings (severity-ordered)

### [F1] P1: No integration test verifies background-mode taskType floor end-to-end

`phase6c.test.js` unit-tests `applyTaskTypeFloor` in isolation and each adapter's `timeoutMs({taskType: 'code-review-adversarial'})` individually. However, there is **no test** that validates the serialization chain: `hopper-dispatch` → `effectiveOpts.taskType` → `spawnDetached` → `HOPPER_ADAPTER_OPTS` JSON → `hopper-runner` → `JSON.parse` → `adapter.timeoutMs({...adapterOpts, background: true})`. This is the primary code path for review-task dispatches.

**Root cause.** The floor is applied in two places: `executeWithAdapter` (foreground) and `hopper-runner` (background). The foreground path is exercised by `executeDispatch` integration tests, but the background path relies on env-var serialization that could be accidentally dropped during a future refactor of `spawnDetached` or `runBackgroundDispatch`.

**Recommended fix.** Add an integration test in `tests/integration/background-e2e.test.js` (or a new `phase6c-background.test.js`) that: (a) stubs `spawn` to capture the env var, (b) asserts `HOPPER_ADAPTER_OPTS` contains the expected `taskType`, and (c) asserts the deserialized `timeoutMs` value equals `REVIEW_TASK_FLOOR_MS` for a review task-type.

---

### [F2] P1: `REVIEW_TASK_TYPES` is a mutable global Set

`cli/src/subprocess.js` exports `REVIEW_TASK_TYPES` as a plain `Set` object:
```js
const REVIEW_TASK_TYPES = new Set([ 'code-review-adversarial', 'code-review-acceptance' ]);
export { REVIEW_TASK_TYPES, REVIEW_TASK_FLOOR_MS };
```
Any importer can mutate it with `.add()` or `.delete()`, affecting all subsequent `applyTaskTypeFloor` calls in the same process. Node's test runner runs tests in-process, so a future test that accidentally mutates this set would pollute global state.

**Root cause.** Exporting a mutable reference from a shared module violates least-privilege. The current tests don't mutate it, but there's no guard preventing it.

**Recommended fix.** `Object.freeze(new Set([...]))` before export, or expose a getter function instead of the raw Set.

---

### [F3] P2: `applyTaskTypeFloor` JSDoc misrepresents extensibility

The JSDoc claims: "Lets a vendor like codex with reasoning=xhigh still extend beyond the floor if it wants more time." This is mathematically false under the current `Math.max(native, floor)` implementation. Codex xhigh native is 900,000 ms (< 1,800,000 ms floor), so review tasks are clamped **to** the floor, not allowed to extend beyond it. Only vendors whose native timeout already exceeds 30 min could "extend beyond" — none of the current 5 do.

**Root cause.** The comment was written as if the mechanism were `native + floor` or `native || floor`, but it is `Math.max`. This misleads future maintainers into believing the system is more flexible than it is.

**Recommended fix.** Rewrite the JSDoc to accurately describe the behavior: "For review task-types: returns the larger of native timeout and 30-minute floor. Vendors with native timeouts below the floor are raised to exactly the floor; vendors already above it keep their native value."

---

### [F4] P2: `resolveCommandWithKnownPaths` silently accepts relative paths and tilde literals

The JSDoc states `knownInstallPaths` entries "must be absolute" and "Tildes are not expanded — caller should expand via `os.homedir()`", but there is **no runtime validation**. A relative path resolves against `process.cwd()`, causing different behavior depending on where `hopper-dispatch` is invoked. A tilde literal (e.g., `~/AppData/Local/agy/bin/agy.exe`) is treated as a relative segment starting with `~` and silently fails.

**Root cause.** Config-like arrays are prone to hand-editing (either by developers or by users extending vendor adapters). Silent failure at path-resolution time produces confusing `spawn ENOENT` errors that look like missing installations.

**Recommended fix.** Add a one-time validation loop in `resolveCommandWithKnownPaths` (or at adapter registration time) that throws if any entry is not absolute or contains an unexpanded tilde. E.g.:
```js
for (const p of knownInstallPaths) {
  if (!path.isAbsolute(p)) throw new Error(`knownInstallPaths entry must be absolute: ${p}`);
  if (p.startsWith('~/')) throw new Error(`knownInstallPaths entry must expand tilde: ${p}`);
}
```

---

### [F5] P2: Non-agy vendor probes use `resolveCommandOnPath` inconsistently with dispatch

`cli/src/vendor-probe/agy.js` was updated to use `resolveCommandWithKnownPaths`, but `codex.js`, `kimi.js`, `opencode.js`, and `copilot.js` probes still use `resolveCommandOnPath`. If any non-agy adapter adds `knownInstallPaths` in the future, its `--probe` will report "not installed" even though `--dispatch` would succeed via the fallback path.

**Root cause.** The Phase 6c fix was scoped narrowly to agy (the motivating case), but the probe/dispatch parity invariant was not generalized. This creates a latent maintenance hazard.

**Recommended fix.** Route all vendor probes through `resolveCommandWithKnownPaths` with the adapter's `knownInstallPaths || []`. This is a 1-line change per probe file and makes the system future-proof.

---

### [F6] P2: `warnIfModelUnknown` kimi hint gated on `introspection_supported === 'config-only'`

The actionable TOML-config hint for kimi only fires when the cache entry contains `introspection_supported: 'config-only'`. If the cache was written by an older probe version without this field, or if the cache file was hand-edited and the field omitted, the user sees the generic soft-warn instead of the specific fix.

**Root cause.** The hint is overly precise in its gating condition. The motivating scenario (kimi alias missing from config) applies regardless of whether the cache explicitly records `config-only` introspection.

**Recommended fix.** Broaden the condition: fire the hint for `vendor === 'kimi'` whenever the model is not in the cached list, regardless of `introspection_supported`. The worst case is showing a slightly more verbose hint to a user who already knows their config — harmless. Alternatively, default to `'config-only'` when the field is absent for kimi.

---

### [F7] P2: `kimiAdapter.args()` exact-case check for `reasoning: 'none'`

The check `opts.reasoning === 'none'` is exact lowercase. A user passing `--reasoning None` (capital N) would hit the `else if (opts.reasoning)` branch and emit `--thinking` instead of `--no-thinking`, producing the **opposite** of intended behavior.

**Root cause.** CLI flag values are user input and should be normalized before comparison. Shells and completion scripts may case-normalize or users may typo.

**Recommended fix.** Normalize before comparison: `if ((opts.reasoning || '').toLowerCase() === 'none')`. Apply the same normalization to the truthy branch if desired, though any truthy non-'none' value currently maps to `--thinking` which is acceptable.

---

## Verdict

**PASS_WITH_CHANGES**

The Phase 6c implementation correctly addresses the dominant Phase 6b meta-finding (task-type-blind timeouts). The floor applies in both foreground and background dispatch paths. The known-install-path resolver closes the agy-on-Windows gap without violating the no-orchestration invariant. The kimi `--thinking` / `--no-thinking` wiring and copilot `--allow-all-tools` hardening are both correctly implemented per live dogfood evidence.

The 2 P1 findings (F1 missing integration test, F2 mutable global Set) are regression risks that should be closed. The 5 P2 findings are polish/maintenance gaps. No architectural rework is required.

## Commit

`fb769e9`

## Checks

- Review touched only the findings doc? **YES** (`git diff --name-only` expected: `.hopper/handoffs/T-AUDIT-PH6C-kimi-v2-output.md` + `.hopper/queue.md` status flip for T-AUDIT-PH6C-kimi-v2 → `done`).
- No product code modified. **CONFIRMED**.

## Next recommendation

If the P1 findings (F1, F2) are accepted for fix, recommend dispatching a follow-up `code-impl` task (e.g., `T-AUDIT-PH6C-kimi-v2-rework` or piggyback on a future Phase 6d batch) to add the background-mode integration test and freeze the `REVIEW_TASK_TYPES` set. The P2 findings can be addressed opportunistically in the same batch or deferred.

## Status (background completion)
- queue_status: done
- adapter_status: success
- exit_code: 0
- duration_ms: 725361
- end_time: 2026-05-21T11:12:44.579Z
- log: see `T-AUDIT-PH6C-kimi-v2-output.log` for raw output
