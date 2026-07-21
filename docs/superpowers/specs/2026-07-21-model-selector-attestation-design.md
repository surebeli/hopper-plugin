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
2. **runtime attestation：** 使用同模块导出的独立 strict comparator，绝不调用、复用或间接包裹 `modelKeysMatch` 的 namespace strip/tail-match 路径。它只做 trim，以及该 vendor 明确声明为 case-insensitive 的完整 component 的 case folding；不得 strip provider prefix、namespace、分隔符，不得 tail-match、fuzzy-match 或把 alias 展开为 ID。Claude concrete ID 是一个 opaque、完整的 Claude ID，两个值必须在上述规范化后整体相同。OpenCode concrete ID 以唯一 expected `{provider,model}` pair 比较：两侧都必须可解析为恰好同一 normalized provider component 和同一 normalized model component；bare `model` 只可与 bare `model` 整体相等，永远不能与 `provider/model`、`namespace/provider/model` 或任何带 namespace 的 ID 相等。其他 vendor 也必须在 concrete record 里给出唯一 explicit expected identity；缺 expected identity、额外 namespace、解析歧义或只有 bare/qualified 一侧时都为“不可比较”，而非 match。只有这个 strict path 能决定 concrete 的 `exact` 或 `mismatch`；不可比较或无证据只能为 `unverified`。

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
  "source_kind": "cli-catalog | config | adapter-aliases | static | unavailable | error | unknown",
  "source_label": "opencode-cli-catalog | claude-selector-metadata | kimi-configured-aliases | adapter-static-selectors | unavailable | unknown",
  "observed_at": "2026-07-21T00:00:00.000Z | null",
  "freshness": "fresh | stale | unknown",
  "binary_availability": "present | missing | unknown",
  "binary_basename": "claude | opencode | kimi | null"
}
```

所有公共 surface（`--capabilities`、`--models`、`--setup`、`--check-model`、dashboard/API、`--result` 与 `--progress`）使用同一 closed allowlist：`source_label` 只能是上述六个值，未知/future/raw 值一律归一为 `unknown`；`diagnosticCode` 只能是下文定义的 canonical closed set，任何未映射错误为 `unknown`。UI 可在本地把 enum 映射为文案，但不得让原始字符串进入响应或 handoff。`source_label` 不是绝对文件路径、URL、完整 PATH 或原始 stderr，也不得直接复用 `models_source`。`binary_basename` 必须取已经解析的 command basename，且不能从未验证的自由文本直接回显。

internal `source_kind × vendor` allow map 也是闭集；未为该 vendor 声明的 source kind 一律为 `unknown`，不作跨 vendor 推断：

| vendor | 允许的 internal `source_kind` | public `source_label` |
| --- | --- | --- |
| `opencode` | `cli-catalog` | `opencode-cli-catalog` |
| `claude` | `adapter-aliases` | `claude-selector-metadata` |
| `kimi` | `config` | `kimi-configured-aliases` |
| 任一已声明 vendor | `static` | `adapter-static-selectors` |
| 任一已声明 vendor | `unavailable` | `unavailable` |
| 任一 vendor | `error|unknown`、future value 或不在该行的组合 | `unknown` |

canonical storage field 为 `diagnostic_code`，public renderer 输出同值为 `diagnosticCode`。它的闭集为 `none|metadata-envelope-malformed|selector-metadata-cache-schema-unsupported|selector-metadata-cache-adapter-mismatch|selector-metadata-cache-expired|selector-metadata-cache-missing|runtime-model-metadata-malformed|runtime-model-metadata-conflict|runtime-model-metadata-absent|inventory-cache-version-unsupported|inventory-cache-malformed|capability-failed|probe-failed|catalog-unavailable|unknown`。diagnostic 先在独立 domain 内判定，再按最后的跨 domain 优先级合并为一个 code；raw error 永远不改变选择结果：

| domain | domain 内优先级（从高到低） | 触发条件与 code |
| --- | --- | --- |
| selector-metadata validation | 1–5 | envelope 字段/duplicate/conflicting literal 畸形 → `metadata-envelope-malformed`；支持 schema 外 → `selector-metadata-cache-schema-unsupported`；schema 已支持但 vendor/adapter id/version/catalog binding 不符 → `selector-metadata-cache-adapter-mismatch`；时间/validity 无效或过期 → `selector-metadata-cache-expired`；无有效 envelope → `selector-metadata-cache-missing`。 |
| runtime evidence | 1–3 | runtime identity 类型/schema/bare-vs-namespaced/不可解析畸形 → `runtime-model-metadata-malformed`；仅在 identity 均有效后仍相互冲突 → `runtime-model-metadata-conflict`；成功 result 没有稳定 actual identity → `runtime-model-metadata-absent`。 |
| inventory/probe | 1–5 | inventory cache version 不支持 → `inventory-cache-version-unsupported`；inventory cache 畸形 → `inventory-cache-malformed`；capabilities command 失败 → `capability-failed`；probe spawn/exit/parse failure → `probe-failed`；无安全 catalog → `catalog-unavailable`。 |

当多个 domain 同时报告时，最终单一 code 的跨 domain 优先级是：`runtime-model-metadata-malformed`、`runtime-model-metadata-conflict`、`metadata-envelope-malformed`、`selector-metadata-cache-schema-unsupported`、`selector-metadata-cache-adapter-mismatch`、`selector-metadata-cache-expired`、`selector-metadata-cache-missing`、`inventory-cache-version-unsupported`、`inventory-cache-malformed`、`capability-failed`、`probe-failed`、`catalog-unavailable`、`runtime-model-metadata-absent`、`unknown`。这使 runtime malformed 必定先于 conflict，schema unsupported 必定先于 adapter binding mismatch，同时保留各 domain 的可实施触发条件。

`sourceNote` 是仅供私有受控诊断日志使用的原始来源说明术语，不是 cache、handoff、frontmatter、JSONL、dashboard/API 或 CLI summary 的字段；`notes`、`sourceNote`、`cacheError` 与 `modelsSource` 都不是 public field。raw probe/能力说明只可留在该私有日志，且不得复制进 cache `notes`、frontmatter、JSONL 或任何 public surface；原始 stderr、auth/login 文案、provider 名称、parse exception、config/binary path、URL、environment value 和 credential 均同样禁止。

### 动态枚举的优先顺序

1. Vendor 提供可运行的 catalog command 时，`--probe` 使用该 command；例如 OpenCode 的 `opencode models`。此类结果为 `cli-catalog`，并用 probe 完成时间计算 freshness。
2. Vendor 仅暴露本地配置或 provider list 时，保留该列表及其 `config`/`config-only` 证据。Kimi 的公开 source label 固定为 `Kimi configured aliases`；它不宣称为完整远端目录，也不意味着 binary 一定可执行。
3. Vendor 没有可用 catalog command、但 adapter 能可靠列出合法 selector 时，显示为 `adapter-aliases`。Claude 此列表必须来自动态 capabilities/adapter metadata；其中的 `fable`、`sonnet`、`best`、`default`、`opusplan`、`[1m]` 等值在此层是选择器，不是 actual-ID 映射。
4. 无安全来源、命令失败或解析不可信时，目录条目为空并明确显示 `unavailable` 或 `error`；不回退到猜测的 model list。

`hopper-dispatch --models <vendor>` 是上述 cache 的读取视图。`--setup [--deep]` 可使用同一 provenance 表达 readiness 和 freshness，但只有用户显式要求的 probe/deep 路径可以刷新 cache。正常 dispatch 仅捕获当时的 cache snapshot。

## Selector 分类

adapter 必须在其 model capability metadata 中为 policy resolution 后实际传入 adapter 的 `effective_selector` 分类，而不是在 dispatcher 中根据字符串格式推测；`requested_selector` 永远只作 audit，绝不参与此分类或 runtime comparison。metadata 只分类，实际 comparison 仍完全由 `model-normalize.js` 执行。

### Versioned zero-spawn selector metadata schema

分类输入必须是下列 schema v1 的已 sanitize metadata envelope；schema fields 缺失、类型不符或值不在闭集即拒绝。`schema_version` 当前只支持 `1`，future version 不做 best-effort parse：归为 `selector-metadata-cache-schema-unsupported` 并得到 `unknown`。每条 selector 都是一个完整 exact literal；不存在 selector literal 的拼接、variant 组合、regex 或 grammar。结构示意如下：

```json
{
  "schema_version": 1,
  "vendor": "claude | opencode",
  "adapter": { "id": "claude | opencode", "version": "exact adapter version" },
  "catalog": { "id": "vendor selector catalog id", "version": "exact catalog version" },
  "source_kind": "capabilities-cache | adapter-manifest",
  "generated_at": "ISO-8601",
  "expires_at": "ISO-8601",
  "validity": "accepted",
  "selectors": [
    {
      "literal": "exact alias-or-auto selector literal",
      "kind": "alias | auto"
    },
    {
      "literal": "exact concrete selector literal",
      "kind": "concrete",
      "expected_runtime_identity": {
        "provider": "one exact provider literal",
        "model": "one exact model literal"
      }
    }
  ]
}
```

record validation 是 discriminated union：`alias` 与 `auto` record **禁止** `expected_runtime_identity`；`concrete` record **必须且只能**有一个 `{provider, model}` expected pair，两个值均为 non-empty exact literals，不能用 arrays、independent provider/model lists 或 cross-product 表达。相同 `literal` 出现两次（即使内容相同）或同 literal 有冲突 `kind`/expected pair 时，整个 envelope 为 `metadata-envelope-malformed`。`sonnet[1m]`、`fable`、`best` 等都必须各自作为完整 literal 单独列出；未枚举 `sonnet[1m]`、任意 `[N_unit]`、大小写/分隔符变体或未来形式一律不匹配。该 schema 永不包含 alias→actual model 映射。

zero-spawn source priority 是：(1) vendor、adapter id、adapter version、catalog version 都匹配且未过期的 sanitized capabilities-cache envelope；(2) 匹配同一 binding 的 adapter-manifest envelope；(3) 无有效 source。dispatch 只读该两项已有本地数据，绝不为了分类执行 CLI、probe 或网络请求。每个 envelope 必须 `generated_at <= expires_at` 且 `validity=accepted`；vendor/adapter mismatch、schema unsupported、过期/无效时间、缺失或 malformed envelope 均拒绝。cache 对未知 future fields 的读取策略是：已支持 schema 内忽略但不解释 unknown fields，兼容 writer 仅在同 schema additive merge 时保留它们；schema version 不支持时不读、不分类、不覆盖。只有在两项 source 都无效或完整 selector literal 未枚举时，effective selector 为 `unknown`/`unverified`，不得产生 `mismatch` 或 `alias-resolved`。

| Vendor 场景 | `selector_kind` | 比较规则 |
| --- | --- | --- |
| Claude metadata 枚举的 profile/alias（可包括 `fable`、`sonnet`、`best`、`default`、`opusplan`、`[1m]` 及未来枚举值） | `alias` | 仅在有效 metadata 以完整 literal 明确声明时分类为 alias；可运行且 observed actual model 非空即 `alias-resolved`，不要求字面相等，也不允许硬编码到真实模型 ID。 |
| Claude metadata 明确列为完整 model ID，例如 `claude-sonnet-4-6` | `concrete` | 与 observed actual IDs 做 `model-normalize` strict runtime comparison。 |
| Claude capabilities 不可用、值不在可枚举 contract 中、或 metadata 未给分类 | `unknown` | 不运行 strict comparison，始终为 `unverified`；不得产生 false `mismatch`。 |
| OpenCode metadata 明确以 `provider/model` complete literal 传入和报告 | `concrete` | 与 record 的唯一 expected provider/model pair 严格比较。 |
| Kimi config alias | `alias` | 若 runtime result 没有可用 actual ID，保留 config-only 证据，不虚构解析。 |
| 未传 effective selector（包括 policy 选择 vendor default） | `auto` | `effective_selector=null`；不比较默认选择，仍可记录 observed models。 |

Claude adapter 必须把动态 metadata 中“输入形式、分类和可接受语法”一并保存为本次分类的可审计基础，但 public handoff 只保存安全的 `selector_kind` 与 source enum，不保存 raw capability output。`fable`、`sonnet`、`best`、`default`、`opusplan`、`[1m]` 仅是必须覆盖的 metadata-declared fixture 形式，不是永恒有效的硬编码列表；未由有效 metadata 声明时必须为 `unknown`。任何 adapter 都不得把未知自由文本乐观地标为 alias 或 concrete；这种显式值为 `unknown`，CLI validation 仍按既有 selector-validation 合同报告。每个 adapter 的 metadata、其 parser 和 types contract 都要有 fixture test，防止新增 adapter 忘记声明 selector kind。

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

### Attestation status 真值表

终态 handoff 的 `resolution_status` 必须恰为以下五种之一。`strict comparable` 表示 observed identity 与 concrete record 的唯一 expected `{provider,model}` pair 均已验证、采用 strict comparator 且不是 bare-vs-namespaced/额外 namespace/解析畸形情形。真值表如下，任何未列情况都是 `unverified`：

| selector kind / metadata | runtime observed evidence | 状态 | 必要条件 |
| --- | --- | --- |
| `concrete`，有效唯一 expected pair | 至少一项 strict comparable match | `exact` | `exact` 只要求至少一个 match；即使另有非匹配项也不降为 mismatch。 |
| `concrete`，有效唯一 expected pair | 非空；每一项均有效、strict comparable，且全都不等于 expected pair | `mismatch` | 这是产生 mismatch 的唯一条件。 |
| `concrete` | 无 observed；或无 match 且任一项 ambiguous、malformed、bare-vs-namespaced、额外 namespace 或不可比较 | `unverified` | 不能把不完整/不可比较证据改写成 non-match。 |
| `alias`，有效 metadata record | 至少一项有效、结构化 runtime actual identity | `alias-resolved` | 仅证明 alias 已由 vendor runtime 解析；不生成或保存 alias→actual 映射。 |
| `alias` 或 `concrete`，有效 metadata record | 无 runtime identity，且 catalog snapshot 是 `config-only` | `config-only` | 只有配置级选择器证据。 |
| `alias` | 无/畸形/冲突 runtime identity | `unverified` | 不伪造 `alias-resolved`。 |
| `auto` 或 `unknown` | 任意 | `unverified` | `auto` 无可比较 effective selector；`unknown` 不能进入 strict comparison。 |

因此 `mismatch` 不由 alias、auto 或 `unknown` selector kind 产生。`auto` 即使观察到 actual model，也使用 `unverified`，并在 detail 中说明“没有显式 effective selector 可比较”；observed value 仍然显示。`config-only` 低于真实 runtime evidence：若 Kimi 将来提供了 alias 的有效 runtime actual ID，则 alias 可成为 `alias-resolved`。

### Resolution detail contract

`resolution_status` 与 `resolution_detail` 必须成对写入；detail 是受控枚举，不含 raw result、路径或 vendor prose。下表穷尽新 writer 可产生的组合，reader 遇到未知组合一律显示 `unverified`/`unknown`，不自行升级：

| effective selector / kind | runtime evidence | catalog evidence | status | detail |
| --- | --- | --- | --- | --- |
| non-null / `concrete` | strict match | any | `exact` | `concrete-runtime-exact` |
| non-null / `concrete` | observed 非空、每项有效可比较且全为 strict non-match | any | `mismatch` | `concrete-runtime-mismatch` |
| non-null / `concrete` | 无 strict match，且任一 observed identity 畸形/歧义/不可比较 | any | `unverified` | `concrete-runtime-unverifiable` |
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
catalog_source_label: "claude-selector-metadata"
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

`observed_models_json` 必须先以 JSON serializer 产生 JSON string，再由专用 YAML scalar encoder 以 quoted scalar 写入；encoder 必须转义引号、反斜杠、换行、控制字符、`:`、`#` 及 document-marker-like 内容，禁止 string interpolation、plain scalar 或 flow sequence。reader 只接受解析结果为 string 的 scalar，再 JSON parse 为 `Array<string>`：必须是 array、不得为 `null`、且每个 member 都是 string；YAML flow-sequence、object、`null`、非 string member、截断/半写 scalar 或非法 JSON 一律丢弃并降级为空数组。所有 frontmatter reader 必须容忍这些字段缺失、`observed_models_json` 不是合法 JSON、或数组中含非 string：读取时降级为空数组并显示 `unverified`，不得使 `--result`、`--progress` 或 dashboard 崩溃。`runResult` 必须把缺失/非法 `status` 规范为 display-only `unknown`，而不是调用 `undefined.toUpperCase()`；`runProgress` 必须仍能展示可读的 recent JSONL events，并标示 `frontmatter=unavailable`。没有 output file 仍是“未 dispatch”的正常错误，不属于该降级路径。新 writer 不得把原始 vendor result、完整 stderr 或 raw binary/config path 写入上述字段。

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

frontmatter 是唯一的 terminal handoff canonical record，JSONL 是追加式 progress evidence。shared finalizer 在后台与同步 `--write` 路径中使用同一写入顺序和字段集；`--result` 与 `--progress` 也必须经同一 canonical-attestation reader，而不是分别读取不同字段。

同步 `--write` 的 exact-once 终态合同与后台相同：新 task 从 **0** 条 terminal JSONL event 开始；`parseResult` 完成后 shared finalizer 只被调用一次，并先 append 一条完整 terminal JSONL event，成功后才原子写入含 `terminal_event_emitted=true` 的 canonical terminal frontmatter。因此成功完成时恰为 **1** 条 terminal event，不能由 sync path 省略 event，也不能因 writer re-entry、error handling 或 finalization retry 追加第二条。JSONL append 失败时 frontmatter 保持 in-progress，且不把任务伪装为 terminal；JSONL append 成功而 frontmatter 原子写失败/进程崩溃时，reader 仅显示 `handoff_state=finalizing|partial`；frontmatter 成功落地后才采用它的 canonical resolution。已有 terminal event 的 task 不得重新执行这个 finalizer；实施须采取显式 guard/拒绝路径，而非 append 新 event。此写序也定义后台相同的 crash windows，不允许两条路径各自选择顺序。

只有“恰好一条、task identity 匹配且可解析”的 orphan terminal JSONL event 可触发 orphan reaper。它只能执行 **frontmatter-only** 的 idempotent repair：从该 event 重建 canonical terminal frontmatter 并写入 `terminal_event_emitted=true`，绝不得 append、重放或合成第二条 terminal JSONL event。atomic replace 前必须 late reread 当前 frontmatter 和 JSONL terminal count；若 frontmatter 此时已经完整 terminal、terminal count 不再恰为 1、task ID/event payload 不再匹配、event 已损坏、frontmatter 变为不可安全解析的并发状态，或 repair input 与先前 snapshot 不同，reaper 一律 no-op。partial frontmatter 只可 merge 已 sanitize 的 allowlisted snapshot fields：`catalog_source_kind`、`catalog_source_label`、`catalog_observed_at`、`catalog_freshness`、`binary_availability`、`binary_basename`；所有其他已有或 event-provided field 一律忽略，canonical terminal fields 只取 verified terminal event。五类必测 no-op/merge fixture 是：(1) 0 条 terminal event；(2) 超过 1 条 terminal event；(3) task ID 或 event payload mismatch；(4) late reread 发现完整/并发变化 frontmatter；(5) partial frontmatter 同时含 allowlisted safe field 与非 allowlisted/raw field，前者受控 merge、后者丢弃。reader 仍保持既有 in-progress/partial/conflict precedence；完整 frontmatter 始终优先于 orphan event。repair 重试必须比较 canonical frontmatter 是否已完整，完成后为 no-op。

`finalizing` 与 `partial` 只是在上述 crash window 中由 reader 推导的 display-only `handoff_state`，永远不是 frontmatter `status` 的可写值；writer 不得写 `status: finalizing` 或 `status: partial`。reader 的先后与中途写入规则如下：

1. frontmatter 有完整 terminal status、`terminal_event_emitted=true` 和可解析 attestation fields 时，`--result`/`--progress` 使用 frontmatter 的 resolution；JSONL 只用于展示最近 event 与一致性检查。
2. JSONL 已有 terminal event、但 frontmatter 仍是 `in-progress`、缺 status、损坏或尚未写入时，视为 `handoff_state=finalizing|partial`。`--result` 必须明确输出 `finalizing`/`partial`，或在 frontmatter finalizer 落地后输出 canonical terminal record；不得把它误报为普通完成。可显示事件中的 observed model 作为 diagnostic，但 resolution 必须为 display-only `unverified`，不能把该 event 单独提升为最终 `exact`、`alias-resolved` 或 `mismatch`。
3. frontmatter 已是完整 terminal、JSONL 缺失/截断时，frontmatter 仍可独立完成 result/progress 展示；读 JSONL 的 partial line 被现有 parser 忽略。
4. 两者均完整却冲突时，frontmatter 的 stored resolution 仍为 canonical，CLI 额外显示 `attestation_consistency=conflict`。它不覆盖 canonical resolution，也不从任一侧推导新模型。

无论哪个 reader 先运行，缺失/corrupt status 都归一为 `unknown`，而非 string method 调用异常；缺失或损坏 attestation fields 归一为 `unverified`。这一定义避免 terminal JSONL 与 frontmatter 原子写的间隙造成错误终态，同时保留一次 terminal event 合同；负向测试必须证明 sync、background 和 crash-recovery writer 的任何 frontmatter 都不包含 `status=finalizing|partial`。

### Probe cache

cache 保持 schema v1；provenance 是 vendor entry 中的 optional additive field，因此本阶段不得 bump `CACHE_VERSION`。新 reader 以 non-mutating normalizer 读取旧 entry：缺 provenance 的 entry 渲染为 `source=unknown`、`freshness=unknown`、`binary_availability=unknown`，而保留其既有 models、timestamp 和其他可读字段。

cache reader 必须是 diagnostics-aware，返回至少 `missing`、`ok-v1`、`version-mismatch` 与 `malformed` 的可枚举 read outcome，而不是把所有不可读状况折叠为 empty cache。`missing` 才允许 `setVendorCache` 初始化新的 v1 cache；`ok-v1` 才允许对已有 entry 做 additive merge；`version-mismatch` 或 `malformed` 都不是“空文件”，普通 probe/dispatch writer 不得写入。

`setVendorCache` 的 v1 更新是 forward-compatible additive merge，不是 full overwrite：只在 reader outcome 为 `ok-v1` 时先读取同 vendor 已有 entry，浅拷贝其所有 root 与 vendor-entry unknown keys；然后仅更新本 writer 明确拥有的字段（本次 probe 的 `models`、`models_source`、`probed_at`、`introspection_supported`、安全 provenance、受控 diagnostic，以及既有明确 ownership 的 binary metadata）。未由本次 probe 提供的自有 optional 字段保留旧值；所有未知 future field 连同其原值保留，writer 不得重序列化、删除或以 `undefined` 覆盖它们。嵌套 provenance 也使用字段级 additive merge，不能将未知 nested future key 清空。这样 future producer 写入的 v1 additive data 不会被旧 writer 破坏。

对未来真正的 cache version mismatch，normalizer、dispatch、result 与 setup 不采用任何 cached model evidence，统一降级显示 `cache_schema=unknown`/`catalog=unknown`；普通 `setVendorCache` 也不得向该文件写入、自动删除、重建或覆盖旧文件，且必须保留原 cache 文件的字节内容不变。普通 `--setup`、`--capabilities` 与 `--probe` 遇到 malformed/version-mismatch inventory cache 时只返回闭集 `inventory-cache-malformed` 或 `inventory-cache-version-unsupported` 与受控 `recover-cache` hint，绝不写入或自动恢复。`--models` 同样只返回受控 diagnostic，且不泄露 cache absolute path。

显式 recovery surface 是既有 `hopper-dispatch --probe <vendor>` 加新增、必须实现并测试的 `--recover-cache` flag：只有用户执行 `hopper-dispatch --probe <vendor> --recover-cache` 时，工具才可恢复。它先创建同目录受控 backup，命名固定为 `<cache-basename>.recovery-<UTC-compact>-<8-lowercase-hex>.bak`，权限为 owner-only（Windows 使用当前用户 ACL 等价物）；backup 成功后才将 fresh v1 cache atomic replace 到 active path。每个 active cache 最多保留 3 个 recovery backups，超额只在成功创建新 backup 后按最旧 timestamp 删除；任何 backup 创建、权限设置、retention 或 atomic replace 失败都 abort，active cache 不变，且不把失败当作 missing。普通 dispatch/probe 永不隐式启动此流程。若现有 probe 层不能承载 flag，本阶段实现范围必须增加同语义的 `hopper-dispatch --recover-cache <vendor>` command 和等价测试，不能仅保留文字约定。

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
| dashboard vendor inventory/card | 与 CLI 同一 safe provenance、binary availability/basename、`sourceKind`/`sourceLabel` 和 safe diagnostic code | `binaryPath`、raw `notes`、raw `cacheError`、raw `modelsSource`、config/PATH/stderr/auth/provider value |

上表每一个 public surface 的统一 forbidden key/value 集还包括 `sourceNote`、原始 source/error text、路径、URL、provider/account/auth/config/binary source、raw stderr 和 credential；它们不能因为位于 capabilities、嵌套 object、frontmatter 或 JSONL 而例外。

建议的紧凑文本形态：

```text
Model: requested=fable (alias) | observed=claude-opus-4-6
Resolution: alias-resolved (source: claude.result.modelUsage)
Catalog: adapter-aliases, fresh | binary: present (claude)
```

`models_source`、binary 与 runtime attestation 都可缺失；展示必须以 `unknown`、`unavailable` 或 `unverified` 明说，不将空值隐藏为成功。

## Privacy、错误与未知状态

- 新增的模型 attestation/provenance 字段仅允许安全 basename、allowlisted source label、标准状态枚举、模型 selector/ID 和 ISO timestamps。绝不公开 binary/config absolute path、PATH、home directory、config 内容、environment variable、token、session secret、provider/account identity 或完整 raw stderr。既有 task handoff 的 output/log path 展示不因本设计改变；禁止的是将它们混入 model/binary provenance。
- public cache projection 是唯一 renderer 输入：CLI 的 `--models`/`--setup`/`--capabilities`/`--check-model` 与 dashboard API/card 都使用它，不得直接读取 `binary_path`、`models_source`、`notes` 或 raw cache error。dashboard API 在 inventory contract v2 删除 `binaryPath`、raw `notes`、raw `cacheError` 与 raw `modelsSource`，改为 `binaryAvailability`、`binaryBasename`、`sourceKind`、`sourceLabel`、`diagnosticCode` 和 `diagnosticState`。这是隐私驱动的 breaking removal，不得声称为无条件 additive；绝不能为了兼容旧 card/client 在 v2 response 同时保留原始字段。
- v2 的安全映射是固定且封闭的：`modelsSource` 只能投影为 allowlisted `sourceKind`（`cli-catalog|config|adapter-aliases|static|unavailable|error|unknown`）和前述 closed `sourceLabel`；`binaryPath` 只能投影为 `binaryAvailability`（`present|missing|unknown`）及已验证 `binaryBasename`; `notes` 与 `cacheError` 只能投影为前述 closed `diagnosticCode` 和 `diagnosticState`（`none|degraded|unavailable|unknown`）。任何未映射或 future enum/raw field 都必须归一到 `unknown` 或被丢弃，不得改名后藏在 `vendor`、`cache`、`diagnostics`、`metadata`、model entry 或其他嵌套响应对象中。原始路径、stderr、provider/auth/config/binary source、异常文字和账户 identity 均不得通过任何 response depth 回流。
- 六个 v2 public field 各自都是 closed enum/closed nullable set，且每个都必须有 unknown/future fixture：`binaryAvailability=present|missing|unknown`；`binaryBasename=claude|opencode|kimi|unknown|null`；`sourceKind=cli-catalog|config|adapter-aliases|static|unavailable|error|unknown`；`sourceLabel=opencode-cli-catalog|claude-selector-metadata|kimi-configured-aliases|adapter-static-selectors|unavailable|unknown`；`diagnosticCode` 为上文 canonical set；`diagnosticState=none|degraded|unavailable|unknown`。future value 或无法验证的 value 只可归一为该字段的 `unknown`（nullable `binaryBasename` 保留 `null`），不能原样透传。
- 当前 v2 阶段的 dashboard rollout 必须先发布 null-safe client，再启用 feature-gated、**永久 shape-compatible** safe shim：legacy keys 保留且只能精确为 `notes: []`、`cacheError: null`、`modelsSource: null`、`binaryPath: null`；任何其他值都是隐私失败。递归 response scan 允许这些四个 key 仅在上述 exact safe value 出现，其他任意 value 或 nesting location 一律失败。old SPA 对这些值及 missing/null/unknown v2 enum 只能显示 unavailable，不能崩卡；new client 忽略 old-server raw legacy fields。legacy key 的实际删除属于未来 breaking contract，超出本阶段范围，不以不可验证的 coverage gate 作为当前 rollout 条件。`inventoryContractVersion` 只作为 compatibility diagnostic，缺失、未知或未来值不得成为 hard assertion/throw。外部 consumer 的 deprecation notice 必须说明安全替代字段。rollback 只能保持 safe shim、关闭 card rendering 或回滚到仍不暴露 raw field 的 client/server bundle；不得以恢复任何 legacy raw field 作为回滚手段。
- probe 的 spawn/parse failure 以 bounded error code 或短状态记录，例如 `probe-failed`、`catalog-unavailable`、`runtime-model-metadata-absent`。原始 stderr、auth/login 文案、provider 名称、exception message 和配置路径既不写入 public cache note，也不被 dashboard/CLI summary 复制；必要的原始诊断只遵循既有受控 raw-log 访问边界。
- 运行时 metadata 声称多个模型时，Hopper 只记录 vendor 给出的值，不推断 primary、费用归属或 fallback 原因。
- cache stale 不使历史 attestation 失效；它只降低 catalog snapshot 的 freshness。runtime evidence 缺失时不得由 stale/fresh catalog 推导 resolution。
- malformed new fields、future schema fields、未知 source kind 或未知 resolution string 都不得中断读取；它们规范化为 `unknown`/`unverified` 并保留旧 result 行为。

## 实施边界与分阶段 rollout

实施 landing sequence 是强制顺序，不是扩大本协议的额外 lifecycle feature：先冻结 types/metadata 与 strict comparator contract，再让 parser-to-finalizer 数据流收口，然后写 file-backed protocol/readers，之后才接 cache public projection 与 dashboard v2，并在每步完成对应 fixture/compat 断言后进入下一步。共享 lifecycle 文件的阶段边界、revalidation、idle/terminal sequencing 仅作为实施检查项：必须确认新字段没有改变一次 spawn、唯一 terminal event、resume/revalidation 或 timeout 行为，但本设计不新增 lifecycle phase、状态转换或跨任务协议。

### Phase 1：合同与数据路径

1. **Types、adapter metadata、比较边界：** 在 `cli/src/types.js` 的 adapter/result contract 加 raw/effective selector provenance、`alias|concrete|auto|unknown` selector metadata 与 optional `modelAttestation`；实现 versioned selector-metadata envelope/schema、binding validator 和每个 selector record 的 exact-literal discriminated union（alias/auto 无 expected identity，concrete 仅一个 expected pair）。Claude/OpenCode 只从 sanitized/versioned capabilities cache 或 adapter 发布的 versioned manifest 零 spawn 分类，Kimi 仅声明可证实的 exact record。扩展 `cli/src/model-normalize.js` 为唯一 comparison boundary，令 `cli/src/model-check.js` 与 `cli/src/dispatch.js` 调用明确分离的 validation/strict-runtime modes；strict mode 不得调用 `modelKeysMatch`，adapter 不实现第二个 canonicalizer。
2. **所有 parseResult 消费点：** Claude parser 仅接受 terminal completion envelope 中经 metadata/fixture 验证的 `modelUsage` actual-ID field；OpenCode parser 仅接受其结构化 terminal result 中经 metadata/fixture 验证的完整 provider/model pair；Kimi 只保留可证实的 config-only evidence，直至其 result 有稳定 actual-model 字段。`cli/bin/hopper-runner` 和 `cli/src/dispatch.js` 都必须透传 optional `modelAttestation`，而不是只取 text/status/usage；任何缺失、request echo 或 schema drift 都产生无 runtime evidence。
3. **File protocol：** `cli/src/background.js` 负责启动 snapshot；shared terminal-attestation finalizer 由 `cli/bin/hopper-runner` 与同步 `--write` path 共用，负责 scalar-safe `observed_models_json`、从 0 到恰好 1 条 terminal JSONL event 与 canonical terminal frontmatter；它必须按“append event 成功、再 atomic frontmatter”的唯一顺序处理两路径的 crash window。orphan reaper 只可在 late reread 后做 frontmatter-only idempotent repair，并且只能 merge allowlisted safe catalog/binary fields，绝不追加第二 terminal event。`cli/src/progress.js` 更新全部新增字段的 `OPTIONAL_EVENT_FIELDS`。实现遵从本设计的 frontmatter-canonical/finalizing precedence，且不改变 idle/ceiling 或 terminal-event 数量，更不得写 `status=finalizing|partial`。
4. **Read surfaces：** `cli/bin/hopper-dispatch` 的 result/progress reader 对缺/坏 frontmatter/status 使用安全降级，且二者使用 shared canonical-attestation reader；models/setup/capabilities/check-model 全部使用 public cache projection。同步 `--write`、后台 finalization、`--result` 与 `--progress` 的字段、writer 和优先级必须先以 shared finalizer/reader 收口，再启用新 output field。
5. **Cache：** `cli/src/cache.js` 保持 v1，先加入 diagnostics-aware reader 以区分 missing、ok-v1、version mismatch 与 malformed，再加入 owned-field additive merge、unknown-field preservation 和 version-mismatch-as-unknown/no-write/byte-preservation 行为；实现并测试 `hopper-dispatch --probe <vendor> --recover-cache`（或等价的新 `--recover-cache <vendor>` command）的 owner-only named backup、fixed retention、backup-failure abort 与 atomic replace。普通 setup/capabilities/probe 仅返回 closed diagnostic+hint，绝不写。`cli/src/vendor-probe/kimi.js` 及其他 probe 只产生 canonical closed source label/diagnostic code；它们不将 config path、stderr、auth 或 provider text 放入 public entry。
6. **Dashboard privacy migration：** 先发布 null-safe client，再经 feature gate 启用永久 shape-compatible safe shim（legacy `notes=[]`、`cacheError=null`、`modelsSource=null`、`binaryPath=null`），随后验证 recursive closed-set response projection 与 old/new server-client 的 missing/null/unknown/future-enum rendering。legacy key removal 留给未来 breaking contract，不属于本阶段覆盖门禁。更新 `dashboard/server/routes/vendors.js`、API schema、`dashboard/client/src/lib/types.ts` 与 `VendorCard` 只传输/读取六个 v2 safe binary/source/diagnostic closed fields；发布说明、compat behavior 与不重新泄露 raw field 的 rollback procedure 是此步骤的交付物。
7. **镜像与验证边界：** 根 `cli/` 与 `plugins/hopper/cli/` 是发布镜像，实施时两套受影响代码必须保持字节级同步并由现有镜像 hash test 验证；本设计不授权只改其一。

实施/验证还必须记录实际 sandbox execution evidence。外部 reviewer 即使被请求 read-only，也可能尝试写入用户级状态（例如 home/cache/config）；这种风险不改变本 attestation 的 file/data protocol，也不授权扩大其范围。后续实现或验证报告只能陈述已观测到的 sandbox、命令和写入证据；除非该证据存在，不得宣称执行为严格 no-write。

### Phase 2：小范围启用与审计

先启用 Claude、OpenCode 与 Kimi 三条路径。以 fixture-based tests 验证稳定 result schema，保留 raw log 作为 parse drift 的有限诊断证据。其他 adapter 继续输出 `unverified`，直至各自有明确 selector 和 runtime metadata 合同。Phase 1 实现完成后冻结 diff，再按既定检查点做独立只读审查；普通修复不重复整组三方审查。

### Phase 3：文档与兼容验证

更新 CLI help/cookbook、dashboard API/rendering 和 vendor capability notes，使其使用同一词汇。旧 handoff/cache、缺少 binary 的机器、Windows path resolution 及受限 account 必须保持可读且不泄密。

rollout 不要求 rewrite history，不改变 package/lock，不发布或 push。功能默认为 additive observability；现有任务完成/失败的 vendor status 逻辑不依赖 resolution status。

### Hopper 执行层冻结与验收门禁

以下是 Hopper 执行层的验证要求，不是 attestation status、resolution 或 file protocol 的新字段。任何冻结、hash、diff、验收或 task-dispatch preflight 命令必须显式指定目标路径，不能依赖当前 cwd；例如目标仓库命令使用 `git -C F:\workspace\ai\hopper-plugin ...`，协议仓库命令使用 `git -C F:\workspace\project\thunderfire-audio ...`。开始前必须分别断言两者的 `rev-parse --show-toplevel` 等于各自的绝对 top-level，且 target status/diff/hash 与 protocol queue/handoff 的冻结记录逐项一致。若 OpenCode execution layer 创建 snapshot、隔离 checkout 或其他工作副本副作用，只能记录为执行层 evidence（命令、cwd、实际写入），不得写入 attestation 文件、修改 attestation status 或被误称为 runtime model proof。该门禁防止默认 cwd 误判，不改变任务的 runtime attestation 结论或 status。

## 测试矩阵

| 类别 | 场景 | 必要断言 |
| --- | --- | --- |
| Claude alias | request `fable`，runtime `modelUsage` 枚举 `claude-*` | `selector_kind=alias`、observed array 保留、`alias-resolved`，不产生 mismatch。 |
| Claude concrete exact | request full `claude-*` ID，runtime 同 ID | `exact`。 |
| Claude concrete mismatch | request full ID，runtime 明确不同 ID | `mismatch`，任务仍按 vendor 成功终态完成，无 retry/fallback。 |
| Claude absent metadata | alias 成功但 envelope 无模型字段 | `unverified`，不由 usage、prose 或 knownGood 推断。 |
| Claude/OpenCode zero-spawn selector metadata | schema v1 cache envelope/manifest、vendor-adapter-catalog binding、validity/time/version、每条完整 selector literal、alias/auto/concrete discriminated record、唯一 expected `{provider,model}`、duplicate/conflicting literal、unknown forward field；fixtures 覆盖 `fable`、`sonnet`、`sonnet[1m]`、`best`、`default`、`opusplan`、未枚举 `[N_unit]` | dispatch 不 spawn/probe/network；只对 post-policy effective selector 用有效 envelope 分类，且不建立 alias→actual 映射；unsupported schema/adapter mismatch/过期/缺失/malformed/duplicate/未枚举为 `selector_kind=unknown`、`unverified`，绝不 false `mismatch`/`alias-resolved`。 |
| OpenCode concrete | request `provider/model`，runtime 同/不同 ID | 分别为 `exact`/`mismatch`；比较仅用 `model-normalize` 的 strict runtime path。 |
| Strict identity forms | Claude opaque ID；OpenCode 同 provider/model、不同 provider、bare model、额外 namespace、单边 qualified | 仅完整 Claude ID 或相同 provider+model 的 pair match；bare 与 namespaced 永不等价，歧义/不可比较为 `unverified`；不得调用 `modelKeysMatch`。 |
| Concrete status truth table | one strict match 加其它不匹配项、全部 comparable non-match、空 observed、任一 malformed/ambiguous/bare-vs-namespaced 不可比较项、metadata expected pair 缺/坏 | 有至少一个 match 即 `exact`；只有所有 observed 都有效可比较且全部非等才 `mismatch`；其余为 `unverified`。 |
| Selector provenance | raw request 与 policy effective selector 相同、被替换、被 policy 清空为 vendor default | 同时保存 requested/effective/source；仅 effective 被比较；raw 不得被 observed 回填。 |
| Kimi config-only | binary missing，配置枚举 alias，且 runtime 无 actual ID | `config-only`、binary missing、无完整 config path 泄露。 |
| Kimi future runtime evidence | config alias 且 runtime 返回 actual ID | `alias-resolved` 优先于 config-only。 |
| Auto | 未传 `--model`，有或无 observed model | `requested_selector=null`、kind `auto`、status `unverified`，observed value仍可见。 |
| Multi-model | runtime 返回重复或多个 IDs | stable first-seen de-dup，JSONL array 与 frontmatter JSON string round-trip 一致。 |
| Parser contract | Claude `modelUsage` actual-ID field；OpenCode structured provider/model pair；两者的 present/absent/malformed/request-echo fixture | `modelAttestation` 只来自允许的 structured field/pair；sync 与 background consumer 不丢失；缺失/歧义时不 throw，且不伪造 exact/alias-resolved/mismatch。 |
| Scalar safety | models 包含引号、反斜杠、换行、control character、`:`、`#`、`---`、`null` 等值 | 仅专用 quoted YAML JSON-scalar encoder 可写入并 round-trip 后 JSON parse；禁止 injection/plain scalar；仅 `Array<string>` 可进入 observed models，`null`/object/非 string member 一律丢弃；JSONL 仍为 array。 |
| Legacy/missing handoff | no frontmatter、缺/非法 `status`、坏/截断/`null` `observed_models_json`、YAML flow-sequence/object/non-string array member | result/progress 不 throw、不调用 undefined method；显示 `unknown`/`unverified` 或 `frontmatter=unavailable`，仍可展示有效 events。 |
| Mid-write protocol | terminal JSONL 已写但 frontmatter in-progress、半写 scalar、frontmatter terminal但JSONL缺失/partial、两者冲突 | 分别验证 `finalizing`/`partial` 仅为 read-side display-only unverified、frontmatter canonical、`attestation_consistency=conflict`；JSONL partial line 被忽略；任何 writer frontmatter 均不写 `status=finalizing|partial`。 |
| Sync/background finalization | 同一 parsed result 分别经 `--write` 同步路径与后台 runner；append failure、frontmatter failure、crash/re-entry、已有 terminal event、orphan reaper late-reread race、partial safe-field merge | 两路径调用同一 finalizer/同一 event-first 顺序；从 0 到恰好 1 条 terminal JSONL event，成功后同字段集/同 resolution；append failure 不写 terminal frontmatter，frontmatter failure 显示 finalizing；reaper 只在唯一匹配 event 且 late reread inputs 未变时做 frontmatter-only idempotent repair，且只 merge six个 allowlisted catalog/binary fields；五类 no-op/merge fixture 均不得重试 append 或产生第二 terminal event。 |
| Optional-event allowlist | 终态 event 带所有新 attestation fields | `OPTIONAL_EVENT_FIELDS` 保留每一字段，JSONL round-trip 不丢值。 |
| Cache/probe semantics | missing cache、旧 v1 entry、含 root/vendor/nested unknown future field 的 v1 entry、version mismatch、malformed cache、ordinary setup/capabilities/probe、`--probe <vendor> --recover-cache` success/failure、backup name/ACL/retention/backup failure、完整 inventory version fixture | diagnostics-aware reader 区分 missing/ok-v1/mismatch/malformed；ordinary surface 只给 closed diagnostic+recover hint且不写；仅 missing 初始化、v1 owned fields additive merge 且所有 unknown field 保留；mismatch/malformed 为 unknown、普通 writer no-write，version mismatch 原文件字节不变；explicit recovery 仅在 owner-only backup 成功后 atomic replace fresh-v1，固定 retention，任何 backup/replace failure abort且不降格为 missing；每个 trigger 选 canonical scoped diagnostic code。 |
| Kimi privacy/config-only | binary missing、config alias、provider-list error、config parse error | `config-only` 与固定 safe label；cache/API/CLI 不含 home/config path、stderr、auth/provider 或 exception text。 |
| `--check-model` semantics | known-good、catalog-only、not-found 的 JSON/text | 保留兼容 exit code；明确 `selector_valid` 与 `runtime_attestation=not-run`，不得输出 runtime resolution。 |
| Rendering/privacy/dashboard migration | `--models`、`--setup`、`--capabilities`、`--check-model`、result/progress、permanent safe-shim/v2 fixture、old/new server-client matrix、six-field future-enum 与 rollback fixture | 六个 v2 public field 各自断言 closed/unknown(nullable basename)；每个 public surface 的 `source_label`/`diagnosticCode` 都断言为 canonical closed enum，unknown/future/raw 值归一 unknown；API response 的 recursive closed-set key/value scan 在每一嵌套 depth 断言 forbidden `sourceNote`、raw path/URL/stderr/auth/provider values，并且只允许 legacy `notes=[]`、`cacheError=null`、`modelsSource=null`、`binaryPath=null` 这四个 exact safe value。old client 不崩卡，新 client 忽略 old-server raw legacy field，`inventoryContractVersion` 仅 diagnostic；rollback bundle 只保持 safe shim/disable card，仍不重现 raw fields；legacy key removal 不属于本阶段 fixture gate。 |
| Protocol invariants | sync 与 background terminal write | 一次 vendor spawn、从 0 到恰好 1 条 terminal JSONL event、attestation 不影响 idle/ceiling timeout；负向断言 frontmatter 不写 `finalizing`/`partial` status。 |
| Lifecycle implementation checks | shared lifecycle/revalidation file fixtures | 仅验证既有阶段边界与 revalidation 未被 attestation 改变；不引入新的 lifecycle protocol state。 |
| Execution evidence | 任何外部 reviewer/verification invocation | 报告实际 sandbox、命令与观测写入；没有此证据时不标为严格 no-write。 |
| Freeze/acceptance cwd gates | target 与 protocol repo 的 status/diff/hash/dispatch preflight | 每个命令显式 `git -C` 对应绝对路径；先分别断言两个 top-level，再比较冻结记录；默认 cwd 不得参与判定，且结果不改 attestation status。 |

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
