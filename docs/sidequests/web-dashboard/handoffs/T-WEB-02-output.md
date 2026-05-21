---
task_id: T-WEB-02
sidequest: web-dashboard
spec_version: "2.0"
spec_anchor: "docs/sidequests/web-dashboard/SPEC.md::T-WEB-02"
executor: "codex-gpt-5.5"
role: sidequest-executor
status: done
start_time: "2026-05-22T00:20:00+08:00"
end_time: "2026-05-22T00:55:00+08:00"
commit_sha: null
log: ./T-WEB-02-output.log
review_required: true
review_status: pending
review_files: []
hard_constraint_violations: 0
bundle_size_gzipped_kb: 89.19
---

# T-WEB-02 - Queue View

## Summary

Acknowledgement for F4: `App.tsx` already had the route shell from T-WEB-01; this task fills the `<QueueTable />` path rather than creating routes from zero. Implemented `/api/queue` with `parseQueue`, a Tanstack Table queue view, five-status `StatusPill` mapping, 5s Tanstack Query polling fallback, and three focused tests.

## Files touched

**Server**
- `dashboard/server/routes/queue.js` (27 lines) - `GET /api/queue` reads `.hopper/queue.md` via `parseQueue`
- `dashboard/server/index.js` (96 lines) - injects queue router with optional `hopperDir`
- `dashboard/server/lib/hopper-dir.js` (17 lines) - loopback-safe repo `.hopper` discovery helper

**Client**
- `dashboard/client/src/components/QueueTable.tsx` (152 lines) - Tanstack Table queue grouping, row selection, polling fallback
- `dashboard/client/src/components/StatusPill.tsx` (23 lines) - `Badge` + lucide status glyphs + tooltip
- `dashboard/client/src/components/ui/table.tsx` (35 lines) - shadcn-compatible table primitive
- `dashboard/client/src/components/ui/tooltip.tsx` (26 lines) - dependency-free shadcn-compatible tooltip primitive
- `dashboard/client/src/lib/status.ts` (38 lines) - five-status color/glyph map
- `dashboard/client/src/lib/api.ts` (17 lines) - `fetchQueue`
- `dashboard/client/src/lib/types.ts` (19 lines) - queue task type
- `dashboard/client/src/App.tsx` (78 lines) - `/task/:id` keeps queue visible for selected-row state

**Tests / evidence**
- `tests/unit/dashboard-queue.test.js` (124 lines) - route response, table render, status mapping
- `docs/sidequests/web-dashboard/handoffs/T-WEB-02-screenshot.png` - selected-row screenshot

## Acceptance verification

| SPEC §6 T-WEB-02 acceptance | Evidence |
|---|---|
| Current queue renders all rows | `Invoke-RestMethod http://127.0.0.1:7777/api/queue` => `Count=34`, statuses `in-progress:1, pending:10, failed:2, done:21`; screenshot `T-WEB-02-screenshot.png` shows `1+10+2+21` groups |
| 5 status color + glyph double encoding | `dashboard/client/src/lib/status.ts` maps pending circle gray, in-progress solid mint, done empty mint, failed coral X, removed gray slash+line-through; `node --test tests/unit/dashboard-queue.test.js` verifies classes |
| Zero layout shift: mono fixed widths, row height 32px | `QueueTable.tsx` uses `table-fixed font-mono`, fixed `w-40/w-32/w-28`, row/cell `h-8`; test asserts `h-8` |
| Hover + selected row affordance | `QueueTable.tsx:131` has `hover:bg-muted/40`; `QueueTable.tsx:140` has `border-l-primary`; screenshot route `/task/T-PLUGIN-00` shows the 2px primary bar |
| SSE fallback until T-WEB-03 | `QueueTable.tsx:36` has `refetchInterval: 5000` |
| New tests >= 3 | `tests/unit/dashboard-queue.test.js`: route response, table render selected bar, status pill five-state mapping; full `npm test` passes |

## §7.1 task checklist

| Checklist | Evidence |
|---|---|
| Task acceptance evidence | 6/6 rows above with command/file/screenshot evidence |
| `npm test` | `# tests 350`, `# pass 335`, `# fail 0`, `# skipped 15` |
| `npm run dashboard:build` | JS gzip `89.19 kB`, CSS gzip `3.15 kB`, total gzip `92.34 kB < 200 kB` |
| §3.2 grep verify | See hard-constraint table below; violations `0` |
| New deps in §B.3 | No `package.json` dependency changes in T-WEB-02 |
| Third-party review | Pending; ready for §8 review dispatch |

## Hard-constraint self-check (§3.2)

| Constraint | Evidence |
|---|---|
| No `.hopper/` writes in this task | T-WEB-02 staged set excludes `.hopper/`; pre-existing user `.hopper` dirty files were not touched or staged |
| No existing `cli/ hosts/ commands/ .claude-plugin/ .codex-plugin/` edits | T-WEB-02 touched only `dashboard/`, `tests/unit/dashboard-queue.test.js`, and sidequest handoff files |
| No `executeDispatch` import | `rg -n "executeDispatch" dashboard package.json tests/unit cli/bin/hopper-dashboard cli/bin/hopper-dashboard.cmd` => `<empty>` |
| Loopback only | Runtime `Get-NetTCPConnection -LocalPort 7777,5173` showed `127.0.0.1` only |
| No stack red-line packages | combined `Select-String package.json` over §B.3 banned list => `<empty>` |
| No new out-of-whitelist deps | `package.json` unchanged for T-WEB-02 |
| No Next/Remix/Vue/etc. scaffold | no new framework deps or files |
| No Redux/Zustand/etc. | no new state deps; uses Tanstack Query already whitelisted |
| No chart/DB/auth packages | no package changes |
| No MUI/AntD/Chakra/Mantine/NextUI/DaisyUI | no package changes |
| No animation packages | no package changes |
| UI has no emoji | `rg -n "[\\p{Emoji_Presentation}\\p{Extended_Pictographic}]" dashboard/client/src` => `<empty>` |
| Design tokens unchanged | `globals.css` SHA256 `789046FC...`; `tailwind.config.ts` SHA256 `D0E34EC...`; both unchanged from T-WEB-01 |
| File size cap | Largest changed source file `QueueTable.tsx` 152 lines; largest new test file 124 lines |
| No push / amend / `--no-verify` | Not performed |
| Commit prefix | Commit message prepared with `[T-WEB-02]` prefix |

## Decisions / deviations

- Ran `npx shadcn@latest add table tooltip --dry-run -y -c dashboard/client`; CLI prompted because `dashboard/client` intentionally has no nested `package.json`. To avoid adding `@radix-ui/react-tooltip` outside §B.3, added shadcn-compatible local `table` and `tooltip` primitives with no package changes.
- `/task/:id` maps to `QueueRoute` for T-WEB-02 so the selected-row 2px primary bar can be verified before the T-WEB-04 drawer exists.

## Open questions

none.

## Commit

```text
pending [T-WEB-02] implement queue view
```

## Next recommendation

Ready for review. Recommended §8.1 reviewer pair for Codex executor:
- Primary: `opencode` with `deepseek-v4-flash`
- Secondary: `kimi`

## Reviews

<!-- Reviewers append below. -->
