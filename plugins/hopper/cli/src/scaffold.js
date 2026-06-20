// .hopper/ workspace scaffolder (HOPPER-4: hopper-dispatch --init-tasks)
// Anchor: cli/src/scaffold.js
//
// Generates a complete, ready-to-edit .hopper/ tree so a new project doesn't
// hand-write queue.md + AGENTS.md + tasks/ frames + leader-tasklist.md +
// COST-LOG.md by hand (the 2026-06-04 retrospective's "manual editing across
// four files" friction). Pure Node stdlib. Idempotent: refuses to overwrite an
// existing .hopper/ unless force=true.
//
// The generated files are deliberately GENERIC (no hopper-plugin internals) and
// faithful to the parsers in queue.js / agents.js / tasks.js: queue.md uses the
// v2 schema; AGENTS.md has both the "Active Agent Instances" and the
// "task-vendor-preference" tables; every tasks/<type>.md frame is
// anti-persona-clean per tasks.js verifyFrameAntiPersona.

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { renderRulesMarkdown } from './rules.js';
import { listAdapters } from './vendors/index.js';

/** Task-type frames the scaffold ships (one .hopper/tasks/<type>.md each). */
export const SCAFFOLD_TASK_TYPES = Object.freeze([
  'spec-write',
  'code-impl',
  'code-review-adversarial',
  'code-review-acceptance',
  'sidecar-polish',
  'spec-blindspot-hunt',
  'prd-research',
  'market-research',
]);

/**
 * Build the full file set the scaffold writes, as { rel, content } entries
 * relative to the .hopper/ directory. Pure — exported for testing without FS.
 *
 * @returns {Array<{ rel: string, content: string }>}
 */
export function buildScaffoldFiles() {
  const files = [
    { rel: 'queue.md', content: QUEUE_MD },
    { rel: 'AGENTS.md', content: AGENTS_MD },
    { rel: 'COST-LOG.md', content: COST_LOG_MD },
    // GENERATED dispatch-rules matrix — the single source of truth for the
    // per-vendor parameter contract, rendered from the live adapters so a project
    // never hand-maintains (and rots) invocation strings. Regenerate after a
    // hopper upgrade: `hopper-dispatch --rules > .hopper/DISPATCH.md`.
    { rel: 'DISPATCH.md', content: renderRulesMarkdown() },
    { rel: join('handoffs', 'leader-tasklist.md'), content: LEADER_TASKLIST_MD },
  ];
  for (const type of SCAFFOLD_TASK_TYPES) {
    files.push({ rel: join('tasks', `${type}.md`), content: taskFrame(type) });
  }
  return files;
}

/**
 * Scaffold a .hopper/ workspace under targetDir.
 *
 * @param {string} targetDir            project root to create .hopper/ in
 * @param {object} [opts]
 * @param {boolean} [opts.force]        overwrite pre-existing scaffold files
 * @returns {{ hopperDir: string, written: string[], overwritten: boolean }}
 * @throws {Error} code 'EHOPPEREXISTS' if scaffold files exist and !force
 */
export function scaffoldHopper(targetDir, { force = false } = {}) {
  const hopperDir = join(targetDir, '.hopper');
  const files = buildScaffoldFiles();

  // Idempotency guard: refuse if any target file already exists (unless force).
  const existing = files
    .map((f) => join(hopperDir, f.rel))
    .filter((p) => existsSync(p));
  if (existing.length > 0 && !force) {
    const err = new Error(
      `refusing to overwrite ${existing.length} existing .hopper/ file(s); pass --force to overwrite. ` +
      `First: ${existing[0]}`
    );
    err.code = 'EHOPPEREXISTS';
    err.existing = existing;
    throw err;
  }

  const written = [];
  for (const f of files) {
    const p = join(hopperDir, f.rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, f.content, 'utf-8');
    written.push(p);
  }
  return { hopperDir, written, overwritten: existing.length > 0 };
}

const DEFAULT_OVERLAY = 'This governance is authoritative; the vendor adapter adds execution mechanics only and never widens permissions or overrides the constitution.';
const DEFAULT_CONSTITUTION_POINTER = '.hopper/governance/portable-agent-core.md';

/** Build the GOVERNANCE.md body — one overlay row per registered adapter. */
export function buildGovernanceMarkdown() {
  const rows = listAdapters()
    .map((v) => `| ${v} | ${DEFAULT_OVERLAY} |`)
    .join('\n');
  return `# Hopper Governance — opt-in prompt overlay

> When this file exists, \`hopper-dispatch\` prepends the constitution (and any
> per-vendor overlay below) onto the prompt it sends the vendor. Delete this file
> to disable. Disable per task with a \`Govern\` column set to \`off\` in queue.md.
>
> Seed/refresh (vendors a stamped copy of fable's upstream core):
> \`hopper-dispatch --init-governance --from <fable>/prompts/portable-agent-core.md\`

- **Constitution**: ${DEFAULT_CONSTITUTION_POINTER}

## Vendor overlays

| Vendor | Overlay |
|--------|---------|
${rows}
`;
}

/**
 * Scaffold governance into an existing .hopper/. Writes GOVERNANCE.md and, when
 * --from is given, vendors a provenance-stamped copy of the constitution.
 * @param {string} hopperDir
 * @param {object} [opts]
 * @param {string} [opts.from]   Path to fable's prompts/portable-agent-core.md to vendor
 * @param {boolean} [opts.force] Overwrite an existing GOVERNANCE.md
 * @returns {{ written: string[] }}
 */
export function scaffoldGovernance(hopperDir, { from = null, force = false } = {}) {
  const govPath = join(hopperDir, 'GOVERNANCE.md');
  if (existsSync(govPath) && !force) {
    const err = new Error(`refusing to overwrite existing ${govPath}; pass --force to overwrite.`);
    err.code = 'EHOPPEREXISTS';
    throw err;
  }
  const written = [];
  if (from) {
    const govDir = join(hopperDir, 'governance');
    mkdirSync(govDir, { recursive: true });
    const dest = join(govDir, 'portable-agent-core.md');
    const body = readFileSync(from, 'utf-8');
    const stamp = `<!-- vendored by hopper --init-governance; provenance: ${from}; do not hand-edit — re-run --init-governance --from to refresh -->\n\n`;
    writeFileSync(dest, stamp + body, 'utf-8');
    written.push(dest);
  }
  writeFileSync(govPath, buildGovernanceMarkdown(), 'utf-8');
  written.push(govPath);
  return { written };
}

// ─── Templates ────────────────────────────────────────────────────────────

const QUEUE_MD = `# Hopper Queue

Anchor: \`.hopper/queue.md::root\`

- **Schema version**: 2 (Task-type column is the primary routing key)
- **Task spec source**: \`.hopper/handoffs/leader-tasklist.md\` (one section per task ID)
- **Status values**: \`pending\` / \`in-progress\` / \`done\` / \`failed\` / \`removed\`
- **Vendor routing**: each Task-type has a default vendor in \`.hopper/AGENTS.md\`;
  a row may override it via the optional \`Vendor\` column.

---

## Tasks

| ID | Task-type | Status | Depends | Priority | Brief | Vendor |
|----|-----------|--------|---------|----------|-------|--------|
| T-EXAMPLE-001 | code-impl | pending | | normal | Replace this with your first task. Put the full spec under the same ID in handoffs/leader-tasklist.md. | |

---

## Activity log

- queue initialized by \`hopper-dispatch --init-tasks\`
`;

const AGENTS_MD = `# Agent Instances

Generated by \`hopper-dispatch --init-tasks\`. Edit to match the vendor CLIs you
actually have installed and authenticated. Remove rows you do not use.

The plugin resolves a task's vendor from the **task-vendor-preference** table
below (or a per-row \`Vendor\` column in queue.md). \`host != vendor\` is enforced:
never route a task to the same CLI that is dispatching it.

---

## Active Agent Instances

| Nickname | UUID | Vendor | Default invocation | Notes |
|----------|------|--------|--------------------|-------|
| \`codex\` | \`-\` | codex | \`codex exec\` | High-reasoning; spec + acceptance review |
| \`kimi\` | \`-\` | kimi | \`kimi -p "<input>"\` | Cost-optimized bulk implementation |
| \`opencode\` | \`-\` | opencode | \`opencode run "<input>" --model <provider/model>\` | Multi-provider |
| \`copilot\` | \`-\` | copilot | \`copilot -p "<input>"\` | GitHub-tied; premium quota meters per call |
| \`agy\` | \`-\` | agy | \`agy -p "<input>"\` | Antigravity (Gemini); OAuth-only |
| \`grok\` | \`-\` | grok | \`grok -p "<input>" --permission-mode bypassPermissions --always-approve -m grok-build\` | xAI Grok Build (headless needs an explicit permission mode) |

---

## Task-type → vendor default preference

| Task-type | Default vendor | Why |
|---|---|---|
| \`spec-write\` | codex | High reasoning suits spec authoring |
| \`code-impl\` | kimi | Cheap tier handles bulk implementation |
| \`code-review-adversarial\` | grok | Independent third-party perspective |
| \`code-review-acceptance\` | codex | Acceptance-criteria verification |
| \`sidecar-polish\` | kimi | Fast, cheap hygiene/cleanup pass |
| \`spec-blindspot-hunt\` | opencode | Alternative perspective for unknown-unknowns |
| \`prd-research\` | codex | Web-search-backed product-requirement research (read-only by default) |
| \`market-research\` | codex | Web-search-backed market/competitor research (read-only by default) |

---

## Reassignment

Change a default by editing the table above, or override per task with the
optional \`Vendor\` column in queue.md. Routing is a static lookup — no
round-robin, no retry-aware rotation.

---

## Dispatch rules (capability contract)

Which \`--model\` / \`--reasoning\` / \`--sandbox\` / \`--timeout\` each vendor honors —
plus its permission + working-dir mapping and timeout model — lives in
\`.hopper/DISPATCH.md\`. That file is **GENERATED from the hopper adapters; do NOT
hand-edit it, and do NOT hand-copy vendor invocation strings elsewhere** (they rot).
Regenerate after upgrading hopper: \`hopper-dispatch --rules > .hopper/DISPATCH.md\`.
Live single-vendor check: \`hopper-dispatch --capabilities <vendor>\`.
`;

const COST_LOG_MD = `# Hopper Cost Log

Append one row per dispatch. \`hopper-dispatch --write\` prints a suggested row.

| Date | Task | Task-type | Vendor | Tokens | $ | Wall | Notes |
|------|------|-----------|--------|--------|---|------|-------|
`;

const LEADER_TASKLIST_MD = `# Leader Tasklist

Full task specs live here. Each task in \`queue.md\` references a section below by
its ID (the dispatcher pulls this section as the task spec).

---

## T-EXAMPLE-001

**Goal**: Describe what to build or verify in one or two sentences.

**Acceptance criteria** (prefer machine-checkable — a shell command or grep that proves each):
1. ...
2. ...

**Files allowed to touch** (positive scope): ...

**Files MUST NOT touch** (negative scope): ...

**Budget**: time and vendor-cost ceiling.
`;

/**
 * Generic, anti-persona-clean frame for a task-type. Frames describe TASK SHAPE,
 * not agent identity (see tasks.js verifyFrameAntiPersona).
 */
function taskFrame(type) {
  const purpose = {
    'spec-write': 'Write a specification or design document — no product code.',
    'code-impl': 'Implement code that satisfies a pre-written spec’s acceptance criteria.',
    'code-review-adversarial': 'Independently review a change, hunting for defects the author would miss. Review only — no edits.',
    'code-review-acceptance': 'Verify a change against its stated acceptance criteria. Review only — no edits.',
    'sidecar-polish': 'Hygiene/cleanup on existing output (formatting, docs, dead code). Declare review-only vs edit-allowed up front.',
    'spec-blindspot-hunt': 'Surface unknown-unknowns, gaps, and risks in a plan or spec before implementation.',
    'prd-research': 'Research a product requirement / feature need using web search — synthesize findings, prior art, comparable products, and open questions into PRD input. Research only — no code, no edits.',
    'market-research': 'Research a market / competitor / trend question using web search — synthesize a sourced, structured brief (sizing, players, trends, risks). Research only — no code, no edits.',
  }[type] || 'Describe the task-type purpose here.';

  const verdict = type.startsWith('code-review')
    ? 'PASS | PASS_WITH_NOTE | REWORK | FAIL'
    : 'PASS | PASS_WITH_CHANGES | REWORK';

  return `# Task-type: ${type}

Anchor: \`.hopper/tasks/${type}.md::root\`

## Purpose

${purpose}

## Input shape

- The task spec section from \`.hopper/handoffs/leader-tasklist.md\` (matched by task ID)
- Acceptance criteria (prefer machine-checkable: a runnable command or grep per criterion)
- Positive scope (files allowed) and negative scope (files that must not change)
- Budget: time and vendor-cost ceiling

## Output shape (output.md)

The output should contain, in this order:

- **Summary**: what was delivered, in two to four sentences
- **Files touched**: paths with a one-line rationale each (or "none")
- **Acceptance verification (N/N)**: each criterion with evidence (command output, file:line, grep match)
- **Decisions / deviations**: judgment calls or scope changes (or "none")
- **Open questions**: list, or "none"
- **Verdict**: ${verdict}
- **Next recommendation**: what should happen next

## Notes

This frame describes the SHAPE of the work and the expected output, not an
identity to adopt. The vendor CLI brings its own behavior; the frame only states
what the protocol expects back.
`;
}
