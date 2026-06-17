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
