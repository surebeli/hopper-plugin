---
task_id: T-WEB-01
sidequest: web-dashboard
spec_version: "2.0"
spec_anchor: "docs/sidequests/web-dashboard/SPEC.md::T-WEB-01"
executor: "<your model id, e.g. claude-opus-4-7 | codex-gpt-5.5 | kimi-thinking>"
role: sidequest-executor
status: in-progress             # in-progress | done | failed | blocked
start_time: "<ISO-8601, e.g. 2026-05-21T15:30:00+08:00>"
end_time: null                  # fill on done
commit_sha: null                # short sha, fill after Step 9
log: ./T-WEB-01-output.log
review_required: true
review_status: pending          # pending | accepted | accept-with-note | rework | revert
review_files: []                # filled by §8 reviewers
hard_constraint_violations: 0   # MUST be 0 to ship; reviewer also recomputes
bundle_size_gzipped_kb: null    # fill after npm run dashboard:build
---

# T-WEB-01 — Scaffold (Vite + React + Tailwind + shadcn + server stub)

> Template skeleton. Replace every `<bracketed>` placeholder. Delete inline
> commentary lines marked with `<!-- ... -->` before commit.

## Summary

<!-- One paragraph: what you scaffolded and the specific choices that
     non-obvious. E.g. "kept server in JS (not TS) to match cli/ convention",
     or "used npx shadcn init non-interactively via flags X/Y". Stay close to
     the spec; don't editorialize. -->

<one paragraph>

## Files touched

<!-- Only files you actually created/modified this task. Sidequest scope only
     — should NOT include anything under cli/, hosts/, commands/, .hopper/,
     .claude-plugin/, .codex-plugin/ (§3.3) EXCEPT the explicitly allowed:
     - NEW: cli/bin/hopper-dashboard + .cmd
     - MODIFIED: package.json (additive only — deps/devDeps/scripts/bin) -->

**New (server)**
- `dashboard/server/index.js` (~N lines) — express(7777), serves dist, dev proxy
- `dashboard/server/routes/health.js` (~N lines) — `/api/health` stub

**New (client scaffold)**
- `dashboard/client/index.html` (~N lines) — Vite root html
- `dashboard/client/vite.config.ts` (~N lines) — React plugin + /api proxy
- `dashboard/client/tsconfig.json` (~N lines) — extends ../../tsconfig.base.json
- `dashboard/client/tailwind.config.ts` (~N lines) — §4.2.2 verbatim
- `dashboard/client/postcss.config.js` (~N lines) — tailwind + autoprefixer
- `dashboard/client/components.json` (~N lines) — shadcn config
- `dashboard/client/src/main.tsx` (~N lines) — ReactDOM + QueryClient + Router
- `dashboard/client/src/App.tsx` (~N lines) — hello page + clock
- `dashboard/client/src/styles/globals.css` (~N lines) — §4.2.1 verbatim
- `dashboard/client/src/lib/utils.ts` (~N lines) — `cn()` shadcn util
- `dashboard/client/src/components/ui/button.tsx` (~N lines) — shadcn generated
- `dashboard/client/src/components/ui/card.tsx` (~N lines) — shadcn generated
- `dashboard/client/src/components/ui/badge.tsx` (~N lines) — shadcn generated

**New (root + bin)**
- `tsconfig.base.json` (~N lines) — TS shared config
- `cli/bin/hopper-dashboard` (~N lines) — POSIX bin entry
- `cli/bin/hopper-dashboard.cmd` (~N lines) — Windows bin entry
- `tests/unit/dashboard-server.test.js` (~N lines) — server stub + bin smoke

**Modified (additive only)**
- `package.json` — added §B.3 deps/devDeps; registered `hopper-dashboard` bin;
  added scripts `dashboard:dev`, `dashboard:build`, `dashboard:start`

## Acceptance verification (X/Y)

<!-- Mirror §6 T-WEB-01 acceptance bullets verbatim. Each gets ✓ / ✗ / pending
     + evidence (command output / file path / screenshot path). -->

1. ✓ `npm install` 干净（无 peer-dep warning，无 deprecated）
   - Evidence:
     ```
     $ npm install
     added 287 packages, audited 288 packages in 12s
     54 packages are looking for funding
     found 0 vulnerabilities
     ```
2. ✓ `npm run dashboard:dev` 起 Vite 5173 + server 7777，HMR < 200ms
   - Evidence (parallel terminals + HMR timing):
     ```
     [vite] dev server running at http://localhost:5173 (ready in 487ms)
     [server] hopper-dashboard listening on http://127.0.0.1:7777
     [vite] hmr update /src/App.tsx (143ms)
     ```
3. ✓ `npm run dashboard:build` 产出 dist，gzipped < 200KB
   - Evidence:
     ```
     $ npm run dashboard:build
     dist/assets/index-<hash>.js   178.3 kB │ gzip: 58.2 kB
     dist/assets/index-<hash>.css   12.1 kB │ gzip:  3.4 kB
     # Total gzipped: 61.6 KB ✓
     ```
4. ✓ `node cli/bin/hopper-dashboard` prod 模式起 7777，浏览器看到 hello + 走表
   - Evidence: `docs/sidequests/web-dashboard/handoffs/T-WEB-01-screenshot.png`
     (clock 从 15:30:00 → 15:30:05 每秒前进)
5. ✓ `--port 9090` flag 可改端口
   - Evidence:
     ```
     $ node cli/bin/hopper-dashboard --port 9090
     hopper-dashboard listening on http://127.0.0.1:9090
     ```
6. ✓ 不监听非 loopback
   - Evidence (Windows):
     ```
     PS> Get-NetTCPConnection -LocalPort 7777 | Select LocalAddress,State
     LocalAddress  State
     ------------  -----
     127.0.0.1     Listen
     ```
7. ✓ `npm test` 全绿
   - Evidence:
     ```
     # tests 161
     # pass  161
     # fail  0
     ```

## Hard-constraint self-check (§3.2)

<!-- Run these greps BEFORE marking done. Reviewer reruns. Mismatch = auto
     rework. Paste actual command output, not just "passes". -->

| 约束 | 检查命令 | 结果 |
|---|---|---|
| 不写 `.hopper/` | `git diff --name-only HEAD~1 \| grep "^\.hopper/"` | `<empty>` ✓ |
| 不 import `executeDispatch` | `grep -rn "executeDispatch" dashboard/` | `<empty>` ✓ |
| 仅 bind loopback | `grep -rnE "0\.0\.0\.0\|listen\(.*'::'\)\|'\\*'" dashboard/server/` | `<empty>` ✓ |
| 协议红线：不动 cli/ hosts/ commands/ 已有文件 | `git diff --name-only HEAD~1 \| grep -E "^(cli\|hosts\|commands)/" \| grep -v "^cli/bin/hopper-dashboard"` | `<empty>` ✓ |
| 仅 package.json 字段追加 | `git diff HEAD~1 package.json \| grep "^-" \| grep -v "^---"` | `<no deletions or only formatting>` ✓ |
| 栈红线：无 SSR 框架 | `grep -E "\"(next\|remix\|gatsby\|astro)\":" package.json` | `<empty>` ✓ |
| 栈红线：无其他 UI 框架 | `grep -E "\"(vue\|svelte\|@angular\|preact\|solid-js)\":" package.json` | `<empty>` ✓ |
| 栈红线：无外部状态库 | `grep -E "\"(redux\|@reduxjs/toolkit\|zustand\|mobx\|jotai\|recoil)\":" package.json` | `<empty>` ✓ |
| 栈红线：无 chart 库 | `grep -E "\"(recharts\|chart\.js\|d3\|echarts\|visx\|victory\|plotly)\":" package.json` | `<empty>` ✓ |
| 栈红线：无 DB / auth | `grep -E "\"(sqlite\|better-sqlite3\|prisma\|drizzle-orm\|passport\|jsonwebtoken\|express-session\|next-auth)\":" package.json` | `<empty>` ✓ |
| 栈红线：无其他 UI 库 | `grep -E "\"(@mui/\|antd\|@chakra-ui\|@mantine\|@nextui-org\|daisyui)" package.json` | `<empty>` ✓ |
| 栈红线：无动画库 | `grep -E "\"(framer-motion\|@react-spring\|gsap\|lottie-react)\":" package.json` | `<empty>` ✓ |
| UI 无 emoji | `grep -rnP "[\x{1F300}-\x{1FAFF}\x{1F000}-\x{1F2FF}\x{2600}-\x{27BF}]" dashboard/client/src/` | `<empty>` ✓ |
| Design token byte-match | `diff <(extract --tokens dashboard/client/src/styles/globals.css) <(spec §4.2.1)` | `<identical>` ✓ |
| 不 push | `git log origin/main..HEAD --oneline` | 1 local commit, not pushed ✓ |
| Commit prefix `[T-WEB-01]` | `git log -1 --format=%s HEAD` | `[T-WEB-01] scaffold dashboard ...` ✓ |
| 单 commit | `git rev-list HEAD ^origin/main --count` | `1` ✓ |
| 文件改动 ≤ 200 行/文件 | `git diff --stat HEAD~1 \| awk '$3 > 200'` | `<empty>` ✓ |

## New dependencies (with justification)

<!-- Every new dep must be in §B.3 whitelist; ANY out-of-whitelist needs
     justification here. Even if all are whitelisted, list them — reviewer
     verifies count matches. -->

**Whitelisted（§B.3）**:

后端：
- `chokidar@^3.6.0` — 文件 watch（§B.3.1）
- `express@^4.19.0` — http 路由（§B.3.1）

前端运行时（§B.3.2，13 包）：
- `react@^18.3.0`, `react-dom@^18.3.0`, `react-router-dom@^6.26.0`
- `@tanstack/react-query@^5.51.0`, `@tanstack/react-table@^8.20.0`
- `lucide-react@^0.400.0`, `clsx@^2.1.0`, `tailwind-merge@^2.4.0`
- `class-variance-authority@^0.7.0`, `markdown-it@^14.1.0`
- `highlight.js@^11.10.0`, `sonner@^1.5.0`

构建/dev（§B.3.3，13 包）：
- `vite@^5.4.0`, `@vitejs/plugin-react@^4.3.0`
- `typescript@^5.5.0`, `@types/react`, `@types/react-dom`, `@types/node`, `@types/express`
- `tailwindcss@^3.4.0`, `postcss@^8.4.0`, `autoprefixer@^10.4.0`
- `tailwindcss-animate@^1.0.7`, `concurrently@^8.2.0`

**Out-of-whitelist**: <list any; write "无" if none>

## Decisions / deviations from spec

<!-- Anything you chose differently from spec, with reason. Subjective taste
     calls within §4.2 ranges don't need to be listed; protocol/design-token
     deviations do. If fully aligned: write "无偏离". -->

- <decision 1>: <reason; reviewer 需要 weigh in 吗?>
- <deviation 1>: <spec 写 X，实际做 Y，因为 Z>

或: **无偏离。**

## Open questions

<!-- For sidequest "Leader" (= user). If none, write "none". -->

- <question 1>
- <question 2>

或: **none.**

## Commit

```
<short-sha> [T-WEB-01] scaffold dashboard: vite+react+ts+tailwind+shadcn + server stub + bin
```

## Next recommendation

Ready for review. Recommend dispatching the §8.1 default reviewer pair:
- Primary:    `hopper-dispatch --dispatch T-WEB-01-REVIEW-codex --background --vendor codex --reasoning xhigh`
- Secondary:  `hopper-dispatch --dispatch T-WEB-01-REVIEW-kimi  --background --vendor kimi`

After ≥1 of 2 returns `accept` / `accept-with-note`, proceed to T-WEB-02.

---

<!-- =============================================================== -->
<!-- BELOW THIS LINE: reviewers append. Executor does NOT write here. -->
<!-- =============================================================== -->

## Reviews

### Review 1 — `<vendor>` (`<model>`)

- Verdict:           <accept | accept-with-note | rework | revert>
- Date:              <ISO>
- Output artifact:   `./T-WEB-01-REVIEW-<vendor>-output.md`
- Hard-constraint violations found: <N>
- Findings count:    P0=<n> P1=<n> P2=<n> P3=<n>
- Summary:
  - <bullet>
- Follow-up actions: <list or "none">

### Review 2 — `<vendor>` (`<model>`)

<same schema>

### Verdict aggregation

- Combined verdict: <accept | accept-with-note | rework | revert>
  (per §8.4: ≥1/2 reviewers must reach accept/accept-with-note)
- Hard-constraint violations total: <N>  (must be 0 to ship)
- Status transition: review_status `pending` → `<final>`
