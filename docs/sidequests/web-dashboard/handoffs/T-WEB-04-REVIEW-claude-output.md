---
task_id: T-WEB-04
review_of: T-WEB-04
sidequest: web-dashboard
spec_version: "2.1.1"
spec_anchor: "docs/sidequests/web-dashboard/SPEC.md::T-WEB-04"
reviewer_vendor: "claude"
reviewer_model: "claude-opus-4-7"
reviewer_reasoning: "n/a (interactive host session)"
review_round: 1
start_time: "2026-05-22T02:00:00+08:00"
end_time: "2026-05-22T02:25:00+08:00"
duration_ms: 1500000
input_artifacts:
  - docs/sidequests/web-dashboard/SPEC.md
  - docs/sidequests/web-dashboard/handoffs/T-WEB-04-output.md
  - docs/sidequests/web-dashboard/handoffs/T-WEB-04-output.log
  - docs/sidequests/web-dashboard/handoffs/T-WEB-04-screenshot.png
  - "239e835"
  - "2ff23d5"
verdict: "accept-with-note"
hard_constraint_violations: 0
findings_count:
  P0: 0
  P1: 1
  P2: 1
  P3: 2
acceptance_passed: 5
acceptance_total: 5
bundle_size_check: "passed-but-critical (89.6% used)"
design_token_check: "byte-match (unchanged from T-WEB-01)"
log: ./T-WEB-04-REVIEW-claude-output.log
prior_round_status: "F2 (useSSE try/catch) verified at sse.ts:26-30; F3 (-leader-feedback regex) verified at watcher.js:74; both fold-ins clean. §3.3 v2.1.1 codified 2-commit split — this task's 239e835 + 2ff23d5 fully compliant."
---

# T-WEB-04 — Review by Claude (`claude-opus-4-7`)

---

## 1. Verdict

**`accept-with-note`** — with a hard prerequisite for T-WEB-05.

Task Detail Drawer is structurally excellent: 5/5 acceptance verified, Radix Dialog-backed Sheet with overlay removed (zero background dimming), 13 frontmatter fields with `—` fallback, markdown body rendering tables/lists/links/code-blocks-with-line-numbers, deep-link routing works, prior-round F2/F3 folded in cleanly, design tokens unchanged. Screenshot shows the drawer suspended over an undimmed queue panel — exactly the spec intent. **However**, bundle jumped 110 → 179 KB gzipped (+70 KB from markdown-it + highlight.js + Radix Dialog) and is now at **89.6% of the 200 KB ceiling with 4 tasks remaining**. T-WEB-05's ANSI log streaming + potential Radix Tabs additions likely pushes over without intervention. F1 below is a hard prerequisite — fix before T-WEB-05 starts.

---

## 2. Review scope

- Commits reviewed:
  - `239e835` — `[T-WEB-04] implement task detail drawer` (15 files, +666/-23)
  - `2ff23d5` — `[T-WEB-04] add handoff evidence` (3 files, +276)
- Time spent: ~25 min
- Approach: bundle math first (saw the +70 KB and triaged P1) → server task endpoint correctness → Sheet overlay removal verification → Drawer 13-field + markdown render → screenshot deep-inspection → reproduce `npm test` + `npm run dashboard:build` → §3.2 grep gates → prior-round fix verification

## 3. Files reviewed

| File | LOC | Notes |
|---|---|---|
| `dashboard/server/routes/task.js` | 58 | `readFrontmatter` + path-traversal guard (`isSafeTaskId` regex + `..` check); 400/404 error mapping |
| `dashboard/server/events/watcher.js` (diff) | +5 | **F3 fix**: `taskIdFromHandoff` adds `-leader-feedback$` strip |
| `dashboard/server/index.js` (diff) | +4 | task router wiring with `hopperDir` opt-thru |
| `dashboard/client/src/components/ui/sheet.tsx` | 83 | shadcn Sheet on `@radix-ui/react-dialog`; **overlay removed** ✓; close X button included |
| `dashboard/client/src/components/TaskDrawer.tsx` | 142 | 13-field enumeration; `formatValue` null/undefined/'' → `—`; markdown-it + hljs core + 5 langs; line-numbered code blocks |
| `dashboard/client/src/routes/TaskDetailRoute.tsx` | 12 | composes QueueTable + TaskDrawer (queue stays visible) |
| `dashboard/client/src/App.tsx` (diff) | +3/-1 | `/task/:id` → `TaskDetailRoute` (no longer `QueueRoute` bridge) |
| `dashboard/client/src/lib/sse.ts` (diff) | +6/-2 | **F2 fix**: try/catch around `JSON.parse` w/ `console.warn` |
| `dashboard/client/src/lib/api.ts` (diff) | +7 | `fetchTask` + `queryKeys.task(id)` |
| `dashboard/client/src/lib/types.ts` (diff) | +8 | `TaskDetail`, `FrontmatterValue` types |
| `dashboard/client/src/types/markdown-it.d.ts` | 12 | shim for missing `@types/markdown-it` (executor stayed inside §B.3 by writing local ambient types instead of adding the types package) |
| `tests/unit/dashboard-task.test.js` | 118 | 3 tests: route response, 13-field render w/ fallback, markdown features |
| `tests/unit/dashboard-sse.test.js` (diff) | +14 | leader-feedback path fixture per F3 |
| `package.json` (diff) | +1 | `@radix-ui/react-dialog@^1.1.0` |
| `package-lock.json` (diff) | +217 | Radix Dialog transitive deps |

Total: ~700 LOC new/changed source + 132 LOC tests + 276 LOC artifacts.

---

## 4. Hard-constraint verification (§3.2)

### 4.1 协议红线

| Constraint | Check | Result |
|---|---|---|
| No `.hopper/` writes | `git diff 239e835^..2ff23d5 --name-only \| grep "^\.hopper/"` | `<empty>` ✓ |
| No `executeDispatch` import | grep | `<empty>` ✓ |
| Only loopback bind | grep on dashboard/server + parseServerArgs reject path | `<empty>` ✓ |
| No edits to cli/ hosts/ commands/ existing files | git diff names | none touched ✓ |
| package.json additive | diff inspection | +1 dep, no deletions ✓ |

### 4.2 栈红线 (v2.1)

| Family | Check | Result |
|---|---|---|
| All forbidden families | combined regex | `<empty>` ✓ |
| Radix subset only (§B.3.3) | `node -e "Object.keys(p.dependencies).filter(k=>k.startsWith('@radix-ui/'))"` | `react-dialog` + `react-tooltip` only — both whitelisted ✓; **no aggregate `radix-ui` package** ✓ |

### 4.3 风格红线

| Constraint | Check | Result |
|---|---|---|
| No emoji in client src | grep | `<empty>` ✓ |
| Commit prefix `[T-WEB-04]` | both commits | `239e835 [T-WEB-04] implement task detail drawer` + `2ff23d5 [T-WEB-04] add handoff evidence` ✓ |
| §3.3 v2.1.1 split compliance | 1 impl + 1 doc-only | impl `239e835` (15 files: src+tests+deps); doc `2ff23d5` (3 files: output.md/.log/.png) — exactly the codified split ✓ |
| Per-file source lines ≤ 200 | largest non-artifact: `TaskDrawer.tsx` 142 lines | ✓ |
| Design tokens unchanged | `git diff 239e835^..239e835 -- dashboard/client/src/styles dashboard/client/tailwind.config.ts` | empty ✓ |

### 4.4 §B.3 white-list completeness

- Net new runtime deps: `@radix-ui/react-dialog@^1.1.0` only → §B.3.3 ✓
- Net new devDeps: none
- Transitive: lockfile +217 lines mostly Radix Dialog internals — exempt per §3.3

**Hard-constraint violations total: 0**

---

## 5. Acceptance verification (independent)

| # | Acceptance bullet (verbatim from §6 T-WEB-04) | Executor's evidence | Reviewer independent check | Pass? |
|---|---|---|---|---|
| 1 | Click queue row opens drawer; URL → `/task/T-XXX` | Chrome CDP fallback: `clickOpen: "/task/T-WEB-04"`, `clickedHasDrawer: true` | Inspected `App.tsx` route, `TaskDetailRoute` composes `QueueTable` + `TaskDrawer`; `QueueTable:90` calls `navigate(/task/${taskId})` on row click. Screenshot confirms drawer-with-queue layout ✓ | ✓ |
| 2 | Direct `/task/T-XXX` deep-link opens drawer | Chrome CDP: `url: "/task/T-WEB-04"`, `hasQueue: true`, `hasDrawer: true` | `Sheet open={Boolean(id)}` (TaskDrawer.tsx:67) — id from `useParams` opens drawer immediately. Screenshot demonstrates the loaded state ✓ | ✓ |
| 3 | 13 frontmatter fields; missing → `—`; no `undefined`/`null` | Unit `TaskDetailPanel renders 13 frontmatter fields...`; browser `fields: 13, hasFallback: true, hasUndefined: false` | **Inspected screenshot**: all 13 fields visible (task_id / adapter / status / pid / start_time / end_time / exit_code / duration_ms / mode / host_native / session_id / log / started_by_pid); `end_time` + `host_native` show `—` (not `undefined`); `frontmatterFields` array at TaskDrawer.tsx:17-31 hardcodes exactly 13 fields; `formatValue` (line 125-128) maps null/undefined/'' → `—` ✓ | ✓ |
| 4 | Body markdown: table, code block with line numbers, list, link | Unit `renderMarkdown outputs table...`; browser `hasBodyTable: true, hasCodeLines: true, hasList: true, hasLink: true` | **Inspected screenshot**: "Render Matrix" h2 → table (Kind/Seen | table/yes) → bullet list (• list item) → mint underlined "external_link" → code block with line numbers `1 const value = 1; 2 console.log(value);` — all 4 features rendered ✓ | ✓ |
| 5 | Close drawer → URL `/` | Chrome CDP `afterClose: "/"` | `TaskDrawer.tsx:67`: `onOpenChange={(open) => !open && navigate('/')}` — wires both X-button click and Esc-key dismiss ✓ | ✓ |

**Acceptance passed: 5 / 5**

Plus reviewer-reproduced gates:
- `npm test` → **357/342/0/15** — exact reproduction of executor's report ✓
- `npm run dashboard:build` → 0.27 + 4.12 + 174.83 = **179.22 KB total gzipped** — exact reproduction; passes < 200 KB ✓ (but see F1)
- `tsc --noEmit` passes (runs as part of build) ✓

---

## 6. Design-token byte-match verification (§4.2)

- `globals.css` + `tailwind.config.ts`: untouched in T-WEB-04 commits
- Executor reported SHA256 match (`789046FC...` / `D0E34ECF...`)

Result: **byte-match (unchanged)** ✓

---

## 7. Findings (severity-ordered)

### P0

**无。**

### P1

#### [F1] P1: Bundle headroom critical — 89.6% used; T-WEB-05/06/07/08 likely overflow without code-splitting

- **Location**: bundle composition; primary contributors at `TaskDrawer.tsx:3-9` (markdown-it + hljs + 5 lang modules)
- **Evidence**:
  ```
  T-WEB-01: 74.03 KB gzipped (baseline)
  T-WEB-02: 92.34 KB         (+18, Tanstack Table)
  T-WEB-03: 109.68 KB        (+17, Radix Tooltip + SSE)
  T-WEB-04: 179.22 KB        (+70, Radix Dialog + markdown-it + hljs)
                              ── 89.6% of 200 KB cap ──
  Remaining budget: ~21 KB across T-WEB-05/06/07/08
  ```
  Forecast: T-WEB-05 (ANSI parsing + Radix Tabs ≈ +10-15 KB), T-WEB-06/07/08 (≈ +3-5 KB each cumulatively). Realistic end-of-T-WEB-08: **~200-205 KB**. One Radix-Tabs dep alone could tip it.
- **Root cause**: `TaskDrawer.tsx` statically imports `markdown-it` + `highlight.js/lib/core` + 5 language modules at module load. Every page (including the always-visible queue) pays for the markdown stack even though it's only used when a drawer is open. There's no route-level code-splitting.
- **Why it matters**: NFR-005 caps prod bundle at 200 KB gzipped; T-WEB-08 acceptance §7.2 ##4 requires "内存 / 性能阈值 NFR-001~NFR-007 全部满足". If bundle crosses 200 KB at T-WEB-05 (entirely possible), the entire downstream chain blocks. Easier to fix now (one file) than after 3 more tasks compound.
- **Recommended fix** (1 hour work, isolated):
  ```tsx
  // In App.tsx — lazy-load TaskDetailRoute (which owns TaskDrawer → markdown stack)
  import { lazy, Suspense } from 'react';
  const TaskDetailRoute = lazy(() => import('@/routes/TaskDetailRoute'));

  <Route
    path="/task/:id"
    element={
      <Suspense fallback={<QueueRoute />}>
        <TaskDetailRoute />
      </Suspense>
    }
  />
  ```
  This pushes markdown-it + hljs + Radix Dialog into a separate chunk loaded only when the drawer route hits. Expected main bundle drop: 179 → ~115 KB (back to T-WEB-03 baseline). Verification: `npm run dashboard:build` should show 2 chunks (`index-*.js` main + `TaskDetailRoute-*.js` lazy).
- **Hard-constraint?**: not in the §3.2 grep sense; but blocks NFR-005 forecast → **hard prerequisite for T-WEB-05**

### P2

#### [F2] P2: Sheet width 760px deviates from §4.3 spec (480px) — undisclosed in deviations section

- **Location**: `dashboard/client/src/components/ui/sheet.tsx:38` — `w-[min(760px,calc(100vw-16px))]`
- **Evidence**: §4.3 component-guide table specifies `Task drawer | Sheet (side="right") | 宽 480px；背后不暗化（去掉 overlay）`. Implemented at 760px (60% wider). Executor's "Decisions / deviations" section listed shadcn/CLI deviation + highlight.js subset choice but **did not call out the width change**.
- **Why it matters**: §4.2/§4.3 are explicitly described as "硬数字" / "硬约束" in the spec (§4.5 ref). Reviewer's job to catch undisclosed token-table deviations; future stricter reviewers (kimi/codex) would auto-rework. Either the spec needs to allow latitude on container widths or the code needs to fit 480px.
- **Practical assessment**: 480px is genuinely cramped for a 13-row frontmatter table + markdown body (would force the `task_id` column to wrap or truncate aggressively). 760px is the right call for content density. Spec, not code, is the better fix.
- **Recommended fix** (pick one; reviewer recommends (a)):
  - (a) **Patch §4.3** to specify `宽 min(720px, calc(100vw - 16px))` or similar — explicitly reconciles spec with reality
  - (b) Scale Sheet down to 480px and use a 2-col frontmatter layout (label-value-label-value) to fit; would compress content but match spec literal
- **Hard-constraint?**: borderline — literal §4.3 token table says 480px; "硬数字" framing in §4.2 might extend to §4.3 by analogy

### P3

#### [F3] P3: `frontmatterFields` hardcoded to 13 background-mode fields — sidequest outputs have different schema

- **Location**: `TaskDrawer.tsx:17-31`
- **Evidence**: Drawer enumerates `task_id / adapter / status / pid / start_time / end_time / exit_code / duration_ms / mode / host_native / session_id / log / started_by_pid` — the 13 fields produced by `hopper-dispatch --background` in `cli/src/background.js`. Sidequest's own handoff files (e.g., `T-WEB-04-output.md`) use different fields (`spec_version`, `executor`, `commit_sha`, `review_status`, etc.) and would render mostly as `—` rows.
- **Root cause**: Spec §6 T-WEB-04 says "frontmatter 13 个字段全部显示" (literal) — executor matched it literally. The sidequest's own outputs were not the target audience.
- **Why it matters**: When user clicks a hypothetical sidequest task row, drawer shows mostly `—`. Doesn't break anything; just suboptimal info density. Could either (i) dynamically render all keys present in `data.frontmatter`, or (ii) keep 13-field whitelist for protocol task outputs and accept the sparse rendering for sidequest outputs.
- **Recommended fix**: Defer until T-WEB-08 polish — small refactor to merge the hardcoded 13 with `Object.keys(data.frontmatter)` would handle both cases. Not urgent.
- **Hard-constraint?**: no

#### [F4] P3: Markdown body styling uses a 70+ class Tailwind arbitrary CSS bag inline — readability hazard

- **Location**: `TaskDrawer.tsx:113` — the `[&_pre]:mb-3 [&_pre]:overflow-auto ...` chain
- **Evidence**: ~70 arbitrary Tailwind classes on one element, all `[&_<selector>]:` form. Functional but visually unparseable in code review.
- **Why it matters**: Future maintenance will struggle. A small dedicated `globals.css` block for `.markdown-body` would compile to similar CSS but be greppable.
- **Recommended fix**: T-WEB-08 polish — move to a `.markdown-body` class with explicit CSS rules. Not urgent.
- **Hard-constraint?**: no

---

## 8. Spec compliance map

| Spec section | Compliance | Notes |
|---|---|---|
| §3.1 CAN-DO | full | `@radix-ui/react-dialog`, `markdown-it`, `highlight.js` (subset import) |
| §3.3 v2.1.1 2-commit split | **pass** | impl + doc-only; codified pattern works as intended |
| §4.1 design principles | full | hairlines, mono, dual-encoded status, sharp 2px radius preserved |
| §4.2 design tokens | byte-match (unchanged) | — |
| §4.3 component map | partial | Sheet present + overlay-removed ✓; **width 760 vs 480 spec** — see F2 |
| §4.4 motion ceilings | pass | shadcn slide-in/out via `tailwindcss-animate` default 150ms; within 180ms ceiling |
| §5.1 directory structure | pass | `TaskDrawer.tsx`, `ui/sheet.tsx`, `routes/TaskDetailRoute.tsx` per layout |
| §B.3.3 Radix subset | pass | only `react-dialog` + `react-tooltip` |
| FR-002 Task detail | **delivered** | drawer + frontmatter + body + deep-link |
| NFR-001 prod cold start < 1.5s | not measured | deferred to T-WEB-08 regression |
| NFR-005 prod bundle gzipped < 200KB | **pass-but-critical** | 179.22 KB; see F1 |

---

## 9. Sibling-reviewer cross-check

- Other reviewer artifact: n/a — first and only reviewer
- §8.1 default pair not dispatched
- §8.4 satisfied: 1/1 reviewer gives `accept-with-note`

---

## 10. Verdict deliberation

- Hard-constraint violations: **0** → gate passes
- Severity tally: P0=0, **P1=1**, P2=1, P3=2
- Acceptance: **5/5** passed (all reviewer-verified or independently inspected)
- Design tokens: byte-match
- Bundle size: **179.22 KB / 200 KB** — passes today, **forecast-fail** without F1
- Aggregation: presence of P1 typically points to rework, but the P1 is **forward-looking** (T-WEB-04 itself meets every acceptance bullet) and addressable within T-WEB-05's first commit. Treating as **accept-with-note** with F1 as hard prerequisite is the right call — penalizing T-WEB-04 for a bundle that's still in spec would conflate completed work with future risk.
- **Final verdict: `accept-with-note`**

---

## 11. Required follow-up actions

For executor (priority order):

1. **F1 (HARD prerequisite for T-WEB-05)** — Lazy-load `TaskDetailRoute` via `React.lazy` + `Suspense`. Expected effect: main bundle drops from 179 → ~115 KB; `npm run dashboard:build` should produce 2 chunks. Do this **before** starting T-WEB-05 implementation work. ← **hard**
2. **F2 (user-decision)** — patch §4.3 to allow Sheet width up to ~720px (recommended) OR scale down to 480px with 2-col frontmatter. Reviewer leans (a). ← **decision-needed**
3. **F3** — sidequest-friendly frontmatter rendering: defer to T-WEB-08. ← **soft**
4. **F4** — extract markdown-body styles to a class: defer to T-WEB-08. ← **soft**

For sidequest maintainer (= user):

- **F2 decision** — codify Sheet width in §4.3 (recommend ≤720px max-w to keep mobile-friendly)
- Optional: dispatch §8.1 default pair for adversarial cross-check, especially given the bundle math forecast

---

## 12. Adversarial probe notes

- Hypothesis: Sheet would still dim background despite "no overlay" intent → **ruled out** (executor removed `SheetOverlay` entirely from the shadcn template; screenshot confirms full brightness on queue panel)
- Hypothesis: `formatValue('')` would render empty string as visible — leaving user unsure if field is empty or just missing → **ruled out** (`''` → `—` per line 126)
- Hypothesis: `dangerouslySetInnerHTML` + markdown-it `html: true` would be XSS surface → **ruled out** (`html: false` on MarkdownIt construction; hljs output is span-wrapped; `escapeHtml` covers non-highlighted fallback)
- Hypothesis: shadcn CLI would pull in aggregate `radix-ui` package (executor noted this risk) → **ruled out** (only `@radix-ui/react-dialog` in top-level deps)
- Hypothesis: path-traversal via `/api/task/../../../etc/passwd` → **ruled out** (`isSafeTaskId` regex `^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$` + explicit `!id.includes('..')` guard at routes/task.js:53)
- Hypothesis: highlight.js full bundle would balloon size → **ruled out** (executor used `highlight.js/lib/core` + 5 language modules; this is the correct optimization). The 70 KB bundle jump is mostly markdown-it (~30 KB) + the 5 hljs language packs (~15 KB) + Radix Dialog (~15 KB) + Radix transitive deps (~10 KB)
- Hypothesis: Sheet width measured at 760px vs spec 480px would also break responsive on narrow viewports → **partially confirmed** (the `min(760px, calc(100vw-16px))` clamp handles mobile gracefully, but the literal 760px deviation from §4.3 stands)
- Hypothesis: Close-X button would be a focus trap escape hatch issue → **ruled out** (Radix Dialog handles focus trap correctly; X button is just one of three close paths: click X, press Esc, navigate)
- Areas NOT examined:
  - Live SSE-driven drawer refresh under rapid `.hopper/handoffs/T-XXX-output.md` writes (would need real dispatch flow)
  - Bundle composition deep-dive via `rollup-plugin-visualizer` (not in deps; would help diagnose F1 fix effectiveness)
  - Drawer focus return on close (Radix typically returns focus to trigger element; not verified manually)
