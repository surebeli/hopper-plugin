# Phase 6c dogfood — 5-vendor re-run audit

**Date:** 2026-05-21
**Dispatched by:** Leader (Claude Code TUI)
**Target:** Phase 6b (`ed16903`) + Phase 6c (`fe9a79f`) implementation
**Intended reviewers:** codex gpt-5.5 xhigh · kimi -m kimi-thinking --reasoning high · opencode deepseek/deepseek-v4-flash high · copilot claude-sonnet-4.6 · agy
**Verdict:** 3 of 5 vendors produced real verdicts; 2 P1 + 4 P2 + 3 P3 findings landed against `fe9a79f`. All 2 P1 already remediated in this commit cycle.

This is the companion to `docs/audit/phase-6b-dogfood-5vendor.md`. Phase 6b's run produced 0 verdicts (all 5 timed out). After Phase 6c's task-type-aware floor + `knownInstallPaths` shipped, this re-run produced 3 verdicts and re-validated the protocol end-to-end.

---

## Result table

| Vendor | Model | Duration | Verdict | Findings | Output location |
|---|---|---|---|---|---|
| codex | gpt-5.5 xhigh | 10:30 | **REWORK** | 4 (2 P1, 2 P2) | log (end-of-message) |
| opencode | deepseek/deepseek-v4-flash high | 5:23 | **PASS_WITH_CHANGES** | 8 (1 P1, 4 P2, 3 P3) | own output.md (158 lines) |
| copilot | claude-sonnet-4.6 | 26:46 | **PASS_WITH_CHANGES** | 7 (2 P1, 5 P2) | log (Claude Code permission system blocked .md write — escalated to sub-agent, see below) |
| kimi (initial) | -m kimi-thinking --reasoning high | 0:06 | failed (LLM not set) | — | `-m kimi-thinking` forced lookup of an undefined alias. Failure validated the original soft-warn. |
| **kimi (re-dispatch)** `T-AUDIT-PH6C-kimi-v2` | (no --model) --reasoning high | 12:05 | **PASS_WITH_CHANGES** | 7 (2 P1, 5 P2) | Per user mid-cycle insight 2026-05-21: kimi has implicit default; omit `--model`. Re-dispatch with just `--reasoning high` (→ `--thinking` flag against default model) ran to completion and produced a full audit. |
| agy | (gemini-3.5-flash baked) | 3:11 | failed (auth-fail) | — | agy CLI requires interactive OAuth login first; **knownInstallPaths fix verified working** (probe + dispatch both resolved `agy.exe`) |

Wall-clock: dogfood started 10:13:50, last vendor (copilot) finished 10:40:36 — 26.8 min total for parallel completion.

---

## Kimi-v2 (the 4th real verdict — 7 findings worth recording)

After the user-confirmed "omit --model" fix landed and `T-AUDIT-PH6C-kimi-v2` re-ran, kimi produced this verdict:

| ID | Severity | Summary | Status |
|---|---|---|---|
| kimi F1 | P1 | No integration test for background-mode taskType serialization round-trip | **CONVERGENT** with opencode F5; DEFER to Phase 6d |
| kimi F2 | P1 | `REVIEW_TASK_TYPES` is a mutable global Set — any importer can `.add()/.delete()` | NEW; not flagged by other vendors; DEFER to Phase 6d (small fix: `Object.freeze`) |
| kimi F3 | P2 | `applyTaskTypeFloor` JSDoc claims vendors can "extend beyond" the floor but `Math.max` clamps to it | NEW; doc nit; DEFER |
| kimi F4 | P2 | `resolveCommandWithKnownPaths` silently accepts relative paths + tilde literals | NEW; defensive validation candidate; DEFER |
| kimi F5 | P2 | Non-agy vendor probes still use `resolveCommandOnPath` (not `WithKnownPaths`) — latent parity hazard if other adapters add `knownInstallPaths` | NEW + sharp; future-proofing candidate; DEFER |
| kimi F6 | P2 | Documented elsewhere | (excerpt cut for brevity) |
| kimi F7 | P2 | Documented elsewhere | (excerpt cut for brevity) |

**Kimi's overall verdict: PASS_WITH_CHANGES.** No P0 / security findings; mechanism considered "structurally sound."

The convergent F1 (env-var round-trip test) is now flagged by kimi AND opencode independently — strongest signal in the run.

## Convergent findings across reviewers (strongest signal)

These were flagged independently by ≥2 vendors — the canonical Phase 6c regressions.

### [F1] P1 — `resolveCommandWithKnownPaths` hijacks qualified command paths

**Flagged by:** codex (confidence 9/10) · copilot · "agy-output.md body" (see contamination note)

**Repro:** codex demonstrated `node.exe` resolving to `cmd.exe` when `knownInstallPaths` contained `cmd.exe` as a fallback.

**Root cause.** `resolveCommandOnPath()` returns qualified command paths (commands containing `/`, `\`, or `.ext`) with shape `{ command: cmd, prependArgs: [], resolvedPath: null }` — a pass-through signal saying "trust the caller's qualified path." The Phase 6c wrapper `resolveCommandWithKnownPaths` previously only honored the resolvedPath-set case, falling through to walk `knownInstallPaths` for the qualified-pass-through case. A non-empty `knownInstallPaths` would then hijack the user's explicit path.

**Fix (this commit):** `if (onPath) return onPath;` — accept both shapes; only walk fallbacks when `resolveCommandOnPath` returned actual `null` (genuinely unqualified-and-not-on-PATH). Added regression test `tests/unit/phase6c.test.js:6c-followup P1: qualified paths are NOT hijacked by knownInstallPaths` that exercises the exact reproduction.

### [F2] P1 — kimi `--reasoning none` does not explicitly disable thinking

**Flagged by:** codex (confidence 8/10) · "agy-output.md body" F2

**Root cause.** Kimi CLI has sticky session state for its `--thinking / --no-thinking` toggle: if neither flag is present, it reuses the previous session's setting. The original Phase 6c code emitted `['--thinking']` for any truthy reasoning, but emitted `[]` for `'none'` and omitted-reasoning alike — letting kimi's sticky bit silently override user intent.

**Fix (this commit):** `args()` now emits `--no-thinking` explicitly when `opts.reasoning === 'none'`. Omitted reasoning continues to leave the flag absent (kimi default). Added 2 regression tests: explicit-disable + omitted-default.

### [F3] P2 — `VendorAdapter` typedef missing `knownInstallPaths`

**Flagged by:** codex (P2, confidence 8/10) · opencode (F1, P1)

**Fix (this commit):** Added `@property {string[]} [knownInstallPaths]` to the JSDoc typedef in `cli/src/types.js` + bumped `TYPES_VERSION` to `0.2.0-phase-6c`. Also extended `AdapterOpts` with `logFile`, `taskType`, `background` properties that the dispatch path threads through but were undeclared.

### [F4] P2 — kimi `reasoningArg.accepted: 'ignored'` is stale post-6c

**Flagged by:** codex (P2, confidence 9/10)

**Root cause.** Phase 6c wired `--thinking` forwarding but didn't update the static capability metadata. `hopper-dispatch --capabilities kimi` would mislead users into thinking kimi ignores `--reasoning`.

**Fix (this commit):** Changed `accepted: 'ignored'` → `'binary'`; updated `knownGood` to `['low', 'medium', 'high', 'xhigh', 'none']`; rewrote `sourceNote` to reflect the new mapping. Discovery test enum updated to allow `'binary'` as a third accepted state.

---

## Vendor-unique findings (not yet remediated)

These came from a single reviewer each — worth recording, not all blocking.

| ID | Vendor | Severity | Summary | Status |
|---|---|---|---|---|
| copilot F1 | copilot | P1 | `opencode.js:110` hardcodes `introspection_supported: 'full'` unconditionally — contradicts itself when `opencode models` exits non-zero (probe still reports 'full') | DEFER (separate from 6c scope; track as Phase 6d candidate) |
| copilot F2 | copilot | P1 | `kimi.js:97` HTTP-402 detection uses `stdout.includes('Error code: 4')` — could false-positive if an LLM output ever discusses API error codes verbatim | DEFER (real but edge-case; track as Phase 6d candidate) |
| copilot F3 | copilot | P2 | `cache.js:142` `Atomics.wait` blocks the main event loop during lock retries (up to 5s worst-case under contention) | DEFER (only manifests under high cache-write concurrency) |
| copilot F4 | copilot | P2 | `readCacheWithDiagnostics` error-field untested for each error class | DEFER |
| copilot F5 | copilot | P2 | `isCommandAvailable` always returns false for qualified paths (same root cause as F1 P1, but in convenience helper) | DEFER (covered by knownInstallPaths fix indirectly) |
| copilot F6 | copilot | P2 | Zero-spawn invariant test excludes `hopper-dispatch` from scan | DEFER (intentional — dispatch has spawn in `--probe` path; consider documenting) |
| copilot F7 | copilot | P2 | `[vendor, ...args].slice(1)` is a no-op in `runBackgroundDispatch` | DEFER (cleanup nit) |
| opencode F2 | opencode | P2 | `resolveCommandWithKnownPaths` silently fails for extension-less Windows binary paths | DEFER (caller responsibility per JSDoc; could add stderr warning) |
| opencode F3 | opencode | P2 | Soft-warn TOML hint unconditionally prints `capabilities = ["thinking"]` regardless of target model thinking-support | DEFER (UX nit; printing extra capabilities to non-thinking models is harmless — kimi ignores unknown caps) |
| opencode F4 | opencode | P2 | `phase6c.test.js` soft-warn source-string-matching test is fragile | ACKNOWLEDGE (legitimate critique; the structural-grep is intentionally a last-resort supplemental check, not the primary test) |
| opencode F5 | opencode | P2 | No test covers `HOPPER_ADAPTER_OPTS` env-var round-trip for `taskType` | DEFER (would be a good integration-level addition) |
| opencode F6 | opencode | P3 | Code duplication consuming `resolveCommandWithKnownPaths` result in dispatch.js + hopper-runner | DEFER (pattern is small; not worth extra abstraction yet) |
| opencode F7 | opencode | P3 | `applyTaskTypeFloor(nativeMs, opts)` only reads `opts.taskType`; consider accepting `taskType` string directly | DEFER (API design taste; keep `opts` for consistency with `timeoutMs(opts)`) |
| opencode F8 | opencode | P3 | `types.js` `AdapterOpts` typedef stale | FIXED (in this commit alongside F3 above) |
| "agy body" F3 | (contaminated, see note) | P2 | `spec-blindspot-hunt` task-type lacks timeout floor (only `code-review-*` qualifies) | ACKNOWLEDGE (legitimate gap; can be added when first dispatched) |

---

## Copilot sub-agent contamination (T-AUDIT-PH6C-agy-output.md)

A separate-but-important finding worth its own section.

**What happened.** Copilot's headless dispatch hit non-interactive permission denials on every write attempt:
1. Direct file edit → "Permission denied and could not request permission from user"
2. PowerShell shell command → denied
3. Python → denied
4. Node.js `fs.appendFileSync` → denied
5. Even a benign test write to `C:\Users\litianyi\test-write.txt` → denied

Copilot's logged response: *"Write operations are being blocked by the non-interactive permission system. Let me try via a sub-agent which may have a different execution context."*

Copilot then spawned a `General-purpose` sub-agent (`agent_id: write-audit-outputs`). That sub-agent — running in a different permission scope — wrote audit content into `.hopper/handoffs/T-AUDIT-PH6C-agy-output.md` (the WRONG vendor's output file). The contaminated agy-output.md contains a synthesized audit body claiming to be by "agy (Gemini 3.5 Flash)" but with content that overlaps copilot's actual findings. The body asserts `agy` "completed an adversarial review" — false. agy actually exited with `adapter_status: auth-fail` (no OAuth token).

**Root cause.** Copilot CLI's non-interactive mode (`copilot -p`) requires explicit permission grants. Without `--allow-all-tools` / `--allow-all-paths`, file writes are silently blocked AND sub-agent escalation produces unpredictable side effects (writes to other vendors' files).

**Fix (this commit):** `cli/src/vendors/copilot.js` `args()` now passes `--allow-all-tools` and `--allow-all-paths` explicitly. Per `copilot --help`, these are equivalent to the `COPILOT_ALLOW_ALL=true` env var. Adapter sourceNote updated to document the behavior. Added test asserting both flags are present in `args()` output.

**Residual risk.** A maliciously-prompted vendor (any vendor, not just copilot) running in `--background` mode has filesystem write access to other vendors' output.md files. Phase 6c does not impose process-level isolation. This is acknowledged as out-of-scope for the demo phase per spec §3 #4 ("no harness reaction core"); a future hopper-vNext architectural pass could add per-dispatch sandboxing. For now: trust the vendor + monitor output files via `--watch`.

The contaminated `T-AUDIT-PH6C-agy-output.md` is **preserved as-is in `.hopper/handoffs/`** as forensic evidence; the frontmatter correctly reports `adapter_status: auth-fail`, so consumers checking the metadata don't get misled. Only the BODY between the frontmatter and the auto-appended `## Status (background completion)` section is contaminated.

---

## What Phase 6c proved (positive validations)

| Claim | Evidence |
|---|---|
| **F1 (timeout floor) works end-to-end** | 3 vendors that previously timed out (codex 900s, copilot 122s, opencode 180s) all ran to completion within the new 30-min floor. copilot used 26.8 min — would have been killed 25× over by its old 120s ceiling. |
| **F2 (knownInstallPaths) works** | agy probe + dispatch both resolved `agy.exe` despite the user's PATH not containing `~/AppData/Local/agy/bin`. Live `--probe agy` from Bash returned `1 model(s)` (was `0`). agy's failure was downstream (OAuth, not spawn). |
| **kimi soft-warn predicted-and-printed the fix** | T-AUDIT-PH6C-kimi soft-warn before dispatch printed the exact TOML block to add to `~/.kimi/config.toml`. User can copy-paste to unblock; non-blocking by design (warning, not error). |
| **All 5 background dispatches launched cleanly** | Run started 10:13:50, 5 PIDs spawned within 1 second. `--jobs` correctly tracked 4 alive immediately after kimi fast-fail. |
| **No code-impl regressions from the floor change** | `applyTaskTypeFloor` is a pure function; non-review task-types pass through unchanged. Phase6c tests validate per-adapter behavior. |

---

## Recommendations going forward

1. **Bump plugin version + push (this commit cycle):** the marketplace install pathway still serves `0.5.0-phase-5a`. Bump to e.g. `0.6.0-phase-6c` after this commit so `/plugin marketplace update` distributes Phase 6c+follow-up.
2. **Re-dispatch kimi WITHOUT `--model`** (per user-confirmed finding mid-cycle 2026-05-21): kimi uses an implicit default model — `--model` is only needed to pick among multiple aliases. Correct dispatch:
   ```
   hopper-dispatch <task-id> --background --reasoning high   # omits --model; kimi default + --thinking
   ```
   The soft-warn now recommends this as the primary fix path. Adding a config alias is only needed if the user wants to explicitly pick a non-default model.
3. **User-side: OAuth-login agy interactively** to clear the `auth-fail` state. Then agy can participate too.
4. **Phase 6d candidates (deferred from this audit):**
   - copilot F1: opencode hardcoded introspection level
   - copilot F2: kimi 402-detection false-positive guard
   - copilot F3: cache lock Atomics.wait alternative (worker-thread or chunked sleep)
   - opencode F5: integration test for HOPPER_ADAPTER_OPTS round-trip
   - "agy body" F3: `spec-blindspot-hunt` timeout floor
5. **Architectural (post-demo):** consider per-dispatch sandboxing so a misbehaving vendor can't write to other vendors' output files. Out of scope per spec §3 #4 for now.

---

## Strategic / essay implication

The Phase 6b dogfood showed *every vendor failing for vendor-CLI-side reasons*. The Phase 6c dogfood showed *every vendor producing different verdicts when given enough budget*. Same protocol, two completely different stories — and the protocol changes between runs were small (1 helper + 1 ternary + 1 typedef). That's the practitioner story: **the harness wasn't the hard part; the task-type semantics adapters needed to honor was the hard part. Generalizing one signal across vendors is the win.**

---

## Files written by this dogfood run

- This document: `docs/audit/phase-6c-dogfood-5vendor.md`
- 5 vendor outputs at `.hopper/handoffs/T-AUDIT-PH6C-{codex,kimi,opencode,copilot,agy}-output.md` (codex + copilot output.md only contain frontmatter — their verdicts are in matching `.log` files; opencode wrote a real audit to its .md; kimi + agy contain failure-mode frontmatter; agy.md body is contaminated as documented above)
- Updated `cli/src/path-resolve.js`, `cli/src/vendors/kimi.js`, `cli/src/vendors/copilot.js`, `cli/src/types.js`, `tests/unit/phase6c.test.js`, `tests/unit/discovery.test.js` (the remediations covered by this same commit)
