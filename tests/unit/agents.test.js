// Unit tests for agents.js (T-PLUGIN-04)
// Anchor: tests/unit/agents.test.js

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { parseAgentsContent, resolveVendor } from '../../cli/src/agents.js';

const SAMPLE_AGENTS = `
# hopper-plugin Agent Instances

## Active Agent Instances

| Nickname | UUID | Vendor | Default invocation |
|----------|------|--------|---------------------|
| \`codex-builder\` | \`uuid-1\` | codex | \`codex exec ...\` |
| \`kimi-builder\` | \`uuid-2\` | kimi | \`kimi -p ...\` |
| \`opencode-builder\` | \`uuid-3\` | opencode | \`opencode run ...\` |
| \`agy-builder\` | \`uuid-4\` | agy | \`agy -p ...\` |

## Task-type → vendor default preference

| Task-type | Default vendor | Why |
|-----------|----------------|-----|
| \`spec-write\` | codex-builder | High reasoning |
| \`code-impl\` | kimi-builder | Cheap tier |
| \`spec-blindspot-hunt\` | codex-builder | High reasoning |
`;

test('parseAgentsContent extracts agent bindings', () => {
  const { agents } = parseAgentsContent(SAMPLE_AGENTS);
  assert.equal(agents.length, 4);
  assert.equal(agents[0].nickname, 'codex-builder');
  assert.equal(agents[0].vendor, 'codex');
  assert.equal(agents[0].uuid, 'uuid-1');
  assert.equal(agents[3].vendor, 'agy');
});

test('parseAgentsContent extracts task-type preferences', () => {
  const { preferences } = parseAgentsContent(SAMPLE_AGENTS);
  assert.equal(preferences['spec-write'], 'codex-builder');
  assert.equal(preferences['code-impl'], 'kimi-builder');
});

test('resolveVendor uses per-row Vendor override if set', () => {
  const { agents, preferences } = parseAgentsContent(SAMPLE_AGENTS);
  const task = {
    id: 'T-X',
    taskType: 'code-impl',
    status: 'pending',
    depends: [],
    priority: 'normal',
    brief: '',
    vendor: 'opencode', // override
  };
  assert.equal(resolveVendor(task, { agents, preferences }), 'opencode');
});

test('resolveVendor looks up task-type preference -> nickname -> vendor', () => {
  const { agents, preferences } = parseAgentsContent(SAMPLE_AGENTS);
  const task = {
    id: 'T-X',
    taskType: 'code-impl',
    status: 'pending',
    depends: [],
    priority: 'normal',
    brief: '',
    vendor: null,
  };
  // code-impl → kimi-builder → kimi
  assert.equal(resolveVendor(task, { agents, preferences }), 'kimi');
});

test('resolveVendor falls back to taskTypePref array', () => {
  const { agents } = parseAgentsContent(SAMPLE_AGENTS);
  // No preference table; agent has pref array
  const agentsWithPref = agents.map((a) => ({
    ...a,
    taskTypePref: a.nickname === 'codex-builder' ? ['spec-write'] : [],
  }));
  const task = {
    id: 'T-X',
    taskType: 'spec-write',
    status: 'pending',
    depends: [],
    priority: 'normal',
    brief: '',
    vendor: null,
  };
  assert.equal(resolveVendor(task, { agents: agentsWithPref, preferences: {} }), 'codex');
});

test('resolveVendor throws when no resolution available', () => {
  const task = {
    id: 'T-X',
    taskType: 'unknown-type',
    status: 'pending',
    depends: [],
    priority: 'normal',
    brief: '',
    vendor: null,
  };
  assert.throws(
    () => resolveVendor(task, { agents: [], preferences: {} }),
    /No vendor binding for task-type 'unknown-type'/,
  );
});

test('resolveVendor is deterministic (same input → same output, no state)', () => {
  // Per codex F1: no round-robin / no memoization across calls
  const data = parseAgentsContent(SAMPLE_AGENTS);
  const task = {
    id: 'T-X',
    taskType: 'code-impl',
    status: 'pending',
    depends: [],
    priority: 'normal',
    brief: '',
    vendor: null,
  };
  // Call 10 times — same answer every time
  const results = [];
  for (let i = 0; i < 10; i++) {
    results.push(resolveVendor(task, data));
  }
  const unique = [...new Set(results)];
  assert.equal(unique.length, 1, 'resolveVendor must be deterministic; got varied results: ' + JSON.stringify(unique));
  assert.equal(unique[0], 'kimi');
});
