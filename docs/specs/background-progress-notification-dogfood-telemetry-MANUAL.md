# Dogfood Telemetry Manual — v1.0 + v1.1 → v1.2 decision phase

Status: active phase (C of B→C→A roadmap)
Started: 2026-05-23
Anchor: `docs/specs/background-progress-notification-dogfood-telemetry-MANUAL.md::root`
Owner: user / orchestrator (reviewer is idle during C)
Target duration: 1-2 weeks (min 5 days, max 4 weeks)

## Companions

- v1.1 close: `docs/specs/background-progress-notification-v1.1-should-N2-r17-REVIEW.md`
- Polish close: `docs/specs/background-progress-notification-v1.1-should-N2-polish-REVIEW.md`
- v1.2 PLAN (target of A phase): `docs/specs/background-progress-notification-v1.2-later-PLAN.md`

## 1. 目标

dogfood telemetry 阶段的目的：让 hopper-plugin 在真实工作流中跑 1-2 周，收集 v1.0/v1.1 在生产场景下的数据，**用 data 而非猜测**决定 v1.2 (R08 pipe+tee / R09 stream-parser / R10-R13) 的优先级 + 设计选择。

- Reviewer: **idle**
- Executor agents: **idle**（不开新 R 项 / 新 wave）
- User / orchestrator: **active**

## 2. 范围

| 做 | 不做 |
|---|---|
| 用 hopper 跑真实工作（非 dogfood 专列任务） | 主动改 cli/ / dashboard/ / commands/ 代码 |
| 体验 dashboard / Claude monitor / OS toast 真实触发 | 开新 R 项 / 新 wave |
| 记 anomaly + 痛点（local-only） | commit dogfood weekly summaries / baseline 到 git |
| 触发 BLOCKER signal 时立刻报告 reviewer | 派 dogfood 专列 task（执行 R 项时已派过） |
| 把 `.hopper/dogfood-*.txt` 留 untracked 作 evidence | 加 dogfood 文件到 `.gitignore` |

## 3. 观察清单

### 3.1 BLOCKER signals（任一 → 暂停 C，立刻报告 reviewer）

| 现象 | 检测 | 行动 |
|---|---|---|
| Runner crash 后任务永远 in-progress | `node cli/bin/hopper-dispatch --jobs` 显示 PID 不 alive 但 status=in-progress > 1h | 触发 `--reap`；如果 reap 也不写 terminal event → BUG，报告 reviewer |
| Background task done 但 progress.log 0 byte | frontmatter status=done AND `progress.log` 文件 size = 0 | 报告 reviewer，附 task-id + 完整 frontmatter |
| `--watch-events` 异常退出（exit code ≠ 0） | `echo $LASTEXITCODE` after `--watch-events --once` | 报告 reviewer，附 stderr |
| Sync mode dispatch 创建 progress.log（红线破坏） | `node cli/bin/hopper-dispatch <id>` (无 --background) 后出现新 `*-progress.log` | **立刻**报告，触发 emergency hotfix |
| terminal_event_emitted=true 但 progress.log 无 terminal:true 行 | grep mismatch | 双轨 dedup 破坏，报告 reviewer |

### 3.2 重要 signals（每日 sample）

| 现象 | 检测 | 频率目标 | v1.2 决策影响 |
|---|---|---|---|
| Partial-write orphan | frontmatter status=orphaned AND terminal_event_emitted=false | < 1 / 100 task = OK strict-only | N-w3.1 strict vs permissive |
| progress.log rotate 触发 | `*-progress.log.1` 文件存在 | 取决于任务时长 + 输出量级 | P-6 (rotate-aware) 实际生效频率 |
| 非 Codex vendor terminal event 完整性 | 各 vendor (kimi/opencode/copilot/agy) ≥ 5 次 dispatch，all done/failed 都有 terminal_event_emitted | 100% = OK | R09 stream-parser 必要性 |
| Dashboard Progress tab 真实使用 | （主观）实际打开 dashboard 看 Progress tab 几次 | 每周 ≥ 5 次 = high signal | dashboard 增量 v1.2 优先级 |
| OS toast (Win/macOS/Linux) 触发可见性 | （主观）terminal event 时 toast 弹了吗 | Win11 BurntToast 不装时 fallback 是否生效 | R07 P-7 cache 实测节省 |

### 3.3 次要 signals（每周 sample）

| 现象 | 检测 | 备注 |
|---|---|---|
| `--watch-events` 多 subscriber 共存 | Claude Code monitor + dashboard + CLI 同时活 | 文档化"是否需 dedup 层" 的实际需求 |
| `--once` semantics 真实用户场景 | CI / 脚本调用 `--once` 是否觉得"丢 event" | 是否需 `--drain` flag |
| watchFile + chokidar 500ms latency | （主观）"我看到 toast 多久才弹" | NFR-002 latency 目标实测 |
| 大 vendor 输出时 frontmatter 写频率 | mtime watch on `*-output.md` | runner 节流 0.5 Hz 是否被实测命中 |

## 4. 数据收集（每日 ≤ 5 分钟）

### 4.1 Baseline snapshot (Day 0，只跑 1 次)

PowerShell:

```powershell
git rev-parse HEAD | Set-Content .hopper/dogfood-baseline-commit.txt
Get-Date -Format "yyyy-MM-dd HH:mm:ss" | Set-Content .hopper/dogfood-started.txt
(Get-ChildItem .hopper/handoffs/*-output.md -ErrorAction SilentlyContinue | Measure-Object).Count |
  Set-Content .hopper/dogfood-task-count-day0.txt
```

POSIX (macOS/Linux) 等价:

```bash
git rev-parse HEAD > .hopper/dogfood-baseline-commit.txt
date +"%Y-%m-%d %H:%M:%S" > .hopper/dogfood-started.txt
ls .hopper/handoffs/*-output.md 2>/dev/null | wc -l > .hopper/dogfood-task-count-day0.txt
```

### 4.2 Daily quick-grep（每天 1 次，~30s）

PowerShell 版本 — 推荐保存为 `dogfood-daily.ps1`（local-only，**不 commit**）：

```powershell
$orphans = Get-ChildItem .hopper/handoffs/*-output.md -ErrorAction SilentlyContinue | ForEach-Object {
  $content = Get-Content $_ -Raw
  if ($content -match 'status: orphaned' -and $content -notmatch 'terminal_event_emitted: true') { $_.Name }
}
Write-Host "Partial-write orphans:        $($orphans.Count)"
if ($orphans.Count -gt 0) { Write-Host ($orphans -join "`n  ") }

$rotated = Get-ChildItem .hopper/handoffs/*-progress.log.1 -ErrorAction SilentlyContinue
Write-Host "Rotate triggered files:       $($rotated.Count)"

$noTerminal = Get-ChildItem .hopper/handoffs/*-output.md -ErrorAction SilentlyContinue | ForEach-Object {
  $c = Get-Content $_ -Raw
  if ($c -match 'adapter: (kimi|opencode|copilot|agy)' -and $c -match 'status: (done|failed|timeout|cancelled|orphaned)') {
    if ($c -notmatch 'terminal_event_emitted: true') { $_.Name }
  }
}
Write-Host "Non-Codex no-terminal-event:  $($noTerminal.Count)"
if ($noTerminal.Count -gt 0) { Write-Host ($noTerminal -join "`n  ") }

$emptyProgress = Get-ChildItem .hopper/handoffs/*-progress.log -ErrorAction SilentlyContinue | Where-Object { $_.Length -eq 0 }
Write-Host "Empty progress.log files:     $($emptyProgress.Count)"
if ($emptyProgress.Count -gt 0) { Write-Host ($emptyProgress.Name -join "`n  ") }

$totalTasks = (Get-ChildItem .hopper/handoffs/*-output.md -ErrorAction SilentlyContinue | Measure-Object).Count
$baselineCount = if (Test-Path .hopper/dogfood-task-count-day0.txt) { [int](Get-Content .hopper/dogfood-task-count-day0.txt) } else { 0 }
Write-Host "Total tasks ever:             $totalTasks  (since baseline: +$($totalTasks - $baselineCount))"
```

POSIX 等价（简化版，bash 4+）:

```bash
echo "Partial-write orphans:        $(grep -l 'status: orphaned' .hopper/handoffs/*-output.md 2>/dev/null | xargs -r grep -L 'terminal_event_emitted: true' | wc -l)"
echo "Rotate triggered:             $(find .hopper/handoffs -name '*-progress.log.1' 2>/dev/null | wc -l)"
echo "Empty progress.log:           $(find .hopper/handoffs -name '*-progress.log' -size 0 2>/dev/null | wc -l)"
echo "Total tasks ever:             $(ls .hopper/handoffs/*-output.md 2>/dev/null | wc -l)"
```

### 4.3 Weekly summary（每周 1 次，~10 分钟）

local-only 文件 `.hopper/dogfood-week-N.md`（**不 commit**，untracked 状态留作 evidence）：

```markdown
# Dogfood Week N (yyyy-mm-dd ~ yyyy-mm-dd)

## Counts
- Total dispatches this week:    ~XX
- Cumulative since baseline:     ~XX
- Partial-write orphans:         X  (cumulative: X)
- Rotate triggered:              X
- Empty progress.log:            X  (BLOCKER if > 0 with status=done)
- Non-Codex no-terminal-event:   X

## Vendors used (this week)
- codex:    X dispatches, p50/p95 duration
- kimi:     X dispatches, ...
- opencode: ...
- copilot:  ...
- agy:      ...

## Subjective signals
- Dashboard usage:  used X times, useful for: ...
- Claude monitor:   woke me X times, missed Y times (felt like)
- OS toast:        Win/macOS/Linux fired Z times, visible / silent
- BurntToast on Win11: ✓ installed / ✗ MessageBox fallback used

## Anomalies (if any)
- (description, task-id, frontmatter excerpt)

## Pain points (≤ 100 字)
- ...

## Vendor 任务规模分布
- 短 task (< 30s):    ~X
- 中 task (30s-5min): ~X
- 长 task (> 5min):   ~X
- xhigh / thinking 长 task (> 10min): ~X
```

## 5. Anomaly response playbook

### 5.1 看到 partial-write orphan

1. **不要 panic** — strict-only 设计是 acceptable，N-w3.1 已 informational
2. `grep -A 5 'status: orphaned' .hopper/handoffs/<task-id>-output.md` 看 reason 字段
3. `tail -50 .hopper/handoffs/<task-id>-output.log` 看末尾是否有 disk full / IO error
4. 记入 weekly summary 但**不**改代码
5. **升级触发**：累计 > 5% dispatch 命中此条 → 报告 reviewer，N-w3.1 升级评估

### 5.2 看到 rotate 触发

1. 这是 expected — 10MB 阈值在 codex review xhigh / kimi thinking 等 large task 自然命中
2. 验证 P-6 fix 生效：`node cli/bin/hopper-dispatch --progress <task-id>` 应能取到 rotate 前的 events（events seq 跨 rotate 单调递增）
3. 验证 dashboard `/api/task/:id/progress` 也跨 rotate 一致
4. 记入 weekly summary

### 5.3 Claude monitor 不响应

1. 检 `.claude-plugin/plugin.json` 是否在 `~/.claude/plugins/` 下 symlinked
2. 检 `monitors/monitors.json` 是否在 repo root（不是 `.claude-plugin/` 下）
3. 重启 Claude Code session
4. 仍不响应 → 报告 reviewer，N-w4.2 anchor 文字可能需补丁

### 5.4 OS toast 不弹（Win11）

1. 检 `$env:HOPPER_NOTIFY` 是否被误设为 '0'
2. 检 BurntToast PowerShell module 是否装：`Get-Module -ListAvailable -Name BurntToast`
3. 如未装 → MessageBox fallback 应弹一个对话框；如**对话框也没弹** → 报告 reviewer
4. P-7 cache 验证：第 2 次 terminal event 应该 < 100ms（vs 第 1 次 ~200-400ms）

### 5.5 OS toast 不弹（macOS）

1. 检系统 "通知中心" 设置允许终端 app 发通知
2. 手动测试 `osascript -e 'display notification "test" with title "hopper"'`
3. 仍不响应 → 报告 reviewer

### 5.6 OS toast 不弹（Linux）

1. 检 `which notify-send` 是否存在（Ubuntu/Debian: `libnotify-bin` 包；Arch: `libnotify`）
2. 检桌面环境是否运行（GNOME/KDE/...）
3. 手动测试 `notify-send "test" "hopper"`
4. 服务器环境（无桌面）→ expected fail，stdout JSONL 仍工作

### 5.7 BLOCKER signal 5（dashboard 显示 done 但 progress.log 0 byte）

立刻：

```powershell
# 收集证据
$id = "<task-id>"
Get-Content ".hopper/handoffs/$id-output.md" | Set-Content "anomaly-$id-frontmatter.txt"
Get-ChildItem ".hopper/handoffs/$id-progress.log" | Format-List | Out-File "anomaly-$id-progress-stat.txt"
Get-ChildItem ".hopper/handoffs/$id-progress.log.1" -ErrorAction SilentlyContinue | Format-List | Out-File "anomaly-$id-progress-rotated.txt"
```

报告给 reviewer 时附这 3 个文件 + 触发场景描述。

## 6. 退出条件

满足任一即可触发 A 阶段：

| 条件 | 触发场景 |
|---|---|
| ≥ 5 天 + ≥ 30 真实 dispatch | 最小信号量 |
| ≥ 2 周 + 各 vendor ≥ 5 次 | 推荐信号量 |
| 出现 BLOCKER signal (§3.1 任一) | 立刻中断 + 报告 |
| 用户主观判断 "够了" | 任何时点 |
| C 阶段 > 4 周 | 强制收尾（避免无限等） |

## 7. 触发 A 阶段（启动 v1.2）

回到 reviewer 会话，发送以下结构化消息：

```
C 结束，启动 v1.2

## Telemetry summary (cumulative)
- Total dispatches:               ~XX
- Codex dispatches:               ~X (avg duration: Xs)
- Non-Codex dispatches (kimi/opencode/copilot/agy):  ~X each
- Partial-write orphans:          X / XX dispatches (X%)
- Rotate triggered:               X tasks
- Empty progress.log w/ done:     X tasks (should be 0)
- Non-Codex no-terminal-event:    X / X dispatches

## Subjective experience
- Dashboard Progress tab: 用过 X 次，X 有用
- Claude monitor wake:    工作 X / 失败 Y
- OS toast:               Win/Mac/Linux 体验
- BurntToast availability: ✓/✗

## Anomalies surfaced
- (≤ 3 项最重要的，每项 ≤ 50 字)

## Pain points (≤ 100 字)
- ...

## v1.2 priority preference (可选)
- 倾向先做 R08 / R09 / R13 / 其他 / 无偏好
```

reviewer 收到后会出：

1. `docs/specs/background-progress-notification-v1.2-later-N1-REVIEW.md`（N1.v2 based on telemetry）
2. R08 wave 1 executor prompt

## 8. C 阶段期间允许的 ad-hoc 操作

不算"开新 R 项"，可以做：

- ✅ 跑真实任务（main work）
- ✅ 查 `--progress` / `--watch-events` / dashboard 观察行为
- ✅ 偶尔手动 `--reap` 清 stale jobs
- ✅ 重启 dashboard server 验证状态保留
- ✅ 跑 `npm test` 验证 baseline 未漂移
- ✅ 临时调 `HOPPER_NOTIFY=0` / `HOPPER_TEST_ONLY_TIMEOUT_MS=<n>` 测试 disable / timeout
- ✅ 在 weekly summary 中提出 v1.2 priority 倾向
- ✅ 给 reviewer 发问"这个现象是 expected 吗"（reviewer 仍 idle，但偶尔 ad-hoc Q&A 允许）

## 9. C 阶段不允许的操作

- ❌ 改 cli/ / dashboard/ / commands/ / monitors/ 代码（除 §3.1 BLOCKER hotfix）
- ❌ 开新 wave / 新 R 项
- ❌ 改 PRD / PLAN / N1 / N2 review 文件（已 frozen）
- ❌ commit dogfood weekly summaries / baseline / anomaly evidence 到 git
- ❌ 派新的 dogfood task（执行 R 项时已派过；C 阶段是 passive observation）
- ❌ 在 dispatch 时 dry-run 假任务来"测试 v1.2"功能（C 阶段是观察现有 v1.0/v1.1，不预演未来）

## 10. Phase A 入口快速参考

| Step | Action | 谁做 |
|---|---|---|
| C ends | 用户判断"够了" | user |
| Send telemetry message (§7 模板) | 触发 A | user |
| Write N1.v2 review on v1.2 PLAN | A.1 | reviewer |
| Write R08 wave 1 executor prompt | A.2 | reviewer |
| Execute R08 wave 1 | A.3 | executor agent |
| ...continue v1.2 waves... | A.4+ | executor + reviewer |

## Revision Log

| Version | Date | Change |
|---|---|---|
| v1.0 | 2026-05-23 | C 阶段手册初版，配套 N2.polish accept verdict + v1.1 milestone close |
