# 模型选择器与运行时证明设计

**状态：** 已批准的第一阶段设计
**日期：** 2026-07-21
**范围：** `hopper-dispatch` 的模型目录、后台 handoff、`--models`、`--setup`、`--result` 与 `--progress` 的可观测性；不改变 vendor 路由或一次 spawn 合同。

## 决策摘要

`--model` 不再被解释为“必然等于最终真实模型 ID”的单一字符串。Hopper 将分别记录用户请求的选择器、该选择器的语义类型、vendor 实际报告的模型以及每项证据的来源。Claude 的 `fable`、`sonnet`、`opus`、`haiku` 是合法的选择器/别名；它们成功运行且运行结果可枚举真实模型时，结果为 `alias-resolved`，而不是因为别名不等于真实 ID 而报错。只有用户显式请求 concrete model ID、且权威运行时元数据明确表明实际模型不包含该 ID 时，才报告 `mismatch`。

模型目录、二进制可用性与每次运行的模型证明是不同时间点的证据，必须分开保存和展示。目录可来自 live CLI、配置文件或 adapter 维护的别名清单；运行时证明只来自该次 vendor result。任何缺失、错误或无法安全归因的元数据必须诚实标为 `unknown`/`unverified`，不能推测映射。

## 背景与现有证据

- 后台任务目前把用户传入的模型写入 `output.md` frontmatter 的 `model` 字段；未提供时写入 `(vendor default)`。该 frontmatter parser 只支持标量，因此数组不能直接作为 YAML array 写入。
- 每项后台任务已经有三个 file-backed 载体：`<task>-output.md`、原始 `<task>-output.log` 和 `<task>-progress.jsonl`。progress JSONL 可以安全保存结构化数组，但其既有“一次 terminal event”不变量必须保留。
- probe cache 已保存 `models`、`models_source`、`probed_at`、`introspection_supported` 与内部 `binary_path`。`--probe` 是显式诊断操作；dispatch 路径不得自动 probe、retry 或 fallback。
- Claude adapter 的 `--model` 接受 `fable`、`sonnet`、`opus`、`haiku` 等 alias，也接受完整的 Claude model ID。`claude -p --output-format json` 的完成 envelope 可提供 usage/运行时元数据，但当前结果协议没有把模型选择与实际模型的关系固化为一项 attestation。
- OpenCode probe 可通过 `opencode models` 枚举 provider/model 形式的目录；其调用参数是 provider/model concrete ID。Kimi 可能只能从 `kimi provider list --json` 或本地配置得到已配置 alias；binary 不在 PATH 时仍可能得到 config-only 结果。
- 既有 CLI 直接显示 cache 的 `binary_path`。完整本机路径会暴露用户名、安装布局或受管目录，第一阶段的公开展示必须改为安全状态和 basename。

这些事实说明“已请求的字符串”“已缓存的可选名称”“运行时实际使用的模型”不能互相替代。

## 目标

1. 对每次 dispatch 保存 `requested_selector`、`selector_kind`、`observed_models` 及可审计的来源，令用户能区分请求、目录与运行时事实。
2. 把 Claude alias 作为一等选择器：`fable`、`sonnet`、`opus`、`haiku` 不要求与 observed actual model ID 字面相等。
3. 对 OpenCode 等 concrete-only 选择器进行精确、保守的比较；不把 provider/model 请求悄悄改写为其他模型。
4. 在 `--models`、`--setup`、`--result` 与 `--progress` 中一致展示目录来源、缓存新鲜度和 binary availability，同时避免泄露完整 PATH。
5. 保持状态 file-backed、读取旧 handoff/cache 兼容、一次 vendor spawn、无自动 probe/retry/fallback 的现有合同。
6. 为 future adapters 提供声明式的 selector 分类和 runtime metadata extractor，不依赖全局字符串猜测或可腐化的 alias-to-ID 映射表。

## 非目标

- 不改变用户所选 vendor、model selector、reasoning effort、sandbox 或 queue 路由。
- 不验证供应商是否真正遵守了未在其 result 中报告的后端路由；attestation 是可观测证据，不是对远端服务的加密证明。
- 不向每次 dispatch 追加目录探测，也不因 cache stale 而触发额外 vendor subprocess。
- 不把 alias 预先硬编码为单一真实 model ID，不把运行时 actual ID 反写成下一次的 `--model`。
- 不在本阶段实现 macOS/Linux 实机 process-group/signal/stdio CI，或 remote resumable-session cancel；两项均是独立后续阶段。
- 不迁移、重写或删除已有 handoff、raw log、progress JSONL 或 probe cache。

## 术语与证据边界

| 名称 | 含义 | 可接受来源 |
| --- | --- | --- |
| `requested_selector` | 用户在 `--model` 中给出的原始、经安全存储的选择器；未提供时为 `null`。 | dispatch argv/AdapterOpts |
| `selector_kind` | adapter 声明的 `alias`、`concrete` 或 `auto`。`auto` 表示没有显式 selector。 | adapter metadata，而非正则猜测 |
| catalog model | probe/cache 所列的可选择名称；它可以是 alias，不能自动当作 actual ID。 | live CLI、config、adapter alias declaration |
| `observed_models` | 该次完成 result 中 vendor 明确报告、去重且保持首次出现顺序的实际模型标识列表。 | 当前任务 terminal vendor result |
| catalog source | 目录证据类别及安全说明。 | probe cache snapshot |
| binary availability | probe 时 binary 为 `present`、`missing` 或 `unknown`；它不是 auth 或模型可用性的代名词。 | resolver/probe result |
| resolution | Hopper 对 selector 与 observed evidence 的保守分类。 | 本设计定义的优先级 |

`requested_selector` 与 `observed_models` 均按 vendor 声明的 canonicalizer 比较。canonicalizer 仅能做文档化的无损归一化（例如 trim、已声明的 provider casing 规则）；不得把 alias 展开为 concrete ID，也不得跨 vendor 复用规则。原始 selector 永远保留用于审计和显示。

## 目录枚举与来源

### Catalog source contract

每个 probe result 保留既有 `models` 与 `models_source`，并增加一个可序列化的 catalog provenance 结构。其逻辑字段如下：

```json
{
  "source_kind": "cli-catalog | config | adapter-aliases | static | unavailable | error",
  "source_label": "安全、面向用户的来源描述",
  "observed_at": "2026-07-21T00:00:00.000Z | null",
  "freshness": "fresh | stale | unknown",
  "binary_availability": "present | missing | unknown",
  "binary_basename": "claude | opencode | kimi | null"
}
```

`source_label` 是来源描述，不是绝对文件路径、完整 PATH 或原始 stderr。读取 configuration 时可显示“configured aliases”，但不得显示 home directory、config filename 或 provider credential。`binary_basename` 必须取已经解析的 command basename，且不能从未验证的自由文本直接回显。

### 动态枚举的优先顺序

1. Vendor 提供可运行的 catalog command 时，`--probe` 使用该 command；例如 OpenCode 的 `opencode models`。此类结果为 `cli-catalog`，并用 probe 完成时间计算 freshness。
2. Vendor 仅暴露本地配置或 provider list 时，保留该列表及其 `config`/`config-only` 证据。Kimi 的配置 alias 不宣称为完整远端目录，也不意味着 binary 一定可执行。
3. Vendor 没有可用 catalog command、但 adapter 能可靠列出 vendor 文档定义的合法 selector 时，显示为 `adapter-aliases`。Claude 的 `fable`、`sonnet`、`opus`、`haiku` 在此层是选择器，不是 actual-ID 映射。
4. 无安全来源、命令失败或解析不可信时，目录条目为空并明确显示 `unavailable` 或 `error`；不回退到猜测的 model list。

`hopper-dispatch --models <vendor>` 是上述 cache 的读取视图。`--setup [--deep]` 可使用同一 provenance 表达 readiness 和 freshness，但只有用户显式要求的 probe/deep 路径可以刷新 cache。正常 dispatch 仅捕获当时的 cache snapshot。

## Selector 分类

adapter 必须为可传入 `--model` 的选择器定义分类函数或元数据，而不是在 dispatcher 中根据字符串格式推测。

| Vendor 场景 | `selector_kind` | 比较规则 |
| --- | --- | --- |
| Claude `fable`、`sonnet`、`opus`、`haiku` | `alias` | 可运行且 observed actual model 非空即 `alias-resolved`；不要求字面相等。 |
| Claude 明确完整 ID，例如 `claude-sonnet-4-6` | `concrete` | 与 observed actual IDs 做 canonical exact comparison。 |
| OpenCode `provider/model` | `concrete` | provider/model 与 observed actual IDs 做 canonical exact comparison。 |
| Kimi config alias | `alias` | 若 runtime result 没有可用 actual ID，保留 config-only 证据，不虚构解析。 |
| 未传 `--model` | `auto` | `requested_selector=null`；不比较默认选择，仍可记录 observed models。 |

adapter 可以把未来 vendor 特有的合法 alias 声明为 `alias`，但不得把任意未知自由文本乐观地标为 alias。未知 selector 的分类应随 vendor contract 保守地为 `concrete`；CLI validation 的既有行为不变。

## 运行时 attestation 与 resolution status

### observed model extraction

每个 adapter 的 `parseResult` 继续负责成功/失败判断，并可选返回结构化 `modelAttestation`：

```js
{
  observedModels: ["vendor-reported-actual-id"],
  source: "claude.result.modelUsage",
  observedAt: "2026-07-21T00:00:00.000Z"
}
```

只有完成 envelope 中稳定、结构化的模型字段可以进入 `observedModels`。从 prompt、human-readable prose、billing 文案、PATH、日志文件名或模型目录反推的名称一律不得进入。多个 vendor 报告的模型按原始首次出现顺序去重；这保留了一个任务可能使用多项模型的事实。无法读取、字段格式漂移、或只有非结构化文字时返回空列表和安全的 error code，而非抛出或编造 ID。

### 互斥状态与优先级

终态 handoff 的 `resolution_status` 必须恰为以下五种之一。判定按表中顺序短路，前一行命中即停止：

| 优先级 | 条件 | 状态 | 含义 |
| ---: | --- | --- | --- |
| 1 | `selector_kind=concrete`，且有权威 observed models，但 canonical exact comparison 没有命中 requested selector | `mismatch` | 证据明确与用户的 concrete 请求不符。 |
| 2 | `selector_kind=concrete`，且至少一个 observed model 与 requested selector canonical exact match | `exact` | concrete 请求被运行时元数据精确证明。 |
| 3 | `selector_kind=alias`，且有至少一个权威 observed model | `alias-resolved` | 合法 alias 成功解析到 vendor 实际报告的模型。 |
| 4 | 没有可用于上述比较的 runtime model，且 catalog snapshot 的 introspection 为 `config-only` | `config-only` | 只有配置级选择器证据；不能宣称 actual model。 |
| 5 | 其余情况，包括 `auto`、无 result model、未知 catalog、解析错误或非结构化输出 | `unverified` | Hopper 没有足以证明 selector-to-actual 关系的证据。 |

因此 `mismatch` 不由 alias 产生，alias 更换到新版本也不会造成 false mismatch。`auto` 即使观察到 actual model，也使用 `unverified`，并在 detail 中说明“没有显式 selector 可比较”；observed value 仍然显示。`config-only` 低于真实 runtime evidence：若 Kimi 将来提供了 alias 的 runtime actual ID，则 alias 可成为 `alias-resolved`。

`mismatch` 是诊断，不自动重派、降级、阻止完成状态或改写 result。它在 `--result` 和 terminal progress 中以明确 warning 呈现；操作员决定是否发起一个新的独立 dispatch。

## File-backed 数据设计

### `output.md` frontmatter

保持现有 `model` 字段，确保旧消费者不变；新增字段均为 additive。由于当前 frontmatter 只支持 scalar，逻辑上的 `observed_models` 以 JSON string 保存在 `observed_models_json`，读取层输出规范化的 `observed_models: string[]`。不得在该 frontmatter 写 YAML array/object。

```yaml
---
model: "fable"                         # 兼容字段，保留既有语义
requested_selector: "fable"
selector_kind: "alias"
catalog_source_kind: "adapter-aliases"
catalog_source_label: "Claude documented selectors"
catalog_observed_at: "2026-07-21T00:00:00.000Z"
catalog_freshness: "fresh"
binary_availability: "present"
binary_basename: "claude"
observed_models_json: "[\"claude-opus-4-6\"]"
model_attestation_source: "claude.result.modelUsage"
model_attestation_observed_at: "2026-07-21T00:03:12.000Z"
resolution_status: "alias-resolved"
resolution_detail: "runtime-models-observed"
---
```

在任务启动时写入 requested、catalog 和 binary snapshot；`observed_models_json`、attestation 和 resolution 字段只在 terminal writer 写入。这样 in-progress 文件不会伪造结论。未提供 `--model` 时写入 `requested_selector: null` 与 `selector_kind: "auto"`。无 observed model 时终态写入 `observed_models_json: "[]"`，并使用相应 `config-only` 或 `unverified` status。

所有 frontmatter reader 必须容忍这些字段缺失、`observed_models_json` 不是合法 JSON、或数组中含非 string：读取时降级为空数组并显示 `unverified`，不得使 `--result` 或 dashboard 崩溃。新 writer 不得把原始 vendor result、完整 stderr 或 raw path 写入上述字段。

### progress JSONL

不新增第二个 terminal event，也不以 attestation 刷新 idle activity。既有唯一 terminal event 可包含以下 optional fields，JSONL 中 `observed_models` 保持真正 array：

```json
{
  "kind": "terminal",
  "terminal": true,
  "requested_selector": "fable",
  "selector_kind": "alias",
  "observed_models": ["claude-opus-4-6"],
  "model_attestation_source": "claude.result.modelUsage",
  "resolution_status": "alias-resolved"
}
```

`--progress` 优先读 output frontmatter 的启动 snapshot 与最后 terminal event 的 runtime values；终态 event 可用于恢复或交叉检查。若两者不一致，frontmatter 是该任务当前 canonical handoff，CLI 显示安全的 `attestation-conflict` detail 并保持 `unverified`，而不是选取较有利的一方。

### Probe cache

cache 继续是可替换的 JSON 文件。新 provenance fields 对旧 cache 可选，且旧 `models`/`models_source` 不改名。刷新 cache 的唯一机制仍是显式 `--probe` 或已经允许的 `--setup --deep`。cache migration 是 read-compatible：旧 entry 渲染为 `source=unknown`、`freshness=unknown`、`binary_availability=unknown`，直到一次新的 probe 覆盖它。

每次 dispatch 把可用 cache provenance snapshot 复制进自己的 output frontmatter，保证历史 `--result` 不会因之后 refresh 变更证据。probe cache 不是某次执行的 actual-model record。

## CLI 展示合同

| 命令 | 必须显示 | 禁止显示 |
| --- | --- | --- |
| `--models [vendor]` | catalog entries、source kind/label、cache timestamp/freshness、binary `present|missing|unknown` 与 basename | 完整 `binary_path`、完整 PATH、config absolute path、credential/provider secrets |
| `--setup [vendor]` | 同一 binary/source/freshness 摘要；`config-only` 明确表示“configured aliases, not live catalog” | 把 config-only 标为 live 或 installed/auth proof；完整路径 |
| `--result <task>` | requested selector、kind、observed actual models、resolution status、attestation source/time、启动时 catalog/binary snapshot | 原始 result envelope、完整 raw log、完整路径；除非既有 `--full` 合同明确请求原始 output |
| `--progress <task>` | in-progress 时 requested selector/kind 与启动 snapshot；完成后加 terminal attestation | 将 heartbeat 当作 attestation、完整路径、未完成时的 resolution conclusion |

建议的紧凑文本形态：

```text
Model: requested=fable (alias) | observed=claude-opus-4-6
Resolution: alias-resolved (source: claude.result.modelUsage)
Catalog: adapter-aliases, fresh | binary: present (claude)
```

`models_source`、binary 与 runtime attestation 都可缺失；展示必须以 `unknown`、`unavailable` 或 `unverified` 明说，不将空值隐藏为成功。

## Privacy、错误与未知状态

- 输出仅允许安全 basename、短 source kind/label、标准状态枚举、模型 selector/ID 和 ISO timestamps。绝不公开绝对路径、PATH、home directory、config 内容、environment variable、token、session secret 或完整 raw stderr。
- probe 的 spawn/parse failure 以 bounded error code 或短状态记录，例如 `probe-failed`、`catalog-unavailable`、`runtime-model-metadata-absent`。详细诊断仍可留在受现有访问边界保护的 raw log，公开摘要不复制敏感文本。
- 运行时 metadata 声称多个模型时，Hopper 只记录 vendor 给出的值，不推断 primary、费用归属或 fallback 原因。
- cache stale 不使历史 attestation 失效；它只降低 catalog snapshot 的 freshness。runtime evidence 缺失时不得由 stale/fresh catalog 推导 resolution。
- malformed new fields、future schema fields、未知 source kind 或未知 resolution string 都不得中断读取；它们规范化为 `unknown`/`unverified` 并保留旧 result 行为。

## 实施边界与分阶段 rollout

### Phase 1：合同与数据路径

1. 在 adapter contract/types 中加入 selector classification、可选 runtime `modelAttestation` 和安全 catalog provenance normalizer。
2. 在 background startup/terminal writer 中添加 additive frontmatter fields；扩展 terminal JSONL optional fields，但保持单 terminal event。
3. 更新 Claude result parser，优先读取其稳定 `modelUsage`/等价结构化运行时字段；没有此字段即真实地为空。更新 OpenCode parser 的 concrete runtime metadata extraction；Kimi 只保留可证实的 config-only evidence，直至其 result 有稳定实际模型字段。
4. 在 `--models`、`--setup`、`--result`、`--progress` 使用同一 renderer，删除公开的 full `binary_path` 输出。内部 resolver 仍可用受控绝对路径执行 binary。
5. 为 catalog cache 加入 provenance 的 read-compatible normalizer；不做自动 refresh。

### Phase 2：小范围启用与审计

先启用 Claude、OpenCode 与 Kimi 三条路径。以 fixture-based tests 验证稳定 result schema，保留 raw log 作为 parse drift 的有限诊断证据。其他 adapter 继续输出 `unverified`，直至各自有明确 selector 和 runtime metadata 合同。

### Phase 3：文档与兼容验证

更新 CLI help/cookbook、dashboard API/rendering 和 vendor capability notes，使其使用同一词汇。旧 handoff/cache、缺少 binary 的机器、Windows path resolution 及受限 account 必须保持可读且不泄密。

rollout 不要求 rewrite history，不改变 package/lock，不发布或 push。功能默认为 additive observability；现有任务完成/失败的 vendor status 逻辑不依赖 resolution status。

## 测试矩阵

| 类别 | 场景 | 必要断言 |
| --- | --- | --- |
| Claude alias | request `fable`，runtime `modelUsage` 枚举 `claude-*` | `selector_kind=alias`、observed array 保留、`alias-resolved`，不产生 mismatch。 |
| Claude concrete exact | request full `claude-*` ID，runtime 同 ID | `exact`。 |
| Claude concrete mismatch | request full ID，runtime 明确不同 ID | `mismatch`，任务仍按 vendor 成功终态完成，无 retry/fallback。 |
| Claude absent metadata | alias 成功但 envelope 无模型字段 | `unverified`，不由 usage、prose 或 knownGood 推断。 |
| OpenCode concrete | request `provider/model`，runtime 同/不同 ID | 分别为 `exact`/`mismatch`；比较仅用 adapter canonicalizer。 |
| Kimi config-only | binary missing，配置枚举 alias，且 runtime 无 actual ID | `config-only`、binary missing、无完整 config path 泄露。 |
| Kimi future runtime evidence | config alias 且 runtime 返回 actual ID | `alias-resolved` 优先于 config-only。 |
| Auto | 未传 `--model`，有或无 observed model | `requested_selector=null`、kind `auto`、status `unverified`，observed value仍可见。 |
| Multi-model | runtime 返回重复或多个 IDs | stable first-seen de-dup，JSONL array 与 frontmatter JSON string round-trip 一致。 |
| Corrupt/old data | 缺少新 fields、坏 `observed_models_json`、旧 cache | result/progress 不崩溃，降级 `unverified`/`unknown`，旧字段保持可读。 |
| Cache/probe semantics | cache stale、probe error、config source、CLI catalog | 不自动 spawn；freshness/source/binary 正确且未公开 full path。 |
| Rendering/privacy | 四个 CLI surface 和 dashboard fixture | 仅显示 allowed safe fields；断言不存在 absolute path、home path、PATH 或 secret-like content。 |
| Protocol invariants | background terminal write | 一次 vendor spawn、仅一个 terminal JSONL event、attestation 不影响 idle/ceiling timeout。 |

测试必须使用 inert fixture JSON、temporary cache 和 fake binary resolver；不得依赖真实账号、真实 model entitlement 或用户目录中的 Kimi/Claude config。每个 adapter parser test 应同时覆盖“metadata present”“metadata absent”“malformed metadata”三种输入。

## 替代方案与拒绝理由

1. **将 `fable`/`sonnet` 直接比较为某个 hardcoded Claude ID。** 拒绝：alias 可随 account、地区、产品策略或发布轮换，硬编码会产生过期的 false mismatch。
2. **只保存用户请求，不收集 runtime metadata。** 拒绝：无法发现 concrete routing 偏差，也无法证明 alias 实际解析到什么。
3. **将任何成功 alias 当作 exact。** 拒绝：这混同 selector 和 actual ID，且丢失透明性；正确状态是 `alias-resolved`。
4. **将任何 cache 命中当作运行时证明。** 拒绝：cache 是不同时间、不同证据来源，Kimi config-only 尤其不能证明远端执行模型。
5. **每次 dispatch 自动 probe 以获得最新模型。** 拒绝：违反 one-spawn/no-auto-probe 合同，增加成本、延迟和凭据/网络失败面。
6. **公开完整 binary path 以方便排查。** 拒绝：泄露本机用户名和安装布局；安全 basename 与 source 足以指导普通诊断，深度信息保留在受控本地 raw diagnostics。
7. **将所有 adapter 立即升级为 runtime attestation。** 拒绝：不同 CLI result schema 的证据质量不同。先覆盖 Claude/OpenCode/Kimi，其他 adapter 宁可 `unverified`。

## 延期的独立阶段

以下工作不属于 model selector attestation 的实施或验收条件，需各自有独立设计、平台执行证据和测试计划：

1. **POSIX CI lifecycle stage：** 在真实 macOS/Linux runner 执行 process-group、signal、child/stdio close 与 timeout cleanup 测试，覆盖当前 Windows 静态审查无法证明的行为。
2. **Vendor remote cancel stage：** 仅对有受支持 resumable session/cancel API 的 vendor 设计显式远端取消；仍不能把本地 process-tree kill 误称为远端 session cancel。

## 剩余风险

- Vendor 可能不返回模型 metadata、改变 envelope 或报告多个内部模型；这会得到 `unverified` 或多项 observed value，而不是错误的精确性承诺。
- Claude alias 的可用性和 actual routing 可受账户 entitlement 影响；catalog 可显示合法 selector，但不能保证本账户的远端可用性。
- Kimi config-only 可证明本地 alias 配置，不能证明 binary 可运行、登录状态或 provider 远端目录完整性。
- 缓存与 handoff 的并发写入需复用现有原子 cache/frontmatter 规则；attestation fields 不得引入第二个 writer 或多 terminal event。
- 将 full path 从公开 UI 移除后，少数深度排障需要本地受控日志；该取舍优先保护用户环境信息。

本设计的成功标准是：用户能看到“我选择了什么、该字符串是 alias 还是 concrete、vendor 本次实际报告了什么、这些信息来自哪里以及 Hopper 能否证明它们的关系”，同时 Hopper 在证据不足时明确保留不确定性。
