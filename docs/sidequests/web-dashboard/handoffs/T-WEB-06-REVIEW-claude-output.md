---
task_id: T-WEB-06
review_of: T-WEB-06
sidequest: web-dashboard
spec_version: "2.1.2"
spec_anchor: "docs/sidequests/web-dashboard/SPEC.md::T-WEB-06"
reviewer_vendor: "claude"
reviewer_model: "claude-opus-4-7"
reviewer_reasoning: "n/a (interactive host session)"
review_round: 1
start_time: "2026-05-22T04:00:00+08:00"
end_time: "2026-05-22T04:20:00+08:00"
duration_ms: 1200000
input_artifacts:
  - docs/sidequests/web-dashboard/SPEC.md
  - docs/sidequests/web-dashboard/handoffs/T-WEB-06-output.md
  - docs/sidequests/web-dashboard/handoffs/T-WEB-06-output.log
  - docs/sidequests/web-dashboard/handoffs/T-WEB-06-screenshot.png
  - "d42fc1c"
  - "1be43ef"
verdict: "accept-with-note"
hard_constraint_violations: 0
findings_count:
  P0: 0
  P1: 0
  P2: 0
  P3: 3
acceptance_passed: 4
acceptance_total: 4
bundle_size_check: "passed — main 116.86 KB (< 120 KB prompt ceiling); lazy shrunk 72.38 → 65.12 KB"
design_token_check: "byte-match (unchanged)"
log: ./T-WEB-06-REVIEW-claude-output.log
prior_round_status: "T-WEB-05 F1/F2/F3 carried to T-WEB-08 polish backlog (untouched, as planned). Executor proactively addressed CRLF test fragility by running clean tests in autocrlf=false worktree."
---

# T-WEB-06 — Review by Claude (`claude-opus-4-7`)

---

## 1. Verdict

**`accept-with-note`**

Vendor Inventory is the first write-capable surface on the dashboard, and it shipped clean: 4/4 acceptance, `npm test` reproduces (with the known CRLF test noise documented and worked around by the executor), `npm run dashboard:build` produces main 116.86 KB / 200 KB (42% headroom), `spawn-cli.js` correctly enforces a 5-vendor allowlist on the only write path, AlertDialog confirm-flow uses Radix correctly with overlay preserved (correctly — confirm dialogs should dim background, unlike Sheet drawers). Three P3 nits, all soft and forward-looking. Ship.

The executor also caught and transparently disclosed a spec discrepancy: §6 T-WEB-06 acceptance says "compare with `hopper-dispatch --status`" but `--status` is queue-only; stale markers come from `--models` / `--capabilities`. Worth a spec patch (F1).

---

## 2. Review scope

- Commits reviewed:
  - `d42fc1c` — `[T-WEB-06] implement vendor inventory` (11 files, +561/-18)
  - `1be43ef` — `[T-WEB-06] add handoff evidence` (3 files; doc-only)
- Time spent: ~20 min
- Approach: write-path security audit first (spawn allowlist + body validation) → vendor inventory data join → AlertDialog correctness vs §4.3 → bundle math (confirm main < 120 KB prompt ceiling) → screenshot inspection → `npm test` + `npm run dashboard:build` reproduction → §3.2 grep gates

## 3. Files reviewed

| File | LOC | Notes |
|---|---|---|
| `dashboard/server/lib/spawn-cli.js` | 23 | `ALLOWED_VENDORS = Set(5)` allowlist guard; `buildProbeArgs` factored; injectable `spawn` for tests; only `['--probe', vendor]` ever passed |
| `dashboard/server/routes/actions.js` | 68 | `active` Set for per-vendor concurrency; 409 on duplicate; 400 on EINVAL; 500 on non-zero exit; `try/finally { active.delete }` correct cleanup |
| `dashboard/server/routes/vendors.js` | 63 | DI factory pattern; `readVendorInventory` joins `listAdapters()` × `readCacheWithDiagnostics()` × `capabilitiesForAdapter()`; preserves `cacheError` through to client |
| `dashboard/client/src/components/VendorCard.tsx` | 88 | Card + AlertDialog wrap on Probe button; `asChild` trigger; `[··· ]` mono replacement during pending; metrics list with truncation |
| `dashboard/client/src/components/ui/alert-dialog.tsx` | 119 | shadcn primitive on Radix; overlay kept w/ `bg-foreground/15` (correct for confirm dialog per §4.3); Action `buttonVariants(outline)`; Cancel `ghost` |
| `dashboard/client/src/routes/VendorsRoute.tsx` | 37 | useQuery + useMutation; `probe.isPending && probe.variables === name` correctly scopes loading to clicked card |
| `dashboard/client/src/lib/api.ts` (diff) | +13 | `fetchVendors`, `probeVendor`, `queryKeys.vendors` |
| `dashboard/client/src/lib/types.ts` (diff) | +23 | `Vendor`, `VendorInventory`, `ProbeResult` types |
| `tests/unit/dashboard-vendors.test.js` | 107 | 3 tests: inventory merge, spawnProbe allowlist + injection-attack rejection, 409 duplicate guard |
| `package.json` (diff) | +1 | `@radix-ui/react-alert-dialog@^1.1.0` |
| `package-lock.json` (diff) | +29 | Radix AlertDialog transitive deps (smaller footprint than Dialog because it reuses Radix primitives) |

Total: ~395 LOC new/changed source + 107 LOC tests + 276 LOC artifacts.

---

## 4. Hard-constraint verification (§3.2)

### 4.1 协议红线

| Constraint | Check | Result |
|---|---|---|
| No `.hopper/` writes | `git diff d42fc1c^..1be43ef --name-only \| grep "^\.hopper/"` | `<empty>` ✓ |
| No `executeDispatch` import | grep | `<empty>` ✓ |
| Only loopback bind | unchanged | ✓ |
| No edits to cli/ hosts/ commands/ existing files | git diff names | none touched ✓ |
| package.json additive | diff inspection | +1 dep only ✓ |

### 4.2 栈红线 (v2.1)

| Family | Check | Result |
|---|---|---|
| All forbidden families | regex on package.json | `<empty>` ✓ |
| Radix subset only (§B.3.3) | `node -e "Object.keys(p.dependencies).filter(k=>k.startsWith('@radix-ui/'))"` | `react-alert-dialog` + `react-dialog` + `react-tabs` + `react-tooltip` — all 4 whitelisted ✓; **no aggregate `radix-ui`** ✓ |

### 4.3 风格红线

| Constraint | Check | Result |
|---|---|---|
| No emoji in client src | grep | `<empty>` ✓ |
| Commit prefix `[T-WEB-06]` | both | `d42fc1c [T-WEB-06] implement vendor inventory` + `1be43ef [T-WEB-06] add handoff evidence` ✓ |
| §3.3 v2.1.1 split (impl + doc-only) | impl `d42fc1c` 11 files (src+tests+deps); doc `1be43ef` 3 files (output.md/.log/.png) | ✓ |
| Per-file source lines ≤ 200 | largest: `alert-dialog.tsx` 119 lines | ✓ |
| Design tokens unchanged | git diff confirms no styles/tailwind touched | ✓ |
| No SheetOverlay regression | unchanged from T-WEB-04 | ✓ |
| Confirm button is `outline` not filled (§4.3) | `alert-dialog.tsx:88` `buttonVariants({ variant: 'outline' })` | ✓ |

### 4.4 §B.3 white-list completeness

- Net new runtime deps: `@radix-ui/react-alert-dialog@^1.1.0` only → §B.3.3 ✓
- Net new devDeps: none

**Hard-constraint violations total: 0**

---

## 5. Write-path security audit (first task with write capability)

This is the dashboard's first write surface — extra scrutiny warranted.

| Attack vector | Defense | Verified |
|---|---|---|
| Command injection via vendor name | `ALLOWED_VENDORS.has(vendor)` allowlist (Set of 5) | `spawn-cli.js:15-19` throws `EINVAL`; tests assert `'codex; rm -rf /'` rejected ✓ |
| Arg injection (extra flags) | `buildProbeArgs(vendor)` returns fixed `['--probe', vendor]`; user args never appended | `spawn-cli.js:11-13` — single source for argv ✓ |
| Path traversal in DISPATCH_PATH | Hardcoded `resolve(__dirname, '..', '..', '..', 'cli', 'bin', 'hopper-dispatch')` | not user-influenced ✓ |
| `--background` or `--dispatch` smuggled | `buildProbeArgs` only emits `--probe <vendor>`; tests assert `--background`/`--dispatch` not in args | ✓ |
| Shell interpretation | `spawn(process.execPath, args, {})` — no shell, argv passed directly | no shell interpretation ✓ |
| Stdin attacks | `stdio: ['ignore', 'pipe', 'pipe']` — stdin closed | ✓ |
| Resource exhaustion (concurrent probe spam) | `active` Set + 409 reject; tests verify | ✓ |
| Stdout/stderr exhaustion | `appendTail(s, c, 65536)` keeps last 64 KB only | ✓ |
| Loopback bind not enforced | unchanged from T-WEB-01 (`startServer` rejects non-127.0.0.1) | ✓ |
| CSRF on POST | Local-only `127.0.0.1` + no auth means CSRF surface is limited to malicious local-network attackers; acceptable for sidequest scope | ✓ (acceptable) |

**Write-path security: solid.** No findings here.

---

## 6. Acceptance verification (independent)

| # | Acceptance bullet (verbatim from §6 T-WEB-06) | Executor's evidence | Reviewer independent check | Pass? |
|---|---|---|---|---|
| 1 | 5 vendors display (codex / kimi / opencode / copilot / agy) | CDP `cardCount=5`; unit asserts ordered names | Inspected `vendors.js:40` `listAdaptersImpl().map(...)` — order preserved from `listAdapters()` in cli/src/vendors; test fixture verifies all 5 names in order. **Screenshot shows 2 cards** (codex + kimi) but viewport only fits 2 — the grid is `md:grid-cols-2` so 5 cards in 3 rows. The screenshot crops at row 2, consistent with `cardCount=5` total ✓ | ✓ |
| 2 | `[STALE]` marker matches CLI cache output | Executor used `hopper-dispatch --models codex` (not `--status` — see F1 spec note); printed `codex (full, 50.8d ago) [STALE]`; dashboard returned `{"stale":true,"staleness":"50.8d ago","models":["gpt-test"]}` | `vendors.js:43,55,56` uses `isStale(cached?.probed_at)` + `staleness(cached?.probed_at)` — same functions as CLI's `--models`/`--capabilities` output (both imported from `cli/src/cache.js`). Byte-for-byte same logic, different presentation. ✓ | ✓ (with F1 note) |
| 3 | Probe flow: click → dialog → confirm → loading → updated cache view | CDP `requestCount=1`, loading observed, `staleCount 5→4`, `hasFresh=true`, `hasModel=true` | **Inspected screenshot**: AlertDialog open with "Probe kimi" title, full description text "Refresh vendor capability cache for kimi? This will spawn hopper-dispatch and may take 10-30 seconds.", Cancel (ghost) + Confirm (outline) buttons. `VendorCard.tsx:39-46` confirms `[··· ]` mono replacement during isProbing; `VendorsRoute.tsx:13-14` confirms `invalidateQueries` on mutation success ✓ | ✓ |
| 4 | Probe duplicate click rejected while running | Unit `probe action returns 409 while same vendor is already running`; CDP observed disabled button with `[··· ]` | `actions.js:12-15` `active.has(vendor)` → 409 + `active.add(vendor)` before await; `VendorCard.tsx:38` `disabled={isProbing}` on trigger button. Test fixture verifies both server-side (409) and client-side (button state) ✓ | ✓ |

**Acceptance passed: 4 / 4**

Plus reviewer-reproduced gates:
- `npm test` → **364/347/0/15** (the 2 "fails" are the known CRLF test fragility on slash command files; executor's clean `autocrlf=false` worktree reports 349/0) ✓
- `npm run dashboard:build` → 0.27 + 4.60 + 65.12 (lazy) + 116.86 (main) = **186.85 KB total**; main **116.86 KB < 120 KB prompt ceiling** ✓

---

## 7. Bundle composition (continued vigilance)

| Build | Main chunk | Lazy `TaskDetailRoute` | CSS | Main headroom |
|---|---|---|---|---|
| T-WEB-04 (pre-lazy)        | 174.83 KB | — | 4.12 KB | 10.4% |
| T-WEB-04.5 (lazy applied)  | 106.88 KB | 68.92 KB | 4.12 KB | 44.4% |
| T-WEB-05                   | 106.88 KB | 72.38 KB | 4.34 KB | 44.4% |
| **T-WEB-06 (this round)**  | **116.86 KB** | **65.12 KB** | 4.60 KB | **41.4%** |

Observations:
- Main +9.98 KB: VendorsRoute + VendorCard + AlertDialog + `@radix-ui/react-alert-dialog`. All on the always-visible route, which is correct.
- Lazy -7.26 KB: Radix shares primitives (`@radix-ui/react-primitive`, `@radix-ui/react-context`, etc.) across Dialog + AlertDialog. Vite's chunk graph detected the shared deps and moved them to the main chunk (since `react-alert-dialog` is in main); `TaskDetailRoute` lazy chunk no longer needs to ship them separately.
- Net total: 179.22 → 186.85 KB (+7.6 KB) — clean.

**Forecast revision**: 
- T-WEB-07 CostBars (pure Tailwind, no chart libs) ≈ +2-3 KB
- T-WEB-08 keyboard shortcuts + ErrorBoundary + polish ≈ +3-5 KB
- End-of-T-WEB-08 main chunk: ~120-125 KB / 200 KB cap → still 37-40% headroom

---

## 8. Design-token byte-match verification (§4.2)

- `globals.css` + `tailwind.config.ts`: untouched; SHA256 unchanged
- AlertDialog overlay uses `bg-foreground/15` — derived from §4.2 `--foreground` token, not hex
- All confirm/cancel buttons use `buttonVariants(...)` — §4.3-conformant

Result: **byte-match (unchanged)** ✓

---

## 9. Findings (severity-ordered)

### P0 / P1 / P2

**无。**

### P3

#### [F1] P3: Spec §6 T-WEB-06 acceptance #2 says compare with `--status` but stale markers live in `--models` / `--capabilities`

- **Location**: `SPEC.md::§6 T-WEB-06 verification table row 2` — currently reads `[STALE] 标记与 hopper-dispatch --status CLI 输出一致`
- **Evidence**: Executor's deviation note: "SPEC says compare stale markers with `hopper-dispatch --status`, but current `--status` is queue-only; the vendor cache stale marker is exposed by `--models` / `--capabilities`". Verified by inspecting `cli/bin/hopper-dispatch` — `--status` prints queue summary (pending/in-progress/done/failed counts), no vendor cache info. `--models <vendor>` and `--capabilities <vendor>` print cached models + `[STALE]` marker via `staleness()` from `cli/src/cache.js`.
- **Root cause**: Spec was written when stale markers were assumed to be in `--status`; CLI evolved and stale info moved to `--models`/`--capabilities` without back-syncing the sidequest spec.
- **Why it matters**: Future strict reviewers (kimi/codex from §8.1) would auto-rework on the literal spec mismatch. Spec is the source of truth; reality drifted.
- **Recommended fix**: Patch §6 T-WEB-06 verification to `[STALE] 标记与 hopper-dispatch --models <vendor> CLI 输出一致 (--status 是 queue 摘要不含 vendor cache)`. Reviewer recommends I patch this now (one-line spec edit) to clear the deviation.
- **Hard-constraint?**: no — spec patch, not code

#### [F2] P3: No user-visible error UI when a probe fails (server returns 500)

- **Location**: `dashboard/client/src/routes/VendorsRoute.tsx:11-16`
- **Evidence**:
  ```ts
  const probe = useMutation({
    mutationFn: probeVendor,
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: queryKeys.vendors }); },
  });
  ```
  No `onError` handler; `VendorCard` doesn't read `probe.error` or `probe.isError`. Server returns 500 on probe failure (e.g., codex CLI absent or non-zero exit), client mutation goes to error state silently, button comes back, user gets no feedback.
- **Root cause**: Spec acceptance doesn't require error UI for failed probes (only "loading" and "updated cache view"); executor implemented to spec.
- **Why it matters**: First sidequest write surface. If a vendor is uninstalled or hopper-dispatch crashes, the user clicks, waits, sees nothing change. They re-click — same result. No path to diagnosis without DevTools network tab.
- **Recommended fix**: T-WEB-08 polish — add `onError` to surface failures via Sonner toast (`sonner` is in §B.3.2). Concrete:
  ```ts
  import { toast } from 'sonner';
  const probe = useMutation({
    mutationFn: probeVendor,
    onSuccess: () => { /* ... */ },
    onError: (err, vendor) => toast.error(`probe ${vendor} failed: ${err.message}`),
  });
  ```
- **Hard-constraint?**: no

#### [F3] P3: No spawn timeout — pathological hopper-dispatch hang locks vendor in `active` Set forever

- **Location**: `dashboard/server/routes/actions.js:34-60` (runProbe Promise)
- **Evidence**: `runProbe` awaits child `'exit'` event. If hopper-dispatch hangs (no exit), the `active.delete(vendor)` in finally never fires (because await never resolves), and subsequent probes for that vendor return 409 indefinitely. User has to restart server.
- **Root cause**: Defensive timeout not part of T-WEB-06 acceptance.
- **Why it matters**: Vendor probes typically 5-30s but `--probe` does spawn a real CLI; if codex/kimi binary hangs (rare but possible — `kimi-cli` had silent timeouts during dogfood per `.hopper/queue.md::T-AUDIT-PH5-kimi`), the dashboard's probe queue locks up. Same pattern as PING.md's orphan handling.
- **Recommended fix**: T-WEB-08 polish — add 60s timeout that kills child + rejects:
  ```ts
  const timeout = setTimeout(() => {
    child.kill();
    rejectRun(new Error(`probe timed out after 60s`));
  }, 60_000);
  child.once('exit', () => { clearTimeout(timeout); /* ... */ });
  ```
  And surface the timeout in the UI via F2's toast.
- **Hard-constraint?**: no

---

## 10. Spec compliance map

| Spec section | Compliance | Notes |
|---|---|---|
| §3.1 CAN-DO | full | `@radix-ui/react-alert-dialog` per §B.3.3; `child_process.spawn` via spawn-cli |
| §3.3 v2.1.1 2-commit split | pass | impl + doc-only, prefixes correct |
| §4.1 design principles | full | hairlines, mono, info density (cache age / model count / source as metrics) |
| §4.2 design tokens | byte-match (unchanged) | — |
| §4.3 component map | on-track | `AlertDialog` Radix-backed, Confirm=outline / Cancel=ghost — §4.3 conformant |
| §4.4 motion ceilings | pass | Radix AlertDialog uses tailwindcss-animate defaults; `[··· ]` static loading char per §4.4 |
| §5.1 directory structure | pass | `VendorCard.tsx`, `ui/alert-dialog.tsx`, `routes/VendorsRoute.tsx`, `server/lib/spawn-cli.js`, `server/routes/{vendors,actions}.js` per layout |
| §B.3.3 Radix subset | pass | 4 packages, all whitelisted |
| §B.2 spawn whitelist | pass | only `hopper-dispatch --probe <vendor>`; allowlist gate; no `--background`/`--dispatch` |
| FR-005 Vendor Inventory | **delivered** | grid + install/staleness/models per vendor |
| FR-008 Probe confirm | **delivered** | AlertDialog + outline confirm |
| §6 acceptance #2 stale comparison | **partial — spec wording mismatch** | see F1 |
| NFR-005 prod bundle main < 200KB | **pass (116.86 KB)** | 41% headroom |

---

## 11. Sibling-reviewer cross-check

- Other reviewer artifact: n/a — first and only reviewer
- §8.1 default pair not dispatched
- §8.4 satisfied: 1/1 reviewer gives `accept-with-note`

---

## 12. Verdict deliberation

- Hard-constraint violations: **0** → gate passes
- Severity tally: P0=0, P1=0, P2=0, P3=3
- Acceptance: **4/4** passed (with F1 spec-vs-reality note documented, not blocking)
- Design tokens: byte-match
- Bundle size: **main 116.86 KB / 200 KB (41% headroom)** — under prompt's 120 KB ceiling
- Write-path security: solid (no findings)
- Aggregation rule: "only P3 findings AND acceptance fully pass → **accept-with-note**"
- **Final verdict: `accept-with-note`**

---

## 13. Required follow-up actions

For executor:

- None for T-WEB-06 itself.

For sidequest maintainer (= user):

- **F1 (recommended now)** — patch SPEC §6 T-WEB-06 acceptance row 2 to reference `--models <vendor>` instead of `--status`. One-line edit. I can do this immediately if you OK.
- F2 + F3 — add to T-WEB-08 polish backlog (toast on probe error + 60s spawn timeout).

Cumulative T-WEB-08 polish backlog (now 7 items):
1. T-WEB-05 F1: `readLogChunk` cap initial 1 MB tail
2. T-WEB-05 F2: reconnect exponential backoff + "lost connection" UI
3. T-WEB-05 F3: ANSI parser foreground-only (defer unless vendor needs bold/bg)
4. T-WEB-04 F3: `frontmatterFields` dynamic via `Object.keys`
5. T-WEB-04 F4: extract markdown-body Tailwind chain to `.markdown-body` class
6. **T-WEB-06 F2**: toast on probe failure
7. **T-WEB-06 F3**: 60s spawn timeout + kill on timeout

---

## 14. Adversarial probe notes

- Hypothesis: ALLOWED_VENDORS Set with regex injection like `codex\nopencode` → **ruled out** (`Set.has(string)` is exact-match, not regex)
- Hypothesis: race where 2 simultaneous requests both pass `active.has(vendor)` check before either adds → **partially confirmed**, but Node.js single-threaded event loop means `if (!active.has) { active.add; await... }` is atomic between sync portions. The await happens only after `add`, so the second request sees the addition. ✓
- Hypothesis: child process leaks if request is aborted client-side → **possible** (spawn doesn't auto-kill on response abort), but acceptable for local dashboard
- Hypothesis: `installStatus: 'cached'` is reachable — when does cached exist without binary_path? → **verified** when `readCacheWithDiagnostics` returns an entry that was probed but install check failed; the vendor was once installed, cache record exists, binary_path is null. Status correctly distinguishes "never probed" (unknown) from "probed but binary gone" (cached). Good edge case handled.
- Hypothesis: `req.body?.vendor` undefined would crash → **ruled out** (`active.has(undefined)` returns false → `active.add(undefined)` → spawnProbe(undefined) → throw EINVAL → 400. Defense in depth works.)
- Hypothesis: lazy chunk shrinkage indicates accidentally moving needed code out of TaskDetailRoute → **ruled out** (drawer still works per T-WEB-04 acceptance; the shrinkage is from Vite sharing Radix primitive deps between Dialog and AlertDialog, both in main now via AlertDialog)
- Hypothesis: AlertDialog overlay would clash with §3.2 spirit "no background dimming for Sheet" → **ruled out** (the rule is specific to drawer Sheet, not confirm dialogs; AlertDialog overlay is correct UX per §4.3 row "AlertDialog — 仅用于 §FR-008 写操作确认")
- Areas NOT examined:
  - Real `hopper-dispatch --probe codex` execution (would mutate vendor cache; executor used CDP fake spawn for safety)
  - Probe under network partition (server alive, dispatch hangs) — see F3
  - Multi-vendor parallel probe (e.g., codex + kimi simultaneously) — should work per the per-vendor `active` Set, but not explicitly tested
