# Phase 6b dogfood — 5-vendor parallel audit (self-meta)

**Date:** 2026-05-21
**Dispatched by:** Leader (Claude Code TUI, via hopper-plugin freshly installed)
**Target:** Phase 6b commit `ed16903` (probe + cache + soft-warn)
**Intended reviewers:** codex gpt-5.5 xhigh · kimi -m kimi-thinking · opencode deepseek/deepseek-v4-flash high · copilot claude-sonnet-4.6 · agy
**Verdict:** No vendor produced an audit verdict. **All 5 timed out or failed before writing findings.**

This dogfood produced more value as a **meta-audit of hopper-plugin itself** than as an audit of Phase 6b code. Phase 6b R1 and R2 audits remain the authoritative review of `ed16903`; this document is about what *trying to run* a 5-vendor audit revealed about the dispatch system.

---

## Result table

| Vendor   | Model                          | Duration | Status | Adapter timeout | Root cause |
|----------|--------------------------------|----------|--------|-----------------|------------|
| codex    | gpt-5.5 xhigh                  | 15:00    | timeout | 900s (xhigh) | Was running the test suite (passed test 313 of ~341 when killed); deep mid-investigation. |
| copilot  | claude-sonnet-4.6              | 2:02     | timeout | 120s | Killed just after declaring "Locking task and reading source files now." Context-load barely complete. |
| opencode | deepseek/deepseek-v4-flash hi  | 3:01     | timeout | 180s | Read ~10 source files, was about to write findings. |
| kimi     | -m kimi-thinking               | 18s      | error  | (n/a — fast fail) | `LLM not set`: alias `kimi-thinking` not defined in user's `~/.kimi/config.toml`. |
| agy      | (gemini-3.5-flash baked-in)    | 0.5s     | error  | (n/a — spawn fail) | `spawn agy ENOENT`: dispatch-side `spawn('agy')` doesn't apply Windows PATHEXT to find `agy.exe`. |

---

## The single dominant finding

### [F1] P0 — Adapter `timeoutMs()` is hardcoded per-vendor and task-type-blind

Every vendor adapter returns a fixed (or reasoning-keyed) timeout. None of them know what `task-type` is being executed.

| Adapter | File | Line | Value |
|---|---|---|---|
| codex | `cli/src/vendors/codex.js` | 70 | `xhigh → 900s, high → 600s, default → 300s` |
| copilot | `cli/src/vendors/copilot.js` | 62 | `120s` |
| opencode | `cli/src/vendors/opencode.js` | 75 | `180s` |
| kimi | `cli/src/vendors/kimi.js` | 71 | `180s` (despite `kimi-thinking` quirk note) |
| agy | `cli/src/vendors/agy.js` | 122 | `360s` |

**Root cause.** These timeouts were tuned for `code-impl` task-type (write code, run tests, ship). `code-review-adversarial` is structurally different work: the reviewer reads dozens of files, runs the whole test suite, then writes findings. The 4 vendors that didn't fail-fast (codex, copilot, opencode, and presumably the would-be kimi/agy paths) all spent their entire time budget on context-load + investigation and were killed before writing a verdict.

**Reproduction count.** Three distinct vendors timed out at three different ceilings in this single dogfood. The pattern was already documented in `T-AUDIT-PH5-kimi` (180s timeout, 0-byte output) and is now reproduced across kimi/copilot/opencode/codex — five timeouts across two dogfood runs.

**Recommended fix.** Move from `adapter.timeoutMs(opts)` to `adapter.timeoutMs(opts, taskType)`. Map task-type → category → timeout floor:
- `code-impl` / `sidecar-polish` → keep current values
- `code-review-adversarial` / `code-review-acceptance` → 30–45 min minimum
- `spec-blindspot-hunt` → 15–20 min
Or simpler: have the runner override the adapter ceiling for review task-types.

This is a **Phase 6c candidate** and the highest-leverage Phase 6b-adjacent improvement available.

---

## Three further hopper-plugin findings the dogfood surfaced

### [F2] P1 — agy adapter dispatch path doesn't use `path-resolve.js`

**Symptom.** `spawn agy ENOENT` in 521ms, even though `agy.exe` exists at `~/AppData/Local/agy/bin/agy.exe` (confirmed earlier; the *probe* path resolves it fine).

**Root cause.** `cli/src/vendor-probe/agy.js` uses `resolveCommandOnPath('agy')` which walks PATH + PATHEXT and returns `.exe`. The *dispatch* path in `cli/src/vendors/agy.js` (and likely the others — needs verification) hands `'agy'` directly to Node's `spawn()`, which on Windows does not apply PATHEXT unless `shell: true`. The probe adapter avoids this by construction; the vendor adapter doesn't.

**Verification.** Probe runs fine: `node cli/bin/hopper-dispatch --probe agy` succeeded earlier this session. Dispatch ENOENTs immediately on the same PATH.

**Recommended fix.** Route all vendor-spawn through `resolveCommandOnPath()` before `spawn()`. Single line in each adapter's `args()` builder, or one place in `subprocess.js`. Same fix pattern as the path-resolve fix already shipped in Phase 6a.

### [P1] kimi soft-warn message could suggest the specific fix

**Symptom.** Phase 6b's soft-warn correctly fired before dispatch:
```
warn: model 'kimi-thinking' not in cached list for kimi
cached models (1.5h ago): kimi-code/kimi-for-coding
proceeding anyway; run `hopper-dispatch --probe kimi` to refresh cache if vendor recently added it
```
Dispatch proceeded (non-blocking, correct), then failed 18s later with `LLM not set`.

**Root cause analysis.** The user's `~/.kimi/config.toml` only has `[models."kimi-code/kimi-for-coding"]`. Kimi-cli rejects any `-m <alias>` not in the config. The kimi adapter's documentation says `-m kimi-thinking` is the default, but that assumes the user has defined that alias.

**Recommended fix.** Soft-warn could detect this specific class (kimi + config-only introspection + model not in config) and append: `kimi requires '[models.kimi-thinking]' block in ~/.kimi/config.toml; either add the alias or dispatch with --model kimi-code/kimi-for-coding`. Lookup is a small enhancement to `warnIfModelUnknown` in `cli/bin/hopper-dispatch`.

### [P2] copilot timeoutMs is most aggressively misaligned

Copilot was killed at 122s, just as it announced "Locking task and reading source files now." It barely loaded the protocol context. 120s for a code review task is unrealistic by an order of magnitude — even a `--smoke` of copilot routinely exceeds 60s on cold start. This is a special case of F1 but worth calling out: any audit-class dispatch to copilot under the current adapter timeout is structurally guaranteed to fail.

---

## Validations the dogfood proved (positive results)

| What was validated | Evidence |
|---|---|
| **Phase 6b soft-warn fires correctly + non-blocking** | kimi-thinking soft-warn printed before dispatch; dispatch proceeded; the warning correctly predicted the LLM-not-set failure. The non-blocking design choice was right (the warning told the user what was wrong; the system didn't second-guess them). |
| **All 5 vendors registered + dispatched** | 5 background runner PIDs spawned within 25s of each other. `--jobs` correctly showed in-progress state. queue.md row updates atomic per dispatch. |
| **Parallel `--background` structure works end-to-end** | Per-task `output.md` + `output.log` files all created in `.hopper/handoffs/`. Frontmatter populated. No collisions. |
| **Adapter-level failure classification** | kimi → `unknown-fail`; agy → `spawn ENOENT`; copilot/opencode/codex → `timeout`. Each correctly tagged `adapter_status` in frontmatter. |
| **Phase 6b probe + cache flow** | Pre-dispatch `--models kimi` correctly showed the user's actual local model list (1 entry) and informed the soft-warn. |

The protocol layer works. The vendor-adapter timeout layer is the bottleneck.

---

## Strategic / essay implication

This is a real practitioner story for the essay: **5 vendors, 5 different failure modes, 1 common root cause — the harness assumed task-types it hadn't generalized.** The dogfood didn't validate Phase 6b code (R1 + R2 already did that); it validated the *thesis* by exposing exactly the kind of cross-vendor mis-assumption that motivated llm-hopper in the first place. The fix is small. The lesson — adapters need to know what they're being asked to do, not just how to invoke their CLI — is generalizable beyond this codebase.

---

## Recommended follow-ups (prioritized)

1. **Phase 6c: task-type-aware timeouts.** Change `adapter.timeoutMs(opts)` to `adapter.timeoutMs(opts, taskType)`. Default review tasks to 30 min floor. Single-file changes per adapter + one signature change in runner. Estimated ≤ 1 hour. **High strategic value: directly enables this exact dogfood to actually run next time.**
2. **F2: route vendor `spawn()` through `resolveCommandOnPath()`.** Trivial fix per adapter; reuses Phase 6a machinery. Tests already exist for path-resolve; need one regression test per adapter.
3. **Re-run the 5-vendor audit** after #1 lands. The point of this dogfood was to surface the cross-vendor verdict on Phase 6b; only codex (R1+R2) and now codex-truncated (this run) have spoken.
4. **Enhance soft-warn for kimi config-only case** (P1 above). Small UX upgrade; not blocking anything.

---

## Files written by this dogfood

- This document: `docs/audit/phase-6b-dogfood-5vendor.md`
- 5 vendor outputs: `.hopper/handoffs/T-AUDIT-PH6B-{codex,kimi,opencode,copilot,agy}-output.md` + matching `.log` files (all are truncated/failed; preserved as evidence)
- 5 queue.md rows (`T-AUDIT-PH6B-*` with status updates done automatically by runner)
- 5 leader-tasklist.md task spec sections (the shared audit pack + per-vendor framing)
