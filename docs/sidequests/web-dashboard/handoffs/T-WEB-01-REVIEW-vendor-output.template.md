---
task_id: T-WEB-01
review_of: T-WEB-01
sidequest: web-dashboard
spec_version: "2.0"
spec_anchor: "docs/sidequests/web-dashboard/SPEC.md::T-WEB-01"
reviewer_vendor: "<codex | kimi | opencode | copilot | agy>"
reviewer_model: "<e.g. gpt-5.5 | kimi-thinking | deepseek/deepseek-v4-flash | claude-sonnet-4.6 | gemini-3.5-flash>"
reviewer_reasoning: "<xhigh | high | medium | low | n/a>"
review_round: 1
start_time: "<ISO-8601>"
end_time: "<ISO-8601>"
duration_ms: null
input_artifacts:
  - docs/sidequests/web-dashboard/SPEC.md
  - docs/sidequests/web-dashboard/handoffs/T-WEB-01-output.md
  - docs/sidequests/web-dashboard/handoffs/T-WEB-01-output.log
  - "<commit-sha>"
verdict: "<accept | accept-with-note | rework | revert>"
hard_constraint_violations: 0    # >0 = automatic rework regardless of other findings
findings_count:
  P0: 0
  P1: 0
  P2: 0
  P3: 0
acceptance_passed: 0             # X out of 7 §6 T-WEB-01 acceptance bullets
acceptance_total: 7
bundle_size_check: null          # "passed" / "failed" / "unable-to-verify"
design_token_check: null         # "byte-match" / "drift" / "unable-to-verify"
log: ./T-WEB-01-REVIEW-<vendor>-output.log
---

# T-WEB-01 — Adversarial Review by `<reviewer_vendor>` (`<reviewer_model>`)

> Reviewer template skeleton. Replace every `<bracketed>` placeholder; delete
> `<!-- ... -->` commentary before commit. **Be specific** — generic findings
> ("could be more robust") fail the review's own quality bar and will be
> ignored in verdict aggregation.

---

## 1. Verdict (lead with the answer)

**`<accept | accept-with-note | rework | revert>`**

One-paragraph rationale (3–5 sentences). State the strongest single reason
for the verdict. If `rework` / `revert`: the specific finding ID that
triggers it.

<paragraph>

---

## 2. Review scope

- Commit reviewed: `<short-sha>` — `<commit-message-first-line>`
- Diff size: `<N>` files, `+<additions> / -<deletions>`
- Time spent on review: `<estimate>`
- Reviewer approach: <one line, e.g. "hypothesis-first: §3.2 hard-constraint
  greps → §4.2 token byte-diff → npm run dashboard:build re-execution →
  acceptance bullet replay">

## 3. Files reviewed

| File | LOC reviewed | Reviewer notes |
|---|---|---|
| `dashboard/server/index.js` | <N> | <observation> |
| `dashboard/client/vite.config.ts` | <N> | proxy config / build target |
| `dashboard/client/tailwind.config.ts` | <N> | **token byte-match vs §4.2.2** |
| `dashboard/client/src/styles/globals.css` | <N> | **token byte-match vs §4.2.1** |
| `dashboard/client/components.json` | <N> | shadcn baseColor / cssVariables |
| `dashboard/client/src/main.tsx` | <N> | Provider wiring |
| `dashboard/client/src/App.tsx` | <N> | hello page + clock |
| `dashboard/client/src/components/ui/*.tsx` | <N> | shadcn generated; checked for unexpected drift |
| `cli/bin/hopper-dashboard` | <N> | bin shape, --port flag, --dev flag |
| `cli/bin/hopper-dashboard.cmd` | <N> | Windows parity |
| `package.json` | <N> | dep additions — see §6.2 below |
| `tsconfig.base.json` | <N> | TS shared config |
| `tests/unit/dashboard-server.test.js` | <N> | coverage focus |

Total: ~`<N>` LOC across `<M>` files.

---

## 4. Hard-constraint verification (§3.2)

<!-- AUTOMATIC REWORK triggers. Rerun greps independently — do not trust
     executor's self-check table. Paste your own command output. Any single
     violation forces verdict ∈ {rework, revert}, regardless of other
     dimensions. -->

### 4.1 协议红线

| Constraint | Independent check | Result |
|---|---|---|
| No writes to `.hopper/` | `git diff --name-only <sha>^..<sha> \| grep "^\.hopper/"` | `<empty / lines>` |
| No `executeDispatch` import | `grep -rn "executeDispatch" dashboard/` | `<empty / refs>` |
| Only loopback bind | `grep -rnE "0\.0\.0\.0\|listen\(.*'::'\)\|'\\*'" dashboard/server/` | `<empty / refs>` |
| No edits to cli/ hosts/ commands/ existing files | `git diff --name-only <sha>^..<sha> \| grep -E "^(cli\|hosts\|commands)/" \| grep -v "^cli/bin/hopper-dashboard"` | `<empty / lines>` |
| package.json edits additive-only | `git diff <sha>^..<sha> package.json` | <inspect: deletions are formatting-only> |

### 4.2 栈红线（v2.0）

<!-- Each row reruns the executor's grep on package.json + import statements.
     ANY hit = auto rework. -->

| Family | Independent check on package.json | Result |
|---|---|---|
| SSR frameworks | `grep -E "\"(next\|remix\|gatsby\|astro)\":" package.json` | `<empty / refs>` |
| Non-React UI frameworks | `grep -E "\"(vue\|svelte\|@angular\|preact\|solid-js)\":" package.json` | `<empty / refs>` |
| External state libs | `grep -E "\"(redux\|@reduxjs/toolkit\|zustand\|mobx\|jotai\|recoil)\":" package.json` | `<empty / refs>` |
| Chart libs | `grep -E "\"(recharts\|chart\.js\|d3\|echarts\|visx\|victory\|plotly)\":" package.json` | `<empty / refs>` |
| DB / ORM | `grep -E "\"(sqlite\|better-sqlite3\|prisma\|drizzle-orm\|typeorm\|sequelize\|mongoose)\":" package.json` | `<empty / refs>` |
| Auth | `grep -E "\"(passport\|jsonwebtoken\|express-session\|next-auth)\":" package.json` | `<empty / refs>` |
| Other UI libs | `grep -E "\"(@mui/\|antd\|@chakra-ui\|@mantine\|@nextui-org\|daisyui)" package.json` | `<empty / refs>` |
| Animation libs | `grep -E "\"(framer-motion\|@react-spring\|gsap\|lottie-react)\":" package.json` | `<empty / refs>` |

### 4.3 风格红线

| Constraint | Independent check | Result |
|---|---|---|
| No emoji in client src | `grep -rnP "[\x{1F300}-\x{1FAFF}\x{1F000}-\x{1F2FF}\x{2600}-\x{27BF}]" dashboard/client/src/` | `<empty / refs>` |
| Single commit | `git rev-list <sha> ^origin/main --count` | `<N>` (expected 1) |
| Commit prefix `[T-WEB-01]` | `git log -1 --format=%s <sha>` | `<message>` |
| No push | `git log origin/main..<sha>` | `<assessment>` |
| No amend | `git reflog show <branch> \| head -5` | `<assessment>` |
| Per-file lines ≤ 200 | `git diff --stat <sha>^..<sha> \| awk '$3 > 200'` | `<empty / files>` |

### 4.4 §B.3 white-list completeness

| Check | Method | Result |
|---|---|---|
| All new runtime deps in §B.3.2 | `diff <(jq -r '.dependencies\|keys[]' package.json) <(extract --whitelist spec §B.3.1+§B.3.2)` | `<diff lines or empty>` |
| All new devDeps in §B.3.3 | `diff <(jq -r '.devDependencies\|keys[]' package.json) <(extract --whitelist spec §B.3.3)` | `<diff lines or empty>` |
| Out-of-whitelist deps | <list each>; <justified in commit body? evaluate> | `<list>` |

**Hard-constraint violations total: `<N>`**

> If `N > 0`: verdict MUST be `rework` (or `revert` if catastrophic). Skip §11
> deliberation — the gate is binary.

---

## 5. Acceptance verification (independent)

<!-- Recompute each acceptance bullet from §6 T-WEB-01 yourself. Do not
     accept executor's evidence at face value; verify command outputs by
     re-running where feasible. Mark ✓ / ✗ / unable-to-verify. -->

| # | Acceptance bullet (verbatim from §6) | Executor's evidence | Reviewer independent check | Pass? |
|---|---|---|---|---|
| 1 | `npm install` 干净（无 peer-dep warning，无 deprecated） | <quote> | <your `npm install` output> | <✓/✗/?> |
| 2 | `npm run dashboard:dev` 起 Vite 5173 + server 7777，HMR < 200ms | <quote> | <your timing measurement> | <✓/✗/?> |
| 3 | `npm run dashboard:build` gzipped < 200KB | <quote> | <your build output gzip size> | <✓/✗/?> |
| 4 | `node cli/bin/hopper-dashboard` prod 起 7777 + hello + 走表 | <quote> | <screenshot or curl evidence> | <✓/✗/?> |
| 5 | `--port 9090` flag 可改端口 | <quote> | <your `--port 9090` run> | <✓/✗/?> |
| 6 | 不监听非 loopback | <quote> | <your `Get-NetTCPConnection` / `lsof -i :7777` output> | <✓/✗/?> |
| 7 | `npm test` 全绿 | <quote> | <your `npm test` tally> | <✓/✗/?> |

**Acceptance passed: `<X>` / `7`**

---

## 6. Design-token byte-match verification (§4.2)

<!-- This dimension is sidequest-specific and critical. Token drift is one of
     the highest-leverage defects — shadcn defaults are appealing but
     forbidden. Mechanically diff. -->

### 6.1 globals.css (§4.2.1)

```
$ diff <(extract :root from dashboard/client/src/styles/globals.css) \
       <(extract §4.2.1 from SPEC.md)
<paste output>
```

- Result: `<byte-match / drift>`
- If drift: which tokens deviate and by how much:
  - `<token>`: spec=`<value>`, code=`<value>` — <intentional? acceptable?>

### 6.2 tailwind.config.ts (§4.2.2)

```
$ diff <(extract theme.extend from dashboard/client/tailwind.config.ts) \
       <(extract §4.2.2 from SPEC.md)
<paste output>
```

- Result: `<byte-match / drift>`
- Critical sub-checks:
  - `borderRadius.DEFAULT` is `'2px'` (NOT shadcn default `'0.5rem'`): `<verified / fail>`
  - `fontSize.base` is `['13px', ...]` (NOT default `'0.875rem'`): `<verified / fail>`
  - `colors.primary` resolves to HSL `158 71% 55%`: `<verified / fail>`
  - No additional Tailwind plugins beyond `tailwindcss-animate`: `<verified / fail>`

### 6.3 shadcn components.json baseline

- `style`: <inspect> (should be `default` or `new-york`; either acceptable)
- `tailwind.cssVariables`: must be `true` (otherwise §4.2 tokens won't bind)
- `baseColor`: <inspect> (should not matter since we override)

---

## 7. Findings (severity-ordered)

### 7.1 Severity definitions

| Level | Definition | Verdict impact |
|---|---|---|
| **P0** | Security / data-loss / undefined-behavior / hard-constraint trip | Auto rework or revert |
| **P1** | Acceptance bullet failed, or violates §6 scope, or correctness bug | Likely rework |
| **P2** | Test gap, design-token drift, observability hole, maintainability risk | accept-with-note typically |
| **P3** | Style nit, doc typo, dead code | accept typically |

### 7.2 Finding entries

<!-- One block per finding. Order P0 → P1 → P2 → P3, then by file path. If
     none at a level, write "无" under the subhead. -->

#### [F1] `<P0 | P1 | P2 | P3>`: `<one-line title>`

- **Location**: `<file:line-range>`
- **Evidence**:
  ```
  <quoted code or command output that establishes the defect>
  ```
- **Root cause**: <why the defect exists>
- **Why it matters**: <what fails / degrades; trigger condition>
- **Recommended fix**: <concrete change, ideally <5 lines or a clear sketch>
- **Hard-constraint?**: yes / no

#### [F2] ...

<repeat>

---

## 8. Spec compliance map

| Spec section | Compliance | Notes |
|---|---|---|
| §3.1 CAN-DO whitelist | <full / partial / drift> | <which items used> |
| §3.3 file scope (≤200 lines/commit, single commit) | <pass/fail> | <stats> |
| §4.1 design principles (7 principles) | <which honored / drifted> | <specifics> |
| §4.2.1 globals.css tokens | <byte-match / drift> | see §6.1 |
| §4.2.2 tailwind.config tokens | <byte-match / drift> | see §6.2 |
| §4.3 component map (use shadcn equivalents) | <n/a for T-WEB-01> | <button/card/badge present?> |
| §4.4 motion ceilings (≤180ms, no framer-motion) | <pass/fail> | <grep verify> |
| §5.1 directory structure | <pass/fail> | <unexpected paths?> |
| §B.3 dependency whitelist | <pass/fail> | <see §4.4 above> |
| NFR-001 prod cold start < 1.5s | <measured / unmeasured> | <actual> |
| NFR-003 server memory < 100MB | <measured / unmeasured> | <actual> |
| NFR-004 Vite dev cold start < 2s, HMR < 200ms | <measured / unmeasured> | <actual> |
| NFR-005 prod bundle gzipped < 200KB | <measured> | <actual: __ KB> |

---

## 9. Sibling-reviewer cross-check (if applicable)

- Other reviewer artifact: `<path or "n/a — first reviewer">`
- Convergence on hard-constraint count: <agree / disagree, specify>
- Findings overlap: <which finding IDs are duplicates>
- Net-new findings from this review: <list>
- Disagreement on verdict (if any): <state and justify>

---

## 10. Verdict deliberation

<!-- Aggregation rule:
       - any hard-constraint violation                  → rework / revert
       - any P0                                         → rework / revert
       - any P1 that blocks an acceptance bullet        → rework
       - design-token drift > 2 tokens                  → rework
       - only P2/P3 findings AND acceptance fully pass  → accept-with-note
       - zero findings AND acceptance fully pass        → accept
-->

- Hard-constraint violations: `<N>` → `<gate result>`
- Severity tally: P0=`<n>` P1=`<n>` P2=`<n>` P3=`<n>`
- Acceptance: `<X>/7` passed
- Design tokens: `<byte-match / drift / catastrophic-drift>`
- Bundle size: `<X> KB` vs spec `< 200 KB` → `<pass/fail>`
- Aggregation rule applied: `<which bullet from above>`
- **Final verdict: `<accept | accept-with-note | rework | revert>`**

---

## 11. Required follow-up actions

For executor (priority order):

1. <action, referencing F-id> — <hard / soft>
2. <action> — <hard / soft>

For sidequest maintainer (= user):

- <decision needed, if any>

If verdict = `accept`: write "无 follow-up actions; ship as-is."

---

## 12. Adversarial probe notes (reviewer's hypothesis log)

<!-- Optional but encouraged. Helps future audits understand coverage depth
     and surfaces blind-spots. Keep terse — bullets, not prose. -->

- Hypothesis: `<hunch>` → <verified / ruled out / undetermined>; evidence: <…>
- Areas NOT examined this round (deferred / out-of-time): <list>

---

## Appendix — review log

See sibling `T-WEB-01-REVIEW-<vendor>-output.log` for the raw dispatch
stdout / reasoning trace.
