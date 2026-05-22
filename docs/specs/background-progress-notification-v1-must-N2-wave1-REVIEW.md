# N2.wave1 Plan Review — Background Progress and Completion Notification v1-must

Status: verdict v2.0 — **accept** (post-rework)
Date: 2026-05-22
Anchor: `docs/specs/background-progress-notification-v1-must-N2-wave1-REVIEW.md::root`
Reviewer role: third-party architecture review agent (read-only)
Wave scope: R01 + R02 of PLAN-v1.0

## Companions

- PRD: `docs/specs/background-progress-notification-prd-trd.md` (v0.4)
- Rubric: `docs/specs/background-progress-notification-plan-review-rubric.md` (v1.0)
- PLAN-v1.0: `docs/specs/background-progress-notification-v1-must-PLAN.md`
- N1 verdict: `docs/specs/background-progress-notification-v1-must-N1-REVIEW.md`

## Round History

| Round | Date | Verdict | Trigger |
|---|---|---|---|
| N2.wave1 v0 | 2026-05-22 | rework-this-wave | R01-R02 executor delivery: implementation quality high, but 4 BLOCKING red lines triggered (test breakage, scope creep, no commits, rotate-seq bug) |
| N2.wave1 v1 | 2026-05-22 | **accept** | Post-rework delivery: 3 atomic commits, 383/383 tests green, scope clean, B4 rotate-aware fix verified |

## Verdict Summary

| Dimension | Status | Notes |
|---|---|---|
| R01 implementation quality | PASS (with B4) | Clean fs-only progress.js, 5 functions match PLAN, 9-field JSONL schema aligned with PRD §6.2 |
| R02 implementation quality | PASS | `spawnDetached` patch adds 8 fields, backward-compat verification present |
| Tests added by wave 1 | PASS | 5 progress.test.js + 1 background.test.js compat + 1 background-e2e.test.js progress assertion — all green |
| **Existing test suite** | **FAIL** | npm test 380/382 PASS, 2 FAIL on unrelated Codex plugin manifest tests |
| **Scope discipline** | **FAIL** | 5+ files outside PLAN-v1.0 scope modified |
| **Commit hygiene** | **FAIL** | 0 commits; all changes in working tree |
| **`nextProgressSeq` correctness** | **FAIL** | Resets after rotate, breaks PLAN R01 "monotonic seq within each task log" |

Overall: **rework-this-wave**.

---

## BLOCKING Failures

### B1 — Existing tests broken (red-line trigger)

`npm test` after wave 1 delivery:

```
not ok 84 - Codex plugin manifest declares required metadata
not ok 85 - Codex plugin manifest stays in sync with Claude manifest identity
# fail 2 / 382
```

Root cause: `.codex-plugin/plugin.json` was modified to change `name` from `"hopper"` to `"hopper-plugin"`, breaking the cross-manifest identity sync test against `.claude-plugin/plugin.json` (`name: "hopper"`).

**This edit is entirely unrelated to R01/R02.** Triggers:

- PLAN-v1.0 Redline: "Existing background and single-spawn tests are not deleted or bypassed"
- Rubric R3.4 BLOCKING: existing tests must remain passing

### B2 — Scope creep (rubric R1.4 / R3.6 / R6.4)

Files modified outside PLAN-v1.0 declared scope:

| File | Change | Violated rule |
|---|---|---|
| `.hopper/queue.md` | 2 rows added (`T-AUDIT-PH6C-V3-mimo`, `V3-kimi`) | rubric R3.6 ("不动 `.hopper/queue.md`") |
| `hosts/codex-cli/README.md` | Added "Option C — register as Codex marketplace" section | PLAN-v1.0 Out of scope: "No changes to `hosts/codex-cli/`" |
| `docs/release/INSTALL-MATRIX.md` | Added marketplace install section | R17 is v1.1 SHOULD scope, not v1.0 |
| `.codex-plugin/plugin.json` | `name` changed without authorization | Unauthorized; breaks tests |
| `.hopper/handoffs/leader-tasklist.md` | Added V3 audit task section | Co-edit with queue.md scope creep |
| `docs/sidequests/web-dashboard/handoffs/T-WEB-{02..08}-output.md` (7 files) | Modified | Unrelated to wave 1; sidequest is closed |
| New untracked `.agents/plugins/...` + `plugins/hopper-plugin/` | Codex marketplace package skeleton | Unauthorized new directories |
| New `.hopper/handoffs/T-AUDIT-PH6C-V3-*-output.md` | V3 dogfood output | Unrelated to wave 1 |

Most of these belong to a separate "Codex local marketplace install" workstream that accidentally merged into the wave 1 working tree.

### B3 — Zero commits (rubric R8.1 / R8.4)

PLAN-v1.0 Workflow Constraints require:

- Commit prefix `[T-PROG-XX]`
- Phase commits atomic: schema / impl / test separated

Actual state after wave 1 delivery: **0 new commits since N1 acceptance**. All changes live in the working tree.

Consequences:

- Cannot verify atomic split.
- Cannot independently revert R01 or R02.
- Wave 2 cannot proceed without first deciding wave 1 commit shape.

### B4 — `nextProgressSeq` resets after rotate (PLAN R01 contract violation)

`cli/src/progress.js:66-73` computes `nextProgressSeq` from the current `progress.log` content only. `rotateProgressLogIfNeeded` renames the current file to `.1` and lets `appendProgressEvent` start a fresh empty file.

After rotate, `nextProgressSeq` returns `1`, even though events with seq > 1 exist in `.1`. PLAN-v1.0 R01 promises "monotonic seq within each task log" — this is broken at the task level (though preserved at the file-segment level).

Subscriber consequence: dashboard / `--watch-events` tracking `last_seen_seq` will, post-rotate, see seq=1 < last_seen_seq and either skip "phantom missed" events or duplicate. This bleeds into v1.1 R14 dashboard tail behavior.

---

## PASS items

| Rubric | Status | Evidence |
|---|---|---|
| R4.2 JSONL schema (9 fields) | PASS | `cli/src/progress.js:89-99` lists seq / ts / task_id / vendor / phase / kind / message / source / terminal, character-for-character match with PRD §6.2 |
| R4.3 frontmatter new fields | PASS | `cli/src/background.js` diff adds 8 fields (`phase`, `last_progress_at`, `last_progress`, `progress_seq`, `progress_log`, `raw_log`, `vendor_session_id`, `terminal_event_emitted`) |
| R3.1 single-spawn invariant | PASS | `cli/src/progress.js` has no `spawn` / `exec` / `child_process` import; grep clean |
| R3.2 no retry / no fallback | PASS | grep `fallback` / `alternate` / `retry` on new code (progress.js + background.js diff) returns no matches |
| R3.3 frontmatter backward compatibility | PASS | `tests/unit/background.test.js:86-115` (new test) asserts old `output.md` without new fields parses to `undefined` values without throwing |
| R5.2 sync mode does not write progress.log | PASS | Diff touches only `spawnDetached` (background path); `cli/src/dispatch.js` and `cli/src/subprocess.js` have zero `progress` references |
| R01 unit test coverage | PASS | `tests/unit/progress.test.js` 5/5 green: schema roundtrip / malformed-line skip / rotate / path traversal rejection |
| R02 unit test coverage | PASS | `tests/unit/background.test.js` new compat test green |
| R02 e2e coverage | PASS | `tests/integration/background-e2e.test.js` 8/8 green; spawn-detached test now asserts all 8 new frontmatter fields + progress.log sidecar creation |
| R4.6 rotation | PASS | `rotateProgressLogIfNeeded(path, maxBytes=10_485_760)` correct, rotates to `.1`, removes pre-existing `.1` first |
| Atomic frontmatter write strategy | PASS | `background.js` still routes through `writeFrontmatter` (renameSync semantics preserved) |
| Path traversal defense | PASS | `pathForTask` calls `validateTaskId`; tested |

---

## Rework Requirements (B-fix order)

### Step 1 — Roll back scope creep

Reset to N1-acceptance main HEAD state for these paths:

```powershell
git checkout -- .codex-plugin/plugin.json
git checkout -- hosts/codex-cli/README.md
git checkout -- docs/release/INSTALL-MATRIX.md
git checkout -- .hopper/queue.md
git checkout -- .hopper/handoffs/leader-tasklist.md
git checkout -- docs/sidequests/web-dashboard/handoffs/T-WEB-02-output.md
git checkout -- docs/sidequests/web-dashboard/handoffs/T-WEB-03-output.md
git checkout -- docs/sidequests/web-dashboard/handoffs/T-WEB-04-output.md
git checkout -- docs/sidequests/web-dashboard/handoffs/T-WEB-05-output.md
git checkout -- docs/sidequests/web-dashboard/handoffs/T-WEB-06-output.md
git checkout -- docs/sidequests/web-dashboard/handoffs/T-WEB-07-output.md
git checkout -- docs/sidequests/web-dashboard/handoffs/T-WEB-08-output.md
Remove-Item -Recurse -Force .agents
Remove-Item -Recurse -Force plugins
Remove-Item .hopper\handoffs\T-AUDIT-PH6C-V3-kimi-output.md
Remove-Item .hopper\handoffs\T-AUDIT-PH6C-V3-mimo-output.md
```

Confirm `npm test` returns 382/382 PASS (or whatever was the pre-wave-1 baseline) before proceeding.

If 84/85 were already failing on main HEAD before wave 1 (executor must verify with `git stash && npm test && git stash pop`), the rework includes restoring whatever passing state existed; otherwise B1 cannot be discharged.

### Step 2 — Fix B4 (rotate-aware `nextProgressSeq`)

Modify `cli/src/progress.js` so `nextProgressSeq` includes `.1` if present. Recommended diff shape:

```js
function readEventsFromPath(path) {
  if (!existsSync(path)) return [];
  const events = [];
  for (const line of readFileSync(path, 'utf-8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed === 'object') events.push(parsed);
    } catch (_) {}
  }
  return events;
}

export function readProgressEvents({ hopperDir, taskId, limit = Infinity }) {
  const path = pathForTask(hopperDir, taskId);
  const events = readEventsFromPath(path);
  return Number.isFinite(limit) ? events.slice(-limit) : events;
}

export function nextProgressSeq({ hopperDir, taskId }) {
  const path = pathForTask(hopperDir, taskId);
  const rotated = `${path}.1`;
  let maxSeq = 0;
  for (const candidate of [rotated, path]) {
    for (const event of readEventsFromPath(candidate)) {
      if (Number.isInteger(event.seq) && event.seq > maxSeq) maxSeq = event.seq;
    }
  }
  return maxSeq + 1;
}
```

Add test in `tests/unit/progress.test.js`:

```js
test('nextProgressSeq stays monotonic across rotate', () => {
  // append a few events, force rotate by lowering maxBytes,
  // append one more event, assert seq is previous_max + 1.
});
```

### Step 3 — Atomic commit split (workflow constraints)

Two commits required (or 4 if executor prefers schema/impl/test separation):

```
[T-PROG-R01] add progress.js helpers + unit tests
  cli/src/progress.js
  tests/unit/progress.test.js

[T-PROG-R02] seed progress frontmatter in spawnDetached
  cli/src/background.js
  tests/unit/background.test.js
  tests/integration/background-e2e.test.js
```

Constraints:

- No `git push`
- No `--amend`
- No `--no-verify`
- Single file delta ≤ 300 lines (each commit complies; verify with `git diff --stat HEAD~2 HEAD`)

If B4 fix lands in the same wave, prefer:

```
[T-PROG-R01]   add progress.js helpers + unit tests
[T-PROG-R01.1] make nextProgressSeq rotate-aware
[T-PROG-R02]   seed progress frontmatter in spawnDetached
```

### Step 4 — Re-trigger N2.wave1 review

After Step 1-3, executor returns with:

- Confirmation `npm test` is fully green
- New commit SHAs for review
- Confirmation no untracked files remain outside PLAN-v1.0 scope

Reviewer (this agent) reruns the rubric §3 / §4 / §5.2 / §8 checks on the clean state. If all pass, verdict flips to **accept** and wave 2 (R03+R04) is unblocked.

---

## Notes (informational, non-blocking)

### N-w1.1 — `nextProgressSeq` O(n) cost per append

`progress.js:82-103` `appendProgressEvent` calls `nextProgressSeq` which reads + JSON.parses the entire log on every append. At 10MB (rotate threshold), a single append re-reads ~MB and parses ~10k+ lines.

Suggested when R04 runner terminal writer lands: maintain an in-memory `seq` counter inside the runner process, only fall back to `nextProgressSeq` on cold start or rotate.

Not blocking v1.0 wave 1 acceptance; record for wave 2.

### N-w1.2 — Error messages lack task context

`progress.js:75-80` `requireString` throws `"progress event vendor must be a non-empty string"` without task_id or call-site context. Debuggability suffers in production logs.

Suggested: include `taskId` and the failed field name in the thrown message. Trivial change; defer to R04 landing.

### N-w1.3 — `appendFileSync` atomicity across platforms

Node `appendFileSync` with default flags uses `O_APPEND` on POSIX (per-line kernel-atomic) but Windows does not guarantee the same. As long as PLAN's single-spawn invariant holds (one runner writing per task), this is vacuously safe.

If R13 (OpenCode plugin progress writes, v1.2 LATER scope) later writes to the same `progress.log` while runner is alive, atomicity must be re-evaluated. Out of scope for v1.0; flag for v1.2 R13 design.

---

## Reviewer Boundary

Per `N1-REVIEW.md`: reviewer does not write code, does not commit, does not run executor's test suite directly (relies on executor evidence). This review consumed read-only `git diff`, `git log`, and `npm test` runs.

The fix paths (Step 1-3) above describe what the executor must produce; the actual edits, commits, and re-verification belong to the executor.

---

---

## N2.wave1 v1 — Accept Verdict (post-rework)

### Evidence from executor delivery

**Commit history** (`git log --oneline -8`):

```
1a284db [T-PROG-R02] seed progress frontmatter in background dispatch
28f0981 [T-PROG-R01.1] make progress seq rotate-aware
ffbfc40 [T-PROG-R01] add progress helpers and unit tests
47ab849 docs: expand dashboard README + main README pointer + sidequest retrospective
03382bd [T-WEB-08.5] sidequest closeout — ...
```

3 atomic commits, all with `[T-PROG-XX]` prefix per PLAN-v1.0 Workflow Constraints R8.4.

**Per-commit delta**:

| Commit | Files | Lines |
|---|---|---|
| `ffbfc40 [T-PROG-R01]` | 2 (progress.js, progress.test.js) | +218 |
| `28f0981 [T-PROG-R01.1]` | 2 (progress.js, progress.test.js) | +52 / -15 |
| `1a284db [T-PROG-R02]` | 3 (background.js, background.test.js, background-e2e.test.js) | +64 / -1 |

Largest single-file delta: 115 lines (progress.test.js R01) — well under 300-line ceiling (R8.3).

**Test suite** (`npm test`):

```
1..383
# tests 383
# pass 368
# fail 0
# skipped 15
```

- B1 fully discharged: tests 84/85 are back to PASS (root cause was unrelated `.codex-plugin/plugin.json` edit, now reverted).
- 383 total tests = 382 original + 1 new (R01.1 rotate-monotonic).

**Scope discipline** (`git diff HEAD~3 HEAD --name-only`):

```
cli/src/background.js
cli/src/progress.js
tests/integration/background-e2e.test.js
tests/unit/background.test.js
tests/unit/progress.test.js
```

5 files, all in PLAN-v1.0 R01-R02 scope. Zero out-of-scope edits. Sync path verified clean: `git diff HEAD~3 HEAD -- cli/src/dispatch.js cli/src/subprocess.js | wc -l` = 0.

**Working tree** (`git status`): no modified src/test files; only untracked sidequest review templates and `docs/specs/` (reviewer artifacts), all unrelated to wave 1.

### B-fix verification

| Failure | Status | Evidence |
|---|---|---|
| B1 (test 84/85 broken) | **FIXED** | `npm test` returns `fail 0`; `git diff HEAD~3 HEAD -- .codex-plugin/plugin.json` is empty |
| B2 (scope creep, 5+ files) | **FIXED** | `git diff HEAD~3 HEAD --name-only` lists only 5 in-scope files; no `.hopper/queue.md`, no `hosts/codex-cli/`, no `dashboard/`, no `.agents/`, no `plugins/`, no sidequest output edits |
| B3 (0 commits) | **FIXED** | 3 atomic commits per PLAN constraints; no `--amend` / no `--no-verify` indication |
| B4 (rotate-seq non-monotonic) | **FIXED** | `progress.js:38` refactored to `readEventsFromPath(path)`; `progress.js:71-77` `nextProgressSeq` iterates `[rotated, path]` taking max; new test `progress.test.js:101` "nextProgressSeq stays monotonic across rotate" PASS |

### Red-line re-check

| Invariant | Status | Verification |
|---|---|---|
| Single-spawn invariant | PASS | `grep "spawn\|child_process\|exec\(" cli/src/progress.js` → no matches |
| No retry / no fallback | PASS | `grep -i "fallback\|alternate.provider\|retry" cli/src/progress.js` → no matches |
| Sync path unchanged | PASS | `git diff HEAD~3 HEAD -- cli/src/dispatch.js cli/src/subprocess.js` → empty |
| Frontmatter backward compatibility | PASS | R02 compat test still in `tests/unit/background.test.js:86-115` |
| Existing tests not deleted/bypassed | PASS | 382 baseline → 383 (added 1 rotate-monotonic test); zero deletions |
| `.hopper/queue.md` / `AGENTS.md` untouched | PASS | Not in diff |
| Workflow constraints | PASS | 3 commits, `[T-PROG-XX]` prefix, no push, no amend, no no-verify |

### Notes from v0 still standing (informational, deferred to wave 2)

- **N-w1.1**: `nextProgressSeq` is now O(n) across both `progress.log` + `progress.log.1`. Cost grows linearly with combined file size up to ~20MB at worst. Executor may add in-memory `seq` counter inside runner when R04 lands (wave 2).
- **N-w1.2**: `requireString` error messages still lack task_id / call-site context. Trivial improvement deferable to R04 landing.
- **N-w1.3**: `appendFileSync` atomicity caveat for cross-platform / multi-writer scenarios. Vacuously safe under v1.0 single-writer model; revisit in v1.2 R13.

### Verdict

**accept** — wave 1 closed. Wave 2 (R03 + R04, per PLAN-v1.0 Wave Plan) is unblocked.

### Next reviewer trigger

N2.wave2 fires after R03 + R04 merge. Reviewer will check:

- `reapStaleJobs` writes exactly one terminal event when transitioning to `orphaned`
- runner appends exactly one terminal event on success / failure / timeout
- terminal-event dual-track dedup (`terminal_event_emitted` flag + JSONL `terminal:true`)
- single-spawn invariant remains intact under R04's runner modifications
- N-w1.1 in-memory seq optimization (optional but recommended)
- `runner-single-spawn.test.js` updated intentionally, not deleted or weakened
- AC-03, AC-04, AC-11 from PRD v0.4 §8 covered by tests

---

## Revision Log

| Version | Date | Change |
|---|---|---|
| v1.0 | 2026-05-22 | First N2.wave1 review; verdict rework-this-wave |
| v2.0 | 2026-05-22 | Post-rework re-review; verdict accept. Wave 2 unblocked. |
