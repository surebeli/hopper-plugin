---
task_id: T-WEB-07
sidequest: web-dashboard
spec_version: "2.1.3"
spec_anchor: "docs/sidequests/web-dashboard/SPEC.md::T-WEB-07"
executor: "codex-gpt-5.5"
role: sidequest-executor
status: done
start_time: "2026-05-22T08:55:00+08:00"
end_time: "2026-05-22T09:33:12+08:00"
commit_sha: "80359ec"
log: ./T-WEB-07-output.log
review_required: true
review_status: pending
review_files: []
hard_constraint_violations: 0
bundle_size_gzipped_kb: 187.63
---

# T-WEB-07 - Cost Log View

## Summary

Synced SPEC v2.1.3 in `ac74941`, then implemented cost log parsing and the `/cost` dashboard view in `80359ec`: `GET /api/cost` parses `.hopper/COST-LOG.md`, returns `{rows, totals, byVendor}`, and the client renders stats, pure Tailwind vendor bars, and a detail table.

## Files touched

**Server**
- `dashboard/server/lib/cost.js` (167 lines) - COST-LOG table parser, totals, vendor aggregation
- `dashboard/server/routes/cost.js` (21 lines) - `GET /api/cost`
- `dashboard/server/index.js` (126 lines) - cost router gets the resolved hopper dir

**Client**
- `dashboard/client/src/components/CostBars.tsx` (98 lines) - stats, pure Tailwind bars, detail table
- `dashboard/client/src/lib/api.ts` (36 lines) - `fetchCost`
- `dashboard/client/src/lib/types.ts` (73 lines) - cost response types

**Tests / evidence**
- `tests/unit/dashboard-cost.test.js` (81 lines) - parser, aggregation, old-row tolerance, route response
- `docs/sidequests/web-dashboard/handoffs/T-WEB-07-screenshot.png` - `/cost` visual proof

## Acceptance verification

| SPEC §6 T-WEB-07 acceptance | Evidence |
|---|---|
| Current `COST-LOG.md` rows parse, including `~` estimates | Parser on live `.hopper/COST-LOG.md`: `rows=31`, no throw; unit covers `~12,000/~4,500` and `~$0.18` |
| Aggregates match manual sum | Parser totals and independent reduce both produced `rows=31`, `tokensIn=221200`, `tokensOut=15660`, `approxUsd=1.0521` |
| Pure Tailwind bars, no chart libraries | CDP `/cost`: `bars=6`, `rows=31`, `chartImports=[]`; `rg 'recharts|chart\\.js|d3|echarts|visx|victory|plotly' dashboard package.json tests/unit/dashboard-cost.test.js` => no hits |

## §7.1 task checklist

| Checklist | Evidence |
|---|---|
| Task acceptance evidence | 3/3 rows above with unit, live `.hopper/COST-LOG.md`, CDP, and screenshot evidence |
| `npm test` | Clean detached LF worktree at `80359ec`: `# tests 368`, `# pass 353`, `# fail 0`, `# skipped 15`, duration `15690.8798ms` |
| `npm run dashboard:build` | Clean detached LF worktree: HTML gzip `0.27 kB`, CSS gzip `4.65 kB`, main JS gzip `117.59 kB`, lazy `TaskDetailRoute` gzip `65.12 kB`; total `187.63 kB < 200 kB`; main `< 120 kB` |
| §3.2 grep verify | See hard-constraint table below; violations `0` |
| New deps in §B.3 | none |
| Third-party review | Pending; ready for §8 review dispatch |

## Hard-constraint self-check (§3.2)

| Constraint | Evidence |
|---|---|
| No `.hopper/` writes in T-WEB-07 commit | `git show --name-only --format= 80359ec -- .hopper` => empty |
| No existing `cli/ hosts/ commands/ .claude-plugin/ .codex-plugin/` edits | `git show --name-only --format= 80359ec -- cli hosts commands .claude-plugin .codex-plugin` => empty |
| No `executeDispatch` import / `refetchInterval` regression | `rg "executeDispatch|refetchInterval" dashboard/server dashboard/client/src` => no hits |
| Loopback only | refined scan found no non-loopback dashboard source hits |
| No forbidden spawn flags in dashboard source | literal scan for `--background` / `--dispatch` in `dashboard/server` + `dashboard/client/src` => no hits |
| No stack red-line packages | package scan `bannedHits=[]` |
| Radix whitelist respected | top-level Radix deps unchanged; `badRadix=[]`; no aggregate `radix-ui` |
| No chart libraries | package and source grep found no `recharts`, `chart.js`, `d3`, `echarts`, `visx`, `victory`, or `plotly` |
| No Redux/Zustand/MobX/Jotai/Recoil | package scan `bannedHits=[]` |
| No DB/auth libs | package scan `bannedHits=[]` |
| No MUI/AntD/Chakra/Mantine/NextUI/DaisyUI | package scan `bannedHits=[]` |
| No animation libs | package scan `bannedHits=[]` |
| UI has no emoji | changed UI files scanned with `\p{Extended_Pictographic}` => `no emoji pictographs in changed UI files` |
| Design tokens unchanged | `globals.css` SHA256 `789046FC976A7FC387D77BD64AC6EADA56014AEBF3EC9E31CC621454C423462C`; `tailwind.config.ts` SHA256 `D0E34ECFADDF4F035C3AA551530A57C41DFB36530F5AC5295D24FA34E299704C` |
| File size cap | Largest touched source/test file is `dashboard/server/lib/cost.js` at 167 lines |
| Commit cap | T-WEB-07 uses impl `80359ec` plus this doc-only handoff commit; within SPEC §3.3 v2.1.1 |
| No push / amend / `--no-verify` | Not performed |
| Commit prefix | `80359ec [T-WEB-07] implement cost log view` |

## New dependencies

none.

## Decisions / deviations

- COST-LOG has historical table variants (`Task-type`, `Role`, `Trigger`, `Tokens`), so `cost.js` accepts all current cost tables with `Date` + task/trigger + `Model` + `Approx $`.
- Vendor grouping uses explicit `via <vendor>` when present, then known model prefixes (`codex`, `kimi`, `opencode`, `copilot`, `agy`, `claude`, `deepseek`, `gemini`), then first token fallback.
- Browser plugin did not expose a callable local browser tool; CDP screenshot used headless Chrome fallback.

## Open questions

none.

## Commit

```text
ac74941 [T-WEB-06.5] spec sync — stale comparison command
80359ec [T-WEB-07] implement cost log view
```

## Next recommendation

Ready for review. Recommended §8.1 reviewer pair for Codex executor:
- Primary: `opencode` with `deepseek-v4-flash`
- Secondary: `kimi`
