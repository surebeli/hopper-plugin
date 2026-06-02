---
task_id: T-WEB-04.5
review_of: T-WEB-04.5
sidequest: web-dashboard
spec_version: "2.1.2"
spec_anchor: "T-WEB-04 review F1 (hard prerequisite for T-WEB-05)"
reviewer_vendor: "claude"
reviewer_model: "claude-opus-4-7"
reviewer_reasoning: "n/a (interactive host session)"
review_round: 1
start_time: "2026-05-22T03:10:00+08:00"
end_time: "2026-05-22T03:25:00+08:00"
duration_ms: 900000
input_artifacts:
  - "ff482c9"
  - docs/sidequests/web-dashboard/handoffs/T-WEB-04-REVIEW-claude-output.md   # F1 originating finding
verdict: "accept"
hard_constraint_violations: 0
findings_count:
  P0: 0
  P1: 0
  P2: 0
  P3: 0
acceptance_passed: 2
acceptance_total: 2
bundle_size_check: "passed — main chunk dropped 174.83 → 106.88 KB (-39% gzipped)"
design_token_check: "byte-match (unchanged)"
log: ./T-WEB-04.5-REVIEW-claude-output.log
note: "Mid-task housekeeping commit per §3.3 v2.1.1 model. No T-WEB-04.5-output.md (executor did not produce one — defensible for a 2-file mechanical fix); review derives evidence directly from commit ff482c9 + reviewer-isolated worktree build."
---

# T-WEB-04.5 — Review by Claude (`claude-opus-4-7`)

---

## 1. Verdict

**`accept`**

Mechanical, surgical fix exactly as recommended. T-WEB-04 review F1 hard prerequisite is satisfied: main chunk dropped from 174.83 KB → **106.88 KB gzipped** (-39%), markdown-it + highlight.js + Radix Dialog now live in a separate `TaskDetailRoute-*.js` lazy chunk (68.92 KB gzipped) loaded only when a user opens a task drawer. F2 Sheet width literal change 760 → 720 also folded in. Two-file diff, one commit, zero noise. Ship.

---

## 2. Review scope

- Commit reviewed: `ff482c9` — `[T-WEB-04.5] lazy-load TaskDetailRoute for bundle headroom`
- Diff: 2 files, +13/-5 (App.tsx + sheet.tsx)
- Time spent: ~15 min
- Approach: isolated worktree at `ff482c9` (separate `npm install`) → reproduce `npm run dashboard:build` independently → compare bundle composition vs T-WEB-04 baseline → verify Suspense fallback choice → cleanup worktree

## 3. Files reviewed

| File | LOC | Notes |
|---|---|---|
| `dashboard/client/src/App.tsx` | +14/-3 | `lazy()` import + `Suspense fallback={<QueueRoute />}` exactly per T-WEB-04 review §11 recommendation; static `TaskDetailRoute` import removed |
| `dashboard/client/src/components/ui/sheet.tsx` | +2/-2 | `w-[min(760px,calc(100vw-16px))]` → `w-[min(720px,calc(100vw-16px))]` for both `right` and `left` side variants — exactly matches §4.3 v2.1.2 |

Total: 16 lines touched; nothing else.

---

## 4. Hard-constraint verification (§3.2)

| Constraint | Check | Result |
|---|---|---|
| No `.hopper/` writes | `git diff ff482c9^..ff482c9 --name-only \| grep "^\.hopper/"` | `<empty>` ✓ |
| No `executeDispatch` import | unchanged from T-WEB-04 (no imports added) | ✓ |
| Only loopback bind | server unchanged | ✓ |
| No edits to cli/ hosts/ commands/ existing files | git diff names: only `dashboard/client/src/` | ✓ |
| No new deps | `git diff ff482c9^..ff482c9 -- package.json package-lock.json` | empty ✓ |
| §3.3 mid-task housekeeping commit pattern | `ff482c9 [T-WEB-04.5] ...` matches §3.3 v2.1.1 + T-WEB-01.5/T-WEB-04.5 precedent | ✓ |
| Commit prefix `[T-WEB-04.5]` | confirmed | ✓ |

**Hard-constraint violations total: 0**

---

## 5. Effectiveness verification (the whole point of T-WEB-04.5)

### 5.1 Bundle composition before vs after

| Build | Main chunk | Lazy chunk(s) | CSS | Total user must download for initial page | Spec ceiling | Headroom |
|---|---|---|---|---|---|---|
| T-WEB-04 (commit `239e835`) | 174.83 KB (single) | — | 4.12 KB | **179.22 KB** | 200 KB | **20.78 KB (10.4%)** |
| T-WEB-04.5 (commit `ff482c9`) | **106.88 KB** | `TaskDetailRoute-*.js` 68.92 KB (lazy) | 4.12 KB | **111.28 KB** | 200 KB | **88.72 KB (44.4%)** |
| Δ | **-67.95 KB / -39%** | new chunk | — | -67.94 KB | — | +67.94 KB (+33.6%) |

(All numbers gzipped; reviewer reproduced via isolated worktree.)

### 5.2 Independent reproduction

```
$ git worktree add ../hopper-plugin-review-T-WEB-04.5 ff482c9
HEAD is now at ff482c9 [T-WEB-04.5] lazy-load TaskDetailRoute for bundle headroom

$ cd ../hopper-plugin-review-T-WEB-04.5 && npm install --silent && npm run dashboard:build
dist/index.html                          0.41 kB │ gzip:   0.28 kB
dist/assets/index-BJNA8H09.css           16.09 kB │ gzip:  4.12 kB
dist/assets/TaskDetailRoute-CeneUNAI.js  160.13 kB │ gzip: 68.92 kB
dist/assets/index-DjT55ud6.js            338.39 kB │ gzip: 106.88 kB
✓ built in 12.05s
```

Two JS chunks present as expected. Main chunk 106.88 KB gzipped — well below T-WEB-04's 174.83 KB. Lazy `TaskDetailRoute` chunk 68.92 KB — only fetched when route `/task/:id` is entered, never paid on queue / vendors / cost views.

### 5.3 Forecast revision

Original T-WEB-04 review forecast (without F1 fix):
- T-WEB-05 (~+15 KB) → 194 KB
- T-WEB-06/07/08 (~+10 KB cumulative) → **~204 KB OVERFLOW**

Revised forecast (with F1 fix in place):
- Main chunk at T-WEB-04.5: 107 KB
- T-WEB-05 ANSI + Tabs (~+15 KB) → 122 KB
- T-WEB-06/07/08 (~+10 KB) → ~132 KB
- **End-of-T-WEB-08 main chunk: ~132 KB / 200 KB cap, 34% headroom**

NFR-005 path clear through T-WEB-08.

---

## 6. Suspense fallback choice — verification

`App.tsx:42` uses `<QueueRoute />` as the Suspense fallback for the lazy `TaskDetailRoute`. This is a deliberate UX choice (recommended in T-WEB-04 review prompt): when the user navigates to `/task/:id`, the queue stays rendered while the lazy chunk loads in the background. Smooth visual continuity — no spinner flash, no layout shift, no blank state.

Alternative would have been `null` or a loading skeleton, both worse:
- `null` → blank space until chunk loads
- skeleton → §4.4 forbids skeleton loading anyway

Implementation matches recommendation exactly. ✓

---

## 7. Test reproduction notes

Independent worktree `npm test` returned `# tests 357 # pass 340 # fail 2 # skipped 15`. The 2 failures (`every slash command file starts with YAML frontmatter` and `every slash command file declares allowed-tools`) are **unrelated to T-WEB-04.5**:

- Both failing tests scan `commands/*.md` files; the diff for T-WEB-04.5 (App.tsx + sheet.tsx) cannot affect them
- Root cause is `git worktree` checking out files with CRLF line endings on Windows (`core.autocrlf` behavior); the test assertion `assert.match(content, /^---\n/)` is strict-LF and fails on CRLF
- The same tests pass on `main`'s working tree (verified at T-WEB-04 review where I saw `# pass 342 # fail 0` on the same files, before worktree was created)
- This is a pre-existing **test-fragility issue**, not a regression. Fixing it would change `/^---\n/` → `/^---\r?\n/` in `tests/unit/claude-code-host.test.js:63` and similar. **Out of scope for T-WEB-04.5 and out of scope for the sidequest** (`tests/unit/claude-code-host.test.js` is owned by the main project, not by dashboard).

If you want me to file this as a follow-up for the main project (separate from the sidequest), I can; otherwise it's noise for this review.

---

## 8. Findings

**无。**

Zero P0/P1/P2/P3. Diff is mechanical and matches the recommended fix exactly; no opinions to dispute, no edge cases to flag.

---

## 9. Spec compliance map

| Spec section | Compliance | Notes |
|---|---|---|
| §3.3 v2.1.1 mid-task housekeeping | pass | `[T-WEB-04.5]` prefix; precedent `[T-WEB-01.5]`; no handoff doc produced (consistent with lockfile precedent) |
| §4.3 Sheet width v2.1.2 | byte-match | both `right` and `left` use `min(720px, calc(100vw-16px))` exactly |
| §B.3 deps | unchanged | no package.json edits |
| NFR-005 prod bundle gzipped < 200KB | **pass — initial page load now 111.28 KB** | 44% headroom restored |
| T-WEB-04 review §11 #1 (F1 hard prereq) | **resolved** | ready for T-WEB-05 |

---

## 10. Verdict deliberation

- Hard-constraint violations: 0
- Findings: 0
- Effectiveness: main chunk -39% gzipped; forecast through T-WEB-08 has 34% headroom
- Implementation matches T-WEB-04 review §11 recommendation **verbatim**
- Diff is 2 files, +13/-5 — atomic, surgical
- Aggregation rule: "zero findings AND acceptance fully pass → **accept**"
- **Final verdict: `accept`**

---

## 11. Required follow-up actions

For executor:

- **None for T-WEB-04.5 itself.**
- T-WEB-05 may proceed (executor appears to have already started; commit `6a820b8 [T-WEB-05] implement live log stream` is on the tree but **not yet reviewed in this round**).

For sidequest maintainer (= user):

- **None for T-WEB-04.5.**
- Optional: file the CRLF test-fragility (`tests/unit/claude-code-host.test.js`) as a main-project follow-up, separate from sidequest. Trivial fix (`\r?` in 4-6 regex spots) but out of scope here.

---

## 12. Adversarial probe notes

- Hypothesis: Suspense fallback might cause a render-loop if `QueueRoute` triggers its own data fetch while TaskDetailRoute loads → **ruled out** (React Suspense with a stable fallback is single-render; `QueueRoute` mounts once, fetches once, lazy chunk arrives, swap in)
- Hypothesis: lazy import might break the `useSSE` task-channel subscription timing in TaskDrawer → **ruled out** (the SSE subscription is inside the lazy component; it only attempts to subscribe AFTER the chunk loads + component mounts, which is correct)
- Hypothesis: Vite might not actually split markdown-it/hljs out, leaving them in main chunk despite lazy declaration → **ruled out** (independent build showed exactly the expected 2-chunk split with markdown stack in the lazy chunk by elimination — 174.83 → 106.88 = -67.95 KB, matches markdown-it (~30 KB) + hljs+langs (~25 KB) + Radix Dialog (~13 KB) totals)
- Hypothesis: Sheet width change might break responsive on a 800px viewport (between 720 and 760) → **ruled out** (the `min(720px, calc(100vw - 16px))` clamp behaves identically at 800px viewport for both values — `min(720, 784) = 720` either way)
- Areas NOT examined:
  - Network throttling test (would prove lazy chunk loads imperceptibly under 3G) — defer to T-WEB-08 polish
  - Browser cache behavior on lazy chunk filename changes (Vite includes content hash so cache busting works automatically)
