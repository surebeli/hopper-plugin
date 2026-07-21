# Model Selector Attestation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add auditable, privacy-safe model-selector attestation for Claude, OpenCode, and Kimi while preserving one-spawn dispatch and the existing file-backed handoff/cache contracts.

**Architecture:** The implementation separates lossy selector validation from strict runtime identity comparison, then carries a sanitized selector/catalog snapshot from dispatch startup through one shared terminal finalizer. A diagnostics-aware v1 cache reader and one public inventory projection feed every CLI and dashboard surface, so raw paths, notes, and probe errors cannot escape through a secondary renderer. Root cli files remain the release source and the vendored plugin copy is synchronized after each root change set.

**Tech Stack:** Node.js ES modules, JSDoc contracts, node:test, flat YAML frontmatter, JSONL, Express, React/TypeScript, Vite, Git.

---

## Frozen baseline and execution boundary

This is a preimplementation plan. It ends after the implementation commits and verification commands described below; it does not itself run those commands or change product files.

The target baseline is commit 0db41ee4b6292f7e706d8903482895925abd339b. The frozen design is docs/superpowers/specs/2026-07-21-model-selector-attestation-design.md at that commit, SHA-256 0160EBBAA774CD20330ED9F757B7359AB983443DFAB3A02EABB821A975E4217A.

The normal writing-plans dedicated-worktree rule has one deliberate exception: F:\workspace\ai\hopper-plugin already contains a completed, uncommitted lifecycle-hardening patch consisting of 18 tracked modifications and 2 untracked tests. Task 1 commits that patch exactly as found before any model-attestation work. It is not to be rebased, rewritten, mixed into later commits, or treated as attestation implementation.

Every target-repository freeze, status, diff, hash, staging, and commit command in this plan names the target explicitly with git -C F:\workspace\ai\hopper-plugin. Before implementation, assert both repository roots:

~~~powershell
$target = 'F:\workspace\ai\hopper-plugin'
$protocol = 'F:\workspace\project\thunderfire-audio'
if ((git -C $target rev-parse --show-toplevel) -ne $target) { throw 'wrong target repository' }
if ((git -C $protocol rev-parse --show-toplevel) -ne $protocol) { throw 'wrong protocol repository' }
git -C $target rev-parse HEAD
git -C $target status --short
git -C $protocol status --short
~~~

Expected: target begins at 0db41ee4b6292f7e706d8903482895925abd339b with only the declared lifecycle patch; the protocol repository is inspected only for the recorded freeze and is never edited by this plan. All product tests use inert fixtures, a temporary HOPPER_CACHE_DIR, a fake command resolver, and a temporary HOPPER_DIR. No test invokes a real account, user Kimi/Claude configuration, live entitlement, or network catalog.

## File structure map

| Path | Responsibility |
| --- | --- |
| cli/src/types.js and plugins/hopper/cli/src/types.js | JSDoc contracts for selector metadata, runtime attestation, cache read outcomes, and terminal handoff fields. |
| cli/src/model-normalize.js and plugins/hopper/cli/src/model-normalize.js | Existing lossy selector-validation helpers plus the new, separate strict runtime comparator. |
| cli/src/model-attestation.js and plugins/hopper/cli/src/model-attestation.js | New zero-spawn metadata-envelope validation, selector classification, diagnostic precedence, and resolution truth table. |
| cli/src/inventory-contract.js and plugins/hopper/cli/src/inventory-contract.js | New closed-enum catalog normalization and the only public inventory projection. |
| cli/src/handoff-attestation.js and plugins/hopper/cli/src/handoff-attestation.js | New startup snapshot builder, JSON-scalar handling, exact-once finalizer, canonical reader, and orphan repair. |
| cli/src/vendors/claude.js, cli/src/vendors/opencode.js, cli/src/vendors/kimi.js and mirrored files | Structured modelAttestation extraction only from approved result fields. |
| cli/src/dispatch.js, cli/src/background.js, cli/src/progress.js, cli/bin/hopper-runner and mirrored files | Pass the optional parsed evidence without synthesis; seed snapshot, append one terminal event, then atomically write canonical frontmatter. |
| cli/src/cache.js, cli/src/setup.js, cli/src/vendor-probe/claude.js, cli/src/vendor-probe/opencode.js, cli/src/vendor-probe/kimi.js and mirrored files | v1 additive cache merge, explicit recovery transaction, sanitized probe provenance, and readiness consumption. |
| cli/bin/hopper-dispatch and plugins/hopper/cli/bin/hopper-dispatch | Public commands, recover-cache parsing, shared canonical result/progress reading, and redacted output. |
| dashboard/server/routes/vendors.js | Inventory API uses only the shared safe projection and permanent direct-record shims. |
| dashboard/client/src/lib/types.ts and dashboard/client/src/components/VendorCard.tsx | Null-safe v2 client shape and safe source/binary/diagnostic rendering. |
| docs/cookbook.md and dashboard/README.md | Operator-facing vocabulary, recover-cache procedure, compatibility behavior, and non-leaking rollback description. |
| tests/unit/lifecycle-regression.test.js, tests/unit/subprocess.test.js, tests/unit/stop-job.test.js, tests/unit/vendors-contract.test.js, tests/integration/runner-single-spawn.test.js, tests/integration/process-tree-posix.test.js | Existing completed lifecycle-hardening evidence, committed unchanged first. |
| tests/unit/model-attestation-contract.test.js | New metadata union, strict comparator, provenance, diagnostic precedence, and resolution truth-table fixtures. |
| tests/unit/model-attestation-parser.test.js | New Claude/OpenCode/Kimi parser fixtures and pass-through checks. |
| tests/unit/handoff-attestation.test.js, tests/unit/result-full.test.js, tests/unit/progress-cli.test.js, tests/unit/progress.test.js, tests/unit/background.test.js | New scalar, finalization, reader, crash-window, and orphan-repair fixtures. |
| tests/unit/cache.test.js, tests/unit/dashboard-vendors.test.js, tests/unit/opencode-plugin-static.test.js, tests/unit/opencode-host.test.js | Cache-recovery, recursive privacy, inventory version, and bounded OpenCode execution-isolation evidence. |
| scripts/sync-vendored-plugin.mjs and tests/unit/vendored-plugin-sync.test.js | Byte-level root-to-vendored CLI synchronization guard. |

### Task 1: Commit the completed lifecycle hardening baseline without model-attestation changes

**Files:**

- Modify only through staging and commit: the already changed files listed in the frozen inventory.
- Test: tests/unit/subprocess.test.js, tests/unit/stop-job.test.js, tests/unit/vendors-contract.test.js, tests/unit/lifecycle-regression.test.js, tests/integration/runner-single-spawn.test.js, tests/integration/process-tree-posix.test.js.

- [ ] **Step 1: Freeze and enumerate the exact pre-existing patch before staging it.**

Run:

~~~powershell
git -C F:\workspace\ai\hopper-plugin status --short
git -C F:\workspace\ai\hopper-plugin diff --stat
git -C F:\workspace\ai\hopper-plugin diff -- cli/bin/hopper-runner cli/src/background.js cli/src/progress.js cli/src/subprocess.js cli/src/types.js cli/src/vendors/claude.js cli/src/vendors/opencode.js plugins/hopper/cli/bin/hopper-runner plugins/hopper/cli/src/background.js plugins/hopper/cli/src/progress.js plugins/hopper/cli/src/subprocess.js plugins/hopper/cli/src/types.js plugins/hopper/cli/src/vendors/claude.js plugins/hopper/cli/src/vendors/opencode.js tests/integration/runner-single-spawn.test.js tests/unit/stop-job.test.js tests/unit/subprocess.test.js tests/unit/vendors-contract.test.js
git -C F:\workspace\ai\hopper-plugin diff --no-index -- NUL tests/integration/process-tree-posix.test.js
git -C F:\workspace\ai\hopper-plugin diff --no-index -- NUL tests/unit/lifecycle-regression.test.js
~~~

Expected: exactly 18 tracked paths and the two named untracked tests are shown. The diff demonstrates first-wins timeout cleanup, structured process-cleanup diagnostics, OpenCode authoritative completion detection, Claude authoritative-result priority, runner close-event finalization, heartbeat/liveness metadata, and matching files under plugins/hopper/cli.

The pre-existing behavior being verified, not rewritten, includes the following concrete interfaces:

~~~js
// cli/src/subprocess.js
{ timedOut, timeoutReason, processCleanup, durationMs }

// cli/src/progress.js
findLatestVendorProgressEvent(chunk)

// cli/src/vendors/opencode.js
opencodeAnswerCompleted(log)
~~~

- [ ] **Step 2: Run the already-authored lifecycle regression suite before committing.**

Run:

~~~powershell
Set-Location F:\workspace\ai\hopper-plugin
node --test tests/unit/subprocess.test.js tests/unit/stop-job.test.js tests/unit/vendors-contract.test.js tests/unit/lifecycle-regression.test.js tests/integration/runner-single-spawn.test.js tests/integration/process-tree-posix.test.js
~~~

Expected: node:test exits 0 with # fail 0. POSIX-only process-group assertions may be reported as skipped on Windows.

Run the focused liveness evidence separately:

~~~powershell
Set-Location F:\workspace\ai\hopper-plugin
node --test --test-name-pattern "grok and claude declare bufferedOutput|other adapters do NOT declare bufferedOutput|buffered vendor emits non-sensitive process-alive liveness" tests/unit/vendors-contract.test.js tests/integration/runner-single-spawn.test.js
~~~

Expected: the Claude declaration proves the shared buffered branch is enabled for Claude; the Kimi membership in the non-buffered assertion proves Kimi emits no synthetic process_alive liveness marker; the buffered fake-process test proves the shared marker is non-sensitive, stops before terminalization, and never extends the ceiling. This is fixture evidence, not a live Claude or Kimi invocation.

- [ ] **Step 3: Stage only the declared lifecycle patch, including its two new tests.**

Run:

~~~powershell
git -C F:\workspace\ai\hopper-plugin add -- cli/bin/hopper-runner cli/src/background.js cli/src/progress.js cli/src/subprocess.js cli/src/types.js cli/src/vendors/claude.js cli/src/vendors/opencode.js plugins/hopper/cli/bin/hopper-runner plugins/hopper/cli/src/background.js plugins/hopper/cli/src/progress.js plugins/hopper/cli/src/subprocess.js plugins/hopper/cli/src/types.js plugins/hopper/cli/src/vendors/claude.js plugins/hopper/cli/src/vendors/opencode.js tests/integration/runner-single-spawn.test.js tests/integration/process-tree-posix.test.js tests/unit/stop-job.test.js tests/unit/subprocess.test.js tests/unit/vendors-contract.test.js tests/unit/lifecycle-regression.test.js
git -C F:\workspace\ai\hopper-plugin diff --cached --name-only
git -C F:\workspace\ai\hopper-plugin diff --cached --check
~~~

Expected: the staged-name list contains exactly the 20 paths above and diff --check has no output.

- [ ] **Step 4: Commit the lifecycle patch as an isolated historical baseline.**

Run:

~~~powershell
git -C F:\workspace\ai\hopper-plugin commit -m "fix: harden vendor lifecycle completion"
git -C F:\workspace\ai\hopper-plugin show --stat --oneline HEAD
git -C F:\workspace\ai\hopper-plugin status --short
~~~

Expected: one commit contains only the 20 lifecycle paths; no model-attestation path is present and the worktree is clean before Task 2 begins.

### Task 2: Define strict runtime identity and zero-spawn selector classification

**Files:**

- Create: cli/src/model-attestation.js; plugins/hopper/cli/src/model-attestation.js.
- Modify: cli/src/types.js:74-101; cli/src/model-normalize.js:11-101; cli/src/model-check.js:42-172; cli/src/dispatch.js:406-501; and the mirrored files.
- Test: tests/unit/model-attestation-contract.test.js; tests/unit/model-normalize.test.js; tests/unit/model-check.test.js.

- [ ] **Step 1: Write failing strict-comparison and schema fixtures.**

Create tests that import the proposed boundaries and prove that selector validation still calls modelKeysMatch while runtime comparison never does:

~~~js
import {
  compareRuntimeIdentity,
  parseStrictProviderModel,
} from '../../cli/src/model-normalize.js';
import {
  classifyEffectiveSelector,
  resolveAttestation,
  validateSelectorMetadataEnvelope,
} from '../../cli/src/model-attestation.js';

test('strict provider/model comparison rejects namespace and bare ambiguity', () => {
  assert.equal(parseStrictProviderModel('openai/gpt-5'), null);
  assert.equal(compareRuntimeIdentity('opencode',
    { identity_kind: 'provider-model', provider: 'openai', model: 'gpt-5' },
    'openai/gpt-5').kind, 'match');
  assert.equal(compareRuntimeIdentity('opencode',
    { identity_kind: 'provider-model', provider: 'openai', model: 'gpt-5' },
    'gpt-5').kind, 'uncomparable');
});
~~~

Add fixtures for: Claude opaque exact and non-match; OpenCode same pair and different provider; any alias identity; auto record; duplicate literal; cross-vendor kind; missing or extra identity members; sentinel/dead/unregistered provider; schema mismatch; binding mismatch; expiry; missing source; fable, sonnet, sonnet[1m], best, default, opusplan, and an unlisted [N_unit] literal. Assert malformed metadata yields selector_kind unknown, resolution_status unverified, and diagnostic_code metadata-envelope-malformed before the strict comparator is reached.

- [ ] **Step 2: Run the new tests and confirm the red state names missing exports.**

Run:

~~~powershell
Set-Location F:\workspace\ai\hopper-plugin
node --test tests/unit/model-attestation-contract.test.js
~~~

Expected: failure includes that cli/src/model-attestation.js cannot be imported or that compareRuntimeIdentity is not exported. Existing model-normalize and model-check tests remain unchanged at this point.

- [ ] **Step 3: Add the contracts and one authoritative comparison boundary.**

Extend TaskOutput in types.js with optional modelAttestation and document SelectorMetadataEnvelope, ExpectedRuntimeIdentity, CatalogProvenance, and resolution fields. Add these explicit exports to model-normalize.js:

~~~js
export function parseStrictProviderModel(value) {
  if (typeof value !== 'string') return null;
  const parts = value.trim().split('/');
  if (parts.length !== 2 || parts.some((part) => part.length === 0)) return null;
  return { provider: parts[0], model: parts[1] };
}

export function compareRuntimeIdentity(vendor, expected, observed) {
  if (vendor === 'claude' && expected?.identity_kind === 'opaque-id') {
    if (typeof observed !== 'string' || !observed.trim()) return { kind: 'uncomparable' };
    return { kind: observed.trim() === expected.id.trim() ? 'match' : 'non-match' };
  }
  if (vendor === 'opencode' && expected?.identity_kind === 'provider-model') {
    const actual = parseStrictProviderModel(observed);
    if (!actual) return { kind: 'uncomparable' };
    return {
      kind: actual.provider === expected.provider.trim() && actual.model === expected.model.trim()
        ? 'match'
        : 'non-match',
    };
  }
  return { kind: 'uncomparable' };
}
~~~

Keep normalizeModel and modelKeysMatch unchanged as selector-validation functions. In the new model-attestation.js, validate only schema_version 1 envelopes, exact vendor/adapter/catalog binding, accepted validity and time range, full literal records, and the vendor-discriminated union. The classifier must return auto before envelope lookup when effectiveSelector is null. The resolver must return exact only after one strict match, mismatch only when every observed value is valid/comparable/non-matching, alias-resolved only for a valid alias with observed evidence, config-only only without runtime evidence and with config catalog evidence, and unverified otherwise.

Use the explicit diagnostic precedence array:

~~~js
export const DIAGNOSTIC_PRECEDENCE = Object.freeze([
  'runtime-model-metadata-malformed',
  'runtime-model-metadata-conflict',
  'metadata-envelope-malformed',
  'selector-metadata-cache-schema-unsupported',
  'selector-metadata-cache-adapter-mismatch',
  'selector-metadata-cache-expired',
  'selector-metadata-cache-missing',
  'inventory-cache-version-unsupported',
  'inventory-cache-malformed',
  'inventory-cache-recovery-backup-create-failed',
  'inventory-cache-recovery-replace-failed',
  'inventory-cache-recovery-durability-unknown',
  'capability-failed',
  'probe-failed',
  'catalog-unavailable',
  'runtime-model-metadata-absent',
  'unknown',
]);
~~~

The resolver result shape is fixed for both writers:

~~~js
return {
  selectorKind: classification.selectorKind,
  resolutionStatus: 'exact',
  resolutionDetail: 'concrete-runtime-exact',
  diagnosticCode: chooseDiagnosticCode(diagnostics),
  eventFields: { selector_kind: classification.selectorKind, resolution_status: 'exact' },
  frontmatterFields: { selector_kind: classification.selectorKind, resolution_status: 'exact' },
};
~~~

Make evaluateModelCheck return selector_valid as verified, catalog-only, not-found, or effort-spliced and runtime_attestation as not-run. It must retain its existing legacy verdict and exit code.

- [ ] **Step 4: Run the focused contract suite and existing selector suites.**

Run:

~~~powershell
Set-Location F:\workspace\ai\hopper-plugin
node --test tests/unit/model-attestation-contract.test.js tests/unit/model-normalize.test.js tests/unit/model-check.test.js
~~~

Expected: # fail 0. The strict fixtures demonstrate no namespace stripping, no separator collapse, no tail match, no alias expansion, and no cross-vendor identity kind.

- [ ] **Step 5: Synchronize this root CLI change and commit it.**

Run:

~~~powershell
Set-Location F:\workspace\ai\hopper-plugin
node scripts/sync-vendored-plugin.mjs
git -C F:\workspace\ai\hopper-plugin add -- cli/src/types.js cli/src/model-normalize.js cli/src/model-check.js cli/src/model-attestation.js plugins/hopper/cli/src/types.js plugins/hopper/cli/src/model-normalize.js plugins/hopper/cli/src/model-check.js plugins/hopper/cli/src/model-attestation.js tests/unit/model-attestation-contract.test.js
git -C F:\workspace\ai\hopper-plugin diff --cached --check
git -C F:\workspace\ai\hopper-plugin commit -m "feat: classify model selectors strictly"
~~~

Expected: one contract-only commit; it does not parse vendor output, write handoffs, or alter cache persistence.

### Task 3: Extract actual runtime models only from approved vendor result evidence

**Files:**

- Modify: cli/src/vendors/claude.js:166-245; cli/src/vendors/opencode.js:109-286; cli/src/vendors/kimi.js:109-153; cli/src/types.js:74-101; and mirrored files.
- Test: tests/unit/model-attestation-parser.test.js; tests/unit/vendors-contract.test.js; tests/unit/lifecycle-regression.test.js.

- [ ] **Step 1: Write parser fixtures before modifying adapters.**

Create parser fixtures using only terminal JSON objects. For Claude, prove top-level modelUsage own keys win and the fixed fallback order is terminalEnvelope.result.modelUsage, terminalEnvelope.usage.modelUsage, then terminalEnvelope.usage.model_usage. Prove empty maps, arrays, invalid keys, scalar model, nested entry.model, request echoes, prose, and a later valid path after an earlier valid map do not create merged evidence.

Use this success assertion:

~~~js
assert.deepEqual(result.modelAttestation, {
  observedModels: ['claude-opus-4-6', 'claude-sonnet-4-6'],
  source: 'claude.result.modelUsage.keys',
  observedAt: '2026-07-21T00:00:00.000Z',
});
~~~

For OpenCode, place the terminal provider/model pair in the versioned adapter fixture metadata and the matching structured terminal result fixture. Assert that a provider-only object, model-only object, bare model, request echo, text event, malformed pair, or unapproved result version returns no modelAttestation. For Kimi, assert parseResult remains config-only without a newly documented stable actual-model result field.

- [ ] **Step 2: Run the parser suite to obtain the red failure.**

Run:

~~~powershell
Set-Location F:\workspace\ai\hopper-plugin
node --test tests/unit/model-attestation-parser.test.js
~~~

Expected: failures state that modelAttestation is absent from parsed adapter output.

- [ ] **Step 3: Add only approved extractors and pass the optional field through.**

Add a Claude helper whose candidate list is fixed and ordered:

~~~js
const CLAUDE_MODEL_USAGE_PATHS = Object.freeze([
  { path: ['modelUsage'], source: 'claude.result.modelUsage.keys' },
  { path: ['result', 'modelUsage'], source: 'claude.result.result.modelUsage.keys' },
  { path: ['usage', 'modelUsage'], source: 'claude.result.usage.modelUsage.keys' },
  { path: ['usage', 'model_usage'], source: 'claude.result.usage.model_usage.keys' },
]);

function valueAtPath(value, path) {
  return path.reduce((current, key) => current && typeof current === 'object' ? current[key] : undefined, value);
}

function ownNonEmptyStringKeys(map) {
  if (!map || Array.isArray(map) || typeof map !== 'object') return [];
  return Object.keys(map).filter((key) => key.trim().length > 0);
}

function firstSeenUniqueStringArray(values) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value.length > 0))];
}

function extractClaudeModelAttestation(envelope, observedAt) {
  for (const candidate of CLAUDE_MODEL_USAGE_PATHS) {
    const map = valueAtPath(envelope, candidate.path);
    const models = ownNonEmptyStringKeys(map);
    if (models.length > 0 && acceptsClaudeModelUsagePath(envelope, candidate.source)) {
      return { observedModels: firstSeenUniqueStringArray(models), source: candidate.source, observedAt };
    }
  }
  return undefined;
}
~~~

Define acceptsClaudeModelUsagePath as a local boolean predicate over the versioned Claude adapter metadata passed with the terminal fixture; it accepts only the four source strings in the array and the envelope version declared by that metadata. Implement the OpenCode extractor as metadata-gated structured pair parsing, yielding exactly one normalized provider/model string only when the accepted terminal-result fixture identifies both components. Do not add a generic object walk, text search, or request-based fallback. Have parseResult attach modelAttestation only on successful parsed results. The existing liveness and completion classifications remain intact.

- [ ] **Step 4: Confirm parser and lifecycle behavior together.**

Run:

~~~powershell
Set-Location F:\workspace\ai\hopper-plugin
node --test tests/unit/model-attestation-parser.test.js tests/unit/vendors-contract.test.js tests/unit/lifecycle-regression.test.js
~~~

Expected: # fail 0; Claude keeps authoritative-success-over-auth-shaped-log behavior, OpenCode still rejects partial completion, and Kimi returns no invented actual ID.

- [ ] **Step 5: Mirror and commit the parser-only change.**

Run:

~~~powershell
Set-Location F:\workspace\ai\hopper-plugin
node scripts/sync-vendored-plugin.mjs
git -C F:\workspace\ai\hopper-plugin add -- cli/src/types.js cli/src/vendors/claude.js cli/src/vendors/opencode.js cli/src/vendors/kimi.js plugins/hopper/cli/src/types.js plugins/hopper/cli/src/vendors/claude.js plugins/hopper/cli/src/vendors/opencode.js plugins/hopper/cli/src/vendors/kimi.js tests/unit/model-attestation-parser.test.js
git -C F:\workspace\ai\hopper-plugin diff --cached --check
git -C F:\workspace\ai\hopper-plugin commit -m "feat: extract runtime model evidence"
~~~

Expected: a parser-only commit with no terminal writer or public-renderer change.

### Task 4: Build a single startup snapshot and exact-once terminal finalizer

**Files:**

- Create: cli/src/handoff-attestation.js; plugins/hopper/cli/src/handoff-attestation.js.
- Modify: cli/src/background.js:38-134 and 459-502; cli/src/progress.js:89-166; cli/src/dispatch.js:406-501; cli/bin/hopper-runner:16-21 and 519-648; cli/bin/hopper-dispatch:752-864; and mirrored files.
- Test: tests/unit/handoff-attestation.test.js; tests/unit/progress.test.js; tests/unit/background.test.js; tests/integration/runner-single-spawn.test.js.

- [ ] **Step 1: Write failing finalization and provenance tests.**

Write fixtures for raw request equals effective selector, policy replacement, and policy clearing the effective selector. Add synchronous --write and background fixtures that begin at zero terminal events and finish at exactly one event with identical attestation fields. Add append failure, frontmatter failure, re-entry with an existing terminal event, and terminal event plus in-progress frontmatter cases.

~~~js
const event = finalizeTerminalAttestation({
  hopperDir,
  taskId: 'T-ATTEST',
  outputMdPath,
  parsed: { status: 'success', text: 'answer', modelAttestation },
  completion: { status: 'done', adapterStatus: 'success', exitCode: 0 },
});
assert.equal(event.terminal, true);
assert.equal(countTerminalEvents(hopperDir, 'T-ATTEST'), 1);
assert.equal(readFrontmatter(outputMdPath).terminal_event_emitted, true);
~~~

Assert append failure leaves frontmatter in progress; frontmatter write failure leaves reader-visible finalizing or partial only; writers never persist status finalizing or partial.

- [ ] **Step 2: Run the new finalization fixtures and confirm the red state.**

Run:

~~~powershell
Set-Location F:\workspace\ai\hopper-plugin
node --test tests/unit/handoff-attestation.test.js
~~~

Expected: failure reports that handoff-attestation.js and finalizeTerminalAttestation do not exist.

- [ ] **Step 3: Implement snapshot construction and the shared event-first finalizer.**

Define the public interface in the new module:

~~~js
export function buildAttestationStartupSnapshot({
  requestedSelector,
  effectiveSelector,
  effectiveSelectorSource,
  catalog,
}) {
  return {
    requested_selector: requestedSelector ?? null,
    effective_selector: effectiveSelector ?? null,
    effective_selector_source: effectiveSelectorSource,
    selector_kind: effectiveSelector == null ? 'auto' : 'unknown',
    catalog_source_kind: catalog.sourceKind,
    catalog_source_label: catalog.sourceLabel,
    catalog_observed_at: catalog.observedAt,
    catalog_freshness: catalog.freshness,
    binary_availability: catalog.binaryAvailability,
    binary_basename: catalog.binaryBasename,
  };
}

export function finalizeTerminalAttestation(args) {
  const terminal = buildCanonicalTerminalRecord(args);
  const event = appendProgressEvent({ hopperDir: args.hopperDir, taskId: args.taskId, event: terminal.event });
  writeFrontmatter(args.outputMdPath, { ...terminal.frontmatter, terminal_event_emitted: true });
  return event;
}

function buildCanonicalTerminalRecord({ startupSnapshot, parsed, completion }) {
  const resolution = resolveAttestation({
    vendor: completion.vendor,
    effectiveSelector: startupSnapshot.effective_selector,
    selectorMetadata: startupSnapshot.selectorMetadata,
    modelAttestation: parsed.modelAttestation,
    catalog: startupSnapshot.catalog,
  });
  return {
    event: { ...startupSnapshot, ...resolution.eventFields, terminal: true },
    frontmatter: { ...startupSnapshot, ...resolution.frontmatterFields, status: completion.status },
  };
}
~~~

Thread raw argv and post-policy AdapterOpts through resolveAdapterOptsForTask, runDispatch, runBackgroundDispatch, spawnDetached, executeWithAdapter, and the runner environment. Read only a pre-existing cache snapshot at startup; do not probe, retry, or mutate cache. Replace the runner’s direct appendRunnerTerminalEvent plus writeFrontmatter terminal sequence and the sync writeOutput terminal path with the shared finalizer. Before finalizing, reject a task that already has a terminal JSONL event rather than appending another.

Add these nine fields to OPTIONAL_EVENT_FIELDS: requested_selector, effective_selector, effective_selector_source, selector_kind, observed_models, model_attestation_source, model_attestation_observed_at, resolution_status, and resolution_detail. The finalizer invokes resolveAttestation with the optional parsed modelAttestation; no consumer may derive observed models from request, cache, or log text.

- [ ] **Step 4: Run the protocol and integration checks.**

Run:

~~~powershell
Set-Location F:\workspace\ai\hopper-plugin
node --test tests/unit/handoff-attestation.test.js tests/unit/progress.test.js tests/unit/background.test.js tests/integration/runner-single-spawn.test.js
~~~

Expected: # fail 0; each successful sync/background fixture contains one terminal JSONL event and a canonical terminal frontmatter record, with no liveness event after terminalization.

- [ ] **Step 5: Mirror and commit the finalizer change.**

Run:

~~~powershell
Set-Location F:\workspace\ai\hopper-plugin
node scripts/sync-vendored-plugin.mjs
git -C F:\workspace\ai\hopper-plugin add -- cli/src/handoff-attestation.js cli/src/background.js cli/src/progress.js cli/src/dispatch.js cli/bin/hopper-runner cli/bin/hopper-dispatch plugins/hopper/cli/src/handoff-attestation.js plugins/hopper/cli/src/background.js plugins/hopper/cli/src/progress.js plugins/hopper/cli/src/dispatch.js plugins/hopper/cli/bin/hopper-runner plugins/hopper/cli/bin/hopper-dispatch tests/unit/handoff-attestation.test.js tests/unit/progress.test.js tests/unit/background.test.js tests/integration/runner-single-spawn.test.js
git -C F:\workspace\ai\hopper-plugin diff --cached --check
git -C F:\workspace\ai\hopper-plugin commit -m "feat: finalize model attestations once"
~~~

Expected: a terminal-protocol commit with both root and vendored runtime copies.

### Task 5: Make frontmatter, JSONL readers, and orphan repair resilient and canonical

**Files:**

- Modify: cli/src/background.js:38-134; cli/src/handoff-attestation.js; cli/bin/hopper-dispatch:1158-1216 and 1372-1480; and mirrored files.
- Test: tests/unit/handoff-attestation.test.js; tests/unit/background.test.js; tests/unit/progress-cli.test.js; tests/unit/result-full.test.js.

- [ ] **Step 1: Write failing scalar, reader, and orphan-repair fixtures.**

Add scalar round-trip cases containing brackets, colon, hash, both quote characters, backslash, newline, Unicode, document-marker-like input, JSON null, object JSON, and non-array JSON. Add reader fixtures for no frontmatter, missing status, bad status, truncated scalar, YAML flow sequence, object, null, and mixed-type observed array.

Add all five orphan repair no-op/merge cases: zero terminal events; more than one terminal event; mismatched task identity or event payload; late reread showing complete or changed frontmatter; and a partial frontmatter containing both a safe catalog field and a non-allowlisted raw-looking field.

- [ ] **Step 2: Run the reader suite and confirm the red failure.**

Run:

~~~powershell
Set-Location F:\workspace\ai\hopper-plugin
node --test tests/unit/handoff-attestation.test.js tests/unit/progress-cli.test.js
~~~

Expected: tests for encodeObservedModelsJsonScalar, readCanonicalAttestation, and repairOrphanTerminalHandoff fail because the exports are not present.

- [ ] **Step 3: Add a dedicated JSON YAML scalar encoder, canonical reader, and repair guard.**

Do not call emitScalar for observed_models_json. Implement the encoder and accepted reader shape:

~~~js
export function encodeObservedModelsJsonScalar(models) {
  const json = JSON.stringify(firstSeenUniqueStringArray(models));
  return '"' + json.replace(/[\\"\n\r\t\[\]:#]/g, yamlJsonEscape) + '"';
}

function firstSeenUniqueStringArray(values) {
  return [...new Set(Array.isArray(values)
    ? values.filter((value) => typeof value === 'string' && value.length > 0)
    : [])];
}

function yamlJsonEscape(char) {
  return ({ '\\': '\\\\', '"': '\\"', '\n': '\\n', '\r': '\\r', '\t': '\\t',
    '[': '\\x5B', ']': '\\x5D', ':': '\\x3A', '#': '\\x23' })[char];
}

export function parseObservedModelsJson(value) {
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')
      ? firstSeenUniqueStringArray(parsed)
      : [];
  } catch {
    return [];
  }
}
~~~

Extend the flat frontmatter parser so double-quoted scalars decode the encoder’s escapes before JSON parsing, while a YAML flow sequence or object remains a non-string scalar and yields an empty observed list. The canonical reader returns normalized display fields, handoff_state of finalizing or partial only when readers infer the crash window, and attestation_consistency conflict when complete frontmatter and JSONL disagree. It converts unknown resolution strings to unverified and absent/invalid status to display-only unknown.

Implement repairOrphanTerminalHandoff with a late reread immediately before atomic frontmatter replacement. It accepts exactly one parseable, matching terminal event; copies only catalog_source_kind, catalog_source_label, catalog_observed_at, catalog_freshness, binary_availability, and binary_basename from partial frontmatter; writes no JSONL event; and returns a no-op outcome for every changed, unsafe, malformed, or non-unique input.

- [ ] **Step 4: Route result and progress through the shared canonical reader.**

Change runResult and runProgress to call readCanonicalAttestation rather than toUpperCase a raw status or independently privilege JSONL. Render requested/effective selector, source, kind, observed models, resolution status/detail, safe catalog snapshot, and finalizing/partial/conflict diagnostics. A missing output file remains the existing undispatched error; a bad existing handoff must still print readable recent valid events.

The only reader contract passed to both commands is:

~~~js
const record = readCanonicalAttestation({ hopperDir, taskId, outputMdPath });
const displayStatus = record.status === 'unknown' ? 'UNKNOWN' : record.status.toUpperCase();
for (const event of record.recentEvents) printProgressEvent(event);
~~~

- [ ] **Step 5: Run reader and crash-window tests.**

Run:

~~~powershell
Set-Location F:\workspace\ai\hopper-plugin
node --test tests/unit/handoff-attestation.test.js tests/unit/background.test.js tests/unit/progress-cli.test.js tests/unit/result-full.test.js
~~~

Expected: # fail 0. No test accepts writer status finalizing or partial, and observed_models_json round-trips only through a quoted scalar.

- [ ] **Step 6: Mirror and commit reader safety.**

Run:

~~~powershell
Set-Location F:\workspace\ai\hopper-plugin
node scripts/sync-vendored-plugin.mjs
git -C F:\workspace\ai\hopper-plugin add -- cli/src/background.js cli/src/handoff-attestation.js cli/bin/hopper-dispatch plugins/hopper/cli/src/background.js plugins/hopper/cli/src/handoff-attestation.js plugins/hopper/cli/bin/hopper-dispatch tests/unit/handoff-attestation.test.js tests/unit/background.test.js tests/unit/progress-cli.test.js tests/unit/result-full.test.js
git -C F:\workspace\ai\hopper-plugin diff --cached --check
git -C F:\workspace\ai\hopper-plugin commit -m "feat: read attestation handoffs safely"
~~~

Expected: one reader and recovery commit, without cache or dashboard changes.

### Task 6: Add diagnostics-aware v1 cache merging and explicit recovery transactions

**Files:**

- Create: cli/src/inventory-contract.js; plugins/hopper/cli/src/inventory-contract.js.
- Modify: cli/src/cache.js:31-205; cli/src/setup.js:80-163; cli/src/vendor-probe/claude.js; cli/src/vendor-probe/opencode.js; cli/src/vendor-probe/kimi.js; cli/bin/hopper-dispatch:187-228 and 1828-2033; and mirrored files.
- Test: tests/unit/cache.test.js; tests/unit/model-attestation-contract.test.js; tests/unit/dashboard-vendors.test.js.

- [ ] **Step 1: Write failing cache and projection fixtures.**

Add cache fixtures for missing, valid v1, malformed JSON, version mismatch, unknown root/vendor/nested provenance keys, and a second writer that omits an owned optional field. Assert valid v1 writes retain all unknown values byte-for-byte in the parsed semantic structure, while mismatch/malformed ordinary commands leave active bytes unchanged.

Add recovery fixtures for owner-only temp creation and assertion, owner-only exclusive backup creation and assertion, assertion deletion, eight colliding backup candidates, equal timestamps ordered by full basename, failed prune followed by later self-heal, prune then pre-commit crash, atomic replace failure, missing active cache, crash after successful replace, and post-commit durability failure.

Use fixture assertions such as:

~~~js
assert.equal(result.diagnostic_code, 'inventory-cache-recovery-replace-failed');
assert.deepEqual(readFileSync(activePath), beforeBytes);
assert.equal(result.committed, false);
assert.equal(durability.diagnostic_code, 'inventory-cache-recovery-durability-unknown');
assert.equal(durability.committed, true);
~~~

- [ ] **Step 2: Run cache tests and verify the red state.**

Run:

~~~powershell
Set-Location F:\workspace\ai\hopper-plugin
node --test tests/unit/cache.test.js
~~~

Expected: new fixtures fail because readCacheWithOutcome, recoverVendorCache, and projectInventoryEntry do not exist.

- [ ] **Step 3: Implement the read outcome, additive writer, and recovery commit point.**

Replace the string-error-only internal decision with this bounded outcome:

~~~js
export function readCacheWithOutcome() {
  // returns { outcome: 'missing'|'ok-v1'|'version-mismatch'|'malformed', cache, diagnostic_code }
}

export function setVendorCache(name, entry) {
  // missing creates v1; ok-v1 shallow-merges owned fields and preserves unknown root,
  // vendor, and nested provenance keys; other outcomes return without writing.
}
~~~

Implement recoverVendorCache(name) only for the explicit --probe <vendor> --recover-cache route. Its preparation order is inspect active, create/assert owner-only temp, validate fresh v1 temp, create/assert owner-only exclusive backup when active exists, prune eligible old backups, then atomic replace. Generate up to eight fresh lowercase-hex suffixes for basename.recovery-UTC-8hex.bak using exclusive creation. If no candidate can be created, use inventory-cache-recovery-backup-create-failed.

The atomic replace is the sole commit point. Any earlier failure, including replace failure before the commit point, reports inventory-cache-recovery-replace-failed when applicable and preserves active bytes; temp cleanup is best effort and an existing backup may remain. A successful replace followed by failed fsync or directory durability confirmation reports inventory-cache-recovery-durability-unknown and never claims active bytes stayed old. Retention runs only before replace, excludes the current recovery backup, sorts timestamp then full basename ordinal bytewise, and after a prune failure is retried by the next explicit recovery.

- [ ] **Step 4: Define the closed public inventory projection and sanitize probes.**

In inventory-contract.js centralize six v2 public fields and all normalizers:

~~~js
export function projectInventoryEntry(vendor, entry, readOutcome) {
  return {
    binaryAvailability: normalizeBinaryAvailability(entry),
    binaryBasename: normalizeBinaryBasename(entry),
    sourceKind: normalizeSourceKind(vendor, entry?.provenance?.source_kind),
    sourceLabel: normalizeSourceLabel(vendor, entry?.provenance?.source_kind),
    diagnosticCode: normalizeDiagnosticCode(readOutcome?.diagnostic_code),
    diagnosticState: normalizeDiagnosticState(readOutcome?.diagnostic_code),
  };
}

function normalizeBinaryAvailability(entry) {
  return entry?.provenance?.binary_availability === 'present' || entry?.provenance?.binary_availability === 'missing'
    ? entry.provenance.binary_availability
    : 'unknown';
}

function normalizeBinaryBasename(entry) {
  return ['claude', 'opencode', 'kimi'].includes(entry?.provenance?.binary_basename)
    ? entry.provenance.binary_basename
    : null;
}

function normalizeSourceKind(vendor, sourceKind) {
  return sourceKindAllowedForVendor(vendor, sourceKind) ? sourceKind : 'unknown';
}

function normalizeSourceLabel(vendor, sourceKind) {
  return sourceLabelForAllowedPair(vendor, sourceKind) || 'unknown';
}
~~~

Require vendor-probe modules to retain raw diagnostics only inside existing private process-local handling and emit canonical provenance and diagnostic codes into cache entries. Kimi must not store config paths, provider names, stderr, auth language, or parse exceptions in models_source or notes. OpenCode and Claude probes likewise must not put raw auth excerpts or paths into public-ready fields.

Parse --recover-cache in hopper-dispatch only with --probe and one vendor. Ordinary --setup, --capabilities, --models, and --probe on malformed or mismatched cache return a closed diagnostic plus recover-cache hint and write nothing.

- [ ] **Step 5: Run cache, projection, and CLI parser checks.**

Run:

~~~powershell
Set-Location F:\workspace\ai\hopper-plugin
node --test tests/unit/cache.test.js tests/unit/model-attestation-contract.test.js tests/unit/dashboard-vendors.test.js
~~~

Expected: # fail 0. The suite proves CACHE_VERSION remains 1, recovery never starts implicitly, ordinary mismatch paths preserve bytes, and the replace-failed and durability-unknown diagnostics remain distinct.

- [ ] **Step 6: Mirror and commit cache recovery.**

Run:

~~~powershell
Set-Location F:\workspace\ai\hopper-plugin
node scripts/sync-vendored-plugin.mjs
git -C F:\workspace\ai\hopper-plugin add -- cli/src/cache.js cli/src/inventory-contract.js cli/src/setup.js cli/src/vendor-probe/claude.js cli/src/vendor-probe/opencode.js cli/src/vendor-probe/kimi.js cli/bin/hopper-dispatch plugins/hopper/cli/src/cache.js plugins/hopper/cli/src/inventory-contract.js plugins/hopper/cli/src/setup.js plugins/hopper/cli/src/vendor-probe/claude.js plugins/hopper/cli/src/vendor-probe/opencode.js plugins/hopper/cli/src/vendor-probe/kimi.js plugins/hopper/cli/bin/hopper-dispatch tests/unit/cache.test.js tests/unit/model-attestation-contract.test.js tests/unit/dashboard-vendors.test.js
git -C F:\workspace\ai\hopper-plugin diff --cached --check
git -C F:\workspace\ai\hopper-plugin commit -m "feat: recover capability cache explicitly"
~~~

Expected: one cache/projection commit; it contains the root and vendored CLI files and no dashboard client source.

### Task 7: Redact every public CLI surface and retain check-model compatibility

**Files:**

- Modify: cli/bin/hopper-dispatch:1583-1805 and 1828-2033; cli/src/setup.js; cli/src/model-check.js; cli/src/handoff-attestation.js; cli/src/inventory-contract.js; and mirrored files.
- Test: tests/unit/model-check.test.js; tests/unit/progress-cli.test.js; tests/unit/result-full.test.js; tests/unit/model-attestation-contract.test.js.

- [ ] **Step 1: Write failing public-output fixtures.**

Create subprocess fixtures for --models, --setup, --capabilities, --check, --check-model --json, --result, and --progress using a cache with an absolute binary path, config path, raw stderr, auth text, provider name, URL, and secret-shaped text. Assert no forbidden value appears, while safe source/binary fields and diagnostic code do appear.

For --check-model assert:

~~~js
assert.equal(json.selector_valid, 'verified');
assert.equal(json.runtime_attestation, 'not-run');
assert.equal(exitCode, 0);
~~~

Also assert catalog-only, not-found, and effort-spliced retain their current exit-code compatibility and never print exact, mismatch, or alias-resolved.

- [ ] **Step 2: Run public-output tests and confirm the red state.**

Run:

~~~powershell
Set-Location F:\workspace\ai\hopper-plugin
node --test tests/unit/model-check.test.js tests/unit/progress-cli.test.js tests/unit/result-full.test.js tests/unit/model-attestation-contract.test.js
~~~

Expected: failures expose current raw binary_path, models_source, notes, cache errors, or missing selector_valid/runtime_attestation fields.

- [ ] **Step 3: Route all CLI rendering through the safe projection.**

Change runCapabilities, runModels, runSetup, runCheck, and runCheckModel to consume projectInventoryEntry. Render only binaryAvailability, binaryBasename, sourceKind, sourceLabel, freshness, catalog timestamp, diagnosticCode, and diagnosticState. In runCheck, remove resolved full path display rather than merely replacing the home prefix; command display is the validated basename only.

Use the same canonical reader in runResult and runProgress. Render observed models and safe selector provenance, but never raw parsed envelopes, raw logs, cache fields, full PATH, config paths, error prose, or credentials. Preserve the existing --full raw-output behavior only under its already explicit output contract; do not copy it into attestation fields.

Use one formatter for every cache-derived line:

~~~js
function renderSafeInventory(entry) {
  return [
    'source=' + entry.sourceLabel,
    'freshness=' + entry.freshness,
    'binary=' + entry.binaryAvailability + (entry.binaryBasename ? ' (' + entry.binaryBasename + ')' : ''),
    'diagnostic=' + entry.diagnosticCode,
  ].join(' | ');
}

function runCheckModel(vendor, model, { json = false } = {}) {
  const result = evaluateModelCheck(vendor, model, knownGood, catalog);
  const payload = { selector_valid: result.verdict, runtime_attestation: 'not-run' };
  return json ? JSON.stringify(payload) : renderSafeInventory(projectInventoryEntry(vendor, cached, cacheOutcome));
}
~~~

- [ ] **Step 4: Run CLI privacy and compatibility tests.**

Run:

~~~powershell
Set-Location F:\workspace\ai\hopper-plugin
node --test tests/unit/model-check.test.js tests/unit/progress-cli.test.js tests/unit/result-full.test.js tests/unit/model-attestation-contract.test.js
~~~

Expected: # fail 0. All requested outputs use closed enums, legacy model-check exit codes hold, and no zero-spawn command claims runtime proof.

- [ ] **Step 5: Mirror and commit public CLI rendering.**

Run:

~~~powershell
Set-Location F:\workspace\ai\hopper-plugin
node scripts/sync-vendored-plugin.mjs
git -C F:\workspace\ai\hopper-plugin add -- cli/bin/hopper-dispatch cli/src/setup.js cli/src/model-check.js cli/src/handoff-attestation.js cli/src/inventory-contract.js plugins/hopper/cli/bin/hopper-dispatch plugins/hopper/cli/src/setup.js plugins/hopper/cli/src/model-check.js plugins/hopper/cli/src/handoff-attestation.js plugins/hopper/cli/src/inventory-contract.js tests/unit/model-check.test.js tests/unit/progress-cli.test.js tests/unit/result-full.test.js tests/unit/model-attestation-contract.test.js
git -C F:\workspace\ai\hopper-plugin diff --cached --check
git -C F:\workspace\ai\hopper-plugin commit -m "feat: render model inventory safely"
~~~

Expected: one public-CLI commit, with no raw inventory field accepted by any renderer.

### Task 8: Migrate the dashboard to permanent safe shims and recursive privacy checks

**Files:**

- Modify: dashboard/server/routes/vendors.js:34-60; dashboard/client/src/lib/types.ts:44-63; dashboard/client/src/components/VendorCard.tsx:24-80.
- Test: tests/unit/dashboard-vendors.test.js.

- [ ] **Step 1: Write failing inventory API and client-shape fixtures.**

Extend dashboard-vendors tests with recursively scanned API responses. Every direct vendors array record must contain notes as an empty array, cacheError as null, modelsSource as null, and binaryPath as null. The scan must fail if these keys appear at another response depth or carry any other value. Include inventoryContractVersion v2 complete, missing, unknown, and future fixtures; client fixtures cover missing/null/unknown/future values and a gate-off/rollback response.

~~~js
assert.deepEqual(inventory.vendors[0].notes, []);
assert.equal(inventory.vendors[0].cacheError, null);
assert.equal(inventory.vendors[0].modelsSource, null);
assert.equal(inventory.vendors[0].binaryPath, null);
assert.equal(inventory.vendors[0].sourceLabel, 'opencode-cli-catalog');
~~~

- [ ] **Step 2: Run the dashboard inventory tests and verify the red state.**

Run:

~~~powershell
Set-Location F:\workspace\ai\hopper-plugin
node --test tests/unit/dashboard-vendors.test.js
~~~

Expected: failures show that the route currently returns raw cached binaryPath, modelsSource, notes, or cacheError.

- [ ] **Step 3: Implement one safe API shape and a null-safe client.**

Make readVendorInventory consume projectInventoryEntry and return inventoryContractVersion plus direct records shaped as follows:

~~~js
return {
  inventoryContractVersion: 2,
  vendors: names.map((name) => ({
    name,
    cachedAt: safeTimestamp(entry?.probed_at),
    cachedModels: safeStringArray(entry?.models),
    reasoningLevels: safeStringArray(entry?.reasoning_levels),
    ...projectInventoryEntry(name, entry, cacheOutcome),
    notes: [],
    cacheError: null,
    modelsSource: null,
    binaryPath: null,
  })),
  generatedAt: new Date().toISOString(),
};

function safeStringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}

function safeTimestamp(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
}
~~~

Update Vendor and VendorsResponse TypeScript interfaces for the six v2 fields, nullable unknown-safe binary basename, inventoryContractVersion optional diagnostic, and permanent shims. VendorCard renders sourceLabel, binaryAvailability/binaryBasename, and diagnosticCode/diagnosticState; it treats omitted or future enum values as unavailable. Do not use the four shim values as meaningful data. Feature-gate, card-disabled, and rollback code paths keep the same direct-record shim shape.

- [ ] **Step 4: Run unit tests and the dashboard type/build check.**

Run:

~~~powershell
Set-Location F:\workspace\ai\hopper-plugin
node --test tests/unit/dashboard-vendors.test.js
npm run dashboard:build
~~~

Expected: node:test exits 0 with # fail 0 and Vite completes with an emitted production bundle. The client does not crash for old server data or unknown future enum values.

- [ ] **Step 5: Commit the dashboard privacy migration.**

Run:

~~~powershell
git -C F:\workspace\ai\hopper-plugin add -- dashboard/server/routes/vendors.js dashboard/client/src/lib/types.ts dashboard/client/src/components/VendorCard.tsx tests/unit/dashboard-vendors.test.js
git -C F:\workspace\ai\hopper-plugin diff --cached --check
git -C F:\workspace\ai\hopper-plugin commit -m "feat: protect dashboard inventory"
~~~

Expected: one dashboard-only commit. Key names remain present as safe shims; only a future breaking contract may remove them.

### Task 9: Lock down OpenCode execution-side effects and document the operator contract

**Files:**

- Modify: tests/unit/opencode-plugin-static.test.js; tests/unit/opencode-host.test.js; docs/cookbook.md; dashboard/README.md.
- Test: tests/unit/opencode-plugin-static.test.js; tests/unit/opencode-host.test.js; tests/unit/vendored-plugin-sync.test.js.

- [ ] **Step 1: Write the bounded execution-isolation tests first.**

The repository contains no source that creates an OpenCode snapshot, isolated checkout, or worktree. The native OpenCode plugin at hosts/opencode/plugins/hopper-async.ts is deliberately a disabled shim, and the wrapper hosts/opencode/bin/hopper-opencode is the only executable host route. Add static tests that assert the plugin throws before any prompt_async, session idle, git snapshot, git worktree, or checkout invocation and that the wrapper contains no snapshot/worktree/checkout command.

~~~js
assert.match(plugin, /throw new Error/);
assert.doesNotMatch(plugin, /prompt_async|session\.idle|git\s+(snapshot|worktree|checkout)/);
assert.doesNotMatch(wrapper, /\b(snapshot|worktree|checkout)\b/);
~~~

- [ ] **Step 2: Run the isolation tests and confirm the red state.**

Run:

~~~powershell
Set-Location F:\workspace\ai\hopper-plugin
node --test tests/unit/opencode-plugin-static.test.js tests/unit/opencode-host.test.js
~~~

Expected: the new assertions fail until the static side-effect boundary is represented in both tests and operator documentation.

- [ ] **Step 3: Document deterministic execution evidence without changing attestation semantics.**

Document in cookbook.md and dashboard/README.md that implementation tests use fake binaries and temporary directories, the native OpenCode plugin is disabled, and an operator who invokes an external OpenCode execution layer must record command, cwd, and observed writes outside handoff/cache evidence. No snapshot side effect is accepted as model proof or copied into attestation status. If the external tool later requires a snapshot, this bounded disabled route remains in force until a separately designed isolation implementation is committed with a fixture that asserts its exact temp root and cleanup.

- [ ] **Step 4: Run static isolation and documentation-adjacent checks.**

Run:

~~~powershell
Set-Location F:\workspace\ai\hopper-plugin
node --test tests/unit/opencode-plugin-static.test.js tests/unit/opencode-host.test.js tests/unit/vendored-plugin-sync.test.js
~~~

Expected: # fail 0. The test suite proves the available native plugin route is disabled and no repository execution route can create a snapshot, checkout, or worktree.

- [ ] **Step 5: Commit the bounded execution evidence.**

Run:

~~~powershell
git -C F:\workspace\ai\hopper-plugin add -- tests/unit/opencode-plugin-static.test.js tests/unit/opencode-host.test.js docs/cookbook.md dashboard/README.md
git -C F:\workspace\ai\hopper-plugin diff --cached --check
git -C F:\workspace\ai\hopper-plugin commit -m "docs: record attestation execution boundaries"
~~~

Expected: a documentation/static-guard commit that does not alter runtime attestation behavior.

### Task 10: Synchronize release copies, run the complete regression suite, and freeze the delivery diff

**Files:**

- Modify only as needed by the synchronization script: plugins/hopper/cli/** matching root cli/**.
- Test: all targeted tests above, tests/unit/*.test.js, tests/integration/*.test.js, tests/unit/vendored-plugin-sync.test.js, and dashboard build.

- [ ] **Step 1: Write the final cross-cutting acceptance fixture additions.**

Add missing matrix cases to the existing focused suites before the final regression: multi-model first-seen de-dup; selector requested/effective provenance; alias/config-only/auto resolution; all diagnostic precedence pairs; complete inventoryContractVersion v2; old/new client matrix; recursive forbidden-value scan; cache prune-before-crash; replace failure; durability unknown; and both root and vendored finalizer behavior.

Use this acceptance assertion for every public surface response:

~~~js
assert.equal(scanForForbiddenInventoryValues(response).length, 0);
assert.equal(scanLegacyShimPlacement(response).length, 0);
~~~

- [ ] **Step 2: Run the focused acceptance suites and confirm no remaining red test.**

Run:

~~~powershell
Set-Location F:\workspace\ai\hopper-plugin
node --test tests/unit/model-attestation-contract.test.js tests/unit/model-attestation-parser.test.js tests/unit/handoff-attestation.test.js tests/unit/cache.test.js tests/unit/dashboard-vendors.test.js tests/unit/model-check.test.js tests/unit/progress-cli.test.js tests/unit/opencode-plugin-static.test.js tests/unit/opencode-host.test.js
~~~

Expected: # fail 0 with all strict comparator, parser, protocol, recovery, privacy, and execution-boundary fixtures passing.

- [ ] **Step 3: Sync the vendored CLI, run complete tests, and build the dashboard.**

Run:

~~~powershell
Set-Location F:\workspace\ai\hopper-plugin
node scripts/sync-vendored-plugin.mjs
node --test tests/unit/*.test.js
node --test tests/integration/*.test.js
npm run dashboard:build
node scripts/sync-vendored-plugin.mjs --check
~~~

Expected: all node:test invocations report # fail 0, platform-specific POSIX checks may skip on Windows, the dashboard build succeeds, and sync --check prints that plugins/hopper is in sync with the main source.

- [ ] **Step 4: Inspect the frozen diff and create the final implementation commit only if synchronization changed files.**

Run:

~~~powershell
git -C F:\workspace\ai\hopper-plugin status --short
git -C F:\workspace\ai\hopper-plugin diff --check
git -C F:\workspace\ai\hopper-plugin diff -- plugins/hopper/cli
git -C F:\workspace\ai\hopper-plugin diff --name-only
~~~

Expected: only intended implementation/doc/test paths remain. If sync produced changed vendored files, stage only those mirror paths, verify diff --check, and commit them with:

~~~powershell
git -C F:\workspace\ai\hopper-plugin add -- plugins/hopper/cli
git -C F:\workspace\ai\hopper-plugin diff --cached --check
git -C F:\workspace\ai\hopper-plugin commit -m "chore: synchronize vendored hopper cli"
~~~

Expected: no uncommitted mirror drift remains.

- [ ] **Step 5: Record final freeze evidence.**

Run:

~~~powershell
git -C F:\workspace\ai\hopper-plugin diff --check
git -C F:\workspace\ai\hopper-plugin status --short
git -C F:\workspace\ai\hopper-plugin log -1 --name-only --format=fuller
git -C F:\workspace\ai\hopper-plugin rev-parse HEAD
~~~

Expected: diff --check has no output, status is clean, and the final commit evidence names only intended paths. Do not push, publish, rewrite history, change package or lock files, or alter F:\workspace\project\thunderfire-audio\.hopper.

## Plan self-review

### Spec coverage map

| Frozen design section or requirement | Plan tasks |
| --- | --- |
| Decision summary, goals, non-goals, terminology, requested/effective/source provenance | 2, 3, 4, 5, 7 |
| Single comparison boundary; selector validation distinct from runtime proof; check-model compatibility | 2, 7 |
| Vendor-discriminated expected identity union, live registry/sentinel rules, exact literal metadata, zero-spawn source priority | 2 |
| Claude dynamic alias classification, OpenCode concrete classification, Kimi config-only and auto | 2, 3, 4, 6 |
| Runtime observed-model extraction and four fixed Claude paths | 3 |
| Five resolution states, detail pairs, diagnostic precedence, mismatch is diagnostic only | 2, 4, 7 |
| Startup snapshot, scalar-only frontmatter, JSONL optional fields, canonical event-first finalization | 4, 5 |
| Exact-once sync/background write, crash windows, finalizing/partial reader state, orphan repair | 4, 5 |
| v1 read outcome, additive merge, unknown preservation, no-write mismatch/malformed | 6 |
| Explicit recover-cache transaction, permissions, exclusive backup candidates, retention, crash boundaries, replace versus durability diagnostics | 6 |
| Catalog source allow map, closed diagnostic/source enums, probe sanitization | 6, 7, 8 |
| --models, --setup, --capabilities, --check, --check-model, --result, and --progress redaction | 5, 7 |
| Dashboard v2 fields, null-safe client, permanent direct safe shims, recursive privacy, version diagnostic, rollback | 8 |
| Root and vendored CLI parity | 1 through 7 and 10 |
| Lifecycle patch, OpenCode completion, Claude authoritative result, Kimi no buffered liveness, timeout/process tree hardening | 1 |
| OpenCode snapshot/checkout execution evidence boundary | 9 |
| Phase 2 enablement for Claude/OpenCode/Kimi and Phase 3 operator documentation | 3, 6, 7, 8, 9 |
| Frozen cwd/status/diff/hash acceptance gates | Frozen baseline section, 1, 10 |
| Full test matrix including malformed, ambiguous, multiple models, cache recovery, rendering, and protocol invariants | 2 through 10 |

### Banned-marker scan

After drafting this plan, run:

~~~powershell
Set-Location F:\workspace\ai\hopper-plugin
rg -n -i 'T(BD|ODO)|implement[[:space:]]+later|fill[[:space:]]+in[[:space:]]+details|appropriate[[:space:]]+validation|similar[[:space:]]+to' docs/superpowers/plans/2026-07-21-model-selector-attestation-implementation.md
~~~

Expected: no findings. The plan specifies each introduced module, exported function, test fixture category, command, expected result, and commit boundary.

### Type and interface consistency

The shared names used consistently across tasks are: modelAttestation with observedModels/source/observedAt; requested_selector; effective_selector; effective_selector_source; selector_kind; resolution_status; resolution_detail; diagnostic_code; sourceKind/sourceLabel; binaryAvailability/binaryBasename; and inventoryContractVersion. compareRuntimeIdentity remains only in model-normalize.js, validateSelectorMetadataEnvelope/classifyEffectiveSelector/resolveAttestation remain in model-attestation.js, projectInventoryEntry remains in inventory-contract.js, and finalizeTerminalAttestation/readCanonicalAttestation/repairOrphanTerminalHandoff remain in handoff-attestation.js. The review found no interface mismatch after aligning the sync and background paths on the same terminal finalizer.

### Delivery boundary

Plan complete and saved to docs/superpowers/plans/2026-07-21-model-selector-attestation-implementation.md. It is intentionally preimplementation: execution begins only after a worker follows the numbered tasks in order, commits the frozen lifecycle baseline before feature work, and preserves the stated external-write and repository boundaries.
