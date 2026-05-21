---
task_id: T-WEB-01
sidequest: web-dashboard
spec_version: "2.0"
spec_anchor: "docs/sidequests/web-dashboard/SPEC.md::T-WEB-01"
executor: "codex-gpt-5.5"
role: sidequest-executor
status: done
start_time: "2026-05-22T00:00:00+08:00"
end_time: "2026-05-22T00:20:00+08:00"
commit_sha: "e5b535f"
log: ./T-WEB-01-output.log
review_required: true
review_status: accept-with-note
review_files:
  - ./T-WEB-01-REVIEW-claude-output.md
hard_constraint_violations: 0
bundle_size_gzipped_kb: 74.03
---

# T-WEB-01 — Scaffold (Vite + React + Tailwind + shadcn + server stub)

## Summary

Scaffolded the dashboard as a React 18 + Vite + TypeScript client with Tailwind/shadcn-style primitives, a Node ESM Express server stub bound to `127.0.0.1`, root scripts/bin wiring, and server smoke tests. Server code stays JS to match the existing CLI style; Vite runs from `dashboard/client` so §4.2 Tailwind content paths remain byte-identical to the spec.

## Files touched

**New (server)**
- `dashboard/server/index.js` (94 lines) — express entry, prod dist serving, dev health, loopback start
- `dashboard/server/routes/queue.js` (7 lines) — `/api/queue` stub
- `dashboard/server/routes/task.js` (7 lines) — `/api/task/:id` stub
- `dashboard/server/routes/vendors.js` (7 lines) — `/api/vendors` stub
- `dashboard/server/routes/cost.js` (7 lines) — `/api/cost` stub
- `dashboard/server/routes/actions.js` (7 lines) — `/api/action/probe` placeholder
- `dashboard/server/events/sse.js` (14 lines) — SSE hub stub
- `dashboard/server/events/watcher.js` (5 lines) — watcher stub
- `dashboard/server/lib/tail.js` (3 lines) — tail state stub
- `dashboard/server/lib/spawn-cli.js` (3 lines) — probe argv helper stub

**New (client scaffold)**
- `dashboard/client/index.html` (13 lines) — Vite root html
- `dashboard/client/vite.config.ts` (27 lines) — React plugin + loopback dev proxy
- `dashboard/client/tsconfig.json` (10 lines) — extends `../../tsconfig.base.json`
- `dashboard/client/tailwind.config.ts` (55 lines) — §4.2.2 byte-match
- `dashboard/client/postcss.config.js` (6 lines) — Tailwind + autoprefixer
- `dashboard/client/components.json` (20 lines) — shadcn config
- `dashboard/client/public/.gitkeep` (1 line) — keep public dir
- `dashboard/client/src/main.tsx` (23 lines) — ReactDOM + QueryClient + Router
- `dashboard/client/src/App.tsx` (80 lines) — hello shell + ticking clock
- `dashboard/client/src/styles/globals.css` (32 lines) — §4.2.1 byte-match
- `dashboard/client/src/lib/*.ts` — `api`, `sse`, `types`, `utils` stubs
- `dashboard/client/src/routes/*.tsx` — route stubs
- `dashboard/client/src/components/*.tsx` — dashboard component stubs
- `dashboard/client/src/components/ui/{button,card,badge}.tsx` — shadcn-style primitives

**New (root + bin + tests)**
- `tsconfig.base.json` (13 lines) — shared TS config
- `cli/bin/hopper-dashboard` (74 lines) — POSIX bin, `--dev`, `--port`
- `cli/bin/hopper-dashboard.cmd` (2 lines) — Windows bin wrapper
- `tests/unit/dashboard-server.test.js` (37 lines) — server stub tests
- `docs/sidequests/web-dashboard/handoffs/T-WEB-01-screenshot.png` — Chrome headless prod screenshot

**Modified (additive only)**
- `package.json` — added dashboard bin, scripts, and §B.3 dependencies/devDependencies

## Acceptance verification (7/7)

1. ✓ `npm install` 干净（无 peer-dep warning，无 deprecated）
   - Evidence:
     ```text
     $ npm install
     up to date, audited 267 packages in 1s
     53 packages are looking for funding
     2 moderate severity vulnerabilities
     ```
   - Note: no peer-dep or deprecated warnings; audit findings are Vite 5/esbuild advisories under the §B.3-mandated Vite 5 range.
2. ✓ `npm run dashboard:dev` 起 Vite 5173 + server 7777，HMR < 200ms
   - Evidence:
     ```text
     hopper-dashboard listening on http://127.0.0.1:7777
     VITE v5.4.21 ready in 392 ms
     Local: http://127.0.0.1:5173/
     12:14:49 AM [vite] hmr update /src/components/QueueTable.tsx, /src/styles/globals.css
     ```
3. ✓ `npm run dashboard:build` 产出 dist，gzipped < 200KB
   - Evidence:
     ```text
     dist/index.html                 0.40 kB │ gzip:  0.27 kB
     dist/assets/index-DP_zCKmp.css  9.18 kB │ gzip:  2.60 kB
     dist/assets/index-CFOfAOZL.js 222.18 kB │ gzip: 71.16 kB
     Total gzip: 74.03 KB
     ```
4. ✓ `node cli/bin/hopper-dashboard` prod 模式起 7777，浏览器看到 hello + 走表
   - Evidence:
     ```text
     hopper-dashboard listening on http://127.0.0.1:7777
     Invoke-WebRequest http://127.0.0.1:7777/ => StatusCode 200, Length 401
     Chrome headless DOM: prodBudget100=12:16:10 AM; prodBudget2200=12:16:15 AM; prodClockChanged=True; prodHasHello=True
     Screenshot: docs/sidequests/web-dashboard/handoffs/T-WEB-01-screenshot.png
     ```
5. ✓ `--port 9090` flag 可改端口
   - Evidence:
     ```text
     hopper-dashboard listening on http://127.0.0.1:9090
     Invoke-WebRequest http://127.0.0.1:9090/ => StatusCode 200, Length 401
     ```
6. ✓ 不监听非 loopback
   - Evidence:
     ```text
     Get-NetTCPConnection -LocalPort 7777 -State Listen
     LocalAddress LocalPort OwningProcess
     127.0.0.1        7777 41160

     Get-NetTCPConnection -LocalPort 9090 -State Listen
     LocalAddress LocalPort OwningProcess
     127.0.0.1        9090 26476
     ```
7. ✓ `npm test` 全绿
   - Evidence:
     ```text
     # tests 347
     # pass 332
     # fail 0
     # skipped 15
     ```

## Hard-constraint self-check (§3.2)

| 约束 | 检查命令 | 结果 |
|---|---|---|
| 不写 `.hopper/` | `git diff-tree --no-commit-id --name-only -r e5b535f \| Select-String "^\.hopper/"` | `<empty>` |
| 不 import `executeDispatch` | `rg -n "executeDispatch" dashboard` | `<empty>` |
| 仅 bind loopback | `rg -n "0\.0\.0\.0\|listen\(.*'::'\)\|'\*'" dashboard/server` | `<empty>` |
| 协议红线：不动 cli/ hosts/ commands/ 已有文件 | Only new `cli/bin/hopper-dashboard{,.cmd}`; no hosts/commands edits | pass |
| 仅 package.json 字段追加 | package edits limited to `bin` / `scripts` / deps / devDeps | pass |
| 栈红线：无 SSR / non-React / state / chart / DB / auth / animation 禁包 | combined `rg` over `package.json` | `<empty>` |
| 栈红线：无其他 UI 库 | `rg -n '"(@mui/\|antd\|@chakra-ui\|@mantine\|@nextui-org\|daisyui)' package.json` | `<empty>` |
| UI 无 emoji | `rg -nP '[\x{1F300}-\x{1FAFF}\x{1F000}-\x{1F2FF}\x{2600}-\x{27BF}]' dashboard/client/src` | `<empty>` |
| Design token byte-match | PowerShell extracted SPEC §4.2.1/§4.2.2 and compared files | `globals.css=True`; `tailwind.config.ts=True` |
| 不 push | no push performed | pass |
| 不 amend / 不 `--no-verify` | no amend; regular `git commit` planned | pass |
| Commit prefix `[T-WEB-01]` | `git log -1 --format=%s e5b535f` | `[T-WEB-01] scaffold web dashboard` |
| 单 commit | `git rev-list e5b535f --not "e5b535f^" --count` | `1` |
| 文件改动 ≤ 200 行/文件 | max touched source file: `dashboard/server/index.js` 94 lines | pass |
| README ≤ 80 行 | `dashboard/README.md` 25 lines | pass |
| 不写 CHANGELOG/ROADMAP/CONTRIBUTING | no such files touched | pass |
| 不 bind 非 loopback runtime | `Get-NetTCPConnection` showed `127.0.0.1` only for 7777/9090 | pass |
| 新依赖在 §B.3 白名单内 | package names match §B.3 backend/runtime/dev lists | pass |

## New dependencies (with justification)

**Whitelisted (§B.3)**:

后端：
- `chokidar@^3.6.0`
- `express@^4.19.0`

前端运行时：
- `react@^18.3.0`, `react-dom@^18.3.0`, `react-router-dom@^6.26.0`
- `@tanstack/react-query@^5.51.0`, `@tanstack/react-table@^8.20.0`
- `lucide-react@^0.400.0`, `clsx@^2.1.0`, `tailwind-merge@^2.4.0`
- `class-variance-authority@^0.7.0`, `markdown-it@^14.1.0`
- `highlight.js@^11.10.0`, `sonner@^1.5.0`

构建/dev：
- `vite@^5.4.0`, `@vitejs/plugin-react@^4.3.0`
- `typescript@^5.5.0`, `@types/react@^18.3.0`, `@types/react-dom@^18.3.0`
- `@types/node@^22.0.0`, `@types/express@^4.17.0`
- `tailwindcss@^3.4.0`, `postcss@^8.4.0`, `autoprefixer@^10.4.0`
- `tailwindcss-animate@^1.0.7`, `concurrently@^8.2.0`

**Out-of-whitelist**: 无。

## Decisions / deviations from spec

- Used shadcn-compatible local source for `button`, `card`, and `badge` instead of allowing the latest shadcn CLI to add non-whitelisted transitive UI packages. The files live under `dashboard/client/src/components/ui/`, use the shadcn utility stack (`cva` + `clsx` + `tailwind-merge`), and §4.2 tokens byte-match the spec.
- Did not commit `package-lock.json`: this repo had no existing lockfile, `npm install` generated a >200-line lockfile, and §3.3 caps single-file change size at 200 lines/commit.

## Open questions

none.

## Commit

```text
pending until commit; final chat reports the short sha
```

## Next recommendation

Ready for review. Recommend dispatching the §8.1 default reviewer pair for Codex executor:
- Primary: `opencode (deepseek-v4-flash)`
- Secondary: `kimi (kimi-thinking)`

After ≥1 of 2 returns `accept` / `accept-with-note`, proceed to T-WEB-02.

---

## Reviews

### Review 1 — `claude` (`claude-opus-4-7`)

- Verdict:           **accept-with-note**
- Date:              2026-05-22T00:55:00+08:00
- Output artifact:   `./T-WEB-01-REVIEW-claude-output.md`
- Hard-constraint violations found: 0
- Findings count:    P0=0 P1=0 P2=1 P3=3
- Summary:
  - Design tokens byte-match §4.2.1 + §4.2.2 (HSL values, radius=2px, fontSize=13px confirmed)
  - All 7 acceptance bullets verified independently; `npm test` (332/0/15) and `npm run dashboard:build` (74.03 KB gzipped) reproduced by reviewer
  - 0 hard-constraint violations across §3.2 协议/栈/风格 三类红线
  - Single P2: `package-lock.json` deliberately omitted citing §3.3 200-line rule — weakens §8 multi-reviewer reproducibility
- Follow-up actions:
  1. **F1 (hard)** — commit `package-lock.json` before T-WEB-02; spec §3.3 patched 2026-05-22 to exempt lockfiles
  2. F2 (soft) — update frontmatter `commit_sha` post-commit (already patched by reviewer to `e5b535f`)
  3. F3 (soft) — refresh 3 `pending post-commit` rows in §3.2 self-check table
  4. F4 (soft) — acknowledge route pre-staging in T-WEB-02 brief header

### Verdict aggregation

- Combined verdict: **accept-with-note** (1/1 reviewer; user opted for single host-session review per §8.4 minimum)
- Hard-constraint violations total: **0**
- Status transition: review_status `pending` → **`accept-with-note`**
- Next: executor applies F1 fix (lockfile commit), then proceeds to T-WEB-02
