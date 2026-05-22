---
phase: done
last_progress_at: "2026-05-22T15:17:23.059Z"
last_progress: Task completed successfully.
progress_seq: 2
terminal_event_emitted: true
status: done
end_time: "2026-05-22T15:17:23.057Z"
exit_code: 0
signal: null
timed_out: null
duration_ms: 287303
adapter_status: success
---
# Adversarial Review: T-PROG-R15 Dashboard Progress UI

**Task**: `T-PROG-R15-REVIEW-opencode`
**Reviewer**: opencode (deepseek-v4-flash, reasoning high)
**Date**: 2026-05-22
**Scope**: R15 client UI commits (7a5a2f8..88ce4e5) — `TaskStatusStrip`, Progress tab, `ProgressTimeline`, client API/types, SPEC v2.2 sync, redline cleanups.

---

## Summary

Reviewed 8 commits touching 15 files (+442/−16 LOC). The implementation is structurally sound: scope redlines are respected (zero changes to `cli/`, `hosts/`, `commands/`, `monitors/`, `package.json`), no new dependencies, and the UI components are reasonably factored. However, 3 P1 findings were identified: a layout clipping bug on the Progress tab content, a server-vs-client event limit mismatch that makes the declared "50-event cap" unreachable, and an SSE invalidation pattern that can silently lose events on log rotation. Additional P2/P3 findings cover ARIA omissions, inconsistent tooltip behavior, code duplication, and design-token alignment. Verdict: PASS_WITH_CHANGES.

---

## Files reviewed

| File | LOC | Status |
|------|-----|--------|
| `dashboard/client/src/components/ProgressTimeline.tsx` | 104 | NEW |
| `dashboard/client/src/components/TaskDrawer.tsx` | 217 (+54) | MODIFIED |
| `dashboard/client/src/lib/types.ts` | 106 (+23) | MODIFIED |
| `dashboard/client/src/lib/api.ts` | 33 (+7) | MODIFIED |
| `dashboard/client/src/App.tsx` | 174 (+3) | MODIFIED |
| `dashboard/client/src/main.tsx` | 25 (+5) | MODIFIED |
| `dashboard/server/events/sse.js` | 85 (+4) | MODIFIED |
| `dashboard/server/events/watcher.js` | 97 (+1) | MODIFIED |
| `docs/sidequests/web-dashboard/SPEC.md` | 833 (+7) | MODIFIED |
| `docs/specs/background-progress-notification-v1.1-r15-OUTPUT.md` | 90 | NEW |
| `tests/unit/dashboard-task.test.js` | 317 (+100) | MODIFIED |
| `tests/unit/dashboard-sse.test.js` | 112 (+32) | MODIFIED |
| `dashboard/README.md` | 180 (+16) | MODIFIED |
| `.hopper/handoffs/leader-tasklist.md` | 425 (+30) | MODIFIED |
| `.hopper/queue.md` | 90 (+1) | MODIFIED |

---

## Findings

### [F1] P1: Progress tab `TabsContent` lacks `overflow-auto`, content clips on overflow

**Root cause**: `TaskDetailPanel` at `TaskDrawer.tsx:132` uses `className="flex"` on the Progress tab's `TabsContent`, while the Output and Frontmatter tabs use `className="overflow-auto"`. If the timeline exceeds the drawer viewport, rows overflow invisibly.

**Evidence**: `TaskDrawer.tsx:132`:
```tsx
<TabsContent value="progress" className="flex">
  <ProgressTimeline id={id || detail?.id || ''} />
</TabsContent>
```
Compare with Output tab (line 126):
```tsx
<TabsContent value="output" className="overflow-auto p-3">
```

**Recommended fix**: Add `overflow-auto p-3` to match sibling tabs, or `min-h-0` with overflow on the inner container (already present on `ProgressTimelineRows`'s wrapper but its parent `TabsContent` clips it without overflow).

---

### [F2] P1: Server-side fetch limit (20) vs client-side cap (50) mismatch — 50-event ceiling unreachable

**Root cause**: `ProgressTimeline.tsx:16` calls `fetchTaskProgress(id, 20)` with a hardcoded `limit=20`, but line 26 applies a client-side cap of `MAX_EVENTS = 50`. The server enforces a `Math.min(requested, 200)` at `task.js:28`, so only 20 events are ever returned. The `MAX_EVENTS=50` declaration is ornamental — it never activates in practice.

**Evidence**: `ProgressTimeline.tsx:16`:
```tsx
queryFn: () => fetchTaskProgress(id, 20),
```
vs `task.js:28`:
```js
const limit = Math.min(Number.isFinite(requested) && requested > 0 ? requested : 20, 200);
```
The server would honor `limit=50` if asked, but the client never asks for more than 20.

**Recommended fix**: Either remove the `limit` param from `fetchTaskProgress` (server default is 20, making `MAX_EVENTS` consistent) or pass a higher value (e.g., `fetchTaskProgress(id, MAX_EVENTS)`). If "50-event ceiling" is the goal, the query limit should be `MAX_EVENTS` or higher.

---

### [F3] P1: SSE invalidation causes full re-fetch — server-window slide can lose events

**Root cause**: `ProgressTimeline.tsx:20-22` invalidates the query on every SSE event, triggering a full re-fetch of 20 events from the fixed window. If the progress log grows past 20 entries between invalidation and re-fetch, the window slides and events the client previously displayed may no longer appear. This creates visual flicker (events appear to "vanish") and is particularly problematic around log rotation where the SSE event stream and the REST snapshot can diverge (as noted in `dashboard/README.md`'s new §3). This is a data-consistency gap, not a crash — but it directly contradicts the stated goal of "SSE incremental update" from FR-010.

**Evidence**: `ProgressTimeline.tsx:20-22`:
```tsx
useSSE<{ events: ProgressEvent[] }>(`/events/progress/${id}`, () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.taskProgress(id) });
}, { enabled: Boolean(id) });
```
The SSE event payload includes `{ events: ProgressEvent[] }` but these are discarded — only the invalidation side-effect is used. The actual event data from SSE is ignored.

**Recommended fix**: (a) Use SSE payload events directly as optimistic updates via `queryClient.setQueryData`, pushing new events into the existing cache rather than discarding them. (b) Alternatively, increase the fetch limit to 200 (server maximum) and keep the client-side 50-event cap, so the window is wide enough to absorb most log rotation gaps.

---

### [F4] P2: ProgressTimelineRows uses `<div>` without ARIA list semantics

**Root cause**: `ProgressTimeline.tsx:36` renders rows as generic `<div>` elements with a `data-progress-row` attribute, but no `role="list"` on the container or `role="listitem"` on rows. Screen readers perceive a flat collection of `<div>`/`<span>` elements without structure.

**Evidence**: `ProgressTimeline.tsx:36-41`:
```tsx
<div className="min-h-0 flex-1 overflow-auto bg-background p-3 font-mono text-xs leading-5">
  {rows.map((event) => (
    <ProgressEventRow key={`${event.seq}-${event.ts}`} event={event} />
  ))}
</div>
```

**Recommended fix**: Add `role="list"` to the container, `role="listitem"` to each row wrapper, and an `aria-label="Progress timeline"` on the container.

---

### [F5] P2: `TaskStatusStrip` tooltip shows truncated message instead of full message

**Root cause**: `TaskDrawer.tsx:161` uses `title={last}` but `last` is already truncated to 80 characters via `truncate(last, 80)`. Users hovering the "Last:" label see the truncated text, not the original. This is inconsistent with `ProgressTimeline.tsx:73` where `title={event.message}` correctly preserves the full untruncated message.

**Evidence**: `TaskDrawer.tsx:161-162`:
```tsx
<span className="min-w-0 flex-1 truncate" title={last === '—' ? undefined : last}>
  Last: <span className="text-foreground">{truncate(last, 80)}</span>
```
`last` at this point is `formatValue(frontmatter.last_progress)` — already a string. The `title` should use `frontmatter.last_progress` directly, not the truncated constant.

**Recommended fix**: Use `String(frontmatter.last_progress ?? '')` for the `title` attribute instead of the truncated value, or store the original value separately.

---

### [F6] P2: Duplicate `truncate` function in two files

**Root cause**: `TaskDrawer.tsx:202-204` and `ProgressTimeline.tsx:90-92` define byte-identical `truncate` functions. Any behavior change must be duplicated.

**Evidence**: `TaskDrawer.tsx:202`:
```tsx
function truncate(value: string, limit: number) {
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}
```
`ProgressTimeline.tsx:90` — identical.

**Recommended fix**: Extract to a shared utility (e.g., `dashboard/client/src/lib/utils.ts`) and import in both files.

---

### [F7] P3: `relativeTime()` called inside `ProgressEventRow` — recalculates on every SSE invalidation re-render

**Root cause**: `ProgressTimeline.tsx:70` calls `relativeTime(event.ts)` inside each row during render. Each SSE invalidation triggers a query re-fetch and re-render of all visible rows, recalculating all relative timestamps. While computationally cheap for ≤5 rows, this means timestamps update only on re-render rather than on a natural tick cadence.

**Evidence**: `ProgressTimeline.tsx:70`:
```tsx
<span className="text-muted-foreground" title={event.ts}>{relativeTime(event.ts)}</span>
```
The `ProgressEventRow` component is not wrapped in `React.memo`.

**Recommended fix**: Wrap `ProgressEventRow` in `React.memo` or add a lightweight interval-based tick that updates timestamps independently of data re-fetches, so the display marches forward naturally.

---

### [F8] P3: Grid column widths use arbitrary px values not aligned with §4.2.2 spacing system

**Root cause**: `ProgressTimeline.tsx:64` defines `grid-cols-[48px_72px_112px_minmax(0,1fr)]`. These values (48, 72, 112) are not multiples of §4.2.2's spacing scale (4/8/12/16/24/40/64). While not a hard violation since Tailwind arbitrary values are permitted, it introduces visual inconsistency with the spec's design language.

**Evidence**: §4.2.2 defines `spacing: { 1: '4px', 2: '8px', 3: '12px', 4: '16px', 5: '24px', 6: '40px', 7: '64px' }`.

**Recommended fix**: Use spacing tokens: `grid-cols-[48px]` could be `w-6` (40px) or `w-7` (64px); column 2 (72px) = `w-6` + gap; column 3 (112px) = `w-6` + `w-7`. Adjust layout to fit the scale.

---

## Verdict

**PASS_WITH_CHANGES**

4 changes required before N2.wave.dashboard-2 sign-off (F1, F2, F3 = P1; these are structural bugs not taste calls). P2/P3 findings can be addressed in a follow-up polish pass.

---

## Commit

`88ce4e5` (head of R15 chain)

---

## Checks

- Review touches only `.hopper/handoffs/T-PROG-R15-REVIEW-opencode-output.md` and potentially `.hopper/queue.md` status flip.
- No product code modified by this review.

---

## Next recommendation

For N2.wave.dashboard-2 reviewer: prioritize F1 (clipped overflow — renders the Progress tab unusable when rows fill the drawer), F2 (limit mismatch — the 50-event security boundary is a no-op), and F3 (SSE invalidation data loss). F5 (wrong tooltip) and F4 (ARIA) are quick follow-ups.

## Status (background completion)
- queue_status: done
- adapter_status: success
- exit_code: 0
- duration_ms: 287303
- end_time: 2026-05-22T15:17:23.057Z
- log: see `T-PROG-R15-REVIEW-opencode-output.log` for raw output
