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
