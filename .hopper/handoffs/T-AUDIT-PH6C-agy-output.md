---
task_id: T-AUDIT-PH6C-agy
adapter: agy
status: failed
pid: 62896
start_time: "2026-05-21T10:13:50.594Z"
end_time: "2026-05-21T10:17:01.747Z"
exit_code: 0
duration_ms: 191036
mode: background
host_native: null
session_id: null
log: ./T-AUDIT-PH6C-agy-output.log
started_by_pid: 52492
signal: null
timed_out: null
adapter_status: auth-fail
---

# T-AUDIT-PH6C-agy — Adversarial Code Review (agy, Gemini 3.5 Flash)

## Summary

This adversarial review provides an in-depth audit of the Phase 6c implementation (commit `fe9a79f6bf3e7ccb7aa0f568aa37805e46fca2c7`), which introduced task-type-aware timeouts, deterministic known install paths for command resolution, Kimi `--thinking` flag forwarding, and soft-warn hints. The review reveals one severe correctness bug and design hole (P0) where pre-qualified or absolute paths are hijacked by fallbacks or falsely reported as missing during installation checks, one important design hole (P1) in Kimi thinking toggles, and one minor design omission (P2) regarding missing floors for spec-hunting tasks.

**Verdict: REWORK**

---

## Files Reviewed

A total of **12 files** spanning approximately **2,111 lines of code (LOC)** were audited:

| File | Purpose | LOC Reviewed |
|---|---|---|
| [path-resolve.js](file:///F:/workspace/ai/hopper-plugin/cli/src/path-resolve.js) | Path resolution machinery (F2) | ~166 |
| [subprocess.js](file:///F:/workspace/ai/hopper-plugin/cli/src/subprocess.js) | Process spawning & timeout floors (F1) | ~178 |
| [dispatch.js](file:///F:/workspace/ai/hopper-plugin/cli/src/dispatch.js) | Dispatch orchestration | ~230 |
| [vendors/index.js](file:///F:/workspace/ai/hopper-plugin/cli/src/vendors/index.js) | Vendor registry and check surface | ~90 |
| [bin/hopper-runner](file:///F:/workspace/ai/hopper-plugin/cli/bin/hopper-runner) | Background process runner | ~150 |
| [bin/hopper-dispatch](file:///F:/workspace/ai/hopper-plugin/cli/bin/hopper-dispatch) | Primary CLI dispatch entry | ~500 |
| [vendors/agy.js](file:///F:/workspace/ai/hopper-plugin/cli/src/vendors/agy.js) | Antigravity adapter implementation | ~200 |
| [vendor-probe/agy.js](file:///F:/workspace/ai/hopper-plugin/cli/src/vendor-probe/agy.js) | Antigravity capability prober | ~30 |
| [vendors/kimi.js](file:///F:/workspace/ai/hopper-plugin/cli/src/vendors/kimi.js) | Kimi adapter implementation (P1) | ~90 |
| [vendors/codex.js](file:///F:/workspace/ai/hopper-plugin/cli/src/vendors/codex.js) | Codex adapter implementation | ~80 |
| [vendors/copilot.js](file:///F:/workspace/ai/hopper-plugin/cli/src/vendors/copilot.js) | Copilot adapter implementation | ~70 |
| [vendors/opencode.js](file:///F:/workspace/ai/hopper-plugin/cli/src/vendors/opencode.js) | OpenCode adapter implementation | ~80 |
| [tests/unit/phase6c.test.js](file:///F:/workspace/ai/hopper-plugin/tests/unit/phase6c.test.js) | Phase 6c unit tests | ~197 |

---

## Findings

### [F1] P0: `resolveCommandWithKnownPaths` hijacks user-specified absolute command paths and causes false negatives in installation checks

* **Root Cause**: `resolveCommandWithKnownPaths` is designed to walk PATH first, and then fall back to `knownInstallPaths` if the command is not found. For absolute or qualified paths (e.g., containing slashes or extensions), `resolveCommandOnPath` correctly returns `{ command: cmd, prependArgs: [], resolvedPath: null }` as a qualified bypass. However, `resolveCommandWithKnownPaths` checks `if (onPath && onPath.resolvedPath) return onPath;`. Because `resolvedPath` is `null` for pre-qualified paths, this check is skipped. If `knownInstallPaths` is not empty, the function loops through the fallbacks. If a fallback exists, the resolver returns the fallback binary (hijacking the user's custom path). If no fallback exists, the function returns `null`. Consequently, `installCheckForAdapter` in `cli/src/vendors/index.js` checks `resolved !== null && resolved.resolvedPath !== null`, which evaluates to `false`, causing the tool to falsely report `NOT_INSTALLED` for perfectly valid custom binary paths.
* **Recommended Fix**: Add a pre-qualification check in `resolveCommandWithKnownPaths` to return `onPath` immediately if the path already contains separators or extensions, rather than trying fallback resolution:
  ```javascript
  const onPath = resolveCommandOnPath(cmd);
  if (onPath && (onPath.resolvedPath || cmd.includes('/') || cmd.includes('\\') || /\.\w+$/.test(cmd))) {
    return onPath;
  }
  ```

### [F2] P1: Kimi adapter does not support explicitly disabling thinking mode

* **Root Cause**: Kimi's CLI supports mutually exclusive toggles (`--thinking / --no-thinking`), defaulting to the last session's setting if neither is specified. The Kimi adapter (`cli/src/vendors/kimi.js`) only appends `['--thinking']` when reasoning is truthy and not `'none'`, but does not append `['--no-thinking']` when `opts.reasoning` is `'none'` or falsy:
  ```javascript
  const thinkingFlag = opts.reasoning && opts.reasoning !== 'none'
    ? ['--thinking']
    : [];
  ```
  If the last active session used thinking, executing hopper with `--reasoning none` will silently reuse Kimi's sticky thinking setting, violating the user's explicit request to turn off thinking.
* **Recommended Fix**: Update the ternary check to explicitly forward `--no-thinking` when `opts.reasoning === 'none'`, overriding any sticky configuration settings:
  ```javascript
  const thinkingFlag = opts.reasoning && opts.reasoning !== 'none'
    ? ['--thinking']
    : (opts.reasoning === 'none' ? ['--no-thinking'] : []);
  ```

### [F3] P2: `spec-blindspot-hunt` task-type lacks a timeout floor

* **Root Cause**: While Phase 6c introduced task-type-aware timeout floors for `code-review-adversarial` and `code-review-acceptance` (30 minutes), it left `spec-blindspot-hunt` out of the floor mapping. A spec blindspot hunt is a highly complex, context-heavy reasoning task that involves walking specs and codebase structures, and can easily hit default vendor timeout limits (e.g., 2 minutes for Copilot).
* **Recommended Fix**: Add `'spec-blindspot-hunt'` to `REVIEW_TASK_TYPES` or declare a separate category floor (e.g., 15-20 minutes) for spec-hunting task-types in `cli/src/subprocess.js`.

---

## Verdict

**REWORK**

Critical correctness issues in path resolution (F1) and design gaps in thinking controls (F2) necessitate immediate remediation before Phase 6c can be fully accepted and deployed.

---

## Commit

`fe9a79f`

---

## Checks

* **Findings Document Only**: This review touched only the findings document (`.hopper/handoffs/T-AUDIT-PH6C-agy-output.md`) and the status flip in `.hopper/queue.md`.
* **Subprocess Spawn Invariant**: Spawning is restricted to a single subprocess and complies with all execution safety parameters.

---

## Next Recommendation

Proceed to the rework task **`T-AUDIT-PH6C-agy-rework`** to apply the path resolution fix (F1) and Kimi thinking mode toggle fix (F2).

## Status (background completion)
- queue_status: failed
- adapter_status: auth-fail
- exit_code: 0
- duration_ms: 191036
- end_time: 2026-05-21T10:17:01.748Z

### Adapter error
```
agy is not OAuth-authed. Run `agy` interactively once (browser OAuth flow). After login, -p mode works headless.
```
- log: see `T-AUDIT-PH6C-agy-output.log` for raw output
