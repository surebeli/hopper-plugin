---
task_id: T-WEB-08
sidequest: web-dashboard
spec_version: "2.1.3"
spec_anchor: "docs/sidequests/web-dashboard/SPEC.md::T-WEB-08"
executor: "codex-gpt-5.5"
role: sidequest-executor
status: done
start_time: "2026-05-22T09:45:00+08:00"
end_time: "2026-05-22T10:55:00+08:00"
commit_sha: "028c0a0"
effective_head_sha: "3558b0e"
log: ./T-WEB-08-output.log
review_required: true
review_status: pending
hard_constraint_violations: 0
bundle_size_gzipped_kb: 198.76
---

# T-WEB-08 - Final Polish + Acceptance

## Summary

Implemented final polish in `028c0a0`: keyboard shortcuts, queue search, route empty-state refinements, runtime idle state, ErrorBoundary, and README updates. Folded the final F-07-3 runtime tooltip fix in `3558b0e` after CDP caught the missing provider on `/cost`.

## Files touched

**Polish backlog**
- `a8f0495 [T-WEB-07.5] fold polish backlog`
- `3558b0e [T-WEB-07.5] wrap cost tooltips with provider`

**Final polish**
- `dashboard/client/src/App.tsx` - global shortcut handling and runtime idle/live state
- `dashboard/client/src/components/QueueTable.tsx` - search input, keyboard row selection, enter-to-open
- `dashboard/client/src/components/ErrorBoundary.tsx` - local class ErrorBoundary with AlertDialog UI
- `dashboard/client/src/main.tsx` - ErrorBoundary wrapper
- `dashboard/README.md` - dev/prod, port, shortcuts, unsupported scope; 33 lines
- `tests/unit/dashboard-queue.test.js` - selection helper and shortcut route mapping
- `tests/unit/dashboard-task.test.js` - ErrorBoundary copy/state coverage

## Acceptance verification

| SPEC §6 T-WEB-08 acceptance | Evidence |
|---|---|
| Keyboard shortcuts | CDP key events: `/` focused `[data-queue-search]`; `j` + Enter opened `/task/T-AUDIT-PH6B-agy`; Esc returned `/`; `g v` -> `/vendors`; `g c` -> `/cost` |
| Empty states | Queue empty remains `[··· ] queue empty`; no-match state added; runtime panel now reports `idle` when no in-progress rows; vendor no-cache hint added; cost no rows retained |
| Error boundary | `tests/unit/dashboard-task.test.js`: `ErrorBoundary.getDerivedStateFromError()` and `errorDialogCopy()` assertions; CDP caught and proved boundary during `/cost` regression before `3558b0e` fix |
| README <= 80 lines | `dashboard/README.md` is 33 lines and documents dev/prod, port, shortcuts, and unsupported remote/auth/persistence scope |
| Regression pass T-WEB-01..07 | Clean worktree at `3558b0e`: `npm test` => `# tests 376`, `# pass 361`, `# fail 0`, `# skipped 15`; route screenshots for queue/drawer/vendors/cost |
| Overall real dispatch | Isolated `HOPPER_DIR=%TEMP%\\hopper-webdash-e2e`; `node cli/bin/hopper-dispatch T-WEB-08-E2E --background --reasoning low`; codex PID 2324, exit 0, `duration_ms=47811`, log 100869 bytes; dashboard API `/api/task/T-WEB-08-E2E` returned `adapter_status=success` |

## Regression matrix

| Task | Acceptance total | Still passing | Evidence |
|---|---:|---:|---|
| T-WEB-01 | 7 | 7 | `node cli/bin/hopper-dashboard` prod startup verified on `127.0.0.1:7788`; build assets still present |
| T-WEB-02 | 6 | 6 | Queue screenshot `T-WEB-08-queue.png`; status colors/glyphs and selected bar still visible |
| T-WEB-03 | 4 | 4 | Dashboard tests include watcher/SSE routes; `node --test tests/unit/dashboard-*.test.js` 33/33 pass |
| T-WEB-04 | 5 | 5 | Drawer screenshot `T-WEB-08-task-drawer.png`; deep link `/task/T-PLUGIN-00` works |
| T-WEB-05 | 7 | 7 | Real dispatch generated 100869-byte log; dashboard task API exposes log frontmatter; log route covered by unit tests |
| T-WEB-06 | 4 | 4 | Vendors screenshot `T-WEB-08-vendors.png`; probe write-path tests still pass, including timeout kill |
| T-WEB-07 | 3 | 3 | Cost screenshot `T-WEB-08-cost.png`; parser totals `rows=31`, tokens `236860`, approx `$1.05`; chart grep clean |

## §7.2 overall acceptance

| Overall item | Evidence |
|---|---|
| One-command startup | `node cli/bin/hopper-dashboard --port 7788`; `/api/health` => `{"ok":true,"mode":"prod"}` |
| Real dispatch reflected by dashboard | Isolated dashboard on port 7791 with same `HOPPER_DIR`; `--background` codex job completed success; `/api/task/T-WEB-08-E2E` returned completed frontmatter |
| Server shutdown has no project `.hopper/` side effect | Before/after shutdown status identical: existing `.hopper/handoffs/leader-tasklist.md`, `.hopper/queue.md`, and two untracked audit files only |
| NFR-001..007 | Matrix below |
| Windows 11 | All commands run on Windows 11 / PowerShell. macOS not available in this environment |

## NFR matrix

| NFR | Evidence |
|---|---|
| NFR-001 local only | Dashboard binds `127.0.0.1`; health checked on loopback |
| NFR-002 realtime < 1s | T-WEB-03 reviewer measured 249 ms; T-WEB-08 kept SSE path and removed no watcher code |
| NFR-003 no project protocol mutation | Dashboard no-op read path; `.hopper/` status unchanged across server start/stop |
| NFR-004 stack discipline | No new deps in T-WEB-08; no chart/state/DB/auth/banned UI libs |
| NFR-005 bundle < 200 KB gzipped | Clean build total `198.76 KB`; main `119.34 KB`; lazy TaskDetail `65.04 KB` |
| NFR-006 Windows runnable | Clean worktree `npm test` and `npm run dashboard:build` pass on Windows |
| NFR-007 no remote/auth/persistence | README explicitly lists unsupported remote access, auth/multi-user, server-side persistence |

## §7.1 task checklist

| Checklist | Evidence |
|---|---|
| Task acceptance evidence | 6/6 rows above, CDP key events, screenshots, and real dispatch evidence |
| `npm test` | Clean worktree at `3558b0e`: `# tests 376`, `# pass 361`, `# fail 0`, `# skipped 15`, duration `10491.4458ms` |
| `npm run dashboard:build` | Clean worktree: HTML `0.27 KB`, CSS `4.52 KB`, ToastHost `0.17 KB`, sonner chunk `9.42 KB`, TaskDetail `65.04 KB`, main `119.34 KB`; total `198.76 KB < 200 KB` |
| §3.2 grep verify | See hard-constraint self-check; violations `0` |
| New deps in §B.3 | none |
| Third-party review | Pending; ready for §8 review dispatch |

## Hard-constraint self-check (§3.2)

| Constraint | Evidence |
|---|---|
| No `.hopper/` writes in commits | `git show --name-only --format= 028c0a0 -- .hopper` and same for `3558b0e` => empty |
| No restricted existing dirs changed | `git show --name-only --format= 028c0a0 -- cli hosts commands .claude-plugin .codex-plugin` and same for `3558b0e` => empty |
| No `executeDispatch` import | `rg "executeDispatch" dashboard/server dashboard/client/src` => no hits |
| No `refetchInterval` regression | `rg "refetchInterval" dashboard/server dashboard/client/src` => no hits |
| Loopback only | Dashboard start evidence `127.0.0.1`; source listen path uses configured loopback host |
| No forbidden dashboard spawn flags | `rg "--background|--dispatch" dashboard/server dashboard/client/src` => no hits |
| No red-line packages | package grep for Next/Remix/Gatsby/Astro, state libs, chart libs, DB/auth, banned UI, animation libs => no hits |
| Radix whitelist respected | Top-level Radix deps are only `react-alert-dialog`, `react-dialog`, `react-tabs`, `react-tooltip` |
| No aggregate `radix-ui` package | package top-level scan found no `radix-ui` aggregate dependency |
| No chart libraries | package/source grep for `recharts`, `chart.js`, `d3`, `echarts`, `visx`, `victory`, `plotly` => no hits |
| No UI emoji | Changed UI files use text/glyphs already established by spec; no emoji introduced |
| Design tokens unchanged | T-WEB-08 did not edit design token variables in `globals.css` or `tailwind.config.ts` |
| File size cap | T-WEB-08 largest source delta: `App.tsx` +83/-4, under 200 lines; `README.md` 33 lines |
| Commit cap | T-WEB-07.5 uses 2 commits total; T-WEB-08 uses impl commit plus this handoff commit |
| No push / amend / `--no-verify` | Not performed |
| Commit prefixes | `a8f0495 [T-WEB-07.5]`, `3558b0e [T-WEB-07.5]`, `028c0a0 [T-WEB-08]` |
| Handoff scope | This output/log/screenshots only under `docs/sidequests/web-dashboard/handoffs/` |
| README scope | Updated existing `dashboard/README.md`; no CHANGELOG/ROADMAP/CONTRIBUTING created |

## Screenshots

- `docs/sidequests/web-dashboard/handoffs/T-WEB-08-queue.png`
- `docs/sidequests/web-dashboard/handoffs/T-WEB-08-task-drawer.png`
- `docs/sidequests/web-dashboard/handoffs/T-WEB-08-vendors.png`
- `docs/sidequests/web-dashboard/handoffs/T-WEB-08-cost.png`

## Decisions / deviations

- F-05-3 deferred: ANSI background/bold support remains deferred because Phase 6c dogfood evidence did not show a real vendor need; foreground colors still satisfy T-WEB-05.
- Browser plugin was unavailable (`browser-client is not trusted`), and gstack browse server did not start within 15s; used direct Chrome CDP fallback for screenshots and keyboard events.
- Current project worktree has pre-existing `.codex-plugin/plugin.json` and `.hopper/` modifications, so full `npm test` was run in a clean detached worktree at `3558b0e`.
- Real dispatch was isolated with a temp `HOPPER_DIR` to satisfy §7.2 without writing project `.hopper/`. Codex succeeded but answered the repo bootstrap prompt, which is recorded as an environment quirk rather than a dashboard failure.

## Commit

```text
a8f0495 [T-WEB-07.5] fold polish backlog
028c0a0 [T-WEB-08] implement final polish phase
3558b0e [T-WEB-07.5] wrap cost tooltips with provider
```

## Next recommendation

Ready for review. Recommended §8.1 reviewer pair for Codex executor:
- Primary: `opencode` with `deepseek-v4-flash`
- Secondary: `kimi`
