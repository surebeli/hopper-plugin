---
task_id: T-WEB-07
review_of: T-WEB-07
sidequest: web-dashboard
spec_version: "2.1.3"
spec_anchor: "docs/sidequests/web-dashboard/SPEC.md::T-WEB-07"
reviewer_vendor: "claude"
reviewer_model: "claude-opus-4-7"
reviewer_reasoning: "n/a (interactive host session)"
review_round: 1
start_time: "2026-05-22T09:40:00+08:00"
end_time: "2026-05-22T09:58:00+08:00"
duration_ms: 1080000
input_artifacts:
  - docs/sidequests/web-dashboard/SPEC.md
  - docs/sidequests/web-dashboard/handoffs/T-WEB-07-output.md
  - docs/sidequests/web-dashboard/handoffs/T-WEB-07-output.log
  - docs/sidequests/web-dashboard/handoffs/T-WEB-07-screenshot.png
  - "ac74941"   # T-WEB-06.5 spec sync
  - "80359ec"   # T-WEB-07 impl
  - "89ebe5f"   # T-WEB-07 handoff
verdict: "accept-with-note"
hard_constraint_violations: 0
findings_count:
  P0: 0
  P1: 0
  P2: 0
  P3: 4
acceptance_passed: 3
acceptance_total: 3
bundle_size_check: "passed — main grew +0.73 KB to 117.59 KB; pure-Tailwind bars added zero JS chart cost"
design_token_check: "byte-match (unchanged)"
log: ./T-WEB-07-REVIEW-claude-output.log
prior_round_status: "T-WEB-06.5 spec patch (ac74941) executed cleanly — §6 acceptance row 2 + v2.1.3 revision entry. T-WEB-06 F1 closed."
---

# T-WEB-07 — Review by Claude (`claude-opus-4-7`)

---

## 1. Verdict

**`accept-with-note`**

Cost log view shipped exceptionally lean: 3/3 acceptance, `npm test` 368 (executor's clean worktree 353/0), `npm run dashboard:build` produces main **117.59 KB / 200 KB (+0.73 KB)** — pure Tailwind bars added essentially zero JS cost (the entire visual impact came from CSS utility classes, which were already in scope). Parser is robust: handles `~` prefix on tokens/$, multiple historical COST-LOG schemas, escape characters, missing optional columns, and infers vendor via 3-level fallback (`via <vendor>` → known prefix → first token). T-WEB-06.5 spec patch landed cleanly (ac74941). Four P3 nits, all soft — the most material is missing SSE wiring for `COST-LOG.md` changes (infrastructure from T-WEB-03 is present but unused). Ship.

---

## 2. Review scope

- Commits reviewed:
  - `ac74941` — `[T-WEB-06.5] spec sync — stale comparison command` (1 file, +829 — first-time inclusion of SPEC.md into git history; reviewer noted SPEC.md was previously untracked in working tree and is now formally versioned)
  - `80359ec` — `[T-WEB-07] implement cost log view` (7 files, +431/-13)
  - `89ebe5f` — `[T-WEB-07] add handoff evidence` (3 files; doc-only)
- Time spent: ~18 min
- Approach: parser fixture audit (regex correctness, edge cases) → CostBars pure-Tailwind verification → bundle math (verify no chart lib snuck in) → screenshot inspection (visual density check) → `npm test` + `npm run dashboard:build` reproduction → §3.2 grep gates

## 3. Files reviewed

| File | LOC | Notes |
|---|---|---|
| `dashboard/server/lib/cost.js` | 188 | Standalone markdown-table parser; multi-schema header tolerance; `parseTokens` strips commas + `~`; `parseUsd` regex matches `~?\$?[0-9.]+`; `inferVendor` 3-level fallback; `roundUsd` 4-decimal precision |
| `dashboard/server/routes/cost.js` | 26 | `GET /api/cost` with DI factory; passes `hopperDir` to parseCostLog; clean error path |
| `dashboard/server/index.js` (diff) | +4 | cost router wiring with `hopperDir` opt-thru |
| `dashboard/client/src/components/CostBars.tsx` | 108 | 3 stat cards + Cost-by-vendor bars + Detail table; bars use `style={{ width: '${pct}%' }}` + `bg-primary` + `bg-muted/40` track |
| `dashboard/client/src/lib/api.ts` (diff) | +6 | `fetchCost` + `queryKeys.cost` |
| `dashboard/client/src/lib/types.ts` (diff) | +26 | `CostRow`, `CostByVendor`, `CostResponse` types |
| `tests/unit/dashboard-cost.test.js` | 90 | 4 tests: estimated tokens/$, vendor aggregation, old-row tolerance, route response |
| SPEC.md (ac74941) | +829 | first-time tracking; verified §6 T-WEB-06 acceptance row 2 reads `--models <vendor>` + v2.1.3 revision entry present |

Total: ~370 LOC new source + 90 LOC tests + 276 LOC artifacts.

---

## 4. Hard-constraint verification (§3.2)

### 4.1 协议红线

| Constraint | Check | Result |
|---|---|---|
| No `.hopper/` writes | `git diff ac74941^..89ebe5f --name-only \| grep "^\.hopper/"` | `<empty>` ✓ |
| No `executeDispatch` import | grep | `<empty>` ✓ |
| Only loopback bind | unchanged | ✓ |
| No edits to cli/ hosts/ commands/ existing files | git diff names | none touched ✓ |
| package.json untouched | `git diff 80359ec^..80359ec -- package.json` | empty ✓ — zero new deps for T-WEB-07 |

### 4.2 栈红线 (v2.1)

| Family | Check | Result |
|---|---|---|
| **Chart libs (critical for this task)** | `Grep "recharts\|chart\.js\|d3\|echarts\|visx\|victory\|plotly" package.json dashboard/` | `<empty>` ✓ — bars are pure Tailwind |
| All other forbidden families | regex on package.json | `<empty>` ✓ |
| Radix subset unchanged | 4 packages: alert-dialog/dialog/tabs/tooltip | ✓ |

### 4.3 风格红线

| Constraint | Check | Result |
|---|---|---|
| No emoji in client src | grep | `<empty>` ✓ |
| Commit prefixes | `[T-WEB-06.5]`, `[T-WEB-07]`, `[T-WEB-07]` — three commits across two tasks | ✓ — T-WEB-06.5 separate task (1 commit), T-WEB-07 impl+handoff (2 commits); each task within §3.3 v2.1.1 budget |
| Per-file source lines ≤ 200 | largest: `cost.js` 188 lines | ✓ (just under cap) |
| Design tokens unchanged | git diff confirms | ✓ |

**Hard-constraint violations total: 0**

---

## 5. T-WEB-06.5 spec sync verification (the originating F1 fix)

| Check | Result |
|---|---|
| §6 T-WEB-06 acceptance row 2 text | Reads `\`[STALE]\` 标记与 \`hopper-dispatch --models <vendor>\` CLI 输出一致（\`--status\` 是 queue 摘要，不含 vendor cache；stale 信息由 \`--models\` / \`--capabilities\` 输出）` ✓ |
| §修订记录 v2.1.3 entry | Present, links to T-WEB-06 review F1 ✓ |
| Single-file commit | `git show ac74941 --name-only` → only `SPEC.md` ✓ |
| Doc-only (no source) | confirmed ✓ |
| Side-effects on T-WEB-07 implementation | None — T-WEB-07 doesn't depend on §6 T-WEB-06 wording ✓ |

T-WEB-06 F1 **closed**.

---

## 6. Acceptance verification (independent)

| # | Acceptance bullet (verbatim from §6 T-WEB-07) | Executor's evidence | Reviewer independent check | Pass? |
|---|---|---|---|---|
| 1 | Current `COST-LOG.md` rows parse, including `~` estimates | Live parse on `.hopper/COST-LOG.md` returned `rows=31`; unit covers `~12,000/~4,500` + `~$0.18` | **Inspected `cost.js`**: `parseTokens` line 129 `.replace(/~/g, '')` strips tildes; `parseUsd` line 143 regex matches `~?\$?` prefix optional. Test fixture `~12,000/~4,500` parses to `{tokensIn: 12000, tokensOut: 4500}` ✓; `~$0.18` → 0.18 ✓. Screenshot shows 31 rows in detail table, totals computed ✓ | ✓ |
| 2 | Aggregates match manual sum | Parser totals and independent reduce both: `rows=31, tokensIn=221200, tokensOut=15660, approxUsd=1.0521` | **Inspected `summarizeRows`** (line 147): uses `reduce` with running `roundUsd` per step (4-decimal precision); test verifies `0.10 + 0.20 + 0.05 = 0.35` exact (avoiding FP drift). Screenshot totals card shows $1.05 — matches executor's computed sum to 2-decimal display precision ✓ | ✓ |
| 3 | Pure Tailwind bars, no chart libraries | CDP `chartImports=[]`; grep `recharts/chart.js/d3/echarts/visx` package+source → `<empty>` | **Re-ran grep independently**: `Grep "recharts\|chart\.js\|d3\|echarts\|visx\|victory\|plotly" package.json dashboard/` returns `<empty>`. **Inspected `CostBars.tsx:56-67`**: bar is `<div className="h-4 flex-1 rounded-sm bg-muted/40"><div className="h-4 rounded-sm bg-primary" style={{ width: ... }} /></div>` — exactly the pattern from prompt. No JS chart library footprint. ✓ | ✓ |

**Acceptance passed: 3 / 3**

Plus reviewer-reproduced gates:
- `npm test` → **368/351/0/15** (the 2 "fails" are known CRLF fragility; executor's clean worktree shows 353/0) ✓
- `npm run dashboard:build` → 0.27 + 4.65 + 65.12 + 117.59 = **187.63 KB total**; main **117.59 KB < 120 KB** ceiling ✓

---

## 7. Bundle composition — outstanding efficiency

| Build | Main chunk | Lazy `TaskDetailRoute` | CSS | Main headroom |
|---|---|---|---|---|
| T-WEB-06                   | 116.86 KB | 65.12 KB | 4.60 KB | 41.6% |
| **T-WEB-07 (this round)**  | **117.59 KB** | 65.12 KB | 4.65 KB | **41.2%** |
| Δ                          | **+0.73 KB** | 0 | +0.05 KB | -0.4 pp |

Adding **3 stat cards + horizontal bar chart + 31-row detail table for ~+0.73 KB gzipped JS is exceptional**. The pure-Tailwind bar approach paid off — all visual weight came from CSS utility classes that were already in scope (`bg-primary`, `bg-muted/40`, `rounded-sm`, etc.); only the components themselves contributed JS bytes.

**Forecast revision**:
- T-WEB-08 polish backlog now ~11 items (8 + T-WEB-07's 4 new P3s minus duplicate coverage). Estimated +3-5 KB cumulative (keyboard shortcuts, ErrorBoundary, toast wiring, SSE for cost, 1MB log cap, exponential backoff).
- End-of-T-WEB-08 main chunk: ~121-123 KB / 200 KB cap → **38-40% headroom**.
- Safe.

---

## 8. Parser depth check

Spent extra time on `cost.js` since it's the new core logic. Verified:

| Concern | Check | Result |
|---|---|---|
| `~12,000/~4,500` tokens parsed | test asserts `{tokensIn: 12000, tokensOut: 4500}` | ✓ |
| `~$0.18` dollars parsed | test asserts `0.18` | ✓ |
| FP drift `0.10 + 0.20 + 0.05 == 0.35` | `roundUsd` per-step capping | ✓ |
| Empty file / ENOENT | line 7-9 catches `ENOENT`, returns empty | ✓ |
| Header column synonyms (Trigger/Task, Task-type/Role, Tokens/Tokens In/Out, Cost/Approx $) | `mapCostColumns` line 79-93 | ✓ |
| Missing optional columns (5-col vs 6-col rows) | `getCell` returns `''` for out-of-bounds; test asserts `notes === ''` | ✓ |
| Vendor inference: `"codex GPT-5"` → `"codex"` | known-prefix match | ✓ |
| Vendor inference: `"kimi-thinking"` → `"kimi"` | known-prefix match | ✓ |
| Vendor inference via `"prompt via codex"` → `"codex"` | explicit override regex | ✓ |
| Header without separator row | line 34-37 verifies separator before accepting rows | ✓ |
| Escape `\|` in cell content | `parseRowCells` handles backslash escape | ✓ |
| Multiple cost tables in same file | header reset on non-pipe line (line 21) | ✓ |
| `inferVendor("n/a")` | falls through to `cleanVendor("n")` → `"n"` (single-char vendor) — see F4 | ⚠ minor |

Parser is solid. One edge case (F4 below) but not load-bearing.

---

## 9. Design-token byte-match verification (§4.2)

- `globals.css` + `tailwind.config.ts`: untouched (executor SHA256 match)
- CostBars uses only token classes (`text-primary` / `text-muted-foreground` / `text-foreground` / `text-destructive` / `bg-primary` / `bg-muted/40`) — no hex hardcoded ✓
- `formatUsd` uses `value.toFixed(value >= 1 ? 2 : 4)` — adaptive decimal precision; small values like `$0.0010` get 4 decimals, big values get 2 — sensible

Result: **byte-match (unchanged)** ✓

---

## 10. Findings (severity-ordered)

### P0 / P1 / P2

**无。**

### P3

#### [F1] P3: CostBars missing SSE subscription for `COST-LOG.md` changes — uses infrastructure built in T-WEB-03 but doesn't wire it

- **Location**: `dashboard/client/src/components/CostBars.tsx:7-12`
- **Evidence**:
  ```tsx
  const { data, isError, isLoading } = useQuery({
    queryKey: queryKeys.cost,
    queryFn: fetchCost,
  });
  // No useSSE('/events/cost', refresh) — query is fetch-once + refresh-on-mount only
  ```
- **Root cause**: §6 T-WEB-07 acceptance doesn't explicitly require live updates, and FR-006 only specifies "render + aggregate" not "live update". Executor matched spec. But the `/events/cost` SSE channel exists (T-WEB-03), the watcher publishes on `COST-LOG.md` change, and the wiring pattern is `QueueRoute.tsx:7-14` (3 lines).
- **Why it matters**: When a vendor task completes and writes a cost row, the dashboard's Cost view doesn't reflect it until manual refresh. Minor sidequest UX gap; the live-update story is incomplete vs Queue/Task views.
- **Recommended fix** (T-WEB-08 polish, 3 lines):
  ```tsx
  const queryClient = useQueryClient();
  const refresh = useCallback(
    () => void queryClient.invalidateQueries({ queryKey: queryKeys.cost }),
    [queryClient]
  );
  useSSE('/events/cost', refresh);
  ```
- **Hard-constraint?**: no

#### [F2] P3: Sub-threshold vendor bars effectively invisible — tiny values render as 0%-width

- **Location**: `dashboard/client/src/components/CostBars.tsx:57-66`
- **Evidence**: Screenshot shows `claude` row with `$0.0000` — bar width is `0.0%`, so the inner `bg-primary` div has zero width. The track (`bg-muted/40`) is still visible but no fill indicator at all. For vendors with $0.0001 (opencode in screenshot), bar is also effectively invisible since `(0.0001 / 0.99) * 100 = 0.01%`.
- **Root cause**: Bar width is strictly proportional to USD; small values disappear.
- **Why it matters**: User can't visually distinguish "vendor used 0 cost" from "vendor used negligible cost" from the bars alone. They must read the right-aligned $ column. Bars become decorative-only for non-leading vendors.
- **Recommended fix**: T-WEB-08 polish — apply `min-width` to the fill when value > 0:
  ```tsx
  <div className="h-4 rounded-sm bg-primary" style={{ width: pct > 0 ? `max(${pct}%, 2px)` : '0' }} />
  ```
  Or use a log scale for the bars (less intuitive but more honest about non-zero presence).
- **Hard-constraint?**: no

#### [F3] P3: Detail table omits `role` / `tier` / `model` columns even though parser captures them

- **Location**: `dashboard/client/src/components/CostBars.tsx:79-100`
- **Evidence**: Table headers are `Date / Task / Vendor / Tokens / Approx $ / Notes` (6 cols). Parser returns `role / tier / model` fields too (cost.js:113,114,119). Detail table substitutes `notes || model` (line 95) — fallback only when notes empty.
- **Root cause**: Design choice to keep 6 columns scannable. Each parsed row has 8 fields; showing all would crowd width or require horizontal scroll.
- **Why it matters**: If user wants to differentiate `codex-gpt-5.5` vs `codex-gpt-5.4` (both inferred as vendor `codex`), they can't from the current table. The data is present in `row.model` but not displayed.
- **Recommended fix**: T-WEB-08 polish — either (a) add a `Model` column at the cost of compressing `Notes`, or (b) make rows expandable to show full parsed row, or (c) add a tooltip on the vendor cell showing the full model name. Reviewer leans (c) — uses existing `Tooltip` primitive.
- **Hard-constraint?**: no

#### [F4] P3: `inferVendor("n/a")` returns `"n"` — single-char vendor, semantically meaningless

- **Location**: `dashboard/server/lib/cost.js:172-183`
- **Evidence**: `inferVendor("n/a")` → lower = "n/a" → no `via` match → no known-prefix match → `lower.split(/\s|-/)[0]` = "n" → `cleanVendor("n")` returns "n" (alphanumeric survives the strip). Test `parseCostLogContent tolerates old audit rows...` includes a row with `model: "claude-opus-4-7"` (parsed as `claude`) and another with `model: "n/a"`. The test doesn't assert the second row's vendor field, but it would be `"n"` in `byVendor` aggregation.
- **Root cause**: `cleanVendor` fallback returns whatever survives stripping non-alphanumerics; for "n", that's "n". The `|| 'unknown'` fallback only triggers when the input is empty after cleaning.
- **Why it matters**: Aggregation has a `vendor: "n"` bucket showing up in `byVendor` for any model that starts with "n" or is short. Cosmetic, not functional.
- **Recommended fix**: T-WEB-08 polish — `cleanVendor` returns `'unknown'` for sub-3-char results:
  ```js
  function cleanVendor(value) {
    const cleaned = value.replace(/[^a-z0-9_-]/g, '');
    return cleaned.length >= 3 ? cleaned : 'unknown';
  }
  ```
- **Hard-constraint?**: no

---

## 11. Spec compliance map

| Spec section | Compliance | Notes |
|---|---|---|
| §3.1 CAN-DO | full | no new deps; reuses Tanstack Query + Tailwind only |
| §3.3 v2.1.1 commit cap | pass | T-WEB-06.5 standalone (1 commit); T-WEB-07 impl+doc (2 commits) — both within budget |
| §4.1 design principles | full | hairlines (cards), mono (data), dual-encoded (no need here since no status), info density (31 rows fit) |
| §4.2 design tokens | byte-match (unchanged) | — |
| §4.3 component map | extends — adds StatCard variant on Card (shadcn-compatible) | acceptable per "build on top of shadcn Card" |
| §4.4 motion ceilings | pass | no animations; bar width is static rendered, not animated |
| §5.1 directory structure | pass | `server/lib/cost.js`, `server/routes/cost.js`, `components/CostBars.tsx` per layout |
| §B.3 dependency whitelist | pass | zero net dep changes |
| FR-006 Cost Log View | **delivered** | render + aggregate + tokens + $ |
| FR-004 live refresh (queue.md) | passing (T-WEB-03) — but **cost.md live refresh missing** (see F1) | partial — cost not wired |
| NFR-005 bundle main < 200KB | **pass (117.59 KB, 41% headroom)** | exceptional |

---

## 12. Sibling-reviewer cross-check

- Other reviewer artifact: n/a — first and only reviewer
- §8.1 default pair not dispatched
- §8.4 satisfied: 1/1 reviewer gives `accept-with-note`

---

## 13. Verdict deliberation

- Hard-constraint violations: **0** → gate passes
- Severity tally: P0=0, P1=0, P2=0, P3=4
- Acceptance: **3/3** passed
- Design tokens: byte-match
- Bundle size: **main 117.59 KB / 200 KB (41% headroom)** — +0.73 KB for entire cost view is reviewer-celebratable
- Aggregation rule: "only P3 findings AND acceptance fully pass → **accept-with-note**"
- **Final verdict: `accept-with-note`**

---

## 14. Required follow-up actions

For executor:

- None for T-WEB-07 itself.

For sidequest maintainer (= user):

- F1-F4 carry to T-WEB-08 polish (cumulative ~11 items now).
- Optional: dispatch §8.1 default pair for adversarial cross-check at T-WEB-07 or T-WEB-08 (host-session review has caught the right issues so far; cross-check is for confidence, not necessity).

Cumulative T-WEB-08 polish backlog (now 11 items):
1. T-WEB-04 F3: `frontmatterFields` dynamic via `Object.keys`
2. T-WEB-04 F4: extract markdown-body Tailwind chain to `.markdown-body` class
3. T-WEB-05 F1: `readLogChunk` cap initial 1 MB tail
4. T-WEB-05 F2: reconnect exponential backoff + "lost connection" UI
5. T-WEB-05 F3: ANSI parser bg/bold (defer unless vendor needs)
6. T-WEB-06 F2: toast on probe failure (via `sonner`, already in §B.3.2)
7. T-WEB-06 F3: spawn 60s timeout + kill child
8. **T-WEB-07 F1**: SSE wire CostBars to `/events/cost`
9. **T-WEB-07 F2**: `min-width: 2px` (or log scale) for tiny cost bars
10. **T-WEB-07 F3**: model name visibility in detail table (tooltip on vendor cell preferred)
11. **T-WEB-07 F4**: `cleanVendor` `unknown` fallback for sub-3-char

---

## 15. Adversarial probe notes

- Hypothesis: `parseUsd("$0 marginal")` would match the "marginal" portion as a number → **ruled out** (regex `\$?\s*([0-9]+(?:\.[0-9]+)?)` anchors to first numeric token; "marginal" has no digits, match returns 0)
- Hypothesis: `parseTokens("~58000")` (no slash) returns wrong shape → **ruled out** (line 134 returns `{tokensIn, tokensOut: 0}` when no `/`)
- Hypothesis: `parseRowCells` malformed `|\\||` (literal `|` inside cell via backslash escape) → **verified** (line 57-60 handles `\` escape; backslash followed by `|` keeps `|` as literal char). Cost-log unlikely to need this, but defense in depth works.
- Hypothesis: Multiple cost tables in same `.hopper/COST-LOG.md` (e.g., legacy + new schema sections) → **handled** (line 21 resets `header = null` on non-pipe lines, allowing new tables to be detected later)
- Hypothesis: `summarizeByVendor` empty case crashes on `Math.max(...[])` → **partially confirmed** (CostBars.tsx:21 `Math.max(...data.byVendor.map(...), 0)` — the `0` final arg prevents `-Infinity` when array is empty; rendering then shows "no cost rows" message at line 36-37). Safe.
- Hypothesis: SSE infrastructure not wired for cost → **confirmed** (F1)
- Hypothesis: parser eats Memory on huge COST-LOG → **partial** (`readFile` loads entire content; for 1 MB COST-LOG it's fine; pathological GB-scale not real concern)
- Hypothesis: T-WEB-06.5 spec patch could have invalidated T-WEB-06 acceptance evidence → **ruled out** (T-WEB-06 evidence row 2 was already collected with `--models codex` not `--status`; the spec patch retroactively legitimized what was already done)
- Areas NOT examined:
  - Behavior under malformed COST-LOG.md (e.g., unclosed table)
  - Multi-language locale on `.toLocaleString()` for token counts
  - Cost view performance with 10000+ rows (current scale 31 rows; no virtualization)
