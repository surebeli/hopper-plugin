---
task_id: T-AUDIT-PH5-codex
adapter: codex
status: done
pid: 25332
start_time: "2026-05-21T01:29:28.773Z"
end_time: "2026-05-21T01:34:29.351Z"
exit_code: 0
duration_ms: 300406
mode: background
host_native: null
session_id: null
log: ./T-AUDIT-PH5-codex-output.log
started_by_pid: 9104
adapter_status: success
note: "queue_status manually corrected from 'failed' to 'done' — codex DID complete the audit (198k tokens, 7 findings) just as the misconfigured 300s timeout fired. That very issue is finding F2 below."
---

# T-AUDIT-PH5-codex — Phase 5 Third-Party Audit (codex xhigh, 2026-05-21)

## Dispatch metadata

- Invoked: `hopper-dispatch T-AUDIT-PH5-codex --background --reasoning xhigh`
- Parallel sibling: T-AUDIT-PH5-kimi (same files, different vendor, ran simultaneously via hopper background mode)
- Tokens used: **198,026**
- Wall-clock: 5 minutes (codex completed final VERDICT block as 300s SIGTERM fired — see F2)
- Runner PID: 25332

## Verdict: **REWORK**

7 findings: 4 P1 + 3 P2. All NEW — these were missed by the prior 12 local-scope codex audit cycles. Heterogeneous-vendor parallel dispatch surfaced bugs in lifecycle ownership, opt propagation, race conditions, and architectural inconsistency.

## Findings

### F1 — Process-tree leak on timeout (P1, confidence 9/10)

`cli/bin/hopper-runner:153` — background timeout calls `vendor.kill()` only on the top process. Windows .cmd wrapping + CLIs spawning children → descendants survive after Hopper marks task failed.

**Fix**: reuse `taskkill /T /F` + POSIX process-group kill from `cli/src/subprocess.js`; add child-tree timeout test.

### F2 — Adapter options dropped before timeoutMs (P1, confidence 9/10)

`cli/bin/hopper-runner:153` — `hopper-dispatch --background --reasoning xhigh` builds codex argv with xhigh, but runner calls `adapter.timeoutMs({ background: true })`. xhigh gets 300s instead of 900s.

**Observed live during THIS audit**: codex finished final VERDICT just as SIGTERM fired. Audit completed by luck, not design.

**Fix**: pass computed `timeoutMs` or serialized adapter opts to `hopper-runner`.

### F3 — Preflight-to-spawn TOCTOU still racy (P1, confidence 8/10)

`cli/src/background.js:252` — `preflightDispatch()` and initial `writeFrontmatter()` are separate ops. Two concurrent callers can both pass preflight and both spawn.

**Fix**: atomic lock via `openSync(lockPath, 'wx')` held until PID is seeded.

### F4 — OpenCode plugin hopperDir containment too weak (P1, confidence 9/10)

`hosts/opencode/plugins/hopper-async.ts:120` — accepts arbitrary `hopperDir` values ending in `.hopper`; absolute paths outside project allowed and written via `mkdirSync` / `writeFrontmatter`.

**Fix**: remove `hopperDir` from tool args, or realpath + require containment under `project.directory/.hopper`.

### F5 — OpenCode native path is a SECOND dispatcher impl (P2, confidence 8/10)

`hosts/opencode/plugins/hopper-async.ts:188` — bypasses `resolveDispatch`, task frames, vendor routing, heterogeneous-only warning. Marks success if any assistant message exists.

**Fix**: document as experimental OR route through dispatcher resolution.

### F6 — `--watch` hangs on terminal output file (P2, confidence 9/10)

`cli/bin/hopper-dispatch:508` — `lastStatus` starts as the terminal status; exit handling only runs on status changes → infinite wait on already-done tasks.

**Fix**: handle `done|failed|orphaned` immediately after initial read, OR `lastStatus = null` initially.

### F7 — `execSync(where)` weakens single-spawn proof (P2, confidence 8/10)

`cli/bin/hopper-runner:34` — Windows command resolution uses `execSync("where ...")`, a second subprocess. Tests only count `spawn()`, so the proof is partial.

**Fix**: in-process PATHEXT/PATH lookup with `fs.existsSync`.

## Top-3 insights prior audits missed

1. **The async layer's most damaging bug is not result parsing; it is lifecycle ownership on timeout.** Prior audits focused on parseResult — codex caught the kill mechanism is incomplete.
2. **Unique temp files fixed write clobbering, but not the preflight-to-spawn TOCTOU race.** Phase 5 audit P1 #4 addressed the wrong layer.
3. **OpenCode native async is a second dispatcher implementation, not just a host adapter.** Fundamental architectural divergence.

## Strongest HN attack

> "You said no harness core, then built a background process manager that can race, leak child processes, and has a separate OpenCode implementation."

**Best rebuttal prep**: keep the layer explicitly mechanical, then close four gaps: atomic per-task lock + shared process-tree kill + adapter-opt propagation + OpenCode plugin containment / semantic parity.

## Codex's own verification

Ran `node --test tests/unit/background.test.js tests/integration/runner-single-spawn.test.js tests/integration/background-e2e.test.js` → 32 pass, 3 skipped. Skipped Windows runner counter tests are exactly the F1 + F7 territory.

## Strategy interpretation

Substantively valuable third-party audit data. Codex found 7 bugs that 12 prior local-scope audit cycles missed. The dogfood dispatch chain worked: Strategy → hopper-dispatch --background → hopper-runner → codex → spec + code exploration + structured findings → output back into output.md frontmatter status flip.

**Bonus self-referential evidence**: this audit RUN exhibited finding F2 LIVE. The audit only barely completed before SIGTERM at 300s — proof-of-bug AND proof-the-tool-helped-find-it in the same run.

Kimi sibling task T-AUDIT-PH5-kimi: failed silently with 0-byte log (separate bug — kimi-specific). The heterogeneous parallelism worked structurally (both ran simultaneously) but kimi didn't produce findings.

## Next recommendations

Phase 6 priorities:
1. **F1 + F2 + F7** (runner trio): plumb adapter opts → fix timeoutMs + process-tree kill + replace `execSync(where)` with in-process PATHEXT lookup
2. **F3** (atomic lock): introduce sentinel via `openSync(path, 'wx')` between preflight and PID seed
3. **F4 + F5** (OpenCode plugin): remove `hopperDir` arg OR route through dispatcher resolution
4. **F6** (--watch): fix initial-state terminal detection
5. **Separately**: investigate kimi silent-fail mode (T-AUDIT-PH5-kimi 0-byte log)
