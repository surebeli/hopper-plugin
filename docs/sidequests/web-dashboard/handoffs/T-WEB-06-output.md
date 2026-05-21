---
task_id: T-WEB-06
sidequest: web-dashboard
spec_version: "2.1.2"
spec_anchor: "docs/sidequests/web-dashboard/SPEC.md::T-WEB-06"
executor: "codex-gpt-5.5"
role: sidequest-executor
status: done
start_time: "2026-05-22T03:07:00+08:00"
end_time: "2026-05-22T03:48:03+08:00"
commit_sha: "d42fc1c"
log: ./T-WEB-06-output.log
review_required: true
review_status: pending
review_files: []
hard_constraint_violations: 0
bundle_size_gzipped_kb: 186.85
---

# T-WEB-06 - Vendor Inventory

## Summary

Implemented vendor inventory: `/api/vendors` now reads the cache diagnostics and adapter list, `/api/action/probe` spawns only the whitelisted `hopper-dispatch --probe <vendor>` path, and `/vendors` renders 5 shadcn `Card` vendor panels with stale state, cached models, Radix `AlertDialog` confirmation, and disabled probe loading.

## Files touched

**Client**
- `dashboard/client/src/components/ui/alert-dialog.tsx` (107 lines) - shadcn/Radix AlertDialog primitive, outline confirm action
- `dashboard/client/src/components/VendorCard.tsx` (88 lines) - vendor card, stale badge, cached model preview, probe confirm flow
- `dashboard/client/src/routes/VendorsRoute.tsx` (36 lines) - TanStack Query inventory fetch + probe mutation
- `dashboard/client/src/lib/api.ts` (33 lines) - vendor fetch/probe API helpers
- `dashboard/client/src/lib/types.ts` (49 lines) - vendor/probe response types

**Server**
- `dashboard/server/routes/vendors.js` (57 lines) - `GET /api/vendors` via cache diagnostics + adapter registry
- `dashboard/server/routes/actions.js` (61 lines) - `POST /api/action/probe` with per-vendor active guard
- `dashboard/server/lib/spawn-cli.js` (19 lines) - vendor allowlist + `hopper-dispatch --probe` spawn helper

**Tests / deps / evidence**
- `tests/unit/dashboard-vendors.test.js` (99 lines) - inventory merge, spawn allowlist, duplicate probe guard
- `package.json` / `package-lock.json` - added whitelisted `@radix-ui/react-alert-dialog`
- `docs/sidequests/web-dashboard/handoffs/T-WEB-06-screenshot.png` - vendor grid + probe flow proof

## Acceptance verification

| SPEC §6 T-WEB-06 acceptance | Evidence |
|---|---|
| 5 vendors display: codex / kimi / opencode / copilot / agy | CDP validation on `http://127.0.0.1:7809/vendors`: `cardCount=5`; unit `vendor inventory merges adapter list...` asserts exact ordered names |
| `[STALE]` marker matches CLI cache output | Temp `HOPPER_CACHE_DIR` fixture: `hopper-dispatch --models codex` printed `codex (full, 50.8d ago) [STALE]`; dashboard inventory returned `{"name":"codex","stale":true,"staleness":"50.8d ago","models":["gpt-test"]}` |
| Probe flow: click -> dialog -> confirm -> loading -> updated cache view | CDP proof: `requestCount=1`, loading button observed, post-probe `staleCount 5 -> 4`, `hasFresh=true`, `hasModel=true`; screenshot `T-WEB-06-screenshot.png` |
| Probe duplicate click rejected while running | Unit `probe action returns 409 while same vendor is already running`; CDP observed clicked card button disabled with `[··· ]` |

## §7.1 task checklist

| Checklist | Evidence |
|---|---|
| Task acceptance evidence | 4/4 rows above with unit, CLI/cache compare, CDP, and screenshot evidence |
| `npm test` | Clean detached LF worktree at `d42fc1c`: `# tests 364`, `# pass 349`, `# fail 0`, `# skipped 15`, duration `11936.1329ms` |
| `npm run dashboard:build` | Clean detached LF worktree: HTML gzip `0.27 kB`, CSS gzip `4.60 kB`, main JS gzip `116.86 kB`, lazy `TaskDetailRoute` gzip `65.12 kB`; total `186.85 kB < 200 kB`; main `< 120 kB` |
| §3.2 grep verify | See hard-constraint table below; violations `0` |
| New deps in §B.3 | `@radix-ui/react-alert-dialog@^1.1.0` only; allowed by SPEC §B.3.3 |
| Third-party review | Pending; ready for §8 review dispatch |

## Hard-constraint self-check (§3.2)

| Constraint | Evidence |
|---|---|
| No `.hopper/` writes in T-WEB-06 commit | `git show --name-only --format= d42fc1c -- .hopper` => empty |
| No existing `cli/ hosts/ commands/ .claude-plugin/ .codex-plugin/` edits | `git show --name-only --format= d42fc1c -- cli hosts commands .claude-plugin .codex-plugin` => empty |
| Only allowed spawn command for write action | `spawnProbe('codex')` captured `process.execPath` + `cli/bin/hopper-dispatch --probe codex`; no `--background` / `--dispatch` |
| Vendor allowlist defends `POST /api/action/probe` | Unit asserts `spawnProbe('codex; rm -rf /')` throws `vendor not allowed` |
| No `executeDispatch` import / `refetchInterval` regression | `rg "executeDispatch|refetchInterval" dashboard/server dashboard/client/src` => no hits |
| Loopback only | `dashboard/server/index.js` remains `127.0.0.1`; refined scan found no non-loopback dashboard source hits |
| No stack red-line packages | package scan `bannedHits=[]` |
| Radix whitelist respected | top-level Radix deps: `react-alert-dialog`, `react-dialog`, `react-tabs`, `react-tooltip`; `badRadix=[]`; no aggregate `radix-ui` |
| No Next/Remix/Gatsby/Astro or alternate UI framework | package scan `bannedHits=[]` |
| No Redux/Zustand/MobX/Jotai/Recoil | package scan `bannedHits=[]` |
| No chart libs | package scan `bannedHits=[]` |
| No DB/auth libs | package scan `bannedHits=[]` |
| No MUI/AntD/Chakra/Mantine/NextUI/DaisyUI | package scan `bannedHits=[]` |
| No animation libs | package scan `bannedHits=[]` |
| UI has no emoji | changed UI files scanned with `\p{Extended_Pictographic}` => `no emoji pictographs in changed UI files` |
| Design tokens unchanged | `globals.css` SHA256 `789046FC976A7FC387D77BD64AC6EADA56014AEBF3EC9E31CC621454C423462C`; `tailwind.config.ts` SHA256 `D0E34ECFADDF4F035C3AA551530A57C41DFB36530F5AC5295D24FA34E299704C` |
| File size cap | Largest touched source/test file is `alert-dialog.tsx` at 107 lines; `package-lock.json` exempt by SPEC v2.0.1 |
| Commit cap | T-WEB-06 uses impl `d42fc1c` plus this doc-only handoff commit; within SPEC §3.3 v2.1.1 |
| No push / amend / `--no-verify` | Not performed |
| Commit prefix | `d42fc1c [T-WEB-06] implement vendor inventory` |

## New dependencies

**Whitelisted (§B.3.3)**:
- `@radix-ui/react-alert-dialog@^1.1.0` - shadcn AlertDialog accessibility base.

**Out-of-whitelist**: none.

## Decisions / deviations

- `npx shadcn@latest view alert-dialog` listed aggregate `radix-ui`, which SPEC forbids as a top-level package. I installed only `@radix-ui/react-alert-dialog@^1.1.0` and used the shadcn/Radix primitive shape locally.
- Full `npm test` evidence was collected in a detached temp worktree at `d42fc1c` with `core.autocrlf=false`; a default Windows temp checkout converted `commands/dispatch.md` to CRLF and tripped existing frontmatter regex tests unrelated to T-WEB-06.
- SPEC says compare stale markers with `hopper-dispatch --status`, but current `--status` is queue-only; the vendor cache stale marker is exposed by `--models` / `--capabilities`, so the screenshot evidence compares against `--models codex`.
- CDP/browser proof used an injected fake probe process so `POST /api/action/probe` exercised the server/client flow without mutating the real vendor cache.

## Open questions

none.

## Commit

```text
d42fc1c [T-WEB-06] implement vendor inventory
```

## Next recommendation

Ready for review. Recommended §8.1 reviewer pair for Codex executor:
- Primary: `opencode` with `deepseek-v4-flash`
- Secondary: `kimi`
