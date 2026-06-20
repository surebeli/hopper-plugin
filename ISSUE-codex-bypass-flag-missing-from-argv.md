# ISSUE: codex adapter's `danger-full-access` bypass flag never reaches the spawned codex argv → still `workspace-write` → 1326 (extends ISSUE-codex-windows-sandbox-1326)

> Reporter: x-agents CEO orchestration session (Claude Code), dispatching a real code-impl fix to codex
> Date: 2026-06-19
> Severity: high on Windows — codex vendor does ZERO work; every dispatch is a silent no-op
> Env: Windows; codex-cli `0.131.0`; hopper-dispatch `0.13.0`; CLI = `<hopper>/cli/bin/hopper-dispatch` (loads `cli/src/vendors/codex.js`)
> Status: open — extends/sharpens the still-open ISSUE-codex-windows-sandbox-1326.md

## New, sharper evidence (argv inspection)

Dispatched task `S1-AGT-24-FIX-P7` (code-impl, vendor codex) **3 times** with `--sandbox danger-full-access --model gpt-5.5 --reasoning xhigh`:
1. `HOPPER_VENDOR_CWD=F:/workspace/project` (non-git parent) → codex: `Not inside a trusted directory and --skip-git-repo-check was not specified` (704ms fail). [widening CWD to a non-git root breaks codex's git-repo trust check — separate footgun for the `HOPPER_VENDOR_CWD` docs]
2. default CWD (x-agents = git repo) → codex banner `sandbox: workspace-write` → **8× `CreateProcessWithLogonW failed: 1326`**, no work.
3. `HOPPER_CODEX_EXTRA_CONFIG="sandbox_mode=danger-full-access"` (to force a `-c sandbox_mode` override) → **still** `sandbox: workspace-write` → 1326.

**Decisive check — inspected the live codex process command line (`Get-CimInstance Win32_Process`):**

```
bypass (--dangerously-bypass-approvals-and-sandbox) = FALSE
-s flag                                             = FALSE
-c sandbox_mode                                     = FALSE
```

So **none** of the sandbox arguments that `codex.js args()` is supposed to emit (`cli/src/vendors/codex.js:255-259`, `bypassSandbox ? ['--dangerously-bypass-approvals-and-sandbox'] : ['-s', sandbox]`) actually appear in the spawned codex argv. The `HOPPER_CODEX_EXTRA_CONFIG` `-c` override is also absent. codex therefore falls back to its **default** `workspace-write`, whose Windows sandbox harness calls `CreateProcessWithLogonW` (1326) on every child → the dispatched brief is never executed.

## Why this is more than ISSUE-codex-windows-sandbox-1326

The original issue hypothesized the **copied `config.toml` `sandbox_mode`** was overriding a *correctly-passed* `-s`/bypass flag. The argv evidence shows the flag is **not passed at all** — so the problem is in the **adapter→spawn argv path**, not config precedence. Candidate causes to check:
- The CLI bin may load `plugins/hopper/cli/src/vendors/codex.js` (the duplicate copy) rather than the fixed `cli/src/vendors/codex.js`; confirm which module the installed/run bin imports.
- The spawn layer (`cli/src/dispatch.js` / `background.js` / `subprocess.js`) may drop or not forward `adapter.args()`'s `sandboxArgs` for the background path.
- Arg-array composition order / a filter that strips `--dangerously-*`.

Recommended: add a debug line that logs the **final spawned argv** (not just the resolved opts), and a unit test asserting `danger-full-access` → argv contains `--dangerously-bypass-approvals-and-sandbox`, exercised through the **same code path the background runner uses**.

## Secondary: queue/runner status inconsistency

Across all 3 runs, `parseResult` correctly classifies the 1326 pattern as `permission-fail`, but the queue.md row for the task stayed `pending` while `--jobs`/`--watch` reported `status: failed`. A terminal `permission-fail` should also reflect in the queue row (or the row should be set `failed`) so a re-dispatch isn't silently blocked / the operator isn't misled.

## Impact / workaround used

codex vendor remains unusable via hopper on this Windows host (consistent with the 3 prior failed codex rows in x-agents `.hopper/queue.md`: `S1-M3-03-FINAL-P7`, `-P7-v2`, `S1-AGT-18-RVW-HX`). Workaround for the dispatched fix: routed `S1-AGT-24-FIX` to an in-environment Claude (sonnet) subagent instead. The fix handoff is vendor-agnostic; only the codex *execution channel* is blocked.

## Repro

```
# Windows, from a repo with .hopper/
hopper-dispatch <codex-routed-task> --background --sandbox danger-full-access
hopper-dispatch --result <task>     # → sandbox: workspace-write + repeated 1326, status failed
# inspect the live codex argv during the run:
#   Get-CimInstance Win32_Process | ? { $_.Name -like 'codex*' } | select CommandLine
#   → no --dangerously-bypass-approvals-and-sandbox present
```

---

## Resolution (2026-06-20, commit a0c4eff — hopper 0.14.0)

**FIXED.** Root cause confirmed exactly as the argv evidence above suggested: the sandbox
flags were never reaching the spawned codex because the large composed prompt was the
SECOND argv element (before the flags), and on Windows a vendor reached through a cmd.exe
`.cmd` shim has a ~8191-char command line that is silently truncated — so the trailing
`--dangerously-bypass-approvals-and-sandbox` / `-s` / `-c` flags were the truncation
casualty, and codex fell back to its default `workspace-write` → 1326.

Two fixes shipped in a0c4eff:
1. `cli/src/vendors/codex.js` — the PROMPT positional is now the LAST argv element, so any
   truncation eats the prompt tail rather than the safety flags; the bypass flag always
   reaches codex. Also adds `--skip-git-repo-check` on the bypass path (the non-git
   `HOPPER_VENDOR_CWD` footgun from run #1).
2. `cli/src/prompt-delivery.js` (new) — size-gated pointer delivery: when the would-be
   command line exceeds a conservative per-regime UTF-8-byte budget, the composed prompt is
   written to `handoffs/<task>-prompt.md` and the vendor gets a small "read this file" pointer,
   so the command line never approaches the cmd.exe limit. Uniform across all vendors.

Verified live (codex runs a shell command on this Windows host with no 1326 and stays on the
dispatched brief) + unit/integration tests (tests/unit/prompt-delivery.test.js,
tests/unit/codex-isolation.test.js argv-order cases). The secondary queue/runner status
inconsistency noted above is tracked separately (terminal `permission-fail` classification
is correct; surfacing it into the queue row is a runner-status follow-up).

Status: **CLOSED**.
