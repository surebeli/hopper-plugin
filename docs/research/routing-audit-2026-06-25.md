# Routing Blindspot Audit - 2026-06-25

Task: `adhoc-spec-blindspot-hunt-mqtbnvzy`

Assumption: "audit the routing only" means the hopper dispatch routing contract:
task/vendor resolution, governance overlay routing, host/vendor separation, and
sandbox routing docs; vendor adapter internals were checked only where they
change routing-visible behavior.

## Summary

The core vendor resolver is implemented and covered: explicit CLI `--vendor`
overrides queue routing, queued `Vendor` overrides task-type preferences, the
router is deterministic, and governance is keyed on the resolved vendor. The
major blindspot is contract drift around read-only routing: current codex routing
intentionally forces full access by default, but several public docs and generated
rules prose still promise read-only auto-downgrade or recommend codex as a clean
read-only vendor. That is a spec-level contract gap because the default
`spec-blindspot-hunt` route is codex.

## Scope Audited

- `.hopper/queue.md` and `.hopper/AGENTS.md` routing tables.
- `.hopper/tasks/spec-blindspot-hunt.md` task contract.
- `README.md`, `commands/*.md`, and generated rules prose.
- `cli/src/agents.js`, `cli/src/queue.js`, `cli/src/dispatch.js`,
  `cli/src/governance.js`, `cli/src/rules.js`, `cli/src/setup.js`,
  `cli/src/vendors/codex.js`.
- Routing-focused tests under `tests/unit/`.

## Resolved Values

- Queued vendor resolution order is:
  1. CLI/background `vendorOverride` from `--vendor`.
  2. Queue row `Vendor` column.
  3. `.hopper/AGENTS.md` task-type preference table.
  4. Legacy `Active Agent Instances` `taskTypePref` array.
  5. Throw if unresolved.
- Ad-hoc vendor resolution order is:
  1. CLI `--vendor`.
  2. `.hopper/AGENTS.md` task-type preference table.
  3. Legacy `Active Agent Instances` `taskTypePref` array.
  4. Throw if unresolved.
- Governance routing happens after vendor resolution and before prompt
  composition. If `--vendor` overrides the default vendor, governance uses the
  overridden vendor. `Govern: off` disables the governance preamble for that task.
- Host/vendor separation is enforced in CLI execution paths after resolution via
  `validateHostVendorSeparation`, not inside the pure `resolveDispatch` resolver.
- Sandbox routing current value:
  - Non-codex: explicit `--sandbox` wins; otherwise read-only task text or
    read-only task type downgrades to `read-only`; otherwise
    `HOPPER_DEFAULT_SANDBOX` or `danger-full-access`.
  - Codex default: when `HOPPER_CODEX_SANDBOX_BYPASS` is not `0`, resolved sandbox
    is forced to `danger-full-access`, including explicit `--sandbox read-only`.
    Codex emits `--dangerously-bypass-approvals-and-sandbox` and
    `--skip-git-repo-check`; read-only intent is prompt-only.
  - Codex escape hatch: `HOPPER_CODEX_SANDBOX_BYPASS=0` restores `-s <mode>` for
    environments where codex sandbox process spawning is verified to work.
- `hopper-dispatch --setup codex` currently reports `Sandbox=full`, meaning
  always full-access and not argv-downgradable.

## Findings

- Category: contract-gap
  Description: Public routing docs still state that read-only task text or
  review/research task types auto-downgrade the vendor sandbox to `read-only`.
  This conflicts with the current codex path, which forces `danger-full-access`
  by default. Evidence: implementation at `cli/src/dispatch.js:236` and
  `cli/src/vendors/codex.js:263`; stale docs at `README.md:86`,
  `commands/dispatch.md:39`, `commands/review.md:7`, `commands/research.md:7`,
  and `commands/market.md:7`.
  Recommended fix: revise the routing spec/docs to state the vendor-specific
  exception explicitly: codex read-only is prompt-only unless
  `HOPPER_CODEX_SANDBOX_BYPASS=0` is set in a verified environment. Mirror the
  wording in root docs, slash command templates, and vendored plugin docs.

- Category: unstated-assumption
  Description: The default `spec-blindspot-hunt` route is `codex-builder`, while
  `spec-blindspot-hunt` is treated as read-only by task type. Under current codex
  routing, the default blindspot-hunt path is full-access despite the task class
  being audit/research work. Evidence: `.hopper/AGENTS.md:40`,
  `cli/src/validation.js` read-only task list, and `cli/src/dispatch.js:245`.
  Recommended fix: choose one contract and document it: either keep codex for
  high reasoning and label it "full-access, prompt-only read-only intent", or
  route read-only audits by default to a vendor with an enforceable read-only
  mode.

- Category: contract-gap
  Description: The generated rules prose says a genuinely locked-down review
  should prefer a clean permission flag and gives codex `-s read-only` as the
  example. The generated codex row itself now shows the bypass flag, so the
  generated document contradicts itself. Evidence: `cli/src/rules.js:153` and
  `hopper-dispatch --rules` output.
  Recommended fix: update `rules.js` prose so the generated rules say
  `Sandbox=full` vendors are not locked-down, remove codex as the read-only
  example, and add a test assertion that generated prose does not recommend
  codex `-s read-only` while codex bypass is active.

- Category: missing-dep
  Description: `hopper-dispatch --rules` escape-hatch list omits codex env vars
  that materially alter routing-visible invocation behavior:
  `HOPPER_CODEX_SANDBOX_BYPASS`, `HOPPER_CODEX_SKIP_GIT_CHECK`, and
  `HOPPER_CODEX_KEEP_ORCHESTRATION`. Evidence: `cli/src/rules.js:165` versus
  `cli/src/vendors/codex.js:69`, `cli/src/vendors/codex.js:271`, and
  `cli/src/vendors/codex.js:284`.
  Recommended fix: add these vars to rules output, preferably from adapter
  metadata instead of a hand-maintained global string.

- Category: ambiguity
  Description: `resolveDispatch({ vendorOverride })` and
  `resolveAdhocDispatch({ vendorOverride })` are pure resolvers and do not
  themselves validate that the override is registered or host-safe. The CLI does
  validate before/after resolution, but direct callers can receive a resolved
  object with an invalid vendor and governance keyed to that invalid string.
  Evidence: `cli/src/dispatch.js:64`, `cli/src/dispatch.js:105`, CLI validation
  at `cli/bin/hopper-dispatch:499` and host separation at
  `cli/bin/hopper-dispatch:710`.
  Recommended fix: document the resolver boundary in JSDoc and tests, or move
  registered-adapter validation into a shared resolver wrapper so all callers get
  the same contract.

- Category: external-unknown
  Description: One routing diagnostic test file is not currently machine-checkable
  in this Windows/NVM environment because `process.execPath` points to missing
  `C:\nvm4w\nodejs\node.exe`, while PowerShell resolves `node` to
  `C:\Users\litianyi\nodejs\node-v22.22.2-win-x64\node.exe`. The direct
  `--resolve` behavior was manually verified, but `tests/unit/resolve-and-model-
  hints.test.js` times out here.
  Recommended fix: make the test helper resolve the actual Node binary from
  `PATH` before clearing `PATH`, or avoid `PATH=''` when spawning the CLI through
  `process.execPath` on Windows NVM setups.

## Checks

- `node --test tests/unit/dispatch-flags.test.js`
  - PASS: 35/35. Verifies codex forced full-access, non-codex read-only
    downgrade, explicit sandbox behavior, host/vendor separation diagnostics.
- `node --test tests/unit/setup.test.js`
  - PASS: 18/18. Verifies `Sandbox=full` for codex.
- `node --test tests/unit/vendors-contract.test.js`
  - PASS: 80/80. Verifies codex read-only args emit bypass by default.
- `node --test tests/unit/codex-isolation.test.js`
  - PASS: 22/22. Verifies `HOPPER_CODEX_SANDBOX_BYPASS=0` escape hatch and
    full-access bypass behavior.
- `node --test tests/unit/queue.test.js`
  - PASS: 14/14. Verifies queue `Govern` parsing and eligibility routing inputs.
- `node --test tests/unit/governance.test.js`
  - PASS: 10/10. Verifies governance pointer, overlay, and `Govern: off`.
- `node --test tests/unit/rules.test.js`
  - PASS: 7/7. Verifies generated matrix shape, but does not catch stale prose.
- `node scripts/sync-vendored-plugin.mjs --check`
  - PASS: vendored plugin copy is in sync.
- `node cli/bin/hopper-dispatch --rules`
  - VERIFIED: codex row shows bypass flags; prose still recommends codex
    `-s read-only`, which is the documented contract gap.
- `node cli/bin/hopper-dispatch --setup codex`
  - VERIFIED: codex readiness reports `Sandbox=full`.
- Manual temp `.hopper` `--resolve T-FB` with `Vendor` set to `gpt-5.5`
  - VERIFIED: exits 1 and diagnoses model-vs-adapter misuse with a suggestion
    to use `--model gpt-5.5`.
- Combined command
  `node --test tests/unit/agents.test.js tests/unit/queue.test.js tests/unit/governance.test.js tests/unit/dispatch-governance.test.js tests/unit/dispatch-flags.test.js tests/unit/setup.test.js tests/unit/vendors-contract.test.js tests/unit/resolve-and-model-hints.test.js tests/unit/rules.test.js`
  timed out at 120s; smaller targeted commands above were used as evidence.

## Verdict

REWORK. The resolver implementation is mostly verified, but the public routing
contract is not safe for downstream work until the codex full-access exception
and read-only routing semantics are revised across docs/generated rules.

## Next Recommendation

Run a `spec-write` task to revise the routing contract docs only:
`README.md`, `commands/dispatch.md`, `commands/setup.md`,
`commands/review.md`, `commands/research.md`, `commands/market.md`,
`cli/src/rules.js`, and matching vendored plugin copies. Then run a narrow
`code-impl` task only if the chosen contract changes behavior, for example
rerouting `spec-blindspot-hunt` away from codex for enforceable read-only audits.
