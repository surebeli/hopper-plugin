---
task_id: T-WEB-03
review_of: T-WEB-03
sidequest: web-dashboard
spec_version: "2.1"
spec_anchor: "docs/sidequests/web-dashboard/SPEC.md::T-WEB-03"
reviewer_vendor: "claude"
reviewer_model: "claude-opus-4-7"
reviewer_reasoning: "n/a (interactive host session)"
review_round: 1
start_time: "2026-05-22T01:35:00+08:00"
end_time: "2026-05-22T01:55:00+08:00"
duration_ms: 1200000
input_artifacts:
  - docs/sidequests/web-dashboard/SPEC.md
  - docs/sidequests/web-dashboard/handoffs/T-WEB-03-output.md
  - docs/sidequests/web-dashboard/handoffs/T-WEB-03-output.log
  - docs/sidequests/web-dashboard/handoffs/T-WEB-03-screenshot.png
  - "b0785da"   # impl commit
  - "425549d"   # handoff evidence commit (see F1)
verdict: "accept-with-note"
hard_constraint_violations: 0
findings_count:
  P0: 0
  P1: 0
  P2: 0
  P3: 3
acceptance_passed: 4
acceptance_total: 4
bundle_size_check: "passed"
design_token_check: "byte-match (unchanged from T-WEB-01)"
log: ./T-WEB-03-REVIEW-claude-output.log
prior_round_status: "F1 (T-WEB-02 tooltip) addressed via Radix migration + long-form aria-label; F3 (defensive sort) addressed via priorityRank/statusRank helpers; F2 (Radix policy) resolved by SPEC v2.1."
---

# T-WEB-03 — Review by Claude (`claude-opus-4-7`)

---

## 1. Verdict

**`accept-with-note`**

SSE infrastructure is structurally clean and reviewer-reproducible: 4/4 acceptance, `npm test` 354/339 reproduces exactly, `npm run dashboard:build` produces 109.68 KB gzipped (45% headroom remaining), all 6 SSE channels verified subscribable with `event: connected` + `retry: 1000`, manual Set-Content rerender measured at 249 ms (well under NFR-002's 1s ceiling). F1+F3 from T-WEB-02 folded in cleanly — Radix tooltip via shadcn primitive with keyboard-focusable `tabIndex={0}` wrap + `aria-label` long-form; sort uses `priorityRank()` / `statusRank()` helpers with `??` fallbacks. Zero hard-constraint violations. Three minor P3 nits, none block T-WEB-04. Ship.

---

## 2. Review scope

- Commits reviewed:
  - `b0785da` — `[T-WEB-03] implement watcher sse` (impl + tests + Radix tooltip; 13 files, +873/-58)
  - `425549d` — `[T-WEB-03] add handoff evidence` (output.md + log + screenshot; 3 files, +270)
- Time spent: ~20 min
- Approach: SSE hub correctness → watcher event-mapping → client `useSSE` hook → lifecycle teardown → `npm test` + `npm run dashboard:build` reproduction → §3.2 grep gates → Radix subset assertion → screenshot SSE-push verification

## 3. Files reviewed

| File | LOC | Notes |
|---|---|---|
| `dashboard/server/events/sse.js` | 75 | Map<channel, Set<res>> hub; heartbeat `.unref?.()` so it doesn't keep process alive; retry: 1000 + connected event in `add()` |
| `dashboard/server/events/watcher.js` | 82 | DI-friendly (accepts `watch` factory); `awaitWriteFinish` 50/150ms debounce; correct 5-file mapping (queue/cost/agents/handoff-md/handoff-log) |
| `dashboard/server/index.js` | 130 | Idempotent close; ordered teardown `server.close → watcher.close → hub.close`; `watchEvents`/`watcherFactory` opts for tests |
| `dashboard/server/routes/queue.js` (unchanged from T-WEB-02) | 27 | — |
| `dashboard/client/src/lib/sse.ts` | 48 | `useSSE` hook; `useRef` for stable callback; state machine `connecting→open→error→closed`; both `onmessage` + named event listener |
| `dashboard/client/src/routes/QueueRoute.tsx` | 16 | SSE-driven invalidate; no polling |
| `dashboard/client/src/components/QueueTable.tsx` | 151 | `refetchInterval` removed; sort uses `statusRank()`/`priorityRank()` |
| `dashboard/client/src/components/ui/tooltip.tsx` | 47 | shadcn standard structure on `@radix-ui/react-tooltip` (Portal + Arrow + animate-in classes) |
| `dashboard/client/src/components/StatusPill.tsx` | 32 | `TooltipTrigger asChild` → keyboard-focusable `span` w/ `aria-label` + `tabIndex={0}` + `focus-visible:ring-1` |
| `dashboard/client/src/lib/status.ts` | 57 | F3 fallback helpers; 5 long-form tooltip strings matching prior recommendation |
| `tests/unit/dashboard-sse.test.js` | 122 | 4 tests: hub multi-publish, 6-route fetch, watcher mapping, lifecycle close |
| `tests/unit/dashboard-queue.test.js` (diff) | +1 | StatusPill tooltip-string assertion added |
| `package.json` (diff) | +1 | `@radix-ui/react-tooltip@^1.1.0` |
| `package-lock.json` (diff) | +456 | transitive Radix deps; exempt per §3.3 v2.0.1 |

Total: ~510 LOC new/changed source + 122 LOC tests + 270 LOC artifacts.

---

## 4. Hard-constraint verification (§3.2)

### 4.1 协议红线

| Constraint | Independent check | Result |
|---|---|---|
| No `.hopper/` writes | `git diff b0785da^..425549d --name-only \| grep "^\.hopper/"` | `<empty>` ✓ |
| No `executeDispatch` import | `Grep "executeDispatch" dashboard/` | `<empty>` ✓ |
| Only loopback bind | `Grep "0\.0\.0\.0|listen\(.*'::'|'\*'" dashboard/server/` | `<empty>` ✓ — `parseServerArgs:35-38` still throws on non-127.0.0.1 |
| No edits to cli/ hosts/ commands/ existing files | git diff names | none touched ✓ |
| package.json additive | `git diff b0785da^..b0785da -- package.json` | +1 line (Radix) ✓ |

### 4.2 栈红线 (v2.1)

| Family | Check | Result |
|---|---|---|
| All forbidden families | combined regex on package.json | `<empty>` ✓ |
| Radix subset only (§B.3.3) | `node -e "Object.keys(p.dependencies).filter(k=>k.startsWith('@radix-ui/')).join('\n')"` | `@radix-ui/react-tooltip` only ✓ (no aggregate `radix-ui` package; no out-of-whitelist Radix entries) |

### 4.3 风格红线

| Constraint | Check | Result |
|---|---|---|
| No emoji in client src | grep + visual | `<empty>` ✓ |
| Commit prefix `[T-WEB-03]` | both commits | `b0785da [T-WEB-03] implement watcher sse` + `425549d [T-WEB-03] add handoff evidence` ✓ |
| Per-file source lines ≤ 200 | largest non-artifact: `QueueTable.tsx` 151 lines | ✓ |
| Design tokens unchanged | `git diff b0785da^..b0785da -- dashboard/client/src/styles dashboard/client/tailwind.config.ts` | empty ✓ |
| No push / amend / `--no-verify` | branch ahead by 4 commits; no force history | ✓ |
| Single commit per task | **2 commits** with `[T-WEB-03]` prefix — see F1 below | minor deviation, not blocking |

### 4.4 §B.3 white-list completeness

- Net new top-level deps: `@radix-ui/react-tooltip@^1.1.0` only → in §B.3.3 ✓
- Net new devDeps: none
- Transitive Radix deps in lockfile (`@radix-ui/react-presence`, `@radix-ui/react-primitive`, etc.) — per §B.3.3 protocol "reviewer 不会因为 transitive 判 rework" ✓

**Hard-constraint violations total: 0**

---

## 5. Acceptance verification (independent)

| # | Acceptance bullet (verbatim from §6 T-WEB-03) | Executor's evidence | Reviewer independent check | Pass? |
|---|---|---|---|---|
| 1 | 6 SSE channels subscribable + reconnect | unit test asserts all 6 with `event: connected` + `retry: 1000` | Inspected `sse.js:51-60` (router registers all 6); `tests/unit/dashboard-sse.test.js:60-81` opens each, asserts `200 + event: connected + retry: 1000`. **Reran `npm test`** → 339 pass including these 4 new tests ✓ | ✓ |
| 2 | Watcher close = no handle leak | unit test `startServer close shuts down watcher and SSE hub`; manual taskkill verified Listen sockets gone | Inspected `index.js:100-113`: idempotent `closed` guard + ordered `server.close → watcher.close → hub.close`; both `close()` call and `close` event paths converge. `heartbeat?.unref?.()` (`sse.js:7`) + `liveness?.unref?.()` (`watcher.js:25`) prevent timer-induced hang ✓ | ✓ |
| 3 | chokidar event → SSE payload mapping (unit) | `watcher maps chokidar events to SSE channels` test emits 5 mock events, asserts channels `queue/task/T-WEB-03/log/T-WEB-03/cost/agents` | `dashboard-sse.test.js:83-106` — 5 file types covered with `EventEmitter` mock; reproduced by `npm test` ✓ | ✓ |
| 4 | Manual queue edit rerenders ≤ 1s | `Set-Content` via temp HOPPER_DIR → 249 ms rerender; screenshot shows `T-SSE-01 (pending) updated via sse` + `T-SSE-02 (done) streamed second row` | **Inspected screenshot** at `T-WEB-03-screenshot.png`: dark bg, two synthetic rows present (`T-SSE-01 / code-impl / pending / codex / "updated via sse"` and `T-SSE-02 / code-review-adversar… / done / kimi / "streamed second row"`), status pills with correct color encoding, clock at `1:20:10 AM`, runtime live. 249 ms << 1000 ms threshold ✓ | ✓ |

**Acceptance passed: 4 / 4**

Plus reviewer-reproduced gates:
- `npm test` → 354 tests / 339 pass / 0 fail / 15 skipped — exact reproduction of executor's `# tests 354` / `# pass 339` ✓
- `npm run dashboard:build` → 0.27 KB HTML + 3.31 KB CSS + 106.10 KB JS gzipped = **109.68 KB total < 200 KB** — exact reproduction ✓
- `tsc --noEmit` passes (runs as part of build script) ✓

---

## 6. Design-token byte-match verification (§4.2)

- `globals.css`: untouched in T-WEB-03 — `git diff b0785da^..b0785da -- dashboard/client/src/styles` empty
- `tailwind.config.ts`: untouched — likewise
- Executor reported SHA256 hashes match prior (`789046FC...` / `D0E34ECF...`)

Result: **byte-match (unchanged)** ✓

---

## 7. Findings (severity-ordered)

### P0 / P1 / P2

**无。**

### P3

#### [F1] P3: Two commits for T-WEB-03 instead of "one commit per task" (§3.3)

- **Location**: `b0785da` (impl) + `425549d` (handoff artifacts only)
- **Evidence**:
  ```
  b0785da [T-WEB-03] implement watcher sse       — 13 files: src + tests + package
  425549d [T-WEB-03] add handoff evidence        — 3 files: output.md + log + screenshot
  ```
- **Root cause**: Spec §3.3 says "每个 task 一个 commit". Executor split impl-vs-artifacts. The split is defensible (impl commit stays reproducible without artifact noise) but it's a literal protocol deviation. Previous round's follow-up prompt did suggest "可以是第一个 commit 的一部分，或者单独一个" — that was for the F1/F3 nit cleanup, not for splitting output.md into a separate commit, so this is partially on me for ambiguity.
- **Why it matters**: §3.3 is one of the reviewer-grep gates; future stricter reviewers (the §8.1 default `opencode + kimi` pair) may flag this as auto-rework. Either tighten the rule's intent or codify the split convention so it's not a flag.
- **Recommended fix** (pick one, prefer the second):
  - (a) **Codify the split** — patch §3.3 to allow "implementation + handoff-artifacts split" as long as both commits share the `[T-WEB-XX]` prefix and the artifact commit is doc-only. Cleanest forward.
  - (b) Squash future tasks into single commits — `git reset --soft HEAD~1 && git commit -m "[T-WEB-XX] ..."`; not retroactive for T-WEB-03.
- **Hard-constraint?**: borderline — current spec says yes (literal "一个 commit"), spirit says no
- **Reviewer recommendation**: take path (a) and patch the spec; the split is actually a useful convention worth codifying

#### [F2] P3: `useSSE` parses JSON without `try/catch`

- **Location**: `dashboard/client/src/lib/sse.ts:26`
- **Evidence**:
  ```ts
  const handleMessage = (event: MessageEvent) => {
    callbackRef.current(JSON.parse(event.data) as T);
  };
  ```
- **Root cause**: All SSE messages from `dashboard/server/events/sse.js::format()` are well-formed JSON in the `data:` line, so this works in practice. But a stray byte (e.g., a proxy injecting noise, or future channel sending a non-JSON status) throws inside the listener, and per HTML spec uncaught throws in `addEventListener` callbacks are swallowed silently — the user's `onMessage` callback never runs again for that source, and there's no observable signal.
- **Why it matters**: Defensive boundary. The dashboard's "live" status depends on this listener working. One bad payload silently disables a channel; user has no way to know without DevTools. Cheap fix.
- **Recommended fix**:
  ```ts
  const handleMessage = (event: MessageEvent) => {
    try {
      callbackRef.current(JSON.parse(event.data) as T);
    } catch (err) {
      console.warn(`[useSSE] parse error on ${channel}:`, err);
    }
  };
  ```
- **Hard-constraint?**: no

#### [F3] P3: `taskIdFromHandoff` doesn't account for PING v5 leader-feedback files

- **Location**: `dashboard/server/events/watcher.js:70-73`
- **Evidence**:
  ```js
  function taskIdFromHandoff(filePath) {
    const name = basename(filePath, '.md');
    return name.replace(/-REVIEW-.+$/, '').replace(/-output$/, '');
  }
  ```
- **Root cause**: PING.md v5 introduces `<task-id>-leader-feedback.md` files in `.hopper/handoffs/`. Current regex only strips `-REVIEW-*` and `-output` suffixes. A file like `T-WEB-04-leader-feedback.md` would map to channel `task/T-WEB-04-leader-feedback` rather than aggregating under `task/T-WEB-04` where the dashboard expects all task-related events.
- **Why it matters**: When the executor (or any other agent) writes leader-feedback during the in-progress phase of a task, the dashboard won't refresh the open Task Drawer (T-WEB-04). This is a latent issue, not a current-state defect.
- **Recommended fix**:
  ```js
  function taskIdFromHandoff(filePath) {
    const name = basename(filePath, '.md');
    return name
      .replace(/-REVIEW-.+$/, '')
      .replace(/-leader-feedback$/, '')
      .replace(/-output$/, '');
  }
  ```
  Also worth: a unit test fixture for each handoff filename pattern (output / REVIEW / leader-feedback) — would catch future filename conventions.
- **Hard-constraint?**: no

---

## 8. Spec compliance map

| Spec section | Compliance | Notes |
|---|---|---|
| §3.1 CAN-DO | full | `@radix-ui/react-tooltip` (§B.3.3 entry), chokidar usage in watcher, `concurrently` not needed this round |
| §3.3 file scope | partial | 2 commits — see F1 (defensible but literal deviation) |
| §4.1 design principles | full | hairlines, mono, dual-encoded pill, focus-visible ring on tooltip trigger |
| §4.2 design tokens | byte-match (unchanged) | git diff confirms |
| §4.3 component map | on-track | `Tooltip` now via Radix; `Sheet`/`AlertDialog`/`Tabs` upcoming |
| §4.4 motion ceilings | pass (with note) | shadcn tooltip uses `animate-in fade-in-0 zoom-in-95` via `tailwindcss-animate` (whitelisted); default 150ms within 180ms ceiling; these are opacity+transform animations matching §4.4 allow-list spirit |
| §5.1 directory structure | pass | `dashboard/server/events/{sse,watcher}.js` + `dashboard/client/src/lib/sse.ts` per layout |
| §B.3.3 Radix subset | pass | only `react-tooltip`; no aggregate `radix-ui` package |
| FR-003/004 SSE infrastructure | foundation laid | log streaming (FR-003) deferred to T-WEB-05; queue auto-refresh (FR-004) working end-to-end |
| NFR-002 SSE latency < 1s | **pass (measured 249ms)** | executor's manual rerender timing |
| NFR-005 bundle gzipped < 200KB | **pass (reviewer-reproduced)** | 109.68 KB; 45% headroom |

---

## 9. Sibling-reviewer cross-check

- Other reviewer artifact: n/a — first and only reviewer
- §8.1 default pair not dispatched (user chose host-session)
- §8.4 satisfied: 1/1 reviewer gives `accept-with-note`

---

## 10. Verdict deliberation

- Hard-constraint violations: **0** → gate passes (F1's 2-commit split is borderline but not blocking; spec interpretation question)
- Severity tally: P0=0, P1=0, P2=0, P3=3
- Acceptance: **4/4** passed (all reviewer-reproduced or independently inspected)
- Design tokens: byte-match (unchanged)
- Bundle size: **109.68 KB / 200 KB** → pass with 45% headroom
- Aggregation rule applied: "only P3 findings AND acceptance fully pass → **accept-with-note**"
- **Final verdict: `accept-with-note`**

---

## 11. Required follow-up actions

For executor (priority order):

1. **F2** — One-line try/catch around `JSON.parse` in `useSSE`. Trivial, low-risk. ← **soft**
2. **F3** — Add `-leader-feedback$` to the regex in `taskIdFromHandoff` + a unit test covering all three filename patterns. ← **soft**, but worth doing before T-WEB-04 when leader-feedback could arrive
3. **F1 (user-decision)** — depends on user's spec ruling (see below); if path (b), squash future tasks; if path (a), proceed as-is. ← **decision-needed**

None block T-WEB-04.

For sidequest maintainer (= user):

- **F1 decision** — codify the impl + artifacts 2-commit split as allowed (recommended) OR insist on single commit. Reviewer recommends **codify the split** since it improves impl-commit cleanliness and the artifact commit is doc-only.
- Optional: dispatch §8.1 default pair for adversarial cross-check.

---

## 12. Adversarial probe notes

- Hypothesis: heartbeat timer would keep Node process alive after `taskkill` → **ruled out** (`heartbeat?.unref?.()` line 7 of `sse.js`)
- Hypothesis: liveness interval would similarly leak → **ruled out** (`liveness?.unref?.()` line 25 of `watcher.js`)
- Hypothesis: `EventSource` double-listener (`onmessage` + `addEventListener(eventName, ...)`) would double-fire on each push → **ruled out** (server sends `event: <name>`, never default unnamed events; `onmessage` only fires for default messages; dual setup is redundant but not double-firing)
- Hypothesis: Radix tooltip would pull in `aggregate radix-ui` package (per executor's deviation note) → **ruled out** (only `@radix-ui/react-tooltip` in top-level deps)
- Hypothesis: SSE close on server shutdown would leave hanging connections → **ruled out** (`hub.close()` calls `res.end?.()` on each, then clears the Set)
- Hypothesis: animate-in classes might violate §4.4 by being CSS animations not transitions → **partial confirm** (literal reading: yes; spirit: opacity+transform under 180ms is in-scope; reviewer accepts shadcn standard usage via whitelisted `tailwindcss-animate`)
- Hypothesis: review file edits would publish to the parent task channel → **verified** (`taskIdFromHandoff` strips `-REVIEW-*` first; a review file change publishes `task/<id>` not `task/<id>-REVIEW-...`). Design intent: review updates are part of the task's event stream. Sensible.
- Areas NOT examined:
  - Reconnect behavior on long disconnects (would need network simulation; defer to T-WEB-08 polish)
  - SSE buffer overflow under sustained high-rate file changes (no rate-limiting visible; could be P3 if dashboard sees burst-write scenarios; defer until observed)
  - Cross-platform watcher behavior on macOS / Linux (Windows-verified only)
