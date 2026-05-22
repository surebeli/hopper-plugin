# R07 OS Notify Helper Output

## Summary

Implemented v1.1 R07 by adding a best-effort OS notification helper and wiring it into `hopper-dispatch --watch-events` immediately after terminal stdout JSONL emission. The helper supports Windows PowerShell BurntToast with MessageBox secondary path, macOS `osascript`, Linux `notify-send`, `HOPPER_NOTIFY=0`, shell-safe quoting, spawn timeout, and swallowed failures.

## Files Touched

- `cli/src/notify.js` (new): platform-dispatch notify helper.
- `cli/bin/hopper-dispatch` (modified): `--watch-events` calls notify after terminal JSONL output.
- `tests/unit/notify.test.js` (new): platform command, quoting, disable, timeout, and error tests.
- `tests/unit/progress-watch.test.js` (modified): watcher notify integration tests.
- `.hopper/queue.md` and `.hopper/handoffs/leader-tasklist.md` (modified): R07 dogfood task entries.

## Verification

1. PASS — `node --test tests/unit/notify.test.js`: 8 pass, 0 fail.
2. PASS — `node --test tests/unit/progress-watch.test.js`: 7 pass, 0 fail.
3. PASS — `npm test`: 425 tests, 410 pass, 15 skipped, 0 fail.
4. PASS — `npm run dashboard:build`: built successfully; main gzip 119.39 kB.
5. PASS — package/forbidden-scope diff: 0 lines for `package.json`, `dashboard/`, `commands/`, `monitors/`, `hosts/`, `cli/bin/hopper-runner`, `cli/src/progress.js`, and `cli/src/background.js`.
6. PASS — `HOPPER_TEST_ONLY` grep in `cli/src/notify.js`: 0 matches.

## Decisions / Deviations

- Kept `notify` fire-and-forget in `--watch-events`; stdout JSONL remains the authoritative watcher output and notify cannot delay watcher cleanup.
- Exported `runWatchEvents` with injectable `notifyFn`, `writeLine`, and `exitFn` so tests can exercise watcher notification behavior without invoking real OS toast commands.
- R07 research dogfood was dispatched before implementation and was still in-progress at closeout; it is evidence-gathering, not a blocker for this implementation.

## Commits

- `1badd08` `[T-PROG-R07-DOGFOOD] add R07 dogfood tasks`
- `a19d5fd` `[T-PROG-R07] add OS notify helper`
- `eb6d839` `[T-PROG-R07] integrate notify into watch-events`
- `c6f8065` `[T-PROG-R07] add notify watcher tests`
