# 模型选择器与运行时证明设计

**状态：** 已批准的第一阶段设计
**日期：** 2026-07-21
**范围：** `hopper-dispatch` 的模型目录、后台 handoff、`--models`、`--setup`、`--capabilities`、`--check-model`、`--result`、`--progress` 与 dashboard vendor inventory 的可观测性；不改变 vendor 路由或一次 spawn 合同。

## 决策摘要

`--model` 不再被解释为“必然等于最终真实模型 ID”的单一字符串。Hopper 将分别记录用户原始请求的选择器、实际传给 adapter 的 effective selector、该 effective selector 的语义类型、vendor 实际报告的模型以及每项证据的来源。Claude 的 `fable`、`sonnet`、`best`、`default`、`opusplan`、`[1m]` 等形式是否为合法 alias，必须由当次动态 capabilities/adapter metadata 枚举决定；它们成功运行且运行结果可枚举真实模型时，结果为 `alias-resolved`，而不是因为 alias 不等于真实 ID 而报错。只有实际生效的 selector 被 metadata 明确分类为 concrete、且权威运行时元数据明确表明实际模型不包含该 ID 时，才报告 `mismatch`。

模型目录、二进制可用性与每次运行的模型证明是不同时间点的证据，必须分开保存和展示。目录可来自 live CLI、配置文件或 adapter 维护的别名清单；运行时证明只来自该次 vendor result。任何缺失、错误或无法安全归因的元数据必须诚实标为 `unknown`/`unverified`，不能推测映射。

## 背景与现有证据

- 后台任务目前把用户传入的模型写入 `output.md` frontmatter 的 `model` 字段；未提供时写入 `(vendor default)`。该 frontmatter parser 只支持标量，因此数组不能直接作为 YAML array 写入。
- 每项后台任务已经有三个 file-backed 载体：`<task>-output.md`、原始 `<task>-output.log` 和 `<task>-progress.jsonl`。progress JSONL 可以安全保存结构化数组，但其既有“一次 terminal event”不变量必须保留。
- probe cache 已保存 `models`、`models_source`、`probed_at`、`introspection_supported` 与内部 `binary_path`。`--probe` 是显式诊断操作；dispatch 路径不得自动 probe、retry 或 fallback。
- Claude adapter 的 `--model` 接受 `fable`、`sonnet`、`opus`、`haiku` 等 alias，也接受完整的 Claude model ID。`claude -p --output-format json` 的完成 envelope 可提供 usage/运行时元数据，但当前结果协议没有把模型选择与实际模型的关系固化为一项 attestation。
- OpenCode probe 可通过 `opencode models` 枚举 provider/model 形式的目录；其调用参数是 provider/model concrete ID。Kimi 可能只能从 `kimi provider list --json` 或本地配置得到已配置 alias；binary 不在 PATH 时仍可能得到 config-only 结果。
- `cli/src/model-normalize.js` 现有比较可去除 provider prefix、分隔符并对 provider/model 进行 tail match；`model-check.js` 与 dispatch 都依赖它。它适合 pre-dispatch selector 规范化，却不能被另一套 adapter canonicalizer 并行替代，更不能把 lossy 匹配当作 runtime identity 证明。
- `hopper-runner` 目前先 append terminal JSONL event，后写 terminal frontmatter；两次写入之间的 reader 可看到不完整终态。`OPTIONAL_EVENT_FIELDS` 目前也会丢弃未知的 attestation fields。
- `--result` 对缺失 `status` 仍会直接调用 `toUpperCase()`；`--progress` 对 frontmatter/read failure 直接退出。旧 handoff、手写 handoff 或中途写入文件需要可诊断的降级读路径。
- cache 仍为 schema v1，version mismatch 目前使 cache 完全不可读；`setVendorCache()` 以新 entry 覆盖同 vendor entry。provenance 必须是 v1 内的 optional additive field，不能为本设计无故 bump 或丢弃旧数据。
- 既有 `--capabilities` 会打印 cache 的 `binary_path` 和 raw `notes`；dashboard API 将它们作为 `binaryPath`/`notes` 返回。Kimi config fallback 又会把绝对 config path、原始 stderr、provider 名称和 parse error 放进 `models_source`/`notes`，因此所有公开 surface 都必须使用安全投影。

这些事实说明“已请求的字符串”“已缓存的可选名称”“运行时实际使用的模型”不能互相替代。

## 目标

1. 对每次 dispatch 保存 raw `requested_selector`、`effective_selector`/source、`selector_kind`、`observed_models` 及可审计的来源，令用户能区分请求、policy 生效值、目录与运行时事实。
2. 把 Claude 动态 metadata 枚举的 alias 作为一等选择器：这些形式不要求与 observed actual model ID 字面相等。
3. 对 OpenCode 等 concrete-only 选择器进行精确、保守的比较；不把 provider/model 请求悄悄改写为其他模型。
4. 在 `--models`、`--setup`、`--capabilities`、`--check-model`、`--result`、`--progress` 与 dashboard 中一致展示目录来源、缓存新鲜度和 binary availability，同时避免泄露完整 PATH、config path、raw stderr 或 auth 细节。
5. 保持状态 file-backed、读取旧 handoff/cache 兼容、一次 vendor spawn、无自动 probe/retry/fallback 的现有合同。
6. 为 future adapters 提供声明式的 selector 分类和 runtime metadata extractor；所有比较收口到一个全局、按 vendor 分支的权威边界，不维护 alias-to-ID 映射表，也不允许 adapter 自带第二套 canonicalizer。

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
| `requested_selector` | 用户在 `--model` 中给出的原始、经安全存储的选择器；未提供时为 `null`。它只用于审计与展示，绝不由 observed value 回填。 | dispatch argv |
| `effective_selector` | policy/default resolution 后实际传给 adapter 的 selector；若实际让 vendor 选默认值则为 `null`。它是唯一可被 runtime comparison 使用的 selector。 | dispatch policy resolution 后的 AdapterOpts |
| `effective_selector_source` | `user-argv`、`policy` 或 `vendor-default`，说明 effective selector 的 provenance。 | dispatch policy resolution |
| `selector_kind` | effective selector 的 `alias`、`concrete`、`auto` 或 `unknown`。`auto` 表示 effective selector 为 `null`；`unknown` 表示显式 selector 不能由当次 metadata 安全枚举/分类。 | adapter 的 declarative/dynamic selector metadata，而非正则猜测 |
| catalog model | probe/cache 所列的可选择名称；它可以是 alias，不能自动当作 actual ID。 | live CLI、config、adapter alias declaration |
| `observed_models` | 该次完成 result 中 vendor 明确报告、去重且保持首次出现顺序的实际模型标识列表。 | 当前任务 terminal vendor result |
| catalog source | 目录证据类别及安全说明。 | probe cache snapshot |
| binary availability | probe 时 binary 为 `present`、`missing` 或 `unknown`；它不是 auth 或模型可用性的代名词。 | resolver/probe result |
| resolution | Hopper 对 selector 与 observed evidence 的保守分类。 | 本设计定义的优先级 |

原始 selector 永远保留用于审计和显示；policy 若替换、补充或清空 selector，必须同时保留 raw/effective 两值及 source。runtime resolution 一律比较 `effective_selector`，从不比较 `requested_selector`；两者相同也不得因此省略 provenance。adapter 只声明可枚举的 selector 分类和 runtime result 中可读取的 metadata path；无法枚举/分类的显式值为 `unknown`，而不是默认 `concrete`。adapter 不实现或调用独立的 ID 比较器。

## 唯一权威比较边界

`cli/src/model-normalize.js` 是 selector 和 model identity 比较的唯一权威模块，`cli/src/model-check.js`、`cli/src/dispatch.js`、probe reconciliation 与 attestation resolver 都必须调用它，不能复制或包裹一套 adapter-local canonicalizer。

该模块必须显式区分两个目的，避免现有 lossy 规范化越界：

1. **selector validation：** 复用当前 `normalizeModel`/`modelKeysMatch` 的 vendor-scoped 规则，允许 known-good 与 catalog 的兼容性匹配。这仅回答“此选择器是否在静态/缓存目录中可接受”，不声称本次运行使用了哪个模型。
2. **runtime attestation：** 使用同模块导出的独立 strict comparator，绝不调用、复用或间接包裹 `modelKeysMatch` 的 namespace strip/tail-match 路径。它只做 trim，以及该 vendor 明确声明为 case-insensitive 的完整 component 的 case folding；不得 strip provider prefix、namespace、分隔符，不得 tail-match、fuzzy-match 或把 alias 展开为 ID。Claude concrete ID 是一个 opaque、完整的 Claude ID，两个值必须在上述规范化后整体相同。OpenCode concrete ID 的 grammar 是显式 `provider/model`：两侧都必须可解析为恰好同一 normalized provider component 和同一 normalized model component；bare `model` 只可与 bare `model` 整体相等，永远不能与 `provider/model`、`namespace/provider/model` 或任何带 namespace 的 ID 相等。其他 vendor 必须先在 metadata 声明同样严格的 identity grammar；缺 grammar、额外 namespace、解析歧义或只有 bare/qualified 一侧时都为“不可比较”，而非 match。只有这个 strict path 能决定 concrete 的 `exact` 或 `mismatch`；不可比较或无证据只能为 `unverified`。

`model-check` 的 historical `verified` exit code 继续表示 curated known-good selector validation，以保护脚本兼容；它必须同时输出 `selector_valid=verified|catalog-only|not-found|effort-spliced` 与 `runtime_attestation=not-run`。因此 `--check-model` 的 JSON、文本和 capability note 都不得把 `verified` 解释成某次 dispatch 的 runtime proof。没有 spawn 的 check 永远不能产出 `exact`、`alias-resolved` 或 `mismatch`。

## 架构与数据流

```text
raw --model ──► requested_selector (audit only)
        │
        ▼
policy/default resolution ──► effective_selector + source (comparison input)
        │
        ▼
model-normalize.js (selector validation + strict runtime comparison boundary)
        │                 └── --check-model: selector_valid only, no runtime proof
        ▼
dispatch startup ── safe cache provenance snapshot ──► output.md frontmatter
        │
        ▼
adapter.parseResult() ── optional modelAttestation ──► runner / sync dispatch consumer
        │                                                   │
        │                                                   ▼
        │                                      shared terminal-attestation finalizer
        │                                                   │
        │                                                   ├── one terminal progress JSONL event
        │                                                   └── canonical terminal output.md frontmatter
        ▼
public cache projection ──► models/setup/capabilities/check-model/dashboard
canonical handoff reader ─► result/progress (finalizing-safe precedence)
```

`requested_selector` 从 argv 进入启动 snapshot；`effective_selector` 和 `effective_selector_source` 从 policy/default resolution 进入同一 snapshot，且仅前者用于审计、后者用于比较。catalog provenance 从已存在的 cache 只读进入 snapshot；不得触发 probe。runtime attestation 只从同一次 parsed vendor result 进入 shared terminal finalizer。后台 runner 与同步 dispatch 都必须调用同一 finalizer，并由它写入唯一 canonical terminal `output.md` frontmatter 与既有唯一 terminal JSONL event；不得由 sync path 手写另一套 resolution。读侧先确认 frontmatter terminal completeness，再把 JSONL 作为 supplementary evidence，避免两个文件的不同写入时刻被混同为一个原子事实。

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

`source_label` 是来源描述，不是绝对文件路径、完整 PATH 或原始 stderr。它来自 allowlisted label，例如 `OpenCode CLI catalog`、`Claude documented selectors`、`Kimi configured aliases`，而不是直接复用 `models_source`。读取 configuration 时只能显示 `Kimi configured aliases`，不得显示 home directory、config filename、`KIMI_CODE_HOME`、provider 名称或 credential。`binary_basename` 必须取已经解析的 command basename，且不能从未验证的自由文本直接回显。

probe 的 public `notes` 也必须变为短、枚举化的 diagnostic code/label；不得缓存或显示原始 stderr、auth/login 文案、provider 名称、parse exception、config path、binary path 或 environment value。需要保留 raw probe 诊断时，它不进入 cache、dashboard API 或任何 CLI summary。

### 动态枚举的优先顺序

1. Vendor 提供可运行的 catalog command 时，`--probe` 使用该 command；例如 OpenCode 的 `opencode models`。此类结果为 `cli-catalog`，并用 probe 完成时间计算 freshness。
2. Vendor 仅暴露本地配置或 provider list 时，保留该列表及其 `config`/`config-only` 证据。Kimi 的公开 source label 固定为 `Kimi configured aliases`；它不宣称为完整远端目录，也不意味着 binary 一定可执行。
3. Vendor 没有可用 catalog command、但 adapter 能可靠列出合法 selector 时，显示为 `adapter-aliases`。Claude 此列表必须来自动态 capabilities/adapter metadata；其中的 `fable`、`sonnet`、`best`、`default`、`opusplan`、`[1m]` 等值在此层是选择器，不是 actual-ID 映射。
4. 无安全来源、命令失败或解析不可信时，目录条目为空并明确显示 `unavailable` 或 `error`；不回退到猜测的 model list。

`hopper-dispatch --models <vendor>` 是上述 cache 的读取视图。`--setup [--deep]` 可使用同一 provenance 表达 readiness 和 freshness，但只有用户显式要求的 probe/deep 路径可以刷新 cache。正常 dispatch 仅捕获当时的 cache snapshot。

## Selector 分类

adapter 必须在其 model capability metadata 中为实际传入 `--model` 的 selector 进行分类，而不是在 dispatcher 中根据字符串格式推测。该 metadata 只分类，实际 comparison 仍完全由 `model-normalize.js` 执行。静态 adapter defaults 可以提供安全的下限，但 Claude 的分类必须以当次 dynamic capabilities/adapter metadata 为准，不能靠一张静态 alias-to-actual-ID 表或“未知即 concrete”的推断。

| Vendor 场景 | `selector_kind` | 比较规则 |
| --- | --- | --- |
| Claude metadata 枚举的 profile/alias（可包括 `fable`、`sonnet`、`best`、`default`、`opusplan`、`[1m]` 及未来枚举值） | `alias` | 可运行且 observed actual model 非空即 `alias-resolved`；不要求字面相等，也不允许硬编码到真实模型 ID。 |
| Claude metadata 明确列为完整 model ID，例如 `claude-sonnet-4-6` | `concrete` | 与 observed actual IDs 做 `model-normalize` strict runtime comparison。 |
| Claude capabilities 不可用、值不在可枚举 contract 中、或 metadata 未给分类 | `unknown` | 不运行 strict comparison，始终为 `unverified`；不得产生 false `mismatch`。 |
| OpenCode metadata 明确以 `provider/model` 形式传入和报告 | `concrete` | 两个 component 按 strict provider/model grammar 比较。 |
| Kimi config alias | `alias` | 若 runtime result 没有可用 actual ID，保留 config-only 证据，不虚构解析。 |
| 未传 effective selector（包括 policy 选择 vendor default） | `auto` | `effective_selector=null`；不比较默认选择，仍可记录 observed models。 |

Claude adapter 必须把动态 metadata 中“输入形式、分类和可接受语法”一并保存为本次分类的可审计基础，但 public handoff 只保存安全的 `selector_kind` 与 source，不保存 raw capability output。`fable`、`sonnet`、`best`、`default`、`opusplan`、`[1m]` 仅是必须覆盖的可枚举 fixture 形式，不是永恒有效的硬编码列表。任何 adapter 都不得把未知自由文本乐观地标为 alias 或 concrete；这种显式值为 `unknown`，CLI validation 仍按既有 selector-validation 合同报告。每个 adapter 的 metadata、其 parser 和 types contract 都要有 fixture test，防止新增 adapter 忘记声明 selector kind。

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

只有完成 envelope 中稳定、结构化的模型字段可以进入 `observedModels`。Claude 的唯一候选来源是 `claude -p --output-format json` 的 terminal completion envelope 中、adapter metadata 明确标为 actual-ID 的 `modelUsage` entry model field；该字段若只是 request echo、没有 model member、类型不符或 schema 未经 fixture 确认，Claude parser 不返回 `modelAttestation`。OpenCode 的唯一候选来源是其结构化 terminal result 中、adapter metadata 明确标为 actual identity 的 provider/model pair（以完整 `provider/model` 形式输出）；只出现 provider、只出现 bare model、request echo 或非稳定 event/text 时不组合、不猜测。两者都不得从 prompt、human-readable prose、billing 文案、PATH、日志文件名或模型目录反推名称。多个 vendor 报告的模型按原始首次出现顺序去重；这保留了一个任务可能使用多项模型的事实。无法读取、字段格式漂移、或只有非结构化文字时返回空列表和安全的 error code，而非抛出或编造 ID。

`ParsedVendorResult`/等价 adapter result type 必须把 `modelAttestation` 定义为 optional。明确数据流是：adapter 先从上述 structured envelope 解析为 `ParsedVendorResult.modelAttestation`；后台 `hopper-runner` 将该完整对象传入 shared terminal-attestation finalizer；同步 `cli/src/dispatch.js` 的 `runVendorTask` 也原样返回它并调用同一 finalizer；finalizer 才生成 terminal event 与 canonical output frontmatter。任何中间 consumer 只可透传，不能从 request、catalog 或 logs 合成该字段。失败 result 可省略该字段；消费者必须把省略规范化为无 runtime evidence，而不是因为可选字段不存在而 throw、伪造 `exact`/`alias-resolved`，或因 selector 未知而伪造 `mismatch`。

### 互斥状态与优先级

终态 handoff 的 `resolution_status` 必须恰为以下五种之一。判定按表中顺序短路，前一行命中即停止：

| 优先级 | 条件 | 状态 | 含义 |
| ---: | --- | --- | --- |
| 1 | `selector_kind=concrete`，且有权威 observed models，但严格 runtime comparison 没有命中 effective selector | `mismatch` | 证据明确与实际传入的 concrete selector 不符。 |
| 2 | `selector_kind=concrete`，且至少一个 observed model 与 effective selector strict runtime match | `exact` | concrete selector 被运行时元数据精确证明。 |
| 3 | `selector_kind=alias`，且有至少一个权威 observed model | `alias-resolved` | 合法 alias 成功解析到 vendor 实际报告的模型。 |
| 4 | `selector_kind` 为 `alias` 或 `concrete`、没有可用于上述比较的 runtime model，且 catalog snapshot 的 introspection 为 `config-only` | `config-only` | 只有配置级选择器证据；不能宣称 actual model。 |
| 5 | 其余情况，包括 `auto`、`unknown` selector kind、无 result model、未知 catalog、解析错误或非结构化输出 | `unverified` | Hopper 没有足以证明 selector-to-actual 关系的证据。 |

因此 `mismatch` 不由 alias 或 `unknown` selector kind 产生，alias 更换到新版本也不会造成 false mismatch。`auto` 即使观察到 actual model，也使用 `unverified`，并在 detail 中说明“没有显式 effective selector 可比较”；observed value 仍然显示。`config-only` 低于真实 runtime evidence：若 Kimi 将来提供了 alias 的 runtime actual ID，则 alias 可成为 `alias-resolved`。

### Resolution detail contract

`resolution_status` 与 `resolution_detail` 必须成对写入；detail 是受控枚举，不含 raw result、路径或 vendor prose。下表穷尽新 writer 可产生的组合，reader 遇到未知组合一律显示 `unverified`/`unknown`，不自行升级：

| effective selector / kind | runtime evidence | catalog evidence | status | detail |
| --- | --- | --- | --- | --- |
| non-null / `concrete` | strict match | any | `exact` | `concrete-runtime-exact` |
| non-null / `concrete` | strict non-match | any | `mismatch` | `concrete-runtime-mismatch` |
| non-null / `alias` | one or more observed IDs | any | `alias-resolved` | `alias-runtime-resolved` |
| non-null / `concrete` | absent/unparseable | `config-only` | `config-only` | `concrete-config-only-no-runtime` |
| non-null / `alias` | absent/unparseable | `config-only` | `config-only` | `alias-config-only-no-runtime` |
| non-null / `concrete` | absent/unparseable | other/unknown | `unverified` | `concrete-no-runtime-metadata` |
| non-null / `alias` | absent/unparseable | other/unknown | `unverified` | `alias-no-runtime-metadata` |
| non-null / `unknown` | any | any | `unverified` | `selector-kind-unknown` |
| null / `auto` | any | any | `unverified` | `no-effective-selector` or `policy-effective-default` |

当 policy 有意选择 vendor default 时，上表最后一行的 `requested_selector` 可以非空；它仍只是审计证据，不改变比较。格式损坏或严格 identity 歧义统一归入 `concrete-no-runtime-metadata`，除非未来受控 detail enum 专门细分；它绝不能被改写为 non-match。

`mismatch` 是诊断，不自动重派、降级、阻止完成状态或改写 result。它在 `--result` 和 terminal progress 中以明确 warning 呈现；操作员决定是否发起一个新的独立 dispatch。

## File-backed 数据设计

### `output.md` frontmatter

保持现有 `model` 字段，确保旧消费者不变；新增字段均为 additive。由于当前 frontmatter 只支持 scalar，逻辑上的 `observed_models` 以 JSON string 保存在 `observed_models_json`，读取层输出规范化的 `observed_models: string[]`。不得在该 frontmatter 写 YAML array/object。

```yaml
---
model: "fable"                         # 兼容字段，保留既有语义
requested_selector: "fable"
effective_selector: "fable"
effective_selector_source: "user-argv"
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
resolution_detail: "alias-runtime-resolved"
---
```

在任务启动时写入 raw requested、effective selector/source、catalog 和 binary snapshot；`observed_models_json`、attestation 和 resolution 字段只在 shared terminal finalizer 写入。这样 in-progress 文件不会伪造结论。未提供 `--model` 且 policy 未指定 selector 时写入 `requested_selector: null`、`effective_selector: null`、`effective_selector_source: "vendor-default"` 与 `selector_kind: "auto"`。无 observed model 时终态写入 `observed_models_json: "[]"`，并使用 resolution-detail contract 中相应的 `config-only` 或 `unverified` status。

`observed_models_json` 必须先以 JSON serializer 产生 JSON string，再由专用 YAML scalar encoder 以 quoted scalar 写入；encoder 必须转义引号、反斜杠、换行、控制字符、`:`、`#` 及 document-marker-like 内容，禁止 string interpolation、plain scalar 或 flow sequence。reader 只接受解析结果为 string 的 scalar，再 JSON parse 为全部 string 的 array；YAML flow-sequence、object、非 string member、截断/半写 scalar 或非法 JSON 一律降级为空数组。所有 frontmatter reader 必须容忍这些字段缺失、`observed_models_json` 不是合法 JSON、或数组中含非 string：读取时降级为空数组并显示 `unverified`，不得使 `--result`、`--progress` 或 dashboard 崩溃。`runResult` 必须把缺失/非法 `status` 规范为 display-only `unknown`，而不是调用 `undefined.toUpperCase()`；`runProgress` 必须仍能展示可读的 recent JSONL events，并标示 `frontmatter=unavailable`。没有 output file 仍是“未 dispatch”的正常错误，不属于该降级路径。新 writer 不得把原始 vendor result、完整 stderr 或 raw binary/config path 写入上述字段。

### progress JSONL

不新增第二个 terminal event，也不以 attestation 刷新 idle activity。既有唯一 terminal event 可包含以下 optional fields，JSONL 中 `observed_models` 保持真正 array。`cli/src/progress.js` 的 `OPTIONAL_EVENT_FIELDS` 必须显式 allowlist `requested_selector`、`effective_selector`、`effective_selector_source`、`selector_kind`、`observed_models`、`model_attestation_source`、`model_attestation_observed_at`、`resolution_status` 与 `resolution_detail`；没有这一项，writer 会静默丢弃这些 event fields：

```json
{
  "kind": "terminal",
  "terminal": true,
  "requested_selector": "fable",
  "effective_selector": "fable",
  "effective_selector_source": "user-argv",
  "selector_kind": "alias",
  "observed_models": ["claude-opus-4-6"],
  "model_attestation_source": "claude.result.modelUsage",
  "resolution_status": "alias-resolved"
}
```

frontmatter 是唯一的 terminal handoff canonical record，JSONL 是追加式 progress evidence。shared finalizer 在后台与同步路径中使用同一写入顺序和字段集；`--result` 与 `--progress` 也必须经同一 canonical-attestation reader，而不是分别读取不同字段。reader 的先后与中途写入规则如下：

1. frontmatter 有完整 terminal status、`terminal_event_emitted=true` 和可解析 attestation fields 时，`--result`/`--progress` 使用 frontmatter 的 resolution；JSONL 只用于展示最近 event 与一致性检查。
2. JSONL 已有 terminal event、但 frontmatter 仍是 `in-progress`、缺 status、损坏或尚未写入时，视为 `handoff_state=finalizing|partial`。`--result` 必须明确输出 `finalizing`/`partial`，或在 frontmatter finalizer 落地后输出 canonical terminal record；不得把它误报为普通完成。可显示事件中的 observed model 作为 diagnostic，但 resolution 必须为 display-only `unverified`，不能把该 event 单独提升为最终 `exact`、`alias-resolved` 或 `mismatch`。
3. frontmatter 已是完整 terminal、JSONL 缺失/截断时，frontmatter 仍可独立完成 result/progress 展示；读 JSONL 的 partial line 被现有 parser 忽略。
4. 两者均完整却冲突时，frontmatter 的 stored resolution 仍为 canonical，CLI 额外显示 `attestation_consistency=conflict`。它不覆盖 canonical resolution，也不从任一侧推导新模型。

无论哪个 reader 先运行，缺失/corrupt status 都归一为 `unknown`，而非 string method 调用异常；缺失或损坏 attestation fields 归一为 `unverified`。这一定义避免 terminal JSONL 与 frontmatter 原子写的间隙造成错误终态，同时保留一次 terminal event 合同。

### Probe cache

cache 保持 schema v1；provenance 是 vendor entry 中的 optional additive field，因此本阶段不得 bump `CACHE_VERSION`。新 reader 以 non-mutating normalizer 读取旧 entry：缺 provenance 的 entry 渲染为 `source=unknown`、`freshness=unknown`、`binary_availability=unknown`，而保留其既有 models、timestamp 和其他可读字段。

`setVendorCache` 的 v1 更新是 forward-compatible additive merge，不是 full overwrite：先读取同 vendor 已有、确认是 v1 的 entry，浅拷贝其所有 root 与 vendor-entry unknown keys；然后仅更新本 writer 明确拥有的字段（本次 probe 的 `models`、`models_source`、`probed_at`、`introspection_supported`、安全 provenance、受控 diagnostic，以及既有明确 ownership 的 binary metadata）。未由本次 probe 提供的自有 optional 字段保留旧值；所有未知 future field 连同其原值保留，writer 不得重序列化、删除或以 `undefined` 覆盖它们。嵌套 provenance 也使用字段级 additive merge，不能将未知 nested future key 清空。这样 future producer 写入的 v1 additive data 不会被旧 writer 破坏。

对未来真正的 cache version mismatch，normalizer、dispatch、result 与 setup 不采用任何 cached model evidence，统一降级显示 `cache_schema=unknown`/`catalog=unknown`；普通 `setVendorCache` 也不得向该文件写入、自动删除、重建或覆盖旧文件。`--models` 可以返回受控的 `cache-version-unsupported` 诊断，但也不能泄露 cache absolute path。只有一个专门的、显式设计过的迁移/重建流程才可替换不兼容 cache。

每次 dispatch 把可用 cache provenance snapshot 复制进自己的 output frontmatter，保证历史 `--result` 不会因之后 refresh 变更证据。probe cache 不是某次执行的 actual-model record。

## CLI 展示合同

| 命令 | 必须显示 | 禁止显示 |
| --- | --- | --- |
| `--models [vendor]` | catalog entries、safe source kind/label、cache timestamp/freshness、binary `present|missing|unknown` 与 basename | 完整 `binary_path`、完整 PATH、config absolute path、raw notes、credential/provider secrets |
| `--setup [vendor]` | 同一 binary/source/freshness 摘要；`config-only` 明确表示“configured aliases, not live catalog” | 把 config-only 标为 live 或 installed/auth proof；完整路径、auth/provider/raw diagnostic |
| `--capabilities <vendor>` | static selector contract，以及经安全投影的 cache source/binary/freshness | 现有 raw `binary_path`、raw cache `notes`、config/PATH/stderr/auth 细节 |
| `--check-model <vendor> <model>` | `selector_valid`、legacy-compatible verdict/exit code，以及 `runtime_attestation=not-run` | 把 known-good `verified` 表述为 runtime proof；raw cache source/notes/path |
| `--result <task>` | raw requested selector、effective selector/source、kind、明确以 effective 比较的 observed actual models、resolution status/detail、attestation source/time、启动时 catalog/binary snapshot；partial/finalizing handoff 的安全状态 | 原始 result envelope、完整 raw log、binary/config 路径；除非既有 `--full` 合同明确请求原始 vendor output |
| `--progress <task>` | in-progress 时 raw/effective selector、source/kind 与启动 snapshot；完成后加 terminal attestation；partial/finalizing 状态 | 将 heartbeat 当作 attestation、binary/config 路径、未完成时的 final resolution conclusion |
| dashboard vendor inventory/card | 与 CLI 同一 safe provenance、binary availability/basename 和 safe diagnostic code | `binaryPath`、raw `notes`、config/PATH/stderr/auth/provider value |

建议的紧凑文本形态：

```text
Model: requested=fable (alias) | observed=claude-opus-4-6
Resolution: alias-resolved (source: claude.result.modelUsage)
Catalog: adapter-aliases, fresh | binary: present (claude)
```

`models_source`、binary 与 runtime attestation 都可缺失；展示必须以 `unknown`、`unavailable` 或 `unverified` 明说，不将空值隐藏为成功。

## Privacy、错误与未知状态

- 新增的模型 attestation/provenance 字段仅允许安全 basename、allowlisted source label、标准状态枚举、模型 selector/ID 和 ISO timestamps。绝不公开 binary/config absolute path、PATH、home directory、config 内容、environment variable、token、session secret、provider/account identity 或完整 raw stderr。既有 task handoff 的 output/log path 展示不因本设计改变；禁止的是将它们混入 model/binary provenance。
- public cache projection 是唯一 renderer 输入：CLI 的 `--models`/`--setup`/`--capabilities`/`--check-model` 与 dashboard API/card 都使用它，不得直接读取 `binary_path`、`models_source` 或 `notes`。dashboard API 在 inventory contract v2 删除 `binaryPath` 与 raw `notes`，改为 `binaryAvailability`、`binaryBasename`、`sourceKind`、`sourceLabel` 和可枚举 `diagnosticCode`。这是隐私驱动的 breaking removal，不得声称为无条件 additive；绝不能为了兼容旧 card/client 在 v2 response 同时保留原始字段。
- dashboard server、API schema/types 和 `VendorCard` 必须 lockstep rebuild/release：先在同一变更中令 server 只投影 v2 safe fields、client 只读取这些字段，并以 `inventoryContractVersion: 2` 显式协商/断言。若部署架构允许前后端版本短暂错配，旧 client 只能把缺失 legacy 字段显示为 unavailable，不能要求 server 回吐 raw path/note；外部 consumer 的 deprecation notice 必须说明 v1 raw fields 已删除及安全替代字段。rollback 只能回滚整套 server/client 到相互兼容的、仍不重新暴露 raw fields 的 build，或保持 v2 safe projection 并关闭新 card rendering；不得以恢复 `binaryPath`/raw `notes` 作为回滚手段。
- probe 的 spawn/parse failure 以 bounded error code 或短状态记录，例如 `probe-failed`、`catalog-unavailable`、`runtime-model-metadata-absent`。原始 stderr、auth/login 文案、provider 名称、exception message 和配置路径既不写入 public cache note，也不被 dashboard/CLI summary 复制；必要的原始诊断只遵循既有受控 raw-log 访问边界。
- 运行时 metadata 声称多个模型时，Hopper 只记录 vendor 给出的值，不推断 primary、费用归属或 fallback 原因。
- cache stale 不使历史 attestation 失效；它只降低 catalog snapshot 的 freshness。runtime evidence 缺失时不得由 stale/fresh catalog 推导 resolution。
- malformed new fields、future schema fields、未知 source kind 或未知 resolution string 都不得中断读取；它们规范化为 `unknown`/`unverified` 并保留旧 result 行为。

## 实施边界与分阶段 rollout

实施 landing sequence 是强制顺序，不是扩大本协议的额外 lifecycle feature：先冻结 types/metadata 与 strict comparator contract，再让 parser-to-finalizer 数据流收口，然后写 file-backed protocol/readers，之后才接 cache public projection 与 dashboard v2，并在每步完成对应 fixture/compat 断言后进入下一步。共享 lifecycle 文件的阶段边界、revalidation、idle/terminal sequencing 仅作为实施检查项：必须确认新字段没有改变一次 spawn、唯一 terminal event、resume/revalidation 或 timeout 行为，但本设计不新增 lifecycle phase、状态转换或跨任务协议。

### Phase 1：合同与数据路径

1. **Types、adapter metadata、比较边界：** 在 `cli/src/types.js` 的 adapter/result contract 加 raw/effective selector provenance、`alias|concrete|auto|unknown` selector metadata 与 optional `modelAttestation`；Claude 用动态 capabilities/adapter metadata 枚举分类，OpenCode/Kimi 仅声明可证实的 grammar/path。扩展 `cli/src/model-normalize.js` 为唯一 comparison boundary，令 `cli/src/model-check.js` 与 `cli/src/dispatch.js` 调用明确分离的 validation/strict-runtime modes；strict mode 不得调用 `modelKeysMatch`，adapter 不实现第二个 canonicalizer。
2. **所有 parseResult 消费点：** Claude parser 仅接受 terminal completion envelope 中经 metadata/fixture 验证的 `modelUsage` actual-ID field；OpenCode parser 仅接受其结构化 terminal result 中经 metadata/fixture 验证的完整 provider/model pair；Kimi 只保留可证实的 config-only evidence，直至其 result 有稳定 actual-model 字段。`cli/bin/hopper-runner` 和 `cli/src/dispatch.js` 都必须透传 optional `modelAttestation`，而不是只取 text/status/usage；任何缺失、request echo 或 schema drift 都产生无 runtime evidence。
3. **File protocol：** `cli/src/background.js` 负责启动 snapshot；shared terminal-attestation finalizer 由 `cli/bin/hopper-runner` 与同步 `--write` path 共用，负责 scalar-safe `observed_models_json`、唯一 terminal JSONL event 与 canonical terminal frontmatter；`cli/src/progress.js` 更新全部新增字段的 `OPTIONAL_EVENT_FIELDS`。实现遵从本设计的 frontmatter-canonical/finalizing precedence，且不改变 idle/ceiling 或 terminal-event 数量。
4. **Read surfaces：** `cli/bin/hopper-dispatch` 的 result/progress reader 对缺/坏 frontmatter/status 使用安全降级，且二者使用 shared canonical-attestation reader；models/setup/capabilities/check-model 全部使用 public cache projection。同步 `--write`、后台 finalization、`--result` 与 `--progress` 的字段、writer 和优先级必须先以 shared finalizer/reader 收口，再启用新 output field。
5. **Cache：** `cli/src/cache.js` 保持 v1，加入 read-compatible provenance normalizer、owned-field additive merge、unknown-field preservation 和 version-mismatch-as-unknown/no-write 行为。`cli/src/vendor-probe/kimi.js` 及其他 probe 只产生 allowlisted source label/diagnostic code；它们不将 config path、stderr、auth 或 provider text 放入 public entry。
6. **Dashboard privacy migration：** 在同一 lockstep release 中更新 `dashboard/server/routes/vendors.js`、API schema、`dashboard/client/src/lib/types.ts` 与 `VendorCard`，使其只传输/读取 v2 safe binary/source/diagnostic 字段。先验证 mixed-version client 对 missing legacy field 的 unavailable rendering，再删除 legacy field；发布说明、compat behavior 与不重新泄露 raw field 的 rollback procedure 是此步骤的交付物。
7. **镜像与验证边界：** 根 `cli/` 与 `plugins/hopper/cli/` 是发布镜像，实施时两套受影响代码必须保持字节级同步并由现有镜像 hash test 验证；本设计不授权只改其一。

实施/验证还必须记录实际 sandbox execution evidence。外部 reviewer 即使被请求 read-only，也可能尝试写入用户级状态（例如 home/cache/config）；这种风险不改变本 attestation 的 file/data protocol，也不授权扩大其范围。后续实现或验证报告只能陈述已观测到的 sandbox、命令和写入证据；除非该证据存在，不得宣称执行为严格 no-write。

### Phase 2：小范围启用与审计

先启用 Claude、OpenCode 与 Kimi 三条路径。以 fixture-based tests 验证稳定 result schema，保留 raw log 作为 parse drift 的有限诊断证据。其他 adapter 继续输出 `unverified`，直至各自有明确 selector 和 runtime metadata 合同。Phase 1 实现完成后冻结 diff，再按既定检查点做独立只读审查；普通修复不重复整组三方审查。

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
| Claude dynamic selector metadata | fixtures 枚举 `fable`、`sonnet`、`best`、`default`、`opusplan`、`[1m]` 与 future alias；另有 capabilities 缺失/未枚举值 | 已枚举的形式按 metadata 得到 alias/concrete；不建立 alias→actual 映射；缺失/未枚举为 `selector_kind=unknown`、`unverified`，绝不 false `mismatch`。 |
| OpenCode concrete | request `provider/model`，runtime 同/不同 ID | 分别为 `exact`/`mismatch`；比较仅用 `model-normalize` 的 strict runtime path。 |
| Strict identity grammar | Claude opaque ID；OpenCode 同 provider/model、不同 provider、bare model、额外 namespace、单边 qualified | 仅完整 Claude ID 或相同 provider+model 的 pair match；bare 与 namespaced 永不等价，歧义/不可比较为 `unverified`；不得调用 `modelKeysMatch`。 |
| Selector provenance | raw request 与 policy effective selector 相同、被替换、被 policy 清空为 vendor default | 同时保存 requested/effective/source；仅 effective 被比较；raw 不得被 observed 回填。 |
| Kimi config-only | binary missing，配置枚举 alias，且 runtime 无 actual ID | `config-only`、binary missing、无完整 config path 泄露。 |
| Kimi future runtime evidence | config alias 且 runtime 返回 actual ID | `alias-resolved` 优先于 config-only。 |
| Auto | 未传 `--model`，有或无 observed model | `requested_selector=null`、kind `auto`、status `unverified`，observed value仍可见。 |
| Multi-model | runtime 返回重复或多个 IDs | stable first-seen de-dup，JSONL array 与 frontmatter JSON string round-trip 一致。 |
| Parser contract | Claude `modelUsage` actual-ID field；OpenCode structured provider/model pair；两者的 present/absent/malformed/request-echo fixture | `modelAttestation` 只来自允许的 structured field/pair；sync 与 background consumer 不丢失；缺失/歧义时不 throw，且不伪造 exact/alias-resolved/mismatch。 |
| Scalar safety | models 包含引号、反斜杠、换行、control character、`:`、`#`、`---` 等值 | YAML quoted scalar round-trip 后才 JSON parse；禁止 injection/plain scalar；JSONL 仍为 array。 |
| Legacy/missing handoff | no frontmatter、缺/非法 `status`、坏/截断 `observed_models_json`、YAML flow-sequence/object/non-string array member | result/progress 不 throw、不调用 undefined method；显示 `unknown`/`unverified` 或 `frontmatter=unavailable`，仍可展示有效 events。 |
| Mid-write protocol | terminal JSONL 已写但 frontmatter in-progress、半写 scalar、frontmatter terminal但JSONL缺失/partial、两者冲突 | 分别验证 `finalizing` display-only unverified、frontmatter canonical、`attestation_consistency=conflict`；JSONL partial line 被忽略。 |
| Sync/background finalization | 同一 parsed result 分别经 `--write` 同步路径与后台 runner | 两路径调用同一 finalizer，生成同字段集/同 resolution；`--result`/`--progress` 使用同一 canonical reader，能表示 finalizing。 |
| Optional-event allowlist | 终态 event 带所有新 attestation fields | `OPTIONAL_EVENT_FIELDS` 保留每一字段，JSONL round-trip 不丢值。 |
| Cache/probe semantics | cache stale、旧 v1 entry、含 root/vendor/nested unknown future field 的 v1 entry、version mismatch、probe error、config source、CLI catalog | 无自动 spawn；v1 owned fields additive merge 且所有 unknown field 保留；mismatch 为 unknown、普通 writer no-write，绝不 full overwrite cache。 |
| Kimi privacy/config-only | binary missing、config alias、provider-list error、config parse error | `config-only` 与固定 safe label；cache/API/CLI 不含 home/config path、stderr、auth/provider 或 exception text。 |
| `--check-model` semantics | known-good、catalog-only、not-found 的 JSON/text | 保留兼容 exit code；明确 `selector_valid` 与 `runtime_attestation=not-run`，不得输出 runtime resolution。 |
| Rendering/privacy/dashboard migration | `--models`、`--setup`、`--capabilities`、`--check-model`、result/progress、dashboard v2 fixture、mixed-version client 与 rollback fixture | 仅显示 allowed safe fields；API 不含 `binaryPath`/raw `notes`；旧 client 对 missing legacy field 显示 unavailable；rollback bundle 仍不重现 raw fields；断言不存在 absolute path、home path、PATH、stderr、auth/provider 或 secret-like content。 |
| Protocol invariants | background terminal write | 一次 vendor spawn、仅一个 terminal JSONL event、attestation 不影响 idle/ceiling timeout。 |
| Lifecycle implementation checks | shared lifecycle/revalidation file fixtures | 仅验证既有阶段边界与 revalidation 未被 attestation 改变；不引入新的 lifecycle protocol state。 |
| Execution evidence | 任何外部 reviewer/verification invocation | 报告实际 sandbox、命令与观测写入；没有此证据时不标为严格 no-write。 |

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
- cache version mismatch 故意降级为 unknown，直至显式迁移/重建；这优先保证不破坏未知旧 cache，而非继续使用未理解的 model evidence。
- 根 CLI 与发布镜像必须保持同步；漏改任一侧会造成安装路径间的 attestation/隐私行为分叉，因此 mirror hash test 是发布前门槛。
- 将 full path 与 raw probe note 从公开 UI 移除后，少数深度排障需要本地受控日志；该取舍优先保护用户环境信息。

本设计的成功标准是：用户能看到“我选择了什么、该字符串是 alias 还是 concrete、vendor 本次实际报告了什么、这些信息来自哪里以及 Hopper 能否证明它们的关系”，同时 Hopper 在证据不足时明确保留不确定性。
