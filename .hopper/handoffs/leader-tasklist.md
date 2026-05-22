# Leader Task List — hopper-plugin (Demo)

Anchor: `.hopper/handoffs/leader-tasklist.md::root`

- Source spec: `F:\workspace\ai\llm-hopper\docs\plans\2026-05-19-hopper-plugin-demo-spec.md` (v1.1.1, post-codex)
- Issued by: Strategy Advisor (Claude Opus 4.7), 2026-05-20
- Status: T-PLUGIN-00 ready for dispatch; T-PLUGIN-01..10 pending T-PLUGIN-00 outputs

---

## Task conventions

- Each task = one git commit, prefix `[T-PLUGIN-NN]` or `[review:T-PLUGIN-NN]`
- Builder runs acceptance self-check, then writes `<task-id>-output.md` per upgraded schema (Verdict + Commit SHA + Checks + cursor-aware Next)
- §12 Recipient pre-execution gate (per llm-hopper commit `20c2df5`) is MANDATORY before Builder starts §1 of any task spec
- Critic review on T-PLUGIN-10 (independent verification)
- Severity: S = 1-2h, M = half-day, L = full day

---

## **T-PLUGIN-00** — Host-lifecycle spike (Phase 0, Day 1 morning)

- Role: builder
- Effort: S (4h hard cap)
- Priority: high
- Depends: none

### 1. Context (read first)

- Spec section: `docs/plans/2026-05-19-hopper-plugin-demo-spec.md` §6 Phase 0 (full task definition)
- Strategy dispatch: `.hopper/handoffs/strategy-2026-05-20-T-PLUGIN-00-dispatch.md` §3 (P0 of this dispatch)
- Hard acceptance criteria for the spike's outputs: `docs/plans/2026-05-19-hopper-plugin-demo-spec.md` §3 #2 Tier A/B/C definitions
- Background: this is a host-lifecycle smoke spike that proves OR KILLS three feasibility claims before any production code is written. Outputs become source-of-truth for T-PLUGIN-01..10.

### 2. Scope

Three prongs, each with concrete acceptance:

#### Prong 1: Claude Code plugin registration
- Write a minimal Claude Code plugin manifest (probably `.claude-plugin/plugin.json` per current Claude Code plugin docs — VERIFY actual schema by reading Claude Code docs / existing plugins; do NOT assume)
- Manifest declares a single slash command `/hopper:smoke` that prints "hopper smoke" to chat
- Install plugin in a Claude Code session, invoke `/hopper:smoke`, see expected output
- DOCUMENT in `docs/spikes/T-PLUGIN-00-resolved.md`:
  - Manifest file path (relative to repo root)
  - Manifest schema version
  - Validator command (if any)
  - Command namespace prefix (`hopper:` vs other)
  - Entrypoint shape (TypeScript? JavaScript? shell script?)
  - Package manager (npm / bun / pnpm) — recommendation + reasoning
  - TypeScript version (if using TS)

#### Prong 2: Codex CLI noninteractive subprocess
- Invoke `codex exec` (or `codex` with appropriate flags) noninteractively such that stdin "say HOPPER_OK" produces stdout containing "HOPPER_OK"
- Try with sandbox=read-only, model_reasoning_effort=medium, --json output
- DOCUMENT in `docs/spikes/T-PLUGIN-00-resolved.md`:
  - Exact codex invocation command line
  - Stdin contract (how task spec is passed)
  - Approval mode / sandbox flag chosen + reason
  - Recommended timeout value (seconds) + rationale
  - Process-tree kill behavior on Windows (since user is on Win11)
  - stderr handling (stream to chat? capture to log? both?)
  - cwd handling (`-C <path>`)
  - Auth-missing behavior (what does codex return? how should plugin surface?)

#### Prong 3: Standalone CLI baseline
- Write a 20-line Node/Bun script at `cli/bin/hopper-dispatch` that accepts a task-id arg and prints "hopper standalone got <task-id>" to stdout
- Make executable (chmod +x or PowerShell equivalent)
- Run from bare PowerShell / bash WITHOUT any Claude Code session, see expected output
- DOCUMENT in `docs/spikes/T-PLUGIN-00-resolved.md`:
  - Node vs Bun decision + reasoning
  - Shebang / Windows .cmd wrapper approach
  - Path resolution (where users add to PATH)

### 3. Acceptance criteria (machine-checkable)

1. ✓ Prong 1 — Manifest file exists at documented path; `/hopper:smoke` invocation in Claude Code session prints "hopper smoke" (manual verify, screenshot or text-paste evidence)
2. ✓ Prong 2 — `echo "say HOPPER_OK" | codex exec [flags]` (exact command from documented) prints "HOPPER_OK" to stdout in <30s
3. ✓ Prong 3 — `./cli/bin/hopper-dispatch T00-smoke` from bash prints "hopper standalone got T00-smoke"
4. ✓ `docs/spikes/T-PLUGIN-00-resolved.md` exists with all 3 prong's documented values (manifest schema/path/pkg-mgr/codex flags/timeout/kill/etc.)
5. ✓ Time spent ≤ 4 hours; if blocked or near cap, escalate (see §6)

### 4. Files Builder allowed to create/modify

- `cli/bin/hopper-dispatch` (Prong 3 — minimal script)
- `.claude-plugin/plugin.json` or wherever Prong 1 lands manifest (per resolved schema)
- `docs/spikes/T-PLUGIN-00-resolved.md` (NEW; the resolved-inputs source-of-truth)
- `.hopper/queue.md` (status flip per PING Step 3 / 7)
- `.hopper/COST-LOG.md` (Step 8 append)
- `.hopper/handoffs/T-PLUGIN-00-output.md` (Step 7.5 artifact)
- Optionally: `package.json` if Prong 1 requires it; document decision

### 5. Files Builder MUST NOT modify

- `.hopper/PING.md`
- `.hopper/MANIFEST.md` structure (data row addition OK, structure stays)
- `.hopper/AGENTS.md` role definitions
- Anything in sibling repo `F:\workspace\ai\llm-hopper`

### 6. Escalation path

- **Prong 1 fails** (e.g. Claude Code plugin manifest path not findable, slash command doesn't register): write `.hopper/handoffs/leader-ping-strategy-<dated>-T00-prong1-fail.md`, STOP. Strategy decides scope reduction.
- **Prong 2 fails** (e.g. codex doesn't accept noninteractive stdin cleanly, auth issues, sandbox blocks subprocess): write `leader-ping-strategy-<dated>-T00-prong2-fail.md`. This is more serious — Codex CLI host (Tier C) might be impossible.
- **Prong 3 fails** (rare): debug platform issue (Node/Bun on Windows). Should not fail.
- **Time cap (>4h)**: STOP regardless of progress, write `leader-status-<dated>-T00-progress.md` with what's done + what's blocked.

### 7. Closure mechanism

- Write `.hopper/handoffs/T-PLUGIN-00-output.md` per `F:\workspace\ai\llm-hopper\.hopper\templates\builder-output.md` schema (Verdict / Commit SHA / Checks / cursor-aware Next)
- `docs/spikes/T-PLUGIN-00-resolved.md` is the AUX deliverable — referenced by all downstream tasks
- Flip queue.md row pending → in-progress → done
- Commit prefix `[T-PLUGIN-00]`
- After commit: per goal-condition #2 (phase completion), Strategy auto-invokes `/codex` cross-audit on T-PLUGIN-00-resolved.md before T-PLUGIN-01 dispatch

### 8. Edge cases / known gotchas

- Claude Code plugin docs / schema may not be fully public; expect 30+ min reading docs / examples / experimenting
- Codex CLI on Windows may have quirks vs Linux; test specifically on Windows since that's the user's platform
- The "say HOPPER_OK" stdin test is a stand-in for full task-spec passing; if codex requires specific JSON or has prompt template overhead, document the gap

### 9. Open questions Builder might find

If Builder finds any of these during execution, write Open questions section in output.md + ping Leader before declaring done:
- "Should manifest live at repo root or under `hosts/claude-code/`?" → recommend `hosts/claude-code/.claude-plugin/plugin.json` so it's host-scoped from day 1
- "Should I commit `cli/bin/hopper-dispatch` even though it's just a stub?" → YES — it's part of the spike output proving baseline works
- "What if Claude Code plugin only loads when symlinked to a specific path?" → document the symlink requirement; that's exactly the kind of host-lifecycle gotcha the spike exists to find

### 10. Recipient pre-execution gate (per template §12)

Before starting Prong 1, Builder MUST complete:
1. Restate this task in 3-5 own-words bullets to chat
2. Identify top 3 hard prohibitions (see §5)
3. Identify most-likely-to-fire escalation trigger (probably Prong 2 codex sandbox issue)
4. State execution sequence (recommended: Prong 3 → Prong 1 → Prong 2 since Prong 3 is fastest and clearest baseline; document rationale if different order chosen)
5. Mirror §10 dispatcher self-check: any NO → ping Leader before executing

Skipping this gate = closure failure waiting to happen. The 2026-05-17 double-rework retro proved this.

---

## T-PLUGIN-01 to T-PLUGIN-10 — Pending T-PLUGIN-00 outputs

These tasks remain in `pending` status until T-PLUGIN-00 completes and `docs/spikes/T-PLUGIN-00-resolved.md` is written. Leader will detail each task spec post-spike, using the locked input values from the resolved doc.

Brief preview (full specs added post-spike):
- T-PLUGIN-01: Repo init + plugin manifest (uses resolved schema/path/pkg-mgr verbatim)
- T-PLUGIN-02 through 06: Core CLI logic (queue parser, agent resolver, spec extractor, subprocess wrapper, output writer)
- T-PLUGIN-07: Claude Code slash command wiring (Tier B full)
- T-PLUGIN-08: Cross-host adapters (Codex CLI Tier C if Prong 2 spike permits)
- T-PLUGIN-09: README + screencast
- T-PLUGIN-10: Critic end-to-end verification (3 hard acceptance criteria)

Refer to `F:\workspace\ai\llm-hopper\docs\plans\2026-05-19-hopper-plugin-demo-spec.md` §6 for current draft of each task.

---

## T-AUDIT-PH5-codex (Phase 5 audit by codex xhigh)

Third-party audit of hopper-plugin Phase 5 async dispatch (spec v2.1.0 §14). Repo root: F:/workspace/ai/hopper-plugin. Spec: F:/workspace/ai/llm-hopper/docs/plans/2026-05-19-hopper-plugin-demo-spec.md §14.

Files to audit:
- cli/src/background.js (frontmatter + isAlive + preflightDispatch + spawnDetached + assertPathSafe)
- cli/bin/hopper-runner (detached wrapper, single spawn, parseResult on exit)
- cli/bin/hopper-dispatch (--background --watch --jobs --reap flags)
- hosts/codex-cli/bin/hopper-codex + hosts/opencode/bin/hopper-opencode (--background passthrough + HOPPER_HOST_VENDOR)
- hosts/opencode/plugins/hopper-async.ts (OpenCode plugin via prompt_async)
- tests/integration/runner-single-spawn.test.js + tests/unit/background.test.js

Answer in this structure:

VERDICT: PASS | PASS_WITH_NOTES | REWORK | FAIL

FINDINGS (severity P0/P1/P2):
- Single-spawn invariant: ONE spawn() per dispatch, no retry?
- Path safety: assertPathSafe blocks symlink + .. escape?
- Concurrent dispatch race: TOCTOU window real?
- parseResult integration: kimi 402 / agy silent-fail correctly classified?
- Heterogeneous-only warning: actually fires in background path?
- §14 implementation faithful to spec?
- Windows risks: codex.cmd resolution? process.kill(pid,0) cross-platform real?
- Forbidden ops (§14.10): all 5 truly prevented or just policy-stated?

TOP-3 INSIGHTS PRIOR AUDITS MISSED.

STRONGEST HN ATTACK on this Phase 5 work + best rebuttal prep.

Length budget: ~1500 words. Be tough but fair.

---

## T-AUDIT-PH5-kimi (Phase 5 audit by kimi, cross-vendor perspective)

Third-party audit, parallel to T-AUDIT-PH5-codex. Same files, same questions. First real-vendor dogfood of kimi as a hopper-dispatched audit agent.

Files to audit:
- cli/src/background.js
- cli/bin/hopper-runner
- cli/bin/hopper-dispatch (--background, --watch, --jobs, --reap)
- hosts/codex-cli/bin/hopper-codex + hosts/opencode/bin/hopper-opencode
- hosts/opencode/plugins/hopper-async.ts
- Spec: F:/workspace/ai/llm-hopper/docs/plans/2026-05-19-hopper-plugin-demo-spec.md §14

Repo root: F:/workspace/ai/hopper-plugin.

Same audit structure as T-AUDIT-PH5-codex:

VERDICT: PASS | PASS_WITH_NOTES | REWORK | FAIL

FINDINGS (severity P0/P1/P2):
1. Single-spawn invariant — ONE spawn per dispatch, zero retry?
2. Path safety — assertPathSafe handles symlinks + .. escape?
3. Concurrent dispatch race — TOCTOU + tmp clobber actually possible?
4. parseResult integration in runner — kimi 402 / agy silent-fail correctly classified?
5. Heterogeneous-only warning — fires in background path or only sync?
6. §14 vs implementation — every claimed frontmatter field actually written?
7. Windows risks — codex.cmd resolution, signal 0 cross-platform?
8. Spec §14.10 forbidden ops — mechanically prevented or just documented?

TOP-3 INSIGHTS prior audits missed.

STRONGEST HN ATTACK on this Phase 5 work + best rebuttal prep.

Length budget: ~1500 words.

---

## T-AUDIT-PH6B audit pack (5 vendors, parallel)

Phase 6b just shipped (commit `ed16903`): asymmetric vendor probe + per-machine capability cache. Two rounds of codex strict audit already cleared (R1 + R2; see `docs/audit/phase-6b-strict-audit.md` and `phase-6b-strict-audit-r2.md`). This dogfood dispatches 5 heterogeneous vendors to cross-check what those rounds may still have missed.

**Repo root:** `F:/workspace/ai/hopper-plugin`
**Commit under audit:** `ed16903` (Phase 6b: probe + cache + soft-warn)

**Files to audit (newly added or significantly changed by Phase 6b):**
- `cli/src/cache.js` — per-machine cache; O_EXCL lockfile race fix; readCacheWithDiagnostics
- `cli/src/vendor-probe/codex.js` — JSON parsing of `codex debug models --bundled`; 5 reasoning levels
- `cli/src/vendor-probe/opencode.js` — text + ANSI strip + anchored identifier regex
- `cli/src/vendor-probe/kimi.js` — TOML parsing with quoted-key + bracket-in-key tolerance
- `cli/src/vendor-probe/copilot.js` — `version` + filesystem scan of agent .md files
- `cli/src/vendor-probe/agy.js` — static (zero spawn); identifier is bare `gemini-3.5-flash`
- `cli/src/vendors/index.js` — `probeVendor()` lazy-import carve-out
- `cli/bin/hopper-dispatch` — `--probe`, `--models`, `warnIfModelUnknown` helper
- `tests/unit/cache.test.js` — sync-barrier race test
- `tests/unit/vendor-probe.test.js` — 13 fixture-based parser tests

**Hard rules (any violation = at least P1):**
1. Spec §3 #4 no-harness-core: probe is opt-in diagnostic only; no retry/fallback/round-robin/circuit-breaker/consensus.
2. Single-spawn invariant: `cli/src/path-resolve.js`, `cli/src/vendors/index.js`, `cli/src/vendors/*.js` adapter files MUST remain zero-spawn. `vendor-probe/*.js` may spawn (lazy-import carve-out).
3. No hardcoded model lists in probe runtime path.
4. agy ≠ antigravity: probe adapter must not conflate the two binaries.
5. No Anthropic Agent SDK / `claude -p` / direct Anthropic SDK usage anywhere.

**Audit angles (cover all 8; flag any P0/P1 immediately):**
1. Cache race correctness — O_EXCL lockfile + re-read-merge inside critical section + stale-lock auto-clear; cross-platform.
2. Parser robustness — codex `.slug`, opencode anchored regex, kimi TOML alternation, copilot directory-scan.
3. Single-spawn invariant integrity — any `--check`/`--capabilities`/dispatch path that loads vendor-probe?
4. Probe timeout/process-tree hygiene — killProcessTree with detached on POSIX; 30s per spawn.
5. Soft-warn behavior — warnIfModelUnknown is non-blocking, called from both sync + background.
6. Schema/version safety — cache version field migration path.
7. Cross-platform fragility — Windows PATHEXT, UNC paths, symlink behavior.
8. Code/test alignment — do new tests actually exercise what they claim?

**Output (each vendor writes to `.hopper/handoffs/<task-id>-output.md`):**
- Summary (1 paragraph)
- Findings (severity-ordered): `[F<N>] P0/P1/P2: <one-line>` + Root cause + Recommended fix
- Verdict: PASS | PASS_WITH_NOTES | REWORK
- Top-3 things prior codex R1+R2 might have missed

Length budget per vendor: ~1500 words.

---

## T-AUDIT-PH6B-codex (Phase 6b audit by codex gpt-5.5 xhigh)

Vendor lens: codex with reasoning xhigh. Dispatched FRESH — audit per the T-AUDIT-PH6B audit pack above. Look for what a third pass would catch beyond R1/R2.

## T-AUDIT-PH6B-kimi (Phase 6b audit by kimi thinking)

Vendor lens: kimi -m kimi-thinking. Audit per the T-AUDIT-PH6B audit pack above. Particularly valuable for spotting cross-platform or test-design issues codex's heavy reasoning may have glossed.

WARNING: Prior T-AUDIT-PH5-kimi failed at 180s timeout. If you hit timeout, output whatever you have — partial findings are still data.

## T-AUDIT-PH6B-opencode (Phase 6b audit by opencode deepseek-v4-flash high)

Vendor lens: opencode --model deepseek/deepseek-v4-flash --reasoning high. Audit per the audit pack above. Second-tier vendor perspective on real-bug vs over-engineering.

## T-AUDIT-PH6B-copilot (Phase 6b audit by copilot Sonnet 4.6)

Vendor lens: copilot --model claude-sonnet-4.6. Audit per the audit pack above. Quota-metered; keep findings focused, verdict-driven.

## T-AUDIT-PH6B-agy (Phase 6b audit by agy gemini-3.5-flash)

Vendor lens: agy (Antigravity), gemini-3.5-flash baked in; no model/reasoning flags. Audit per the audit pack above. If silent-auth-fail, adapter reports auth-fail rather than empty output.

## T-AUDIT-PH6C-kimi-v2 (kimi re-dispatch without --model)

Vendor lens: kimi default model + `--thinking` flag (Phase 6c maps `--reasoning high` → `--thinking`). Per user-confirmed finding 2026-05-21: kimi accepts `--prompt "X" --no-thinking` without `-m`; the implicit default model is used. The original T-AUDIT-PH6C-kimi failed because we forced `-m kimi-thinking` (alias not defined). This re-run omits `--model` entirely. Audit per the T-AUDIT-PH6C audit pack above.

---

## T-AUDIT-PH6C audit pack (re-run after Phase 6c fixes)

**Background:** the first 5-vendor dogfood (T-AUDIT-PH6B-*) saw 5/5 timeouts and produced no verdicts; the dispatch system's adapter timeouts were mis-sized for review tasks. Phase 6c (commit `fe9a79f`) fixed:
- F1: review task-types floor at 30min (was 120s-900s)
- F2: agy resolvable via `knownInstallPaths` (no longer requires PATH update)
- P1: kimi `--thinking` wired
- P2: kimi soft-warn prints config TOML snippet

**Audit scope (this re-run):** Phase 6b implementation as the PRIMARY target (commit `ed16903`); Phase 6c (commit `fe9a79f`) as SECONDARY target (verifies the timeout + path-resolve changes didn't introduce regressions).

Same audit pack as T-AUDIT-PH6B (see above for the 8 audit angles + hard rules + output shape). Just longer budget per vendor (30min floor) and agy can actually spawn now.

## T-AUDIT-PH6C-codex (Phase 6c re-run by codex gpt-5.5 xhigh)

Per audit pack above. Codex completed deep work in the 6b run (read most of repo, ran test suite to test 313 of 341) but the 15min timeout killed it. With 30min floor it should have time to write a verdict.

## T-AUDIT-PH6C-kimi (Phase 6c re-run by kimi thinking)

Per audit pack above. Phase 6c wires `--thinking` flag. WARNING: still requires `[models.kimi-thinking]` in `~/.kimi/config.toml`. If absent, soft-warn now prints the exact TOML block to add — dispatch still proceeds and will fail with `LLM not set` until the user updates their config.

## T-AUDIT-PH6C-opencode (Phase 6c re-run by opencode deepseek-v4-flash high)

Per audit pack above. 30min floor applies. Read-most-of-repo-then-write-findings now feasible.

## T-AUDIT-PH6C-copilot (Phase 6c re-run by copilot Sonnet 4.6)

Per audit pack above. 30min floor (was 120s — the most aggressively misaligned vendor in 6b run).

## T-AUDIT-PH6C-agy (Phase 6c re-run by agy gemini-3.5-flash)

Per audit pack above. Phase 6c adds `knownInstallPaths` so agy resolves to `~/AppData/Local/agy/bin/agy.exe` even when PATH doesn't include that dir. WARNING: if user hasn't OAuth-authed agy interactively, will hit silent-auth-fail (empty stdout, exit 0; adapter detects via log inspection).

## T-PROG-R14-RESEARCH (R14 dashboard tail research dogfood)

- Task-type: code-impl
- Vendor: codex
- Reasoning: xhigh
- Priority: high
- Scope: research only; no source edits
- Dispatch: `hopper-dispatch T-PROG-R14-RESEARCH --background --reasoning xhigh`

### Context

v1.1 R14 connects v1.0 progress notification into the existing dashboard.
The risky server-side detail is truncate/rotate-aware tailing for files under
`.hopper/handoffs/`, especially on Windows NTFS where inode semantics differ
from POSIX. This task is also a dogfood run for v1.0 monitoring: start event,
frontmatter progress fields, terminal event, `--progress`, and `--watch-events`
should all reflect the background task lifecycle.

### Assignment

Research chokidar file-change handling plus truncate-aware tail implementation
idioms across Windows and POSIX. Focus on how to distinguish append, truncate,
rename/rotate, and cold-start subscriber behavior without re-reading rotated
archives. Keep the output short and implementation-oriented.

### Output

Write `.hopper/handoffs/T-PROG-R14-RESEARCH-output.md` with:

- Summary in <= 200 words
- 3-5 key implementation idioms
- Any Windows-specific caveat for `stat.ino` / `birthtime` / size shrink
- Recommendation for R14 dashboard tailer tests

## T-PROG-R14-REVIEW-kimi (R14 adversarial review dogfood)

- Task-type: code-review-adversarial
- Vendor: kimi
- Priority: high
- Scope: read-only review after R14 commits exist
- Dispatch: `hopper-dispatch T-PROG-R14-REVIEW-kimi --background`

### Context

The executor will add dashboard server support for v1.0 progress logs: watcher
mapping, `/events/progress/:id`, `/api/task/:id/progress`, truncate/rotate tail
defense, and incremental JSONL broadcast. R15 client UI is explicitly out of
scope, and v1.0 CLI progress writers are frozen.

### Assignment

After the R14 commits land, review the diff and tests adversarially. Focus on
G1-G4 from `docs/specs/background-progress-notification-v1.1-should-N1-REVIEW.md`
and the red lines: no progress writes leaking into sync path, no fallback/retry
language or behavior, no single-spawn bypass, no `dashboard/client/` changes,
and no CLI writer changes.

### Output

Write `.hopper/handoffs/T-PROG-R14-REVIEW-kimi-output.md` with:

- Verdict: PASS | PASS_WITH_NOTES | REWORK
- Findings ordered by P0/P1/P2
- Evidence from commit diff and focused tests
- One-line recommendation for N2.wave.dashboard-1 reviewer

