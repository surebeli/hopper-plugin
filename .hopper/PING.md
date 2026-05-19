# Ping Protocol

Anchor: `.hopper/PING.md::root`

This file defines what any LLM CLI session should do when the user types `ping`. It is the **single source of truth** for ping semantics in this project. Bootstrap files at repo root (`CLAUDE.md` / `GEMINI.md` / `AGENTS.md`) only point here.

---

## Forms

### Worker side (Builder / Builder-UI / Executor / Critic / Researcher)

- `ping` — pop the next eligible task for **this session's role**
- `ping <role>` — explicit override: pop next task for `<role>` regardless of session role
- `ping <task-id>` or `ping --task=<task-id>` — **(v5 新增)** pop a specific task by ID, bypassing lex/priority sort（仍需 role 匹配 + deps 满足 + status pending）
- `ping --status` — show queue summary, do not modify anything
- `ping --dry` — show what `ping` would pop, do not modify anything

### Leader side（v3 新增反向通道）

- `review <task-id>` — Leader 读取 task output 文件 + commit + diff，给出 verdict
- `review` — 自动选最近 done 但未 review 的 task 处理
- `review --pending` — 列出所有"done 但 Leader 没 review 过"的 task，让用户挑

---

## Procedure when user types `ping`

> **Steps overview**：0 confirm role → **0.5 refresh shared state** → 1 read queue → 2 find next → 3 lock → 4 read detail → 5 execute → 6 sanity check → 7 mark done in queue → 7.5 write output artifact → 8 append cost log → 9 commit (atomic) → 10 report.

### Step 0 — Confirm role

If you don't know which role you're playing in this session, **ask the user** (don't guess from model name unless they've told you). Example response:

> "I need to know my role first. Available roles in this project: researcher / leader / builder / builder-ui / executor-1 / executor-2 / critic. Which one am I in this session?"

Once told, treat that as your role for the rest of this session. (Form `ping <role>` overrides one-shot.)

### Step 0.5 — Refresh shared state（v4 新增；v5 扩展）

在 read 或 modify 任何 `.hopper/` 下的 shared file（特别是 `queue.md` 与 `PING.md` 本身）之前，**强制 fresh Read from disk**——不要依赖 session 之前的 cache / context。其他 session（sibling Worker / Leader）可能已经更新过。

**v5 扩展**：每次 ping 起手必须 fresh-read 包括 `.hopper/PING.md`。理由：协议自身在 dogfood 中频繁演化（v1 → v4 共 3 次 schema bump in 2 天），session 持有的旧版本 cache 与磁盘最新可能错配；Worker 不重读 PING 会按旧协议执行新 task，导致 step 缺漏（如 v3 引入的 Step 7.5 不写 output.md）。

当对 shared file 用 `Edit` 工具时：

- Edit 的 staleness check（Read-then-Edit 守卫）是最后防线，**不要绕过**
- Edit 失败要求 re-Read 时，**必须先 Read 再 Edit**，不要强写覆盖

**为什么需要这条规则**：dogfood 中发现 Leader 用 Edit 给 `queue.md` 加新 task 时，working tree 是 stale snapshot（落后于磁盘），unrelated 行被回退（HOPPER-FEEDBACK F5）。Step 0.5 把这种风险压到最小。

### Step 1 — Read queue

Read `.hopper/queue.md`. The queue is a markdown table; each row is a task with fields: `ID / Role / Status / Depends / Brief`. **(v5)** 可选 `Priority` 列（值：`high` / `normal` / `low`）；若 row 无该列或值为空，按 `normal` 处理。

### Step 2 — Find next eligible task

**(v5)** 如果 user 用 `ping <task-id>` / `ping --task=<id>` 形式：跳到该 task；仍需验证 (a) `Role` 匹配 session role；(b) `Status: pending`；(c) 所有 `Depends` 已 done。任一不满足 → 拒绝并报"task <id> 不 eligible（原因：role mismatch / status / deps）"。

否则（无 task-id override），从所有 row 中过滤：

1. `Role` matches your current session role (or the override role)
2. `Status: pending`
3. **All** task IDs in `Depends` have `Status: done` somewhere in the queue

排序：

- **(v5)** 先按 `Priority` 降序（`high` > `normal` > `low`；空值视为 `normal`）
- 同 priority 内按 **task ID lexicographic**（T## 字典序；`critic-v1` 等按字面顺序）

挑第一行。若无 eligible task：respond `No eligible tasks for <role>. Queue: <X> pending / <Y> in-progress / <Z> done.` End procedure.

### Step 3 — Lock (pop)

Edit `.hopper/queue.md`: change that row's `Status` from `pending` to `in-progress`. Append a line below the table:

```
- <task-id> started at <ISO timestamp> by <role> (<your model name>)
```

Save the file. **Do this before starting work** — it's the lock.

### Step 4 — Read task detail

Look up full task spec in `.hopper/handoffs/leader-tasklist.md` (find the `**T##**` row). Also read any referenced spec sections (`docs/plans/...`).

### Step 5 — Execute

Do the work per Acceptance criteria. Use whatever tools you have (Read / Edit / Write / Bash etc.).

### Step 6 — Sanity check before claiming done

Don't mark `done` until every Acceptance bullet for the task is verified, **限定本 task 自己 touched 的文件 / 模块**（v4 修订）：

- File-existence checks → confirm with `ls` / Glob
- **Type / build checks**：scope to task-touched files where possible；如发现全 repo `tsc --noEmit` 报错但来自 sibling session 的 untracked WIP / 不相关 pre-existing 错误，**不阻塞本 task**——在 output.md "Decisions / deviations" 段标注 "external blocker, not from this task"
- **Lint checks**：scoped lint（`npx eslint <touched-files>`）；不跑 `npm run lint` 全量
- **Test checks**：可以全跑（tests 通常隔离），但若 fail 不关 task → deviation 段说明，不阻塞 acceptance
- Grep checks → run them（按 spec 给的 pattern）
- Manual verification → state explicitly "manual verification needed: <describe what user should check>" and leave Status `in-progress` until user confirms

**原则**：acceptance 失败必须能 trace 到本 task 自己 touched 的文件；otherwise 在 output.md 标注 external，不阻塞。

**为什么需要这条规则**：dogfood 中 Executor (Kimi) 跑 tsc 时被 sibling Builder 的 untracked WIP file 污染（HOPPER-FEEDBACK P7）。scope-qualify 让 acceptance 在并发场景下仍可信。

### Step 7 — Mark done

Edit `.hopper/queue.md`:

- Change `Status: in-progress` → `Status: done`
- Append below the table:
  ```
  - <task-id> done at <ISO timestamp> — <one-line summary>
  ```

If task **failed** (acceptance can't be met): set `Status: failed`, write a `.hopper/handoffs/blocker-<task-id>.md` with the reason, and **do not advance**. Tell user to escalate to Leader.

### Step 7.5 — Write output artifact (NEW in v3)

**Mandatory**：mark done 之后，写一份**结构化 output 文件**到 `.hopper/handoffs/<task-id>-output.md`，作为 Leader 反向 feedback 的数据源。

不同角色的 output 文件名约定：

- Builder / Builder-UI / Executor: `.hopper/handoffs/<task-id>-output.md`
- Critic: `.hopper/handoffs/critic-<task-id>.md` 或 `day*-critic-*.md`（已有约定）
- Researcher: `.hopper/handoffs/<day>-researcher-output.md`（已有约定）

**为什么需要这个**：Step 10 的"Report" 只在 Worker CLI session 短暂存在，Leader session 拿不到。output.md 落盘后 Leader 可以 `review <task-id>` 时直接读。**这条规则解决"feedback 靠 copy-paste"的协议结构性 gap**。

**Builder Output Template**（Builder/Builder-UI/Executor 用）：

```markdown
# <task-id> — <role> Output

## Summary
<one paragraph：做了什么、为什么这样做>

## Files touched
- path/to/file (new/modified, ~N lines): <one-line purpose>
- ...

## Acceptance verification (X/Y)
1. ✓ <criterion 1> — <evidence: 命令输出 / 文件路径 / 行号>
2. ✓ <criterion 2> — <evidence>
...

## Decisions / deviations from spec
- <decision 1>: <reason; 是否需要 Leader 审议>
- <deviation 1>: <spec 写 X，实际做 Y，因为 Z>
- 如完全按 spec：写 "无偏离"

## Open questions for Leader
<bullet list；如无写 "none">

## Commit
<short-sha> "[<task-id>] <message>"

## Next recommendation
<下一个建议 pop 的 task ID 或 blocker 提示>
```

模板见 `.hopper/templates/builder-output.md`（如本项目已部署）。

### Step 8 — Append to cost log

Append a row to `.hopper/COST-LOG.md`. If it doesn't exist, create it with header:

```markdown
# Cost Log

| Date | Task | Role | Model | Tokens In/Out | Approx $ | Notes |
|------|------|------|-------|---------------|----------|-------|
```

Then append your row. If your CLI doesn't expose token counts, **estimate** and prefix with `~`. Never leave blank — this is dogfood data.

### Step 9 — Commit (atomic)

**Mandatory**：本步骤把"work 文件 + queue 状态翻转 + cost log 行 + handoff 文档"打包成单一 git commit，让 PR 边界与 task 边界对齐。

```bash
git add <all files you touched in this ping cycle>
git commit -m "[<task-id>] <one-line summary>"
```

约定：

- **Prefix**：commit message 必须以 `[<task-id>]` 开头（如 `[T03]` / `[critic-v1]` / `[T18a]`）
- **Body 建议**（非强制）：空行后写 "Files touched: ..." 与 "Acceptance: X/Y verified"
- **不要 push**——push 是 Leader 的特权，由用户手动决定时机
- **不要 amend** 之前的 commit——每个 task 一个新 commit
- **不要 `--no-verify`** —— 让 hooks / lint 跑；如果失败见下方 "If commit fails"

**git add 的 scope**：

- 你修改的 work 文件（src/、docs/、tests/ 等）
- `.hopper/queue.md`（含 Step 3 的 lock 与 Step 7 的 done 翻转）
- `.hopper/COST-LOG.md`（Step 8 的新行）
- `.hopper/handoffs/<task-id>-output.md`（**Step 7.5 必有**）
- 不要 `git add .` 或 `git add -A`——精确加你 touched 的文件

**If commit fails**（pre-commit hook / lint / typecheck 报错）：

1. **不能 mark done 提前完成**——commit 失败 = task 没真正完成
2. 尝试修复：读 hook 报错信息 → 改对应文件 → 重新 git add + commit
3. 修复 3 次仍失败 → 把 queue.md 里 task status 从 `done` 退回 `in-progress`，写 `.hopper/handoffs/blocker-<task-id>.md` 描述 hook 报什么错，停止此次 ping，把控制权还给用户

**Critic role 的特殊约定**：

- Critic 不改产品代码，只产出 review 文档（`.hopper/handoffs/critic-*.md` 或 `day*-critic-spec-review*.md`）
- 同样要 commit：`[<task-id>] critic review: <verdict>` + 改 queue.md / COST-LOG.md
- Critic 的 commit 不触发 Builder PR review；它本身就是 review 产物

### Step 10 — Report

Format your final response:

```
✅ <task-id> done

Shipped: <one line>
Files touched: <list>
Acceptance: <X>/<Y> verified, <Z> needs manual confirm
Commit: <short-sha> "[<task-id>] <message>"

Next pending for <role>: <task-id-or-"none">
Queue: <pending>/<in-progress>/<done>/<failed>
```

---

## Forms detail

### `ping --status`

Read queue, output a summary table grouped by Role and Status. No file changes.

### `ping --dry`

Run Steps 0-2 only; show "Would pop: <task-id> (<brief>)". No file changes.

### `ping <role>`

Override role for this one ping. Used when one CLI session covers multiple roles (e.g. Gemini doing both Researcher and Builder-UI at different times).

---

## Leader Review Protocol（v3 新增）

Leader 通过 `review` 系列命令消费 Worker 落盘的 output.md，避免人工 copy-paste。

### Procedure when user types `review <task-id>`

#### Step 1 — Locate task

Read `.hopper/queue.md`，找到 row with ID = `<task-id>`，确认 `Status: done`（如果 in-progress 或 pending 提示用户）。

#### Step 2 — Read artifacts

- `.hopper/handoffs/<task-id>-output.md` — Worker 的结构化 output（**主输入**）
- 关联 commit：`git log --oneline --grep="\\[<task-id>\\]"` 找 sha → `git show --stat <sha>` 看文件改动
- 必要时读关键 diff：`git show <sha> -- <key file>`
- 如有：`.hopper/handoffs/critic-<task-id>.md`（如该 task 已被 Critic 审过）

#### Step 3 — Evaluate

把 output.md 的 5 个段落（Summary / Files / Acceptance / Decisions / Open questions）逐项验证：

- **Acceptance**：每条 evidence 是否真的支持 ✓？
- **Deviations**：偏离 spec 的决定是否合理？需要 Leader 修订 spec？
- **Open questions**：每个问题给明确答复（不留悬置）

#### Step 4 — Verdict

四选一：

| Verdict | 含义 | 后续动作 |
|---------|------|----------|
| ✅ **accept** | 完全 OK，ship as-is | 无新动作；可在 HOPPER-FEEDBACK 加观察 |
| ⚠ **accept-with-note** | 接受但有跟进事项 | 在 task 的 output.md 末尾追加 `## Leader review: <verdict>` + note；如有改进想法加 HOPPER-FEEDBACK |
| ✗ **rework** | 需要修复 | 把新 task `<task-id>-rework-1` 推进 queue.md（status pending）；spec 在原 task 的 output.md 末尾说清楚需要改什么；原 task 状态保持 done |
| 🚫 **revert** | 严重错误，需回滚 | **不自动 revert**；告诉用户该 commit 应被 revert；写入 `.hopper/handoffs/blocker-<task-id>.md`；queue 里加 `<task-id>-revert` task |

#### Step 5 — Write feedback to output.md

不论 verdict 是哪个，都在 `.hopper/handoffs/<task-id>-output.md` 末尾追加：

```markdown
---

## Leader review

- Verdict: <accept / accept-with-note / rework / revert>
- Date: <ISO timestamp>
- Reviewed-by: leader (<your model name>)
- Notes:
  - <bullet 1>
  - <bullet 2>
- Follow-up tasks queued: <list of new task IDs in queue.md or "none">
```

#### Step 6 — Commit feedback

提交 review changes（output.md 末尾追加 + 可能的 queue.md / HOPPER-FEEDBACK 改动）：

```bash
git add .hopper/handoffs/<task-id>-output.md [.hopper/queue.md] [.hopper/HOPPER-FEEDBACK.md]
git commit -m "[review:<task-id>] <verdict>: <one-line>"
```

### Procedure when user types `review`（无参数）

读 `.hopper/queue.md`，找最新一条 status=done 且其 output.md 末尾没有 `## Leader review` 段的 task。等同于 `review <that-id>`。

如果所有 done task 都已 review：响应 "No pending feedback. Last reviewed: <task-id>."

### Procedure when user types `review --pending`

读 `.hopper/queue.md`，列出所有"done 但未 review"的 task ID 与 brief。**不**进入 review 流程，让用户挑下一个。

---

## Leader Feedback Channel（v5 新增）

当 Leader 需要给一个 in-progress 的 Worker 推送 diagnosis / 中途调整（典型场景：manual verify 失败带具体诊断 + fix 方案），不要走 chat prose——走结构化文件：

```
.hopper/handoffs/<task-id>-leader-feedback.md
```

**Schema**：

```markdown
# <task-id> — Leader Feedback (round N)

- Date: <ISO>
- Leader: <model name>
- Round: <N>

## Diagnosis

<root cause analysis based on Leader inspection of artifacts>

## Required fix

<concrete code/spec changes Worker should fold into in-progress task>

## Re-verify after fix

<what Leader will check on next round; e.g. "manual chat with default Doubao again">
```

**Worker 协议**：

- 在 Step 5 (Execute) 期间，如果 Leader 通知"feedback file 已写"或者你完成 manual verify gate 失败时主动 check 该文件
- Read `.hopper/handoffs/<task-id>-leader-feedback.md`，按 "Required fix" 段执行
- 修复后在同一文件追加 "## Round N response" 段说明改动；不要新建文件，保持单一 audit trail
- 修复完成后回到 Step 6 sanity check，等 Leader 下一轮 verify

**Leader 协议**：

- 永不在 chat 里贴 diagnosis 给 Worker；改写 `.hopper/handoffs/<task-id>-leader-feedback.md` 然后告诉 Worker "feedback 已落盘，请读"
- 这样 audit trail 留在文件里，未来 review / retro 可回放完整诊断 → 修复 cycle

**为什么需要这条规则**：dogfood 期间 T02-rework 3 轮 manual verify 全靠 Leader→Worker chat prose 传递诊断，导致 (a) audit trail 散落在对话历史里、(b) Worker session 切换时 context 丢失、(c) 用户体感"指令转发太多"。Leader Feedback Channel 把这种交流落盘，符合协议"file system as source of truth"原则。

## Concurrency notes（v4 expanded）

This protocol is **not race-safe**. When multiple sessions share a working directory:

1. **Don't `ping` simultaneously in two sessions for the same role** — 会同时 lock 同一 task
2. **Don't assume queue.md is current** — Step 0.5 强制重读，每次 ping 起手都 fresh from disk
3. **Don't run acceptance check on whole repo** — Step 6 要求 scope to task-touched files；并发 session 的 WIP 可能污染全 repo 检查
4. **WIP file leakage 防御**：Step 5 期间创建的未 commit 临时文件（test stub / scaffold without paired implementation），sibling session 的 tsc include 会编译它们：
   - 优先方案：把 WIP 限定到 task scope 内一起 commit；不要让 stub 文件长期 untracked
   - 备选：`tests/_wip/<task-id>/` 临时目录配合 `.gitignore`，commit 时统一归档
   - 进阶：每个 worker session 用独立 `git worktree`（磁盘多但隔离强）
5. **Stalled task**：如果你找到 `in-progress` matching your role 但 timestamp 已超 30min，可能是 crash 或前 session 中断。回报给用户决定是否 take over，不自动接管
6. **Edit 工具 staleness check 是最后防线** — 别绕过。Edit 失败要求 re-Read 时**必须先 Read 再 Edit**

## Push protocol

Adding new tasks to the queue is **Leader's privilege**. Builder / Executor / Critic etc. **do not push** new tasks; if you find work that should be done but isn't queued, write it as a recommendation in your handoff output and let Leader decide whether to enqueue.

Leader pushes by editing `.hopper/queue.md` directly: add a row, set `Status: pending` and `Depends:` correctly. No special command needed.

## When NOT to use `ping`

- For ad-hoc questions ("what does this code do?") — just answer normally
- For exploratory work without a queued task — just do the work; don't try to fit into the protocol
- For Day 1 / Day 2 type kickoff work that's not in the queue — Leader uses `.hopper/prompts/*.md` directly

## Schema versioning

| Version | Date | Change |
|---------|------|--------|
| v1 | 2026-05-06 | Initial: 9 steps without commit |
| v2 | 2026-05-06 | Added Step 9 atomic commit; renumbered Report to Step 10 |
| v3 | 2026-05-06 | Added Step 7.5 (output artifact required) + Leader Review Protocol (`review` family)；解决 worker → leader feedback 的协议 gap |
| v4 | 2026-05-07 | Added Step 0.5 (refresh shared state) + Step 6 acceptance scope-qualify + Concurrency notes expansion. Mitigations for F5 (queue concurrent-write) and P7 (WIP leakage) discovered in myWriteAssistant dogfood. |
| **v5** | **2026-05-07** | **Step 0.5 also re-reads PING.md（不只 queue.md）；新增 `ping <task-id>` / `--task=<id>` form 用 task-level override 替代"do X next"prose；新增 Leader Feedback Channel via `.hopper/handoffs/<task-id>-leader-feedback.md` 文件替代 manual verify diagnosis 走 chat；queue.md 加可选 Priority 列。消除 80% out-of-band Leader→Worker prose dispatch。Mitigations for HOPPER-FEEDBACK O8/O9/O10/P4/P9 from T02-rework cycle.** |

If queue.md format or protocol ever changes incompatibly, future versions will document the migration here.

## Origin

This protocol was first designed and validated in the myWriteAssistant dogfood (2026-05-06 → ongoing). Each schema bump (v2 / v3 / v4 / v5) corresponds to a real protocol gap discovered during multi-LLM coordination of an 18-task v0.2 vendor-agnostic refactor. See `HOPPER-FEEDBACK.md::F1/F4/F5/P7/P9` in the dogfood project for trigger contexts. v5 specifically resolves the prose-dispatch overhead exposed by T02-rework's 3-round manual-verify cycle.
