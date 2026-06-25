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
| **claude** | cmd-shim · argv(BROKEN) → **stdin** `claude -p …` (drop positional) · **→stdin (pending)** | execve · argv → argv · SAFE (untested) | execve · argv → argv · SAFE (untested) |
| **copilot** | cmd-shim · argv(BROKEN) → argv (default) / stdin via `HOPPER_COPILOT_STDIN=1` · **OPT-IN / LIMIT** | execve · argv → argv · SAFE (untested) | execve · argv → argv · SAFE (untested) |
| **mimo** | cmd-shim · argv(BROKEN) → shim-bypass OR documented-limit · **DECIDE** | execve · argv → argv · SAFE (untested) | execve · argv → argv · SAFE (untested) |
| **kimi** | native `.exe` here (SAFE) / npm `.cmd` = cmd-shim(BROKEN, LIMIT) · argv → argv · **SAFE / regime-detected** | execve · argv → argv · SAFE (untested) | execve · argv → argv · SAFE (untested) |
| **opencode** | native (Bun) here (SAFE) / npm `.cmd` = cmd-shim(LIMIT) · argv → argv · **SAFE / regime-detected** | execve · argv → argv · SAFE (untested) | execve · argv → argv · SAFE (untested) |
| **grok** | native `.exe` (no shim) · argv → argv · **SAFE** (open stdin pipe HANGS — keep argv) | execve · argv → argv · SAFE (untested) | execve · argv → argv · SAFE (untested) |
| **agy** | native `.exe` · argv → argv · **SAFE**; stdin **STAYS `ignore`** (INVARIANT: agy hangs on an open stdin pipe) | execve · argv → argv · SAFE (untested) | execve · argv → argv · SAFE (untested) |

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
| **agy** | text; non-TTY stdout drop → answer in `.log` (`--result <id> --full`); auth success-marker veto → `{+auth-fail}` | unchanged |

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

**P2 — claude → stdin (live-confirmed)** — `[ ]`
- [ ] claude `promptStdin:'supported'`; `args()` drops the positional after `-p` on the stdin channel.
- [ ] Tests + integration round-trip; env hatch.

**P3 — copilot (opt-in, default OFF)** — `[blocked: quota]`
- [ ] copilot `promptStdin:'supported'`, `enabled=false`; opt-in `HOPPER_COPILOT_STDIN=1` → bare `copilot` (no `-p`); add version gating + timeout coverage.
- [ ] Flip default ON only after a content-asserting round-trip passes on the min supported build.

**P4 — mimo (DECISION)** — `[defer]`
- [ ] Default now: keep argv + **document the Windows-cmd-shim multi-line limitation** (multi-line briefs may truncate on an npm-`.cmd` mimo install).
- [ ] Follow-up: deterministic **shim-bypass** (`node …/bin/mimo` → native regime → argv multi-line safe).

**P5 — native-exe vendors (grok / agy / kimi / opencode): no-op + guards** — `[ ]`
- [ ] No delivery change. Regression-guard: agy stdin **stays `'ignore'`** (hang invariant); regime detection routes an npm-`.cmd` kimi/opencode to the documented-limit path.

**Cross-cutting** — `[ ]`
- [ ] Update spec §14 / INSTALL-MATRIX: runner-pipes-from-file carve-out; dispatcher ban retained.
- [ ] Third-party review; version bump; FF the installed plugin.

## Open decisions
1. **mimo** — deterministic shim-bypass (`node …/bin/mimo` → native, more code) now, or argv + documented
   Windows multi-line limit now / shim-bypass later. (Lean: codex+claude first; mimo deferred.)
2. **Scope** — win-cmd-shim only (native/POSIX unchanged). Confirm.
3. **copilot** — confirm the stdin round-trip when quota returns, then flip default ON.

## Change / verification journal  (append as fixes land — the tracker's living section)
| date | vendor | OS | change | status | verified by / evidence |
|---|---|---|---|---|---|
| 2026-06-25 | codex | Windows | diagnosed cmd.exe newline truncation; stdin delivery proven via repro | pre-fix (root-caused) | minimal spawn repro (full multi-line via `codex exec -` / stdin) |
| 2026-06-25 | claude | Windows | stdin delivery live-confirmed (token honored, exit 0) through `claude.cmd` shim | pre-fix (verified) | live probe |
| 2026-06-25 | copilot | Windows | stdin consumed prompt + reached inference; round-trip quota-blocked | pre-fix (unproven) | live probe (exit 1 = "no quota") |
| 2026-06-25 | (layer) | Windows | P0: delivery layer (`useStdinPrompt`) + runner stdin-from-file + observable contract (`prompt-delivery-fail`); dispatcher ban retained | `[x]` shipped | unit (prompt-delivery) + full gate green |
| 2026-06-25 | codex | Windows | P1: `promptStdin:'supported'`, `args() → -` sentinel; sync + background route prompt over stdin | `→stdin ✅` | **live**: multi-line sync → `HOPPER_STDIN_FIX_OK`; background → `HOPPER_BG_STDIN_OK` (status done, full prompt, no hijack) |
| _next_ | _vendor_ | _OS_ | _what changed_ | _→stdin ✅ / LIMIT / …_ | _PR / test / live run_ |

## Separate, related (flagged by Codex — not part of delivery)
Hopper can currently recommend `pending → done` from **dispatcher exit-0 alone**, even when the vendor
returned non-compliant output. Target: require a validated task verdict / acceptance signal before
recommending `done` (else `needs-review`). Tracked separately.
