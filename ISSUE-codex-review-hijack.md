# ISSUE: codex adapter — 跨仓 review 任务被 gstack/superpowers skill 劫持 + 锚错 workdir + 写错输出路径

> 报告方: x-agents CEO 编排(S1-AST-01 review + locate-pipeline review)
> 日期: 2026-06-16
> 严重度: 高(codex 经 hopper 做"审查异仓 diff"类任务**可靠失败**,已 3+ 次)
> 状态: 待 hopper 自查

## 现象(可靠复现)

派 codex 审查**另一个仓**的改动(task `S1-AST-01-REVIEW-P1`:审 `uikit_uiautomation_midscene` 的 11 个 .test.ts 的 aiQuery→aiBoolean diff),brief 明确范围锁定 + "禁止全仓 diff / 禁触发 gstack-review"。结果:

- `adapter_status: success` / exit 0 / 5.6min,但**完全没审目标**。
- codex 启动即加载 `using-superpowers`/gstack skill(raw log 行 51:"I'll load the required startup skill first, then I'll ask for the review target because the task type alone doesn't identify a diff…")。
- 之后在 **hopper workdir = x-agents** 里 `git diff`,审了**完全不相关**的 hawk_server/agent auth/exit/pipeline 缺口(G1-G5/A1-A8/7 项改造),**产物写到 `<x-agents>/.triage/codex-final.md`**,而非 brief 要求的 `planning/handoffs/S1-AST-01-review.md`。
- 队列历史同模式失败 ≥2 次:`S1-M3-03-FINAL-P7`、`-P7-v2`("codex global gstack-review skill hijacked the task and performed whole-repo diff review instead")。

## 根因假设

1. **workdir 锚错**:codex 子进程 cwd = hopper 项目根(x-agents),`git diff` 默认审 x-agents,而非 brief 指定的目标仓 `uikit_uiautomation_midscene`。`--sandbox` 我传 `read-only` 但实际 banner 显示 `workspace-write [workdir,…]`(映射不一致,另见下)。
2. **全局 skill 自动加载劫持**:codex 启动强制 `using-superpowers`,继而 gstack-review/cli-audit 等全局 skill 抢占任务语义,无视 brief 的"禁 gstack-review"。raw log 旁证:`.triage/cli-audit-codex.jsonl`(1MB)——它跑去做了 cli-audit。
3. **输出路径被 skill 约定覆盖**:产物落 `.triage/codex-final.md`(gstack 约定),而非 brief 的 `--write`/指定路径。

## 建议 hopper 自查方向

1. **codex 适配器显式设 cwd = 审查目标仓**:支持 brief/dispatch 传 `--repo <path>` 或从 task 解析目标仓,作为 codex 子进程 cwd;不要默认 hopper workdir。
2. **抑制全局 skill 自动加载**:dispatch codex 时传环境/flag 关闭 superpowers/gstack 自动注入(或 `CODEX_DISABLE_GLOBAL_SKILLS`),让 brief 成为唯一任务来源。
3. **输出路径以 brief 为准**:`.triage/codex-final.md` 约定不得覆盖 dispatch 指定的输出文件;`--write` 应落到 `.hopper/handoffs/<task>-output.md` 或 brief 指定路径。
4. **`--sandbox` 映射核对**:dispatch 传 `read-only`,codex banner 却 `workspace-write`——确认 codex 适配器对 `--sandbox` 的映射(`-s <mode>`)是否生效。
5. **(相关,非 hopper 本体)`codex:rescue` 通道**:经 Claude Code `codex:codex-rescue` 派的 locate-pipeline review(Codex 后台任务 `bcrdegm1j`)**数小时未落盘、无完成通知**;产物 `locate-pipeline-stats-and-risks-codex-review.md` 始终不存在。Codex 后台队列的完成/失败需可见。

## 备注

两次受影响任务均已 workaround:S1-AST-01 review 由 CEO 代行(对抗性 + ground-truth,已写 `planning/handoffs/S1-AST-01-review.md`);locate-pipeline doc 本身源码级自洽(file:line + 生产数据),codex 交叉审查放弃。此 issue 供 hopper 修复 codex 适配器的跨仓审查可用性。
