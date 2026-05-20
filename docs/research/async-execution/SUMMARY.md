# Async / Background Execution — Synthesis & Recommended Architecture

> Synthesis date: 2026-05-21
> Source documents:
> - `01-openai-hosts.md` (Codex CLI + Desktop)
> - `02-opencode.md` (OpenCode serve / plugin / CLI)
> - `03-other-ai-clis.md` (Kimi / Copilot / Agy)
> - `04-os-fallback.md` (Windows + macOS Node detached spawn)

---

## 1. Key findings condensed

| Target | Native background available? | What we use |
|---|---|---|
| **Claude Code** (host) | YES — `Bash(run_in_background=true)` + `Monitor` tool | Use natively (prompt-only change) |
| **Codex CLI** (host or vendor) | NO. Open issue #3968 (Sep 2025, no maintainer response) | Use fallback layer. Leverage `--output-last-message` + `--json` for session ID capture |
| **Codex Desktop** | NO usable API. Deep link is navigation-only; broken on Windows | Out of scope for async |
| **OpenCode** (host or vendor) | **YES — strongest of any host.** `POST /session/:id/prompt_async` returns 204 immediately; plugin system has `session.idle` + `session.error` hooks; precedent: `kdcokenny/opencode-background-agents` | Use natively via plugin (~50 LOC) + `opencode serve` |
| **Kimi CLI** (vendor) | Tool-layer `run_in_background=true` exists (Shell + Agent tools) but `kimi -p` itself is synchronous; `--session <id>` for cross-process resume | Use fallback layer; capture session ID as bonus |
| **Copilot CLI** (vendor) | NO local background. `&` prefix triggers cloud delegation → PR (violates constraint #3) | Use fallback layer only |
| **Agy** (vendor) | NO. Marketing "parallel subagents" is intra-invocation | Use fallback layer only |

**Bottom line on constraint #4 (prefer native, custom fallback only when none)**:

- **Native**: Claude Code (prompt-only) + OpenCode (plugin + server)
- **Fallback required**: Codex CLI / Codex Desktop / Kimi / Copilot / Agy

So we need BOTH paths in the implementation.

---

## 2. The architecture

### 2.1 State model — single source of truth: `output.md`

Result + job-state both live in `.hopper/handoffs/<task-id>-output.md` frontmatter:

```yaml
---
task_id: T-PLUGIN-XX
adapter: codex                # vendor adapter name
status: in-progress           # in-progress | done | failed | orphaned
pid: 24112                    # PID of hopper-runner wrapper (NOT vendor PID)
start_time: 2026-05-21T14:33:02.117Z
end_time: null                # filled on exit
exit_code: null               # filled on exit
duration_ms: null             # filled on exit
mode: background              # background | sync
host_native: claude-code      # null | claude-code | opencode
session_id: null              # captured if vendor supports session resume
log: ./T-PLUGIN-XX-output.log # sidecar with raw stdout/stderr
---
```

**Why PID of the wrapper, not vendor**: wrapper owns the lifecycle. If wrapper exits, vendor is gone (it's wrapper's non-detached child). Storing vendor PID would mis-classify when wrapper is doing post-processing.

**No new JSON files**. All state in markdown frontmatter. Spec §1 #1 (markdown-only) preserved.

### 2.2 Process topology (custom fallback path)

```
user runs `hopper-dispatch T-X --background`
   ↓ (returns in <50ms with PID)
hopper-dispatch (parent, ephemeral)
   ↓ spawn detached + unref → exits immediately
hopper-runner (wrapper, detached, ~30 LOC Node)
   ↓ spawn non-detached child, stdio → output.log fd
vendor CLI (single spawn, single attempt — spec §3 #4 preserved)
   ↓ exit
hopper-runner observes exit → atomic-rewrite output.md frontmatter
                            (status: done|failed, exit_code, end_time, duration_ms)
   ↓ exit
```

**Single-spawn invariant**: hopper-runner spawns vendor CLI exactly once. No retry, no fallback, no auto-restart. This is the spec §3 #4 contract — preserved.

**Detach mechanics** (per OS research):
- `spawn(cmd, args, { detached: true, stdio: ['ignore', fdOut, fdErr], windowsHide: true })` + `child.unref()`
- Open `output.log` with `fs.openSync(path, 'a')`, pass fd integer to stdio array, close in parent
- Kernel `O_APPEND` is atomic per-write on Win + POSIX

**PID liveness**: `process.kill(pid, 0)` — Node docs declare this cross-platform; signal 0 = existence probe.

**PID-reuse mitigation**: 24h ceiling rule — anything `in-progress` older than 24h is presumed orphaned regardless of `isAlive`. Sidesteps PID-reuse without needing `ps-list`/`pidusage` deps.

### 2.3 Native-native paths (per host)

**Claude Code (Tier B)** — prompt-only:
- `commands/dispatch.md` instructs Claude: for `--background` runs, use `Bash(run_in_progress=true)` + `Monitor` tool to stream `output.log` tail.
- Zero code change to dispatcher.
- Side effect: Claude session never blocks — Claude periodically monitors and reports progress.

**OpenCode (Tier C #2)** — bundled plugin:
- Ship `hosts/opencode/plugins/hopper-async.ts` (~50 LOC).
- Plugin registers `delegate` tool (mirrors `kdcokenny/background-agents`) that:
  1. Creates isolated session via OpenCode SDK
  2. `POST /session/:id/prompt_async` with hopper-dispatch instructions
  3. On `session.idle` hook fire → render transcript → write `output.md` + `output.log`
  4. Returns immediately to caller with task ID
- Requires `opencode serve` running. Wrapper falls back to detached spawn if no server.

**Codex CLI / Codex Desktop / Kimi / Copilot / Agy** — all use fallback layer.

### 2.4 Result retrieval

User reads `.hopper/handoffs/<task-id>-output.md` directly. Three convenience commands:

```bash
hopper-dispatch --watch T-X       # tail-follow output.log + frontmatter status until exit
hopper-dispatch --jobs            # list all in-progress jobs (scan handoffs/, filter status=in-progress)
hopper-dispatch --reap            # re-classify stale (>24h or dead-PID) jobs to orphaned
```

`--watch` uses `fs.watchFile` (polling) — `fs.watch` has too many platform inconsistencies (FSEvents start race on macOS, recursive quirks on Windows, ENOSPC on Linux).

**Stdout / exit code semantics unchanged in sync mode**. Async mode prints only `PID 12345 started; output: .hopper/handoffs/T-X-output.md` and exits 0.

### 2.5 Heterogeneous-only constraint

Dispatcher emits a **soft warning** (not hard block) when host vendor == resolved vendor:

```
Warning: invoked from codex-host but resolved vendor is also codex.
hopper-plugin's value proposition assumes heterogeneous combinations.
Consider dispatching to a different vendor (kimi, opencode, copilot, agy).
Continuing anyway. To suppress this warning, set HOPPER_ALLOW_SAME_VENDOR=1.
```

Detection: dispatcher reads `HOPPER_HOST_VENDOR` env var (set by each Tier C wrapper) and compares against resolved vendor.

---

## 3. Spec amendment surface

Add new §13 "Async dispatch" to spec v2.1, codifying:

1. **Async mode is opt-in** via `--background` (sync remains default).
2. **State model** = output.md frontmatter (above).
3. **Single-spawn invariant preserved** — wrapper owns lifecycle but spawns vendor exactly once.
4. **Status machine**: `in-progress → done | failed | orphaned`. 24h ceiling rule. No automatic re-dispatch.
5. **Heterogeneous-only** constraint as soft warning at dispatcher entry.
6. **Host-native preferred**: Claude Code via `Bash(run_in_background)`, OpenCode via plugin. Others use the wrapper fallback.
7. **No new JSON state files**. All async state in markdown.

Spec §3 #4 (no harness reaction core) — **unchanged**. Background mode is single-spawn, single-attempt, no retry. The wrapper is a process-lifetime adapter, not orchestration.

---

## 4. Implementation order (suggested)

### Phase 5a — Core infrastructure (sequential)
1. Spec v2.1 amendment §13 — describe the contract
2. `cli/src/background.js` — frontmatter parse/write helpers + `isAlive(pid)` + `preflight()` + 24h orphan rule (~80 LOC + tests)
3. `cli/bin/hopper-runner` — detached wrapper script (~50 LOC + tests)
4. `cli/bin/hopper-dispatch --background` flag + `--watch` flag + `--jobs` flag + `--reap` flag (~100 LOC + tests)
5. `output.md` frontmatter schema upgrade (update `cli/src/output.js`)
6. Cross-platform tests on Windows + macOS

### Phase 5b — Native host integration (parallelizable)
- **Tier B Claude Code**: rewrite `commands/dispatch.md` to use `Bash(run_in_background=true)` + `Monitor` (prompt-only, no code)
- **Tier C #2 OpenCode**: write `hosts/opencode/plugins/hopper-async.ts` + integration test against running `opencode serve`

### Phase 5c — Wrap-up
- INSTALL-MATRIX gets "async setup" section per host
- PASS-RATIONALE updates: spec §13 added as 6th hard criterion (or as §1 #6)
- codex audit cycle on the whole Phase 5

**Test count expected delta**: +30-50 tests (background.js + runner + flag parsing + cross-platform skips where needed).

---

## 5. Risks + open questions

| Risk | Severity | Mitigation |
|---|---|---|
| Windows `windowsHide: true` + `detached: true` flash | low | OS research confirmed mitigation: use file fds (not pipes) — bug doesn't trigger |
| PID reuse mis-identification | low | 24h ceiling rule sidesteps |
| User runs same task twice while first is in-progress | medium | `preflight` rejects with clear message + offers `--watch` |
| OpenCode server not running when plugin path invoked | medium | Wrapper auto-detects and falls back to detached subprocess |
| `output.md` frontmatter parse becomes a hot path | low | Cache last-mtime; only re-parse if changed |
| Conflict with spec §3 #4 "no harness reaction core" | **needs explicit spec amendment** | §13 declares the wrapper is process-lifetime, not orchestration |

**Open questions to resolve before Phase 5a starts**:

1. **Should `--background` be a separate flag, or the new default?** Recommendation: keep sync as default for v0.5; flip default in v0.6 once async is proven. Reason: sync mode is well-tested, has known semantics, and is what current users expect.
2. **Should we ship the OpenCode plugin even if user has no OpenCode?** It's ~50 LOC and only loads when user has OpenCode + invokes async. No cost to ship.
3. **PID file location**: 100% in `output.md` frontmatter? Or also a sidecar `output.pid` for fast scanning? Recommendation: just frontmatter — adds no benefit for `--jobs` since we have to read each file anyway to display state.

---

## 6. Cost projection

Implementation effort (no time estimate per user directive #5):

- Phase 5a: ~6 commits, ~300 LOC code + ~400 LOC tests
- Phase 5b Claude Code: prompt-only, ~1 commit
- Phase 5b OpenCode: ~1 commit, ~50 LOC plugin + ~80 LOC tests (needs `opencode serve` to validate)
- Phase 5c: ~2-3 commits documentation

Codex audit cycles expected: 2 (Phase 5a + Phase 5b OpenCode). Cost: ~$0.15 audit fees.

---

## 7. Recommendation in one paragraph

Implement async dispatch as a thin **process-lifetime layer** added to hopper-plugin: `hopper-dispatch --background` spawns a detached `hopper-runner` wrapper that owns the vendor subprocess lifecycle and writes status to `output.md` frontmatter. Single-spawn invariant is preserved (the wrapper spawns the vendor exactly once; no retry). For native host integration, modify the Claude Code slash-command prompt only (zero code) to use `Bash(run_in_progress=true)` + `Monitor`, and ship a ~50 LOC OpenCode plugin that exploits `POST /session/:id/prompt_async` + `session.idle` hooks. Codex CLI, Kimi, Copilot, Agy have no usable native async — they all use the wrapper fallback. Spec §3 #4 is preserved; add a new §13 spelling out the contract.
