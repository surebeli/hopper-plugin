import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readFrontmatter, writeFrontmatter } from '../../cli/src/background.js';
import { readProgressEvents } from '../../cli/src/progress.js';
import {
  buildAttestationStartupSnapshot,
  finalizeTerminalAttestation,
} from '../../cli/src/handoff-attestation.js';

const NOW = '2026-07-21T12:00:00.000Z';
const BINDING = {
  vendor: 'claude', adapterId: 'claude', adapterVersion: '2026.07.21',
  catalogId: 'claude-selectors', catalogVersion: '1',
};

function selectorMetadata() {
  return {
    capabilitiesCache: {
      schema_version: 1,
      vendor: 'claude',
      adapter: {
        id: 'claude', version: '2026.07.21',
        identity_declaration: { identity_kind: 'opaque-id', provider_registry: [], provider_sentinels: [] },
      },
      catalog: { id: 'claude-selectors', version: '1' },
      source_kind: 'capabilities-cache',
      generated_at: '2026-07-21T00:00:00.000Z',
      expires_at: '2026-07-22T00:00:00.000Z',
      validity: 'accepted',
      selectors: [{ literal: 'fable', kind: 'alias' }],
    },
  };
}

function catalog() {
  return {
    sourceKind: 'adapter-aliases',
    sourceLabel: 'claude-selector-metadata',
    observedAt: NOW,
    freshness: 'fresh',
    binaryAvailability: 'present',
    binaryBasename: 'claude',
    binding: BINDING,
  };
}

function setup(taskId = 'T-attestation') {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-attestation-'));
  const hopperDir = join(tmp, '.hopper');
  const handoffs = join(hopperDir, 'handoffs');
  mkdirSync(handoffs, { recursive: true });
  const outputMdPath = join(handoffs, `${taskId}-output.md`);
  writeFrontmatter(outputMdPath, {
    task_id: taskId,
    adapter: 'claude',
    status: 'in-progress',
    mode: 'background',
    terminal_event_emitted: false,
    _body: '# body\n',
  });
  return { tmp, hopperDir, outputMdPath, taskId };
}

function completion() {
  return {
    vendor: 'claude', status: 'done', phase: 'done', message: 'Task completed successfully.',
    source: 'runner', durationMs: 42, exitCode: 0, adapterStatus: 'success',
  };
}

function parsed() {
  return {
    modelAttestation: {
      observedModels: ['claude-opus-4-6', 'claude-opus-4-6'],
      source: 'claude.result.modelUsage.keys', observedAt: NOW,
    },
  };
}

test('startup snapshot preserves equal requested and effective selectors', () => {
  const snapshot = buildAttestationStartupSnapshot({
    requestedSelector: 'fable', effectiveSelector: 'fable', effectiveSelectorSource: 'user-argv',
    catalog: catalog(), selectorMetadata: selectorMetadata(),
  });
  assert.equal(snapshot.requestedSelector, 'fable');
  assert.equal(snapshot.effectiveSelector, 'fable');
  assert.equal(snapshot.effectiveSelectorSource, 'user-argv');
});

test('startup snapshot preserves policy replacement without mutating the request', () => {
  const snapshot = buildAttestationStartupSnapshot({
    requestedSelector: 'fable', effectiveSelector: 'claude-sonnet-4-6', effectiveSelectorSource: 'policy',
    catalog: catalog(), selectorMetadata: selectorMetadata(),
  });
  assert.equal(snapshot.requestedSelector, 'fable');
  assert.equal(snapshot.effectiveSelector, 'claude-sonnet-4-6');
  assert.equal(snapshot.effectiveSelectorSource, 'policy');
});

test('startup snapshot preserves a policy-cleared effective selector as auto', () => {
  const snapshot = buildAttestationStartupSnapshot({
    requestedSelector: 'fable', effectiveSelector: null, effectiveSelectorSource: 'policy',
    catalog: catalog(), selectorMetadata: selectorMetadata(),
  });
  assert.equal(snapshot.requestedSelector, 'fable');
  assert.equal(snapshot.effectiveSelector, null);
  assert.equal(snapshot.effectiveSelectorSource, 'policy');
});

test('same parsed result produces byte-equivalent terminal attestation fields for sync and background', () => {
  const left = setup('T-sync');
  const right = setup('T-background');
  const snapshot = buildAttestationStartupSnapshot({
    requestedSelector: 'fable', effectiveSelector: 'fable', effectiveSelectorSource: 'user-argv',
    catalog: catalog(), selectorMetadata: selectorMetadata(),
  });
  try {
    finalizeTerminalAttestation({ hopperDir: left.hopperDir, taskId: left.taskId, outputMdPath: left.outputMdPath, startupSnapshot: snapshot, parsed: parsed(), completion: completion() });
    finalizeTerminalAttestation({ hopperDir: right.hopperDir, taskId: right.taskId, outputMdPath: right.outputMdPath, startupSnapshot: snapshot, parsed: parsed(), completion: completion() });

    const fields = [
      'requested_selector', 'effective_selector', 'effective_selector_source', 'selector_kind',
      'observed_models_json', 'model_attestation_source', 'model_attestation_observed_at',
      'resolution_status', 'resolution_detail', 'diagnostic_code',
    ];
    const syncFm = readFrontmatter(left.outputMdPath);
    const backgroundFm = readFrontmatter(right.outputMdPath);
    assert.deepEqual(Object.fromEntries(fields.map((field) => [field, syncFm[field]])),
      Object.fromEntries(fields.map((field) => [field, backgroundFm[field]])));
    assert.equal(syncFm.status, 'done');
    assert.equal(syncFm.terminal_event_emitted, true);
    assert.deepEqual(JSON.parse(syncFm.observed_models_json), ['claude-opus-4-6']);

    for (const { hopperDir, taskId } of [left, right]) {
      const terminal = readProgressEvents({ hopperDir, taskId }).filter((event) => event.terminal);
      assert.equal(terminal.length, 1);
      assert.equal(terminal[0].observed_models[0], 'claude-opus-4-6');
      assert.equal(terminal[0].resolution_status, 'alias-resolved');
      assert.equal(terminal[0].requested_selector, 'fable');
    }
  } finally {
    rmSync(left.tmp, { recursive: true, force: true });
    rmSync(right.tmp, { recursive: true, force: true });
  }
});

test('finalizer consumes only parsed modelAttestation and never synthesizes observed models from request or catalog', () => {
  const state = setup('T-no-synthesis');
  const snapshot = buildAttestationStartupSnapshot({
    requestedSelector: 'fable', effectiveSelector: 'fable', effectiveSelectorSource: 'user-argv',
    catalog: { ...catalog(), models: ['claude-catalog-only'] }, selectorMetadata: selectorMetadata(),
  });
  try {
    finalizeTerminalAttestation({ hopperDir: state.hopperDir, taskId: state.taskId, outputMdPath: state.outputMdPath, startupSnapshot: snapshot, parsed: {}, completion: completion() });
    const fm = readFrontmatter(state.outputMdPath);
    assert.equal(fm.observed_models_json, '[]');
    assert.equal(fm.resolution_status, 'unverified');
    assert.equal(fm.resolution_detail, 'alias-no-runtime-metadata');
  } finally {
    rmSync(state.tmp, { recursive: true, force: true });
  }
});

test('append failure leaves frontmatter in-progress with no terminal marker', () => {
  const state = setup('T-append-failure');
  const snapshot = buildAttestationStartupSnapshot({
    requestedSelector: 'fable', effectiveSelector: 'fable', effectiveSelectorSource: 'user-argv', catalog: catalog(), selectorMetadata: selectorMetadata(),
  });
  try {
    assert.throws(() => finalizeTerminalAttestation({
      hopperDir: state.hopperDir, taskId: state.taskId, outputMdPath: state.outputMdPath, startupSnapshot: snapshot,
      parsed: parsed(), completion: completion(), io: { appendProgressEvent: () => { throw new Error('append failed'); } },
    }), /append failed/);
    const fm = readFrontmatter(state.outputMdPath);
    assert.equal(fm.status, 'in-progress');
    assert.equal(fm.terminal_event_emitted, false);
    assert.equal(readProgressEvents({ hopperDir: state.hopperDir, taskId: state.taskId }).filter((event) => event.terminal).length, 0);
  } finally {
    rmSync(state.tmp, { recursive: true, force: true });
  }
});

test('frontmatter failure after event keeps exactly one JSONL terminal and reentry refuses duplicate append', () => {
  const state = setup('T-frontmatter-failure');
  const snapshot = buildAttestationStartupSnapshot({
    requestedSelector: 'fable', effectiveSelector: 'fable', effectiveSelectorSource: 'user-argv', catalog: catalog(), selectorMetadata: selectorMetadata(),
  });
  try {
    assert.throws(() => finalizeTerminalAttestation({
      hopperDir: state.hopperDir, taskId: state.taskId, outputMdPath: state.outputMdPath, startupSnapshot: snapshot,
      parsed: parsed(), completion: completion(), io: { writeFrontmatter: () => { throw new Error('frontmatter failed'); } },
    }), /frontmatter failed/);
    assert.equal(readProgressEvents({ hopperDir: state.hopperDir, taskId: state.taskId }).filter((event) => event.terminal).length, 1);
    const retry = finalizeTerminalAttestation({ hopperDir: state.hopperDir, taskId: state.taskId, outputMdPath: state.outputMdPath, startupSnapshot: snapshot, parsed: parsed(), completion: completion() });
    assert.equal(retry.refused, true);
    assert.equal(readProgressEvents({ hopperDir: state.hopperDir, taskId: state.taskId }).filter((event) => event.terminal).length, 1);
  } finally {
    rmSync(state.tmp, { recursive: true, force: true });
  }
});

test('existing terminal event refuses reentry and terminal writers never persist finalizing or partial', () => {
  const state = setup('T-reentry');
  const snapshot = buildAttestationStartupSnapshot({
    requestedSelector: 'fable', effectiveSelector: 'fable', effectiveSelectorSource: 'user-argv', catalog: catalog(), selectorMetadata: selectorMetadata(),
  });
  try {
    const first = finalizeTerminalAttestation({ hopperDir: state.hopperDir, taskId: state.taskId, outputMdPath: state.outputMdPath, startupSnapshot: snapshot, parsed: parsed(), completion: completion() });
    assert.equal(first.refused, false);
    const retry = finalizeTerminalAttestation({ hopperDir: state.hopperDir, taskId: state.taskId, outputMdPath: state.outputMdPath, startupSnapshot: snapshot, parsed: parsed(), completion: completion() });
    assert.equal(retry.refused, true);
    assert.equal(readProgressEvents({ hopperDir: state.hopperDir, taskId: state.taskId }).filter((event) => event.terminal).length, 1);
    const raw = readFileSync(state.outputMdPath, 'utf8');
    assert.doesNotMatch(raw, /^status: (?:finalizing|partial)$/m);
  } finally {
    rmSync(state.tmp, { recursive: true, force: true });
  }
});
