// Runtime model evidence must come only from approved terminal result metadata.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { getAdapter } from '../../cli/src/vendors/index.js';

function raw(stdout, { exitCode = 0, stderr = '', timedOut = false } = {}) {
  return { exitCode, stdout, stderr, timedOut, durationMs: 25 };
}

function assertAttestation(result, { observedModels, source }) {
  assert.equal(result.status, 'success');
  assert.deepEqual(result.modelAttestation?.observedModels, observedModels);
  assert.equal(result.modelAttestation?.source, source);
  assert.match(result.modelAttestation?.observedAt || '', /^\d{4}-\d{2}-\d{2}T/);
}

test('Claude uses the first valid approved modelUsage path without merging later paths', () => {
  const result = getAdapter('claude').parseResult(raw(JSON.stringify({
    type: 'result', subtype: 'success', is_error: false, result: 'CLAUDE_ANSWER',
    modelUsage: { 'claude-opus-4-6': {}, 'claude-sonnet-4-6': {} },
    usage: { modelUsage: { 'must-not-merge': {} }, model_usage: { 'also-not-merged': {} } },
  })));

  assertAttestation(result, {
    observedModels: ['claude-opus-4-6', 'claude-sonnet-4-6'],
    source: 'claude.result.modelUsage.keys',
  });
});

test('Claude tries only the versioned fallback paths in their fixed order', () => {
  const cases = [
    [{
      type: 'result', subtype: 'success', is_error: false, text: 'SECOND', modelUsage: {},
      result: { modelUsage: { 'claude-second': {} } },
      usage: { modelUsage: { 'must-not-merge': {} } },
    }, ['claude-second'], 'claude.result.result.modelUsage.keys'],
    [{
      type: 'result', subtype: 'success', is_error: false, text: 'THIRD', modelUsage: [],
      result: { modelUsage: {} }, usage: { modelUsage: { 'claude-third': {} } },
    }, ['claude-third'], 'claude.result.usage.modelUsage.keys'],
    [{
      type: 'result', subtype: 'success', is_error: false, text: 'FOURTH', modelUsage: { '': {} },
      result: { modelUsage: [] }, usage: { modelUsage: {}, model_usage: { 'claude-fourth': {} } },
    }, ['claude-fourth'], 'claude.result.usage.model_usage.keys'],
  ];

  for (const [envelope, observedModels, source] of cases) {
    assertAttestation(getAdapter('claude').parseResult(raw(JSON.stringify(envelope))), { observedModels, source });
  }
});

test('Claude does not infer runtime models from request echoes, prose, nested entries, or nonterminal JSON', () => {
  const cases = [
    JSON.stringify({
      type: 'result', subtype: 'success', is_error: false, result: 'answer for claude-opus-4-6',
      model: 'claude-opus-4-6', usage: { model: 'claude-sonnet-4-6' },
      data: { modelUsage: { 'must-not-recurse': {} } },
    }),
    [
      JSON.stringify({ type: 'message', modelUsage: { 'must-not-use-nonterminal': {} } }),
      JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'ANSWER' }),
    ].join('\n'),
  ];

  for (const stdout of cases) {
    const result = getAdapter('claude').parseResult(raw(stdout));
    assert.equal(result.status, 'success');
    assert.equal(result.modelAttestation, undefined);
  }
});

test('Claude attaches no runtime evidence to errors or unusable terminal results', () => {
  const failed = getAdapter('claude').parseResult(raw(JSON.stringify({
    type: 'result', subtype: 'error_max_turns', is_error: true, result: '',
    modelUsage: { 'must-not-escape-failed-result': {} },
  })));
  assert.equal(failed.status, 'unknown-fail');
  assert.equal(failed.modelAttestation, undefined);
});

test('OpenCode emits one normalized provider/model only from its approved terminal result schema', () => {
  const result = getAdapter('opencode').parseResult(raw(JSON.stringify({
    type: 'result', version: 1, subtype: 'success', is_error: false, result: 'OPENCODE_ANSWER',
    providerID: 'openai', modelID: 'gpt-5',
  })));

  assertAttestation(result, {
    observedModels: ['openai/gpt-5'],
    source: 'opencode.result.providerID-modelID',
  });
});

test('OpenCode rejects partial, request-echo, and unapproved terminal model shapes', () => {
  const cases = [
    JSON.stringify({
      type: 'result', version: 2, subtype: 'success', is_error: false, result: 'UNAPPROVED_VERSION',
      providerID: 'openai', modelID: 'gpt-5',
    }),
    JSON.stringify({
      type: 'result', version: 1, subtype: 'success', is_error: false, result: 'PROVIDER_ONLY', providerID: 'openai',
    }),
    JSON.stringify({
      type: 'result', version: 1, subtype: 'success', is_error: false, result: 'MODEL_ONLY', modelID: 'gpt-5',
    }),
    JSON.stringify({
      type: 'result', version: 1, subtype: 'success', is_error: false, result: 'REQUEST_ECHO',
      request: { providerID: 'openai', modelID: 'gpt-5' },
    }),
    [
      JSON.stringify({ type: 'text', part: { text: 'TEXT_ONLY' }, providerID: 'openai', modelID: 'gpt-5' }),
      JSON.stringify({ type: 'step_finish', part: { type: 'step-finish', reason: 'stop' } }),
    ].join('\n'),
  ];

  for (const stdout of cases) {
    const result = getAdapter('opencode').parseResult(raw(stdout));
    assert.equal(result.status, 'success');
    assert.equal(result.modelAttestation, undefined);
  }
});

test('Kimi remains config-only even when its text mentions a configured model', () => {
  const result = getAdapter('kimi').parseResult(raw('KIMI_ANSWER using configured alias kimi-for-coding'));
  assert.equal(result.status, 'success');
  assert.equal(result.modelAttestation, undefined);
});
