---
task_id: T-AUDIT-PH6C-opencode
adapter: opencode
status: done
pid: null
start_time: "2026-05-21T10:00:00.000Z"
end_time: "2026-05-21T10:19:13.069Z"
exit_code: 0
duration_ms: 322717
mode: background
host_native: null
session_id: null
log: ./T-AUDIT-PH6C-opencode-output.log
started_by_pid: 0
signal: null
timed_out: null
adapter_status: success
---

# T-AUDIT-PH6C-opencode — opencode (adversarial review of commit fe9a79f)

## Summary

Reviewed commit `fe9a79f` (Phase 6c: task-type-aware timeouts + knownInstallPaths + kimi --thinking) against the base. 21 source files examined (19 changed, 2 new). Severity profile: 1 P1 (type incompleteness — new contract property untyped), 4 P2 (test fragility, exposed coverage gap in extension-less Windows path, unconditional capabilities hint, untested env round-trip), 2 P3 (code duplication, stale JSDoc signature). The implementation is structurally sound and correctly addresses the Phase 6b dogfood findings — the core mechanism (applyTaskTypeFloor + knownInstallPaths) is well-factored and cross-referenced correctly. Findings are at the edges.

## Files reviewed

| File | LOC | Change |
|------|-----|--------|
| cli/src/subprocess.js | 177 | +29 (applyTaskTypeFloor, REVIEW_TASK_TYPES, exports) |
| cli/src/path-resolve.js | 165 | +55 (resolveCommandWithKnownPaths) |
| cli/src/dispatch.js | 186 | +13 (resolveCommandWithKnownPaths integration, taskType pass-through) |
| cli/bin/hopper-runner | 249 | +5 (resolveCommandWithKnownPaths in runner path) |
| cli/bin/hopper-dispatch | 911 | +22 (soft-warn kimi hint, taskType in background opts) |
| cli/src/vendors/codex.js | 111 | +3 (applyTaskTypeFloor import + use) |
| cli/src/vendors/kimi.js | 116 | +12 (applyTaskTypeFloor import, --thinking flag) |
| cli/src/vendors/opencode.js | 101 | +3 (applyTaskTypeFloor import + use) |
| cli/src/vendors/copilot.js | 107 | +4 (applyTaskTypeFloor import + use) |
| cli/src/vendors/agy.js | 199 | +8 (applyTaskTypeFloor, knownInstallPaths) |
| cli/src/vendors/index.js | 132 | +4 (resolveCommandWithKnownPaths in installCheck) |
| cli/src/vendor-probe/agy.js | 37 | +2 (resolveCommandWithKnownPaths) |
| cli/src/types.js | 96 | 0 (no change — stale) |
| tests/unit/phase6c.test.js | 196 | +196 (all new) |
| docs/audit/phase-6b-dogfood-5vendor.md | 119 | +119 (new) |
| .hopper/queue.md | +5 rows | metadata |
| .hopper/handoffs/leader-tasklist.md | +70 | task specs |
| .hopper/handoffs/T-AUDIT-PH6B-*-output.md | 5 files | new |

## Findings

### [F1] P1: `knownInstallPaths` property not declared in VendorAdapter type

**Root cause.** `cli/src/types.js:84-93` defines the `VendorAdapter` typedef but omits `knownInstallPaths: string[]`. Only agy.js declares this property. The type system (JSDoc) cannot enforce its presence, so future adapter implementations may silently lack it, causing `resolveCommandWithKnownPaths` to fall back to PATH-only lookup when the installer hasn't added its bin to PATH. The property is referenced at dispatch.js:167, hopper-runner:121, vendor-probe/agy.js:18, and vendors/index.js:76.

**Recommended fix.** Add `@property {string[]} [knownInstallPaths]` to the `VendorAdapter` typedef in `cli/src/types.js`. Add a contract test in `tests/unit/vendors-contract.test.js` that asserts each adapter either has `knownInstallPaths` as non-empty array, or has a documented reason for not needing it.

---

### [F2] P2: `resolveCommandWithKnownPaths` silently fails for extension-less binary paths on Windows

**Root cause.** `cli/src/path-resolve.js:158-159` — when a `knownInstallPaths` entry on Windows has no recognized extension (.exe/.com/.cmd/.bat), the resolver returns it as `command` directly. Node's `spawn()` does NOT apply PATHEXT — it passes the string verbatim to CreateProcessW, which fails with ENOENT for extension-less files. The JSDoc says entries must include the extension, but there is no guard or warning. If a future adapter contributor writes `join(homedir(), 'bin', 'agy')` (without `.exe`) for a Windows known-install path, it silently degrades to spawn ENOENT with no diagnostic.

**Recommended fix.** In the `resolveCommandWithKnownPaths` Windows branch, after the extension checks, add a fallback that tries PATHEXT extensions against the candidate before giving up. Or at minimum, log a warning to stderr when an extension-less candidate is found but no matching exe/com/cmd/bat exists at the same path. This matches the behavior of `resolveCommandOnPath` which does apply PATHEXT.

---

### [F3] P2: Soft-warn TOML hint unconditionally prints `capabilities = ["thinking"]`

**Root cause.** `cli/bin/hopper-dispatch:349-352` — the kimi config-only hint always prints `capabilities = ["thinking"]` regardless of whether the user's target model supports thinking. A user dispatching with `--model kimi-k2.6` (non-thinking) who copies the hint verbatim would add `capabilities = ["thinking"]` to a non-thinking model block. While non-functional (kimi ignores capability flags it doesn't support), it sets a wrong expectation and the user may later be confused about why `--thinking` has no effect.

**Recommended fix.** Conditionally emit the `capabilities = ["thinking"]` line only when `opts.reasoning` is truthy and not `'none'`. If no `--reasoning` flag was passed, omit the capabilities line entirely. The `model = "kimi-k2-thinking"` example should also be replaced with a placeholder like `<upstream-model-id>`.

---

### [F4] P2: phase6c.test.js source-string-matching test for soft-warn is fragile

**Root cause.** `tests/unit/phase6c.test.js:176-196` — the "P2 (manual-check)" test reads the source file `cli/bin/hopper-dispatch` and asserts literal strings like `/vendor === 'kimi'/` and `/config-only/` appear in the text. This tests that the CODE CONTAINS certain substrings, not that BEHAVIOR is correct. A refactoring that moves the soft-warn logic to a helper module would break these assertions even if behavior is preserved. Conversely, if someone changes a variable name or adds a comment that happens to match the regex, the test passes without exercising any runtime path.

**Recommended fix.** Extract the soft-warn hint builder into a small exported function in a testable module (e.g., `cli/src/soft-warn.js`), and test it with actual argument objects. The string-matching test should be a last-resort supplemental check, not the primary test. At minimum, use a more specific regex that anchors to the actual function boundary.

---

### [F5] P2: No test covers the `HOPPER_ADAPTER_OPTS` env-var round-trip for `taskType`

**Root cause.** `tests/unit/phase6c.test.js` tests `applyTaskTypeFloor` directly (unit level) and each adapter's `timeoutMs(opts)` with explicit opts objects. But the production code path in background dispatch serializes `adapterOpts` through `JSON.stringify` → `HOPPER_ADAPTER_OPTS` env var → `JSON.parse` → `adapter.timeoutMs()`. This round-trip is untested. If a future change adds a non-serializable value to `adapterOpts` (unlikely but not guarded), or if the env-var name diverges between writer and reader, `timeoutMs` silently reverts to native timeout without any test noticing.

**Recommended fix.** Add one integration-level test in `tests/integration/background-e2e.test.js` that dispatches a `code-review-adversarial` task in background mode, waits for runner exit, and asserts the `duration_ms` in the output frontmatter exceeds 30 min (proving the floor was applied). Or, if that's too heavy for CI, add a unit test that serializes a known `adapterOpts` through `JSON.stringify` + `JSON.parse` and asserts `applyTaskTypeFloor` still sees `taskType`.

---

### [F6] P3: Code duplication — `resolveCommandWithKnownPaths` result consumption pattern repeated in dispatch.js and hopper-runner

**Root cause.** Both `cli/src/dispatch.js:167-171` and `cli/bin/hopper-runner:121-124` apply the same pattern to consume `resolveCommandWithKnownPaths` output:
```js
const resolvedCmd = resolved ? resolved.command : adapter.command;
const prependArgs = resolved ? resolved.prependArgs : [];
```
A change to how the resolution result maps to spawn args (e.g., adding a `shell` flag, or wrapping with `cmd.exe` in a new code path) requires edits in both files. This already caused the known divergence in the Phase 6b dogfood (runner path was never updated for knownInstallPaths until this commit).

**Recommended fix.** Extract a shared helper in `cli/src/path-resolve.js` that returns a normalized `{ command, args }` tuple ready for `spawn()`. Both dispatch.js and hopper-runner call it with `(adapter.command, adapter.knownInstallPaths, adapterArgs)`.

---

### [F7] P3: `applyTaskTypeFloor` takes `opts` but only reads `opts.taskType`

**Root cause.** `cli/src/subprocess.js:37-43` — the function signature `applyTaskTypeFloor(nativeMs, opts)` suggests it reads general options, but it only accesses `opts.taskType`. The pattern was chosen for consistency with `timeoutMs(opts)`, but it creates a coupling: the caller must remember to thread `taskType` through `opts` before calling. If a new adapter's `timeoutMs` accidentally drops `opts.taskType` (e.g., by constructing a fresh opts object), the floor silently disappears.

**Recommended fix.** Accept a second optional parameter or switch to `applyTaskTypeFloor(nativeMs, taskType)` with a fallback to `opts.taskType` for backward compat:
```js
export function applyTaskTypeFloor(nativeMs, optsOrTaskType) {
  const taskType = typeof optsOrTaskType === 'string' ? optsOrTaskType : optsOrTaskType?.taskType;
  if (taskType && REVIEW_TASK_TYPES.has(taskType)) {
    return Math.max(nativeMs, REVIEW_TASK_FLOOR_MS);
  }
  return nativeMs;
}
```
This makes the dependency explicit and eliminates the opts-threading requirement for callers that already have the taskType string.

---

### [F8] P3: `types.js` JSDoc says `timeoutMs(AdapterOpts)` but actual calls pass `logFile` and `taskType` not in `AdapterOpts`

**Root cause.** `cli/src/types.js:48-49` defines `AdapterOpts` with properties `sandbox`, `reasoning`, `model`, `webSearch`, `conversationId`. But `executeWithAdapter` in dispatch.js lines 159-160 passes `effectiveOpts` which includes `logFile` and `taskType` — neither is declared in `AdapterOpts`. The JSDoc type is stale.

**Recommended fix.** Add `logFile` and `taskType` to the `AdapterOpts` typedef:
```js
 * @property {string} [logFile]        Adapter log file path
 * @property {string} [taskType]       Task-type for timeout calculation
```

## Verdict

PASS_WITH_CHANGES — 4 P2 findings (F2, F3, F4, F5) should be addressed before the next Phase 6c-dependent dispatch. F1 (P1) is the highest-leverage fix: type the contract so future adapters don't silently miss PATH fallback. F6–F8 are polish. No REWORK-level issues found.

## Commit

`fe9a79f`

## Checks

- [x] Review touches only this findings document
- [x] No edits to product code
- [x] Findings severity-ordered
- [x] Root cause + recommended fix per finding
- [x] Verdict issued

## Next recommendation

Address F1 (type knownInstallPaths) and F2 (extension-less guard) before adding any new vendor adapters. Address F5 (env round-trip test) before the next background-mode dispatch of a review task-type.

## Status (background completion)
- queue_status: done
- adapter_status: success
- exit_code: 0
- duration_ms: 322717
- end_time: 2026-05-21T10:19:13.069Z
- log: see `T-AUDIT-PH6C-opencode-output.log` for raw output
