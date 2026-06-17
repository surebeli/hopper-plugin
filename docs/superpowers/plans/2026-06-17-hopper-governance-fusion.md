# Hopper Governance Fusion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give hopper an opt-in governance overlay — when `.hopper/GOVERNANCE.md` exists, the dispatcher prepends a behavioral constitution (+ optional per-vendor overlay) onto the prompt it sends the vendor — fusing fable's governance-injection into hopper's existing vendor routing.

**Architecture:** A new `cli/src/governance.js` resolves a governance preamble off the vendor `resolveVendor()` already returns. `composePrompt()` gains an optional third argument that prepends `constitution + overlay`. `resolveDispatch()` calls the resolver between vendor resolution and prompt composition. Governance is pure file I/O on the existing resolve path — no new subprocess, no change to adapters, sandbox, timeout, routing, or `host != vendor`. Absent `GOVERNANCE.md` ⇒ byte-identical to today.

**Tech Stack:** Node ≥18 ESM, `node --test` (no deps), markdown `.hopper/` file protocol.

**Spec:** `docs/superpowers/specs/2026-06-17-fable-hopper-governance-fusion-design.md`

---

### Task 1: `composePrompt` accepts an optional governance preamble

**Files:**
- Modify: `cli/src/tasks.js` (the `composePrompt` function at the end of the file)
- Test: `tests/unit/tasks.test.js`

- [ ] **Step 1: Add a regression-lock test + governance test**

Append to `tests/unit/tasks.test.js`:

```js
test('composePrompt without governance is byte-identical to legacy 2-arg form', () => {
  const frame = '# Frame\nDo X.';
  const spec = 'Task: build Y.';
  const out = composePrompt(frame, spec);
  // Locked legacy shape: frame, ---, ## Task spec, spec, trailing newline.
  assert.equal(out, '# Frame\nDo X.\n\n---\n\n## Task spec\n\nTask: build Y.\n');
});

test('composePrompt with governance prepends constitution then overlay', () => {
  const frame = '# Frame\nDo X.';
  const spec = 'Task: build Y.';
  const out = composePrompt(frame, spec, {
    governance: { constitution: 'CONSTITUTION TEXT', overlay: 'OVERLAY TEXT' },
  });
  assert.equal(
    out,
    'CONSTITUTION TEXT\n\n---\n\nOVERLAY TEXT\n\n---\n\n# Frame\nDo X.\n\n---\n\n## Task spec\n\nTask: build Y.\n'
  );
});

test('composePrompt with constitution but empty overlay omits the overlay block', () => {
  const out = composePrompt('F', 'S', { governance: { constitution: 'C', overlay: '' } });
  assert.equal(out, 'C\n\n---\n\nF\n\n---\n\n## Task spec\n\nS\n');
});

test('composePrompt with governance null behaves as legacy', () => {
  const out = composePrompt('F', 'S', { governance: null });
  assert.equal(out, 'F\n\n---\n\n## Task spec\n\nS\n');
});
```

- [ ] **Step 2: Run the new tests, verify the governance ones fail**

Run: `node --test tests/unit/tasks.test.js`
Expected: the legacy/`null` tests PASS (current behavior already matches), the two governance tests FAIL (`composePrompt` ignores the 3rd arg today).

- [ ] **Step 3: Implement the optional preamble**

Replace the `composePrompt` function in `cli/src/tasks.js` with:

```js
/**
 * Compose final dispatch prompt from frame + task spec, with an OPTIONAL
 * governance preamble prepended (constitution + optional per-vendor overlay).
 *
 * @param {string} frameContent       Output of loadTaskFrame
 * @param {string} taskSpec           Task spec section (from leader-tasklist.md or similar)
 * @param {{ governance?: { constitution: string, overlay?: string } | null }} [opts]
 * @returns {string}                  Composed prompt to send to vendor adapter
 */
export function composePrompt(frameContent, taskSpec, { governance = null } = {}) {
  const parts = [];
  if (governance && governance.constitution && governance.constitution.trim()) {
    parts.push(governance.constitution.trim());
    if (governance.overlay && governance.overlay.trim()) parts.push(governance.overlay.trim());
  }
  parts.push(frameContent.trim());
  parts.push(`## Task spec\n\n${taskSpec.trim()}`);
  return parts.join('\n\n---\n\n') + '\n';
}
```

- [ ] **Step 4: Run the full tasks test file, verify all pass**

Run: `node --test tests/unit/tasks.test.js`
Expected: PASS (all, including the legacy byte-identical lock).

- [ ] **Step 5: Commit**

```bash
git add cli/src/tasks.js tests/unit/tasks.test.js
git commit -m "feat(governance): composePrompt accepts optional governance preamble"
```

---

### Task 2: `governance.js` — parse `.hopper/GOVERNANCE.md`

**Files:**
- Create: `cli/src/governance.js`
- Test: `tests/unit/governance.test.js`

- [ ] **Step 1: Write the failing parser tests**

Create `tests/unit/governance.test.js`:

```js
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { parseGovernanceContent } from '../../cli/src/governance.js';

test('parseGovernanceContent reads the constitution pointer', () => {
  const md = `# Hopper Governance

- **Constitution**: .hopper/governance/portable-agent-core.md

## Vendor overlays

| Vendor | Overlay |
|--------|---------|
| codex | Governance is authoritative; adapter mechanics never widen permissions. |
| kimi | Follow the constitution; do not adopt a persona. |
`;
  const g = parseGovernanceContent(md);
  assert.equal(g.constitutionPointer, '.hopper/governance/portable-agent-core.md');
  assert.equal(g.overlays.codex, 'Governance is authoritative; adapter mechanics never widen permissions.');
  assert.equal(g.overlays.kimi, 'Follow the constitution; do not adopt a persona.');
});

test('parseGovernanceContent tolerates a missing overlay table', () => {
  const g = parseGovernanceContent('- **Constitution**: ./c.md\n');
  assert.equal(g.constitutionPointer, './c.md');
  assert.deepEqual(g.overlays, {});
});

test('parseGovernanceContent returns null pointer when absent', () => {
  const g = parseGovernanceContent('# Hopper Governance\n\nNo pointer here.\n');
  assert.equal(g.constitutionPointer, null);
});
```

- [ ] **Step 2: Run, verify failure**

Run: `node --test tests/unit/governance.test.js`
Expected: FAIL with "Cannot find module ../../cli/src/governance.js".

- [ ] **Step 3: Implement the parser**

Create `cli/src/governance.js`:

```js
// Governance overlay resolver (opt-in prompt preamble).
// Anchor: cli/src/governance.js
//
// When .hopper/GOVERNANCE.md exists, dispatch prepends a behavioral constitution
// (+ optional per-vendor overlay) onto the composed prompt. This is the fable
// governance-injection fused into hopper's routing: the overlay is keyed on the
// SAME vendor resolveVendor() already returns. Pure file I/O — NO subprocess.

import { readFile } from 'node:fs/promises';
import { resolve, join, isAbsolute } from 'node:path';

/**
 * Parse GOVERNANCE.md content.
 * @param {string} content
 * @returns {{ constitutionPointer: string|null, overlays: Record<string,string> }}
 */
export function parseGovernanceContent(content) {
  const pointerMatch = content.match(/^[-*]\s*\*\*constitution\*\*\s*:\s*(.+?)\s*$/im);
  const constitutionPointer = pointerMatch ? stripBackticks(pointerMatch[1].trim()) : null;

  const overlays = {};
  const lines = content.split(/\r?\n/);
  let inOverlayTable = false;
  let pastSeparator = false;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (/^##\s+/.test(line)) {
      inOverlayTable = /vendor\s+overlays?/i.test(line);
      pastSeparator = false;
      continue;
    }
    if (!inOverlayTable || !line.startsWith('|')) continue;
    const cells = line.replace(/^\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
    if (!pastSeparator) {
      // skip header row and the |---|---| separator row
      if (cells.every((c) => /^:?-+:?$/.test(c))) pastSeparator = true;
      continue;
    }
    const vendor = stripBackticks((cells[0] || '').toLowerCase());
    const overlay = cells[1] || '';
    if (vendor && !/^vendor$/i.test(vendor)) overlays[vendor] = overlay;
  }
  return { constitutionPointer, overlays };
}

function stripBackticks(s) {
  return (s || '').replace(/^`/, '').replace(/`$/, '').trim();
}
```

- [ ] **Step 4: Run, verify pass**

Run: `node --test tests/unit/governance.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cli/src/governance.js tests/unit/governance.test.js
git commit -m "feat(governance): parse .hopper/GOVERNANCE.md (constitution pointer + vendor overlays)"
```

---

### Task 3: `governance.js` — `loadGovernance` + constitution-text resolution (fail-fast)

**Files:**
- Modify: `cli/src/governance.js`
- Test: `tests/unit/governance.test.js`

- [ ] **Step 1: Write failing tests for loading + pointer resolution**

Append to `tests/unit/governance.test.js`:

```js
import { loadGovernance, resolveConstitutionText } from '../../cli/src/governance.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('loadGovernance returns null when GOVERNANCE.md absent', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-gov-'));
  try {
    mkdirSync(join(tmp, '.hopper'));
    assert.equal(await loadGovernance(join(tmp, '.hopper')), null);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test('resolveConstitutionText reads a project-relative pointer', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-gov-'));
  try {
    const hopperDir = join(tmp, '.hopper');
    mkdirSync(join(hopperDir, 'governance'), { recursive: true });
    writeFileSync(join(hopperDir, 'governance', 'core.md'), 'THE CONSTITUTION');
    const text = await resolveConstitutionText(hopperDir, '.hopper/governance/core.md');
    assert.equal(text, 'THE CONSTITUTION');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test('resolveConstitutionText throws a clear error on an unresolvable pointer', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-gov-'));
  try {
    const hopperDir = join(tmp, '.hopper');
    mkdirSync(hopperDir);
    await assert.rejects(
      () => resolveConstitutionText(hopperDir, '.hopper/governance/missing.md'),
      /constitution pointer.*missing\.md/i,
    );
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});
```

- [ ] **Step 2: Run, verify failure**

Run: `node --test tests/unit/governance.test.js`
Expected: FAIL — `loadGovernance` / `resolveConstitutionText` not exported.

- [ ] **Step 3: Implement loader + resolver**

Append to `cli/src/governance.js`:

```js
/**
 * Load and parse .hopper/GOVERNANCE.md. Returns null if the file does not exist.
 * @param {string} hopperDir
 * @returns {Promise<{ constitutionPointer: string|null, overlays: Record<string,string> }|null>}
 */
export async function loadGovernance(hopperDir) {
  const path = join(hopperDir, 'GOVERNANCE.md');
  try {
    return parseGovernanceContent(await readFile(path, 'utf-8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * Resolve the constitution text from a pointer. Relative pointers resolve
 * against the project root that owns .hopper/ (dirname of hopperDir). Throws a
 * clear, actionable error when the pointer cannot be read — never silently
 * dispatches ungoverned.
 * @param {string} hopperDir
 * @param {string} pointer
 * @returns {Promise<string>}
 */
export async function resolveConstitutionText(hopperDir, pointer) {
  const projectRoot = resolve(hopperDir, '..');
  const target = isAbsolute(pointer) ? pointer : resolve(projectRoot, pointer);
  try {
    return await readFile(target, 'utf-8');
  } catch (err) {
    throw new Error(
      `governance enabled but constitution pointer '${pointer}' is unresolvable (${target}). ` +
      `Run \`hopper-dispatch --init-governance --from <fable>/prompts/portable-agent-core.md\` ` +
      `to vendor a copy, or fix the Constitution line in .hopper/GOVERNANCE.md.`
    );
  }
}
```

- [ ] **Step 4: Run, verify pass**

Run: `node --test tests/unit/governance.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cli/src/governance.js tests/unit/governance.test.js
git commit -m "feat(governance): loadGovernance + fail-fast constitution-text resolution"
```

---

### Task 4: `queue.js` + `types.js` — optional `Govern` column

**Files:**
- Modify: `cli/src/queue.js` (`mapColumns`, `extractRow`)
- Modify: `cli/src/types.js` (TaskRow typedef)
- Test: `tests/unit/queue.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/queue.test.js` (match existing import of `parseQueueContent`):

```js
test('parseQueueContent reads an optional Govern column', () => {
  const md = `
| ID | Task-type | Status | Govern |
|----|-----------|--------|--------|
| T-1 | code-impl | pending | off |
| T-2 | code-impl | pending |  |
`;
  const rows = parseQueueContent(md);
  assert.equal(rows[0].govern, 'off');
  assert.equal(rows[1].govern, null);
});

test('parseQueueContent leaves govern null when the column is absent', () => {
  const md = `
| ID | Task-type | Status |
|----|-----------|--------|
| T-1 | code-impl | pending |
`;
  assert.equal(parseQueueContent(md)[0].govern, null);
});
```

- [ ] **Step 2: Run, verify failure**

Run: `node --test tests/unit/queue.test.js`
Expected: FAIL — `row.govern` is `undefined`, not `'off'`/`null`.

- [ ] **Step 3: Add the column to the parser**

In `cli/src/queue.js`, inside `mapColumns`'s returned object, add after the `vendorIdx` line:

```js
    governIdx: indexOfAny(lower, ['govern', 'governance']),
```

In `extractRow`, add before the `return` statement:

```js
  const govern = map.governIdx != null && cells[map.governIdx] ? stripBackticks(cells[map.governIdx]) : null;
```

And extend the returned object to include `govern`:

```js
  return { id, taskType: effectiveType, status: finalStatus, depends, priority, brief, vendor, govern };
```

- [ ] **Step 4: Update the TaskRow typedef**

In `cli/src/types.js`, add to the TaskRow typedef after the `vendor` property line:

```js
 * @property {string|null} [govern]   Optional per-row governance override: 'off' disables the governance preamble for this task (null = use .hopper/GOVERNANCE.md default)
```

- [ ] **Step 5: Run, verify pass**

Run: `node --test tests/unit/queue.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add cli/src/queue.js cli/src/types.js tests/unit/queue.test.js
git commit -m "feat(governance): optional Govern column in queue.md (per-task override)"
```

---

### Task 5: `governance.js` — `resolveGovernance` (vendor-keyed, honors `Govern: off`)

**Files:**
- Modify: `cli/src/governance.js`
- Test: `tests/unit/governance.test.js`

- [ ] **Step 1: Write failing tests**

Append to `tests/unit/governance.test.js`:

```js
import { resolveGovernance } from '../../cli/src/governance.js';

function writeGov(hopperDir, body) {
  writeFileSync(join(hopperDir, 'GOVERNANCE.md'), body);
}

test('resolveGovernance returns null when GOVERNANCE.md absent', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-gov-'));
  try {
    const hopperDir = join(tmp, '.hopper'); mkdirSync(hopperDir);
    const g = await resolveGovernance({ hopperDir, vendor: 'codex', task: { govern: null } });
    assert.equal(g, null);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test('resolveGovernance returns constitution + vendor overlay', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-gov-'));
  try {
    const hopperDir = join(tmp, '.hopper');
    mkdirSync(join(hopperDir, 'governance'), { recursive: true });
    writeFileSync(join(hopperDir, 'governance', 'core.md'), 'CORE');
    writeGov(hopperDir, `- **Constitution**: .hopper/governance/core.md

## Vendor overlays

| Vendor | Overlay |
|--------|---------|
| codex | CODEX OVERLAY |
`);
    const g = await resolveGovernance({ hopperDir, vendor: 'codex', task: { govern: null } });
    assert.equal(g.constitution, 'CORE');
    assert.equal(g.overlay, 'CODEX OVERLAY');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test('resolveGovernance honors Govern: off per task', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-gov-'));
  try {
    const hopperDir = join(tmp, '.hopper');
    mkdirSync(join(hopperDir, 'governance'), { recursive: true });
    writeFileSync(join(hopperDir, 'governance', 'core.md'), 'CORE');
    writeGov(hopperDir, '- **Constitution**: .hopper/governance/core.md\n');
    const g = await resolveGovernance({ hopperDir, vendor: 'codex', task: { govern: 'off' } });
    assert.equal(g, null);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test('resolveGovernance gives constitution-only when vendor has no overlay row', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-gov-'));
  try {
    const hopperDir = join(tmp, '.hopper');
    mkdirSync(join(hopperDir, 'governance'), { recursive: true });
    writeFileSync(join(hopperDir, 'governance', 'core.md'), 'CORE');
    writeGov(hopperDir, '- **Constitution**: .hopper/governance/core.md\n');
    const g = await resolveGovernance({ hopperDir, vendor: 'kimi', task: { govern: null } });
    assert.equal(g.constitution, 'CORE');
    assert.equal(g.overlay, '');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});
```

- [ ] **Step 2: Run, verify failure**

Run: `node --test tests/unit/governance.test.js`
Expected: FAIL — `resolveGovernance` not exported.

- [ ] **Step 3: Implement `resolveGovernance`**

Append to `cli/src/governance.js`:

```js
/**
 * Resolve the governance preamble for a dispatch. Returns null (no overlay) when
 * GOVERNANCE.md is absent or the task opts out with `Govern: off`. Otherwise
 * returns { constitution, overlay } keyed on the resolved vendor.
 *
 * Pure file I/O — never spawns. Called on the dispatch resolve path AFTER the
 * vendor is known and BEFORE composePrompt.
 *
 * @param {object} args
 * @param {string} args.hopperDir
 * @param {string} args.vendor
 * @param {{ govern?: string|null }} args.task
 * @returns {Promise<{ constitution: string, overlay: string }|null>}
 */
export async function resolveGovernance({ hopperDir, vendor, task }) {
  if (task && typeof task.govern === 'string' && task.govern.toLowerCase() === 'off') return null;
  const gov = await loadGovernance(hopperDir);
  if (!gov || !gov.constitutionPointer) return null;
  const constitution = await resolveConstitutionText(hopperDir, gov.constitutionPointer);
  const overlay = gov.overlays[vendor] || '';
  return { constitution, overlay };
}
```

- [ ] **Step 4: Run, verify pass**

Run: `node --test tests/unit/governance.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cli/src/governance.js tests/unit/governance.test.js
git commit -m "feat(governance): resolveGovernance keyed on vendor, honors Govern: off"
```

---

### Task 6: Wire governance into `resolveDispatch` (no new spawn)

**Files:**
- Modify: `cli/src/dispatch.js` (`resolveDispatch`)
- Test: `tests/unit/dispatch-governance.test.js` (new)
- Test: `tests/unit/subprocess-spawn-count.test.js` (confirm unchanged)

- [ ] **Step 1: Write the failing integration test**

Create `tests/unit/dispatch-governance.test.js`:

```js
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { resolveDispatch } from '../../cli/src/dispatch.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function scaffoldMinimal(root) {
  const hopperDir = join(root, '.hopper');
  mkdirSync(join(hopperDir, 'tasks'), { recursive: true });
  mkdirSync(join(hopperDir, 'handoffs'), { recursive: true });
  writeFileSync(join(hopperDir, 'queue.md'), `## Tasks

| ID | Task-type | Status | Brief |
|----|-----------|--------|-------|
| T-1 | code-impl | pending | do it |
`);
  writeFileSync(join(hopperDir, 'AGENTS.md'), `## Task-type → vendor default preference

| Task-type | Default vendor | Why |
|---|---|---|
| code-impl | codex | x |
`);
  writeFileSync(join(hopperDir, 'tasks', 'code-impl.md'), '# Frame\nImplement.');
  writeFileSync(join(hopperDir, 'handoffs', 'leader-tasklist.md'), '## T-1\nSpec body.');
  return hopperDir;
}

test('resolveDispatch injects the constitution when GOVERNANCE.md present', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-disp-'));
  try {
    const hopperDir = scaffoldMinimal(tmp);
    mkdirSync(join(hopperDir, 'governance'), { recursive: true });
    writeFileSync(join(hopperDir, 'governance', 'core.md'), 'GOVERNANCE CONSTITUTION');
    writeFileSync(join(hopperDir, 'GOVERNANCE.md'), '- **Constitution**: .hopper/governance/core.md\n');
    const r = await resolveDispatch({ hopperDir, taskId: 'T-1' });
    assert.ok(r.composedPrompt.startsWith('GOVERNANCE CONSTITUTION'),
      `expected constitution prefix, got: ${r.composedPrompt.slice(0, 40)}`);
    assert.match(r.composedPrompt, /## Task spec/);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test('resolveDispatch composes without governance when GOVERNANCE.md absent', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-disp-'));
  try {
    const hopperDir = scaffoldMinimal(tmp);
    const r = await resolveDispatch({ hopperDir, taskId: 'T-1' });
    assert.ok(r.composedPrompt.startsWith('# Frame'),
      `expected frame prefix, got: ${r.composedPrompt.slice(0, 20)}`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});
```

- [ ] **Step 2: Run, verify the governance test fails**

Run: `node --test tests/unit/dispatch-governance.test.js`
Expected: the "absent" test PASSES; the "present" test FAILS (prompt starts with `# Frame`, not the constitution).

- [ ] **Step 3: Wire the resolver into `resolveDispatch`**

In `cli/src/dispatch.js`, add to the imports at the top:

```js
import { resolveGovernance } from './governance.js';
```

In `resolveDispatch`, replace step 5 (the `composePrompt` line) with:

```js
  // 5. Resolve optional governance overlay (keyed on the resolved vendor) and
  // compose. resolveGovernance is pure file I/O — no subprocess (spec §3 #4).
  const governance = await resolveGovernance({ hopperDir, vendor, task });
  const composedPrompt = composePrompt(frame, taskSpec, { governance });
```

- [ ] **Step 4: Run governance + spawn-count tests, verify pass**

Run: `node --test tests/unit/dispatch-governance.test.js tests/unit/subprocess-spawn-count.test.js`
Expected: PASS (governance injected; spawn count unchanged — resolveGovernance adds no spawn).

- [ ] **Step 5: Run the full unit suite**

Run: `node --test tests/unit/*.test.js`
Expected: PASS (no regressions).

- [ ] **Step 6: Commit**

```bash
git add cli/src/dispatch.js tests/unit/dispatch-governance.test.js
git commit -m "feat(governance): inject governance preamble at resolveDispatch (no new spawn)"
```

---

### Task 7: `--init-governance` command + scaffold (opt-in, generated)

**Files:**
- Modify: `cli/src/scaffold.js` (add `buildGovernanceMarkdown`, `scaffoldGovernance`)
- Modify: `cli/bin/hopper-dispatch` (add `--init-governance` handling + usage line)
- Test: `tests/unit/scaffold-governance.test.js` (new)

- [ ] **Step 1: Write the failing scaffold tests**

Create `tests/unit/scaffold-governance.test.js`:

```js
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { buildGovernanceMarkdown, scaffoldGovernance } from '../../cli/src/scaffold.js';
import { mkdtempSync, writeFileSync, existsSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('buildGovernanceMarkdown lists every registered adapter as an overlay row', () => {
  const md = buildGovernanceMarkdown();
  assert.match(md, /\*\*Constitution\*\*/);
  assert.match(md, /## Vendor overlays/);
  for (const v of ['codex', 'kimi', 'opencode', 'grok']) {
    assert.match(md, new RegExp(`\\|\\s*${v}\\s*\\|`));
  }
});

test('scaffoldGovernance writes GOVERNANCE.md and vendors the constitution with --from', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-initgov-'));
  try {
    const hopperDir = join(tmp, '.hopper'); mkdirSync(hopperDir);
    const src = join(tmp, 'core-src.md');
    writeFileSync(src, 'UPSTREAM CORE');
    const res = scaffoldGovernance(hopperDir, { from: src });
    assert.ok(existsSync(join(hopperDir, 'GOVERNANCE.md')));
    const vendored = join(hopperDir, 'governance', 'portable-agent-core.md');
    assert.ok(existsSync(vendored));
    assert.match(readFileSync(vendored, 'utf-8'), /UPSTREAM CORE/);
    assert.match(readFileSync(vendored, 'utf-8'), /provenance/i);
    assert.match(readFileSync(join(hopperDir, 'GOVERNANCE.md'), 'utf-8'),
      /Constitution\*\*:\s*\.hopper\/governance\/portable-agent-core\.md/);
    assert.ok(res.written.length >= 1);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test('scaffoldGovernance refuses to overwrite without force', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-initgov-'));
  try {
    const hopperDir = join(tmp, '.hopper'); mkdirSync(hopperDir);
    writeFileSync(join(hopperDir, 'GOVERNANCE.md'), 'existing');
    assert.throws(() => scaffoldGovernance(hopperDir, {}), /exist/i);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});
```

- [ ] **Step 2: Run, verify failure**

Run: `node --test tests/unit/scaffold-governance.test.js`
Expected: FAIL — `buildGovernanceMarkdown` / `scaffoldGovernance` not exported.

- [ ] **Step 3: Implement the scaffold helpers**

In `cli/src/scaffold.js`, add `copyFileSync, readFileSync` to the `node:fs` import, add `import { listAdapters } from './vendors/index.js';`, and append:

```js
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
```

- [ ] **Step 4: Wire the CLI command**

In `cli/bin/hopper-dispatch`, add to the imports from `../src/scaffold.js`:

```js
import { scaffoldHopper, scaffoldGovernance } from '../src/scaffold.js';
```

Add a usage line in `printUsage()` after the `--init-tasks` line:

```js
  console.log('  hopper-dispatch --init-governance [--from <core>] [--force]  Seed .hopper/GOVERNANCE.md (opt-in prompt overlay)');
```

Add `'--init-governance'` to the `META_FLAGS` set in `parseDispatchArgs`. Then, in `main()`, immediately after the `--init-tasks` block (it must run before the `findHopperDir` gate is required — governance seeds into an existing `.hopper/`, so resolve it first):

```js
  if (args.includes('--init-governance')) {
    const fromIdx = args.indexOf('--from');
    const from = fromIdx !== -1 && args[fromIdx + 1] && !args[fromIdx + 1].startsWith('-') ? args[fromIdx + 1] : null;
    const govHopperDir = findHopperDir();
    if (!govHopperDir) {
      console.error('Error: no .hopper/ directory found. Run --init-tasks first.');
      process.exit(1);
    }
    try {
      const res = scaffoldGovernance(govHopperDir, { from, force: args.includes('--force') });
      console.log(`hopper-dispatch v${VERSION} — governance seeded`);
      for (const p of res.written) console.log(`  (written) ${p}`);
      if (!from) {
        console.log('\nNote: no --from given. Set the Constitution pointer in .hopper/GOVERNANCE.md,');
        console.log('or re-run with --from <fable>/prompts/portable-agent-core.md to vendor a copy.');
      }
    } catch (err) {
      if (err.code === 'EHOPPEREXISTS') {
        console.error(`Error: ${err.message}`);
        process.exit(3);
      }
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
    return;
  }
```

Also add `--from` to `ALLOWED_DISPATCH_VALUE_FLAGS` is NOT needed (this command is handled before `parseDispatchArgs`); `--from` is consumed inline above. Confirm `--init-governance` and `--from` never reach `parseDispatchArgs` by returning early.

- [ ] **Step 5: Run scaffold tests + a manual smoke**

Run: `node --test tests/unit/scaffold-governance.test.js`
Expected: PASS.

Run: `node cli/bin/hopper-dispatch --help`
Expected: usage includes the `--init-governance` line.

- [ ] **Step 6: Commit**

```bash
git add cli/src/scaffold.js cli/bin/hopper-dispatch tests/unit/scaffold-governance.test.js
git commit -m "feat(governance): hopper-dispatch --init-governance seeds GOVERNANCE.md (opt-in)"
```

---

### Task 8: Document the governance overlay in hopper's README

**Files:**
- Modify: `README.md` (add a Governance section after "Core Skills")

- [ ] **Step 1: Add the Governance section**

Insert into `README.md` after the Core Skills table:

```markdown
## Governance overlay (opt-in)

By default hopper dispatches a task-shape frame + spec and isolates the vendor
from host config. If you also want every dispatched vendor to follow a shared
behavioral constitution (e.g. fable's portable core), opt in:

```bash
hopper-dispatch --init-governance --from /path/to/fable/prompts/portable-agent-core.md
```

This writes `.hopper/GOVERNANCE.md` (a constitution pointer + a per-vendor overlay
table) and vendors a stamped copy of the constitution under `.hopper/governance/`.
From then on, `hopper-dispatch` prepends `constitution + per-vendor overlay` onto
the composed prompt — keyed on the same vendor the router already resolves.

- Disable globally: delete `.hopper/GOVERNANCE.md`.
- Disable per task: add a `Govern` column to `queue.md` and set it to `off`.
- The constitution stays owned upstream (fable); hopper carries a stamped copy.

This is a prompt-level behavioral contract; it does not change sandbox,
timeout, routing, or the one-spawn-no-retry guarantee.
```

- [ ] **Step 2: Verify it renders / link sanity**

Run: `node cli/bin/hopper-dispatch --help`
Expected: still works (no code change); README section present.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(governance): document the opt-in GOVERNANCE.md overlay"
```

---

## Self-Review

- **Spec coverage:** §3.1 GOVERNANCE.md (Tasks 2,7) · §3.2 resolveGovernance (Task 5) · §3.3 composePrompt layering (Task 1) · §3.4 dispatch wiring + no-spawn (Task 6) · §3.5 --init-governance + vendored stamped copy + fail-fast (Tasks 3,7) · §3.6 boundaries: anti-persona stays frame-scoped (untouched), no spawn (Task 6 asserts spawn-count) · Govern column (Task 4) · README (Task 8). All covered.
- **Placeholder scan:** none — every step has concrete code/commands.
- **Type consistency:** `resolveGovernance` returns `{constitution, overlay}` everywhere; `composePrompt(frame, spec, {governance})` signature consistent across Tasks 1 and 6; `scaffoldGovernance(hopperDir, {from, force})` and `buildGovernanceMarkdown()` consistent across Tasks 7's test and impl; `parseGovernanceContent` returns `{constitutionPointer, overlays}` in Tasks 2/3/5.
- **Note for the implementer:** background dispatch (`runBackgroundDispatch`) calls `resolveDispatch`, so governance flows to background jobs automatically — no separate change needed. `--resolve` prints the governed prompt under `HOPPER_DEBUG`, useful for eyeballing the overlay.
