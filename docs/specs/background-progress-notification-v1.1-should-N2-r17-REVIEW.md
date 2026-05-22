# N2.wave.r17 Plan Review — v1.1 R17 (release docs sync) + v1.1 Milestone Closeout

Status: verdict v1.0 — **accept** + **v1.1-should milestone CLOSED**
Date: 2026-05-23
Anchor: `docs/specs/background-progress-notification-v1.1-should-N2-r17-REVIEW.md::root`
Reviewer role: third-party architecture review agent (read-only)
Wave scope: R17 of PLAN-v1.1 (release docs sync; closes N-w4.1 + N-w4.2); final v1.1 wave

## Companions

- PLAN-v1.1: `docs/specs/background-progress-notification-v1.1-should-PLAN.md` §R17
- N1.v2: `docs/specs/background-progress-notification-v1.1-should-N1-REVIEW.md`
- v1.0 milestone close: `docs/specs/background-progress-notification-v1-must-N2-wave4-REVIEW.md`
- N2.r07: `docs/specs/background-progress-notification-v1.1-should-N2-r07-REVIEW.md`
- N2.dashboard-1: `docs/specs/background-progress-notification-v1.1-should-N2-dashboard1-REVIEW.md`
- N2.dashboard-2: `docs/specs/background-progress-notification-v1.1-should-N2-dashboard2-REVIEW.md`

## Round History

| Round | Date | Verdict | Trigger |
|---|---|---|---|
| N2.wave.r17 v1 | 2026-05-23 | **accept** | R17 delivery: 2 atomic commits, 3 docs files, 425/425 tests unchanged, scope completely clean (zero src/test/deps changes), N-w4.1 + N-w4.2 both closed |

## Verdict Summary

| Dimension | Status | Notes |
|---|---|---|
| Rev-R17.1 INSTALL-MATRIX progress section | PASS | "Progress and completion notifications (v1.0 / v1.1)" section added with progress sidecar / watch-events / OS toast / host wake / dashboard subsections |
| Rev-R17.2 README quick-link | PASS | One-line link to `hopper-dispatch --progress` + `--watch-events` |
| Rev-R17.3 PRD §6.6 packaging anchor | PASS | "Packaging anchor (post-R16 spike)" inserted; clarifies `monitors/monitors.json` lives at plugin **root** not under `.claude-plugin/`. **Closes N-w4.2** |
| Rev-R17.4 HOPPER_TEST_ONLY caveat | PASS | Test-only env-var section added in INSTALL-MATRIX. **Closes N-w4.1** |
| Test suite | PASS | 425/425 unchanged (R17 is docs-only) |
| Scope discipline | PASS | 3 files touched (README + INSTALL-MATRIX + PRD); cli/ commands/ monitors/ hosts/ dashboard/ package.json tests/ all = 0 lines |
| Commit hygiene | PASS | 2 atomic commits `[T-PROG-R17*]`; max single-file delta 35 lines (INSTALL-MATRIX); minor minor: no separate OUTPUT.md (acceptable for tiny docs wave) |

Overall: **accept**. R17 wave closed. **v1.1-should milestone CLOSED.**

---

## Evidence

### Commit history

```
a6b8073 [T-PROG-R17] anchor Claude monitor packaging path     (1 file,  +2)
de57784 [T-PROG-R17] document progress notifications          (2 files, +36)
```

| Commit | Files | Lines |
|---|---|---|
| `de57784` | README.md (+1), INSTALL-MATRIX.md (+35) | +36 |
| `a6b8073` | PRD §6.6 | +2 |

Both well within 300-line ceiling. `[T-PROG-R17]` prefix consistent.

### File scope

```
README.md                                              (Rev-R17.2)
docs/release/INSTALL-MATRIX.md                         (Rev-R17.1 + R17.4)
docs/specs/background-progress-notification-prd-trd.md (Rev-R17.3)
```

3 files only. Out-of-scope verification: `git diff HEAD~2 HEAD -- cli/ commands/ monitors/ hosts/ dashboard/ package.json tests/ | wc -l` = 0.

### Test verification

```
1..425
# pass 410
# fail 0
# skipped 15
```

Identical to R07 close. R17 docs change does not touch any tested code path.

### N-w4.x closure verification

| Note | Resolution |
|---|---|
| **N-w4.1** `HOPPER_TEST_ONLY_TIMEOUT_MS` docs | **CLOSED** — INSTALL-MATRIX.md "Test-only environment variables" section explicitly warns against setting in production, documents `HOPPER_TEST_ONLY_*` naming convention |
| **N-w4.2** monitors path canonical anchor | **CLOSED** — PRD §6.6 "Packaging anchor (post-R16 spike)" makes plugin-root `monitors/monitors.json` canonical and explicitly contradicts the original PLAN-v1.0 R16 text that suggested `.claude-plugin/monitors/` |
| **N-w4.3** vendor-fixture real-world dogfood | already substantively closed in R15 wave (opencode/deepseek productive review) |

---

# v1.1-should Milestone Closeout

## Final scorecard

| R-item | Wave | Verdict | Commits | Tests added |
|---|---|---|---|---|
| R14 dashboard server bridge | dashboard-1 | accept | 5 | +8 |
| R15 dashboard client UI | dashboard-2 | accept-with-revisions → R15.2 accept | 7 + 2 cleanup | +6 + 2 cleanup |
| R07 OS notify helper | r07 | accept | 5 | +11 |
| R17 release docs sync | r17 | accept | 2 | 0 |
| **Total** | 4 waves | — | **21** | **+27 net new** |

Cumulative test progression: v1.0 close 398 → 414 → 425 (v1.1 close).

## v1.1 deliverables

1. **`progress.log` JSONL events**, frontmatter progress fields, `--progress` CLI — already shipped in v1.0
2. **`--watch-events`** — already shipped in v1.0
3. **Dashboard progress integration** (R14 server + R15 client) — v1.1 add
4. **OS toast notification** (R07) — v1.1 add, three-platform (Windows BurntToast/MessageBox, macOS osascript, Linux notify-send)
5. **Release docs** (R17) — v1.1 add, anchors v1.0/v1.1 surfaces

User-facing impact: Claude Code users get native session wake (v1.0 R16), Codex CLI / OpenCode wrapper / standalone users get OS toast (v1.1 R07), dashboard users get full Progress tab with timeline + pinned terminal event (v1.1 R14/R15).

## Dogfood framework validation

The dogfood-as-implementation framework was exercised across **all 4 v1.1 waves**:

| Wave | Research dogfood | Review dogfood | Value delivered |
|---|---|---|---|
| R14 dashboard-1 | codex (xhigh) chokidar idioms | kimi adversarial | High: research informed tailer design |
| R15 dashboard-2 | (skipped) | opencode/deepseek-v4-flash | **Very high**: found 3 P1 bugs → R15.2 cleanup |
| R07 r07 | codex (xhigh) toast idioms | opencode UI review | Mixed: research valuable; review body empty (see N-w.r07.1) |
| R17 r17 | (skipped — pure docs) | (skipped) | N/A |

**Net finding**: dogfood produces real value most reliably for substantive code waves (R15). For tiny doc waves (R17) or already-well-specified mechanical waves (R07), it adds little. Pattern for v1.2: keep research dogfood for design-heavy R-items (R08 pipe+tee, R11 codex app-server) but skip review dogfood for trivial deltas.

## Notes inventory at v1.1 close

Open polish notes carried into next phase:

| Note | Origin | Severity | Notes |
|---|---|---|---|
| N-w3.1 partial-write orphan permissive | v1.0 wave 3 | informational | v1.2 design decision |
| N-w3.2 `readProgressEvents` `.1` rotate | v1.0 wave 3 | informational | v1.2 simple fix |
| N-w3.4 `--once` first-event semantics | v1.0 wave 3 | informational | doc-only or polish |
| N-w.d2.2 ARIA list semantics | v1.1 dashboard-2 | P2 | dashboard polish |
| N-w.d2.3 TaskStatusStrip tooltip uses truncated | v1.1 dashboard-2 | P2 | client polish |
| N-w.d2.4 `truncate` duplicated in 2 files | v1.1 dashboard-2 | P2 | refactor |
| N-w.d2.5 `ProgressEventRow` no `React.memo` | v1.1 dashboard-2 | P3 | perf polish |
| N-w.d2.6 grid column widths off-token | v1.1 dashboard-2 | P3 | design-token alignment |
| N-w.r07.1 opencode review wave-reliability | v1.1 r07 | informational | retro signal |
| N-w.r07.2 Win BurntToast spawn cost | v1.1 r07 | informational | cache optimization |

All NICE / SHOULD / informational. None blocking. Recommend a single `[T-PROG-POLISH]` wave between v1.1 and v1.2 to fold them in, OR carry to v1.2 as "while we're touching X" opportunities.

## Closed notes (already resolved)

| Note | Closed in |
|---|---|
| N-w4.1 HOPPER_TEST_ONLY docs | R17 |
| N-w4.2 monitors path anchor | R17 |
| N-w4.3 vendor-fixture dogfood | R15 (opencode produced real review) |
| N-w.d1.1 SSE_RECONNECT_FIELD anti-pattern | R15.2 (server simplified; client propagation rolled back) |
| N-w.d1.2 `taskIdFromLog` JSDoc | R15.2 |
| N-w.d1.3 progress consistency README note | R15.2 |
| N-w.d2.1 redline grep scope | N1.v2 Errata + R15.2 |

---

## Reviewer Boundary (unchanged)

Read-only. No code, no commit, no PR. v1.1 milestone close does not change reviewer role for v1.2.

---

## Next reviewer trigger

v1.1-should milestone is **CLOSED**. Available next phases:

- **v1.2 LATER** (`docs/specs/background-progress-notification-v1.2-later-PLAN.md`): R08 pipe+tee + R09 stream-parser + R10 capability + R11 Codex app-server deferral + R12 single-spawn reconciliation + R13 OpenCode native plugin. Highest technical risk in the spec; recommend N1 re-review before execution.
- **Polish wave** (`[T-PROG-POLISH]`): fold 10 open notes from above into a single small wave. Bundle main chunk should not move.
- **Hold + dogfood telemetry**: collect v1.0+v1.1 real-world data for 1-2 weeks before launching v1.2. Recommended because v1.2 R08 runner stdio change will temporarily disable some dogfood paths during transition.

---

## Revision Log

| Version | Date | Change |
|---|---|---|
| v1.0 | 2026-05-23 | First N2.wave.r17 review; verdict accept; v1.1-should milestone CLOSED |
