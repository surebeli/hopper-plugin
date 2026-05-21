---
task_id: T-WEB-04
sidequest: web-dashboard
spec_version: "2.1.1"
spec_anchor: "docs/sidequests/web-dashboard/SPEC.md::T-WEB-04"
executor: "codex-gpt-5.5"
role: sidequest-executor
status: done
start_time: "2026-05-22T01:28:00+08:00"
end_time: "2026-05-22T01:53:26+08:00"
commit_sha: "239e835"
log: ./T-WEB-04-output.log
review_required: true
review_status: pending
review_files: []
hard_constraint_violations: 0
bundle_size_gzipped_kb: 179.22
---

# T-WEB-04 - Task Detail Drawer

## Summary

Folded in T-WEB-03 review notes F2/F3, then implemented task detail routing: `/task/:id` keeps the queue visible, opens a Radix Dialog-backed shadcn Sheet with no overlay, fetches `GET /api/task/:id`, renders 13 frontmatter fields with `—` fallback, and renders markdown body tables, code blocks with line numbers, lists, and links.

## Files touched

**Server**
- `dashboard/server/routes/task.js` (51 lines) - reads `.hopper/handoffs/:id-output.md` via `readFrontmatter`
- `dashboard/server/index.js` (120 lines) - injects task router with `hopperDir`
- `dashboard/server/events/watcher.js` (75 lines) - maps `-leader-feedback.md` to `task/:id`

**Client**
- `dashboard/client/src/components/ui/sheet.tsx` (73 lines) - shadcn/Radix Sheet without overlay
- `dashboard/client/src/components/TaskDrawer.tsx` (129 lines) - drawer query, SSE refresh, frontmatter table, markdown body
- `dashboard/client/src/routes/TaskDetailRoute.tsx` (12 lines) - queue + drawer deep-link route
- `dashboard/client/src/App.tsx` (80 lines) - `/task/:id` now uses `TaskDetailRoute`
- `dashboard/client/src/lib/api.ts`, `types.ts`, `sse.ts`, `types/markdown-it.d.ts` - task fetch/types and SSE parse guard

**Tests / deps / evidence**
- `tests/unit/dashboard-task.test.js` (107 lines) - task API, 13 fields/fallback, markdown rendering
- `tests/unit/dashboard-sse.test.js` (121 lines) - handoff/review/leader-feedback task-channel mapping
- `package.json` / `package-lock.json` - added whitelisted `@radix-ui/react-dialog`
- `docs/sidequests/web-dashboard/handoffs/T-WEB-04-screenshot.png` - drawer visual proof

## Acceptance verification

| SPEC §6 T-WEB-04 acceptance | Evidence |
|---|---|
| Click queue row opens drawer and URL becomes `/task/T-XXX` | Chrome/CDP fallback: row click returned `clickOpen: "/task/T-WEB-04"` and `clickedHasDrawer: true` |
| Direct `/task/T-XXX` deep-link opens drawer | Chrome/CDP fallback direct route result: `url: "/task/T-WEB-04"`, `hasQueue: true`, `hasDrawer: true` |
| 13 frontmatter fields, missing values as `—`, no `undefined` / `null` | Unit `TaskDetailPanel renders 13 frontmatter fields...`; browser result `fields: 13`, `hasFallback: true`, `hasUndefined: false` |
| Body markdown renders table, code block with line numbers, list, link | Unit `renderMarkdown outputs table...`; browser result `hasBodyTable: true`, `hasCodeLines: true`, `hasList: true`, `hasLink: true` |
| Close drawer returns URL to `/` | Chrome/CDP fallback after close: `afterClose: "/"` |

## §7.1 task checklist

| Checklist | Evidence |
|---|---|
| Task acceptance evidence | 5/5 rows above with unit and browser evidence |
| `npm test` | `# tests 357`, `# pass 342`, `# fail 0`, `# skipped 15`, duration `4964.5364ms` |
| `npm run dashboard:build` | HTML gzip `0.27 kB`, CSS gzip `4.12 kB`, JS gzip `174.83 kB`; total `179.22 kB < 200 kB` |
| §3.2 grep verify | See hard-constraint table below; violations `0` |
| New deps in §B.3 | `@radix-ui/react-dialog@^1.1.0` only; allowed by SPEC §B.3.3 |
| Third-party review | Pending; ready for §8 review dispatch |

## Hard-constraint self-check (§3.2)

| Constraint | Evidence |
|---|---|
| No `.hopper/` writes in this task commit | `git show --name-only --format= 239e835` has no `.hopper/` paths; browser proof used temp `HOPPER_DIR` |
| No existing `cli/ hosts/ commands/ .claude-plugin/ .codex-plugin/` edits | implementation commit touches only `dashboard/`, `tests/unit`, `package.json`, `package-lock.json` |
| No `executeDispatch` import | `rg -n "executeDispatch|refetchInterval" dashboard package.json tests/unit cli/bin/hopper-dashboard cli/bin/hopper-dashboard.cmd` => `<empty>` |
| Loopback only | bind grep returned `<empty>`; browser server used `http://127.0.0.1:7785` |
| No stack red-line packages | package red-line scan including aggregate `radix-ui` => `NO_BANNED_PACKAGES` |
| Radix whitelist respected | top-level Radix deps are only `@radix-ui/react-dialog` and `@radix-ui/react-tooltip` |
| No out-of-whitelist deps | no other top-level dependency additions |
| No overlay/dimming in Sheet | `rg "SheetOverlay|sheet-overlay|bg-black|shadow" sheet.tsx TaskDrawer.tsx` => `<empty>`; browser `overlayCount: 0` |
| No full highlight.js bundle | imports use `highlight.js/lib/core` plus 5 language modules |
| UI has no emoji | `rg -n "[\\p{Emoji_Presentation}\\p{Extended_Pictographic}]" dashboard/client/src` => `<empty>` |
| Design tokens unchanged | `globals.css` SHA256 `789046FC976A7FC387D77BD64AC6EADA56014AEBF3EC9E31CC621454C423462C`; `tailwind.config.ts` SHA256 `D0E34ECFADDF4F035C3AA551530A57C41DFB36530F5AC5295D24FA34E299704C` |
| File size cap | Largest touched source/test file is `TaskDrawer.tsx` at 129 lines; `package-lock.json` exempt by SPEC v2.0.1 |
| Handoff split cap | This task uses 2 commits max: impl `239e835`, handoff pending |
| No push / amend / `--no-verify` | Not performed |
| Commit prefix | `239e835 [T-WEB-04] implement task detail drawer` |

## New dependencies

**Whitelisted (§B.3.3)**:
- `@radix-ui/react-dialog@^1.1.0` - shadcn Sheet accessibility base.

**Out-of-whitelist**: none.

## Decisions / deviations

- `npx shadcn@latest add sheet --dry-run -y -c dashboard/client` still prompts because this repo has only a root `package.json`; `npx shadcn@latest view sheet` currently lists aggregate `radix-ui`, which SPEC forbids as a top-level dep. I installed only `@radix-ui/react-dialog@^1.1.0` and used the shadcn Sheet source shape from the official Sheet docs.
- Imported `highlight.js/lib/core` plus selected language modules instead of the full package entry so the bundle stays under the 200 KB gzip cap.
- Browser plugin path failed with `privileged native pipe bridge is not available; browser-client is not trusted`; rendered QA used local Chrome/CDP fallback.

## Open questions

none.

## Commit

```text
239e835 [T-WEB-04] implement task detail drawer
```

## Next recommendation

Ready for review. Recommended §8.1 reviewer pair for Codex executor:
- Primary: `opencode` with `deepseek-v4-flash`
- Secondary: `kimi`

---

## Reviews
