# Changelog

All notable changes to hopper-plugin are documented in this file. Format loosely
follows [Keep a Changelog](https://keepachangelog.com/); versioning follows the
project's established convention (see "Versioning" below) rather than strict
SemVer patch/minor semantics.

This file starts at 0.32.0 — prior releases (0.1.0 through 0.31.0) are documented
in git commit history (`git log --oneline`) and `.hopper/MANIFEST.md`'s 修改记录
table; they are not backfilled here.

## Versioning

Historically every release (0.20.0 → 0.31.0, 12 releases) bumps the **minor**
digit and leaves patch at `0`, regardless of whether the change was tagged
`fix:` or `feat:` in the commit message — patch-digit releases (0.7.1, 0.8.1,
0.11.1) are rare early-project exceptions. New entries here follow that
convention: any user-observable behavior change (new capability, fixed defect,
changed default) bumps minor; patch is reserved for the rare non-functional
tweak.

## [0.34.0] - 2026-07-22

### Fixed

- **Read-only Kimi requests now stop before any vendor process starts when its
  command mode cannot enforce the requested sandbox.** This prevents a task
  from being described as read-only while it can still modify files.
- **Long-running background work now reports that the process is alive without
  exposing prompt text, vendor output, paths, account data, or model details.**
  Terminal updates clear that liveness signal, so completed work does not keep
  appearing active.
- **Public command, watch, and dashboard views now consistently hide raw
  adapter, model, cache, and process diagnostics.** Users receive a stable
  actionable status instead of sensitive implementation details.
- **Windows cleanup, workspace validation, and cache handling now fail safely
  and remain stable across interrupted or concurrent runs.**

### Changed

- **OpenCode and Fable-backed flows now preserve their explicit runtime
  behavior while refusing unsupported or unsafe execution paths.**

### Tests

- Added regression coverage for read-only refusal, content-free liveness,
  closed public diagnostics, cache/workspace recovery, one-spawn execution,
  and root-to-vendored plugin synchronization.

## [0.33.0] - 2026-07-22

### Fixed

- **Grok no longer misclassifies a successful trailing JSON result as an auth
  failure merely because the merged runner log contains an unrelated MCP
  authentication warning.** For exit-0 Grok runs, a parsed JSON envelope with
  non-empty text and a normal stop reason is preferred before existing auth
  detection; genuine non-structured plain stdout keeps its legacy success
  behavior when no auth signal is present. Cancelled, empty, error, malformed,
  and nonzero structured results retain their failure behavior.
- `--result --full` now exits naturally so piped stdout drains completely before process termination.

### Tests

- Added unit and runner regression coverage for merged stderr authentication
  warnings plus a valid Grok JSON result, and for cancelled/empty and nonzero
  auth failures. The runner case also proves one vendor spawn and a nonempty
  parsed output body.

## [0.32.0] - 2026-07-18

### Fixed

- **grok adapter `knownGood` was stale, breaking every `verified-latest`
  dispatch to grok.** xAI rotated the Grok Build CLI's model line between
  2026-06-02 and 2026-07-16: `grok-build` and `grok-composer-2.5-fast` (the
  prior `knownGood`) both now return `Couldn't set model '<x>': Invalid
  params: "unknown model id"`. `knownGood` is now `['grok-4.5']`
  (`cli/src/vendors/grok.js`, live-verified 2026-07-18 via
  `grok -p ... -m grok-4.5` micro-test), and `DEFAULT_MODEL` follows.
  See `ISSUE-grok-model-line-rotation-stale-knownGood.md`.

### Changed

- **`hopper-dispatch --probe grok` now live-parses `grok models` instead of
  returning a hardcoded static catalog.** This was the deeper root cause
  behind the knownGood staleness above: the old probe admitted in its own
  comments that live introspection was an unimplemented follow-up, so
  `--probe grok` could never self-heal a model-line rotation — it just wrote
  the same stale hardcoded list back to the cache. `cli/src/vendor-probe/grok.js`
  now spawns `grok models` (one subprocess, 30s timeout, no retry — mirrors
  the codex/opencode/kimi probe pattern), parses the "Available models:"
  bullet list (new exported pure parser `parseGrokModelsList`), and reports
  `introspection_supported: 'full'` with the live catalog. On spawn/parse
  failure it degrades honestly to the adapter's static `knownGood`
  (`introspection_supported: 'partial'`, notes explain why) instead of
  silently reporting stale or empty data. `estimateSpawns()` in
  `cli/bin/hopper-dispatch` updated (grok: 0 → 1 subprocess per probe).

### Documentation

- `docs/release/INSTALL-MATRIX.md`, `commands/models.md`,
  `cli/src/scaffold.js`'s example vendor table: grok references updated from
  `grok-build` to `grok-4.5` and from "static" to "live `grok models` parse
  with static fallback".
- Recorded a follow-up hardening idea in
  `ISSUE-grok-model-line-rotation-stale-knownGood.md`: `--check-model`'s
  `verified` verdict and the `verified-latest` sentinel resolution
  (`cli/src/model-check.js`, `cli/src/policy.js`) trust the static
  `knownGood` list unconditionally and never cross-check it against a fresh
  probe cache, so a stale `knownGood` entry (as above) produces a false
  "verified" even on a machine that has already probed and knows better.
  `cli/src/setup.js`'s `--setup --deep` / `--doctor --deep` path already has
  a live-vs-static reconciliation mechanism (`modelReconcile` /
  `reconcileModels`) but `--check-model` and `verified-latest` don't reuse
  it. Not fixed in this release — flagged for follow-up.

### Tests

- `tests/unit/vendor-probe.test.js`: 8 new grok cases — 4 pure-function
  fixtures for `parseGrokModelsList` (single model, multiple models with
  dash/asterisk leaders, missing header, header with no bullets) + 3
  fake-binary integration tests covering the `full` / `partial`-fallback /
  `none` introspection paths.
- Updated 3 existing tests that read the live grok adapter state and
  asserted the now-retired `grok-build` value: `tests/unit/
  dispatch-fallback-chain.test.js`, `tests/unit/vendor-model-auth.test.js`,
  `tests/unit/vendors-contract.test.js`.

### Sync points touched

`package.json`, `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`,
`.claude-plugin/marketplace.json` (catalog + plugin entry), `commands/smoke.md`,
`commands/vendors.md`; `plugins/hopper/` vendored copy refreshed via
`node scripts/sync-vendored-plugin.mjs`.
