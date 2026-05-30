# hopper-plugin cookbook

Practical recipes for using hopper-plugin across hosts and vendors.

These examples assume:

- `hopper-dispatch` is on `PATH`, or you run `node /absolute/path/to/hopper-plugin/cli/bin/hopper-dispatch`.
- The current project has a `.hopper/` directory.
- Task IDs such as `T-PROG-REVIEW` are examples. Replace them with a pending task from your own `.hopper/queue.md`.

## Recipe 1 - Dispatch to a specific vendor, model, and reasoning level

**Scenario**: Start a long review task and pass vendor-specific knobs.
**Hosts**: standalone, Claude Code, Codex CLI, OpenCode
**Vendors involved**: codex, kimi, opencode, copilot

### Steps

Check what the resolved vendor supports:

```bash
hopper-dispatch --resolve T-PROG-REVIEW
hopper-dispatch --capabilities codex
hopper-dispatch --capabilities kimi
```

Dispatch with codex reasoning effort when the task resolves to codex:

```bash
hopper-dispatch T-PROG-REVIEW --background --reasoning xhigh
hopper-dispatch --progress T-PROG-REVIEW
```

Dispatch with a model override for vendors that honor `--model`:

```bash
hopper-dispatch T-PROG-UI --background --model deepseek/v4-flash
hopper-dispatch T-PROG-KIMI --background --model kimi-thinking
```

Expected output includes a runner PID and `.hopper/handoffs/<task-id>-output.md`.

### Notes

Vendor selection comes from `.hopper/AGENTS.md`, not from `--model`. `--reasoning` is honored by codex; `--model` is honored by kimi, opencode, and copilot. Unsupported flags are ignored by the adapter rather than remapping to another vendor.

## Recipe 2 - Background dispatch and active progress checks

**Scenario**: Keep the host session responsive while you pull progress on demand.
**Hosts**: standalone, Claude Code, Codex CLI, OpenCode
**Vendors involved**: any configured vendor

### Steps

```bash
hopper-dispatch T-PROG-LONG --background
hopper-dispatch --progress T-PROG-LONG
hopper-dispatch --watch T-PROG-LONG
hopper-dispatch --result T-PROG-LONG
```

Expected `--progress` output shows frontmatter phase, elapsed time, last progress text, and recent progress events. `--watch` blocks until the background job reaches a terminal state.

### Notes

Use `--progress` for a snapshot. Use `--watch` when you want the terminal to follow the task until completion.

## Recipe 3 - Background dispatch and passive completion notifications

**Scenario**: Start a long job, stop polling, and let a terminal event wake you.
**Hosts**: Claude Code, standalone, Codex CLI, OpenCode wrapper
**Vendors involved**: any configured vendor

### Steps

In one terminal:

```bash
hopper-dispatch --watch-events
```

In another terminal:

```bash
hopper-dispatch T-PROG-LONG --background
```

For one-shot automation:

```bash
hopper-dispatch --watch-events --once
```

Expected event:

```json
{"type":"hopper.task.terminal","task_id":"T-PROG-LONG","status":"done"}
```

### Notes

Claude Code loads `monitors/monitors.json` from the plugin root and forwards watcher stdout lines to the session. Standalone and Codex CLI paths can keep `--watch-events` running for stdout JSONL plus best-effort OS toast. Set `HOPPER_NOTIFY=0` to disable OS toast without disabling JSONL.

## Recipe 4 - Watch progress in the dashboard

**Scenario**: Use the browser dashboard for queue, log, progress timeline, and terminal event visibility.
**Hosts**: standalone, Claude Code, Codex CLI, OpenCode
**Vendors involved**: any configured vendor

### Steps

```bash
npm run dashboard:build
npm run dashboard:start
```

Open:

```text
http://127.0.0.1:7777
```

Start a job:

```bash
hopper-dispatch T-PROG-DASHBOARD --background
```

In the dashboard, open the task drawer and select the Progress tab.

### Notes

The dashboard is a read-only consumer for queue, task, log, and progress data. Vendor probe actions are explicit button actions and are guarded by a server-side vendor allowlist.

## Recipe 5 - Cross-host equivalent dispatch

**Scenario**: Prove that host choice does not change vendor routing.
**Hosts**: Claude Code, Codex CLI, OpenCode, standalone
**Vendors involved**: any configured vendor

### Steps

Standalone:

```bash
hopper-dispatch --resolve T-PROG-REVIEW
hopper-dispatch T-PROG-REVIEW --background
```

Claude Code:

```text
/hopper:dispatch T-PROG-REVIEW --background
```

Codex CLI wrapper:

```bash
hopper-codex T-PROG-REVIEW --background
```

OpenCode wrapper:

```bash
hopper-opencode T-PROG-REVIEW --background
```

### Notes

Every route eventually invokes the same dispatcher and reads the same `.hopper/AGENTS.md`. Do not use multiple routes to dispatch the same task simultaneously; background dispatch refuses alive duplicate jobs.

## Recipe 6 - Probe vendor capabilities and query the cache

**Scenario**: Refresh per-machine model inventory before choosing a model override.
**Hosts**: standalone, Claude Code through slash commands
**Vendors involved**: codex, kimi, opencode, copilot, agy, grok

### Steps

Zero-spawn static capability lookup:

```bash
hopper-dispatch --capabilities codex
hopper-dispatch --capabilities opencode
```

Live probe for one vendor:

```bash
hopper-dispatch --probe codex
hopper-dispatch --models codex
```

Live probe for all vendors:

```bash
hopper-dispatch --probe
hopper-dispatch --models
```

Claude Code equivalents:

```text
/hopper:probe codex
/hopper:models codex
```

### Notes

`--probe` is the explicit discovery surface that may spawn vendor CLIs. `--models` reads the cache only. Model availability is account- and machine-dependent.

## Recipe 7 - Clean up stale background jobs

**Scenario**: A machine reboot or killed process left a task in `in-progress`.
**Hosts**: standalone, Claude Code through shell
**Vendors involved**: any configured vendor

### Steps

```bash
hopper-dispatch --jobs
hopper-dispatch --reap
hopper-dispatch --jobs
```

Inspect one reaped task:

```bash
hopper-dispatch --progress T-PROG-STALE
hopper-dispatch --result T-PROG-STALE
```

### Notes

`--reap` classifies stale or dead-PID jobs as `orphaned` and writes a terminal event once. Re-running it should not append duplicate terminal events for the same task.

## Recipe 8 - Multi-vendor adversarial review

**Scenario**: Ask two vendors to review the same spec from different angles, then compare their handoff files.
**Hosts**: standalone, Claude Code
**Vendors involved**: codex, kimi, opencode, copilot, agy, grok

### Steps

Create two queue rows that point at the same spec but have different task IDs and preferred vendors in `.hopper/AGENTS.md`, for example:

```text
T-REVIEW-CODEX
T-REVIEW-KIMI
```

Dispatch both:

```bash
hopper-dispatch T-REVIEW-CODEX --background --reasoning xhigh
hopper-dispatch T-REVIEW-KIMI --background --model kimi-thinking
hopper-dispatch --watch-events --once
```

Compare results:

```bash
hopper-dispatch --result T-REVIEW-CODEX
hopper-dispatch --result T-REVIEW-KIMI
```

### Notes

Keep each review as a separate task ID. hopper-plugin does not fan out a single queue row to multiple vendors automatically; the file protocol makes the fan-out explicit and auditable.
