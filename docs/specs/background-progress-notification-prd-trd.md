# Background Progress and Completion Notification PRD/TRD

Status: draft v0.4 — third-party review incorporated (v0.3 review patches applied 2026-05-22)
Date: 2026-05-22
Repo: hopper-plugin

## 1. Background

hopper-plugin already supports async dispatch for long-running vendor tasks. Today the user can start a background job, inspect `*-output.md` frontmatter, follow `*-output.log`, or use dashboard SSE for live logs. This is enough to know that a process exists, but not enough to answer the operational question users now ask during long tasks:

> What is the agent doing right now, how far did it get, and will I be told when it is done?

The reference experience is `openai/codex-plugin-cc` used from Claude Code:

- user delegates work to Codex through a Claude background subagent;
- later the user says "check progress";
- Claude reports recent Codex activity, such as files inspected, commands run, wrong assumptions corrected, and current phase;
- when the background agent completes, the Claude harness can notify the main session.

This spec proposes a host-agnostic version for hopper-plugin.

## 2. Research Summary

### 2.1 codex-plugin-cc progress source

`/codex:status` is not reading hidden model reasoning and is not primarily a Claude Code Monitor feature. It is a frontend over local state and logs populated by Codex app-server notifications.

Evidence:

- `/codex:status` runs `codex-companion.mjs status` with `disable-model-invocation: true`: https://github.com/openai/codex-plugin-cc/blob/main/plugins/codex/commands/status.md
- background task setup writes job records and progress logs in `codex-companion.mjs`: https://github.com/openai/codex-plugin-cc/blob/main/plugins/codex/scripts/codex-companion.mjs
- progress reporter writes log lines and updates job phase/thread/turn in `tracked-jobs.mjs`: https://github.com/openai/codex-plugin-cc/blob/main/plugins/codex/scripts/lib/tracked-jobs.mjs
- `job-control.mjs` reads job state and log previews for status output: https://github.com/openai/codex-plugin-cc/blob/main/plugins/codex/scripts/lib/job-control.mjs
- `codex.mjs` maps app-server item events to progress messages, including `commandExecution`, `fileChange`, `mcpToolCall`, `dynamicToolCall`, and `webSearch`: https://github.com/openai/codex-plugin-cc/blob/main/plugins/codex/scripts/lib/codex.mjs
- Codex app-server documents turn and item notifications as the structured event stream: https://developers.openai.com/codex/app-server

Conclusion: the portable core is a local progress state machine plus event log. Codex app-server is a high-fidelity provider for Codex vendor jobs. Other vendors emit coarse phase (`running` / `done` / `failed` / `timeout` / `cancelled` / `orphaned`) in v1; fine-grained phases (`investigating` / `editing` / `verifying` / `finalizing`) require `vendor=codex` with `source=native-app-server`.

### 2.2 Claude Code completion notification source

The observed "harness will automatically notify when completed" behavior must be split from progress tracking.

Claude Code has host-native mechanisms:

- background Agent/subagent completion returns a result to the parent session;
- Bash can run commands in background;
- Monitor/plugin monitors can send stdout-line events back to Claude.

However, `codex-plugin-cc` can create a double-background shape:

1. Claude background subagent starts.
2. The subagent acts as a thin wrapper and forwards to `codex-companion task --background`.
3. The wrapper subagent may complete quickly.
4. The actual Codex job continues under Codex companion state.

Evidence:

- `rescue.md` says `--background` and `--wait` are Claude Code execution flags and routes through the `codex:codex-rescue` subagent: https://github.com/openai/codex-plugin-cc/blob/main/plugins/codex/commands/rescue.md
- `codex-rescue.md` says the subagent is a thin forwarding wrapper and must not monitor progress or poll status: https://github.com/openai/codex-plugin-cc/blob/main/plugins/codex/agents/codex-rescue.md
- `review.md` says Claude Code's `Bash(..., run_in_background: true)` is what detaches the review command in that flow: https://github.com/openai/codex-plugin-cc/blob/main/plugins/codex/commands/review.md

Conclusion: wrapper completion is not the same as vendor job completion. hopper-plugin must produce completion notifications from hopper's own terminal job state.

## 3. Product Requirements

### 3.1 Goals

1. A user can ask for progress on an active background task and get a concise answer with current phase, recent findings/actions, elapsed time, and output/log paths.
2. A user can be notified once when a background task reaches a terminal state.
3. The capability works across supported hosts: standalone CLI, Claude Code, Codex CLI, OpenCode, and dashboard.
4. The capability works across supported vendors, with richer progress for Codex via app-server and graceful fallback for Kimi/OpenCode/Copilot/Agy.
5. The design keeps hopper's existing no-retry/no-fallback/single-dispatch philosophy.

### 3.2 Non-goals

- Do not expose hidden model reasoning or private chain-of-thought.
- Do not implement automatic vendor retry or fallback.
- Do not bind the design to Claude Code Monitor or Codex app-server as required dependencies.
- Do not make host wrapper completion the source of truth for vendor job completion.
- Do not require dashboard to be running for CLI progress or completion state.

### 3.3 User stories

- As a user, I can run a long background task and later ask "check progress" to see the latest meaningful activity.
- As a user, I can leave the session alone and still receive a completion event when the task is done, failed, timed out, cancelled, or orphaned. Auto-wake is native only on Claude Code host (plugin monitor); other hosts surface completion via OS toast (Win/macOS/Linux) emitted by `hopper-monitor`, or via the user attaching a watcher manually.
- As a reviewer agent, I can inspect a stable progress log and output frontmatter without parsing raw vendor logs.
- As a host adapter author, I can bridge hopper terminal events into my host's native notification mechanism without changing the runner core.

## 4. Functional Requirements

| ID | Requirement | Priority |
|---|---|---|
| FR-001 | Write a per-task progress sidecar at `.hopper/handoffs/<task-id>-progress.log` as JSONL. Only in `--background` mode; sync mode unchanged. | P0 |
| FR-002 | Extend `*-output.md` frontmatter with progress summary fields. | P0 |
| FR-003 | Add `hopper-dispatch --progress <task-id>` for current status and recent progress. | P0 |
| FR-004 | Add a terminal event when a task enters `done`, `failed`, `timeout`, `cancelled`, or `orphaned`. | P0 |
| FR-005 | Add a watch/monitor command that emits terminal events as stdout JSONL for host bridges. | P0 |
| FR-006 | Implement Codex vendor native progress via Codex app-server in the first version when available. | P0 |
| FR-007 | Implement generic stream parser fallback for non-Codex vendors and Codex app-server-unavailable cases. | P0 |
| FR-008 | Keep dashboard progress and terminal notification based on the same files/events as CLI. | P1 |
| FR-009 | Provide host-specific bridges for Claude Code, OpenCode, Codex CLI, and standalone usage. | P1 |
| FR-010 | `reapStaleJobs` must append a terminal event to `progress.log` when transitioning a task to `orphaned`. | P0 |
| FR-011 | `hopper-monitor` / `--watch-events` must emit OS-level toast notifications (Win/macOS/Linux) in addition to stdout JSONL, so hosts without native wake (Codex CLI / standalone) still surface terminal events to the user. | P1 |

## 5. Non-functional Requirements

| ID | Requirement | Target |
|---|---|---|
| NFR-001 | Progress update latency | Best effort under 2s from event/log chunk to state write. |
| NFR-002 | Terminal notification latency | Best effort under 5s for file-watch based bridges. |
| NFR-003 | Memory bound | No unbounded stdout/stderr accumulation; use tail/ring buffers. `progress.log` per-task ceiling 10 MB; overflow rotates to `.1` (runner-managed). |
| NFR-004 | Backpressure safe | Pipe-based capture must respect stream backpressure. |
| NFR-005 | Host agnostic | Core state and terminal events live in CLI/runner, not host wrappers. |
| NFR-006 | Failure safe | Parser or progress writer failure must not strand the task in `in-progress`. |
| NFR-007 | Compatibility | Existing `--background`, `--watch`, `--jobs`, `--reap` continue to work. |

## 6. Technical Design

### 6.1 Architecture

The design has two planes.

Progress Plane:

- captures ongoing activity;
- updates `phase`, `last_progress`, and recent event history;
- powers `--progress`, dashboard progress view, and "check progress" answers.

Notification Plane:

- watches for terminal state transitions;
- emits exactly-once completion events per task/run;
- lets host-specific bridges wake the user/session.

Both planes share the same source of truth: hopper runner state files under `.hopper/handoffs`.

### 6.2 State files

Existing:

- `.hopper/handoffs/<task-id>-output.md`
- `.hopper/handoffs/<task-id>-output.log`

New:

- `.hopper/handoffs/<task-id>-progress.log`

Recommended `output.md` frontmatter additions:

```yaml
status: in-progress
phase: investigating
last_progress_at: "2026-05-22T12:10:00.000Z"
last_progress: "Scanned 23 test files; verifying actual ControlBar component path."
progress_seq: 18
progress_log: ".hopper/handoffs/T-EXAMPLE-progress.log"
raw_log: ".hopper/handoffs/T-EXAMPLE-output.log"
vendor_session_id: null
terminal_event_emitted: false
```

Recommended progress JSONL event:

```json
{"seq":18,"ts":"2026-05-22T12:10:00.000Z","task_id":"T-EXAMPLE","vendor":"codex","phase":"investigating","kind":"finding","message":"Actual component is ControlBar, not Toolbar.","source":"native-app-server","terminal":false}
```

Recommended terminal event:

```json
{"seq":42,"ts":"2026-05-22T12:18:44.000Z","task_id":"T-EXAMPLE","vendor":"codex","phase":"done","kind":"terminal","message":"Task completed successfully.","source":"runner","terminal":true,"status":"done","duration_ms":524000}
```

### 6.3 Phase model

Two-tier model — coarse phase is universal across vendors, fine phase is provider-capability-gated.

**Coarse phase (all vendors, all providers)**:

- `queued`
- `starting`
- `running`
- `done`
- `failed`
- `timeout`
- `cancelled`
- `orphaned`

**Fine phase (only when `vendor=codex` AND `source=native-app-server`)** — refines `running` into:

- `investigating`
- `editing`
- `verifying`
- `finalizing`

`status` remains the terminal/coarse state. `phase` carries the coarse value for generic vendors; `phase` may carry a fine value only when the active provider's `capability` includes `fine-phase`. Subscribers must tolerate `phase=running` (no further refinement) for non-Codex vendors and treat fine-phase values as Codex-specific.

### 6.4 Progress providers

Provider interface:

```js
{
  mode: "native-app-server" | "stream-parser" | "raw-tail",
  capability: "fine-phase" | "coarse-phase" | "terminal-only",
  start(context): Promise<RunResult>
}
```

Runner selects provider based on vendor capability declarations, not vendor name. v1 mapping:

- `native-app-server` → `capability: "fine-phase"` (Codex app-server only)
- `stream-parser` → `capability: "coarse-phase"` (generic; Kimi/OpenCode/Copilot/Agy and Codex fallback)
- `raw-tail` → `capability: "terminal-only"` (fallback when stream parser is disabled or risky for a vendor)

Codex native provider:

- applies when `vendor === "codex"` and app-server is available;
- starts/resumes a Codex app-server turn;
- maps app-server notifications to progress events;
- captures thread/turn IDs for cancellation/resume if available;
- falls back to stream parser if app-server cannot initialize.

Generic stream parser:

- applies to Kimi/OpenCode/Copilot/Agy and Codex fallback;
- runs the vendor CLI through `stdout`/`stderr` pipes;
- tees output to raw log;
- parses chunks into coarse events;
- never blocks final result parsing if progress parsing fails.

Raw-tail fallback:

- applies when stream parser is disabled or too risky for a vendor;
- emits low-fidelity events such as "raw output updated";
- still emits terminal events.

### 6.5 Runner pipe/tee requirements

Current `hopper-runner` redirects vendor stdout/stderr directly to file descriptors. To parse live progress, runner must use pipes for the progress-capable path.

Risks that must be addressed:

- child process can block if stdout/stderr pipes fill and parent does not drain them;
- `write()` to raw log streams can return `false`, requiring pause/resume on `drain`;
- child `exit` is not enough; final parse should wait for child `close` and log stream `finish`;
- stdout/stderr relative ordering may differ from old shared append-file behavior;
- when tee-ing to raw log, the stream tag (`stdout` / `stderr`) must be preserved on each `write()` call — do not merge into a single concat buffer before regex;
- `parseResult` implementations must not rely on cross-stream ordering (codex/kimi/agy currently regex stderr separately — that contract must be kept across the pipe+tee migration);
- parser exceptions must be isolated from job completion (try/catch around progress writer; vendor exit path independent);
- memory must be bounded with ring buffers/tails (do NOT replicate the `stdoutTail += chunk` pattern from `cli/src/subprocess.js`);
- timeout and `killProcessTree()` semantics must remain unchanged;
- progress frontmatter writes must be throttled to ≤ 0.5 Hz (≤ 1 write per 2 s) to avoid write storms and races with final completion writes; `progress.log` JSONL appends are not throttled;
- `progress.log` and raw log have **no write-order guarantee** between them; progress events are monotonic only by their internal `seq` field.

Node documents that child process pipe capacity is limited and subprocesses can block when output is not consumed: https://nodejs.org/api/child_process.html (the "limited (and platform-specific) capacity" wording is the authoritative claim; the often-cited "64 KB" is the Linux default, not a Node guarantee).

For watching state files in `--watch-events`:

- use `fs.watchFile(path, { interval: 500 })` (polling) — three-platform-consistent; `mtimeMs`/`size` comparison works across `renameSync` and `appendFileSync`;
- do **not** use `chokidar` for `--watch-events` — Windows `ReadDirectoryChangesW` has a ~100 ms atomic-rename window that can drop or duplicate `change` events even with `atomic:true`;
- `chokidar` remains acceptable for the dashboard server, which needs glob watch;
- `tail` implementations (e.g. `dashboard/server/lib/tail.js`) MUST handle truncate (`curr.size < prev.size` → reset offset) and rotate (`curr.ino !== prev.ino` → reset offset and re-stat).

### 6.6 Notification Plane

Add a terminal transition writer in runner:

1. runner determines final adapter status;
2. runner appends a terminal progress event;
3. runner updates `output.md` frontmatter with terminal state and `terminal_event_emitted: true`;
4. watcher commands and dashboard see the same event.

Add one of these commands:

- `hopper-dispatch --watch-events [--once]`
- or `hopper-monitor [--once]`

Recommended stdout JSONL shape:

```json
{"type":"hopper.task.terminal","task_id":"T-EXAMPLE","status":"done","phase":"done","vendor":"codex","output_md":".hopper/handoffs/T-EXAMPLE-output.md","progress_log":".hopper/handoffs/T-EXAMPLE-progress.log","raw_log":".hopper/handoffs/T-EXAMPLE-output.log"}
```

Host bridges (with native-wake capability disclosed):

- **Claude Code** (native wake): plugin monitor starts `hopper-monitor`; each stdout JSONL line is delivered to Claude as a notification via the `monitors/monitors.json` mechanism. This is the only host with native session-wake support today.
- **OpenCode, native plugin path** (partial wake): `session.idle` hook fires for OpenCode-native async sessions only; vendor is restricted to `opencode` (see `hosts/opencode/plugins/hopper-async.ts` line 143 hardcoded `adapter: 'opencode'`). Heterogeneous-vendor jobs from OpenCode session must use the wrapper path (no native wake).
- **Codex CLI** (no native wake): Codex `notify.command` only fires on `agent-turn-complete` of Codex itself, not on hopper job terminal events (verified against openai/codex#3052, openai/codex#17532). `hopper-monitor` degrades to OS toast + the user attaches `hopper-dispatch --wait <id>` / `--progress <id>` manually inside the Codex session.
- **Standalone CLI** (no native wake): user runs `hopper-monitor` as a daemon (emits OS toast + stdout JSONL), or attaches `hopper-dispatch --watch-events` / `--watch <id>` in a terminal.
- **Dashboard** (push UI): dashboard server uses `chokidar` to watch `.hopper/handoffs/` and broadcasts via SSE; no OS toast.

`hopper-monitor` is responsible for emitting OS toast on terminal events using platform-native tools: PowerShell `BurntToast` / `wsl-notify-send` on Windows; `osascript -e 'display notification …'` on macOS; `notify-send` on Linux. Toast is dispatched **alongside** the stdout JSONL line, by the same process — host-agnostic.

### 6.6.1 Subscription Path Selection

Each task has at most **one** native-wake subscriber. Multi-terminal observers use pull mode. Terminal events are deduplicated at the file layer (`terminal_event_emitted` in frontmatter + `terminal:true` JSONL tail line), so multi-subscribe is correctness-safe but will produce duplicate OS toasts.

| Scenario | Recommended wake path | Pull fallback |
|---|---|---|
| Claude Code main session | plugin monitor → `hopper-monitor` → stdout JSONL → Claude notification | `/hopper:result <id>` |
| Claude Code background subagent | do not subscribe; parent session's monitor receives | parent session |
| Codex CLI session | no native wake; user runs `hopper-dispatch --wait <id>` (blocking) inside the session; OS toast emitted by separate `hopper-monitor` daemon if running | `hopper-dispatch --result <id>` |
| OpenCode session, native plugin path | plugin `session.idle` hook (already implemented) | dashboard / read frontmatter |
| OpenCode session, wrapper path | degrades to standalone behavior; user runs `--watch <id>` | `--result <id>` |
| Standalone shell | `hopper-monitor` daemon → OS toast | `--watch <id>` / `--progress <id>` |
| Dashboard | server-side `chokidar` → SSE (one dashboard process per machine) | — |
| CI / script | `hopper-dispatch --watch <id>` blocking + exit code | — |

Constraints:

1. At most **one `hopper-monitor` instance per machine** — OS toast dedup is the user's responsibility, not hopper's.
2. Dashboard and `hopper-monitor` may coexist (push UI + OS layer, non-conflicting).
3. Pull mode (`--watch <id>` / `--result <id>` / `--progress <id>`) is always safe regardless of which subscribers are active.

### 6.7 Host/vendor compatibility

| Host | Vendor | Supported? | Notes |
|---|---|---|---|
| Claude Code | Codex | Yes | Richest path: Claude monitor bridge + Codex app-server provider (`capability: fine-phase`). |
| Claude Code | Kimi/OpenCode/Copilot/Agy | Yes | Progress from generic stream parser (`capability: coarse-phase`). |
| Codex CLI | Any configured vendor | Yes | Codex host wraps `hopper-dispatch`; vendor routing remains in hopper. **No native session wake** — `hopper-monitor` emits OS toast; user pulls via `--wait` / `--result` inside session. |
| OpenCode (wrapper path) | Kimi/Copilot/Codex/Agy | Yes | Uses dispatcher; degrades to standalone behavior for wake — no native `session.idle` involvement. |
| OpenCode (native plugin path) | opencode only | Restricted | Plugin hardcodes `adapter: 'opencode'` and bypasses `resolveDispatch` (`hosts/opencode/plugins/hopper-async.ts:103,143`). `progress.log` written only at state transitions (≤ 1 Hz; no heartbeat). Heterogeneous-vendor jobs MUST use the wrapper path. |
| Standalone CLI | Any configured vendor | Yes | No host notification unless user runs `hopper-monitor` or `--watch-events`. |
| Dashboard | Any configured vendor | Yes | Reads the same files and events. |

Key rules:

1. Host completion is advisory; runner terminal state is authoritative.
2. Vendor selection comes from `.hopper/AGENTS.md`, not from the host — preserved end-to-end (enforced by `cli/src/dispatch.js::resolveVendor`).
3. The OpenCode native plugin path is the only path that legitimately writes `progress.log` outside the runner; it does so only at session state transitions and at ≤ 1 Hz (no heartbeat). Subscribers must tolerate sparser `last_progress_at` on this path.

## 7. Implementation Plan

### Phase 1: State and CLI progress

- Add progress log writer/reader helpers.
- Extend background frontmatter schema.
- Add `--progress <task-id>`.
- Add terminal event append in runner finalization.
- Add unit tests for schema, event append, and progress rendering.

### Phase 2: Generic stream parser

- Introduce safe pipe/tee path in runner.
- Keep fd-redirect path available if needed for fallback.
- Add parser interface and vendor-neutral parser.
- Add tests for backpressure, stream errors, timeout, and final parse.

### Phase 3: Codex native provider

- Add Codex app-server progress provider for `vendor=codex`.
- Map app-server notifications to shared event schema.
- Persist thread/turn IDs when available.
- Add fallback to stream parser.

### Phase 4: Notification bridges

- Add `hopper-monitor` or `--watch-events`.
- Add Claude plugin monitor config if supported in this plugin packaging.
- Wire dashboard to terminal events.
- Document OpenCode/Codex host caveats.

## 8. Acceptance Criteria

1. A background task writes `output.md`, `output.log`, and `progress.log`.
2. `hopper-dispatch --progress <task-id>` shows phase, elapsed time, last progress, and last 5 progress events.
3. A successful task appends exactly one terminal event.
4. A failed/timed-out task appends exactly one terminal event with correct status.
5. Codex vendor job uses app-server progress when available and emits command/file/tool/search events.
6. Non-Codex vendor job emits at least coarse progress and terminal events.
7. Pipe/tee path does not deadlock under high output volume.
8. Existing `--background`, `--watch`, `--jobs`, and `--reap` behavior remains compatible.
9. Claude Code host bridge can notify completion from hopper terminal event, not wrapper completion.
10. Dashboard renders progress/terminal updates from the same state files.
11. `reapStaleJobs` writes exactly one terminal event to `progress.log` when reclassifying an in-progress task as `orphaned`; running it twice on the same task appends nothing extra (idempotent via `terminal_event_emitted`).
12. Two concurrent `--watch-events` subscribers both receive every terminal event (broadcasting is file-watch-based, not in-memory queue).
13. Sync-mode dispatch (no `--background`) does not create `progress.log`; behavior is byte-identical to v0.6.0-phase-6c.
14. Codex vendor `parseResult` correctly extracts tokens from stderr after pipe+tee migration (no cross-stream merge corruption).
15. High-volume vendor output (≥ 10 MB stdout) keeps runner RSS < 50 MB; `progress.log` rotates to `.1` when exceeding 10 MB.
16. On Codex CLI host, `hopper-monitor` emits exactly one OS toast per terminal event (Windows BurntToast / macOS osascript / Linux notify-send) alongside the stdout JSONL line.
17. OpenCode native plugin path writes a single terminal-event row to `progress.log` on `session.idle` / `session.error`; no heartbeat rows appear on this path.
18. `tail` implementation reading `progress.log` handles truncate (size shrink → offset reset) and rotate (inode change → offset reset and re-stat) without losing the first line of the new file or re-reading the old content.

## 9. Open Questions

1. Should the monitor command live as `hopper-dispatch --watch-events` or a separate `hopper-monitor` binary?
2. Should progress frontmatter be updated on every event, or debounced at a fixed interval?
3. Should Codex app-server provider replace `codex exec` for background Codex jobs, or be an optional mode selected by capability/env?
4. How should the OpenCode native async plugin be refactored so it does not bypass dispatcher/vendor routing?
5. ~~Should terminal event deduplication use `terminal_event_emitted` in frontmatter, an event-id file, or progress log scan?~~ **Resolved (v0.4)**: `terminal_event_emitted: true` in frontmatter is authoritative for writers (runner + `reapStaleJobs` + OpenCode plugin all check this flag before appending); the JSONL tail line `terminal: true` is the streaming signal for subscribers; each subscriber maintains its own `last_seen_seq`. No central dedup state.

## 10. Third-party Review Assignment Prompt

```text
你是第三方架构审查 agent。请对 hopper-plugin 的“后台任务实时进度 + 完成通知”方案做只读审查，不要修改代码。

工作目录：
F:\workspace\ai\hopper-plugin

必读文档：
docs/specs/background-progress-notification-prd-trd.md

审查目标：
确认这份 PRD/TRD v0.3 是否准确、可落地，尤其要判断它是否正确理解了 openai/codex-plugin-cc 的进度/通知机制，以及是否能在 hopper-plugin 的多 host / 多 vendor 架构里实现。

背景要点：
1. openai/codex-plugin-cc 的 /codex:status 主要来自本地 job state/log + Codex app-server notifications，不是 Claude Code 隐藏 reasoning，也不是单纯 Claude Monitor。
2. Codex app-server 可提供 turn/item notifications，例如 commandExecution、fileChange、mcpToolCall、dynamicToolCall、webSearch，可生成结构化 progress。
3. Claude Code background Agent/subagent 完成后可以通知主会话；Monitor/plugin monitors 可以把后台脚本 stdout 行作为事件送回 Claude。
4. 但 codex-plugin-cc 的 /codex:rescue --background 可能是 double-background：Claude background subagent 只是 thin wrapper，真实 Codex job 仍在 codex-companion 的后台 task 里跑。所以 wrapper 完成 != vendor job 完成。
5. hopper 的完成通知必须绑定 hopper runner/job terminal state，而不是绑定 host wrapper/subagent 完成。

拟定方案摘要：
1. Progress Plane：
   - 新增 .hopper/handoffs/<task-id>-progress.log JSONL。
   - 扩展 <task-id>-output.md frontmatter：phase、last_progress_at、last_progress、progress_seq、progress_log、raw_log、vendor_session_id?、terminal_event_emitted。
   - 新增 hopper-dispatch --progress <task-id>。
   - vendor=codex 首版支持 Codex app-server native progress bridge。
   - 其他 vendor 使用 runner pipe+tee + stream-parser fallback。

2. Notification Plane：
   - 当 task 状态进入 done | failed | timeout | cancelled | orphaned 时写入 terminal progress event。
   - 新增 hopper-dispatch --watch-events [--once] 或 hopper-monitor，监听 output.md/progress.log 的终态变化，stdout 输出 JSONL。
   - Claude Code host 可通过 plugin monitors/monitors.json 自动启动 hopper-monitor，让 Claude 被 terminal event 唤醒。
   - Dashboard 通过 chokidar/SSE 订阅同一 terminal event。
   - OpenCode native session.idle 只能作为 OpenCode-native completion 辅助；异构 vendor 仍以 hopper runner terminal event 为准。
   - Codex host hooks/notify 只能作为 Codex 自身 turn completion 或 OS notification 辅助，不能替代 hopper terminal event。

请重点审查这些问题：
1. 对 codex-plugin-cc 的理解是否正确？请尽量引用具体文件/函数或官方文档。
2. “wrapper 完成 != vendor job 完成”这个判断是否正确？方案是否充分规避了这个风险？
3. Progress Plane / Notification Plane 分层是否合理？terminal event 是否应该做成 host-agnostic event log + host-specific bridge？
4. Codex app-server native bridge 放进首版是否会污染通用架构？应如何通过 capability/provider 隔离？
5. 当前 hopper-plugin 的 host/vendor 分层是否支持：
   - Claude Code host -> Codex vendor
   - Codex CLI host -> OpenCode vendor
   - OpenCode host -> Kimi vendor
   - OpenCode host -> Copilot vendor
   - standalone CLI/dashboard -> any configured vendor
6. OpenCode native async plugin 是否会绕过 dispatcher/vendor routing？如果会，PRD/TRD 是否已经充分标注风险？
7. runner 从 fd redirect 改为 pipe+tee 是否存在 backpressure、exit/close、日志顺序、内存、timeout/killProcessTree、parser crash 等风险？方案是否覆盖充分？
8. 首版最小可交付范围应该是什么？哪些内容应降级到后续版本？
9. 还需要哪些验收用例和回归测试？

建议查看的本地文件：
- cli/bin/hopper-runner
- cli/bin/hopper-dispatch
- cli/src/background.js
- cli/src/vendors/codex.js
- cli/src/vendors/opencode.js
- cli/src/vendors/kimi.js
- cli/src/vendors/copilot.js
- hosts/codex-cli/README.md
- hosts/opencode/README.md
- hosts/opencode/plugins/README.md
- hosts/opencode/plugins/hopper-async.ts
- docs/release/INSTALL-MATRIX.md
- docs/sidequests/web-dashboard/SPEC.md

建议查看的上游资料：
- https://github.com/openai/codex-plugin-cc
- https://developers.openai.com/codex/app-server
- Claude Code tools reference / subagents / plugin monitors docs
- Node.js child_process stream/backpressure docs

输出格式：
1. 结论：可行 / 有条件可行 / 不可行
2. 你核实过的证据：列出关键文件/函数/文档链接
3. P0/P1 风险：按严重度排序，说明为什么会影响落地
4. 对 PRD/TRD 的修改建议：给出具体章节或字段级建议
5. 建议的首版最小范围：哪些必须做，哪些可以后置
6. 必补验收用例：列出测试场景和预期结果
7. 未确认问题：哪些结论仍需要进一步调研

约束：
- 只读审查，不要改代码。
- 不要泛泛评价，要基于文件、函数、日志机制或官方文档给证据。
- 如果你认为某个假设不成立，请明确指出替代方案。
- 最终回答用中文。
```
