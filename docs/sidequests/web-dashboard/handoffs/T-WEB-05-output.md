---
task_id: T-WEB-05
sidequest: web-dashboard
spec_version: "2.1.2"
spec_anchor: "docs/sidequests/web-dashboard/SPEC.md::T-WEB-05"
executor: "codex-gpt-5.5"
role: sidequest-executor
status: done
start_time: "2026-05-22T02:26:00+08:00"
end_time: "2026-05-22T03:03:10+08:00"
commit_sha: "6a820b8"
log: ./T-WEB-05-output.log
review_required: true
review_status: pending
review_files: []
hard_constraint_violations: 0
bundle_size_gzipped_kb: 183.87
---

# T-WEB-05 - Live Log Stream

## Summary

Folded in the T-WEB-04 hard prerequisite as `ff482c9`, then implemented drawer tabs and a live log stream: `Output` / `Live log` / `Frontmatter` tabs, byte-offset log tailing through `/events/log/:id`, append-only client rendering, reconnect with offset preservation, and a hand-written minimal ANSI foreground parser.

## Files touched

**Client**
- `dashboard/client/src/components/TaskDrawer.tsx` (146 lines) - shadcn/Radix Tabs panes and LiveLog wiring
- `dashboard/client/src/components/LiveLog.tsx` (112 lines) - EventSource stream, reconnect, append-only DOM, scroll follow/lock
- `dashboard/client/src/components/ui/tabs.tsx` (40 lines) - shadcn/Radix Tabs primitive
- `dashboard/client/src/lib/ansi.ts` (55 lines) - minimal 16-color ANSI-to-HTML parser

**Server**
- `dashboard/server/lib/tail.js` (54 lines) - safe task-id log reader and per-task byte offsets
- `dashboard/server/events/sse.js` (73 lines) - initial log event on subscribe with `?offset=`
- `dashboard/server/events/watcher.js` (83 lines) - chokidar log events mapped to log chunks
- `dashboard/server/index.js` (126 lines) - log tailer injection and SSE-first shutdown order

**Tests / deps / evidence**
- `tests/unit/dashboard-log.test.js` (81 lines) - tail chunks, readNew no duplicates, SSE offset, ANSI state
- `tests/unit/dashboard-task.test.js` (107 lines) - frontmatter table import after drawer tabs split
- `package.json` / `package-lock.json` - added whitelisted `@radix-ui/react-tabs`
- `docs/sidequests/web-dashboard/handoffs/T-WEB-05-screenshot.png` - Live log ANSI visual proof

## Acceptance verification

| SPEC §6 T-WEB-05 acceptance | Evidence |
|---|---|
| Drawer has shadcn `Tabs`: `Output` / `Live log` / `Frontmatter` | `TaskDrawer.tsx` renders three Radix tab triggers; Chrome/CDP switched `Live log` to `data-state=active` |
| Server SSE `/events/log/:id` + byte-offset tail | `tests/unit/dashboard-log.test.js`: `readLogChunk reads only bytes after offset`, `log tailer readNew advances offset without duplicates`, `SSE log route honors reconnect offset` |
| Live stdout/log stream < 1s | Chrome/CDP temp `.hopper` proof appended ANSI + stdout text to `handoffs/T-WEB-05-output.log`; UI saw `second live line` in `230 ms` |
| Reconnect after network/server break does not duplicate bytes | Chrome/CDP closed server, waited for `data-state=retrying`, appended `after reconnect`, restarted same port; duplicate counts `{ initial: 1, live: 1, reconnect: 1 }` |
| Auto-follow at bottom; manual up-scroll locks focus/scroll | Chrome/CDP: after manual `scrollTop=0`, `data-scroll-lock=true` and `lockedScrollTop=0` after new append; after bottom scroll, `followDistance=0` |
| 5MB log memory < 200MB | Chrome/CDP appended `5,242,880` bytes; `Runtime.getHeapUsage.usedMB=10.04`, `lineCount=383`, `lineCap=10000` |
| ANSI red/green/yellow render | Unit `ansiToHtml maps minimal 16-color...`; Chrome/CDP DOM classes `text-destructive=true`, `text-primary=true`, `text-warning=true`; screenshot `T-WEB-05-screenshot.png` |

## §7.1 task checklist

| Checklist | Evidence |
|---|---|
| Task acceptance evidence | 7/7 rows above with unit, CDP, and screenshot evidence |
| `npm test` | `# tests 361`, `# pass 346`, `# fail 0`, `# skipped 15`, duration `5010.5052ms` |
| `npm run dashboard:build` | HTML gzip `0.27 kB`, CSS gzip `4.34 kB`, main JS gzip `106.88 kB`, lazy `TaskDetailRoute` gzip `72.38 kB`; total `183.87 kB < 200 kB` |
| §3.2 grep verify | See hard-constraint table below; violations `0` |
| New deps in §B.3 | `@radix-ui/react-tabs@^1.1.0` only; allowed by SPEC §B.3.3 |
| Third-party review | Pending; ready for §8 review dispatch |

## Lazy-load prerequisite evidence

| Item | Evidence |
|---|---|
| Hard prerequisite F1 committed before T-WEB-05 src commit | `ff482c9 [T-WEB-04.5] lazy-load TaskDetailRoute for bundle headroom` precedes `6a820b8` |
| Main chunk < 120 KB gzip | `npm run dashboard:build`: `assets/index-CBHpo2ms.js ... gzip: 106.88 kB` |
| TaskDetailRoute split into lazy chunk | `assets/TaskDetailRoute-B_Hvjoxh.js ... gzip: 72.38 kB` |
| T-WEB-04 F2 width aligned to v2.1.2 | `sheet.tsx` uses `w-[min(720px,calc(100vw-16px))]` |

## Hard-constraint self-check (§3.2)

| Constraint | Evidence |
|---|---|
| No `.hopper/` writes in T-WEB-05 commit | `git show --name-only --format= 6a820b8` has no `.hopper/` paths; browser proof used temp `.hopper` under `%TEMP%` |
| No existing `cli/ hosts/ commands/ .claude-plugin/ .codex-plugin/` edits | implementation commit touches only `dashboard/`, `tests/unit`, `package.json`, `package-lock.json` |
| No `executeDispatch` import in dashboard | `rg -n "executeDispatch|refetchInterval" dashboard package.json tests` => no dashboard/package hit; only existing loopback-negative tests mention `0.0.0.0` |
| Loopback only | `dashboard/server/index.js` default host `127.0.0.1`; `tests/unit/dashboard-server.test.js` rejects `--host 0.0.0.0` |
| No stack red-line packages | top-level package scan => `banned top-level: none` |
| Radix whitelist respected | top-level Radix deps: `@radix-ui/react-dialog`, `@radix-ui/react-tabs`, `@radix-ui/react-tooltip` |
| No external ANSI / virtual list deps | `package.json` contains no `ansi-to-html`, `react-window`, `react-virtualized`, or equivalent |
| No Redux/Zustand/MobX/Jotai/Recoil | package scan => none |
| No chart libs | package scan => none |
| No DB/auth libs | package scan => none |
| No MUI/AntD/Chakra/Mantine/NextUI/DaisyUI | package scan => none |
| No animation libs | package scan => none |
| UI has no emoji | changed UI files scanned with `\p{Extended_Pictographic}` => `no emoji pictographs in changed UI files` |
| Design tokens unchanged | `globals.css` SHA256 `789046FC976A7FC387D77BD64AC6EADA56014AEBF3EC9E31CC621454C423462C`; `tailwind.config.ts` SHA256 `D0E34ECFADDF4F035C3AA551530A57C41DFB36530F5AC5295D24FA34E299704C` |
| No Sheet overlay regression | `rg -n "SheetOverlay|Overlay" sheet.tsx TaskDrawer.tsx` => `<empty>` |
| File size cap | Largest touched source/test file is `TaskDrawer.tsx` at 146 lines; `package-lock.json` exempt by SPEC v2.0.1 |
| Commit cap | T-WEB-05 uses 2 commits max: impl `6a820b8`, doc-only handoff pending; T-WEB-04.5 `ff482c9` is separate housekeeping |
| No push / amend / `--no-verify` | Not performed |
| Commit prefix | `6a820b8 [T-WEB-05] implement live log stream` |

## New dependencies

**Whitelisted (§B.3.3)**:
- `@radix-ui/react-tabs@^1.1.0` - shadcn Tabs accessibility base.

**Out-of-whitelist**: none.

## Decisions / deviations

- `npx shadcn@latest view tabs` listed aggregate `radix-ui`, which SPEC forbids as a top-level package. I installed only `@radix-ui/react-tabs@^1.1.0` and used the shadcn/Radix primitive shape locally.
- ANSI parsing is hand-written in `lib/ansi.ts`; no external parser was added.
- Browser plugin path failed with `privileged native pipe bridge is not available; browser-client is not trusted`; rendered QA used local Chrome/CDP fallback.
- Live-stream proof used an isolated temp `.hopper` with `handoffs/T-WEB-05-output.log` append/reconnect to avoid mutating the project `.hopper/`; this exercises the same watcher, SSE route, offset tailer, and client EventSource path.

## Open questions

none.

## Commit

```text
ff482c9 [T-WEB-04.5] lazy-load TaskDetailRoute for bundle headroom
6a820b8 [T-WEB-05] implement live log stream
```

## Next recommendation

Ready for review. Recommended §8.1 reviewer pair for Codex executor:
- Primary: `opencode` with `deepseek-v4-flash`
- Secondary: `kimi`

---

## Reviews
