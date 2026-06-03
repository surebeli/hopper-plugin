# OpenCode hopper-async plugin

Anchor: `hosts/opencode/plugins/README.md::root`

> **Status**: disabled shim.
>
> The repository now enforces a hard `host != vendor` rule. The old native OpenCode plugin path always dispatched to `opencode` as the worker, so it violated that rule by making `host == vendor`.

## What this is

This file remains as an installable shim so existing OpenCode environments get a clear error message instead of silently following the old divergent path.

Calling `hopper_dispatch` now fails fast and points users to the supported paths:

- `hopper-opencode <task-id> --background`
- `hopper-dispatch <task-id> --background` from a shell tool

## When to use

- **Do not use the native plugin path for real dispatches.**
- **Use the wrapper path** when you want OpenCode to act as the host and preserve the dispatcher's routing, validation, and `host != vendor` enforcement.

## Install

### Project-local

```bash
mkdir -p .opencode/plugins/
cp /path/to/hopper-plugin/hosts/opencode/plugins/hopper-async.ts .opencode/plugins/
```

### Global

```bash
mkdir -p ~/.config/opencode/plugins/
cp /path/to/hopper-plugin/hosts/opencode/plugins/hopper-async.ts ~/.config/opencode/plugins/
```

## Behavior

- `hopper_dispatch` always throws with a migration message
- no `prompt_async`
- no `session.idle`
- no alternate dispatcher implementation

## Spec compliance

Per spec v2.1.0 §14:

- §14.4: host-native path intentionally disabled because it cannot satisfy `host != vendor`
- §14.6: single-spawn remains preserved by redirecting users to the wrapper/dispatcher path
- §14.10: no retry, no fallback orchestration, no direct queue mutation
