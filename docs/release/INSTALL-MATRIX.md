# hopper-plugin install matrix (T-PLUGIN-09)

Anchor: `docs/release/INSTALL-MATRIX.md::root`

> **Audience**: essay readers + first-time users wanting a single page that documents which host adapter to symlink where.

## Quick decision tree

| If you use…                          | Install which adapter           | Why                                                  |
|--------------------------------------|---------------------------------|------------------------------------------------------|
| Bare terminal (any project)          | Tier A standalone CLI           | Smallest dependency surface; no host at all          |
| Claude Code                          | Tier A + Tier B                 | Slash commands in-session                            |
| Codex CLI (gpt-5.x)                  | Tier A + Tier C #1              | Drives hopper-dispatch from codex's agentic loop     |
| OpenCode (multi-provider)            | Tier A + Tier C #2              | Drives hopper-dispatch from opencode's agentic loop  |
| All four hosts (e.g. for testing)    | Tier A + B + C #1 + C #2        | Cross-host equivalence dogfood                       |

Tier A is the baseline. Every other tier shells out to `cli/bin/hopper-dispatch` from Tier A. There is no scenario where you install **only** a host adapter without Tier A.

## Tier A — Standalone CLI

**Install target**: nowhere — just clone the repo. The binary is at `cli/bin/hopper-dispatch`.

**Add to PATH** (optional, recommended):

Linux / macOS:
```bash
ln -s /absolute/path/to/hopper-plugin/cli/bin/hopper-dispatch ~/.local/bin/hopper-dispatch
chmod +x /absolute/path/to/hopper-plugin/cli/bin/hopper-dispatch
```

Windows (PowerShell, admin):
```powershell
New-Item -ItemType SymbolicLink `
  -Path "$HOME\bin\hopper-dispatch.cmd" `
  -Target "F:\path\to\hopper-plugin\cli\bin\hopper-dispatch.cmd"
```

Or `npm link` from the repo root (uses the `bin` field in `package.json`).

**Verify**:
```bash
hopper-dispatch --version    # expect: 0.4.0-phase-3
hopper-dispatch --smoke      # expect: hopper standalone (CLI v0.4.0-phase-3)
hopper-dispatch --vendors    # expect: 5 adapters listed
```

## Tier B — Claude Code

**Install target**: **the repo root** (NOT `hosts/claude-code/`).

Layout: `.claude-plugin/plugin.json` + `commands/*.md` + `cli/bin/hopper-dispatch` all coexist at repo root. Claude Code's `$CLAUDE_PLUGIN_ROOT` resolves to the repo root, so `$CLAUDE_PLUGIN_ROOT/cli/bin/hopper-dispatch` works.

Linux / macOS:
```bash
mkdir -p ~/.claude/plugins
ln -s /absolute/path/to/hopper-plugin ~/.claude/plugins/hopper
# Restart Claude Code
```

Windows (PowerShell, admin):
```powershell
New-Item -ItemType SymbolicLink `
  -Path "$HOME\.claude\plugins\hopper" `
  -Target "F:\absolute\path\to\hopper-plugin"
# Restart Claude Code
```

**Verify** (inside a Claude Code session):
```
/hopper:smoke
```

Expected: `hopper standalone (CLI v0.4.0-phase-3)` banner.

**Common mistake**: symlinking `hosts/claude-code/` (the README directory) — that leaves `cli/bin/hopper-dispatch` unreachable from `$CLAUDE_PLUGIN_ROOT`. The codex Phase 3 audit caught this layout bug; the fix is documented as P0 in `.hopper/MANIFEST.md`.

**User-action gate**: T-PLUGIN-00 Prong 1 requires this verify step to be exercised on a fresh Claude Code session. Strategy-as-developer cannot install plugins on the running session, so this is a user-side check.

## Tier C #1 — Codex CLI

**Install target**: wrap script onto PATH. The wrapper is symlink-safe (`resolve_script_dir` walks symlinks before computing `PLUGIN_ROOT`).

Linux / macOS:
```bash
chmod +x /absolute/path/to/hopper-plugin/hosts/codex-cli/bin/hopper-codex
ln -s /absolute/path/to/hopper-plugin/hosts/codex-cli/bin/hopper-codex ~/.local/bin/hopper-codex
```

Windows (PowerShell):
```powershell
New-Item -ItemType SymbolicLink `
  -Path "$HOME\bin\hopper-codex.cmd" `
  -Target "F:\path\to\hopper-plugin\hosts\codex-cli\bin\hopper-codex.cmd"
```

**Prereqs**: Node 18+, `codex` CLI authenticated, `bash` (Windows: git-bash or WSL).

**Verify**:
```bash
hopper-codex --help          # usage banner; no codex invocation
```

A real dispatch invokes `codex exec` and consumes codex tokens, so use a known-cheap task ID for the first real test:
```bash
hopper-codex T-PLUGIN-05a    # vendor resolves to kimi; codex spawns kimi via shell tool
```

## Tier C #2 — OpenCode

**Install target**: wrap script onto PATH. Pattern is byte-equivalent to Tier C #1.

Linux / macOS:
```bash
chmod +x /absolute/path/to/hopper-plugin/hosts/opencode/bin/hopper-opencode
ln -s /absolute/path/to/hopper-plugin/hosts/opencode/bin/hopper-opencode ~/.local/bin/hopper-opencode
```

Windows (PowerShell):
```powershell
New-Item -ItemType SymbolicLink `
  -Path "$HOME\bin\hopper-opencode.cmd" `
  -Target "F:\path\to\hopper-plugin\hosts\opencode\bin\hopper-opencode.cmd"
```

**Prereqs**: Node 18+, `opencode` CLI authenticated, `bash`.

**Verify**:
```bash
hopper-opencode --help
hopper-opencode T-PLUGIN-05a
```

## Cross-host equivalence verification

After installing all 4 routes, dispatch the same task ID through each. All 4 should resolve to the same vendor (determined by `.hopper/AGENTS.md`).

```bash
# In a directory containing .hopper/ (e.g. this repo)
hopper-dispatch --resolve T-PLUGIN-05a               # Tier A: prints vendor: kimi
# Inside Claude Code:
/hopper:dispatch T-PLUGIN-05a                        # Tier B: tells Claude to invoke same dispatcher
hopper-codex T-PLUGIN-05a                            # Tier C #1: codex tool-use → same dispatcher
hopper-opencode T-PLUGIN-05a                         # Tier C #2: opencode tool-use → same dispatcher
```

**Structurally** all 4 routes resolve to the same vendor (kimi) and would spawn the same subprocess. Vendor selection lives in `.hopper/AGENTS.md`, not in the host adapter — this is the structural cross-host claim, mechanically asserted by the validation parity tests. A live empirical 4-host demonstration is a user-action follow-up (it requires Claude Code + codex CLI + opencode CLI all installed + authenticated simultaneously).

The equivalence is mechanically asserted by `tests/unit/validation.test.js` "cross-host parity" test, which reads all 3 host entry points (Tier B + Tier C #1 + Tier C #2) and verifies they cite the same canonical task-id regex literal.

## Async dispatch (spec v2.1.0 §14)

Long-running tasks (kimi-thinking, codex xhigh, agy reasoning — anything >1 min) freeze the calling session in sync mode. Async dispatch returns immediately with a runner PID; result lands in `.hopper/handoffs/<task-id>-output.md` when done. Per spec §14.4 constraint #4 ("prefer host-native"), each tier uses a different mechanism:

| Tier | Async mechanism | Setup |
|---|---|---|
| Tier A standalone | `hopper-dispatch <id> --background` (custom fallback) | works out of box |
| Tier B Claude Code | Bash tool `run_in_background=true` + Monitor (native) | works once plugin installed; prompt handles it |
| Tier C #1 Codex CLI | Custom fallback (Codex has no native — open issue openai/codex#3968) | works via `hopper-codex` wrapper |
| Tier C #2 OpenCode | Plugin: `POST /session/:id/prompt_async` + `session.idle` hook (native) | install plugin (below); requires `opencode serve` |

### Async setup per tier

**Tier A standalone** — no setup. Just add `--background`:

```bash
hopper-dispatch T-PLUGIN-05a --background
# Returns immediately with PID
hopper-dispatch --watch T-PLUGIN-05a   # follow log + status
hopper-dispatch --jobs                 # list all in-progress
hopper-dispatch --reap                 # clean stale (>24h or dead-PID)
```

**Tier B Claude Code** — no setup beyond plugin install. Inside Claude Code:

```
/hopper:dispatch T-PLUGIN-05a --background
```

Claude internally uses `Bash(run_in_background=true)` so your session does NOT freeze. Claude periodically polls the output.md frontmatter and reports status.

**Tier C #1 Codex CLI** — pass `--background` to the wrapper:

```bash
hopper-codex T-PLUGIN-05a --background
```

The wrapper passes the flag through to inner `hopper-dispatch`, which spawns the hopper-runner detached process.

**Tier C #2 OpenCode** — install the bundled plugin first:

```bash
# Project-local
mkdir -p .opencode/plugins/
cp /path/to/hopper-plugin/hosts/opencode/plugins/hopper-async.ts .opencode/plugins/

# OR global
mkdir -p ~/.config/opencode/plugins/
cp /path/to/hopper-plugin/hosts/opencode/plugins/hopper-async.ts ~/.config/opencode/plugins/
```

Then restart `opencode serve` (or TUI). From inside an OpenCode session:

> "Use hopper_dispatch tool to start T-PLUGIN-05a in the background"

The plugin uses OpenCode's `prompt_async` natively — see `hosts/opencode/plugins/README.md` for details.

### Async result retrieval

All four tiers write to the SAME file: `.hopper/handoffs/<task-id>-output.md`. Frontmatter schema (spec §14.3):

```yaml
---
task_id: T-PLUGIN-05a
adapter: kimi
status: in-progress    # in-progress | done | failed | orphaned
pid: 24112             # runner wrapper PID
start_time: 2026-05-21T14:33:02.117Z
end_time: null         # filled on exit
exit_code: null        # filled on exit
duration_ms: null
mode: background
host_native: claude-code   # null | claude-code | opencode
session_id: null
log: ./T-PLUGIN-05a-output.log
---
```

Read the frontmatter directly OR use:

```bash
hopper-dispatch --watch T-PLUGIN-05a   # tail-follow until done
hopper-dispatch --jobs                 # one-line summary of all in-progress
```

### Async caveats

- **Concurrent dispatch protection**: trying to dispatch a task that's already `in-progress` with an alive PID → refused. Use `--watch` to follow or wait. After 24h, the job is auto-classified as `orphaned` and re-dispatch is allowed (PID-reuse mitigation).
- **stdin-piping adapters**: not supported in background mode (would require a pipe surviving parent exit — fragile cross-platform). Codex/Kimi/OpenCode/Copilot/Agy all use argv-mode prompts, so this doesn't affect existing vendors.
- **Heterogeneous-only**: invoking from Codex CLI host to dispatch back to codex vendor triggers a soft warning. Set `HOPPER_ALLOW_SAME_VENDOR=1` to suppress.
- **No auto-retry**: failed jobs stay `status: failed`. User re-dispatches manually if desired. Spec §14.10 forbids any retry logic in this layer.

## Self-diagnostics (Phase 6a discovery API)

Two CLI commands answer "is vendor X usable from this machine right now?" and "what does vendor X actually accept?" without spawning any vendor subprocess.

### `hopper-dispatch --check [<vendor>]` — install + auth probe

Walks PATH (with Windows PATHEXT semantics) for each adapter's command, runs the adapter's `envPreflight()` to detect auth state, and prints a status table. **Zero subprocess spawns** — pure `fs.statSync` + config-file reads.

```bash
$ hopper-dispatch --check

hopper-dispatch v0.5.0-phase-5a — vendor install + auth check

| Vendor    | Command resolution                                 | Auth | Status         |
|-----------|----------------------------------------------------|------|----------------|
| codex     | C:\Users\you\bin\codex.CMD (cmd.exe /c wrap)       | OK   | READY          |
| kimi      | C:\Users\you\.local\bin\kimi.EXE                   | OK   | READY          |
| opencode  | C:\Users\you\.bun\bin\opencode.EXE                 | OK   | READY          |
| copilot   | C:\nvm4w\nodejs\copilot.CMD (cmd.exe /c wrap)      | note | READY          |
| agy       | (not on PATH)                                      | OK   | NOT_INSTALLED  |
```

Status values:

| Status | Meaning |
|---|---|
| `READY` | Binary on PATH + auth detected (or soft-warn note only) |
| `AUTH_NEEDED` | Binary found but envPreflight hard-failed (e.g. missing required env var) |
| `NOT_INSTALLED` | Binary not findable via PATH walk |
| `UNKNOWN` | Detection error (rare; check adapter source) |

Single-vendor form (`hopper-dispatch --check kimi`) prints just one row + detailed auth notes for that vendor.

**What to do per status**:

- `NOT_INSTALLED` → install the vendor CLI per its official docs (see the auth table in the install sections above for hints)
- `AUTH_NEEDED` → run the auth flow the vendor's notes mention (e.g. `codex login`, `kimi /connect`, `agy` interactive once)
- `READY` with `note` auth → vendor MAY work, MAY fail at dispatch with auth error; the soft-warn note explains what to set if it fails

### `hopper-dispatch --capabilities <vendor>` — model + reasoning + features

Prints the static capability hint that the adapter declares about itself. Sourced from `docs/research/` notes — **NOT live introspection** (that would spawn a subprocess).

```bash
$ hopper-dispatch --capabilities codex

  --model      ignored
               Note: codex adapter uses opts.reasoning, not opts.model.

  --reasoning  enumerated
               Values: low | medium | high | xhigh
               Note: docs/research/async-execution/01-openai-hosts.md

  Features:
    sessionResume    YES  `codex exec resume <SESSION_ID>` — hopper does not currently auto-capture session_id
    fileOutput       YES  `--output-last-message <path>` exists (NOT currently used by adapter)
    streaming        YES  codex exec streams progress to stderr; final message to stdout

  Capability data stale after: 2026-08-21
```

### Capability summary across all 5 vendors

For quick reference (re-verify quarterly per each adapter's `staleAfter` date):

| Vendor | `--model` | `--reasoning` | Session resume | File output | Streaming |
|---|---|---|---|---|---|
| **codex** | IGNORED | `low \| medium \| high \| xhigh` | ✓ | ✓ (`--output-last-message`, unused by adapter) | ✓ |
| **kimi** | freeform (e.g. `default`) | IGNORED | ✓ (`--session <id>` / `--continue`) | ✗ | ✓ |
| **opencode** | freeform (`<provider>/<model>`) | IGNORED | ✓ (per-machine session IDs; NOT cross-OS) | ✗ | ✓ |
| **copilot** | freeform | IGNORED | partial (`--resume` picker; UNCONFIRMED ID arg) | ✗ | ✓ |
| **agy** | IGNORED | IGNORED | UNCONFIRMED | ✗ (`--log-file` is diagnostic, not answer) | ✓ |

**Honest gotchas surfaced by the capability data**:

- Only **codex** honors `--reasoning`. Passing `--reasoning xhigh` to kimi/opencode/copilot/agy is silently ignored by their adapters.
- Only **kimi / opencode / copilot** accept `--model`. Passing `--model X` to codex or agy is silently ignored.
- No vendor accepts BOTH `--model` and `--reasoning` in the current adapter set.
- Hopper does NOT validate model names against `knownGood` — it stays freeform (validation regex is shell-safety only). Invalid models surface as vendor-side errors at dispatch.

### Typical pre-dispatch workflow

Before launching a long-running task on a new machine:

```bash
hopper-dispatch --check                   # any NOT_INSTALLED or AUTH_NEEDED?
hopper-dispatch --capabilities <vendor>   # does this vendor honor my intended flags?
hopper-dispatch <task-id> --background    # only after both above look good
```

### Cross-platform compatibility (Windows + macOS + Linux)

`--check` and `--capabilities` work on all three platforms with platform-aware path resolution. Verification status as of 2026-05-21:

| Component | Windows | macOS | Linux | Notes |
|---|---|---|---|---|
| `resolveCommandOnPath` PATH walk | ✓ (live-verified on Win11) | ✓ (POSIX exec-bit test) | ✓ (POSIX exec-bit test) | Windows: PATHEXT-aware (`.exe`/`.com` direct, `.cmd`/`.bat` cmd.exe-wrapped). POSIX: `accessSync(X_OK)` exec-permission check (rejects file-without-exec-bit). |
| `--check` install probe | ✓ live-tested | covered by POSIX path tests | covered by POSIX path tests | adapter `envPreflight()` uses `homedir()` + platform-conditional opencode path (`~/.local/share/...` on Linux, `~/AppData/Roaming/...` on Win, `~/Library/Application Support/...` on macOS). |
| `--check` status classifier | ✓ | ✓ | ✓ | pure JS logic; platform-agnostic. |
| `--capabilities` output | ✓ | ✓ | ✓ | static-data lookup; platform-agnostic. |
| `installCheckForAdapter()` API | ✓ | ✓ | ✓ | composes PATH walk + envPreflight. |
| Single-spawn invariant in discovery | ✓ verified | ✓ source-grep test | ✓ source-grep test | `path-resolve.js` source contains no `spawn`/`exec`/`execSync` calls (verified by `tests/unit/discovery.test.js`). |

**Known POSIX-specific behavior the resolver handles**:

- **Exec bit check** — Linux/Mac files MUST have exec permission (`chmod +x`). Non-executable same-named file is skipped. Verified by `tests/unit/discovery.test.js` POSIX-only test that plants a file without `0o111` mode bits and asserts resolver returns null.
- **PATH dir order** — Linux/Mac first-match-in-first-PATH-dir semantics matched. Verified by `tests/unit/discovery.test.js` POSIX-only test with two PATH dirs containing same-named files.
- **Symlinks** — `statSync` follows symlinks; `isFile()` returns true if the target is a regular file. Standard Homebrew/npm-global symlinked binaries (e.g. `/opt/homebrew/bin/codex → /opt/homebrew/Cellar/...`) resolve transparently.

**Mac-specific install paths the adapters detect**:

- `~/.codex/auth.json` (codex login)
- `~/.kimi/config.toml` (kimi /connect)
- `~/Library/Application Support/opencode/auth.json` (OR `~/.local/share/opencode/auth.json`)
- `~/.gemini/` (agy OAuth artifacts)
- `$GH_TOKEN` / `$GITHUB_TOKEN` env var (copilot)

**Mac-specific install path for vendor binaries** (machine-dependent; `--check` discovers actual location):

- Apple Silicon: `/opt/homebrew/bin/<vendor>` (Homebrew default)
- Intel: `/usr/local/bin/<vendor>` (Homebrew + manual installs)
- npm-global: `~/.npm-global/bin/<vendor>` OR `/usr/local/lib/node_modules/.bin/<vendor>`
- bun-global: `~/.bun/bin/<vendor>`
- pip/pipx: `~/.local/bin/<vendor>` (kimi via pipx)

The resolver walks all of `$PATH` in order — whichever bin dir is first on PATH wins.

**Windows-specific install paths** (machine-dependent; `--check` discovers actual location):

- npm-global: `C:\Users\<you>\AppData\Roaming\npm\<vendor>.cmd` (typical) OR `C:\nvm4w\nodejs\<vendor>.cmd` (nvm4w-managed)
- bun-global: `C:\Users\<you>\.bun\bin\<vendor>.exe`
- pip via `--user`: `C:\Users\<you>\AppData\Local\Programs\Python\PythonXX\Scripts\<vendor>.exe`
- Manual install via PATH: `C:\Users\<you>\bin\<vendor>.cmd`

The resolver tries `.exe`/`.com` first (CreateProcessW can spawn directly), then `.cmd`/`.bat` (wraps with `cmd.exe /c` automatically). PATHEXT env-var order is honored.

**Known non-issues** (validated by code-inspection):

- macOS APFS case-insensitivity: resolver does literal `cmd` lookup — no case conversion. Behavior is the same as on case-sensitive filesystems.
- WSL on Windows: if `node` is the Windows-native node spawned from WSL, PATH may mix Windows + WSL paths. The resolver respects whatever PATH is set in the runner's env.
- Network drives / slow `statSync`: each candidate is a single `statSync` call (~ sub-ms on local FS, may be slower over SMB/NFS). Discovery cost is small per vendor count × PATH dir count.

### Maintenance: capability data freshness

Each adapter's `capabilities` block declares a `staleAfter` date. After that date, the data should be re-verified against the vendor's official docs (vendors change rapidly). The summary table above is sourced from `docs/research/async-execution/` notes as of the linked dates — re-verify before quoting in essay or release docs.

If a vendor adds a new capability (e.g. agy adds `--resume`), update the adapter's `capabilities.features.sessionResume` block and bump `staleAfter`. Single-file edit per change.

## Uninstall

Unlink the symlinks. Nothing persists outside `.hopper/` (which lives in the consuming project, not the plugin).

```bash
rm ~/.claude/plugins/hopper                  # Tier B
rm ~/.local/bin/hopper-dispatch              # Tier A PATH alias
rm ~/.local/bin/hopper-codex                 # Tier C #1
rm ~/.local/bin/hopper-opencode              # Tier C #2
# The hopper-plugin clone itself stays — it's just a directory of code.
```

No registry entries, no daemon, no shell config required.
