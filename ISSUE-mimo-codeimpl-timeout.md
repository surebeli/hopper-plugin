# ISSUE: mimo (mimocode) adapter — `code-impl` 多文件机械编辑任务撞 180s 硬超时

> 报告方: x-agents CEO 编排(S1-AST-01 Contacts 断言改写任务)
> 日期: 2026-06-16
> 严重度: 中(有 workaround=改派其它 vendor,但暴露 adapter 真实限制)
> 状态: 待 hopper 自查

## 现象

任务 `S1-AST-01-P5`(code-impl):对 2 个 TS 测试文件做 **41 处机械替换**(`aiQuery(\`boolean, X\`)` → `aiBoolean(\`X\`)`)。

两次 background 派发**都超时,且未落任何编辑**:

| 次 | 通道 | 时长 | 结果 |
|---|---|---|---|
| 1 | opencode 调 mimo(`opencode run --model xiaomi-token-plan-cn/mimo-v2.5-pro`) | **181406ms** | `adapter_status: timeout` / exit 1 / `opencode run timed out after 181406ms` |
| 2 | mimo 原生(`mimo run --model xiaomi/mimo-v2.5-pro --dangerously-skip-permissions`) | **181029ms** | `adapter_status: timeout` / exit 1 / `mimo run timed out after 181029ms` |

两次时长几乎相同(~181s),指向**固定 180s 超时**而非 vendor 通道差异。

## 定位(代码级)

`cli/src/vendors/mimo.js:81-83`:
```js
timeoutMs(opts) {
  return applyTaskTypeFloor(180_000, opts);
}
```
- 基线 **180_000ms 硬编码**;`code-impl` 任务类型**不享受加长 floor**(review 类才有);**无 env/flag 可调**(`--help` 无 `--timeout`,源码无 `process.env.*TIMEOUT` 覆盖 mimo 基线)。
- mimo 是 agentic coding tool,**逐处 read→reason→edit→write** ~40 次,加启动开销,超 180s。

## 疑似加重因素:启动期 skill 重名刷屏

两次 output 里各有 **17 条** `WARN message="duplicate skill name"`(`~/.claude/skills/<name>` 与 `~/.claude/skills/gstack/<name>` 双注册,如 ship/review/retro/scrape/qa/learn/guard/…)。mimo 启动加载这批 gstack skill,吃掉首段时间预算才开始任务。

证据文件:
- `<x-agents>/.hopper/handoffs/S1-AST-01-P5-output.md`(status 块 + WARN 刷屏)
- `<x-agents>/.hopper/handoffs/S1-AST-01-P5-output.log`(raw,~300KB)

## 建议 hopper 自查方向

1. **code-impl 超时 floor 可配/加长**:机械批量编辑(几十处)正当地会超 180s;给 code-impl 一个更高 floor 或 `--timeout <ms>` 派发覆盖。
2. **env 覆盖**:`HOPPER_MIMO_TIMEOUT_MS` / 通用 `HOPPER_DISPATCH_TIMEOUT_MS`,便于慢机/大任务放宽。
3. **duplicate skill name 双注册**:`gstack/<name>` 与裸 `<name>` 同名重复加载是否应去重/抑制,减少 mimo/opencode 启动浪费。
4. **机械任务路径**:agentic vendor 对"可 sed 化"的纯机械批量替换是否应提示/支持 bulk 编辑(单次 sed),而非逐处 LLM round-trip——同一任务交 grok/deepseek 即在超时内完成,差异主要在 mimo 的逐处编辑节奏。

## 备注

本任务已 workaround:P5 的两文件改派 grok(P2)/ deepseek(P3)执行,不阻塞 S1-AST-01。此 issue 仅为 mimo adapter 的真实限制留档供 hopper 修复。
