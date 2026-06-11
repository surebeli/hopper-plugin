# hopper-plugin host adapter: Copilot CLI (Tier C #3)

Anchor: `hosts/copilot-cli/README.md::root`

## What this is

The Copilot CLI host adapter for `hopper-plugin`. It is a thin prompt wrapper that uses the outer `copilot` agent to invoke the host-agnostic `cli/bin/hopper-dispatch`.

## How it works

`hopper-copilot`:

1. Validates task-id and flags with the same rules used by Tier A/B/C
2. Locates `cli/bin/hopper-dispatch` via `HOPPER_PLUGIN_ROOT` or wrapper-relative resolution
3. Exports `HOPPER_HOST_VENDOR=copilot`
4. Runs `copilot -p ...` exactly once so Copilot uses its shell tool to run the dispatcher

The dispatcher then enforces the product rule `host != vendor`. A Copilot host session cannot dispatch back to the `copilot` vendor.

## Install

Linux / macOS:

```bash
ln -s /absolute/path/to/hopper-plugin/hosts/copilot-cli/bin/hopper-copilot \
      ~/.local/bin/hopper-copilot
chmod +x /absolute/path/to/hopper-plugin/hosts/copilot-cli/bin/hopper-copilot
```

Windows (PowerShell, admin):

```powershell
New-Item -ItemType SymbolicLink `
  -Path "$HOME\bin\hopper-copilot.cmd" `
  -Target "F:\path\to\hopper-plugin\hosts\copilot-cli\bin\hopper-copilot.cmd"
```

## Prerequisites

| Requirement | How to check |
|---|---|
| Node 18+ on PATH | `node --version` |
| Copilot CLI on PATH | `command -v copilot` |
| Copilot authenticated | `copilot -p "say HOPPER_AUTH_OK" --allow-all-tools` |
| bash on Windows | `bash --version` |

## Usage

```bash
hopper-copilot <task-id> [--write] [--force] [--background] [--model <name>] [--reasoning <level>] [--sandbox <mode>]
```

`--sandbox` accepts `read-only | workspace-write | danger-full-access`. Default is `danger-full-access` unless the task brief/spec explicitly says `read-only` / `只读`.

## Cross-host note

This is another Tier C host path. Vendor routing still comes from `.hopper/AGENTS.md`, not from the host wrapper. The same task-id should resolve the same vendor across hosts, subject to the hard rule that `host != vendor`.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `copilot: command not found` | Copilot CLI not installed | Install GitHub Copilot CLI |
| `Error: hopper-dispatch not found` | Wrong plugin root | Set `HOPPER_PLUGIN_ROOT` |
| `host != vendor` rejection | `.hopper/AGENTS.md` resolved to `copilot` | Change vendor binding or invoke from a different host |
