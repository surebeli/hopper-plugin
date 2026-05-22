# Sidequest: Hopper Web Dashboard

> **Anchor**: `docs/sidequests/web-dashboard/SPEC.md::root`
> **Status**: spec — pending pickup
> **Owner**: side-project agent (not in main `.hopper/queue.md`)
> **Spec authority**: this file (single source of truth for the sidequest)
> **Parent project**: `hopper-plugin` v0.6.0-phase-6c
> **Created**: 2026-05-21
> **Current spec version**: **v2.0** (stack reversal — React/Vite/shadcn). See §修订记录.

---

## 0. 背景

`hopper-plugin` 当前所有状态都已是 file-as-source-of-truth：`.hopper/queue.md` 是任务表；`.hopper/handoffs/<task-id>-output.md` 带 YAML frontmatter（`status / pid / start_time / exit_code / adapter_status`）；同名 `.log` 是 vendor 原始 stdout 流；`.hopper/COST-LOG.md` 是成本账本。

也就是说 — Web 层基本只做"读 + watch + 渲染"。这是 sidequest 而非主线，blast radius 必须接近零。

---

## 1. 愿景与范围

**一句话**：本地启动一个轻量 web 看板，把 hopper 调度过程（任务状态、vendor 属性、思考流、I/O）实时可视化。

**风格定位**：`lazygit` × `htop` × Linear/Vercel 极简语言 — read-mostly，关键写操作（dispatch / cancel）通过显式确认。

**非目标**：
- 不替代 CLI（CLI 仍是 ground truth）
- 不引入 server-side persistence（文件就是 DB）
- 不做多用户 / auth / RBAC
- 不做远程访问（默认且仅绑 `127.0.0.1`）

---

## 2. 需求清单

### 2.1 功能需求（FR）

| ID | 优先级 | 需求 | 验收要点 |
|---|---|---|---|
| **FR-001** | P0 | Queue View：渲染 `.hopper/queue.md` 全表，按 status / priority 分组排序 | 表格 5 列以上，可按 status 折叠 |
| **FR-002** | P0 | Task Detail：单 task 抽屉式展开，含 frontmatter、body、log tail | 点击行 / URL `/task/:id` 可达 |
| **FR-003** | P0 | Live Log Stream：in-progress task 实时 tail vendor stdout（增量推送） | 滚动到底部自动 follow；手动滚回顶部不抢焦 |
| **FR-004** | P0 | Queue 实时刷新：`queue.md` 改动 ≤ 1s 内反映到前端 | 文件 touch 后秒内行高亮变化 |
| **FR-005** | P1 | Vendor Inventory：5 个 adapter 的安装状态 + cached models + staleness 标记 | 标记 `[STALE]` 与 `--probe` CLI 输出一致 |
| **FR-006** | P1 | Cost Log View：`COST-LOG.md` 渲染 + 按 vendor 聚合总览 | 至少展示总 tokens / 总 $（估算） |
| **FR-007** | P1 | Liveness check：5s 心跳，对 in-progress PID 跑 `process.kill(pid, 0)` | 死进程标记为 `orphan` |
| **FR-008** | P2 | 关键写操作：从 web 触发 `--probe <vendor>` | 必须二次确认弹窗 |
| **FR-009** | P3 | Vendor 对垒视图：同 prompt 多 vendor 并排，抓 `duration_ms / exit_code / adapter_status` 出 leaderboard | 仅对 `T-AUDIT-*` 命名前缀 task 启用 |

### 2.2 非功能需求（NFR）

| ID | 需求 | 阈值 |
|---|---|---|
| **NFR-001** | Prod build 后冷启动到首屏可交互 | < 1.5s（本机） |
| **NFR-002** | SSE 增量推送延迟 | < 1s（log append → 浏览器渲染） |
| **NFR-003** | 后台 Node 进程内存 | < 100 MB（10 task / 1MB log 规模） |
| **NFR-004** | Vite dev server 冷启动 | < 2s，HMR < 200ms |
| **NFR-005** | Prod bundle main chunk（首屏加载） | gzipped < 200 KB；lazy chunks 单独不计入此阈值，但总 lazy chunks 累计也应 < 250 KB（防止首屏后 prefetch 爆炸） |
| **NFR-006** | 单测覆盖率（server 模块） | ≥ 70%，沿用 `node --test` |
| **NFR-007** | Windows + macOS + Linux 三平台跑通 | CI 暂不强制，本机 Windows 11 必须可跑 |

---

## 3. 实施门限

### 3.1 ✅ 允许做的（CAN-DO）

**后端**（Node ESM，沿用项目现有 `"type": "module"`）：
- 新增 top-level 目录 `dashboard/`，含 `dashboard/server/` 与 `dashboard/client/`
- 新增 CLI 入口 `cli/bin/hopper-dashboard`（含 `.cmd`），注册 `package.json` bin 字段
- **只读** import `cli/src/*` 内的纯函数（见附录 B 白名单）
- 新增 `tests/unit/dashboard-*.test.js`
- 通过 `child_process.spawn` 调用 `cli/bin/hopper-dispatch <flags>` 触发 probe / probe 刷新
- 使用 `chokidar` 做文件 watch
- 使用 `express` 或裸 Node `http`（二选一；推荐 `express` 因路由更清晰）

**前端**（React + Vite + TypeScript + shadcn/ui）：
- Vite 5+ 作为 dev server / 打包工具
- React 18 + TypeScript（client 端 100% TS；server 端可保持 JS）
- Tailwind CSS 3.4+
- **shadcn/ui** — 注意 shadcn 不是 npm 包，是 `npx shadcn@latest add <component>` 把源码 copy 进 `dashboard/client/src/components/ui/`；这些文件**允许后续手改**以贴合 §4.2 tokens
- **Radix primitives**（shadcn 的事实标配 accessibility 基座）— 仅允许 §B.3.4 列出的 5 个 specific 包；其他 Radix 包需要先在 spec 加 entry 再用。**首选**：让 `npx shadcn add <component>` 自动拉对应 Radix 依赖；不要手搓 fallback 来绕过 Radix（accessibility 漏洞会复合）
- `@tanstack/react-query`（fetch + cache + retry）
- `@tanstack/react-table`（FR-001 Queue View 表格）
- `react-router-dom`（route `/task/:id` deep-link）
- `lucide-react`（图标，替代 emoji）
- `clsx` + `tailwind-merge`（shadcn 标配工具）
- `markdown-it` + `highlight.js`（task body markdown 渲染）

### 3.2 ❌ 禁止做的（CANNOT-DO）

**协议红线**（违反即 revert）：
- ❌ **写任何 `.hopper/` 下的文件**（queue.md / output.md / COST-LOG.md / handoffs/）— ping protocol 的领地
- ❌ **直接 import `cli/src/dispatch.js::executeDispatch`** — 绕过 single-spawn 不变量
- ❌ **修改 `cli/bin/hopper-dispatch` 已有行为** — 如需新增 `--json`，作为单独 task 提案
- ❌ **bind 任何非 loopback 地址** — COST-LOG 含 token/$ 估算
- ❌ **修改 `cli/`、`hosts/`、`commands/`、`.hopper/`、`.claude-plugin/`、`.codex-plugin/` 已存在文件** —— 唯一例外：新增 `cli/bin/hopper-dashboard` + `.cmd`，与 `package.json` 的 `bin` / `dependencies` / `devDependencies` / `scripts` 字段追加

**栈红线**（违反即 rework）：
- ❌ 不引入 **Next.js / Remix / Gatsby / Astro**（SSR/SSG 与本地看板不匹配）
- ❌ 不引入 **Vue / Svelte / Angular / SolidJS / Preact**（栈统一在 React）
- ❌ 不引入 **Redux / Zustand / MobX / Jotai / Recoil**（Tanstack Query 足够覆盖；本地状态用 `useState` / `useReducer`）
- ❌ 不引入 **chart 库**（`recharts` / `chart.js` / `d3` / `echarts` / `visx`）— 用纯 CSS / Tailwind bar
- ❌ 不引入 **数据库**（SQLite / better-sqlite3 / Prisma / Drizzle / TypeORM）
- ❌ 不引入 **auth**（passport / jsonwebtoken / express-session / next-auth）
- ❌ 不引入 **额外 UI 库**（MUI / AntD / Chakra / Mantine / NextUI / DaisyUI）— shadcn 已是上限
- ❌ 不引入 **动画库**（framer-motion / react-spring / gsap / lottie）— Tailwind transition + CSS 足够

**风格红线**：
- ❌ 写 README 之外的营销文档（CHANGELOG.md / ROADMAP.md / CONTRIBUTING.md）
- ❌ UI 用 emoji 装饰（用 `lucide-react` 图标 / ascii 几何符号）
- ❌ 不 `git push`、不 `--amend`、不 `--no-verify`

### 3.3 接触代码的护栏

- 单文件改动 ≤ 200 行 / commit；超过拆分。**例外**：auto-generated artifacts
  (`package-lock.json` / `yarn.lock` / `pnpm-lock.yaml`) 不受此限 — 它们是
  npm/yarn/pnpm 生成的，是构建可重现性的载体；新增 / 变更时必须随同源码 commit
- 每个 task **至多 2 个 commit**，都必须 `[T-WEB-XX]` prefix 开头：
  - **必需**：impl commit — 源码 + tests + 依赖变更 + lockfile（如有）。
    消息推荐 `[T-WEB-XX] <short verb> <noun>`，例如 `[T-WEB-03] implement watcher sse`
  - **可选**：handoff-artifacts commit — 仅
    `docs/sidequests/web-dashboard/handoffs/T-WEB-XX-output.md` + `.log` + 截图等
    doc 资产；**禁止**夹带源码、配置或依赖变更。消息推荐
    `[T-WEB-XX] add handoff evidence`
  - ≥ 3 个 commit / 单 task 视为 rework 触发，**例外**：在下游 task 集成测试中发现的 hotfix 可以用原 task 的 prefix 追加第 3 个 src commit（每个 originating task 累计 ≤ 3 commits）。messaging 推荐 `[T-WEB-XX] <verb> <hotfix description>` 形式，便于 audit 追溯。不 `git push`、不 `--amend`、不 `--no-verify`
  - 单 commit 路线（实现 + 产出合并）仍然合法且推荐；2-commit 拆分是允许的优化，不是强制
- 新增依赖必须在 §B.3 白名单内；超出白名单需在 commit body justify

---

## 4. UI 设计语言

参考方向：Linear、Vercel v0、Raycast、Bloomberg terminal、Anthropic.com。
关键词：**hairline、monospace、dense、deliberate、zero-chrome**。

### 4.1 设计原则

1. **Information density first** — 看板的价值是一屏看完，留白服务于可读性，不服务于呼吸感
2. **Hairlines over shadows** — 1px @ 6-10% opacity 边界；禁止 `box-shadow` 装饰性使用
3. **Type as UI** — 字号 / 字重 / 字色承担 80% 的层级，颜色是辅助
4. **Status via dual encoding** — 状态必须同时用 color + glyph 表达，色盲可读
5. **Motion is data, not decoration** — 动效只用于"数据变化的提示"，不做 hero 动画
6. **Sharp by default** — 直角或 ≤ 2px 圆角；圆角是 brand 选择，不是默认值
7. **Monospace for data, sans for chrome** — 表格 / log / ID 用 mono；按钮 / 标题用 sans

### 4.2 设计令牌（Design Tokens）— shadcn CSS Variables + Tailwind Config

**重要**：`npx shadcn init` 会产生**默认主题**，必须用本节的值覆盖。reviewer 会 diff 验证。

#### 4.2.1 CSS Variables — 落在 `dashboard/client/src/styles/globals.css`

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    /* 全部 HSL 分量（shadcn 约定 — space-separated，没有逗号、没有 hsl()） */
    --background:           0 0% 4%;        /* #0A0A0A page background */
    --foreground:           0 0% 92%;       /* #ECECEC primary text */
    --card:                 0 0% 6.7%;      /* #111111 surface */
    --card-foreground:      0 0% 92%;
    --popover:              0 0% 8.6%;      /* #161616 elevated */
    --popover-foreground:   0 0% 92%;
    --primary:              158 71% 55%;    /* #3DDC97 electric mint */
    --primary-foreground:   0 0% 4%;
    --secondary:            0 0% 10%;
    --secondary-foreground: 0 0% 92%;
    --muted:                0 0% 10%;
    --muted-foreground:     0 0% 66%;       /* #A8A8A8 */
    --accent:               158 71% 55%;
    --accent-foreground:    0 0% 4%;
    --destructive:          0 100% 68%;     /* #FF5C5C coral */
    --destructive-foreground: 0 0% 92%;
    --warning:              44 100% 47%;    /* #F0B400 amber — staleness/retry */
    --warning-foreground:   0 0% 4%;
    --border:               0 0% 100%;      /* applied with /6 opacity via Tailwind */
    --input:                0 0% 100%;
    --ring:                 158 71% 55%;
    --radius:               2px;            /* sharp — overrides shadcn default 0.5rem */
  }
}

html, body, #root { height: 100%; background: hsl(var(--background)); color: hsl(var(--foreground)); }
body { font-family: theme('fontFamily.sans'); font-size: 13px; line-height: 1.5; }
```

#### 4.2.2 Tailwind Config — 落在 `dashboard/client/tailwind.config.ts`

```ts
import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        warning: { DEFAULT: 'hsl(var(--warning))', foreground: 'hsl(var(--warning-foreground))' },
        border: 'hsl(var(--border) / 0.06)',         // hairline default
        'border-hi': 'hsl(var(--border) / 0.12)',    // hover / focus
        input: 'hsl(var(--input) / 0.06)',
        ring: 'hsl(var(--ring))',
      },
      fontFamily: {
        sans: ['Geist', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"Geist Mono"', '"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        xs:   ['11px', { lineHeight: '1.4' }],
        sm:   ['12px', { lineHeight: '1.5' }],
        base: ['13px', { lineHeight: '1.5' }],
        md:   ['15px', { lineHeight: '1.5' }],
        lg:   ['20px', { lineHeight: '1.3' }],
      },
      spacing: {
        1: '4px', 2: '8px', 3: '12px', 4: '16px',
        5: '24px', 6: '40px', 7: '64px',
      },
      borderRadius: {
        none: '0',
        sm:   '2px',
        DEFAULT: '2px',
        md:   '4px',
      },
      transitionDuration: {
        instant: '80ms',
        fast:    '120ms',
        base:    '180ms',
      },
      transitionTimingFunction: {
        swift: 'cubic-bezier(0.2, 0, 0, 1)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],   // shadcn 标配
} satisfies Config;
```

**硬约束**：
- 颜色值（HSL 分量）必须**逐字符**与上述一致，不要 ±1° 漂移
- font-size 必须用 px 不要 rem
- border-radius 默认 2px，不要回退 shadcn 默认 8px
- 不引入除 `tailwindcss-animate` 之外的 Tailwind plugin（如 `@tailwindcss/forms`、`@tailwindcss/typography`）

### 4.3 组件指南 — 对应 shadcn 组件

每个 UI 元素先找 shadcn 对应组件，能用就用，必要时手改 `dashboard/client/src/components/ui/` 下的 source。

| UI 元素 | shadcn 组件 | 关键约束 |
|---|---|---|
| Queue 表格 | `Table` + `@tanstack/react-table` | 行高 32px；hover `bg-muted/40`；选中行左侧 2px primary bar |
| Status pill | `Badge` (variant `outline`) | `[●] running` — `lucide-react` 圆点 + label；颜色 token 编码 |
| Task drawer | `Sheet` (side="right") | 宽 `min(720px, calc(100vw - 16px))`；背后**不暗化**（必须去掉 SheetOverlay，不留半透明黑色蒙层） |
| 确认弹窗 | `AlertDialog` | 仅用于 §FR-008 写操作确认 |
| Toast | `Sonner`（shadcn 已集成） | 右下，3 行内，4s 消失，**不堆叠**（新覆盖旧） |
| Button | `Button` (variant `ghost` 默认 / `outline` 确认) | 禁用 `default` / `secondary` filled 变体；禁 `gradient` |
| Vendor 卡片 | `Card` | 不要 shadow，靠 `border-border` 1px |
| Tabs（log/body） | `Tabs` | 下划线指示器；不要 pill 背景 |
| Skeleton loading | **禁用** | 用 `[··· ]` mono 走位字符代替 |

### 4.4 动效

- 唯一允许的动画时长是 `duration-instant / duration-fast / duration-base`（详见 4.2.2）；CSS animation 必须 ≤ 180ms
- 允许：`opacity` / `transform` 过渡；shadcn 自带的 `data-state` 转场
- 禁止：bounce / elastic / spring / parallax / scroll-driven；不引入 `framer-motion`
- Loading：用 mono 字符 `[··· ]` 单字符走位代替 spinner（手撸 setInterval 即可，4 帧 200ms）

### 4.5 参考资源

实施前快速过一眼：
- 设计哲学：https://github.com/VoltAgent/awesome-design-md
- shadcn/ui 官方：https://ui.shadcn.com（**注意**：默认 token 不是我们的；以本 spec §4.2 为准）
- 极简看板范例：linear.app、vercel.com/dashboard、railway.app

---

## 5. 架构与目录

### 5.1 目录结构（新增）

```
hopper-plugin/
├── cli/                              # 不动（dashboard 只读 import）
├── hosts/                            # 不动
├── commands/                         # 不动
├── .hopper/                          # 不动（read-only from dashboard）
├── package.json                      # 追加 deps / devDeps / scripts / bin
├── tsconfig.base.json                # 新增 — TS 共享配置（仅 dashboard 用）
└── dashboard/                        # ← 新增 top-level
    ├── README.md                     # 启动方式 + 端口配置（≤ 80 行）
    ├── server/                       # Node 后端，JS（与 cli/ 风格一致）
    │   ├── index.js                  # http(express) entry
    │   ├── routes/
    │   │   ├── queue.js              # GET /api/queue
    │   │   ├── task.js               # GET /api/task/:id
    │   │   ├── vendors.js            # GET /api/vendors
    │   │   ├── cost.js               # GET /api/cost
    │   │   └── actions.js            # POST /api/action/probe
    │   ├── events/
    │   │   ├── sse.js                # SSE 广播 hub
    │   │   └── watcher.js            # chokidar wrappers
    │   └── lib/
    │       ├── tail.js               # 增量读取 log sidecar（offset 追踪）
    │       └── spawn-cli.js          # 调用 cli/bin/hopper-dispatch
    └── client/                       # Vite + React + TS 前端
        ├── index.html
        ├── vite.config.ts            # 含 dev proxy /api → server
        ├── tsconfig.json             # extends ../../tsconfig.base.json
        ├── tailwind.config.ts
        ├── postcss.config.js
        ├── components.json           # shadcn 配置
        ├── public/                   # 静态资源（图标等）
        └── src/
            ├── main.tsx              # ReactDOM 入口 + QueryClient
            ├── App.tsx               # 路由 shell
            ├── routes/
            │   ├── QueueRoute.tsx
            │   ├── TaskDetailRoute.tsx
            │   ├── VendorsRoute.tsx
            │   └── CostRoute.tsx
            ├── components/
            │   ├── ui/               # shadcn 生成（Button/Table/Sheet/Card/Badge/AlertDialog/Tabs/Sonner）
            │   ├── QueueTable.tsx
            │   ├── TaskDrawer.tsx
            │   ├── LiveLog.tsx
            │   ├── VendorCard.tsx
            │   ├── StatusPill.tsx
            │   └── CostBars.tsx      # 纯 Tailwind bar
            ├── lib/
            │   ├── sse.ts            # useSSE hook (EventSource + 重连)
            │   ├── api.ts            # fetch wrappers + Tanstack Query keys
            │   ├── types.ts          # 共享类型（Task / Vendor / CostRow）
            │   └── utils.ts          # cn() 等 shadcn 工具
            └── styles/
                └── globals.css       # §4.2.1 内容

cli/bin/
├── hopper-dashboard                  # ← 新增 POSIX bin
└── hopper-dashboard.cmd              # ← 新增 Windows bin
```

**dev/prod 区分**：
- `hopper-dashboard`（默认）：prod 模式，server 起 7777，serve `dashboard/client/dist/`；若 dist 不存在则报错"run `npm run dashboard:build` first"
- `hopper-dashboard --dev`：并发起 Vite dev (5173) + server (7777)，Vite 把 `/api`、`/events` 代理给 server
- `package.json` scripts 追加：`dashboard:dev` / `dashboard:build` / `dashboard:start`

### 5.2 数据流

```
filesystem            chokidar          SSE broker          EventSource
.hopper/*.md   ──▶   server/events  ──▶  /events/*    ──▶  useSSE hook ──▶ Query cache
                          │
                          └─ liveness tick (5s) ──▶ /events/liveness

client action  ──▶ POST /api/action/probe ──▶ spawn(`hopper-dispatch --probe ...`)
                                                       └─ stdout pipes back via SSE
```

### 5.3 集成点（详见附录）

- **只读**：附录 A 列出的所有文件
- **可调用 spawn**：附录 B 列出的 CLI flag
- **可 import 的纯函数**：附录 B 列出的白名单

---

## 6. 任务分解

8 个 task，每个独立可 ship，每个完成后强制第三方审核（§8）。

### T-WEB-01 — Scaffold (Vite + React + Tailwind + shadcn + server stub)

- **范围**：
  - 建 `dashboard/` 目录骨架（§5.1 全部目录创建，文件先空 stub 或 hello）
  - 初始化 Vite + React 18 + TS（`npm create vite@latest dashboard/client -- --template react-ts`）
  - 配置 Tailwind（`tailwind.config.ts` 用 §4.2.2 内容）+ `globals.css`（§4.2.1）
  - `npx shadcn@latest init` + `add button card badge`（先三件套，足够 hello 页）
  - 配置 Tanstack Query + React Router（`main.tsx` 注入 Provider）
  - server stub：`dashboard/server/index.js` 用 express 起 7777，返回 `dashboard/client/dist/index.html`（dev 模式则 proxy 到 Vite）
  - 新增 bin `cli/bin/hopper-dashboard`（含 `.cmd`），注册 `package.json` bin 字段
  - `package.json` 追加 `dashboard:dev` / `dashboard:build` / `dashboard:start` scripts
  - client 首页显示 "hopper dashboard online" + 当前时间走表（用 `useState` + `setInterval`，证明 React/Tailwind/shadcn 通路）
- **验收**：
  - `npm install` 干净通过（无 peer-dep warning，无 deprecated）
  - `npm run dashboard:dev` 在 Vite 5173 + server 7777 同时跑通；HMR 改 `App.tsx` 文字 < 200ms 反映
  - `npm run dashboard:build` 产出 `dashboard/client/dist/`，大小 gzipped < 200KB
  - `node cli/bin/hopper-dashboard` prod 模式起 7777，浏览器看到 hello + 走表
  - `--port 9090` flag 可改端口
  - 不监听非 loopback（`Get-NetTCPConnection -LocalPort 7777` 仅 `127.0.0.1`）
  - `npm test` 全绿（保留现有 ~158 个测试 + 新增 ≥ 3 个 server stub 测试）

### T-WEB-02 — Queue View

- **范围**：
  - server: `GET /api/queue` 调 `cli/src/queue.js::parseQueue`，返回 JSON 数组
  - client: `QueueTable.tsx` 用 `@tanstack/react-table` + shadcn `Table` 组件，5 列（ID / Type / Status / Vendor / Brief）
  - `StatusPill.tsx` 用 shadcn `Badge` + `lucide-react` 圆点 icon，5 态颜色双编码
  - Tanstack Query 5s 轮询作为 SSE fallback（T-03 之前的临时手段）
- **验收**：
  - 当前 queue.md 全部 ~25 行能正确渲染（截图证明）
  - 5 态颜色 + glyph：pending=灰圆 / in-progress=mint 实心 / done=mint 空心 / failed=coral 叉 / removed=灰删除线
  - 表格 zero layout shift（mono 列宽固定，row 高 32px）
  - hover row 用 `bg-muted/40`，选中 row 左侧 2px primary bar
  - 新增单测 ≥ 3 个（route 响应 + table render snapshot + status pill 颜色映射）

### T-WEB-03 — Watcher + SSE 基础设施

- **范围**：
  - `dashboard/server/events/watcher.js`：chokidar 订阅附录 A 全部文件
  - `dashboard/server/events/sse.js`：SSE broker，支持多 client 订阅、重连、心跳
  - client `lib/sse.ts`：`useSSE(channel)` hook，EventSource 封装 + 自动重连
  - `QueueRoute.tsx` 切换为 SSE 实时模式，移除 T-02 的 5s 轮询
- **验收**：
  - 6 个 SSE 频道全部可订阅（附录 A 表格）+ 重连
  - watcher 关闭时无 handle 泄漏（`taskkill` server 后 `node` 进程能干净退出）
  - 单测：chokidar event → SSE payload 映射（mock fs）
  - 手工 `Set-Content .hopper/queue.md ...` 后前端 ≤ 1s 重渲（计时器证明）

### T-WEB-04 — Task Detail Drawer

- **范围**：
  - 路由 `/task/:id` 用 react-router，进入 `TaskDetailRoute.tsx`
  - shadcn `Sheet` (side="right") 作为 drawer 容器（**移除默认 overlay**，背后不暗化）
  - server: `GET /api/task/:id` 调 `cli/src/background.js::readFrontmatter` + 读 body
  - client: `TaskDrawer.tsx` 分两栏 — 上半 frontmatter 表格、下半 body（`markdown-it` 渲染 + `highlight.js` 代码块）
- **验收**：
  - 点击 queue 行打开抽屉，URL 改为 `/task/T-XXX`
  - 直接访问 `/task/T-XXX` 抽屉打开（deep-link 工作）
  - frontmatter 13 字段全部显示，缺失值显示 `—`，不要 `undefined` / `null`
  - body markdown 渲染：表格、代码块（mono + 行号）、列表、链接
  - 关闭 drawer URL 回 `/`

### T-WEB-05 — Live Log Stream

- **范围**：
  - drawer 内 shadcn `Tabs`：`Output` / `Live log` / `Frontmatter`
  - server: SSE `/events/log/:id`，`dashboard/server/lib/tail.js` 用 byte-offset 增量 tail
  - client `LiveLog.tsx`：监听 SSE，append-only render，ANSI 转 HTML（手写 16 色 minimal 解析，不引外部库）
- **验收**：
  - 真实 dispatch（`hopper-dispatch --dispatch T-XXX --background`）能看到 stdout 实时流入（< 1s 延迟）
  - 网络断开重连后不重复历史 bytes（offset 协议正确）
  - 滚到底部自动 follow；手动上滚 lock 焦点不抢
  - 5MB log 浏览器内存 < 200MB（DevTools Memory tab 截图）
  - ANSI 颜色（红绿黄）正确渲染（用 `printf '\\x1b[31mred\\x1b[0m'` 测）

### T-WEB-06 — Vendor Inventory

- **范围**：
  - server: `GET /api/vendors` 调 `cli/src/cache.js::readCacheWithDiagnostics` + `cli/src/vendors/index.js::listAdapters`
  - client `VendorsRoute.tsx`：grid 5 个 `VendorCard.tsx`（shadcn `Card`），显示 install/staleness/cached models
  - 卡片右上 "Probe" 按钮 → `AlertDialog` 二次确认 → `POST /api/action/probe` → spawn `hopper-dispatch --probe <v>`
  - probe 进行时 button 显示 `[··· ]` mono 走位 loading
- **验收**：
  - 5 vendor 都显示（codex / kimi / opencode / copilot / agy）
  - `[STALE]` 标记与 `hopper-dispatch --models <vendor>` CLI 输出一致（`--status`
    是 queue 摘要，不含 vendor cache；stale 信息由 `--models` / `--capabilities`
    输出）
  - probe 流程完整可走：点击 → 弹窗 → 确认 → loading → 完成更新
  - probe 过程中拒绝重复点击（按钮 disabled）

### T-WEB-07 — Cost Log View

- **范围**：
  - server: `GET /api/cost` 解析 `.hopper/COST-LOG.md` 表格，返回 `{rows, totals, byVendor}`
  - client `CostRoute.tsx`：上方 stats（总 tokens / 总 $）、中部 `CostBars.tsx`（按 vendor 聚合，纯 Tailwind `bg-primary` + `width: %` bar）、下方 detail table
- **验收**：
  - 当前 COST-LOG 全部行能解析（容忍 `~` 前缀估算）
  - 聚合数字与手工 sum 一致（手算 vs 显示对照）
  - 柱状图纯 Tailwind 实现（grep verify 无 `recharts` / `chart.js` / `d3` / `echarts` / `visx` import）

### T-WEB-08 — Polish + Acceptance

- **范围**：
  - 键盘快捷键：`j/k` 行导航 / `enter` 打开 / `esc` 关 drawer / `/` 搜索 / `g q` 跳 queue / `g v` 跳 vendors
  - 空状态（empty queue / no in-progress / no cost rows）
  - error boundary（React `<ErrorBoundary>`，shadcn `AlertDialog` 显示错误）
  - `dashboard/README.md` ≤ 80 行
  - regression：前 7 个 task 验收点逐条复跑
- **验收**：
  - 所有快捷键可用（测试用例覆盖 6 个组合）
  - 关后台 dispatch 进程后 dashboard 5s 内显示 `orphan` 标记
  - README 含：启动方式 / dev vs prod / 端口配置 / 不支持的事
  - 前 7 task 验收 regression 全绿

---

## 7. 验收标准

### 7.1 任务级（每个 T-WEB-XX）

任意 task 视为 done 必须同时满足：

1. ✅ 该 task 明列的所有验收点逐条 evidence 可证（命令输出 / 截图 / 文件路径）
2. ✅ `npm test` 全绿，不引入 flaky
3. ✅ `npm run dashboard:build` 成功且 bundle gzipped < 200KB
4. ✅ 不触发 §3.2 禁止项（grep verify）
5. ✅ 新增依赖（如有）全部在 §B.3 白名单内
6. ✅ 第三方审核（§8）verdict ∈ {`accept`, `accept-with-note`}

### 7.2 整体（T-WEB-08 完成时）

1. ✅ `node cli/bin/hopper-dashboard` 一键启动（用户先 `npm install && npm run dashboard:build`）
2. ✅ 跑一个真实 5-vendor dispatch（例如 `T-AUDIT-PH6C-V3-*` 系列），dashboard 全程实时反映
3. ✅ 关闭 server → `.hopper/` 目录 0 改动（`git status` 干净）
4. ✅ 内存 / 性能阈值（NFR-001 ~ NFR-007）全部满足
5. ✅ Windows 11 + macOS（如可访问）至少跑通

---

## 8. 第三方审核流程

模仿 `.hopper/handoffs/T-AUDIT-PH6C-*` 系列的 adversarial review pattern。每个 T-WEB-XX done 后立刻分派一个 review task。

### 8.1 审核分派表

| Executor | 默认审核 vendor 配对 |
|---|---|
| Claude (opus-4.7) | codex (gpt-5.5 xhigh) + kimi (kimi-thinking) |
| Codex | opencode (deepseek-v4-flash) + kimi |
| Kimi | codex + copilot (sonnet-4.6) |
| Opencode | codex + kimi |
| Copilot | codex + opencode |

至少 1 个 reviewer 必须与 executor 不同公司（避免同型号偏差）。

### 8.2 审核分派命令

```bash
# Executor 完成 T-WEB-XX 后，sidequest 维护者运行（不是 executor 自己跑）：
hopper-dispatch --dispatch T-WEB-XX-REVIEW-codex --background --vendor codex \
  --reasoning xhigh

hopper-dispatch --dispatch T-WEB-XX-REVIEW-kimi --background --vendor kimi
```

### 8.3 审核 prompt 模板

reviewer 收到的 prompt（由 dispatcher 拼装）：

```
You are an adversarial code reviewer for sidequest task T-WEB-XX of the
hopper-plugin web dashboard. Use the scientific method: form hypotheses about
where defects most likely hide, then verify.

## Inputs
- Requirements: docs/sidequests/web-dashboard/SPEC.md (section §6 task T-WEB-XX)
- Execution log: docs/sidequests/web-dashboard/handoffs/T-WEB-XX-output.md (frontmatter + body)
- Raw stdout: docs/sidequests/web-dashboard/handoffs/T-WEB-XX-output.log
- Implementation diff: git show <commit-sha> --stat && git show <commit-sha>

## Hard constraints to verify (§3.2 — any trip = auto rework)
- Did the implementation write to any .hopper/ file?
- Did it import dispatch.js::executeDispatch?
- Did it bind a non-loopback interface?
- Did it modify existing files under cli/ hosts/ commands/ .hopper/ .claude-plugin/ .codex-plugin/?
  (Only allowed: NEW files cli/bin/hopper-dashboard + .cmd, and additive edits to package.json)
- Did it introduce stack red-line packages? (Next/Remix/Vue/Svelte/Angular/Preact/Redux/Zustand/MobX/
  Jotai/Recoil/recharts/chart.js/d3/echarts/visx/SQLite/Prisma/Drizzle/passport/jsonwebtoken/MUI/
  AntD/Chakra/Mantine/NextUI/DaisyUI/framer-motion/react-spring/gsap/lottie)
- Are all new deps in §B.3 whitelist?
- Did design tokens (§4.2) match byte-for-byte? (HSL values, font-sizes, radius=2px)

## Acceptance to verify
Each bullet under "T-WEB-XX 验收" in SPEC.md §6, with independent evidence (do not
trust executor's self-reported evidence — rerun the commands).

## Output
Write findings to docs/sidequests/web-dashboard/handoffs/T-WEB-XX-REVIEW-<vendor>-output.md
following the template at T-WEB-01-REVIEW-vendor-output.template.md schema:
- Verdict: accept / accept-with-note / rework / revert
- Severity-classified findings (P0 / P1 / P2 / P3)
- For each finding: location (file:line), evidence, recommended fix
- "Hard constraint violations" section (any §3.2 trip = automatic rework)
- "Spec compliance map" against §3 / §4 / §5 / §7
```

### 8.4 verdict 处理

- `accept` → 推进下一个 T-WEB
- `accept-with-note` → 推进，notes 落到下一个 task brief 头部
- `rework` → 当前 task status 退回 in-progress，executor 修复后重审
- `revert` → 用户决策；side-quest 默认整段回滚 commit

至少 1/2 reviewer 给 `accept` 或 `accept-with-note` 才能继续。

---

## 9. 启动 Prompt

把下面这段原样粘到要承接 sidequest 的 agent session 里。它是自包含的 — 不需要先解释项目背景。
（**注**：v2.0 已切到 React + Vite + shadcn 栈，这份 prompt 已更新对应。）

````
你是 hopper-plugin 的 sidequest executor，承接 web dashboard 子项目。这是 side
project，不在主线 .hopper/queue.md 中。

## 你的入口

唯一 spec 源：docs/sidequests/web-dashboard/SPEC.md（**v2.0** — React + Vite + shadcn 栈）

立刻读这份文档，特别注意：
- §2 需求清单（FR / NFR）
- §3 实施门限 — §3.2 的 ❌ 是硬约束，违反任何一条 = 自动 rework
- §4 UI 设计语言 — §4.2 design tokens（HSL 值、字号 px、radius=2px）是
  必须照搬的硬数字；shadcn init 的默认主题必须覆盖
- §5 架构 — 前端 React + Vite + TS，后端 Node ESM JS；目录结构 §5.1 必照搬
- §6 任务分解 — 你按 T-WEB-01 顺序执行，不跳序
- §7 验收标准 — 每个 task done 之前必须逐条 evidence 自证
- §8 第三方审核流程 — 每个 task 完成后你需要主动产出审核包

还要读：
- docs/sidequests/web-dashboard/handoffs/T-WEB-01-output.template.md（你的产出骨架）
- docs/sidequests/web-dashboard/handoffs/T-WEB-01-REVIEW-vendor-output.template.md（reviewer 视角）

## 工作循环（每个 T-WEB-XX）

1. Read SPEC.md §6 该 task 的范围 + 验收
2. 实施（commit prefix `[T-WEB-XX]`，**不 push、不 amend、不 --no-verify**）
3. 自验：
   - 跑 `npm test`
   - 跑 `npm run dashboard:build` 确保过且 bundle < 200KB gzipped
   - 跑 §7.1 六条 checklist，逐条记 evidence（命令输出 / 文件路径，不是泛泛 "✓"）
4. 写产出（照 executor 模板）：
   - docs/sidequests/web-dashboard/handoffs/T-WEB-XX-output.md
   - docs/sidequests/web-dashboard/handoffs/T-WEB-XX-output.log
5. 在 chat 回复输出：
   - commit short-sha
   - 验收 evidence 表（6 行）
   - hard-constraint self-check 表
   - "Ready for review" + 建议的 reviewer vendor 配对（§8.1）
6. **停下来等审核结果**。不要自动开始 T-WEB-(XX+1)。

## 硬约束（违反即失败，reviewer 自动判 rework）

协议红线：
- ❌ 不写 .hopper/ 下任何文件
- ❌ 不修改 cli/、hosts/、commands/、.hopper/、.claude-plugin/、.codex-plugin/ 已有文件
  （唯一例外：新增 cli/bin/hopper-dashboard + .cmd，与 package.json 字段追加）
- ❌ 不 import cli/src/dispatch.js::executeDispatch
- ❌ 不 bind 非 loopback 地址（仅 127.0.0.1）

栈红线：
- ❌ 不 Next/Remix/Gatsby/Astro
- ❌ 不 Vue/Svelte/Angular/SolidJS/Preact
- ❌ 不 Redux/Zustand/MobX/Jotai/Recoil
- ❌ 不 recharts/chart.js/d3/echarts/visx（用纯 Tailwind bar）
- ❌ 不 SQLite/Prisma/Drizzle/auth 任何包
- ❌ 不 MUI/AntD/Chakra/Mantine/NextUI/DaisyUI（shadcn 是上限）
- ❌ 不 framer-motion/react-spring/gsap/lottie

风格红线：
- ❌ 不 push / amend / --no-verify
- ❌ 不写 CHANGELOG/ROADMAP/CONTRIBUTING
- ❌ UI 不用 emoji（用 lucide-react）
- ❌ 单 commit 文件改动 > 200 行 → 拆分

新依赖必须在 §B.3 白名单内；超出在 commit body justify。

## 风格

- 简洁，不解释你正在思考什么；说"做了什么"+"证据"
- 代码默认无注释；仅在"为什么这样写不显然"时写一行
- 不写多段 docstring

## 第一步（不要动手写代码）

读完 SPEC + 两份模板后，回复以下三项，**仅此三项**：

1. **本 sidequest 一句话目标**（必须是一句话）
2. **3 个最大风险**（按 §3.2 hard-constraint 或 §7.1 验收，每条 ≤ 2 行；不要泛泛
   "质量风险" 这种废话；要具体到 spec 哪一条）
3. **T-WEB-01 实施计划**：
   - 你会动哪些文件（按 §5.1 目录树挑出 10-15 个具体路径）
   - 预计 commit 数（spec 期望 1 个，超出要说明）
   - 你打算如何处理 shadcn init 的默认主题（必须用 §4.2 覆盖，怎么验证？）

回复完上述三项停下来等用户回 `go`。**不要在第一轮回复里写任何代码或建文件**。
````

---

## 附录 A — 文件订阅清单（只读）

| 文件 / glob | 作用 | SSE 频道 |
|---|---|---|
| `.hopper/queue.md` | 任务表 | `/events/queue` |
| `.hopper/handoffs/*.md` | task 结构化输出（frontmatter + body） | `/events/task/:id` |
| `.hopper/handoffs/*.log` | vendor raw stdout（增量） | `/events/log/:id` |
| `.hopper/COST-LOG.md` | 成本账本 | `/events/cost` |
| `.hopper/AGENTS.md` | vendor preference 表 | `/events/agents` |
| (内部 5s tick) | PID liveness check | `/events/liveness` |

## 附录 B — 集成点

### B.1 可 import 的纯函数（白名单）

```js
// 全部为 ES module，纯函数，无副作用；dashboard/server/ 下相对路径
import { parseQueue }                from '../../cli/src/queue.js';
import { readFrontmatter, isAlive,
         listInProgressJobs }        from '../../cli/src/background.js';
import { readCacheWithDiagnostics,
         getVendorCache, isStale,
         staleness }                 from '../../cli/src/cache.js';
import { listAdapters,
         capabilitiesForAdapter }    from '../../cli/src/vendors/index.js';
import { listTaskTypes }             from '../../cli/src/tasks.js';
```

### B.2 可 spawn 的 CLI（白名单）

```bash
# 状态查询 / 刷新
hopper-dispatch --status                  # queue 摘要
hopper-dispatch --probe <vendor>          # 刷新 vendor 缓存
hopper-dispatch --result <task-id>        # 拉取已完成 task 的 verdict
hopper-dispatch --vendors                 # 列 vendor 注册表
```

**禁止** 从 dashboard spawn：
- `hopper-dispatch --dispatch ...`（写 queue.md，必须 ping protocol 走）
- 任何带 `--background` 的写操作

### B.3 第三方依赖白名单（v2.0）

#### B.3.1 后端（root `package.json` `dependencies`）

| 包 | 版本范围 | 用途 |
|---|---|---|
| `chokidar` | `^3.6.0` | 跨平台文件 watch |
| `express` | `^4.19.0` | http 路由（可选；裸 `http` 也行） |

#### B.3.2 前端运行时（root `package.json` `dependencies`）

| 包 | 版本范围 | 用途 |
|---|---|---|
| `react` | `^18.3.0` | UI 框架 |
| `react-dom` | `^18.3.0` | DOM 渲染 |
| `react-router-dom` | `^6.26.0` | 路由 |
| `@tanstack/react-query` | `^5.51.0` | 数据层 |
| `@tanstack/react-table` | `^8.20.0` | Queue 表格 |
| `lucide-react` | `^0.400.0` | 图标 |
| `clsx` | `^2.1.0` | shadcn 工具 |
| `tailwind-merge` | `^2.4.0` | shadcn 工具 |
| `class-variance-authority` | `^0.7.0` | shadcn 工具 |
| `markdown-it` | `^14.1.0` | task body 渲染 |
| `highlight.js` | `^11.10.0` | 代码块高亮 |
| `sonner` | `^1.5.0` | toast（shadcn 标配） |

#### B.3.3 Radix primitives — shadcn 依赖基座（root `package.json` `dependencies`）

shadcn/ui 大多数交互组件官方就依赖 Radix。手撸本地 fallback 在 mouse-only 之外
通常缺 keyboard / focus-within / aria-* 支持，复合后 dashboard 整体 a11y 不可用。
以下 5 个 Radix 包**预批准**；任何其他 `@radix-ui/*` 包要使用须先在本节加 entry。

| 包 | 版本范围 | 给哪个 shadcn 组件 / 任务 |
|---|---|---|
| `@radix-ui/react-tooltip` | `^1.1.0` | `Tooltip` —— T-WEB-02 之后的 StatusPill / VendorCard hover hint |
| `@radix-ui/react-dialog` | `^1.1.0` | `Sheet` (drawer) —— T-WEB-04 TaskDrawer |
| `@radix-ui/react-alert-dialog` | `^1.1.0` | `AlertDialog` —— T-WEB-06 probe 二次确认 (FR-008) |
| `@radix-ui/react-tabs` | `^1.1.0` | `Tabs` —— T-WEB-05 抽屉内 Output / Live log / Frontmatter |
| `@radix-ui/react-slot` | `^1.1.0` | `Button` asChild、其他 shadcn primitive 内部使用 |

**协议**：
- 引入新 Radix primitive 前**先 patch 本表**（执行任务首个 commit 可包含本表
  增补 + 实施代码），不要先用后补
- Radix 包通常会引入 ~1-3 个 transitive deps（如 `@radix-ui/react-presence`）—
  lockfile 会列出来；reviewer 不会因为 transitive 判 rework，只看顶层 deps
  在白名单内

#### B.3.4 构建/dev（root `package.json` `devDependencies`）

| 包 | 版本范围 | 用途 |
|---|---|---|
| `vite` | `^5.4.0` | 前端 build / dev |
| `@vitejs/plugin-react` | `^4.3.0` | Vite React 插件 |
| `typescript` | `^5.5.0` | 类型 |
| `@types/react` | `^18.3.0` | 类型 |
| `@types/react-dom` | `^18.3.0` | 类型 |
| `@types/node` | `^22.0.0` | 类型 |
| `@types/express` | `^4.17.0` | 类型 |
| `tailwindcss` | `^3.4.0` | 样式 |
| `postcss` | `^8.4.0` | Tailwind 依赖 |
| `autoprefixer` | `^10.4.0` | Tailwind 依赖 |
| `tailwindcss-animate` | `^1.0.7` | shadcn 标配 plugin |
| `concurrently` | `^8.2.0` | dev 模式并发 Vite + server |

**任何其他依赖**：在 commit body 内 justify；reviewer 默认对超表外的依赖判 rework。

**禁用包列表**（reviewer 会 grep `package.json`，命中即 rework）：
```
next remix gatsby astro
vue svelte @angular preact solid-js
redux @reduxjs/toolkit zustand mobx jotai recoil
recharts chart.js d3 echarts visx victory plotly
sqlite better-sqlite3 prisma @prisma/client drizzle-orm
typeorm sequelize mongoose
passport jsonwebtoken express-session next-auth
@mui/material @mui/joy antd @chakra-ui/react @mantine/core
@nextui-org/react daisyui
framer-motion @react-spring/web gsap lottie-react
```

---

## 修订记录

| 版本 | 日期 | 改动 |
|---|---|---|
| v1.0 | 2026-05-21 | 初版 — vanilla ESM 前端，零 build step；§3.2 禁 React/Vite/Webpack |
| **v2.0** | **2026-05-21** | **栈反转**：前端切到 **React 18 + Vite + TypeScript + Tailwind + shadcn/ui + Tanstack Query/Table + lucide-react**。理由：(a) shadcn/ui 设计语言天然贴合 §4.1 Linear/Vercel 风格，token 1:1 映射；(b) LLM agent 在 React 上产出速度高 2-3×；(c) Vite HMR 让"build step"成本接近零。同步更新：§3.1 CAN-DO 大幅扩充；§3.2 红线**细化为"具体禁用包列表"**而非笼统"禁框架"；§4.2 token 改为 shadcn HSL CSS variables + Tailwind config；§5.1 目录结构新增 Vite + TS 标准布局；§6 每个 task 改为指向 shadcn 组件；§B.3 依赖白名单按运行时/构建分类；§NFR-004/005 改为 Vite-specific 阈值；§9 启动 prompt 同步更新栈描述与第一步问答。**v1.0 配置不再有效**。|
| v2.0.1 | 2026-05-22 | §3.3 patch — lockfile (`package-lock.json` / `yarn.lock` / `pnpm-lock.yaml`) 不受 200 行/文件上限约束。源于 T-WEB-01 review F1：原文限制本意是约束源码改动，generated artifacts 是 build 可重现性载体；缺 lockfile 会让 §8 多 reviewer 模式拿到不同的 transitive deps。 |
| **v2.1** | **2026-05-22** | **Radix primitives 入白名单**（§B.3.3 新章节，5 个预批准包：`react-tooltip` / `react-dialog` / `react-alert-dialog` / `react-tabs` / `react-slot`）。源于 T-WEB-02 review F2：手撸本地 fallback 替代 shadcn 官方 Radix 依赖会复合 a11y 漏洞（mouse-only tooltip 不支持 keyboard / focus-within / aria-*），且 T-WEB-04 (Sheet)、T-WEB-05 (Tabs)、T-WEB-06 (AlertDialog) 都将依赖 Radix。同步：§3.1 前端 CAN-DO 加 Radix 协议说明；§B.3 子节重新编号 (B.3.3=Radix, B.3.4=devDeps，原 B.3.3 后移)。 |
| v2.1.1 | 2026-05-22 | §3.3 patch — codify "impl + handoff-artifacts" 2-commit split per task。源于 T-WEB-03 review F1：executor 在 T-WEB-03 用 2 commits（`b0785da` impl + `425549d` handoff），文字 spec 说"一个 commit"但 split 实际改善了 impl-commit 的 diff 聚焦度与审计可追溯性。新约束：(a) 最多 2 commit/task；(b) 都带 `[T-WEB-XX]` prefix；(c) 第二个 commit 必须**纯 doc-only**（仅 `T-WEB-XX-output.md/.log/截图`，不夹源码/依赖）；(d) 单 commit 路线仍合法且推荐。 |
| v2.1.2 | 2026-05-22 | §4.3 patch — Task drawer 宽度从 `480px` 改为 `min(720px, calc(100vw - 16px))`。源于 T-WEB-04 review F2：480px 实际塞不下 13 字段 frontmatter 表 + markdown body（含表格 / 代码块）；executor 用 760px 落地但未在 deviations 披露。720px 是承载内容的实际下限，clamp 保证移动端不溢出。Spec 与现实对齐，约束 reviewer 在合理上限内不必判 rework。同时强化"必须去掉 SheetOverlay"措辞，明确实施手段。 |
| v2.1.3 | 2026-05-22 | §6 T-WEB-06 验收 #2 文字修正 — 把 stale 对比命令从 `--status` 改为 `--models <vendor>`。源于 T-WEB-06 review F1：executor 实施时发现 `--status` 仅输出 queue 摘要不含 vendor cache，实际 stale marker 由 `--models` / `--capabilities` 输出。Spec 与现实对齐。 |
| v2.1.4 | 2026-05-22 | 收尾 patch — (a) §2.2 NFR-005 改为 main chunk 口径，lazy 不计；(b) §3.3 加入"下游 task 集成测试发现的 hotfix 可作为第 3 commit 用原 task prefix"carve-out。源于 T-WEB-08 review F1+F2。Sidequest closeout 同步发布 SIDEQUEST-COMPLETE.md。 |
