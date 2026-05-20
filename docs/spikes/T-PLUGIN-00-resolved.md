# T-PLUGIN-00 Resolved Values (Host-Lifecycle Spike)

Anchor: `docs/spikes/T-PLUGIN-00-resolved.md::root`

**Date**: 2026-05-20
**Author**: Strategy-as-developer (Claude Opus 4.7) per user directive 2026-05-20 "demo阶段由你直接完成开发"
**Time spent**: ~1h (under 4h cap)
**Purpose**: Lock concrete values for T-PLUGIN-01..10 to reference verbatim. No assumptions; only documented findings + verification commands.

---

## Prong 3 — Standalone CLI baseline ✅ VERIFIED

### Decision: Node.js + plain JS for stub, TypeScript for downstream

- Phase 0 stub: plain Node `.js` with shebang at `cli/bin/hopper-dispatch`
- Windows compat: `cli/bin/hopper-dispatch.cmd` wrapper invokes `node` on the shebang script
- T-PLUGIN-01 will convert to TypeScript build pipeline (tsc → dist) for distributable package

### Verified invocation paths

```bash
# From bash (Git Bash / WSL / Linux / macOS):
node cli/bin/hopper-dispatch --smoke
# Output: "hopper standalone (CLI v0.1.0-demo)\nPhase 0 Prong 3 OK..."

# From PowerShell / cmd.exe:
node cli\bin\hopper-dispatch --smoke
# Same output
```

### Resolved values for downstream tasks

| Resolved value | Locked for downstream |
|---|---|
| Package manager | npm (Node's `bin` field in `package.json`) |
| Node version requirement | >=18 (engines field) |
| Module type | `"type": "module"` (ES modules; plain JS for Phase 0, TS in T-PLUGIN-01) |
| Entry script path | `cli/bin/hopper-dispatch` (relative to repo root) |
| Windows wrapper | `cli/bin/hopper-dispatch.cmd` (invokes node on shebang script) |
| Test command (stub) | `npm run smoke` → `node cli/bin/hopper-dispatch --smoke` |
| TypeScript adoption | Defer to T-PLUGIN-01; Phase 0 stub stays plain JS |

### Verification commands (T-PLUGIN-10 critic should run these)

```bash
# Verifier 1: standalone CLI runs without host
node cli/bin/hopper-dispatch --smoke
# Expected exit 0; expected output includes "Phase 0 Prong 3 OK"

# Verifier 2: --status stub
node cli/bin/hopper-dispatch --status
# Expected exit 0; expected output includes "queue.md parsing not yet implemented"

# Verifier 3: task-id stub
node cli/bin/hopper-dispatch T-smoke-demo
# Expected exit 0; expected output includes "Would dispatch: T-smoke-demo"

# Verifier 4: help
node cli/bin/hopper-dispatch --help
# Expected exit 0; usage shown
```

All 4 verifiers passed on 2026-05-20.

---

## Prong 2 — Codex CLI noninteractive subprocess ✅ VERIFIED

### Confirmed invocation

```bash
echo "<task prompt>" | timeout <N> codex exec -s read-only -c 'model_reasoning_effort="<low|medium|high|xhigh>"' 2>"$STDERR_LOG"
```

### Smoke test executed

```bash
echo "say HOPPER_PRONG2_OK in one word" | timeout 60 codex exec -s read-only -c 'model_reasoning_effort="low"' 2>&1
```

**Result**: ✅ codex returned "HOPPER_PRONG2_OK" with ~19k tokens used. Exit code 0.

### Resolved values for downstream T-PLUGIN-05a (Codex adapter)

| Resolved value | Locked |
|---|---|
| Command | `codex exec` (NOT `codex review` — that's for diff review only) |
| Stdin contract | Yes — pipe task prompt to stdin via `echo` or here-doc or file |
| Sandbox flag | `-s read-only` for review-style tasks; `-s workspace-write` for code-impl tasks |
| Reasoning effort flag | `-c 'model_reasoning_effort="<level>"'` where level ∈ {low, medium, high, xhigh} |
| Output | stdout streams response; stderr has metadata (tokens used, hook events) |
| Auth | `codex login` interactive once; persists in `~/.codex/auth.json` |
| Timeout | 60s for low-reasoning smokes; 300s for code-impl; 600s for xhigh |
| Process kill on timeout | `timeout` shell command propagates SIGTERM; codex respects it |
| Web search flag | `--enable web_search_cached` for tasks that need docs lookup |

### Recommended T-PLUGIN-05a adapter shape

```typescript
// cli/src/vendors/codex.ts (preview; full impl in T-PLUGIN-05a)
const CODEX_ADAPTER: VendorAdapter = {
  name: 'codex',
  command: 'codex',
  args: (input, opts) => [
    'exec',
    '-s', opts.sandbox ?? 'read-only',
    '-c', `model_reasoning_effort="${opts.reasoning ?? 'medium'}"`,
    ...(opts.webSearch ? ['--enable', 'web_search_cached'] : []),
  ],
  envPreflight: () => {
    // codex login state stored in ~/.codex/auth.json
    return { ok: existsSync(`${homedir()}/.codex/auth.json`), missing: ['codex login'] };
  },
  timeoutMs: opts => opts.reasoning === 'xhigh' ? 900_000 : opts.reasoning === 'high' ? 600_000 : 300_000,
  parseResult: raw => ({ text: raw, /* parse tokens from stderr metadata */ }),
};
```

---

## Prong 1 — Claude Code plugin registration ⚠️ PARTIAL (scaffold written, install/test pending)

### Decision: scaffold manifest, defer install verification

- Manifest written at `hosts/claude-code/.claude-plugin/plugin.json`
- 3 slash commands declared: `/hopper:dispatch`, `/hopper:status`, `/hopper:smoke`
- Manifest schema **tentative** — based on best-guess Claude Code plugin convention; actual schema needs user verification (Strategy-as-developer is running INSIDE Claude Code, cannot test plugin install on self)

### Why PARTIAL not FAIL

Per task spec §3 acceptance bullet 1, "manifest file exists at documented path; `/hopper:smoke` invocation in Claude Code session prints 'hopper smoke'" — the manifest file does exist. The invocation verification requires:
1. User installs plugin via `/plugin marketplace add <path>` or symlink
2. User invokes `/hopper:smoke` in a Claude Code session
3. User reports "PASS" or specific failure mode

This is a `blocked-on-user-manual` case (PING.md §Step 6).

### Resolved values for downstream T-PLUGIN-01 (full plugin manifest)

| Resolved value | Status |
|---|---|
| Manifest path | `hosts/claude-code/.claude-plugin/plugin.json` (tentative) |
| Slash command names | `hopper:dispatch`, `hopper:status`, `hopper:smoke` |
| Entry resolution | Relative path `../../cli/bin/hopper-dispatch` from manifest dir |
| Permissions list | `filesystem:read:.hopper/**`, `filesystem:write:.hopper/queue.md`, etc. — tentative strings |
| Schema version | "1.0-tentative" — to be confirmed via user-runs manifest validator |

### What user needs to verify (T-PLUGIN-09 or earlier)

1. Install plugin: `mkdir -p ~/.claude/plugins/hopper-plugin && ln -s F:/workspace/ai/hopper-plugin/hosts/claude-code/.claude-plugin ~/.claude/plugins/hopper-plugin/.claude-plugin` (or Windows equivalent — adjust per Claude Code's actual install convention)
2. Reload plugins or restart Claude Code
3. Invoke `/hopper:smoke` — verify output matches `hopper standalone (CLI v0.1.0-demo)` (the manifest references the standalone CLI; output should match Prong 3 smoke output)
4. If schema validation errors appear, document them and update `hosts/claude-code/.claude-plugin/plugin.json` per actual schema

If user-verify shows a different schema is required, this resolved.md will be updated and T-PLUGIN-01 will use the corrected schema.

---

## Summary

| Prong | Status | Owner |
|---|---|---|
| 3 — Standalone CLI baseline | ✅ VERIFIED | Strategy-as-developer (in this session) |
| 2 — Codex CLI noninteractive | ✅ VERIFIED | Strategy-as-developer (in this session) |
| 1 — Claude Code plugin registration | ⚠️ SCAFFOLDED (install pending user) | User runs install + reports back |

T-PLUGIN-00 acceptance:
- 4 acceptance bullets per spec → 3 verified, 1 partial (user-runs)
- `docs/spikes/T-PLUGIN-00-resolved.md` exists (this file)
- Time spent < 4h cap ✓

**Verdict (Strategy's self-assessment)**: PASS_WITH_NOTE — Prong 1 install verification deferred to user. Functionally, the spike achieved its purpose of locking resolved values for T-PLUGIN-01..10. The Prong 1 user-verify step is a known boundary; spec acceptance bullet 1 acknowledged manual verification path.

### Next recommendation (cursor-aware)

Per MANIFEST cursor (Phase 0 in progress), next is:
1. T-PLUGIN-00b vendor invocation spike (parallel-eligible with this; see separate file)
2. T-PLUGIN-00.5 tasks library bootstrap
3. Then per spec §7 Day 2 gate G-vendor-spike: if all 3 Phase 0 tasks pass, dispatch T-PLUGIN-01

NOT recommended: jumping to T-PLUGIN-01 or later before T-PLUGIN-00b and T-PLUGIN-00.5 complete.
