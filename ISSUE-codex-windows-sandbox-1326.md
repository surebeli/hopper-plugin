# ISSUE: codex adapter is unusable on Windows — runs codex under `workspace-write` sandbox → `CreateProcessWithLogonW failed: 1326` on every exec

> Reporter: governance-fusion migration (Claude Code session, dogfooding hopper-dispatch)
> Date: 2026-06-17
> Severity: high on Windows (the codex vendor cannot execute ANY command; every codex-routed dispatch silently does nothing)
> Status: open
> Env: Windows; codex-cli `0.131.0`; hopper-plugin `0.11.1`

## Symptoms (confirmed)

Dispatched a real task to the codex vendor via `hopper-dispatch T-FIX-PWHANG --background`. The dispatcher reported `Sandbox: danger-full-access`, but codex's own startup banner shows it actually running under `sandbox: workspace-write`:

```
approval: never
sandbox: workspace-write [workdir, /tmp, $TMPDIR]
reasoning effort: xhigh
```

Every shell command codex then issued failed instantly:

```
exec "...pwsh.exe" -Command "Get-Content -Raw .hopper\PING.md" in F:\workspace\ai\_x_harness\hopper-plugin
ERROR codex_core::exec: exec error: windows sandbox: CreateProcessWithLogonW failed: 1326
 exited -1 in 0ms:
execution error: Io(Custom { kind: Other, error: "windows sandbox: CreateProcessWithLogonW failed: 1326" })
```

- **17** `CreateProcessWithLogonW failed: 1326` errors in the run log; codex executed **zero** commands successfully and made **zero** file changes, then exited.
- `1326` = Windows `ERROR_LOGON_FAILURE`: codex's Windows sandbox launches each child via `CreateProcessWithLogonW` (a separate restricted logon), which fails on this host.

## Secondary bug (result misclassification)

Despite 17 sandbox-launch failures and no work done, the runner wrote `status: done` and `adapter_status: success` to `.hopper/handoffs/T-FIX-PWHANG-output.md`. A run where every `exec` failed with a sandbox-launch error should be classified as a **failure** (permission-fail / unknown-fail), not success — otherwise a doomed dispatch is reported as completed.

## Root cause / localization

- `cli/src/vendors/codex.js:224,235` sets `const sandbox = opts.sandbox ?? 'danger-full-access'` and passes `'-s', sandbox`. So hopper passes `-s danger-full-access`.
- But codex runs under `workspace-write` anyway. Likely cause: the auto-isolated `CODEX_HOME` (HOPPER-3, `resolveIsolatedCodexHome`) copies the host `~/.codex/config.toml` (sanitized), and if that config sets `sandbox_mode = "workspace-write"` it is taking precedence over (or interacting with) the `-s` flag in `codex exec`. Either way, the adapter is **not** producing a no-sandbox codex invocation for `danger-full-access` on Windows.
- On Windows, codex's `workspace-write` sandbox uses `CreateProcessWithLogonW`, which fails here (1326). The **only** invocation that works on this host is `codex exec --dangerously-bypass-approvals-and-sandbox` (verified: it runs commands fine, because it fully disables the sandbox and never calls `CreateProcessWithLogonW`).

## Impact

- The codex vendor is effectively unusable via hopper on this Windows host. This affects every codex-routed task-type (`spec-write`, `code-review-acceptance`, `spec-blindspot-hunt`) plus any row that overrides `Vendor: codex`.
- The other 7 vendors (`kimi`, `opencode`, `copilot`, `agy`, `grok`, `mimo`, `claude`) all show `READY` via `hopper-dispatch --check` and do not use codex's logon-sandbox, so they are presumably unaffected.

## Reproduction

```bash
# from a repo with .hopper/ on Windows
hopper-dispatch <any-task-routed-to-codex> --background
hopper-dispatch --result <task>   # → 1326 errors, no work, but status=done
# contrast (works):
codex exec --dangerously-bypass-approvals-and-sandbox -C <repo> "run: node --version"
```

## Suggested fix direction

1. For `danger-full-access` on Windows, invoke codex with `--dangerously-bypass-approvals-and-sandbox` (proven working) instead of (or in addition to) `-s danger-full-access`; or force `-c sandbox_mode=danger-full-access` so a copied/isolated `config.toml` cannot pin `workspace-write`.
2. In `codex.js` `parseResult`, detect the `windows sandbox: CreateProcessWithLogonW failed` / repeated `exited -1 in 0ms` pattern and classify the run as a failure (`permission-fail`), so the dispatcher does not report a no-op codex run as `success`/`done`.
