# Hopper Queue — hopper-plugin (v2 schema)

Anchor: `.hopper/queue.md::root`

- **Schema version**: 2 (Task-type column primary; Role column omitted per task-based orchestration v2.0 amendment 2026-05-20)
- **Task spec source**: `.hopper/handoffs/leader-tasklist.md`
- **Status values**: `pending` / `in-progress` / `done` / `failed` / `removed`
- **Push privilege**: Leader only (per PING.md §Push protocol)
- **Pop protocol**: PING.md `ping <task-id>` (v5 form)
- **Vendor routing**: each Task-type has default vendor preference in `.hopper/AGENTS.md` task-vendor-preference table; row-level override possible via optional `Vendor` column (not used in initial queue)
- **Spec authority**: `F:\workspace\ai\llm-hopper\docs\plans\2026-05-19-hopper-plugin-demo-spec.md` v2.0

---

## Tasks

| ID | Task-type | Status | Depends | Priority | Brief |
|----|-----------|--------|---------|----------|-------|
| T-PLUGIN-00 | spec-blindspot-hunt | in-progress | | high | Phase 0 host-lifecycle spike: 3 prongs. Prong 2 + Prong 3 VERIFIED. **Prong 1 Claude Code plugin install blocked-on-user-manual** per PING.md Step 6 — task stays in-progress until user installs plugin + reports `/hopper:smoke` output. Codex Phase 0 audit F2 fix. |
| T-PLUGIN-00b | spec-blindspot-hunt | done | | high | Vendor invocation spike: kimi-cli + opencode + copilot + gemini headless calls. 2h hard cap. Outputs `docs/spikes/T-PLUGIN-00b-vendors.md`. Parallel-eligible with T-PLUGIN-00. |
| T-PLUGIN-00.5 | spec-write | done | T-PLUGIN-00, T-PLUGIN-00b | high | Tasks library bootstrap: write 6 `.hopper/tasks/<type>.md` frames (spec-write, code-impl, code-review-adversarial, code-review-acceptance, sidecar-polish, spec-blindspot-hunt). |
| T-PLUGIN-01 | code-impl | pending | T-PLUGIN-00, T-PLUGIN-00.5 | normal | Repo init + Claude Code plugin manifest (uses T-00-resolved values verbatim). |
| T-PLUGIN-02 | code-impl | pending | T-PLUGIN-01 | normal | Core queue.md parser (v2 schema, Task-type column). |
| T-PLUGIN-03 | code-impl | pending | T-PLUGIN-01 | normal | Tasks library loader: `loadTaskFrame(taskType): string`. |
| T-PLUGIN-04 | code-impl | pending | T-PLUGIN-02, T-PLUGIN-03 | normal | AGENTS.md parser + vendor router (task-type → vendor adapter, deterministic static lookup; no round-robin). |
| T-PLUGIN-04.5 | spec-write | pending | T-PLUGIN-00b | high | Vendor adapter contract + shared subprocess wrapper (NEW per codex F5; defines VendorAdapter interface + runSubprocessOnce in cli/src/subprocess.ts; all 5 adapters depend on this) |
| T-PLUGIN-05a | code-impl | pending | T-PLUGIN-04, T-PLUGIN-04.5 | normal | Codex vendor adapter (cli/src/vendors/codex.ts, ~50-80 lines on top of shared wrapper). |
| T-PLUGIN-05b | code-impl | pending | T-PLUGIN-04, T-PLUGIN-00b | normal | Kimi vendor adapter (kimi -p --print --afk, ~40 lines). |
| T-PLUGIN-05c | code-impl | pending | T-PLUGIN-04, T-PLUGIN-00b | normal | OpenCode vendor adapter (opencode run, pin 0.14.7 per #3213, ~50 lines). |
| T-PLUGIN-05d | code-impl | pending | T-PLUGIN-04, T-PLUGIN-00b | normal | Copilot vendor adapter (copilot -p, GH_TOKEN auth, quota-aware, ~40 lines). |
| T-PLUGIN-05e | code-impl | pending | T-PLUGIN-04, T-PLUGIN-04.5, T-PLUGIN-00b | normal | Gemini vendor adapter (cli/src/vendors/gemini.ts, ~50-80 lines on shared wrapper). 5th functional vendor per codex F4 correction. Antigravity is doc-only `vendors/antigravity.ts.spec.md`, post-essay. |
| T-PLUGIN-06 | code-impl | pending | T-PLUGIN-05a | normal | Output.md writer + queue/cost-row suggested-edit prompts. |
| T-PLUGIN-07 | code-impl | pending | T-PLUGIN-06 | normal | Claude Code slash command wiring (Tier B full). |
| T-PLUGIN-08a | code-impl | pending | T-PLUGIN-07 | normal | Codex CLI host adapter (Tier C #1, custom prompt wrapper). |
| T-PLUGIN-08b | code-impl | pending | T-PLUGIN-07 | normal | OpenCode host adapter (Tier C #2, plugin module). Either 08a or 08b minimum for cross-host PASS. |
| T-PLUGIN-09 | spec-write | pending | T-PLUGIN-08a, T-PLUGIN-08b | normal | README + 30-60s screencast (multi-vendor switch demo). |
| T-PLUGIN-10 | code-review-acceptance | pending | T-PLUGIN-09 | high | Critic end-to-end verification of all 5 hard acceptance criteria (file-state, cross-host+multi-vendor, no Agent SDK, no harness core, task-based). |

---

## Activity log

> Each pop / done / failed by popping session appends a line. Format per PING.md §Step 3 / §Step 7.

- queue initialized at 2026-05-20T02:42:00+08:00 by strategy-primary (claude-opus-4-7) — 11 tasks v1.1.1 schema
- queue migrated to v2 schema at 2026-05-20T03:30:00+08:00 by strategy-primary — Task-type column primary; added T-PLUGIN-00b (vendor spike), T-PLUGIN-00.5 (tasks library), T-PLUGIN-05a-e (5 vendor adapters), T-PLUGIN-08a/b (2 host adapters); total 18 tasks; per spec v2.0 amendments A (task-based) + B (no-harness-core) + C (5-vendor scope per user decision C+)
- queue patched at 2026-05-20T<later> by strategy-primary — T-PLUGIN-04.5 vendor adapter contract task added (codex F5 fix); T-PLUGIN-05e brief updated to Gemini (not Antigravity; codex F4 fix); adapter line counts revised; total 19 tasks; per spec v2.0.1 codex audit response
- T-PLUGIN-00 started at 2026-05-20T22:30:00+08:00 by strategy-as-developer (claude-opus-4-7) — per user directive demo阶段由Strategy直接开发
- T-PLUGIN-00b started at 2026-05-20T22:30:00+08:00 by strategy-as-developer (parallel with T-00)
- T-PLUGIN-00.5 started at 2026-05-20T22:30:00+08:00 by strategy-as-developer (parallel)
- T-PLUGIN-00 done at 2026-05-20T23:15:00+08:00 — Verdict PASS_WITH_NOTE; resolved values locked in docs/spikes/T-PLUGIN-00-resolved.md; Prong 1 install user-blocked but not blocker for Phase 1
- T-PLUGIN-00 status reverted to in-progress at 2026-05-20T23:50:00+08:00 by strategy-as-developer (claude-opus-4-7) — Codex Phase 0 audit F2 finding: marking Prong 1 user-blocked as `done` violated PING.md Step 6 manual-verify rule. Task stays in-progress until user installs plugin + confirms `/hopper:smoke` output. Prong 2 + Prong 3 verification stands; Phase 1 plumbing tasks (T-01/02/03/04) can proceed since they don't depend on Prong 1 install, but T-07 (Claude Code slash wiring) is blocked on Prong 1 confirm.
- T-PLUGIN-00b done at 2026-05-20T23:15:00+08:00 — Verdict PASS_WITH_NOTE; 2 of 5 vendors fully smoke-verified (Codex + OpenCode); Kimi auth blocked; Copilot/Gemini not installed; documented for user-action
- T-PLUGIN-00.5 done at 2026-05-20T23:15:00+08:00 — Verdict PASS; 6 .hopper/tasks/*.md frames written; anti-persona test passes
