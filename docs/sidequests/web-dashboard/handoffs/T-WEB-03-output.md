---
task_id: T-WEB-03
sidequest: web-dashboard
spec_version: "2.1"
spec_anchor: "docs/sidequests/web-dashboard/SPEC.md::T-WEB-03"
executor: "codex-gpt-5.5"
role: sidequest-executor
status: done
start_time: "2026-05-22T01:00:00+08:00"
end_time: "2026-05-22T01:26:55+08:00"
commit_sha: "b0785da"
log: ./T-WEB-03-output.log
review_required: true
review_status: pending
review_files: []
hard_constraint_violations: 0
bundle_size_gzipped_kb: 109.68
---

# T-WEB-03 - Watcher + SSE Infrastructure

## Summary

Folded in T-WEB-02 review notes F1/F3, then implemented the SSE base layer: Radix-backed shadcn tooltip, defensive queue sort ranks, server SSE hub, chokidar watcher for Appendix A targets, client `useSSE`, and queue invalidation without the T-WEB-02 5s polling fallback.

## Files touched

**Server**
- `dashboard/server/events/sse.js` (64 lines) - SSE hub, heartbeat, multi-client publish, six route subscriptions
- `dashboard/server/events/watcher.js` (72 lines) - chokidar targets and file-event to SSE-channel mapping
- `dashboard/server/index.js` (120 lines) - `/events` router, watcher lifecycle, `close()` cleanup

**Client**
- `dashboard/client/src/lib/sse.ts` (38 lines) - EventSource hook with event-name mapping and reconnect state
- `dashboard/client/src/routes/QueueRoute.tsx` (14 lines) - invalidates queue on `/events/queue`, no polling
- `dashboard/client/src/components/ui/tooltip.tsx` (40 lines) - Radix tooltip primitive
- `dashboard/client/src/components/StatusPill.tsx` (29 lines) - long-form accessible tooltip text
- `dashboard/client/src/components/QueueTable.tsx` (151 lines) - sort fallbacks and removed `refetchInterval`
- `dashboard/client/src/lib/status.ts` (51 lines) - tooltip strings plus status/priority rank helpers

**Tests / deps / evidence**
- `tests/unit/dashboard-sse.test.js` (109 lines) - SSE hub, six routes, watcher mapping, lifecycle close
- `tests/unit/dashboard-queue.test.js` (125 lines) - StatusPill tooltip string assertion
- `package.json` / `package-lock.json` - added whitelisted `@radix-ui/react-tooltip`
- `docs/sidequests/web-dashboard/handoffs/T-WEB-03-screenshot.png` - manual SSE refresh proof

## Acceptance verification

| SPEC §6 T-WEB-03 acceptance | Evidence |
|---|---|
| 6 SSE channels subscribable + reconnect | `node --test tests/unit/dashboard-sse.test.js` covers `/events/queue`, `/events/task/:id`, `/events/log/:id`, `/events/cost`, `/events/agents`, `/events/liveness`; each response includes `event: connected` and `retry: 1000` |
| Watcher close has no handle leak | Unit `startServer close shuts down watcher and SSE hub` passes; manual dev run then `taskkill /PID 45980 /T /F` killed server tree and `Get-NetTCPConnection -LocalPort 7783,5173` showed no `Listen` sockets |
| chokidar event -> SSE payload mapping | Unit `watcher maps chokidar events to SSE channels` emits mock `all` events and asserts channels `queue`, `task/T-WEB-03`, `log/T-WEB-03`, `cost`, `agents` |
| Manual queue edit rerenders frontend <= 1s | Temp `HOPPER_DIR` queue update via `Set-Content` rerendered through SSE in `249ms`; screenshot: `docs/sidequests/web-dashboard/handoffs/T-WEB-03-screenshot.png` |

## §7.1 task checklist

| Checklist | Evidence |
|---|---|
| Task acceptance evidence | 4/4 rows above with command, unit test, runtime, and screenshot evidence |
| `npm test` | `# tests 354`, `# pass 339`, `# fail 0`, `# skipped 15`, duration `5196.4297ms` |
| `npm run dashboard:build` | HTML gzip `0.27 kB`, CSS gzip `3.31 kB`, JS gzip `106.10 kB`; total `109.68 kB < 200 kB` |
| §3.2 grep verify | See hard-constraint table below; violations `0` |
| New deps in §B.3 | Top-level new dep is only `@radix-ui/react-tooltip@^1.1.0`, allowed by SPEC §B.3.3 |
| Third-party review | Pending; ready for §8 review dispatch |

## Hard-constraint self-check (§3.2)

| Constraint | Evidence |
|---|---|
| No `.hopper/` writes in this task | `git show --name-only --format= b0785da` has no `.hopper/` paths; manual edit used temp `HOPPER_DIR`, not repo `.hopper` |
| No existing `cli/ hosts/ commands/ .claude-plugin/ .codex-plugin/` edits | Implementation commit touches only `dashboard/`, `tests/unit`, `package.json`, `package-lock.json` |
| No `executeDispatch` import | `rg -n "executeDispatch" dashboard package.json tests/unit cli/bin/hopper-dashboard cli/bin/hopper-dashboard.cmd` => `<empty>` |
| Loopback only | Server still rejects non-`127.0.0.1`; bind grep only hits reject tests for `0.0.0.0` |
| No stack red-line packages | package red-line scan over Next/Remix/Vue/state/chart/DB/auth/UI/animation packages => `NO_BANNED_PACKAGES` |
| Radix whitelist respected | `node -e ... startsWith("@radix-ui/")` => `@radix-ui/react-tooltip` only |
| No out-of-whitelist deps | no other top-level dependency additions |
| No Next/Remix/Gatsby/Astro | package red-line scan => none |
| No Vue/Svelte/Angular/Solid/Preact | package red-line scan => none |
| No Redux/Zustand/MobX/Jotai/Recoil | package red-line scan => none |
| No chart packages | package red-line scan => none |
| No SQLite/Prisma/Drizzle/auth packages | package red-line scan => none |
| No MUI/AntD/Chakra/Mantine/NextUI/DaisyUI | package red-line scan => none |
| No animation packages | package red-line scan => none |
| UI has no emoji | `rg -n "[\\p{Emoji_Presentation}\\p{Extended_Pictographic}]" dashboard/client/src` => `<empty>` |
| Design tokens unchanged | `globals.css` SHA256 `789046FC976A7FC387D77BD64AC6EADA56014AEBF3EC9E31CC621454C423462C`; `tailwind.config.ts` SHA256 `D0E34ECFADDF4F035C3AA551530A57C41DFB36530F5AC5295D24FA34E299704C` |
| File size cap | Largest source/test file touched is `QueueTable.tsx` at 151 lines; `package-lock.json` is generated and exempt by SPEC v2.0.1 |
| No push / amend / `--no-verify` | Not performed |
| Commit prefix | `b0785da [T-WEB-03] implement watcher sse` |

## New dependencies

**Whitelisted (§B.3.3)**:
- `@radix-ui/react-tooltip@^1.1.0` - official shadcn tooltip accessibility base, added for T-WEB-02 review F1 after SPEC v2.1 Radix whitelist.

**Out-of-whitelist**: none.

## Decisions / deviations

- `npx shadcn@latest add tooltip --dry-run -y -c dashboard/client` prompts because this repo keeps a root `package.json` rather than a nested `dashboard/client/package.json`; `npx shadcn@latest view tooltip` also currently emits the aggregate `radix-ui` package, which is not in SPEC §B.3.3. I used the approved `@radix-ui/react-tooltip` primitive and shadcn-compatible component shape instead.
- Manual `Set-Content` validation used a temp `HOPPER_DIR` to prove the same watcher/SSE path without writing repo `.hopper/`.

## Open questions

none.

## Commit

```text
b0785da [T-WEB-03] implement watcher sse
```

## Next recommendation

Ready for review. Recommended §8.1 reviewer pair for Codex executor:
- Primary: `opencode` with `deepseek-v4-flash`
- Secondary: `kimi`

---

## Reviews
