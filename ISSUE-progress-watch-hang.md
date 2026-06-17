# ISSUE: `tests/unit/progress-watch.test.js` hangs the test process (and `--watch-events --once` can hang forever)

> Reporter: governance-fusion migration (Claude Code session, dogfooding hopper-dispatch)
> Date: 2026-06-17
> Severity: medium (blocks the full-suite `npm test` gate; has a workaround = exclude this one file)
> Status: open — pre-existing, NOT introduced by the governance-fusion change (which never touched the `--watch-events` path)

## Symptoms (confirmed)

- `node --test tests/unit/*.test.js` does not terminate. Observed hangs of 120s and ~904s before external cancellation.
- Isolated to one file: `node --test tests/unit/progress-watch.test.js` alone hangs. `node --test --test-timeout=15000 tests/unit/progress-watch.test.js` reports the file-level test as `cancelled` ("test timed out after 15000ms") with no subtest output surfaced.
- The rest of the suite is healthy: `node --test $(ls tests/unit/*.test.js | grep -v progress-watch)` → **616 tests, 590 pass, 0 fail, 26 skipped**. So `progress-watch.test.js` is the sole hanger.

## Reproduction

```bash
# hangs (cancelled by node's own per-test timeout)
node --test --test-timeout=15000 tests/unit/progress-watch.test.js

# the full-suite gate inherits the hang
node --test tests/unit/*.test.js
```

## Analysis (partial — root cause NOT fully confirmed)

Each individual test in the file is internally bounded: `waitFor`/`waitForExit` throw after 6000ms. So no single subtest should exceed ~6s, yet the file process runs >120s. That points to a **leaked handle keeping the test-file process alive after the tests themselves finish**, rather than a slow test. Strong suspects, not yet pinned to one:

- `runWatchEvents` (in `cli/bin/hopper-dispatch`) sets up `setInterval(scanOutputs, 500)` + one `fs.watchFile()` StatWatcher per output file. Its `cleanup()` clears the interval and `unwatchFile()`s — but if any path through the in-process tests (`'terminal event triggers one OS notify attempt'`, `'notify failure does not block stdout JSONL output'`) leaves a StatWatcher reffed, or a spawned `--watch-events` child (the non-`--once` `'single subscriber'` test) is not fully terminated/released on this platform's polling filesystem, the parent/file process never drains its event loop and node:test never exits.

There is also a **distinct product-level hazard** in the same code: `hopper-dispatch --watch-events --once` has **no bounded exit** — it only calls `cleanup(0)` after observing a terminal event. In a workspace where no task ever reaches a terminal state, the command runs forever (no idle/max-wait cap). The quiet no-op path (`!hopperDir && !HOPPER_DIR → return`) only covers the no-workspace case; a real workspace with no terminating task hangs.

## Impact

- `npm test` (the full-suite gate) cannot complete; contributors must exclude `progress-watch.test.js` to get a green run.
- `--watch-events --once` can hang a session indefinitely if no terminal event arrives.

## Suggested fix direction (for the implementer to confirm via systematic debugging)

1. Reproduce and identify the exact leaked handle (e.g. run the file under a handle dump: `process.getActiveResourcesInfo()` / `process._getActiveHandles()` after `node:test` completes).
2. Ensure `runWatchEvents` releases everything on cleanup: `unref()` the `setInterval` and the `watchFile` StatWatchers so they never keep the loop alive on their own, and confirm spawned children in the tests are killed AND their stdio pipes closed/awaited.
3. Give `--watch-events --once` a bounded/idle exit (or make the tests deterministic so the file always drains), so neither the test nor the CLI can hang indefinitely.
4. Re-verify: `node --test tests/unit/progress-watch.test.js` exits on its own, and `node --test tests/unit/*.test.js` (no exclusion) completes green.
