# Plan Review Rubric — v0.4 PRD → v1 MUST PLAN.md

Status: v1.0
Date: 2026-05-22
Anchor: `docs/specs/background-progress-notification-plan-review-rubric.md::root`
Companion: `docs/specs/background-progress-notification-prd-trd.md` (v0.4)

## 0. 用法

- **执行 agent**：出 PLAN.md 前对照本 rubric 自检；任一 BLOCKING 未达标先改，不要交付
- **Reviewer**（第三方审查 agent）：N1 节点机械化打分，输出 verdict + per-item 评分
- **严重度**：
  - **BLOCKING**：任一未达标 → 整体 rework
  - **SHOULD**：未达标 → accept-with-notes（≥80% 通过才能 accept）
  - **NICE**：缺失不影响通过

PLAN 的目标是把 PRD v0.4 §第 5 节 MUST 范围转化为可执行任务序列。本 rubric 是 PLAN 的"过 N1"标准，不是实施代码的标准。

---

## 1. 范围对齐（PLAN scope vs PRD MUST）

| ID | 严重度 | 检查 | 通过标准 | 典型失败 |
|---|---|---|---|---|
| R1.1 | BLOCKING | PLAN 范围 = PRD v0.4 §5 MUST 7 项 | progress.log JSONL / frontmatter 新字段 / `--progress` / `--watch-events` / runner terminal event / reap fix / Claude monitor 全部入 PLAN | 漏 reap fix；漏 Claude monitors.json |
| R1.2 | BLOCKING | 显式排除 SHOULD/LATER 项 | PLAN 文档明文声明 v1 不做：heartbeat、Codex app-server provider、pipe+tee、generic stream-parser、OpenCode native progress、Codex OS toast、dashboard SSE | 把 pipe+tee 塞进 v1 |
| R1.3 | SHOULD | 列 SHOULD/LATER 占位 | PLAN 末尾有"Next phases"小节，列 SHOULD (v1.1) 和 LATER (v1.2+) 项 | 完全不提后续 |
| R1.4 | BLOCKING | 不引入 PRD 未授权的额外功能 | PLAN 内无"顺便加 X" / "趁机重构 Y" | 顺便重构 runner 单 spawn 路径 |

---

## 2. AC 覆盖（18 条 → PLAN 任务映射）

v1 MUST 应覆盖的 AC 子集（其余在 v1.1+ 验证）：

**v1 MUST 必须覆盖**：AC-1 / AC-3 / AC-4 / AC-6 / AC-11 / AC-12 / AC-13 / AC-18  
**v1 MUST 应覆盖**（条件允许下）：AC-2 / AC-16（仅 stdout 部分）

| ID | 严重度 | 检查 | 通过标准 | 典型失败 |
|---|---|---|---|---|
| R2.1 | BLOCKING | 每条 v1 MUST AC 映射到 ≥1 个 PLAN 任务 | PLAN 内有 AC → task 矩阵 | "AC 在实施后再考虑" |
| R2.2 | BLOCKING | 每条 AC 有可执行验证步骤 | 任务列 verification 段（命令 / 脚本 / fixture），不是"看一下" | 验证写"目测 OK" |
| R2.3 | SHOULD | 区分单元 / 集成 / 跨平台 | PLAN 任务标注 `unit` / `integration` / `cross-platform-smoke` | 全标"测试" |
| R2.4 | BLOCKING | AC-3（runner SIGKILL → reap 写 terminal event）有独立任务 | 不能与"reap 改造"合并成一个任务 | 合并掉测试，只剩实现 |

---

## 3. 红线 / 不变量保留

| ID | 严重度 | 检查 | 通过标准 | 典型失败 |
|---|---|---|---|---|
| R3.1 | BLOCKING | single-spawn 不变量保留 | PLAN 明文声明 progress writer 不引入额外 `spawn()`；runner 仍只 spawn 1 个 vendor；progress 用同进程文件 IO | progress writer 起独立子进程 |
| R3.2 | BLOCKING | no retry / no fallback / no circuit-breaker | 任务描述中无 "retry on X" / "fallback to Y" / "if fail then" | "progress 写失败重试 3 次" |
| R3.3 | BLOCKING | frontmatter schema 向后兼容 | 新字段全部 optional；`readFrontmatter` 读旧 output.md 仍返回正常对象（缺字段 = undefined / null） | 老 output.md 解析报错 |
| R3.4 | BLOCKING | 现有测试不破 | PLAN 显式声明：跑通现有 ~158 个测试是每个 commit 的硬约束；包括 `tests/integration/runner-single-spawn.test.js` + `tests/unit/validation.test.js`（cross-host parity） | 计划改 runner 不提现有测试 |
| R3.5 | BLOCKING | 不触碰 `cli/src/dispatch.js::executeDispatch` 单 spawn 路径 | PLAN 任务清单内无该文件 spawn 段修改 | 把 progress 钩子加到 executeDispatch |
| R3.6 | SHOULD | 不修改 `.hopper/` 内已有用户文件 | PLAN 只写 handoffs/ 下与本任务相关的新文件（progress.log + 已有 output.md/.log 的 frontmatter） | 顺便改 AGENTS.md / queue.md |

---

## 4. 文件契约（progress.log + frontmatter）

| ID | 严重度 | 检查 | 通过标准 | 典型失败 |
|---|---|---|---|---|
| R4.1 | BLOCKING | progress.log 路径精确 | `.hopper/handoffs/<task-id>-progress.log`，PLAN 内字面一致 | 改成 `progress-<id>.jsonl` |
| R4.2 | BLOCKING | progress.log JSONL schema 完整 | PLAN 列出全部字段：`seq, ts, task_id, vendor, phase, kind, message, source, terminal`；PRD §6.2 字面一致 | 字段拼错；漏 `terminal` |
| R4.3 | BLOCKING | frontmatter 新增字段完整 | PLAN 列出全部 7 字段：`last_progress_at, last_progress, progress_seq, progress_log, raw_log, vendor_session_id, terminal_event_emitted`；与写入时机标注（每写一次的触发条件） | 漏 `terminal_event_emitted` |
| R4.4 | BLOCKING | terminal event 双轨 | PLAN 明文：runner / reap / opencode plugin 三写入点都先检 `terminal_event_emitted`，再写 JSONL `terminal:true`，最后置 frontmatter `terminal_event_emitted: true` | 只写其中一轨 |
| R4.5 | BLOCKING | atomic 写策略沿用 | frontmatter 走 `renameSync(tmp.<pid>.<ts>, target)`（与 `cli/src/background.js::writeFrontmatter` 一致） | 引入新 atomic 机制 |
| R4.6 | SHOULD | progress.log rotate 策略 | 10 MB 上限 → `.1`；rotate 时机（每写一次后 stat / 启动时检查 / 定期）明文 | 留空 |
| R4.7 | NICE | JSONL 末行 `terminal:true` 字段顺序固定 | 便于 grep `\"terminal\":true$` | 字段乱序 |

---

## 5. 关键修复路径（v0.3 review 暴露的 gap）

| ID | 严重度 | 检查 | 通过标准 | 典型失败 |
|---|---|---|---|---|
| R5.1 | BLOCKING | FR-010 reapStaleJobs 写 terminal event | 独立任务；不与"reap 现状改造"合并；含测试（AC-3 / AC-11） | 仅在 frontmatter 改 status，不写 progress.log |
| R5.2 | BLOCKING | sync 模式不写 progress.log | PLAN 明文：`runSubprocessOnce`（sync 路径）零改动；progress 仅在 `hopper-runner`（background 路径）注入 | sync 模式也加 progress hook |
| R5.3 | BLOCKING | `--watch-events` 用 `fs.watchFile` | PLAN 明文选 `fs.watchFile(path, {interval: 500})`；明文不用 chokidar、不用 `fs.watch` | "用最稳的方式 watch" |
| R5.4 | BLOCKING | watch 对象限定 frontmatter | PLAN 明文：watch 一组 `*-output.md`（检测 status 变化），不是 watch `*-progress.log`（避免 append 抖动） | watch progress.log 末行 |
| R5.5 | SHOULD | frontmatter 写节流 ≤ 0.5 Hz | 实现机制明确（debounce / interval guard） | 没说频率 |
| R5.6 | BLOCKING | tail 实现处理 truncate/rotate | 如果 PLAN 重用 `dashboard/server/lib/tail.js` 或类似实现，必须在该任务内补 `curr.size < prev.size` 与 `curr.ino !== prev.ino` 分支 | 沿用现有 tail.js 不补 |

---

## 6. Host bridge 范围

| ID | 严重度 | 检查 | 通过标准 | 典型失败 |
|---|---|---|---|---|
| R6.1 | BLOCKING | Claude Code monitor 桥接 = 唯一 host 集成 | PLAN 新增 `monitors/monitors.json` + 1 个 monitor 命令脚本；不动 `commands/*.md` | 顺便改 dispatch.md prompt |
| R6.2 | BLOCKING | `hopper-monitor` OS toast 实现路径明确 | PLAN 决策三选一：(a) 自己拼 PowerShell/osascript/notify-send 三平台命令（推荐，零依赖）；(b) 引入 `node-notifier` 等单包；(c) v1 仅 stdout JSONL，OS toast 后置到 v1.1。明文写出选择 + 理由 | 留"待决定" |
| R6.3 | BLOCKING | OpenCode native plugin 在 v1 零改动 | PLAN 明文：`hosts/opencode/plugins/hopper-async.ts` 不被修改；AC-17 在 v1.2 验证（不在 v1 MUST） | 顺手给 plugin 加 progress 写入 |
| R6.4 | BLOCKING | Codex CLI host 在 v1 零改动 | PLAN 明文：`hosts/codex-cli/` 不被修改；Codex 用户走 standalone `hopper-monitor` 路径 | 顺手改 codex prompt |
| R6.5 | SHOULD | dashboard 在 v1 零改动 | PLAN 明文：`dashboard/` 不被修改；v1.1 增量 | 顺手在 dashboard 加 progress 频道 |

---

## 7. 跨平台

| ID | 严重度 | 检查 | 通过标准 | 典型失败 |
|---|---|---|---|---|
| R7.1 | BLOCKING | Windows 11 必跑全部 AC | 每条 AC 验证步骤至少在 Win11 + Node 22 执行 | 仅 POSIX 跑 |
| R7.2 | SHOULD | POSIX-fixture 测试 | macOS / Linux 用代码路径 + auto-skip-on-Windows 的 fixture 测试至少覆盖 `fs.watchFile` 路径 + reap 路径 | 完全跳过 POSIX |
| R7.3 | SHOULD | atomic rename 行为对比 | PLAN 含针对 `renameSync` 替换 frontmatter 时 `fs.watchFile` 触发的测试（Win + POSIX） | 跳过 |
| R7.4 | NICE | OS toast 三平台烟测 | Windows BurntToast / macOS osascript / Linux notify-send 至少各一次手动 smoke 截图；v1.1 可补 | 缺 |

---

## 8. 提交 / 工作流约束

| ID | 严重度 | 检查 | 通过标准 | 典型失败 |
|---|---|---|---|---|
| R8.1 | BLOCKING | commit 原子拆分 | PLAN 任务分解使每个 commit 自洽（schema 变更 / 实现 / 测试 不混在一个 commit） | 一个巨 commit |
| R8.2 | BLOCKING | 不 push / 不 --amend / 不 --no-verify | PLAN 明文声明该约束 | 不提 |
| R8.3 | SHOULD | 单文件改动 ≤ 300 行 / commit | PLAN 任务规模符合 | 单 commit 改 800 行 |
| R8.4 | BLOCKING | commit prefix 一致 | PLAN 用 `[T-PROG-XX]` 或 hopper 现有 `[T-PLUGIN-XX]` 等已知命名规范；不要发明新前缀 | 各 commit 风格不一 |
| R8.5 | SHOULD | deviation 协议 | PLAN 含一节"实施时与 PLAN 偏离怎么处理"（小偏离记 deviations 段；大偏离回 PLAN review） | 缺 |

---

## 9. PLAN 文档形式

| ID | 严重度 | 检查 | 通过标准 | 典型失败 |
|---|---|---|---|---|
| R9.1 | BLOCKING | 任务依赖图 | PLAN 列出哪些任务串行 / 哪些可并行；含 mermaid / ASCII 图 | 纯线性列表，无依赖说明 |
| R9.2 | BLOCKING | 每任务有 verification | "implement X" 之外要有"verify X via Y" | 只列实现 |
| R9.3 | BLOCKING | 引用 PRD 章节号 | 任务描述引用 PRD v0.4 §6.2 / §6.3 等具体章节，便于回溯 | 不引用，凭空写 |
| R9.4 | SHOULD | 估时 S/M/L | 每任务标 S (<2h) / M (2-8h) / L (>8h) | 缺 |
| R9.5 | SHOULD | 风险段 | PLAN 末尾列"实施层面的已知风险" + mitigations | 缺 |

---

## 10. 评分汇总

| Tier | 通过条件 | Reviewer 输出 verdict |
|---|---|---|
| **Accept** | 全部 BLOCKING 通过 + ≥ 80% SHOULD 通过 | `accept` |
| **Accept with notes** | 全部 BLOCKING 通过 + < 80% SHOULD 通过 | `accept-with-notes`（notes 落到首个执行任务的 brief 头部） |
| **Rework** | 任一 BLOCKING 未通过 | `rework`，明列未通过条目 + 修订建议 |

NICE 项不影响通过判定，仅作为 reviewer 评论。

---

## 11. 执行 agent 提交 N1 review 时的产物清单

执行 agent 在交付 PLAN.md 后，必须随附：

1. PLAN.md 绝对路径
2. 自检 checklist：本 rubric 全部条目逐条自评（pass / fail / N/A + 简短证据）
3. 引用回 v0.4 PRD 的章节映射表（PLAN 任务 → PRD §X.Y）
4. v1 MUST 范围声明（明文 7 项；明文排除 SHOULD/LATER）

没有自检 checklist → reviewer 直接退回，不打分。

---

## 12. Reviewer N1 输出格式

完成 N1 后 reviewer 输出：

```
verdict: accept | accept-with-notes | rework

rubric scores:
  R1.1 [BLOCKING] PASS
  R1.2 [BLOCKING] PASS
  R1.3 [SHOULD]   FAIL — PLAN 未列 v1.1/v1.2 占位
  ...

red-line check:
  single-spawn:          PASS (PLAN §X 明文保留)
  no-retry:              PASS
  frontmatter-compat:    PASS
  existing-tests:        PASS

required revisions (if any):
  1. <章节> <修订内容>
  2. ...

notes (if accept-with-notes):
  - <落到首任务 brief 头部的备注>
```

reviewer 不写代码、不发 commit、不开 PR。verdict + 评分 + 修订建议 即是 N1 全部产出。

---

## 13. 修订记录

| 版本 | 日期 | 改动 |
|---|---|---|
| v1.0 | 2026-05-22 | 初版，配套 background-progress-notification PRD v0.4 |
