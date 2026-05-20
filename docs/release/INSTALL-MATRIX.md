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

All 4 spawn the kimi CLI subprocess. Vendor selection lives in `.hopper/AGENTS.md`, not in the host adapter — this is the structural cross-host claim.

The equivalence is mechanically asserted by `tests/unit/validation.test.js` "cross-host parity" test, which reads all 3 host entry points (Tier B + Tier C #1 + Tier C #2) and verifies they cite the same canonical task-id regex literal.

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
