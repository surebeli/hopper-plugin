---
task_id: T-PROG-R07-REVIEW-opencode
adapter: opencode
status: done
pid: 72408
start_time: "2026-05-22T15:50:29.672Z"
end_time: "2026-05-22T15:54:57.888Z"
exit_code: 0
duration_ms: 268130
mode: foreground
phase: done
last_progress: Adversarial review complete.
progress_seq: 2
terminal_event_emitted: true
log: ./T-PROG-R07-REVIEW-opencode-output.md
started_by_pid: 72128
signal: null
timed_out: null
adapter_status: success
---

# Adversarial Review: T-PROG-R07 — OS Notification + Watch Integration

## Summary

Reviewed 4 R07 commits (a19d5fd..b630483, 516 lines) adding `cli/src/notify.js` and integrating it into `hopper-dispatch --watch-events`. The implementation is generally sound with good test coverage, injection-friendly design, and clean red-line compliance. Found 1 P1 (blocking MessageBox on Windows), 2 P2 issues (no-op ternary in normalizeNotification, null-seq dedup hole), and 2 P3 items (resource leak on timeout, missing notify-send flags). Verdict: **PASS_WITH_NOTES** — ship with known limitations documented.

## Files Reviewed

| File | LOC | Type |
|------|-----|------|
| `cli/src/notify.js` | 165 | New — OS notify helper |
| `cli/bin/hopper-dispatch` | +32/-12 | Modified — watch-events integration, `runWatchEvents` export |
| `tests/unit/notify.test.js` | 158 | New — 8 unit tests |
| `tests/unit/progress-watch.test.js` | +138 | Modified — 3 watcher-notify integration tests |
| `docs/specs/background-progress-notification-v1.1-r07-OUTPUT.md` | 35 | New — R07 output doc |

## Findings

### [F1] P1: Windows MessageBox fallback blocks until user clicks OK

**Root cause**: When BurntToast module is not installed (it is NOT a default Windows PowerShell module), `notifyWindows` falls through to `[System.Windows.Forms.MessageBox]::Show(...)` (`notify.js:65`). This is a **synchronous blocking call** — the PowerShell process hangs until the user physically dismisses the dialog. In a fire-and-forget notification context intended for CI/background watchers, this means:

- The PowerShell child process stays alive for up to 5s (the timeout), consuming a process slot
- After `child.kill()`, the MessageBox dialog can remain orphaned on screen (Windows does not auto-dismiss message boxes when the spawning process dies)
- If the watcher is running headless or in a terminal session with no interactive user, the dialog blocks indefinitely until the timeout kills it, and the user never sees a toast

**Evidence**: `notify.js:59-68` — `MessageBox::Show` is called with no timeout mechanism. The only escape is `child.kill()` at `notify.js:153` after `NOTIFY_TIMEOUT_MS` (5s). Test `notify.test.js:26-40` validates the fallback path with mock exit codes but cannot observe dialog blocking.

**Recommended fix**: Replace MessageBox fallback with `[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier()` (WinRT API, non-blocking) or a simple `Write-Warning` to stderr if BurntToast is unavailable. If MessageBox is retained, consider shortening the timeout to ~1s for the fallback path or documenting that BurntToast is required for silent operation.

---

### [F2] P2: `normalizeNotification` no-op ternary on title with taskId

**Root cause**: `notify.js:97` — `taskId ? \`${safeTitle}\` : safeTitle` evaluates to the same value in both branches. The template literal `` `${safeTitle}` `` produces `safeTitle` with no transformation or prefix. The `taskId` parameter is accepted in the `notify` function signature (`notify.js:25`), passed through `normalizeNotification`, and referenced in the ternary, but has **zero effect** on the title output.

The `taskId` IS used in the title string built by the caller (`hopper-dispatch:761`: `` title: `hopper: ${taskId}` ``) and in the fallback message (`notify.js:95`: `String(message || taskId || 'task completed')`). So taskId is not lost — it's just that the ternary in normalizeNotification suggests an intended prefix/tag that was never wired.

**Evidence**: `notify.js:93-100` — ternary conditional where both arms are identical. Watcher tests `progress-watch.test.js:266` check the title set by the caller (`'hopper: T-WATCH-NOTIFY'`), not the output of `normalizeNotification` directly. Unit test `notify.test.js` does not test the no-op path.

**Recommended fix**: Either (a) remove the ternary and the `taskId` parameter from `normalizeNotification` if it truly has no effect, or (b) make the intentional behavior explicit: `taskId ? \`[${taskId}] ${safeTitle}\` : safeTitle` if taskId tagging is desired.

---

### [F3] P2: Null `progress_seq` collapses to 0, breaking second-event dedup

**Root cause**: `hopper-dispatch:753` — `Number.isInteger(fm.progress_seq)` returns `false` for `null`/`undefined`, so `seq` defaults to `0`. If a task emits a second terminal event (possible if frontmatter is overwritten with a new progress_seq value), the second seq is also `0`, and the `previousSeq >= seq` guard at line 755 silently drops it. The user receives no notification for the second event.

**Evidence**: `hopper-dispatch:753-755`. Test `progress-watch.test.js:270-272` tests dedup with identical SEQ=4 (intentionally same seq), but does not test the null-seq path.

**Recommended fix**: Use a sentinel (e.g., `-1`) for unset seq, not `0`. Then `previousSeq = -1` on first event and any real seq (including `0`) will pass the `>=` check. Alternatively, add an explicit `seq === 0 ? null : ...` guard to force task-ids through at least once.

---

### [F4] P3: Timeout leaves child process listeners registered

**Root cause**: `notify.js:139-157` — When the timeout fires (line 152), `child.kill()` is called and `finish()` resolves the promise. But `child.stderr.on('data', ...)` (line 140), `child.once('error', ...)` (line 142), and `child.once('exit', ...)` (line 143) remain registered on the child process. If the process takes non-trivial time to actually terminate (common on Windows for hanging processes), the `stderr` listener continues accumulating data into the `stderr` local variable. The `exit`/`error` listeners are guarded by `settled` but still hold references.

**Evidence**: `notify.js:139-157`. The timeout test (`notify.test.js:106-119`) verifies `child.killed === true` and `error === 'timeout'` but does not verify listener cleanup or absence of resource leaks.

**Recommended fix**: Extract listener removal into `finish()` or use `child.on('exit', ...)` (not `once`) with a `settled` check that also removes the `stderr` listener. For best-effort notifications this is unlikely to cause practical problems, but it is a correctness gap in the resource lifecycle.

---

### [F5] P3: `notify-send` invoked without urgency or expiration flags

**Root cause**: `notify.js:87` — Linux notify-send is called with `[payload.title, payload.message]` only. The `notify-send` tool supports `-u critical` (persistent until dismissed) and `-t <ms>` (expiration timeout). For task completion notifications, a critical urgency with a 10-30s expire time would better match user expectations than the default "normal" behavior.

**Evidence**: `notify.js:87`. Linux test `notify.test.js:59-72` verifies exact args `['hopper: T-3', 'opencode done']` — no extra flags.

**Recommended fix**: Add `['-u', 'critical', '-t', '10000', payload.title, payload.message]` for persistent-but-self-dismissing Linux notifications. Verify with `notify-send --help` for available flags on target distributions.

### [F6] P3: `.catch(() => {})` in watcher swallows programming errors

**Root cause**: `hopper-dispatch:764` — `notifyFn({...}).catch(() => {})` catches ALL rejection reasons including TypeError, ReferenceError, and other programming errors in the notify call signature. If the notify function's parameter shape changes or a bug is introduced, the watcher silently continues without any diagnostic.

**Evidence**: `hopper-dispatch:764`. Test `progress-watch.test.js:279-306` explicitly tests that a throwing `notifyFn` does not block JSONL output, verifying this is intentional behavior.

**Recommended fix**: Accept as-is (by-design for fire-and-forget notification contract). Log to stderr in the `.catch()` for observability: `.catch((err) => console.error('notify error:', err))` while still not blocking the watcher.

## Red Line Compliance

| Boundary | Verdict | Evidence |
|----------|---------|----------|
| No dashboard/commands/monitors/hosts changes | PASS | `git diff 1badd08..b630483 -- dashboard/ commands/ monitors/ hosts/` → empty |
| No package.json dependency changes | PASS | `git diff 1badd08..b630483 -- package.json` → empty |
| No retry/fallback vendor logic | PASS | `notify.js` has zero loops, retry counters, or fallback vendor commands |
| No mutations to caller exit status | PASS | notify always returns `{ ok, ... }`, never throws, never calls `process.exit` |
| `HOPPER_NOTIFY=0` tested | PASS | `notify.test.js:74-87` + `progress-watch.test.js:308-332` |
| Shell injection escaping | PASS | `quotePowerShell` (notify.js:102-104) correctly doubles single quotes. `quoteAppleScript` (notify.js:106-108) escapes `\`, `"`, `\r?\n`. Linux uses separate spawn args (no shell). All verified in `notify.test.js:89-104` |

## Verdict

**PASS_WITH_NOTES**

No P0 findings. One P1 (Windows MessageBox blocking) — medium impact because BurntToast is the primary path and MessageBox is the fallback. Two P2 findings that do not affect correctness of the primary paths. Findings are well-contained and the implementation meets the scope boundaries.

## Commit

`b630483` `[T-PROG-R07] add R07 execution output`

## Checks

- Review doc only: git diff shows only this file + spec output doc changed
- No product code was modified by this review
- Findings are severity-ordered per task-type schema

## Next Recommendation for R07 Closeout Reviewer

Accept R07 as-is. Document the Windows MessageBox blocking behavior (F1) in the spec output doc's "Known Limitations" section. File a follow-up R07.1 for: (a) F1 — replace MessageBox with non-blocking WinRT toast or remove fallback and document BurntToast requirement, (b) F2 — fix the no-op ternary, (c) F3 — tighten null-seq handling. None of these block the current ship.

## Status (background completion)
- queue_status: done
- adapter_status: success
- exit_code: 0
- duration_ms: 268130
- end_time: 2026-05-22T15:54:57.888Z
- log: see `T-PROG-R07-REVIEW-opencode-output.log` for raw output
