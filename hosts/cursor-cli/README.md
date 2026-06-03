# hopper-plugin host adapter: Cursor CLI (Tier C #5)

Anchor: `hosts/cursor-cli/README.md::root`

## What this is

The Cursor CLI host adapter for `hopper-plugin`. It uses Cursor's headless CLI agent (`agent -p`) as the outer host loop and keeps vendor routing inside `cli/bin/hopper-dispatch`.

## How it works

`hopper-cursor`:

1. Validates task-id and flags with the same rules used by the other host adapters
2. Locates `cli/bin/hopper-dispatch`
3. Exports `HOPPER_HOST_VENDOR=cursor`
4. Runs `agent -p --force ...` exactly once so Cursor uses its shell tool to run the dispatcher

Cursor is host-only in this repository. There is no `cursor` vendor adapter, so the `host != vendor` rule is always satisfied structurally.

## Install

Linux / macOS:

```bash
ln -s /absolute/path/to/hopper-plugin/hosts/cursor-cli/bin/hopper-cursor \
      ~/.local/bin/hopper-cursor
chmod +x /absolute/path/to/hopper-plugin/hosts/cursor-cli/bin/hopper-cursor
```

Windows (PowerShell, admin):

```powershell
New-Item -ItemType SymbolicLink `
  -Path "$HOME\bin\hopper-cursor.cmd" `
  -Target "F:\path\to\hopper-plugin\hosts\cursor-cli\bin\hopper-cursor.cmd"
```

## Prerequisites

| Requirement | How to check |
|---|---|
| Node 18+ on PATH | `node --version` |
| Cursor CLI on PATH | `command -v agent` |
| Cursor authenticated | `agent -p "say HOPPER_CURSOR_OK"` |
| bash on Windows | `bash --version` |

## Usage

```bash
hopper-cursor <task-id> [--write] [--force] [--background] [--model <name>] [--reasoning <level>]
```

## Cross-host note

This is another Tier C host path. Vendor routing still comes from `.hopper/AGENTS.md`, not from the host wrapper. The same task-id should resolve the same vendor across hosts, subject to the hard rule that `host != vendor`.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `agent: command not found` | Cursor CLI not installed | Install Cursor CLI |
| `Error: hopper-dispatch not found` | Wrong plugin root | Set `HOPPER_PLUGIN_ROOT` |
| Cursor host cannot run shell | Workspace trust / permissions missing | Re-run with a trusted workspace and confirm CLI setup |
