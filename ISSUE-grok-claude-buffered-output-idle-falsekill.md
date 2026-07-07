# ISSUE: grok/claude background dispatches are unconditionally killed by the idle watchdog ~idleMs after spawn — `--output-format json` is end-buffered, so the runner's log-growth idle detector never sees growth until the vendor is already done

> Reporter: hopper self-audit (dogfood investigation, corroborated by real dispatch timing logs)
> Date: 2026-07-08
> Severity: high — every grok/claude BACKGROUND dispatch that legitimately runs longer than the idle timeout (default 180s; env-tunable via `HOPPER_IDLE_TIMEOUT_MS`) is killed and reported as `adapter_status: timeout`, regardless of whether the vendor was actually stuck or just still working
> Env: hopper-plugin 0.29.0; affects the BACKGROUND dispatch path only (`cli/bin/hopper-runner`); the SYNC dispatch path (`cli/src/subprocess.js runSubprocessOnce`) uses a different idle mechanism (resets on stdout/stderr `data` events) and was not in scope for this fix
> Status: **FIXED** (mitigation applied below); a proper streaming-based fix is DEFERRED (see below)

## Root cause (confirmed)

1. `cli/src/vendors/grok.js` spawns grok with `-p <prompt> --output-format json` (the
   `--output-format json` flag; args() build, now at line 98 post-fix — originally
   line 87 before this fix's own comment block shifted it). Per the adapter's own
   comments (the `streaming` capability note: *"Adapter uses `json` for a single
   trailing object suited to background capture"*, and `parseResult`'s note:
   *"`--output-format json` yields a single trailing JSON object"*), grok **buffers
   all output and writes stdout exactly ONCE, at process exit**. Nothing is written
   incrementally.
2. `cli/src/vendors/claude.js` has the **identical** pattern: `-p --output-format
   json` (args() build, now at line 119 post-fix — originally line 108), with the
   same "single trailing result object" behavior documented in its own `streaming`
   capability note and `parseResult` comment.
3. The BACKGROUND idle watchdog in `cli/bin/hopper-runner` (the `idlePoll`
   `setInterval`, originally spanning ~:358-391, now ~:371-403 after this fix's
   insertion above it) resets its silence clock **only on log-FILE-size growth**
   (`statSync(logPath).size` polling — see the `sz !== lastSize` check and
   `lastGrowAt = Date.now()` reset). The runner pipes vendor stdio straight to a
   shared log file with no in-process `'data'` events (see the idle-vs-ceiling
   design comment a few lines above the poll), so "idle" is entirely a function of
   when that file's byte count changes.
4. For an end-buffered vendor, the log file does not grow **at all** until the
   process is about to exit — so the idle poll's "no growth for `idleMs`" condition
   is satisfied almost immediately after spawn and stays satisfied for the vendor's
   entire runtime. The idle timeout therefore degenerates into an **unconditional
   kill ~idleMs after spawn**, with no relationship to whether the vendor is
   actually stuck. This is architecturally the same class of bug as the mimo
   background-exit hang (see `ISSUE-mimo-codeimpl-timeout.md` and the
   `idleHeartbeatRe` mechanism it motivated) — except inverted: mimo's log grows
   *too often* (a heartbeat) and defeats the detector one way; grok/claude's log
   grows *too rarely* (never, until exit) and defeats it the other way.

## Timing forensics

Real background dispatches were killed at:

| idleMs configured | actual kill time | delta over idleMs |
|---|---|---|
| 180000ms (3 min default) | 185053ms | +5053ms |
| 600000ms (10 min, `HOPPER_IDLE_TIMEOUT_MS` override) | 605213ms | +5213ms |

Both deltas are ≈ one poll tick. The runner's poll cadence is
`pollMs = Math.max(1000, Math.min(idleMs, 5000))` — for both idleMs values above
this clamps to `pollMs = 5000`. A vendor that never grows its log will be killed
on the very next tick after `idleMs` elapses, i.e. at `idleMs + (0..pollMs)`,
matching both observations exactly (Δ≈5s, one poll tick, every single time — not
occasional flakiness, a deterministic unconditional kill).

## Applied mitigation (ceiling-only for buffered-output adapters)

Rather than teach the runner to parse partial/incremental vendor output (grok and
claude are not currently invoked with a streaming output format — see Deferred
below), the fix follows the **existing adapter-declared-hook precedent**: mimo
already declares `idleHeartbeatRe` (`cli/src/vendors/mimo.js:38`) and the runner
already special-cases it (`cli/bin/hopper-runner`, `heartbeatRe` variable). This
fix adds a second, simpler hook:

1. **`cli/src/vendors/grok.js`** (line 53) and **`cli/src/vendors/claude.js`**
   (line 56) each now declare:
   ```js
   bufferedOutput: true,
   ```
   with a comment explaining why (end-buffered `--output-format json`), placed at
   the same top-level position other adapter-declared hooks live (mirrors
   `idleHeartbeatRe`'s placement in mimo.js).
2. **`cli/bin/hopper-runner`** (~:353-355, ~:371) computes
   `bufferedOutput = Boolean(adapter && adapter.bufferedOutput === true)` right
   after the ceiling `killTimer` is armed, and changes the idle-poll arming
   condition from `idleMs > 0` to `idleMs > 0 && !bufferedOutput`. When
   `bufferedOutput` is true, the idle `setInterval` is **never created** — the
   idle mechanism is fully disabled for that dispatch. The **absolute ceiling
   timeout is untouched and stays fully in force** (`killTimer` is set up
   unconditionally, before this check, so a genuinely hung buffered-output vendor
   is still killed — just by the ceiling, not a false-positive idle read).
3. A diagnosability line is emitted unconditionally (not gated behind
   `HOPPER_DEBUG`, since it is a rare, structural fact about the dispatch, not
   per-invocation noise) whenever `bufferedOutput` is true:
   ```
   hopper-runner: idle watchdog disabled (bufferedOutput vendor) — ceiling-only timeout applies (<ceilingMs>ms)
   ```

### Tests

- `tests/unit/vendors-contract.test.js` — two new tests mirroring the existing
  `idleHeartbeatRe` contract test: grok/claude declare `bufferedOutput: true`; the
  other six adapters do not.
- `tests/integration/runner-single-spawn.test.js` — two new integration tests,
  placed directly beside the file's existing (and only other) timeout test
  (`hopper-runner appends exactly one timeout terminal progress event`), reusing
  its PATH-shim helper pattern:
  - **Test A (repro)**: a PATH-shimmed stub vendor that stays silent, then writes
    one trailing blob and exits 0 (the grok/claude shape), dispatched through the
    `opencode` adapter (no `bufferedOutput`) with `idleMs=500`. Asserts the run is
    killed (`status: failed`, `phase: timeout`, `timed_out: true`) well before its
    scheduled write, and that the raw log is **0 bytes** at completion — the
    decisive proof that the vendor never got a chance to produce output before
    being killed.
  - **Test B (fix)**: the identical stub shape, dispatched through the **real
    grok adapter** (now `bufferedOutput: true`) with the same `idleMs=500`, but a
    silence duration (2500ms) deliberately longer than idleMs — so under the
    pre-fix runner this case would ALSO have been falsely killed. Asserts a
    natural `status: done` / `adapter_status: success`, and that the parsed
    answer text is embedded in `output.md`'s "Vendor output (parsed)" section.
  - Both verified independently: temporarily reverting only the runner's arming
    condition (back to `idleMs > 0`, ignoring `bufferedOutput`) makes Test B fail
    while Test A still passes — confirming Test B actually exercises the fix
    rather than being tautological.
  - Both run in well under 5s (Test A ~2.0-2.1s, Test B ~2.9-3.0s).

## DEFERRED: proper streaming-based fix

Ceiling-only is a **mitigation**, not a resolution: a genuinely hung grok/claude
background dispatch will now run the *full* ceiling (≥30 min floor) before being
reaped, instead of being caught early by idle detection. The proper fix is to
make these adapters stream incrementally so the EXISTING idle-on-log-growth
detector works as designed, with no special-casing needed:

- **grok**: switch the background/headless invocation from `--output-format
  json` to `--output-format streaming-json`, which the adapter's own capability
  note already documents as emitting NDJSON events (`cli/src/vendors/grok.js`,
  `features.streaming.mechanism`). Requires: (a) an incremental NDJSON parser in
  `parseResult`/a new streaming accumulator (today's `extractGrokText` assumes a
  single JSON object or the last JSON line of a *complete* stream, not a live
  growing one), and (b) live verification of the streaming event schema — the
  adapter's own header comment flags the `--output-format json` object field
  names as UNCONFIRMED/undocumented; the streaming event shape is equally
  unconfirmed and was NOT verified as part of this fix.
- **claude**: switch to `--output-format stream-json` with `--include-partial-
  messages` / `--verbose` (per the adapter's `features.streaming.mechanism`
  note), which emits newline-delimited event JSON incrementally. Same caveat:
  requires an incremental parser and live schema verification (the "single
  trailing result object" shape is CONFIRMED via code.claude.com docs; the
  partial-message event shape was not independently verified here).
- Once both are live-verified and incrementally parsed, `bufferedOutput` can be
  removed from both adapters (or kept as a defensive fallback flag) and the idle
  detector will resume working natively for these vendors, restoring early
  detection of genuinely hung runs instead of waiting out the full ceiling.

This was intentionally NOT attempted in this pass: the task scope was the
false-kill mitigation, and streaming-format event schemas need live vendor
verification (not available in this environment) before an incremental parser
can be trusted not to silently mis-parse.

## Two adjacent findings (noted, not fixed — separate from this issue)

**(a) `prd-research` (and other ad-hoc task-types) lack a pinned output path.**
A kimi ad-hoc run (`hopper-dispatch --adhoc --task-type prd-research --brief
"..."`) was observed to write a stray `output.md` at the **host project root**
instead of anywhere under `.hopper/`. Root cause: `cli/src/scaffold.js`
`taskFrame()` — the generic frame template used for ad-hoc dispatches (no
`.hopper/tasks/prd-research.md` file exists in this repo; `prd-research` only has
a one-line purpose string at `cli/src/scaffold.js:278` and falls through to the
generic `taskFrame()` body) — has an `## Output shape (output.md)` section
(`cli/src/scaffold.js:301-311`) that names the deliverable "output.md" and
describes its expected CONTENT, but never states that hopper itself
automatically persists the parsed answer to `.hopper/handoffs/<task-id>-output.md`
(via the runner, for background dispatches), nor instructs the vendor not to
create its own file. An agentic vendor with file-write tools (kimi) can read this
literally and write a real file literally named `output.md` via its own tools,
landing at its cwd — the host project root by default (`opts.cwd`, per the
grok/claude adapters' own comments on `HOPPER_VENDOR_CWD` defaulting to the repo
root). Suggested fix direction: either have the generic frame explicitly say
hopper persists the answer automatically and the vendor must NOT write its own
output.md, or give ad-hoc dispatches (and task-types like `prd-research`/
`market-research` in general) an explicit pinned output path reminder in the
composed prompt.

**(b) The dispatch header's `Sandbox:` line overstates enforcement for
native-sandbox vendors.** `cli/bin/hopper-dispatch:952` prints
`` console.log(`Sandbox:     ${effectiveOpts.sandbox}`) `` — the REQUESTED
sandbox mode, verbatim, regardless of whether the resolved vendor can actually
enforce it. hopper already has the classification needed to know better:
`cli/src/setup.js:31-43` (`sandboxControl(adapter)`) diffs the adapter's argv for
`danger-full-access` vs `read-only` and returns `'argv'` (downgradable),
`'full'` (always full-access, e.g. codex — not downgradable), or `'native'`
(no sandbox flag at all — the vendor honors only its own policy, e.g. kimi; also
not downgradable; confirmed via `hopper-dispatch --setup`'s own vendor table,
which correctly shows kimi as `Sandbox: native`). That classification is only
surfaced in `--setup`/`--doctor`, not consulted at the per-dispatch header print
site. So `hopper-dispatch <task> --sandbox read-only --vendor kimi` prints
`Sandbox:     read-only` even though kimi's `-p` mode has no argv-level
permission mode at all (confirmed by `tests/unit/vendors-contract.test.js`'s own
kimi test: *"sandbox opts are not argv-enforceable for kimi -p"*) — a read-only
intent that is silently not enforced, with a header that reads as if it were.
Suggested fix: at the line-952 print site, call `sandboxControl(resolvedAdapter)`
and when it returns `'native'`, print something like
`` Sandbox:     read-only (requested; vendor-native policy applies) `` instead of
the bare value.

## Files changed (this fix)

- `cli/src/vendors/grok.js` — `bufferedOutput: true` capability flag + comment
- `cli/src/vendors/claude.js` — `bufferedOutput: true` capability flag + comment
- `cli/bin/hopper-runner` — skip arming the idle poll when
  `adapter.bufferedOutput === true`; emit a diagnosable status line
- `plugins/hopper/cli/...` (vendored copy) — synced via
  `node scripts/sync-vendored-plugin.mjs` (codex-marketplace plugin packaging
  requires a subset copy under `plugins/hopper/`; drift is guarded by
  `tests/unit/vendored-plugin-sync.test.js`)
- `tests/unit/vendors-contract.test.js` — 2 new contract tests
- `tests/integration/runner-single-spawn.test.js` — 2 new tests (Test A repro,
  Test B fix) + shared helper, placed beside the file's existing timeout test
- This file

## Verification

- Baseline (before this fix, on this machine): `npm test` → 804/804 unit tests
  passing; `node --test tests/integration/*.test.js` → 31/31 passing.
- After this fix: `npm test` → 806/806 unit tests passing (2 new contract
  tests); `node --test tests/integration/*.test.js` → 33/33 passing (2 new
  Test A/B); both new integration tests also verified in isolation via
  `--test-name-pattern`.
- `node cli/bin/hopper-dispatch --setup` — exit 0, full 8-vendor table printed
  with no errors (the adapter field addition does not break discovery/setup).
- Note: on this (busy, shared, 10-core dev) machine, running the full
  `tests/integration/*.test.js` glob concurrently occasionally (~1 in 7 runs
  observed) trips a **pre-existing, unrelated** test's hardcoded 500ms
  full-subprocess-spawn budget (`runner-single-spawn.test.js`, "appends exactly
  one timeout terminal progress event", `HOPPER_TEST_ONLY_TIMEOUT_MS=500`) under
  ambient system load — confirmed via ~13 repeated pure-baseline runs (0
  failures) vs repeated after-fix runs, and confirmed the two new Test A/B never
  fail themselves. This is pre-existing fragility in a hardcoded test timeout,
  not a logic regression (the `opencode`-adapter idle-poll code path executed by
  that test is byte-for-byte unchanged by this fix); left as-is (out of scope
  for this fix) but noted here for the owner.

Status: **FIXED** (mitigation). Streaming-based proper fix tracked as DEFERRED
above.
