# Design: Hopper prompt-delivery fix (stdin vs argv vs pointer)

> Status: PROPOSED — for adversarial review of the DESIGN OPTIONS before implementation.
> This doc is self-contained; review the channel choice, the runner-pipes-from-file
> approach, the cross-platform assumptions, the per-vendor decisions, and the failure modes.

## 1. Problem & proven root cause

Hopper dispatches a task brief to a vendor CLI by passing the composed prompt as an
**argv positional**. On Windows, vendors reached via a `.cmd`/`.bat` shim are launched as
`cmd.exe /c <vendor>.CMD "<prompt>"`. **cmd.exe re-parses its command line line-by-line; a
bare `\n` terminates the line, so `/c` runs only line 1 and discards the tail** (also an
8191-char/line cap). Result: codex received only the FIRST LINE of a multi-line prompt, had
no real task, loaded a default skill (`using-superpowers`), and asked the user for the brief
— misread as a "skill hijack." Same mechanism breaks the existing **pointer fallback** (its
instruction is multi-line; the path sits on the last line and is dropped → "the absolute path
didn't come through").

### Reproduced first-hand (Win11, Node spawn)
A 4-line prompt delivered three ways; child reported bytes/lines:
- **A) `cmd.exe /c vendor.cmd "<prompt>"`** (argv positional) → child got **line 1 only**. BROKEN.
- **B) `node.exe child.js "<prompt>"`** (native exe, no cmd.exe) → full 4 lines. SAFE.
- **C) `cmd.exe /c vendor.cmd` + prompt piped to STDIN** (same `.cmd` shim) → full 4 lines. SAFE.

So the truncation is an **argv/command-line pathology unique to cmd.exe**; a stdin pipe never
touches cmd.exe's argument parser. The codex stdin delivery was independently confirmed
end-to-end through the real `codex.cmd` shim.

## 2. Empirical findings

### Regime safety (argv multi-line)
| Regime | argv multi-line | Needs fix |
|---|---|---|
| win-cmd-shim (`cmd.exe /c X.CMD`) | **BROKEN** | yes |
| win-native-exe (CreateProcess) | SAFE (`\n` is data, 32767 cap) | no |
| macOS / Linux (execve) | SAFE (NUL-terminated argv, no shell) | no |

### Per-vendor (this machine; install-path-dependent where noted)
| Vendor | Win shim | stdin-prompt mode | Evidence | Proposed channel |
|---|---|---|---|---|
| codex | cmd | **yes** (`codex exec -`) | help text + official docs + my repro (end-to-end confirmed) | **stdin** |
| claude | cmd | **yes** (`claude -p`, no positional) | help + #29293 error string + **live probe: token honored, exit 0** | **stdin** |
| copilot | cmd | **yes** (bare `copilot`, no `-p`) | help + docs; **live probe consumed stdin, reached inference, quota-blocked final answer** (#3186 risk on old builds) | **stdin** (round-trip pending quota) |
| mimo | cmd | **no** (requires positional) | help + native-binary string scan + OpenCode upstream | **single-line pointer** (hard case) |
| kimi | native `.exe` here / `.cmd` via npm | no | help/docs/README lack stdin | **argv** (safe here); regime-aware |
| opencode | native (Bun) here / `.cmd` via npm | no | `run --help`, issue #18659 | **argv** (safe here); regime-aware |
| grok | native | no | help + docs.x.ai (open stdin pipe hangs) | **argv** |
| agy | native | **no — open stdin pipe HANGS print mode** | help + agy-bridge wrapper source | **argv**, stdin stays `ignore` |

Net: **3 vendors → stdin** (codex/claude/copilot — the cmd-shim ∩ stdin-capable set). **5 stay
argv**; of those, grok/opencode(native)/agy/kimi(native) are multi-line-safe on Windows; **mimo
is cmd-shim with no stdin remedy** (the one true hard case on this machine).

## 3. Design options considered

### Option A — stdin, piped by the runner from the prompt file (RECOMMENDED for stdin-capable vendors)
- Sync: reuse the existing, already-tested `stdinInput` path (`subprocess.js`); adapter omits the
  positional; prompt piped in-process.
- Background: the runner reads the 0600 `handoffs/<id>-prompt.md` and writes its bytes to the
  vendor's stdin, then `end()`s (EOF). Single spawn preserved; stdout/stderr stay on **file fds**.
- Pros: deterministic (vendor gets literal bytes, no behavioral dependency); bypasses cmd.exe
  entirely; also fixes codex's documented never-EOF hang (#20919); reuses the `stdinMode` field
  and prompt-file machinery that already exist.
- Cons: reverses the spec §14 "background forbids stdin" line (mitigated — see §5); requires the
  vendor to actually read stdin (verified per vendor); EPIPE handling needed.

### Option B — single-line pointer via argv (for the hard case: cmd-shim + no-stdin, i.e. mimo)
- Make `buildPointerInstruction` ONE line (no newline → path survives cmd.exe); force pointer mode
  on cmd-shim; vendor reads the file with its own tools.
- Pros: tiny; no runner change. Cons: **soft/behavioral** (relies on the agent choosing to read the
  file — the exact behavior that bit us); only viable for agentic vendors.

### Option C — bypass the `.cmd` shim, invoke the underlying node entrypoint directly (future hardening)
- `mimo.cmd` → `node .../bin/mimo`; resolving to `node <script>` makes it the native regime →
  argv multi-line SAFE, no behavioral dependency.
- Pros: deterministic for argv-only cmd-shim vendors. Cons: fragile (parses shim internals; format
  varies by generator); larger change to `path-resolve.js`.

### Rejected
- **Raise the inline budget** (`HOPPER_INLINE_PROMPT_MAX_CMDSHIM`): does NOT fix the newline
  truncation — it only moves between two broken paths (inline-newline vs multi-line-pointer).
- **Keep the current multi-line pointer**: proven broken (path on last line dropped).

## 4. Recommended design

One delivery layer, channel selected by `adapter.stdinMode` + `commandLineRegime()`:

1. **stdin** (`stdinMode:'pipe'` → codex/claude/copilot): sync via `stdinInput`; background via
   runner-reads-file→child-stdin→`end()`. Adapter `args()` emits the stdin sentinel, not the
   prompt: codex `exec … -`; claude `-p`; copilot bare.
2. **argv inline** (`stdinMode:'none'`, native-exe/posix → opencode/grok/agy/kimi-native):
   unchanged. stdin stays `'ignore'` (agy hangs on an open pipe).
3. **single-line pointer** (cmd-shim + no-stdin → mimo): Option B.

Existing size-gated pointer remains the orthogonal **length** fallback for argv vendors.

### Load-bearing implementation details
- Open a stdin **pipe only for `stdinMode:'pipe'`**; everyone else keeps `'ignore'` (immediate
  EOF — agy-safe).
- **Always `end()`** the opened pipe + attach `vendor.stdin.on('error', …)` (swallow EPIPE if the
  vendor dies mid-write) — fixes the never-EOF hang and the one new failure mode.
- stdout/stderr stay on file fds → no stdin/stdout pipe deadlock by construction.
- codex mixed-mode caveat: positional + stdin → codex treats positional as instruction, stdin as
  context. Must use `-` (or omit positional) so the full prompt is the instruction.

## 5. Why this does NOT repeat the original stdin→argv switch
The ban (spec §14) was: "a stdin pipe that survives **parent exit** is fragile" — about the
DISPATCHER piping across the detach boundary then exiting. This design pipes from the **runner**
(the vendor's alive, blocking parent; `detached:false` on Windows), so no pipe crosses the detach
boundary. The founding spike (T-PLUGIN-00) already blessed "pipe prompt to stdin via … file." We
**retain** the dispatcher-level stdin ban; only the runner pipes. Investigation found the original
ban was precautionary (no recorded stdin failure), and the sync stdin path is tested green today.

## 6. Cross-platform
Only `win-cmd-shim` needs the fix. Policy: use stdin for every stdin-capable vendor on ALL OSes
(uniform single path) — sound everywhere (POSIX/native-exe argv is also safe, so stdin is an
equivalent uniformity choice). Regime-aware so an npm-`.cmd` install of kimi/opencode is detected
and routed to the pointer.

## 7. Rollout, tests, risks
- Phase 1: codex → stdin + ship the execution-mode guardrail (so the now-intact prompt makes codex
  execute, not orchestrate). Phase 2: claude + copilot. Phase 3: mimo single-line pointer. Each
  behind a `HOPPER_*` env escape hatch.
- Tests: codex argv ends with `-` not the prompt; runner pipes the full multi-line prompt + `end()`s;
  EPIPE handler present; argv vendors keep stdin `'ignore'`; single-line pointer survives a simulated
  cmd.exe newline split; promote the cmd.exe-shim round-trip repro to integration for codex+claude.
- Risks: per-vendor stdin contract not uniform (verify-before-flip — done for the 3); copilot
  round-trip unconfirmed under quota; mimo pointer is behavioral; POSIX is documentation-based
  (execve guarantee, no local POSIX box); regime detection only sees hopper's own spawn boundary.

## 8. Open decisions
1. Migrate stdin-capable vendors on ALL OSes (uniform, deletes the size-gate branch for them) vs.
   only on `win-cmd-shim` (smaller blast radius). Lean: uniform.
2. Ship mimo's single-line pointer now vs. defer (codex/claude/copilot first). Lean: codex first.
