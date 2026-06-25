# Vendor I/O protocol — tracker (current vs 0625 target, per OS)

> Living record + tracker. Per vendor and per OS: how Hopper delivers the prompt (**input**) and
> captures the result (**output**) today, the planned target (label **0625**), and a **status** that is
> flipped as fixes land + are verified. Use it to triage a future delivery issue fast: find the
> (vendor, OS) cell → it states the expected channel + fix status; the change journal at the bottom
> says when/by-whom it was verified. Companion design: `prompt-delivery-stdin-fix-plan.md`.

## Why per-OS
The bug is OS-specific. **Windows** launches `.cmd`/`.bat` vendors via `cmd.exe /c <vendor>.CMD "<prompt>"`,
whose parser truncates a multi-line argv at the first newline → the only broken regime. **macOS + Linux**
use `execve` (no shell, NUL-terminated argv) → multi-line argv is always safe; Windows **native `.exe`**
(CreateProcess) is also safe. macOS and Linux are mechanically identical here, but tracked separately so
each can be independently verified.

## Status tokens
- `SAFE` — argv multi-line works; no change needed.
- `→stdin (pending)` / `→stdin ✅<date>` — fix: switch to stdin; pending → verified.
- `LIMIT` — `cmd`-shim multi-line is broken; documented limitation, no deterministic fix yet.
- `DECIDE` — open design decision (mimo).
- `OPT-IN` — channel available behind an env flag, OFF by default (copilot stdin).
- `untested` — conclusion is documentation-based (no local box for that OS).

## INPUT delivery tracker  (cell = regime · current → 0625 target · status)

| vendor | Windows | macOS | Linux |
|---|---|---|---|
| **codex** | cmd-shim · argv(BROKEN) → **stdin** `codex exec [flags] -` · **→stdin ✅ 2026-06-25 (sync + background, live)** | execve · argv → argv · SAFE (untested) | execve · argv → argv · SAFE (untested) |
| **claude** | cmd-shim · argv(BROKEN) → **stdin** `claude -p …` (drop positional) · **→stdin ✅ 2026-06-25 (sync + background, live)** | execve · argv → argv · SAFE (untested) | execve · argv → argv · SAFE (untested) |
| **copilot** | cmd-shim · argv(BROKEN, default) / **stdin opt-in** (bare `copilot`, `HOPPER_COPILOT_STDIN=1`) · **OPT-IN ✅ mechanism (IN verified: prompt file written, stdin consumed; OUT quota-blocked)** | execve · argv → argv · SAFE (untested) | execve · argv → argv · SAFE (untested) |
| **mimo** | cmd-shim · argv(BROKEN) → **stdin** `mimo run` (no positional; MiMoCode 0.1.3+ reads stdin) · **→stdin ✅ 2026-06-25 (sync content-verified; bg delivers full content but pre-existing mimo backend-hang on process exit)** | execve · argv → argv · SAFE (untested) | execve · argv → argv · SAFE (untested) |
| **kimi** | native `.exe` here (SAFE) / npm `.cmd` = cmd-shim(BROKEN, LIMIT) · argv → argv · **SAFE — live content-verified ✅ 2026-06-25** (multi-line markers echoed IN+OUT) | execve · argv → argv · SAFE (untested) | execve · argv → argv · SAFE (untested) |
| **opencode** | native (Bun) here (SAFE) / npm `.cmd` = cmd-shim(LIMIT) · argv → argv · **SAFE — live content-verified ✅ 2026-06-25** | execve · argv → argv · SAFE (untested) | execve · argv → argv · SAFE (untested) |
| **grok** | native `.exe` (no shim) · argv → argv · **SAFE — live content-verified ✅ 2026-06-25** (open stdin pipe HANGS — keep argv) | execve · argv → argv · SAFE (untested) | execve · argv → argv · SAFE (untested) |
| **agy** | native `.exe` · argv → argv · **SAFE by mechanism** (CreateProcess multi-line argv; input echo-verification BLOCKED by agy's output limit below); stdin **STAYS `ignore`** (INVARIANT: agy hangs on an open stdin pipe). ⚠️ **OUTPUT LIMIT** — see output tracker | execve · argv → argv · SAFE (untested) | execve · argv → argv · SAFE (untested) |

Net (Windows only, where it varies): **codex + claude → stdin**; **copilot** argv-default + stdin opt-in;
**mimo** open decision; **grok/agy/kimi-here/opencode-here** stay argv (native-safe). macOS/Linux: **no change
for any vendor** (argv safe) — rows kept for per-OS verification tracking.

## OUTPUT protocol tracker  (OS-independent — same on Windows/macOS/Linux)

| vendor | 当前 output 方式 | 0625 改造后 output 方式 |
|---|---|---|
| **codex** | `--output-last-message <file>` + stdout stream → parseResult `{success,timeout,permission-fail,unknown-fail}` | unchanged **+ new `prompt-delivery-fail`** (stdin write short/errs) |
| **claude** | `--output-format json` → parseResult `{+auth-fail}` | unchanged **+ `prompt-delivery-fail`** |
| **copilot** | text; strip `Changes/Requests` footer; quota + auth detect → `{+auth-fail}` | unchanged |
| **mimo** | `--format json` → `{+auth-fail}` | unchanged |
| **kimi** | text / `--json` → `{+auth-fail}` | unchanged |
| **opencode** | `--format json` → `{success,permission-fail,timeout,unknown-fail}` | unchanged |
| **grok** | `--output-format json` → `{+auth-fail}` | unchanged |
| **agy** | ⚠️ **OUTPUT LIMIT (1.0.12, 2026-06-25)** — `agy --print` renders the answer ONLY in its interactive TUI; under a non-TTY stdout (every headless dispatch) it emits NOTHING capturable (not stdout/stderr, not `--log-file`, not the brain store). Adapter now strips its Go-klog diagnostics and reports `unknown-fail` with the limitation (was a FALSE success on glog-only output). True fix needs a PTY — **excluded** for agy (open-stdin hang). Treat agy as interactive-only until resolved upstream. | unchanged (limit, not capturable headlessly) |

Common pipeline (all vendors, all OSes): child stdout/stderr → `<id>-output.log` → `adapter.parseResult()`
→ status → `<id>-output.md` (frontmatter + capped preview) + `<id>-output-raw.txt` (full). Only the stdin
channel adds `prompt-delivery-fail`; no format flag / parser / handoff-file changes.

## Delivery-channel decision rule (target)
```
channel(vendor, regime):
  if regime == 'cmd' and vendor.promptStdin == 'supported' and enabled(vendor):  → STDIN
  elif regime == 'cmd' and vendor.promptStdin != 'supported':                    → ARGV (documented limit / shim-bypass)
  else  (native-exe | macOS | linux):                                            → ARGV  (UNCHANGED — safe)
```
`enabled`: codex+claude = ON; copilot = OFF (env opt-in); others N/A. The **runner** (the vendor's alive
parent) does the stdin piping from the 0600 prompt file → `end()` (EOF) with byte accounting; the
dispatcher-level stdin ban (spec §14) is retained. Stdin delivery is an **observable contract**: a short
write / write error marks the dispatch `prompt-delivery-fail` (no EPIPE swallowing).

## Windows optimization plan (tracker)
Scope: **win-cmd-shim only** — macOS, Linux, and Windows-native-`.exe` are argv-safe and untouched.
Status tokens: `[ ]` TODO · `[~]` WIP · `[x]` DONE(date) · `[defer]` · `[blocked]`. Flip per task as it lands.

**P0 — Delivery layer + observable stdin contract (enabler for all stdin vendors)** — `[x] 2026-06-25`
- [x] Add `promptStdin: 'supported' | …` to the adapter capability (codex done; others as flipped).
- [x] Delivery layer routes **stdin only when** `regime==='cmd-shim' && promptStdin==='supported' && enabled` (`useStdinPrompt` in prompt-delivery.js); otherwise **argv (native/POSIX untouched)**.
- [x] Runner: stdin **pipe only for the stdin channel** — read 0600 prompt file UP FRONT (fail-fast if unreadable) → write ALL bytes → `end()` (EOF) → record write/EPIPE error → exit handler overrides to `prompt-delivery-fail` (never swallowed); stdout/stderr stay file fds; argv + agy keep stdin `'ignore'`.
- [x] Dispatcher-level stdin ban retained (`spawnDetached` still rejects a dispatcher `stdinInput`; the runner pipes from the file via `HOPPER_PROMPT_STDIN_FILE`).
- [x] Sync path reuses the tested `stdinInput` plumbing (`executeWithAdapter` uses `delivery.stdinPrompt`).

**P1 — codex → stdin (proven)** — `[x] 2026-06-25 (sync + background, live-verified)`
- [x] codex `promptStdin:'supported'`; `args()` emits `-` (drop positional) on the stdin channel; positional kept on native/POSIX.
- [x] Ship the execution-mode guardrail (committed in this batch) so the intact prompt makes codex execute, not orchestrate.
- [x] Unit: `useStdinPrompt` matrix; codex `-` sentinel; cmd-shim→stdin + `HOPPER_CODEX_STDIN=0`→argv inline/pointer. **Live:** sync + background multi-line dispatch → full prompt, exact token returned, no hijack. _(TODO: promote the cmd.exe repro to an automated integration test.)_
- [x] Env escape hatch `HOPPER_CODEX_STDIN=0`.

**P2 — claude → stdin** — `[x] 2026-06-25 (sync + background, live-verified)`
- [x] claude `promptStdin:'supported'`; `args()` drops the positional after `-p` on the stdin channel.
- [x] Unit: claude `-p` drops positional under promptViaStdin. **Live:** sync → `HOPPER_CLAUDE_STDIN_OK`; background → `HOPPER_CLAUDE_BG_OK` (status done). Env hatch `HOPPER_CLAUDE_STDIN=0`.

**P3 — copilot (opt-in, default OFF)** — `[~] mechanism ready; OUT verification blocked on quota`
- [x] copilot `promptStdin:'supported'`, `promptStdinDefault:false`; `args()` drops `-p`+positional under stdin mode + adds `--allow-all-tools` (non-interactive). Enable with `HOPPER_COPILOT_STDIN=1`.
- [x] Unit: stdin drops `-p`+positional; opt-in gating (default OFF, ON with env). **Integration**: opt-in dispatch wrote the full prompt file + selected the stdin channel (IN verified); copilot consumed it → `permission-fail` (quota), so OUT round-trip unverified.
- [ ] Flip default ON only after a content-asserting OUT round-trip passes on the min supported build (needs copilot quota).

**P4 — mimo → stdin** — `[x] 2026-06-25 (RESOLVED via stdin — MiMoCode 0.1.3+ reads stdin; shim-bypass no longer needed)`
- [x] mimo `promptStdin:'supported'` (>=0.1.3); `args()` drops the positional message under stdin mode (`mimo run` reads stdin). Default ON; `HOPPER_MIMO_STDIN=0` opt-out.
- [x] Unit: mimo drops positional under promptViaStdin. **Live:** sync content-verified (full prompt IN + all markers echoed OUT, status success). Background delivers the full prompt + answer (markers in log). The mimo server process can fail to exit (session-status hang) — **RESOLVED 2026-06-25 (8afd271)**: the runner reaps it via heartbeat-aware idle and reports the delivered answer as `done` (success), not timeout. See the journal entry. Note the hang is intermittent (many runs exit cleanly).

**P5 — native-exe vendors (grok / agy / kimi / opencode): no-op + guards** — `[x] 2026-06-25`
- [x] No delivery change (native-exe argv multi-line safe). Invariant guard test: only codex+claude route to stdin on cmd-shim; **agy never** (open-pipe hang); native-exe/posix never route to stdin. Locked against drift.

**Cross-cutting** — `[x]`
- [x] INSTALL-MATRIX async-caveats: documented the runner-pipes-from-file carve-out; dispatcher ban retained.
- [x] Version bump + FF the installed plugin.
- [x] Third-party review (SHIP-WITH-NITS, no MAJOR). MINOR fix applied: `spawnDetached` now unconditionally clears an ambient `HOPPER_PROMPT_STDIN_FILE` (was a latent agy-hang leak) + the runner gates the stdin read on `adapter.promptStdin==='supported'` (defense in depth). TODO (NIT): a runner-level e2e for the `prompt-delivery-fail` / EPIPE path.

## Open decisions
1. **mimo** — deterministic shim-bypass (`node …/bin/mimo` → native, more code) now, or argv + documented
   Windows multi-line limit now / shim-bypass later. (Lean: codex+claude first; mimo deferred.)
2. **Scope** — win-cmd-shim only (native/POSIX unchanged). Confirm.
3. **copilot** — confirm the stdin round-trip when quota returns, then flip default ON.

## Change / verification journal  (append as fixes land — the tracker's living section)

> **Verification standard**: a live run must confirm CONTENT correctness IN and OUT, not just
> the protocol/status. Method: a brief with markers on **multiple lines** (top + middle) whose
> **last-line** instruction requires echoing the earlier-line markers in a multi-line answer.
> Then assert (IN) the composed prompt FILE contains guardrail+frame+all markers, and (OUT) the
> captured output reproduces every marker — proving the full multi-line prompt arrived (not
> truncated at line 1) AND the complete answer was captured.
| date | vendor | OS | change | status | verified by / evidence |
|---|---|---|---|---|---|
| 2026-06-25 | codex | Windows | diagnosed cmd.exe newline truncation; stdin delivery proven via repro | pre-fix (root-caused) | minimal spawn repro (full multi-line via `codex exec -` / stdin) |
| 2026-06-25 | claude | Windows | stdin delivery live-confirmed (token honored, exit 0) through `claude.cmd` shim | pre-fix (verified) | live probe |
| 2026-06-25 | copilot | Windows | stdin consumed prompt + reached inference; round-trip quota-blocked | pre-fix (unproven) | live probe (exit 1 = "no quota") |
| 2026-06-25 | (layer) | Windows | P0: delivery layer (`useStdinPrompt`) + runner stdin-from-file + observable contract (`prompt-delivery-fail`); dispatcher ban retained | `[x]` shipped | unit (prompt-delivery) + full gate green |
| 2026-06-25 | codex | Windows | P1: `promptStdin:'supported'`, `args() → -` sentinel; sync + background route prompt over stdin | `→stdin ✅` | **live**: multi-line sync → `HOPPER_STDIN_FIX_OK`; background → `HOPPER_BG_STDIN_OK` (status done, full prompt, no hijack) |
| 2026-06-25 | claude | Windows | P2: `promptStdin:'supported'`, `args()` drops positional after `-p`; sync + background over stdin | `→stdin ✅` | **live**: sync → `HOPPER_CLAUDE_STDIN_OK`; background → `HOPPER_CLAUDE_BG_OK` (status done) |
| 2026-06-25 | codex + claude | Windows | CONTENT-integrity verification (not just protocol) | ✅ in+out | prompt FILE held guardrail+frame+top/mid markers (5455B); both vendors echoed `IN_HEAD_7Q3`+`IN_MID_9X2`+`OUT_TAIL_5K8` — full multi-line prompt IN, complete multi-line answer OUT |
| 2026-06-25 | mimo | Windows | P4 RESOLVED: MiMoCode 0.1.3+ reads stdin → `promptStdin:'supported'`, `args()` drops positional; was the cmd-shim hard case | `→stdin ✅` (sync) | **live**: sync content-verified (markers `IN_HEAD_7Q3`+`IN_MID_9X2`+`OUT_TAIL_5K8` echoed, status success); bg delivers full content but pre-existing mimo backend-hang on exit |
| 2026-06-25 | copilot | Windows | probe on 1.0.65: bare `copilot` consumes stdin + reaches inference, but **quota-blocked** — OUT round-trip unverifiable | `OPT-IN` (default OFF) | live probe exit 1 "no quota" (delivery consumed, not content-verified) |
| 2026-06-25 | mimo | Windows | **background-exit hang RESOLVED**: `mimo run` can deliver the answer then never exit (session-status poller + `--print-logs` /session/status heartbeat keeps it alive, no terminal JSON event). Runner now reaps it via heartbeat-aware idle (adapter `idleHeartbeatRe`; idle clock resets only on substantive, non-heartbeat growth) + `mimo.parseResult` classifies an idle reap-after-completion (terminal `step_finish` reason≠tool-calls + text) as **success**. | `[x]` shipped (8afd271) | **live**: idle reap → terminal `status=done, adapter_status=success, timed_out=true`, answer delivered (marker OUT); clean runs still exit `done`. Real 6.4-min hung log steady-state = 100% /session/status (filter reaps it). 3rd-party review SHIP-WITH-NITS (MAJOR terminal-step gate + read-skip NIT fixed). |
| 2026-06-25 | codex | Win/all | **codex has NO read-only scenario** — `-s <mode>` sandbox harness 1326s on Windows, so codex ALWAYS runs full-access (`--dangerously-bypass-approvals-and-sandbox`); read-only intent rides in the prompt frame. Dispatch no longer auto-downgrades codex to read-only (was silently breaking every review/research codex dispatch). Escape hatch `HOPPER_CODEX_SANDBOX_BYPASS=0` (POSIX). doctor sandbox col = `full`. | `[x]` shipped (0c4d608) | **live**: a read-only task-type codex dispatch ran full-access + execed `mimo --version`→0.1.3 + echoed marker, status success. Full gate green. |
| 2026-06-25 | codex | Windows | parseResult 1326 **false-positive** fixed: a complete research run (exit 0, 70 ok commands) was mislabeled permission-fail because it QUOTED a prior failed log's 1326 string. Guard now fires only on a TOTAL wipeout (1326 + no `succeeded in <N>ms` marker). | `[x]` shipped (0c4d608) | unit (codex-isolation) + the mimo-research run that surfaced it |
| 2026-06-25 | grok / kimi / opencode | Windows | **live content-integrity round-trip** (native-exe argv): multi-line marker brief, background dispatch | `SAFE ✅ live` | OUT echoed INHEAD (line 2) + INMID (middle) + OUTTAIL → full multi-line prompt IN intact + complete answer OUT captured |
| 2026-06-25 | agy | Windows | **OUTPUT regression found + false-success fixed**: agy 1.0.12 `--print` emits NO answer on a non-TTY stdout (TUI-only); the runner's glog-filled log made the adapter report empty `success`. Adapter now strips Go-klog + reports `unknown-fail` with the limitation. INPUT argv is safe by mechanism (not echo-verifiable while OUTPUT is blocked). | `INPUT SAFE / OUTPUT LIMIT` | direct probes (stdin-closed `agy -p` → exit 0, empty stdout/stderr/glog, marker nowhere) + live re-dispatch now `failed/unknown-fail` (not false `done`); unit: `stripAgyGlog` + glog-only→unknown-fail |
| _next_ | _vendor_ | _OS_ | _what changed_ | _→stdin ✅ / LIMIT / …_ | _PR / test / live run_ |

## Separate, related (flagged by Codex — not part of delivery)
Hopper can currently recommend `pending → done` from **dispatcher exit-0 alone**, even when the vendor
returned non-compliant output. Target: require a validated task verdict / acceptance signal before
recommending `done` (else `needs-review`). Tracked separately.
