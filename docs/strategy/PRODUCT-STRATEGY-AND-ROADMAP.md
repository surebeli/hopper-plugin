# hopper-plugin 战略综合文档

Status: v1.0 strategic analysis
Date: 2026-05-23
Anchor: `docs/strategy/PRODUCT-STRATEGY-AND-ROADMAP.md::root`
Method: 5 独立战略视角(product-pmf / commercialization / personal-ip / tech-roadmap / skeptic)并行分析 → 综合裁决
Audience: 作者(surebeli / litianyi)

> 综合 5 个视角。冲突处已点明并裁决。诚实优先于动听。
> 这是一份对内的战略判断文档,不是营销材料。

---

## 1. 现状速写

hopper-plugin 是一个工程上已经"做完"的项目:v1.0(后台进度+通知+monitor 桥)、v1.1(只读 web dashboard + 三平台 OS toast)、产品化资产(README/banner/架构图/8 配方 cookbook/双 marketplace 元数据)、434 测试、N1/N2 双层审查纪律,全部 GA。但它的真实使用 telemetry 只有 3 个真正经历 v1.0 系统的任务,且全是项目给自己做的 dogfood——**零外部用户**。更刺眼的是:cost-log 显示关键路径上的 builder 活几乎都是 Claude Opus 在交互里干的,真正的异构 vendor 分派只发生在边缘的 audit 行,其中还出现过 1 次 kimi 静默超时归零、1 次 agy auth 失败、1 次 copilot 子 agent 伪造"完成"的 review。**一句话:供给侧极其成熟,需求侧尚未点火。**

---

## 2. 目标

**作者明确说的:**
- 进展 vs 目标差距分析
- 产品化 / 商业化建议
- MVP / PMF 措施
- 打造个人 IP、扩展 AI 领域社媒机会
- 依赖优先的 roadmap

**从项目+作者背景推断的隐含目标(裁决:这些才是真目标):**
- **真目标 A(最高优先,作者自述):把 hopper 作为个人在 AI 领域的 IP / 社媒影响力载体。** 这意味着 hopper 的"成功"不必等于"产品成功",而可以是"作者因它被看见"。
- **真目标 B:验证"CLI 层厂商中立编排 + 文件协议"这个稀有生态位到底有没有外部需求。** 这是 hopper 作为产品/品类能否成立的母命题。
- **隐含但被工程惯性掩盖的目标:停止在 0 反馈下继续建设。** 5 个视角全部独立指向这一点。

---

## 3. 差距分析(产品 / 商业 / 个人IP / 技术 四象限)

| 象限 | 现状 | 最大 GAP | 裁决 |
|---|---|---|---|
| **产品** | 功能过度建设(dashboard/toast/monitor/434 测试),核心 SLP 其实只需 3 件(`dispatch --background` + `--result` + AGENTS.md) | **没有"分发即激活"路径;TTHW 可能 >30 分钟且依赖 5 个外部账号。** 缺 `hopper init`、缺 single-vendor quickstart、缺一键安装 | 最大 gap 不是功能缺失,是**首次成功 dispatch 的路径不存在** |
| **商业** | 不碰钱流、单机文件协议、no-orchestration 主动放弃了最值钱的编排定价空间 | **没有原生货币化锚点;A/B/C 三条 SaaS/团队/抽成路径可行性低-中,且都需要先有规模** | 这是 feature 不是 business;唯一与现状匹配的变现是 **D:作者 IP / 内容 / 咨询** |
| **个人 IP** | 已有全部弹药(GA 能力 + 美学资产 + 架构图),但对外叙事偏功能罗列,缺"为谁/为何"钩子 | **"被看见"的动作为零——没有 demo GIF、没有发帖、没有 launch** | 最小成本、最高杠杆的 gap,且直接服务真目标 A |
| **技术** | v1.2 已规划(R08 pipe+tee → R09 parser → R10 capability → R11/R13) | **采用闭环(init+quickstart+安装)与 v1.2 进度链互不阻塞,但项目却把资源押在了不拉新的 v1.2 上** | R09(stream-parser)是 v1.2 内唯一有采用价值的点;R08/R12/R13 是为不存在的负载加固 |

---

## 4. 核心判断(明确立场,不骑墙)

**判断一:今天的 hopper 是一个 feature,不是 product。** 裁决采纳 skeptic + commercialization 的共识,理由是硬证据而非姿态:工具唯一的工作负载是它自己(hopper 造 hopper),关键路径活由 Claude 交互完成,vendor 分派只在边缘发生,且不碰钱流=无货币化锚点。它最可能的归宿是被 Codex CLI / OpenCode / 某个 multi-CLI orchestrator 吸收为"vendor-neutral dispatch 子模块"。**但"是 feature"不等于"没价值"——它的价值正在被错误地定位为产品价值,而它的真实价值是 IP 价值。**

**判断二:异构分派对外是"窄真需求 + 高摩擦",不是普适刚需。** 裁决:
- 对**画像 B(多模型对照评测者)= 真需求,已自证**(作者自己的 T-AUDIT 就是这形态,可信度最高)。
- 对**画像 A(多账号重度 coder)= 弱真需求**,alt-tab 切 CLI 的 status quo 够好。
- 对**画像 C(团队)= 大概率伪需求**,与单机文件协议冲突。
- skeptic 说的"TAM 趋近于零"过于绝对——它对的是"普适刚需"为零,但对画像 B 这个窄缝是真的。**裁决:异构分派是真需求,但 TAM 是四位数量级的窄缝,且这群人最有能力自己写脚本绕过你。** 因此它能撑起 IP 叙事,撑不起一门生意。

**判断三:最该押注的不是 v1.2 代码,是"拿到第一个外部 dispatch 信号"+"作者 IP 曝光"。** 5 个视角的 ONE THING 高度收敛:product 要 60s demo、commercialization 要找 3 个外部用户验异构率、personal-ip 要 demo GIF + X thread、tech 要 `hopper init` 降摩擦、skeptic 要"去找 10 个真实用户,找不到就去写去发别再 commit"。**全部指向同一件事:用最低成本把命题暴露给真实受众,换取外部信号。在拿到这个信号前,任何 stdio/parser 工作都是 0 反馈下的继续过度建设。**

---

## 5. 优先级建议(收敛 5 个 ONE THING → 4 条排序)

> 排序原则:服务真目标 A/B(被看见 + 验证需求)优先于服务"产品完整性"。

**P0 — 录一条 60 秒跨厂商分屏 demo GIF + 双语发帖(英文 X thread 主推 + 即刻中文版)**
- **做什么:** 左 Claude Code 敲 `dispatch --background`,右终端 codex/kimi 后台跑活、progress.log 实时滚、结束弹 OS toast。配叙事「I built a file protocol that makes every AI CLI talk to each other」+ 诚实标注 n=3 / no external users yet。
- **为什么:** 弹药已全部就位(GA + 美学资产),缺的不是功能是曝光。一条会动的 demo 是后续所有 launch(HN/Reddit/掘金)的复用弹药,同时验证叙事是否打动人。直接服务真目标 A。
- **验证信号:** 10 个真实回复里 ≥2 个问"how do I dispatch to another vendor / can I dispatch to X"。若 <2,异构命题对外部即伪。
- **成本:** **S**(1 天)

**P1 — `hopper init` + single-vendor quickstart(只装 1 个 vendor 即可跑通首条真实 dispatch)**
- **做什么:** 一条命令 scaffold `.hopper/`(含 1 个 demo 任务)+ `--check --fix` 引导式 auth + 文档明确"1 个 vendor 即可起步",而非要求 5 个齐备。目标:`git clone` → 首条成功 dispatch ≤ 3 分钟。
- **为什么:** P0 带来的流量若撞上 >30 分钟、要 5 个账号的安装墙,会原地流失。这是把 demo 看客转化为外部用户的唯一技术杠杆,且与 v1.2 进度链互不阻塞。
- **验证信号:** install → 首次成功 dispatch 转化率(此前为 0,需先埋这个点);7 天内是否有第 2 次 dispatch(留存)。
- **成本:** **M**

**P2 — 定向招募 5-10 个跑多 CLI 的开发者,埋点统计"异构率"(host≠vendor 占比)**
- **做什么:** Phase C dogfood 不再只跑自己的任务;主动找画像 B 的人,采集 4 个 PMF 信号中最核心的**异构率**。这是 hopper 作为品类真伪的母命题指标。
- **为什么:** 现在连埋点采集渠道都没有(telemetry 只有本地 3 条)。没有这个数,商业化全是猜测。
- **验证信号:** 异构率 >0 且可复现 → 命题成立,可谈 v1.2 / 商业化;趋近 0 → 坦白这是 IP 资产不是生意,全力转 IP/内容路径。
- **成本:** **S-M**(主要是社群运营 + 轻量埋点)

**P3(条件触发)— 仅当 P2 异构率为正,才做 R09 generic stream-parser**
- **做什么:** v1.2 内唯一有采用价值的技术项:通用 vendor 的细粒度进度,兑现 dashboard/通知 的"派出去后看得见"价值。**明确砍掉/延后:R08 pipe+tee(为不存在的 10MB 负载加固)、R12 invariant 文档、R13 OpenCode parity(最窄宿主×最窄路径)、R11 留 v1.3。**
- **为什么:** 在采用信号为正之前,这是过度建设;为正之后,它是 dashboard 价值的兑现点。
- **验证信号:** 用户反馈"看不见进度"是否为真实抱怨。
- **成本:** **M(依赖 P2 结果解锁)**

---

## 6. 依赖优先 Roadmap(主轴=依赖,辅以时间)

```
═══════════════ NOW(本周,无依赖,可立即并行启动)═══════════════

[P0 demo GIF + 发帖] ──────────────┐  [依赖: 无 — 弹药已就位]
   (IP线 + 产品验证线交汇点)         │
                                    ├─→ 产生外部流量 / 第一个外部信号
[埋点基建: install→dispatch 转化、   │
 异构率、7日留存] ──────────────────┘  [依赖: 无;P1/P2 都要用,必须先建]


═══════════════ NEXT(NOW 之后,被 NOW 解锁)═══════════════

[P1 hopper init + single-vendor quickstart]
   [依赖: 埋点基建(才能量转化率); 软依赖 P0(有流量才值得做)]
        │
        ├─→ [一键安装 / npm publish]   [依赖: 无硬依赖,独立解锁分发,可与 P1 并行]
        │
        └─→ [first-dispatch DX 闭环]   [依赖: P1 + 引导式 auth]
                  │
                  ▼
[P2 招募 5-10 外部用户 + 采集异构率]
   [依赖: P1 闭环(否则用户跑不通); 埋点基建]
                  │
        ┌─────────┴──────────┐
   异构率 > 0               异构率 ≈ 0
        │                     │
        ▼                     ▼
   进入 LATER 技术线      【裁决分叉】转 IP/内容全力线:
                          停止协议建设,作者去写/去讲
                          "多 agent 编排方法论",
                          走 commercialization 路径 D(咨询/影响力)


═══════════════ LATER(仅当 P2 异构率为正才解锁)═══════════════

v1.0 ──→ [R08 pipe+tee]* ──→ [R09 stream-parser] ──→ [R10 capability metadata]
                                  ↑ v1.2 内唯一采用价值点        │
                                  [依赖: R08(硬卡)]            └─→ [R11 Codex app-server → v1.3]
* R08 可延后,仅为解 R09 前置;非 10MB 负载时不优先

[R12 invariant 文档] [R13 OpenCode parity] ── 砍 / 无限延后(叶子节点,服务最窄路径)


═══════════════ 四条线如何交织 ═══════════════
• IP线(P0)   = 点火,无依赖,本周必做,是所有线的流量源
• 产品线(P1) = 把 IP 流量转化为外部用户,依赖埋点
• 商业线(P2) = 用产品线的用户产出"异构率"这个母命题数据,决定全局分叉
• 技术线(LATER) = 被商业线的信号门禁锁住;在信号为正前一律不碰
```

**关键时间条件(硬性):** 仅 P0 有"本周"硬约束——因为它成本最低、是其余一切的流量源,拖延无任何收益。其余阶段由**依赖与信号门禁**驱动,而非日历。

---

## 7. 最大风险 + 反对意见(保留 skeptic 原刃,不洗白)

**最狠的反对意见(原样保留):**
> "你花了 434 个测试和 N1/N2 双重审查纪律,去守护一个 0 外部用户的不变量——这不是工程严谨,是用 craftsmanship 替代 distribution 来逃避'没人要'这个真相。" —— skeptic
> 补充硬证据:① 工具唯一的工作负载是自己(hopper 造 hopper),是 feature 的 self-test 不是 product 的 demand;② Claude Code 原生 + 50 行脚本可吃掉 hopper 75-85% 的价值,剩下没被吃掉的"AGENTS.md 跨 host 等价路由"恰恰是 0 个外部用户要求过的抽象;③ no-retry/no-fallback 在你自己的数据里已经导致 1/3 异构结果静默丢失(kimi 超时归零 / agy auth fail / copilot 伪造 review),"极简哲学"实质是把可靠性外包给了用户的注意力。

**这构成三个最大风险:**

| 风险 | 严重度 | 对冲措施 |
|---|---|---|
| **R1: "没人要"——核心命题对外部就是伪需求** | 致命 | P0+P2 在 1-2 周内用近零成本证伪/证实。**预先承诺信号阈值**(异构率≈0 / demo 回复 <2 问"how to dispatch")就坦白转 IP 路径,不再 commit 代码。这把"逃避真相"变成"主动求证真相"。 |
| **R2: 被原生能力 + 脚本吃掉 75-85%** | 高 | 不与原生正面竞争;把叙事收窄到原生吃不掉的那 15-25%——**异构分派 + 跨 host 等价 + 文件协议可审计**。同时承认:这个差异点的 TAM 是窄缝,故定位为 IP 而非生意(见判断二)。 |
| **R3: no-retry 静默丢结果,生产不可靠** | 中(对 demo 无害,对真实采用致命) | 不破坏 single-spawn 不变量,但**终态必须显式可见**:失败/伪造的 handoff 要在 dashboard/toast 红色高亮,而非埋在 frontmatter 里要人肉捉假。这是 R09 之外唯一值得在 LATER 做的可靠性投入。 |

**对作者最逆耳但最该听的一句(裁决保留):** 你最稀缺的资产不是 hopper 的代码,是"你能把 CLI 层多厂商编排讲清楚"这件事。把守护不变量的精力,这周就转去录那条 demo、发那条帖、找那 10 个用户。**找得到——hopper 有机会从 feature 长成 product;一周找不到 1 个——IP 价值不在 hopper 本身,在你的表达里,那就全力去写去发,这同样 100% 命中你的真目标 A。两种结果都是赢,唯一的输法是继续在 0 反馈下 commit 第 435 个测试。**

---

## 附:这份分析与当前 Phase C 的衔接

当前项目正处于 Phase C(dogfood telemetry)。本战略文档的 P2 直接改写了 Phase C 的内容:
- **原 Phase C**:被动观察自己跑的任务,采集 8 个技术指标决定 v1.2。
- **改写后 Phase C**:主动招募 5-10 个外部画像 B 用户,核心指标收敛为**异构率**(host≠vendor 占比),作为 v1.2 是否启动的信号门禁。
- `tools/dogfood-snapshot.mjs` 已能采集 `by_vendor` 分布;需补一个 `host` 维度埋点(dispatch 时记录 `HOPPER_HOST_VENDOR`)才能算异构率。这是 P2 埋点基建的最小增量。

## Revision Log

| 版本 | 日期 | 改动 |
|---|---|---|
| v1.0 | 2026-05-23 | 初版战略综合(5-lens workflow + 综合裁决) |
