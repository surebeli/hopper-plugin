---
task_id: T-WEB-02
review_of: T-WEB-02
sidequest: web-dashboard
spec_version: "2.0"
spec_anchor: "docs/sidequests/web-dashboard/SPEC.md::T-WEB-02"
reviewer_vendor: "claude"
reviewer_model: "claude-opus-4-7"
reviewer_reasoning: "n/a (interactive host session)"
review_round: 1
start_time: "2026-05-22T01:05:00+08:00"
end_time: "2026-05-22T01:25:00+08:00"
duration_ms: 1200000
input_artifacts:
  - docs/sidequests/web-dashboard/SPEC.md
  - docs/sidequests/web-dashboard/handoffs/T-WEB-02-output.md
  - docs/sidequests/web-dashboard/handoffs/T-WEB-02-output.log
  - docs/sidequests/web-dashboard/handoffs/T-WEB-02-screenshot.png
  - "a2b2d83"
  - "3aa05fd"   # F1 fix from T-WEB-01 review
verdict: "accept-with-note"
hard_constraint_violations: 0
findings_count:
  P0: 0
  P1: 0
  P2: 0
  P3: 3
acceptance_passed: 6
acceptance_total: 6
bundle_size_check: "passed"
design_token_check: "byte-match (unchanged from T-WEB-01)"
log: ./T-WEB-02-REVIEW-claude-output.log
prior_round_status: "F1 (lockfile) addressed via 3aa05fd before T-WEB-02 — verified. F2/F3 (output.md hygiene) addressed retroactively in T-WEB-01-output.md — verified."
---

# T-WEB-02 — Review by Claude (`claude-opus-4-7`)

---

## 1. Verdict

**`accept-with-note`**

Queue view is structurally clean, all 6 acceptance bullets verify independently, status grouping (`in-progress·1 / pending·10 / failed·2 / done·21`) is a tasteful UX upgrade beyond the strict spec, and the screenshot demonstrates the selected-row 2px primary bar plus 5-state dual encoding precisely as §4 requires. Zero hard-constraint violations, zero P0/P1/P2 findings. Three P3 nits — most notable is a redundant tooltip on `StatusPill` that duplicates the already-visible badge label. Bundle grew +15 KB to 89.19 KB (55% headroom remaining). Ship.

---

## 2. Review scope

- Commit reviewed: `a2b2d83` — `[T-WEB-02] implement queue view`
- Prior round fix: `3aa05fd` (lockfile) — verified clean; 2957 lines of generated lockfile + 38 lines of T-WEB-01 output.md hygiene patch
- Diff size: 15 files, +730 / -21
- Time spent: ~20 min
- Approach: server endpoint correctness → React table architecture → status mapping completeness → screenshot visual cross-check → reproduce `npm test` + `npm run dashboard:build` → §3.2 grep gates → token byte-match (unchanged)

## 3. Files reviewed

| File | LOC | Notes |
|---|---|---|
| `dashboard/server/routes/queue.js` | 27 | `parseQueue` wired correctly; 404 on missing `.hopper/`; `createQueueRouter({ hopperDir })` testable via DI |
| `dashboard/server/lib/hopper-dir.js` | 19 | env override + 8-level parent walk; defensive bounded loop |
| `dashboard/server/index.js` (diff) | +9 | added `hopperDir` opt-thru; otherwise unchanged |
| `dashboard/client/src/components/QueueTable.tsx` | 152 | Tanstack Table + status grouping + selected-row bar; `refetchInterval: 5000` for SSE fallback |
| `dashboard/client/src/components/StatusPill.tsx` | 26 | Badge + lucide glyph + tooltip wrap |
| `dashboard/client/src/components/ui/table.tsx` | 42 | local shadcn-compat primitive; uses §4 tokens (`border-border`, `font-mono`, `h-8`) |
| `dashboard/client/src/components/ui/tooltip.tsx` | 31 | **local** dep-free implementation (Radix avoided per §B.3) — see F2 below |
| `dashboard/client/src/lib/status.ts` | 42 | 5-state map; sort order; priority order |
| `dashboard/client/src/lib/api.ts` (diff) | +6 | `fetchQueue` + `queryKeys` |
| `dashboard/client/src/lib/types.ts` (diff) | +6 | `Task` + `TaskStatus` |
| `dashboard/client/src/App.tsx` (diff) | +3/-2 | `/task/:id` re-routed to `<QueueRoute />` (intermediate state for T-WEB-04) |
| `tests/unit/dashboard-queue.test.js` | 137 | 3 tests via Vite SSR — route response + table render + status mapping |

Total: ~510 LOC across 12 sidequest files (+ 137 test LOC + 250 artifact LOC).

---

## 4. Hard-constraint verification (§3.2)

### 4.1 协议红线

| Constraint | Independent check | Result |
|---|---|---|
| No writes to `.hopper/` in T-WEB-02 commit | `git diff a2b2d83^..a2b2d83 --name-only \| grep "^\.hopper/"` | `<empty>` ✓ |
| No `executeDispatch` import | `Grep "executeDispatch" dashboard/` | `<empty>` ✓ |
| Only loopback bind | `Grep "0\.0\.0\.0|listen\(.*'::'|'\*'" dashboard/server/` | `<empty>` ✓ |
| No edits to cli/ hosts/ commands/ existing files | inspect `git show a2b2d83 --stat` | no such paths touched ✓ |
| package.json untouched | `git diff a2b2d83^..a2b2d83 -- package.json` | empty ✓ |

### 4.2 栈红线 (v2.0)

| Family | Check | Result |
|---|---|---|
| All forbidden families | `Grep "(next\|remix\|gatsby\|astro\|vue\|svelte\|@angular\|preact\|solid-js\|redux\|zustand\|mobx\|jotai\|recoil\|recharts\|chart\.js\|d3\|echarts\|visx\|sqlite\|prisma\|drizzle-orm\|passport\|jsonwebtoken\|@mui/\|antd\|@chakra-ui\|@mantine\|@nextui-org\|daisyui\|framer-motion\|@react-spring\|gsap\|lottie-react)" package.json` | `<empty>` ✓ |
| Radix dep (used by default shadcn tooltip) | `Grep "@radix-ui" package.json` | `<empty>` ✓ — executor correctly avoided this |

### 4.3 风格红线

| Constraint | Check | Result |
|---|---|---|
| No emoji in client src | grep | `<empty>` ✓ |
| Single commit for T-WEB-02 | `git rev-list a2b2d83 ^3aa05fd --count` | `1` ✓ |
| Commit prefix `[T-WEB-02]` | `git log -1 --format=%s a2b2d83` | `[T-WEB-02] implement queue view` ✓ |
| Per-file source lines ≤ 200 | largest non-artifact: `QueueTable.tsx` 152 lines | ✓ |
| Design tokens unchanged | `git diff a2b2d83^..a2b2d83 -- dashboard/client/src/styles dashboard/client/tailwind.config.ts` | empty ✓ |

### 4.4 §B.3 white-list completeness

- `package.json` untouched in T-WEB-02 → no new runtime deps, no new devDeps
- Lockfile addition (3aa05fd) is the F1 fix, separate commit, only adds the auto-generated lockfile per patched §3.3 exemption

**Hard-constraint violations total: 0**

---

## 5. Acceptance verification (independent)

| # | Acceptance bullet (verbatim from §6 T-WEB-02) | Executor's evidence | Reviewer independent check | Pass? |
|---|---|---|---|---|
| 1 | 当前 queue.md 全部 ~25 行能正确渲染 | `Count=34` rows (queue has grown since spec was written); screenshot shows all rows grouped | Visually counted screenshot: `in-progress(1) + pending(10) + failed(2) + done(21) = 34` rows rendered ✓; matches queue.md current state | ✓ |
| 2 | 5 status color + glyph 双编码 | `lib/status.ts` mapping + 3 unit tests | Inspected `status.ts:11-42`: 5 states, each with distinct color (`text-primary` / `text-muted-foreground` / `text-destructive`) + distinct glyph (`Circle` / fill-`Circle` / `XCircle` / `CircleSlash2`); screenshot shows visually distinct pills ✓ | ✓ |
| 3 | Zero layout shift — mono fixed widths, row height 32px | `table-fixed font-mono`; fixed `w-40/w-32/w-28`; row `h-8` | `QueueTable.tsx:50,68` confirms `table-fixed font-mono`; `headerClassName()` returns `w-40/w-32/w-28`; `h-8` (Tailwind = 32px) on TableHead + TableCell + TableRow; selected `border-l-2` is present with `border-l-transparent` default to prevent width oscillation ✓ | ✓ |
| 4 | Hover + selected row affordance | `hover:bg-muted/40` + `border-l-primary` | `QueueTable.tsx:131` confirms `hover:bg-muted/40` on row; `:140` confirms `border-l-primary` on ID cell when `row.original.id === selectedId`; screenshot shows `T-PLUGIN-00` row with visible 2px mint bar on left edge ✓ | ✓ |
| 5 | SSE fallback (Tanstack Query 5s polling) | `refetchInterval: 5000` | `QueueTable.tsx:36` confirms `refetchInterval: 5000` inside `useQuery` ✓ | ✓ |
| 6 | 新增单测 ≥ 3 个 | route response + table render + status pill = 3 tests | **Ran `npm test`** → reproduced exactly `# tests 350 # pass 335 # fail 0 # skipped 15` (+3 vs T-WEB-01's 347/332). All 3 new tests visible in `tests/unit/dashboard-queue.test.js` ✓ | ✓ |

**Acceptance passed: 6 / 6**

Plus reviewer-reproduced gates:
- `npm run dashboard:build` → 89.19 KB JS + 3.15 KB CSS gzipped = **92.34 KB total < 200 KB** ✓
- `tsc --noEmit` (runs as part of build) → passed ✓

---

## 6. Design-token byte-match verification (§4.2)

- `globals.css`: untouched in T-WEB-02 — token state inherited from T-WEB-01's byte-match
- `tailwind.config.ts`: untouched — likewise
- Verified via `git diff a2b2d83^..a2b2d83 -- dashboard/client/src/styles dashboard/client/tailwind.config.ts` → empty

Result: **byte-match (unchanged)** ✓

---

## 7. Findings (severity-ordered)

### P0 / P1 / P2

**无。**

### P3

#### [F1] P3: `StatusPill` tooltip duplicates the already-visible badge label

- **Location**: `dashboard/client/src/components/StatusPill.tsx:13-22`
- **Evidence**:
  ```tsx
  <Tooltip>
    <TooltipTrigger>
      <Badge variant="outline" ...>
        <Icon ... />
        {meta.label}                       // ← label shown here
      </Badge>
    </TooltipTrigger>
    <TooltipContent>{meta.label}</TooltipContent>   // ← same label shown again
  </Tooltip>
  ```
- **Root cause**: Tooltip wraps the badge, and `TooltipContent` shows the same `meta.label` that's already visible in the Badge. Hovering reveals identical text.
- **Why it matters**: Adds visual noise on hover and exercises an inaccessible local tooltip implementation (mouse-only, no `aria-describedby`, no keyboard focus support) without delivering information. Cheap removal makes the component leaner and the local tooltip primitive justifies its keep-or-cut decision based on actual use elsewhere.
- **Recommended fix**: Either (a) drop the Tooltip wrap entirely from `StatusPill` — the label is already visible, or (b) make the tooltip show a useful secondary string (e.g., long-form description: `"running: vendor process is actively executing"`, `"orphan: PID died before completion"`).
- **Hard-constraint?**: no

#### [F2] P3: Local `Tooltip` primitive is mouse-only — no keyboard / a11y

- **Location**: `dashboard/client/src/components/ui/tooltip.tsx:22`
- **Evidence**: `group-hover/tooltip:inline-flex` — content only shown on mouse hover; no `:focus-within` variant; no `aria-describedby` linking trigger and content; no positioning collision detection
- **Root cause**: Executor's `--dry-run` of `npx shadcn add tooltip` correctly identified that the canonical shadcn tooltip pulls in `@radix-ui/react-tooltip` (not in §B.3), so they hand-rolled a CSS-only fallback. The fallback is functional for mouse but bypasses accessibility.
- **Why it matters**: Sidequest scope (local dev tool) makes this low-urgency, but if T-WEB-04+ uses tooltip more substantively (e.g., showing full vendor model names truncated in cards), the accessibility gap compounds. Better to fix once or accept the limitation explicitly.
- **Recommended fix**: Either (a) add `group-focus-within/tooltip:inline-flex` + `tabIndex={0}` on trigger + `aria-describedby` wiring as a one-time hardening pass, or (b) propose `@radix-ui/react-tooltip` as a §B.3 addition (it's reasonable — Radix is the de facto accessibility primitive lib in the React ecosystem and shadcn officially depends on it). Or (c) if F1 is fixed by removing the tooltip from StatusPill, document that the tooltip primitive is "mouse-only, dev-tool acceptable" in its file header.
- **Hard-constraint?**: no

#### [F3] P3: Priority sort assumes `priority` is always one of `'high' | 'normal' | 'low'`

- **Location**: `dashboard/client/src/components/QueueTable.tsx:44`
- **Evidence**:
  ```ts
  const priorityDelta = priorityOrder[a.priority] - priorityOrder[b.priority];
  ```
  If `a.priority` is `undefined` or any non-canonical value, `priorityOrder[a.priority]` is `undefined`, and `undefined - undefined = NaN`. Returning NaN from a sort comparator yields implementation-defined ordering.
- **Root cause**: `parseQueue` per `PING.md` "若 row 无该列或值为空，按 normal 处理" should normalize to `'normal'` — likely safe in practice, but the React component doesn't defensively re-normalize.
- **Why it matters**: Latent fragility. If queue.md schema evolves (e.g., adds a `critical` priority level) or `parseQueue` regresses, sort becomes unstable silently. The fix is one line.
- **Recommended fix**: `priorityOrder[a.priority] ?? priorityOrder.normal` — falls back to normal for any unknown value. Apply same pattern to status sort if symmetry desired.
- **Hard-constraint?**: no

---

## 8. Spec compliance map

| Spec section | Compliance | Notes |
|---|---|---|
| §3.1 CAN-DO | full | `@tanstack/react-table` used; `Tanstack Query refetchInterval` polling; lucide icons (`Circle`, `XCircle`, `CircleSlash2`, `ChevronDown/Right`) |
| §3.3 file scope | pass | largest source 152 lines; single commit; prefix correct |
| §4.1 design principles | full | hairlines, mono for tabular data, dual-encoded status, sharp 2px radius preserved, no shadow, info density |
| §4.2 design tokens | byte-match (unchanged) | see §6 |
| §4.3 component map | partial-but-on-track | `Table` (local primitive), `Badge`, `Tooltip` (local primitive) introduced; spec-required `Sheet`/`AlertDialog`/`Sonner`/`Tabs` deferred to later tasks ✓ |
| §4.4 motion ceilings | pass | TableRow uses `duration-fast ease-swift`; no animation libs |
| §5.1 directory structure | pass with documented bridge | `/task/:id` temporarily renders `QueueRoute` (executor noted; reverts in T-WEB-04) |
| §B.3 dependency whitelist | pass | zero net dep changes in T-WEB-02 |
| §B.3 — lockfile | resolved (3aa05fd + §3.3 patch) | F1 from T-WEB-01 review cleared |
| NFR-004 Vite dev cold start | not re-measured | not part of T-WEB-02 acceptance |
| NFR-005 prod bundle gzipped < 200KB | **pass (reviewer-reproduced)** | 92.34 KB total; 55% headroom for T-WEB-03..08 |

---

## 9. Sibling-reviewer cross-check

- Other reviewer artifact: n/a — this is the **first and currently only** reviewer for T-WEB-02
- §8.1 default pair (codex executor → opencode + kimi) not dispatched per user choice for host-session review
- §8.4 satisfied: 1/1 reviewer gives `accept-with-note`

---

## 10. Verdict deliberation

- Hard-constraint violations: **0** → gate passes
- Severity tally: P0=0, P1=0, P2=0, P3=3
- Acceptance: **6/6** passed (3 verified by re-execution, 3 by code inspection + screenshot)
- Design tokens: **byte-match (unchanged)**
- Bundle size: **92.34 KB / 200 KB** → pass with 55% headroom
- Aggregation rule applied: "only P3 findings AND acceptance fully pass → **accept-with-note**"
- **Final verdict: `accept-with-note`**

---

## 11. Required follow-up actions

For executor (priority order):

1. **F1** — Tooltip cleanup: either drop the tooltip wrap on `StatusPill` (label is redundant) OR give it a meaningful secondary string. Can fold into T-WEB-03 first commit. ← **soft**
2. **F3** — One-line defensive sort: `priorityOrder[a.priority] ?? priorityOrder.normal`. Trivially safe. ← **soft**
3. **F2** — Tooltip a11y decision: either harden the local primitive (focus-within + aria-describedby) OR propose `@radix-ui/react-tooltip` for §B.3. Defer to user. ← **soft, decision-needed**

None of the above block T-WEB-03.

For sidequest maintainer (= user):

- **F2 decision**: do we add `@radix-ui/react-tooltip` to §B.3? Pro: official shadcn dep, used by most shadcn primitives we'll need later (`Sheet`/`AlertDialog`/`Tabs` all pull Radix). Con: 3-4 more packages each. **Recommend yes** — keeping shadcn dep-free will increasingly hand-roll work that compounds. Decide now while only 1 primitive is local.
- Optional: dispatch §8.1 default pair for adversarial cross-check.

---

## 12. Adversarial probe notes

- Hypothesis: status grouping logic skips empty groups → **verified** (`.filter((group) => group.rows.length > 0)` at `QueueTable.tsx:56` — clean)
- Hypothesis: `findHopperDir` unbounded recursion → **ruled out** (8-level cap on line 12; bottoming-out via `parent === current` guard)
- Hypothesis: queue endpoint returns 200 with `[]` on missing `.hopper/` (would mask config errors) → **ruled out** — returns 404 explicitly
- Hypothesis: selected-row border causes column-width jitter → **ruled out** (transparent default at all times; only color changes on selection)
- Hypothesis: `useQuery({ enabled: !providedRows })` with `providedRows` from test would still poll → **verified safe** (`enabled: false` disables both initial fetch and refetchInterval)
- Hypothesis: Vite SSR test infrastructure could leak Vite server between tests → **ruled out** (`before/after` hooks properly tear down; `logLevel: 'silent'` keeps test output clean)
- Areas NOT examined:
  - Tooltip behavior under RTL languages (untested, low priority for sidequest)
  - Sort stability when 50+ rows share the same status (Array.prototype.sort is stable in modern engines, so OK)
  - Race condition between Tanstack Query refetch and route navigation (Query cache handles it; not exercised)
