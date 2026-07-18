# ISSUE: grok 模型线换代 — knownGood 过期 + probe 不自愈，`verified-latest` 派发全失败

> 报告方: 真实研究派发（dispatch 到 grok 时触发）
> 日期: 2026-07-16 发现，2026-07-18 修复
> 严重度: 高（`Model rule: verified-latest` 是 grok 派发的默认约定，过期即整条路径全失败，且无自愈手段）
> 状态: 已修复（本 issue 记录根因 + 修复 + 一个更深的待办）
> 关联: `cli/src/vendors/grok.js`, `cli/src/vendor-probe/grok.js`, `cli/src/policy.js`, `cli/src/model-check.js`, `cli/src/dispatch.js`, `cli/src/setup.js`

## 现象

grok 的模型线整体换代：`grok models` 现在只列 `grok-4.5`（CLI 自己的 default），而 hopper 的 grok adapter 一直硬编码的 `grok-build` / `grok-composer-2.5-fast` 已双双变成 `unknown model id`：

```
$ grok -p "..." -m grok-build --output-format json --no-auto-update
{"type":"error","message":"Couldn't set model 'grok-build': Invalid params: \"unknown model id\". Run 'grok models' to see available models."}
```

因为 `.hopper/AGENTS.md` 里 grok 任务行普遍写的是 `Model rule: verified-latest`（sentinel，解析约定见 `cli/src/policy.js` — 取 adapter `capabilities.modelArg.knownGood[0]`），knownGood 一旦过期，**所有走 verified-latest 的 grok 派发全部失败**，且没有任何机制会自动发现或修复它。

## 根因（两点，缺一不可）

**1. `cli/src/vendors/grok.js` 的 `knownGood` 是手工维护、会过期的静态列表。**
`knownGood: ['grok-build', 'grok-composer-2.5-fast']`（2026-06-02 dogfood 时 live-verified）在 2026-06-02 到 2026-07-16 之间被 xAI 静默下线。`verified-latest` sentinel 解析（`cli/src/dispatch.js::resolveAdapterOptsForTask` + `cli/src/policy.js::resolveVerifiedLatest`）纯读 `knownGood[0]`，从不校验这个名字现在是否还活着——静态列表腐烂，派发跟着腐烂。vendored 副本 `plugins/hopper/cli/src/vendors/grok.js` 是逐字节镜像（`scripts/sync-vendored-plugin.mjs` 保证同步），同样过期。

**2. `cli/src/vendor-probe/grok.js` 的 `--probe grok` 是"假探针"——从不读 `grok models`，只会把同一份硬编码列表原样刷回缓存。**
修复前的 probe 文件自己在注释里承认了这一点：
> "NOTE: `grok models` DOES exist in v0.2.51 — a live-introspection upgrade is a follow-up (V3)."

也就是说，即使运维发现派发失败、跑了 `hopper-dispatch --probe grok` 想"刷新一下"，缓存里写回去的仍然是同一份写死在源码里的 `['grok-build', 'grok-composer-2.5-fast']`——**探针不会让系统自愈，只会让人误以为自己已经修复了**。这是根因 1（静态数据会过期）之上更深一层的根因：**修复静态数据的唯一机制本身也是静态的**。

两点合起来就是审查报告曾经预测的"硬编码模型名单会随 vendor 换代而腐烂（names rot）"——这是该预测第一次在真实生产派发中应验：不是"理论上可能过期"，而是两个月内、无任何 vendor 侧公告的情况下真的过期了，且过期后系统没有任何自我修正路径。

## 修复

**A. `knownGood` 更新为 `['grok-4.5']`**（`cli/src/vendors/grok.js` + 同步 `plugins/hopper/cli/src/vendors/grok.js`）。
`DEFAULT_MODEL` 同步改为 `grok-4.5`。live micro-test（grok CLI v0.2.101, 2026-07-18）：
```
$ grok -p "reply with the single word OK and nothing else" -m grok-4.5 \
    --output-format json --no-auto-update --permission-mode bypassPermissions --always-approve
{"text":"OK","stopReason":"EndTurn", ...}
```
`reasoningArg`（`--effort`/`--reasoning-effort`，`low|medium|high`）重新核对未变，注释补了 2026-07-18 复核日期；grok 仍无 xhigh 上限。

**B（核心修复）. `--probe grok` 改为真正解析 `grok models` 输出**（`cli/src/vendor-probe/grok.js`，新增导出 `parseGrokModelsList`）。
`grok models` 的真实输出（v0.2.101）：
```
You are logged in with grok.com.

Default model: grok-4.5

Available models:
  * grok-4.5 (default)
```
probe 现在 spawn 一次 `grok models`（30s 超时，无重试，模式与 codex/opencode/kimi 的 probe 一致），解析 "Available models:" 下的 `* <id>` / `- <id>` 列表项。成功时返回 `introspection_supported: 'full'`，`models` 是活体列表，`models_source` 标注来自实时命令——这样下次 xAI 再换代模型名，只要跑一次 `--probe grok`，缓存就会自动刷新为正确的新名字，不再需要人工改源码。

解析失败时（spawn 失败 / 超时 / 输出不匹配预期形状）**诚实降级**：不伪造/不留空，退回到 adapter 的静态 `knownGood` 作为兜底，标记 `introspection_supported: 'partial'`（与 `claude.js` 探针"版本活体、模型列表静态"的既有语义一致），并在 `notes` 里明确写清楚降级原因。绑定二进制查找不到时仍是 `introspection_supported: 'none'`（未变）。

`estimateSpawns()`（`cli/bin/hopper-dispatch`）同步更新：grok 从"static = 0"改为"`grok models` = 1"。

**D. 版本 bump**：`0.31.0` → `0.32.0`（判定 minor，非 patch——见下方"版本判定"小节），四同步点（`package.json` / `.claude-plugin/plugin.json` / `.codex-plugin/plugin.json` / `.claude-plugin/marketplace.json` 两处 version 字段）+ `commands/smoke.md` / `commands/vendors.md` 版本号文案同步；CHANGELOG.md 新增条目。

**E. 回归**：`tests/unit/vendor-probe.test.js` 新增 8 条 grok 相关用例（`parseGrokModelsList` 4 条纯函数 fixture + 3 条 fake-binary spawn 集成用例覆盖 full/partial-fallback/none 三态）；修正了 3 处读取真实 grok adapter 状态、断言值仍是 `grok-build` 的既有测试（`tests/unit/dispatch-fallback-chain.test.js`、`tests/unit/vendor-model-auth.test.js`、`tests/unit/vendors-contract.test.js`——这三处如果不改会因为本次修复而变红,是预期内的连带更新，不是新缺陷）；`scripts/sync-vendored-plugin.mjs` 已跑，`plugins/hopper/` 下的 grok 相关文件与主源码一致。

## 版本判定：minor 而非 patch

仓库的历史版本号（`git log --oneline`，0.20.0 → 0.31.0 共 12 次发布）**全部**是 `X.Y.0` 形式——patch 位从未真正被当作"小修"使用（仅早期 0.7.1/0.8.1/0.11.1 三次例外），无论提交信息前缀是 `fix:` 还是 `feat:`，一律递增 minor 位。本次改动的实质不只是"改个默认值"：`--probe grok` 从零 spawn 的静态回退升级为真实 spawn + 解析 + 诚实降级的新行为路径（新增导出函数、新增测试类别、`estimateSpawns` 契约变化），符合项目既有惯例里"minor 位承载所有可观察行为变化"的用法，故判定 `0.32.0`（minor），不引入此前罕见的 patch 位。

## 验证记录（真实环境，非 mock）

- `grok -p ... -m grok-build ...` → `Couldn't set model 'grok-build': Invalid params: "unknown model id"`（修复前后均如此，确认这是 vendor 侧真实下线，不是 hopper 这边的误判）。
- `grok -p ... -m grok-4.5 ...` → `{"text":"OK","stopReason":"EndTurn",...}`（V-verified 2026-07-18）。
- `node cli/bin/hopper-dispatch --check-model grok grok-4.5` → `verdict: verified (exit 0)`。
- `node cli/bin/hopper-dispatch --check-model grok grok-build`：
  - 修复前（缓存里还是旧探针写的静态名单）→ `verdict: catalog-only (exit 2)`。
  - 跑过 `node cli/bin/hopper-dispatch --probe grok` 刷新缓存后 → `verdict: not-found (exit 1)`（catalog 里已经没有 grok-build 了）。
  - 两种结果都符合"不再 verified"的验收标准；catalog-only → not-found 的变化本身就是探针自愈生效的直接证据。
- `node cli/bin/hopper-dispatch --probe grok` → `grok ... full | 1 model(s) | ~1.9s`，真实 spawn 了一次 `grok models` 子进程（此前是 0 次）。
- `node cli/bin/hopper-dispatch --models grok`（探针后）→
  ```
  grok (full, 0m ago)
    - grok-4.5
    reasoning: low | medium | high
  ```

## 更深的待办（本次不做，记录为 follow-up）

**`verified-latest` 哨兵和 `--check-model` 的 "verified" 判定信任的是静态 `knownGood`，从不校验新鲜度——即使 `knownGood` 本身已经过期，只要没人手动发现并改代码，两条路径都会持续、静默地给出"verified"的假阳性。**

具体来说：
- `cli/src/model-check.js::evaluateModelCheck` 的第一步就是 `kg.some((g) => modelKeysMatch(vendor, g, normalized))` → 命中直接判 `verified`，**根本不看 probe 缓存**（`catalog` 只在 knownGood 未命中时才会被查）。
- `cli/src/policy.js::resolveVerifiedLatest` / `cli/src/dispatch.js` 里 `verified-latest` 哨兵同样只读 `knownGood[0]`，同样不查 probe 缓存。
- 也就是说：哪怕这台机器五分钟前刚跑过 `--probe grok`、缓存里明明白白写着 grok-build 已经不在活体 catalog 里了，`--check-model grok grok-build` 依然会因为 knownGood 里（假设还没被人工改掉）残留着 `grok-build` 而判 `verified`——**"verified" 这个词本该代表"我们有把握这个名字现在能用"，但它实际验证的只是"这个名字曾经被人手工确认过"，两者在 knownGood 过期后就分道扬镳了**。这正是本次 issue 复现的确切故障模式，只是这次是从"从未探测过"的角度触发；如果反过来是"探测过但没人去对照"，同样的假阳性会发生在有新鲜缓存的机器上，而且更隐蔽——因为看起来像是"探测过的、应该可信"的状态。

值得注意的是，`cli/src/setup.js::buildVendorReadiness`（`hopper-dispatch --setup --deep` / `--doctor --deep`）**已经有**一套活体 catalog vs 静态 knownGood 的漂移检测机制（`row.modelReconcile` + `cli/src/model-normalize.js::reconcileModels`，本次 B 修复上线后 grok 也会第一次真正吃到这条检测路径，因为它此前要求 `introspection_supported === 'full'` 才会做对照，而 grok 一直是 `'none'`）。但这条检测路径**只在人主动跑 `--setup --deep`/`--doctor --deep` 时触发**，`--check-model` 和 `verified-latest` 哨兵解析完全不复用它，二者是两条互不相通的代码路径。

**建议的加固方向（follow-up，非本次范围）**：当某个 vendor 存在新鲜（未过 `staleAfter`）且 `introspection_supported === 'full'` 的 probe 缓存时，`--check-model` 的 `verified` 判定与 `verified-latest` 哨兵解析都应该顺手交叉核对一下 `knownGood`（至少是 `knownGood[0]`）是否仍出现在这份新鲜 catalog 里；不在的话，不应该静默地继续判 `verified`/继续把它当 `verified-latest` 的解析结果转发出去，而应该at least 在 hint / policyNotices 里发出一个"knownGood 与新鲜 catalog 不一致"的强警告（是否要新增一个 `verified-stale` verdict、还是复用现有的 `catalog-only` 语义、还是仅追加一条 notice，留给实现时判断）。这样即使未来又有别的 vendor（不只是 grok）经历同样的模型线换代，只要机器上有新鲜探针缓存，故障能在派发前就被拦下来，而不必等到真实 dispatch 400 才发现。
