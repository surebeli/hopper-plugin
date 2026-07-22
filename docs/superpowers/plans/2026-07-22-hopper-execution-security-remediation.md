# Hopper Execution Security Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the reviewed execution-security gaps without exposing raw vendor data, weakening the single-spawn contract, or changing established OpenCode and Claude/fable semantics.

**Architecture:** Implement three non-overlapping lanes. The Kimi lane rejects an unenforceable read-only request before any process can be spawned and records only content-free liveness. The raw-boundary lane makes dashboard, result, and parser error surfaces closed projections whose only opt-in full-output path remains `--result --full`. The platform lane makes host-sensitive tests deterministic, validates workspace structure, unifies terminal-state decisions, and hardens cache writes while preserving forward-compatible cache data.

**Tech Stack:** Node.js 22, native `node:test`, Express dashboard server, file-backed `.hopper` protocol, React/Vite dashboard, and the vendored `plugins/hopper` mirror.

---

## Frozen contract and verification environment

The implementation starts from `codex/hopper-model-attestation-20260721` at `12e2e0f52925818c0c4eb446ea1c63fa32256ad2`. The adjudicated physical-Node baseline is 981 tests / 948 pass / 5 fail / 28 skipped. The five current failures are exactly the three CRLF-sensitive frontmatter assertions and two selector-metadata fixture-expiry assertions. The prior 981-to-971 result is a host-only NVM-symlink `ENOENT` worker failure and is excluded from repository correctness.

Every Node or npm command in this plan must use this physical distribution; do not invoke the NVM shim and do not modify a PowerShell profile:

```powershell
$NodeHome = 'C:\Users\litianyi\nodejs\node-v22.22.2-win-x64'
$env:Path = "$NodeHome;$env:Path"
& "$NodeHome\node.exe" --version
& "$NodeHome\npm.cmd" --version
```

Do not edit `.hopper/` live protocol state, `package.json`, `package-lock.json`, or the PowerShell profile. Do not add retry/fallback vendor orchestration. A read-only Kimi refusal is a pre-spawn policy error, not an opportunity to switch vendors or retry.

### Ownership and file map

| Lane | Root implementation files | Tests | Mirror obligation |
| --- | --- | --- | --- |
| A — Kimi enforcement/progress | `cli/bin/hopper-dispatch`, `cli/bin/hopper-runner`, `cli/src/vendors/kimi.js` | `tests/unit/dispatch-flags.test.js`, `tests/unit/lifecycle-regression.test.js`, `tests/unit/progress.test.js` | Run `scripts/sync-vendored-plugin.mjs`; commit generated `plugins/hopper/cli/**` changes only from that script. |
| B — raw boundary | `dashboard/server/routes/actions.js`, `dashboard/server/routes/task.js`, `cli/src/inventory-contract.js`, `cli/src/output.js`, `cli/bin/hopper-dispatch`, `cli/bin/hopper-runner`, `cli/src/vendors/*.js` | `tests/unit/dashboard-vendors.test.js`, `tests/unit/dashboard-task.test.js`, `tests/unit/result-full.test.js`, `tests/unit/output-writer.test.js`, `tests/unit/vendors-contract.test.js` | Sync every changed CLI file after root tests pass. Dashboard files are not vendored. |
| C — portability/orchestration/cache | `cli/bin/hopper-dispatch`, `cli/src/cache.js`, `cli/src/handoff-attestation.js`, `cli/src/model-attestation.js`, `dashboard/server/lib/hopper-dir.js` | `tests/unit/claude-code-host.test.js`, `tests/unit/codex-plugin.test.js`, `tests/unit/handoff-attestation.test.js`, `tests/unit/cache.test.js`, `tests/unit/progress-watch.test.js`, `tests/unit/background.test.js`, `tests/unit/stop-job.test.js`, `tests/unit/lifecycle-regression.test.js`, plus a new test helper | Sync every changed CLI file after root tests pass. |

The mirror check is authoritative:

```powershell
& "$NodeHome\node.exe" scripts/sync-vendored-plugin.mjs --check
& "$NodeHome\node.exe" --test tests/unit/vendored-plugin-sync.test.js
```

### Cross-lane invariants

- No default dashboard, task API, CLI result, progress event, adapter error, cache diagnostic, or frontmatter field may interpolate raw stdout, stderr, log content, prompt text, filesystem paths, provider/account data, URLs, tokens, or parser exception text.
- `hopper-dispatch --result <id> --full` remains the sole explicit command-line full-output boundary. It must retain its existing full-sidecar and body-fallback behavior.
- OpenCode remains success-only when both its authoritative completion event and usable reconstructed text exist. Claude’s `fable` alias remains dynamic/non-gating: it may be classified and attested but never becomes a hard availability gate.
- Cache readers preserve forward-compatible unknown fields internally; public projections drop them. Sensitive legacy fields remain stripped, and malformed/future-version cache bytes remain untouched by ordinary writes.
- Use `git diff --check` before each lane commit. Do not hand-edit mirror files; run the sync script after root changes.

## Lane A — Kimi enforcement and content-free liveness

### Task 1: Add Kimi pre-spawn refusal tests

**Files:**

- Modify: `tests/unit/dispatch-flags.test.js`
- Modify: `tests/unit/lifecycle-regression.test.js`

- [ ] **Step 1: Add failing CLI fixtures that prove Kimi cannot be spawned for read-only work**

Extend the existing temporary-workspace helper with a fake `kimi.cmd` that appends `spawned` to a counter file. Add these exact scenarios using `spawnSync(process.execPath, [DISPATCH, ...])` and an explicit `HOPPER_DIR`:

```js
test('Kimi read-only request is refused before any sync spawn', () => {
  const result = runDispatchFixture({ vendor: 'kimi', sandbox: 'read-only' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /kimi.*read-only.*cannot be enforced/i);
  assert.equal(readCounter(), 0, 'refusal must precede adapter argv and spawn');
});

test('Kimi read-only request is refused before any background runner spawn', () => {
  const result = runBackgroundFixture({ vendor: 'kimi', sandbox: 'read-only' });
  assert.equal(result.status, 2);
  assert.equal(readCounter(), 0, 'no runner or kimi child may exist after refusal');
  assert.equal(existsSync(outputMdPath), false, 'no dispatch artifact is created');
});
```

Cover both an explicit `--sandbox read-only` and the existing review/research or brief-text auto-read-only path. Do not model an environment-variable exemption: a caller cannot self-attest external enforcement.

- [ ] **Step 2: Run the new red tests**

Run:

```powershell
& "$NodeHome\node.exe" --test tests/unit/dispatch-flags.test.js tests/unit/lifecycle-regression.test.js
```

Expected: the new Kimi assertions fail because the current adapter accepts read-only while omitting every enforceable read-only argument.

- [ ] **Step 3: Add the policy contract and enforce it at both dispatch entry paths**

In `cli/src/vendors/kimi.js`, make the capability declaration explicit: Kimi prompt mode has `readOnlyEnforcement: 'none'`. Do not claim that native auto permission policy is external enforcement.

In `cli/bin/hopper-dispatch`, add one shared pre-spawn guard used by both `runDispatch` and `runBackgroundDispatch`, after vendor resolution and effective sandbox calculation but before `adapter.args`, `runSubprocessOnce`, `writeOutput`, or `spawnDetached`:

```js
function assertSandboxCanBeEnforced(adapter, adapterOpts) {
  if (adapterOpts.sandbox !== 'read-only') return;
  const enforcement = adapter.capabilities?.features?.permissions?.readOnlyEnforcement;
  if (adapter.name === 'kimi' && enforcement !== 'externally-proven') {
    const error = new Error('Kimi read-only dispatch refused: external read-only enforcement is not proven.');
    error.code = 'E_KIMI_READ_ONLY_UNENFORCEABLE';
    throw error;
  }
}
```

`externally-proven` is reserved for a future adapter capability backed by reviewed, adapter-owned evidence; do not add a CLI flag, environment variable, config knob, or fallback route that can set it. Translate this guard to the existing CLI validation error path so it exits 2 and launches neither sync nor detached work.

- [ ] **Step 4: Run the focused green tests**

Run:

```powershell
& "$NodeHome\node.exe" --test tests/unit/dispatch-flags.test.js tests/unit/lifecycle-regression.test.js
```

Expected: all tests pass; the counter remains zero for each read-only Kimi case and non-read-only Kimi routing remains unchanged.

- [ ] **Step 5: Commit the Lane A enforcement slice**

```powershell
git add cli/bin/hopper-dispatch cli/src/vendors/kimi.js tests/unit/dispatch-flags.test.js tests/unit/lifecycle-regression.test.js
git commit -m "fix: refuse unenforceable Kimi read-only dispatch"
```

### Task 2: Make buffered-process liveness structured and content-free

**Files:**

- Modify: `cli/bin/hopper-runner`
- Modify: `tests/unit/lifecycle-regression.test.js`
- Modify: `tests/unit/progress.test.js`

- [ ] **Step 1: Write failing liveness assertions around a buffered adapter fixture**

Use a local fake buffered adapter/runner fixture, `HOPPER_TEST_ONLY_LIVENESS_INTERVAL_MS=10`, and sentinel strings in its stdout, stderr, prompt, and log. Assert the first liveness event is a transition from `starting` to `running` and has exactly safe fields:

```js
assert.equal(event.phase, 'running');
assert.equal(event.kind, 'process_alive');
assert.equal(event.message, 'Vendor process is still running.');
assert.equal(event.source, 'runner');
assert.equal(event.terminal, false);
assert.equal(event.last_stream_event, 'process_alive');
assert.ok(!JSON.stringify(event).includes('RAW_SENTINEL'));
assert.equal(readFrontmatter(outputMdPath).phase, 'running');
```

Assert no event field contains an arbitrary chunk, byte count, prompt, raw log path, stdout, or stderr. Keep the existing absolute timeout and buffered-output idle-poll behavior in the fixture.

- [ ] **Step 2: Run the red liveness tests**

Run:

```powershell
& "$NodeHome\node.exe" --test tests/unit/lifecycle-regression.test.js tests/unit/progress.test.js
```

Expected: the assertions fail until the runner emits the canonical `process_alive` kind and tests prove the no-content boundary.

- [ ] **Step 3: Emit the single canonical process-alive event**

In `cli/bin/hopper-runner`, retain the existing buffered liveness cadence and terminal guards, but change the buffered liveness record to this fixed shape before updating frontmatter:

```js
event: {
  vendor: fm.adapter || adapterName,
  phase: 'running',
  kind: 'process_alive',
  message: 'Vendor process is still running.',
  source: 'runner',
  terminal: false,
  last_stream_event: 'process_alive',
  last_update: update,
}
```

Only copy `phase`, timestamp, sequence, `last_stream_event`, and `last_update` into frontmatter. Do not call `readFileSync(logPath)`, inspect chunks, or expose a raw field from the liveness timer. Preserve stream-derived heartbeats for streaming adapters and preserve terminal-writer precedence.

- [ ] **Step 4: Run the focused green tests and the full Lane A suite**

Run:

```powershell
& "$NodeHome\node.exe" --test tests/unit/dispatch-flags.test.js tests/unit/lifecycle-regression.test.js tests/unit/progress.test.js
```

Expected: all Lane A tests pass, liveness advances `starting` to `running`, and every raw sentinel remains absent.

- [ ] **Step 5: Sync the mirror, verify it, and commit it with the liveness slice**

```powershell
& "$NodeHome\node.exe" scripts/sync-vendored-plugin.mjs
& "$NodeHome\node.exe" scripts/sync-vendored-plugin.mjs --check
git add cli/bin/hopper-runner tests/unit/lifecycle-regression.test.js tests/unit/progress.test.js plugins/hopper
git commit -m "fix: publish content-free buffered process liveness"
```

## Lane B — raw-output boundary

### Task 3: Close dashboard probe responses and task-detail API data

**Files:**

- Modify: `dashboard/server/routes/actions.js`
- Modify: `dashboard/server/routes/task.js`
- Modify: `tests/unit/dashboard-vendors.test.js`
- Modify: `tests/unit/dashboard-task.test.js`

- [ ] **Step 1: Add red API tests with hostile raw sentinels**

In `tests/unit/dashboard-vendors.test.js`, make the probe child write `RAW_STDOUT_PRIVATE`, `RAW_STDERR_PRIVATE`, a private path, and a token-like string. Replace the current stdout assertion with a closed response assertion:

```js
assert.deepEqual(await response.json(), {
  vendor: 'codex', status: 'done', diagnosticCode: 'none', diagnosticState: 'none',
});
```

Add failed-exit, child-error, and timeout cases asserting the response contains only `vendor`, `status`, `diagnosticCode`, and `diagnosticState`; it must never contain an error message, exit code, stdout, stderr, signal, path, or raw parser text.

In `tests/unit/dashboard-task.test.js`, seed output frontmatter/body/progress with the same sentinels. Assert `readTaskDetail` returns canonical task status, selector/attestation fields, safe inventory, and normalized progress metadata only; assert `_body`, arbitrary frontmatter, raw log references, and raw progress messages are absent.

- [ ] **Step 2: Run the dashboard red tests**

Run:

```powershell
& "$NodeHome\node.exe" --test tests/unit/dashboard-vendors.test.js tests/unit/dashboard-task.test.js
```

Expected: existing probe output forwarding and direct task-frontmatter/body return make the new privacy assertions fail.

- [ ] **Step 3: Project probe execution to closed status diagnostics**

In `dashboard/server/routes/actions.js`, stop accumulating output for API serialization. `runProbe` may drain streams to avoid backpressure, but it must return only these values:

```js
{ vendor: safeVendorName(vendor), status: 'done', diagnosticCode: 'none', diagnosticState: 'none' }
```

For timeout, nonzero exit, child error, malformed vendor input, and unexpected exceptions, map to the allowlisted diagnostic vocabulary from `cli/src/inventory-contract.js` and return a similarly shaped failed response. Do not pass `err.message` to Express or the client. Keep the existing vendor allowlist, one-active-probe-per-vendor guard, timeout, and child kill behavior.

In `dashboard/server/routes/task.js`, construct the response from `readCanonicalAttestation` and an explicit object literal. Only include task id, display status, terminal flag, selector, normalized observed models, resolution, safe catalog, and bounded sanitized event metadata. Do not spread frontmatter, return `_body`, return a sidecar path, or expose raw log content.

- [ ] **Step 4: Run the dashboard green tests**

Run:

```powershell
& "$NodeHome\node.exe" --test tests/unit/dashboard-vendors.test.js tests/unit/dashboard-task.test.js
```

Expected: success, timeout, malformed, and failure responses contain only the closed contract; dashboard task detail has no raw body or frontmatter escape.

- [ ] **Step 5: Commit the dashboard boundary slice**

```powershell
git add dashboard/server/routes/actions.js dashboard/server/routes/task.js tests/unit/dashboard-vendors.test.js tests/unit/dashboard-task.test.js
git commit -m "fix: close dashboard probe and task detail surfaces"
```

### Task 4: Replace adapter error prose with closed diagnostics and retain only `--full` raw retrieval

**Files:**

- Create: `cli/src/adapter-diagnostics.js`
- Modify: `cli/src/vendors/kimi.js`
- Modify: `cli/src/vendors/opencode.js`
- Modify: `cli/src/vendors/claude.js`
- Modify: `cli/bin/hopper-runner`
- Modify: `cli/bin/hopper-dispatch`
- Modify: `cli/src/output.js`
- Modify: `tests/unit/vendors-contract.test.js`
- Modify: `tests/unit/output-writer.test.js`
- Modify: `tests/unit/result-full.test.js`

- [ ] **Step 1: Add red local-fixture parser and rendering tests**

Create local strings only—no installed vendor binaries and no network calls. For Kimi, OpenCode, and Claude, feed private stderr/stdout sentinels to `parseResult` and assert failures return a closed `diagnosticCode` from this set:

```js
['adapter-auth-failed', 'adapter-binary-missing', 'adapter-timeout',
 'adapter-permission-failed', 'adapter-protocol-invalid', 'adapter-unknown-failed']
```

Assert neither `error` nor any public rendering contains the raw sentinel. Add an OpenCode regression fixture proving `exitCode: 0` with text but no authoritative completion is still `unknown-fail`, and completion without usable text is also `unknown-fail`. Add Claude/fable fixtures proving alias classification remains advisory/dynamic and never changes a dispatch gate.

Extend `output-writer.test.js` and `result-full.test.js` with frontmatter, parsed error, log, and sidecar sentinels. Assert default `--result` and all normal writer sections expose diagnostic codes and safe summaries only, while `--result --full` continues to print the complete sidecar and body fallback exactly as its current three full-result tests require.

- [ ] **Step 2: Run the red parser/output tests**

Run:

```powershell
& "$NodeHome\node.exe" --test tests/unit/vendors-contract.test.js tests/unit/output-writer.test.js tests/unit/result-full.test.js
```

Expected: current adapter error interpolation and writer error sections leak fixture text, so the new no-sentinel assertions fail.

- [ ] **Step 3: Add the closed adapter-diagnostic module and use it at every public boundary**

Create `cli/src/adapter-diagnostics.js` with a frozen allowlist and a normalizer that refuses unknown input:

```js
export const ADAPTER_DIAGNOSTIC_CODES = new Set([
  'none', 'adapter-auth-failed', 'adapter-binary-missing', 'adapter-timeout',
  'adapter-permission-failed', 'adapter-protocol-invalid', 'adapter-unknown-failed',
]);

export function adapterDiagnostic(code) {
  return ADAPTER_DIAGNOSTIC_CODES.has(code) ? code : 'adapter-unknown-failed';
}
```

Modify the named adapters so parser outcomes carry `diagnosticCode`, and make any `error` value equal that closed code rather than a raw stderr/stdout fragment. Preserve parser classification logic; only the public diagnostic payload changes. Kimi’s legacy-402 and unknown nonzero branches must not extract `'message'` text. Add OpenCode/Claude diagnostic codes only for the locally tested branches from Step 1.

In `cli/bin/hopper-runner` and `cli/bin/hopper-dispatch`, pass the diagnostic code through terminal/frontmatter/status rendering without appending adapter error prose. In `cli/src/output.js`, replace the `## Vendor error context` fence and COST-LOG text interpolation with the code. Keep raw output only in the existing raw log/sidecar, and leave the explicit `--result --full` reader path unchanged.

- [ ] **Step 4: Run the green parser/output tests**

Run:

```powershell
& "$NodeHome\node.exe" --test tests/unit/vendors-contract.test.js tests/unit/output-writer.test.js tests/unit/result-full.test.js
```

Expected: every public default surface rejects raw sentinels; `--full` still returns the exact full sidecar or body fallback; OpenCode and fable regression fixtures pass unchanged.

- [ ] **Step 5: Sync, verify, and commit the Lane B CLI boundary slice**

```powershell
& "$NodeHome\node.exe" scripts/sync-vendored-plugin.mjs
& "$NodeHome\node.exe" scripts/sync-vendored-plugin.mjs --check
git add cli/src/adapter-diagnostics.js cli/src/vendors/kimi.js cli/src/vendors/opencode.js cli/src/vendors/claude.js cli/bin/hopper-runner cli/bin/hopper-dispatch cli/src/output.js tests/unit/vendors-contract.test.js tests/unit/output-writer.test.js tests/unit/result-full.test.js plugins/hopper
git commit -m "fix: use closed adapter diagnostics at public boundaries"
```

## Lane C — portability, workspace/orchestration, and cache hardening

### Task 5: Make frontmatter and attestation tests deterministic across Windows checkouts and time

**Files:**

- Modify: `tests/unit/claude-code-host.test.js`
- Modify: `tests/unit/codex-plugin.test.js`
- Modify: `tests/unit/handoff-attestation.test.js`
- Modify: `cli/src/handoff-attestation.js`

- [ ] **Step 1: Write the red cross-platform and clock assertions**

In the two frontmatter test files, add CRLF fixture strings and assert frontmatter checks accept both `---\n` and `---\r\n` with the same semantic result. Do not write a checkout-normalizing `.gitattributes` rule first; the parser tests must be correct for either valid line ending.

In `handoff-attestation.test.js`, keep `NOW = '2026-07-21T12:00:00.000Z'`, use a deliberately bounded metadata expiry such as `2026-07-22T00:00:00.000Z`, and pass the deterministic `NOW` to both calls that finalise an attestation. Assert the tests produce `alias-resolved` and `alias-no-runtime-metadata` regardless of the machine’s current date.

- [ ] **Step 2: Run the red portability tests**

Run:

```powershell
& "$NodeHome\node.exe" --test tests/unit/claude-code-host.test.js tests/unit/codex-plugin.test.js tests/unit/handoff-attestation.test.js
```

Expected: the CRLF and expired-live-clock checks fail before the test/clock contract is implemented.

- [ ] **Step 3: Normalize only test input and add a test-only clock seam with the production default preserved**

In both frontmatter tests, normalize assertion input with this local helper before applying existing YAML regexes:

```js
function normalizedNewlines(text) {
  return String(text).replace(/\r\n/g, '\n');
}
```

Use it only in tests; do not mass-rewrite commands, skills, or add `.gitattributes` unless a later test proves the runtime parser itself cannot read CRLF.

In `cli/src/handoff-attestation.js`, add optional `now = new Date()` plumbing from `finalizeTerminalAttestation` into `buildCanonicalTerminalRecord` and then `resolveAttestation`. The production call path must omit this option and therefore preserve the exact current live-clock expiry behavior:

```js
export function finalizeTerminalAttestation({ /* existing fields */, now = new Date() }) {
  // ...
  const record = buildCanonicalTerminalRecord({ fm, startupSnapshot, parsed, completion, now });
}
```

Tests pass `now: NOW`; production callers do not. Do not change selector-metadata validation rules, expiry comparisons, or default timestamps.

- [ ] **Step 4: Run the green portability tests**

Run:

```powershell
& "$NodeHome\node.exe" --test tests/unit/claude-code-host.test.js tests/unit/codex-plugin.test.js tests/unit/handoff-attestation.test.js
```

Expected: all five accepted-baseline failures are eliminated without changing production expiry behavior.

- [ ] **Step 5: Commit the deterministic-test slice**

```powershell
git add cli/src/handoff-attestation.js tests/unit/claude-code-host.test.js tests/unit/codex-plugin.test.js tests/unit/handoff-attestation.test.js
git commit -m "test: make frontmatter and attestation fixtures deterministic"
```

### Task 6: Stabilize Windows background cleanup and validate explicit workspace overrides

**Files:**

- Create: `tests/helpers/wait-for-pid-exit.js`
- Modify: `tests/unit/background.test.js`
- Modify: `tests/unit/stop-job.test.js`
- Modify: `tests/unit/lifecycle-regression.test.js`
- Modify: `cli/bin/hopper-dispatch`
- Modify: `dashboard/server/lib/hopper-dir.js`
- Modify: `tests/unit/progress-cli.test.js`
- Modify: `tests/unit/dashboard-server.test.js`

- [ ] **Step 1: Add failing cleanup and invalid-override tests**

Create the test helper with a bounded poll and retrying removal function:

```js
export async function waitForPidExit(pid, { isAlive, timeoutMs = 5000, intervalMs = 25 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (isAlive(pid) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, intervalMs));
  assert.equal(isAlive(pid), false, `PID ${pid} remained alive after ${timeoutMs}ms`);
}
```

Use it in every test in the three named background files that starts/stops a real child, then retry `rmSync(tmp, { recursive: true, force: true })` only after the child is confirmed dead. Tests must fail on an unreaped child rather than masking it with `force: true`.

Add CLI and dashboard tests where `HOPPER_DIR` exists but is a regular file, a directory without `handoffs/`, or a global-cache-like `.hopper` directory. Each explicit override must reject with the existing no-workspace behavior and must not ancestor-fallback to a different workspace.

- [ ] **Step 2: Run the red cleanup/workspace tests**

Run:

```powershell
& "$NodeHome\node.exe" --test tests/unit/background.test.js tests/unit/stop-job.test.js tests/unit/lifecycle-regression.test.js tests/unit/progress-cli.test.js tests/unit/dashboard-server.test.js
```

Expected: invalid explicit overrides currently pass existence-only validation and child cleanup is not condition-based.

- [ ] **Step 3: Implement structural workspace validation without changing fallback semantics**

In `cli/bin/hopper-dispatch`, replace the explicit `existsSync(HOPPER_DIR)` acceptance with one shared predicate that requires a directory containing `handoffs/`. Use the same predicate for ancestor candidates. In `dashboard/server/lib/hopper-dir.js`, apply the same explicit-override rule: an invalid `HOPPER_DIR` returns `null` and does not fall back.

The predicate’s required shape is:

```js
function isHopperWorkspace(candidate) {
  return existsSync(candidate) && statSync(candidate).isDirectory()
    && existsSync(join(candidate, 'handoffs')) && statSync(join(candidate, 'handoffs')).isDirectory();
}
```

Keep current search-depth limits and do not create missing directories during validation. Apply the wait helper only to tests; do not add arbitrary sleeps or product retry behavior.

- [ ] **Step 4: Run the green cleanup/workspace tests**

Run:

```powershell
& "$NodeHome\node.exe" --test tests/unit/background.test.js tests/unit/stop-job.test.js tests/unit/lifecycle-regression.test.js tests/unit/progress-cli.test.js tests/unit/dashboard-server.test.js
```

Expected: all real-child tests wait until exit before cleanup, and only a structurally valid explicit workspace is accepted.

- [ ] **Step 5: Commit the cleanup/workspace slice**

```powershell
git add tests/helpers/wait-for-pid-exit.js tests/unit/background.test.js tests/unit/stop-job.test.js tests/unit/lifecycle-regression.test.js cli/bin/hopper-dispatch dashboard/server/lib/hopper-dir.js tests/unit/progress-cli.test.js tests/unit/dashboard-server.test.js
git commit -m "fix: validate Hopper workspaces and stabilize Windows cleanup"
```

### Task 7: Unify terminal predicates and harden the cache parent directory

**Files:**

- Modify: `cli/bin/hopper-dispatch`
- Modify: `cli/src/cache.js`
- Modify: `tests/unit/progress-watch.test.js`
- Modify: `tests/unit/cache.test.js`

- [ ] **Step 1: Add red terminal-predicate and cache-parent tests**

Add `progress-watch` cases for every status in `done`, `failed`, `timeout`, `cancelled`, and `orphaned`, with and without `terminal_event_emitted`. Assert `--watch` and `--watch-events` make the same terminal/nonterminal decision for each fixture.

Add cache filesystem seam tests that simulate parent-directory creation and hardening. Assert a parent hardening failure returns `inventory-cache-parent-owner-only-failed`, writes no payload and no lock, and leaves active bytes unchanged. Add fixtures with unknown root, vendor, and nested provenance fields; ordinary v1 writes preserve them additively except the explicit sensitive-field denylist. Malformed and future-version bytes must remain byte-identical and ordinary writes must return their existing closed diagnostic.

- [ ] **Step 2: Run the red predicate/cache tests**

Run:

```powershell
& "$NodeHome\node.exe" --test tests/unit/progress-watch.test.js tests/unit/cache.test.js
```

Expected: the duplicated watcher terminal checks diverge for at least one fixture, and cache parent creation occurs before owner-only hardening.

- [ ] **Step 3: Extract one terminal predicate and enforce parent-first cache security**

Export one terminal predicate from the existing CLI/shared module, requiring both an allowlisted terminal status and `terminal_event_emitted === true`:

```js
export function isTerminalTaskFrontmatter(fm) {
  return Boolean(fm?.terminal_event_emitted) && TERMINAL_TASK_STATUSES.has(fm.status);
}
```

Route both `--watch` completion and `runWatchEvents` through it; do not alter replay, `--once`, notifications, or event sequencing.

In `cli/src/cache.js`, create/harden the cache parent before creating either lock or temp. Reuse the existing owner-only filesystem seam, make failure closed, and add the new diagnostic code to the safe inventory diagnostic allowlist. Preserve these exact unknown-field rules:

```js
// v1: retain unknown root, vendor, and provenance keys during read/merge/write.
// sensitive legacy keys: strip at every supported level.
// malformed or future version: do not parse-for-rewrite; leave bytes untouched.
```

Do not change cache version, auto-migrate a future version, or expose unknown fields through `projectInventoryEntry`.

- [ ] **Step 4: Run the green predicate/cache tests**

Run:

```powershell
& "$NodeHome\node.exe" --test tests/unit/progress-watch.test.js tests/unit/cache.test.js
```

Expected: both watchers agree on all terminal cases; parent hardening precedes lock/temp/payload writes; unknown-field and future-cache rules pass.

- [ ] **Step 5: Sync, verify, and commit the orchestration/cache slice**

```powershell
& "$NodeHome\node.exe" scripts/sync-vendored-plugin.mjs
& "$NodeHome\node.exe" scripts/sync-vendored-plugin.mjs --check
git add cli/bin/hopper-dispatch cli/src/cache.js tests/unit/progress-watch.test.js tests/unit/cache.test.js plugins/hopper
git commit -m "fix: unify terminal watchers and harden cache parents"
```

### Task 8: Add locally testable OpenCode/Claude diagnostic-code coverage and complete Lane C verification

**Files:**

- Modify: `cli/src/vendors/opencode.js`
- Modify: `cli/src/vendors/claude.js`
- Modify: `tests/unit/vendors-contract.test.js`
- Modify: `tests/unit/model-attestation-contract.test.js`
- Modify: `tests/unit/vendored-plugin-sync.test.js` only if the mirror inventory itself changes

- [ ] **Step 1: Add independent local parser fixtures before changing parser diagnostics**

Use literal OpenCode event streams and Claude JSON envelopes in `vendors-contract.test.js`; no CLI command, cache, account state, or network fixture is allowed. Test that malformed/empty/error envelopes map to a closed diagnostic code and do not include raw parser text. Reassert:

```js
assert.equal(opencodeAdapter.parseResult(completedWithoutText).status, 'unknown-fail');
assert.equal(opencodeAdapter.parseResult(textWithoutCompletion).status, 'unknown-fail');
assert.equal(classify('fable', selectorMetadata()).selectorKind, 'alias');
assert.equal(resolve({ effectiveSelector: 'fable' }).resolutionStatus, 'unverified');
```

If a proposed Claude or OpenCode diagnostic branch cannot be proven with one of these local fixtures, do not add that branch in this remediation.

- [ ] **Step 2: Run the red parser-contract tests**

Run:

```powershell
& "$NodeHome\node.exe" --test tests/unit/vendors-contract.test.js tests/unit/model-attestation-contract.test.js
```

Expected: new closed-code/no-raw assertions fail before the parser changes from Task 4 are complete.

- [ ] **Step 3: Complete only fixture-proven parser diagnostic mappings**

Implement the local-fixture-proven OpenCode and Claude mappings through `adapterDiagnostic`; retain their current output-text and attestation extraction logic. Do not add model probes, vendor availability checks, a fable alias gate, or a successful result without OpenCode completion plus text.

- [ ] **Step 4: Run the focused green parser-contract tests**

Run:

```powershell
& "$NodeHome\node.exe" --test tests/unit/vendors-contract.test.js tests/unit/model-attestation-contract.test.js
```

Expected: all fixture-proven diagnostics are closed; OpenCode fail-closed and fable non-gating assertions pass.

- [ ] **Step 5: Perform complete verification, mirror synchronization, and final diff review**

Run:

```powershell
& "$NodeHome\node.exe" scripts/sync-vendored-plugin.mjs
& "$NodeHome\node.exe" scripts/sync-vendored-plugin.mjs --check
& "$NodeHome\node.exe" --test tests/unit/dispatch-flags.test.js tests/unit/lifecycle-regression.test.js tests/unit/progress.test.js tests/unit/dashboard-vendors.test.js tests/unit/dashboard-task.test.js tests/unit/vendors-contract.test.js tests/unit/output-writer.test.js tests/unit/result-full.test.js tests/unit/claude-code-host.test.js tests/unit/codex-plugin.test.js tests/unit/handoff-attestation.test.js tests/unit/background.test.js tests/unit/stop-job.test.js tests/unit/progress-cli.test.js tests/unit/progress-watch.test.js tests/unit/cache.test.js tests/unit/model-attestation-contract.test.js tests/unit/vendored-plugin-sync.test.js
& "$NodeHome\npm.cmd" test
git diff --check
git status --short
```

Expected: targeted tests, mirror check, and the full physical-Node suite pass with no unexpected skips or failures. The historic NVM-symlink `ENOENT` worker anomaly is not a product failure and must not be reproduced or worked around in repository code.

- [ ] **Step 6: Commit final mirror changes if synchronization produced any**

```powershell
git add plugins/hopper tests/unit/vendors-contract.test.js tests/unit/model-attestation-contract.test.js tests/unit/vendored-plugin-sync.test.js
git commit -m "test: preserve parser contracts in vendored plugin"
```

Skip this commit only when `git status --short` is empty after the prior commits; do not create an empty commit.

## Final acceptance checklist

- [ ] Every read-only Kimi path refuses before any adapter or background-runner spawn unless reviewed adapter-owned evidence marks enforcement `externally-proven`.
- [ ] Buffered liveness advances to `running` with a fixed `process_alive` record and no content-derived field.
- [ ] Dashboard probe/task APIs and default CLI results expose only allowlisted state/diagnostic data; `--result --full` remains the explicit raw-output path.
- [ ] No adapter parser error or writer/COST-LOG text contains a raw stderr/stdout fragment.
- [ ] CRLF tests and selector-metadata fixtures are deterministic; production expiry behavior is unchanged.
- [ ] Explicit `HOPPER_DIR` must be a workspace containing `handoffs/`; both watcher modes share the same terminal predicate.
- [ ] Windows background tests wait for process exit before retrying temp cleanup.
- [ ] Cache parent hardening fails closed, forward-compatible unknown fields are preserved internally, and malformed/future cache bytes remain untouched.
- [ ] OpenCode completion-plus-text and Claude/fable dynamic/non-gating behavior remain proven by local fixtures.
- [ ] `plugins/hopper` is synchronized and `tests/unit/vendored-plugin-sync.test.js` passes.
