# hopper-plugin Agent Instances (v2.0 schema — task-based binding)

Generated: 2026-05-20T00:00:00+08:00
Schema: llm-hopper v0.3 + task-based amendment (v2.0 spec, 2026-05-20)
Direction: dev (TypeScript/Node CLI + Claude Code plugin + 5 vendor adapters)

---

## Schema change (v2.0, 2026-05-20)

Previous schema bound `nickname → role → model`. v2.0 binds **`nickname → vendor` + optional `task-vendor-preference`**. The role layer is removed because v2.0 spec §3 #5 makes dispatch task-type-driven instead of role-driven. See `llm-hopper/.hopper/USAGE-GUIDE.md` §3.4 for the principle.

---

## Active Agent Instances

| Nickname | UUID | Vendor | Default invocation | Notes |
|----------|------|--------|-------------------|-------|
| `strategy-primary` | `825ab5bf-84c6-484b-b144-3e5e37595054` | claude-code-tui (Claude Opus 4.7) | (interactive only) | Observer/supervisor; not dispatched by plugin |
| `codex-builder` | `2620cc7a-25e6-4059-999e-17af54bdcaf4` | codex-cli (gpt-5.5-xhigh) | `codex exec -s read-only -c 'model_reasoning_effort="xhigh"'` (resolved by T-PLUGIN-00) | Sticky Leader-equivalent from myWriteAssistant |
| `kimi-builder` | `6c5ac7fa-7a5e-40b4-920a-b4fe1d562876` | kimi-cli (kimi-v2.6-thinking) | `kimi -p "<input>" --print --afk --output-format stream-json --final-message-only -m kimi-thinking` (per T-PLUGIN-00b research) | New in hopper-plugin; first dogfood of Kimi adapter |
| `opencode-builder` | `6db17b47-ba7f-4a16-8890-832ce18c43cb` | opencode (pin 0.14.7) | `opencode run --model <provider/model> "<input>"` | New; pin version per known regression #3213 |
| `copilot-builder` | `7a1c4d50-3b8e-4f2a-9c11-d4e3f8a9b234` | copilot-cli (Sonnet 4.5 default) | `copilot -p "<input>" --headless` (with `GH_TOKEN` env) | Premium quota meters per call — use sparingly |
| `agy-builder` | `9e2f1a3d-7b4c-4d8e-a1f6-c3b2d9e4f567` | agy-cli (Antigravity 1.0.0; Google's 2026-06-18 Gemini successor) | `agy -p "<input>" --dangerously-skip-permissions` + `--log-file <path>` for silent-auth-fail detection | 5th functional vendor per user swap 2026-05-20. agy quirks: silent-fail when not OAuth-authed (exit 0 + empty stdout). Adapter detects via log inspection. OAuth-only auth (no BYO API key); user must `agy` interactively first. |
| `critic-claude-opus` | `b3d5e7f9-1a2c-4e8a-b9c1-d4e6f8a9c123` | claude-opus-xhigh (fresh subagent) | (Strategy invokes /codex separately, OOB; not a queue role) | Adversarial review |

---

## Task-type → vendor default preference

Plugin routes by Task-type + this table. queue.md row may override via optional `Vendor` column (not used in initial queue).

| Task-type | Default vendor | Why |
|---|---|---|
| `spec-write` | codex-builder | High reasoning; sticky from spec-writing experience in myWriteAssistant |
| `code-impl` | kimi-builder *(static default — codex F1 fix; no round-robin / stateful rotation)* | Cheap tier handles bulk; if user wants different vendor for specific task, override via row-level Vendor column in queue.md |
| `code-review-adversarial` | (Strategy OOB /codex) | Out-of-band; not plugin-dispatched |
| `code-review-acceptance` | codex-builder | Continuity with sticky Leader pattern |
| `sidecar-polish` | kimi-builder OR deepseek-flash-via-future-adapter | Cheap-fast suitable for hygiene checks |
| `spec-blindspot-hunt` | codex-builder | High reasoning for unknown-unknowns |

---

## Role Permissions Summary (legacy, retained for backwards-compat reference)

v2.0 dropped role binding but the conceptual permissions still describe "what behaviors are acceptable in each task-type":

- **Strategy task** (long-horizon decisions): no queue push, no code edits, file-protocol only — handled by user-via-Claude-Code-interactive
- **Builder task** (code-impl / spec-write): full design + execution from spec
- **Critic task** (code-review-adversarial / code-review-acceptance): review-only, no code edits

---

## Cross-audit binding (per goal directive 2026-05-20)

Two triggers auto-invoke `/codex` GPT-5.5 xhigh as adversarial second opinion:
1. **New proposals**: any new dispatch handoff, spec revision, architectural decision
2. **Phase completion**: any T-PLUGIN-XX task done

Strategy invokes codex via `codex exec` with `model_reasoning_effort="xhigh"`. Codex is NOT in queue.md as a task; it is an out-of-band audit layer.

---

## Reassignment

Edit this file + update `.hopper/MANIFEST.md` together. UUIDs persist across model swaps; vendor binding may change per phase if a vendor proves unsuitable.

If a vendor adapter (T-PLUGIN-05x) fails its spike or implementation, mark the corresponding builder as `vendor: deferred-until-post-essay` and remove from task-vendor-preference table.
