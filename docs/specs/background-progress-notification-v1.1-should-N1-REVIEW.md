# N1.v2 Plan Re-Review — Background Progress and Completion Notification v1.1-should (R14 + R15 sharpening)

Status: verdict v1.0 — **accept-with-revisions**
Date: 2026-05-22
Anchor: `docs/specs/background-progress-notification-v1.1-should-N1-REVIEW.md::root`
Reviewer role: third-party architecture review agent (read-only)
Scope: re-review of PLAN-v1.1 R14 + R15 (dashboard integration) given v1.0 implementation is now live

## Companions

- PRD: `docs/specs/background-progress-notification-prd-trd.md` (v0.4)
- Rubric: `docs/specs/background-progress-notification-plan-review-rubric.md` (v1.0)
- PLAN-v1.1: `docs/specs/background-progress-notification-v1.1-should-PLAN.md`
- N1.v1 (initial): `docs/specs/background-progress-notification-v1-must-N1-REVIEW.md` (accepted v1.1 PLAN bundled)
- Dashboard sidequest closeout: `docs/sidequests/web-dashboard/SIDEQUEST-COMPLETE.md`
- v1.0 wave summary: `docs/specs/background-progress-notification-v1-must-N2-wave4-REVIEW.md`

## Round History

| Round | Date | Verdict | Trigger |
|---|---|---|---|
| N1.v1 | 2026-05-22 | accept (PLAN-v1.1 bundled with v1-must, v1.2 in N1-REVIEW.md) | Initial three-PLAN split passed N1 |
| **N1.v2** | 2026-05-22 | **accept-with-revisions** | Post-v1.0 implementation; dashboard sidequest live; 6 concrete integration gaps surfaced (G1-G6 below); R14 sharpening required before executor handoff |

## Why v2 was triggered

v1.0 wave 4 closed with PLAN-v1.1 untouched. Two facts now exist that v1.1 PLAN was written before:

1. **v1.0 implementation is concrete** — `cli/src/progress.js`, `progress.log` JSONL schema, 8 new frontmatter fields, `terminal_event_emitted` dedup contract, and `--watch-events` semantics are all live and shape what R14/R15 must consume.
2. **Dashboard sidequest is closed** — `dashboard/` is real code (server: express + chokidar + SSE; client: React + Vite + shadcn). PLAN-v1.1 was written assuming a working dashboard; now we can name the exact files and the exact code shape that needs to change.

This re-review **does not change v1.1 PLAN scope**. It sharpens R14 (newly surfaces G1 as BLOCKING) and tightens R15 (locks UI surface to the 3→4 tab transition + named frontmatter field expansion).

## v1.0 Implementation Surface — what R14/R15 must consume

Anchored facts for the executor:

### File layout

```
.hopper/handoffs/
  <task-id>-output.md     ← frontmatter authoritative; 8 new fields
  <task-id>-output.log    ← raw vendor stdout/stderr (unchanged)
  <task-id>-progress.log  ← JSONL, append-only, rotates to .1 at 10MB
  <task-id>-progress.log.1 ← rotated (zero or one rotation only)
```

### Frontmatter new fields (added by R02; written by R03/R04 on terminal)

| Field | Type | Set when |
|---|---|---|
| `phase` | `starting` / `running` / `done` / `failed` / `timeout` / `cancelled` / `orphaned` | seed (R02) + every progress write (R03/R04) |
| `last_progress_at` | ISO timestamp | every progress write |
| `last_progress` | string (max ~500 chars) | every progress write |
| `progress_seq` | integer (1-based, monotonic across rotate per R01.1 fix) | every progress write |
| `progress_log` | path `./<task-id>-progress.log` | seed |
| `raw_log` | path `./<task-id>-output.log` | seed |
| `vendor_session_id` | string \| null | optional; reserved for v1.2 R11 |
| `terminal_event_emitted` | boolean | flips true exactly once on terminal write |

### JSONL event schema (cli/src/progress.js:89-118)

```json
{
  "seq": 18,
  "ts": "2026-05-22T12:10:00.000Z",
  "task_id": "T-EXAMPLE",
  "vendor": "codex",
  "phase": "running",
  "kind": "lifecycle" | "terminal" | (future) "finding" | "command" | "file",
  "message": "Background task queued.",
  "source": "runner" | "preflight" | "reaper" | (future) "native-app-server",
  "terminal": false,
  "status": "done|failed|...",      // optional, terminal events only
  "duration_ms": 524000,             // optional
  "exit_code": 0,                    // optional
  "signal": "SIGTERM",               // optional
  "adapter_status": "success",       // optional
  "timed_out": false                 // optional
}
```

Subscribers must tolerate unknown optional fields (forward compatibility for v1.2 stream-parser).

### Helpers already exported from `cli/src/progress.js`

```js
import { readProgressEvents, progressLogPath, nextProgressSeq } from '../../cli/src/progress.js';

// reads current progress.log (NOT .1 — see N-w3.2 below)
const events = readProgressEvents({ hopperDir, taskId, limit: 20 });
```

Dashboard server is permitted to import these (already on the read-only import whitelist per dashboard sidequest §B.1).

## Concrete Gaps — Dashboard vs v1.0

These 6 gaps were surfaced during this re-review and must be addressed by R14 / R15.

| # | Gap | Location | R14/R15 | Severity |
|---|---|---|---|---|
| **G1** | Watcher's `handoffs/*.log` glob matches `<id>-progress.log`; `taskIdFromLog` parses it to `T-X-progress` and publishes to `log/T-X-progress` channel where no subscriber exists | `dashboard/server/events/watcher.js:43-51, 86-88` | R14 | **BLOCKING** (latent bug, masks future progress watching) |
| **G2** | Task API returns frontmatter+body only; no progress event list | `dashboard/server/routes/task.js:35-49` | R14 | BLOCKING |
| **G3** | No `progress/:id` SSE channel; no event mapping for `<id>-progress.log` writes | `dashboard/server/events/sse.js:55-69` + `watcher.js::mapFileEvent` | R14 | BLOCKING |
| **G4** | `tail.js` lacks truncate/rotate defense (already in PLAN as a verification point, raise to implementation) | `dashboard/server/lib/tail.js:36-56` | R14 | BLOCKING |
| **G5** | `TaskDrawer` does not expose phase / last_progress / terminal flag prominently; no progress events timeline view | `dashboard/client/src/components/TaskDrawer.tsx` | R15 | BLOCKING |
| **G6** | `docs/sidequests/web-dashboard/SPEC.md` does not yet describe the progress.log contract; future dashboard changes lack spec anchor | `docs/sidequests/web-dashboard/SPEC.md` | R15 (companion doc patch) | SHOULD |

## R14 — sharpened scope

PLAN-v1.1 R14 ("Wire dashboard server to progress events") stands; the following revisions are required.

### Required revisions (apply at executor handoff time)

**Rev-R14.1 — G1 latent bug fix is BLOCKING** (was implicit in original PLAN)

Watcher must distinguish `*-output.log` from `*-progress.log` before computing task-id and channel. Required diff shape:

```js
// dashboard/server/events/watcher.js mapFileEvent
if (rel.startsWith('handoffs/') && rel.endsWith('-progress.log')) {
  const taskId = basename(filePath, '-progress.log');
  return withChannel(`progress/${taskId}`, 'progress', { ...payload, taskId });
}
if (rel.startsWith('handoffs/') && rel.endsWith('-output.log')) {
  const taskId = taskIdFromLog(filePath);
  return withChannel(`log/${taskId}`, 'log', { ...payload, taskId });
}
// (existing fallthrough)
```

`taskIdFromLog` must be tightened to strip `-output` suffix only, not generic `.log`. Add regression test in `tests/unit/dashboard-sse.test.js`: change to `*-progress.log` must publish to `progress/<id>` not `log/<id-progress>`.

**Rev-R14.2 — SSE channel choice is `progress/:id`, not embedded in task channel**

PLAN-v1.1 R14 says "dedicated progress SSE route or task detail response" — choose the dedicated route. Reasons:

- Existing `task/:id` is invalidate-on-change semantics (client refetches); progress events are append-only and benefit from streaming
- Tail-style incremental delivery (similar to existing `log/:id`) is the right pattern
- Per-channel client subscription matches dashboard's existing architecture

Required additions:

- `dashboard/server/events/sse.js::createSseRouter` adds `router.get('/progress/:id', ...)`
- The route can optionally accept `?since=<seq>` to backfill events from a given seq (for reconnect)

**Rev-R14.3 — Task router augmented (not replaced) with progress events**

`GET /api/task/:id` (existing) stays. Add new `GET /api/task/:id/progress?limit=N` returning the most recent N JSONL events.

Required diff shape:

```js
// dashboard/server/routes/task.js
import { readProgressEvents } from '../../../cli/src/progress.js';

router.get('/:id/progress', (req, res, next) => {
  const root = hopperDir || findHopperDir();
  if (!root) { res.status(404).json({ error: 'no .hopper directory found' }); return; }
  const limit = Math.min(Number(req.query.limit) || 20, 200);
  const events = readProgressEvents({ hopperDir: root, taskId: req.params.id, limit });
  res.json({ id: req.params.id, events });
});
```

Reuse existing `isSafeTaskId` regex.

**Rev-R14.4 — tail.js truncate / rotate defense (BLOCKING per N-w3.2)**

`createLogTailer` + `readLogChunk` need:

- If `stat.size < lastKnownSize` → reset offset to 0 (truncate detection)
- Track previous inode via `stat.ino`; if changed → reset offset to 0 (rotate detection, the `*-progress.log` rotation case)
- Test cases: truncate mid-stream; rotate (progress.log → progress.log.1 + new progress.log); fresh subscriber after rotate

Note: `readProgressEvents` itself only reads the current file (N-w3.2 still standing for v1.0). Dashboard tail must therefore be independent — tail what we are watching, not delegate to `readProgressEvents`. (Tailing JSONL is a separate concern from "give me last N events as a snapshot".)

**Rev-R14.5 — Watcher emits progress event with incremental chunk**

Wire `progress/:id` channel publication to read the new JSONL lines since last offset (analogous to existing `log/:id` flow at `watcher.js:22-25`):

```js
// in watcher.on('all', ...) handler
if (mapped.event === 'progress' && progressTailer) {
  const chunk = progressTailer.readNew(mapped.payload.taskId);
  if (chunk.chunk) {
    const lines = chunk.chunk.split(/\r?\n/).filter(Boolean);
    const events = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    if (events.length) hub.publish(mapped.channel, 'progress', { ...mapped.payload, events });
  }
  return;
}
```

A separate tailer instance for progress files (do NOT reuse the existing `log` tailer; they have separate offset state and truncate/rotate behaviors).

### R14 verification (revised list)

- `dashboard-sse.test.js`: progress.log change publishes to `progress/<id>`, never to `log/<id-progress>` (G1 regression guard)
- `dashboard-log.test.js`: truncate resets offset; inode change resets offset; reading after rotate reads first line of new file exactly once, never re-reads `.1`
- `dashboard-task.test.js` (new or existing): `GET /api/task/:id/progress?limit=N` returns ≤N events in append order; malformed JSONL lines are skipped (mirrors `readProgressEvents` contract)
- Integration: dispatch a real background task; verify dashboard `progress/:id` channel receives the starting + terminal events

## R15 — sharpened scope

PLAN-v1.1 R15 ("Add dashboard progress UI") stands; the following revisions are required.

### Required revisions

**Rev-R15.1 — Surface phase + last_progress in the task drawer header (not buried in Frontmatter tab)**

`TaskDrawer.tsx` currently surfaces only `id` and `frontmatter and output body` in `SheetHeader`. Add a status strip between header and tabs:

```tsx
<TaskStatusStrip frontmatter={detail?.frontmatter} />
```

Shows: `Status: done`, `Phase: running`, `Last: Background task queued. (2s ago)`, `Terminal: yes`. Use existing `StatusPill` component for status. Mono font, single row, hairline border below.

**Rev-R15.2 — New "Progress" tab between "Output" and "Live log"**

Tab order: `Output / Progress / Live log / Frontmatter`. The Progress tab shows:

- Top: 5 most recent events (auto-refreshes via `progress/:id` SSE)
- Each event row: `#{seq}` `{ts (relative)}` `{phase}/{kind}` `{message}` + optional terminal metadata (`status=` / `exit_code=` / `duration_ms=`)
- If `frontmatter.terminal_event_emitted === true`: pin the terminal event at the top with a distinct visual marker (matches existing dashboard hairline + dual-encoding pattern)
- Empty state: `[··· ] no progress events`
- Initial fetch via `GET /api/task/:id/progress?limit=20`; subsequent updates via SSE append

**Rev-R15.3 — Expand `baseFrontmatterFields` to include v1.0 fields**

`TaskDrawer.tsx:19-33` lists 13 fields. Add the 8 v1.0 fields in the right order:

```ts
export const baseFrontmatterFields = [
  'task_id', 'adapter', 'status', 'phase',          // new: phase
  'pid', 'start_time', 'end_time', 'exit_code',
  'duration_ms', 'mode', 'host_native', 'session_id',
  'log', 'progress_log', 'raw_log',                  // new: progress_log, raw_log
  'last_progress', 'last_progress_at', 'progress_seq', // new: 3 progress-state fields
  'terminal_event_emitted', 'vendor_session_id',     // new: 2 trailing fields
  'started_by_pid',
] as const;
```

`effectiveFrontmatterFields` already appends unknown dynamic fields, so future v1.2 additions still work; this revision is for display order only.

**Rev-R15.4 — SSE subscription via existing `useSSE` hook**

Reuse `client/src/lib/sse.ts::useSSE`. Wire:

```ts
useSSE(`/events/progress/${id}`, (event) => {
  void queryClient.invalidateQueries({ queryKey: queryKeys.taskProgress(id) });
}, { enabled: Boolean(id) });
```

Add `queryKeys.taskProgress(id)` to `lib/api.ts`. Use react-query's existing patterns; do not introduce new state management.

**Rev-R15.5 — SPEC.md anchor patch (companion doc, SHOULD)**

`docs/sidequests/web-dashboard/SPEC.md` modification:

- §附录 A subscription list: add `.hopper/handoffs/*-progress.log` row + `/events/progress/:id` channel
- §FR-XXX: add FR-010 "Progress timeline" listing the Progress tab behavior
- Bump SPEC version to v2.2

Not blocking R15 acceptance, but should land in the same wave to keep the dashboard sidequest spec authoritative.

### R15 verification (revised list)

- `dashboard-task.test.js`: TaskStatusStrip renders phase + last_progress + terminal yes/no with missing-value fallback (`—`)
- `dashboard-task.test.js`: Progress tab renders ≤5 recent events with proper format
- `dashboard-task.test.js`: terminal task renders pinned terminal event at top of Progress tab
- `dashboard-task.test.js`: `baseFrontmatterFields` lists all 21 fields in declared order
- Build: `npm run dashboard:build` passes; bundle main chunk stays < 200 KB gzipped (current 119 KB → expect +5-15 KB for Progress tab)
- Manual: dispatch real `T-PROG-DOGFOOD-*` task; verify Progress tab updates in real time

## Workflow Constraints — unchanged

Inherit PLAN-v1.1's Workflow Constraints section verbatim:

- Commit prefix `[T-PROG-R14]` / `[T-PROG-R15]`
- Single commit file delta ≤ 300 lines, except lockfiles (or per sidequest carve-out for inevitable test fixtures)
- No push, no `--amend`, no `--no-verify`
- Phase commits atomic
- Deviation protocol: small in OUTPUT.md; large back to reviewer

## Dogfood Integration

Per the dogfood-as-implementation framework agreed earlier:

| R-item | Dogfood task | Vendor |
|---|---|---|
| R14 main implementation | (main executor — Claude Code / codex / chosen) | — |
| R14 research support | `T-PROG-R14-RESEARCH` chokidar inode-tracking + truncate detection patterns | codex (xhigh reasoning) |
| R14 adversarial review | `T-PROG-R14-REVIEW-kimi` audit of progress channel + tailer | kimi |
| R15 main implementation | (main executor) | — |
| R15 UI review | `T-PROG-R15-REVIEW-opencode` adversarial UI review (a11y, layout, perf) | opencode |
| R15 SPEC sync | `T-PROG-R15-SPEC` sync sidequest SPEC.md additions | kimi (cheap docs work) |

Each dogfood task uses `hopper-dispatch <task-id> --background`, exercises v1.0 monitor surface end-to-end, and feeds telemetry back to the v1.0 wave-3 notes (N-w3.1 / 3.2 / 3.3 / 3.4) for retrospective.

## Verdict

**accept-with-revisions**. R14 and R15 may proceed with the revisions above applied as authoritative scope. The PLAN-v1.1 file itself does not need editing — these revisions are the executor's marching orders.

If the executor wants the PLAN file updated for permanent record, that is a separate doc-only commit (`[T-PROG-DOC] sharpen v1.1 R14/R15 per N1.v2`) and is welcome but not required.

## N2 trigger points

- **N2.wave.dashboard-1**: after R14 commits land. Reviewer checks G1-G4 fix correctness + verification list above.
- **N2.wave.dashboard-2**: after R15 commits land. Reviewer checks G5/G6 + UI review feedback from dogfood task + bundle math.

## Reviewer Boundary (unchanged)

Read-only. No code, no commit, no PR. Each N2 produces verdict + per-revision rubric scores + revision suggestions referencing dashboard file paths.

---

## Errata

### Errata 2026-05-22 — redline grep scope (reviewer-acknowledged)

The R15 prompt's mechanical check `grep -iE "fallback|retry|alternate.provider" dashboard/client/` was over-strict. React `Suspense fallback` prop and TanStack Query `retry` option are public library API names — their literal presence does **not** indicate hopper invariant violation.

The redline applies to **newly-introduced vendor-control logic** (retry-on-failure flows, vendor fallback chains, alternate-provider switching), not to framework-defined option names.

Reviewer is responsible for this scope expansion. Executor's R15.2.4 cleanup restoring literal API names is the correct fix.

Future R-item prompts should specify scope, e.g., `grep -nE "(retry|fallback)\(" cli/src/` (paren constrains to call-sites).

---

## Revision Log

| Version | Date | Change |
|---|---|---|
| v1.0 | 2026-05-22 | First N1.v2 re-review; verdict accept-with-revisions; R14 G1 raised to BLOCKING; R15 scope locked to 4-tab + status strip + baseFrontmatterFields expansion |
