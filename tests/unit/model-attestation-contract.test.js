// Strict selector classification and runtime model-attestation contract.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  parseStrictProviderModel,
  compareRuntimeIdentity,
  validateSelectorMetadataEnvelope,
  classifyEffectiveSelector,
  resolveAttestation,
  chooseDiagnosticCode,
  DIAGNOSTIC_PRECEDENCE,
} from '../../cli/src/model-attestation.js';

const NOW = '2026-07-21T12:00:00.000Z';
const CLAUDE_BINDING = Object.freeze({
  vendor: 'claude', adapterId: 'claude', adapterVersion: '2026.07.21',
  catalogId: 'claude-selectors', catalogVersion: '1',
});
const OPENCODE_BINDING = Object.freeze({
  vendor: 'opencode', adapterId: 'opencode', adapterVersion: '2026.07.21',
  catalogId: 'opencode-selectors', catalogVersion: '1',
});

function selectorMetadata({
  vendor = 'claude',
  selectors,
  sourceKind = 'capabilities-cache',
  schemaVersion = 1,
  adapterVersion = '2026.07.21',
  catalogVersion = '1',
  expiresAt = '2026-07-22T00:00:00.000Z',
  validity = 'accepted',
} = {}) {
  const structured = vendor === 'opencode';
  return {
    schema_version: schemaVersion,
    vendor,
    adapter: {
      id: vendor,
      version: adapterVersion,
      identity_declaration: structured
        ? {
          identity_kind: 'provider-model',
          provider_registry: ['openai', 'anthropic'],
          provider_sentinels: ['dead', 'unavailable'],
        }
        : {
          identity_kind: 'opaque-id', provider_registry: [], provider_sentinels: [],
        },
    },
    catalog: { id: `${vendor}-selectors`, version: catalogVersion },
    source_kind: sourceKind,
    generated_at: '2026-07-21T00:00:00.000Z',
    expires_at: expiresAt,
    validity,
    selectors: selectors || (structured
      ? [{
        literal: 'openai/gpt-5', kind: 'concrete',
        expected_runtime_identity: { identity_kind: 'provider-model', provider: 'openai', model: 'gpt-5' },
      }]
      : [
        { literal: 'fable', kind: 'alias' },
        { literal: 'claude-sonnet-4-6', kind: 'concrete', expected_runtime_identity: { identity_kind: 'opaque-id', id: 'claude-sonnet-4-6' } },
      ]),
  };
}

function classify(effectiveSelector, selectorMetadataValue, binding = CLAUDE_BINDING) {
  return classifyEffectiveSelector({
    effectiveSelector,
    binding,
    selectorMetadata: { capabilitiesCache: selectorMetadataValue },
    now: NOW,
  });
}

function resolve({
  effectiveSelector,
  metadata = selectorMetadata(),
  binding = CLAUDE_BINDING,
  observedModels = [],
  catalogSourceKind = 'static',
  runtimeDiagnosticCode,
} = {}) {
  return resolveAttestation({
    effectiveSelector,
    effectiveSelectorSource: effectiveSelector === null ? 'vendor-default' : 'user-argv',
    binding,
    selectorMetadata: { capabilitiesCache: metadata },
    observedModels,
    catalogSourceKind,
    runtimeDiagnosticCode,
    now: NOW,
  });
}

test('parseStrictProviderModel accepts exactly one non-empty provider/model pair', () => {
  assert.deepEqual(parseStrictProviderModel('openai/gpt-5'), {
    provider: 'openai',
    model: 'gpt-5',
  });
  for (const value of ['gpt-5', 'openai/gpt/5', '/gpt-5', 'openai/', '']) {
    assert.equal(parseStrictProviderModel(value), null, value);
  }
});

test('strict runtime comparison never reuses selector-validation normalization', () => {
  assert.equal(compareRuntimeIdentity('claude', { identity_kind: 'opaque-id', id: 'claude-sonnet-4-6' }, 'claude-sonnet-4-6'), 'match');
  assert.equal(compareRuntimeIdentity('claude', { identity_kind: 'opaque-id', id: 'claude-sonnet-4-6' }, 'anthropic/claude-sonnet-4-6'), 'non-match', 'opaque identities are whole literals');
  assert.equal(compareRuntimeIdentity('claude', { identity_kind: 'opaque-id', id: 'claude-sonnet-4-6' }, 'claude_sonnet_4_6'), 'non-match', 'separators are not collapsed');
  assert.equal(compareRuntimeIdentity('claude', { identity_kind: 'provider-model', provider: 'anthropic', model: 'claude-sonnet-4-6' }, 'anthropic/claude-sonnet-4-6'), 'uncomparable', 'Claude cannot use a structured identity');

  const expected = { identity_kind: 'provider-model', provider: 'openai', model: 'gpt-5' };
  assert.equal(compareRuntimeIdentity('opencode', expected, 'openai/gpt-5'), 'match');
  assert.equal(compareRuntimeIdentity('opencode', expected, 'anthropic/gpt-5'), 'non-match', 'provider is part of the identity');
  assert.equal(compareRuntimeIdentity('opencode', expected, 'gpt-5'), 'uncomparable', 'bare vs qualified is never a non-match');
  assert.equal(compareRuntimeIdentity('opencode', expected, 'namespace/openai/gpt-5'), 'uncomparable', 'an extra namespace is never tail-matched');
  assert.equal(compareRuntimeIdentity('opencode', { identity_kind: 'opaque-id', id: 'openai/gpt-5' }, 'openai/gpt-5'), 'uncomparable', 'OpenCode cannot use an opaque identity');
});

test('schema v1 metadata validates an exact live binding and literal selector records', () => {
  const envelope = selectorMetadata();
  const validation = validateSelectorMetadataEnvelope(envelope, CLAUDE_BINDING, NOW);
  assert.equal(validation.valid, true);
  assert.equal(validation.diagnosticCode, 'none');

  assert.equal(classify('fable', envelope).selectorKind, 'alias');
  assert.equal(classify('claude-sonnet-4-6', envelope).selectorKind, 'concrete');
  assert.equal(classify('Fable', envelope).selectorKind, 'unknown', 'literal matching is exact and case-sensitive');
});

test('only exact metadata-enumerated Claude literals classify as aliases', () => {
  const aliases = ['fable', 'sonnet', 'sonnet[1m]', 'best', 'default', 'opusplan'];
  const envelope = selectorMetadata({ selectors: aliases.map((literal) => ({ literal, kind: 'alias' })) });
  for (const literal of aliases) assert.equal(classify(literal, envelope).selectorKind, 'alias', literal);
  assert.equal(classify('unlisted[N_unit]', envelope).selectorKind, 'unknown');
  assert.equal(classify('sonnet[2m]', envelope).selectorKind, 'unknown');
});

test('effective null derives auto before metadata lookup and never fabricates a runtime proof', () => {
  const result = resolve({ effectiveSelector: null, metadata: null, observedModels: ['claude-sonnet-4-6'] });
  assert.equal(result.selectorKind, 'auto');
  assert.equal(result.resolutionStatus, 'unverified');
  assert.equal(result.resolutionDetail, 'no-effective-selector');
});

test('selector metadata rejects unsupported schema, binding, validity, and source failures with closed diagnostics', () => {
  const cases = [
    [null, 'selector-metadata-cache-missing'],
    [selectorMetadata({ schemaVersion: 2 }), 'selector-metadata-cache-schema-unsupported'],
    [selectorMetadata({ adapterVersion: 'other' }), 'selector-metadata-cache-adapter-mismatch'],
    [selectorMetadata({ catalogVersion: 'other' }), 'selector-metadata-cache-adapter-mismatch'],
    [selectorMetadata({ expiresAt: '2026-07-21T11:59:59.000Z' }), 'selector-metadata-cache-expired'],
    [selectorMetadata({ validity: 'rejected' }), 'selector-metadata-cache-expired'],
    [selectorMetadata({ sourceKind: 'network' }), 'metadata-envelope-malformed'],
  ];
  for (const [envelope, diagnosticCode] of cases) {
    const result = classify('fable', envelope);
    assert.equal(result.selectorKind, 'unknown', diagnosticCode);
    assert.equal(result.diagnosticCode, diagnosticCode);
  }
});

test('metadata envelope rejects auto records, duplicate literals, and invalid expected identity unions', () => {
  const declaredDeadProvider = selectorMetadata({
    vendor: 'opencode',
    selectors: [{ literal: 'dead/gpt-5', kind: 'concrete', expected_runtime_identity: { identity_kind: 'provider-model', provider: 'dead', model: 'gpt-5' } }],
  });
  declaredDeadProvider.adapter.identity_declaration.provider_registry = ['dead'];
  declaredDeadProvider.adapter.identity_declaration.provider_sentinels = [];
  const invalidEnvelopes = [
    selectorMetadata({ selectors: [{ literal: 'auto', kind: 'auto' }] }),
    selectorMetadata({ selectors: [{ literal: 'fable', kind: 'alias' }, { literal: 'fable', kind: 'alias' }] }),
    selectorMetadata({ selectors: [{ literal: 'fable', kind: 'alias', expected_runtime_identity: { identity_kind: 'opaque-id', id: 'x' } }] }),
    selectorMetadata({ selectors: [{ literal: 'x', kind: 'concrete' }] }),
    selectorMetadata({ selectors: [{ literal: 'x', kind: 'concrete', expected_runtime_identity: { identity_kind: 'opaque-id', id: 'x', model: 'extra' } }] }),
    selectorMetadata({ selectors: [{ literal: 'claude-request-alias', kind: 'concrete', expected_runtime_identity: { identity_kind: 'opaque-id', id: 'claude-sonnet-4-6' } }] }),
    selectorMetadata({ selectors: [{ literal: 'x', kind: 'concrete', expected_runtime_identity: { identity_kind: 'provider-model', provider: 'openai', model: 'x' } }] }),
    selectorMetadata({
      vendor: 'opencode',
      selectors: [{ literal: 'openai/gpt-5', kind: 'concrete', expected_runtime_identity: { identity_kind: 'opaque-id', id: 'openai/gpt-5' } }],
    }),
    selectorMetadata({
      vendor: 'opencode',
      selectors: [{ literal: 'dead/gpt-5', kind: 'concrete', expected_runtime_identity: { identity_kind: 'provider-model', provider: 'dead', model: 'gpt-5' } }],
    }),
    selectorMetadata({
      vendor: 'opencode',
      selectors: [{ literal: 'future/gpt-5', kind: 'concrete', expected_runtime_identity: { identity_kind: 'provider-model', provider: 'future', model: 'gpt-5' } }],
    }),
    selectorMetadata({
      vendor: 'opencode',
      selectors: [{ literal: 'openai/not-gpt-5', kind: 'concrete', expected_runtime_identity: { identity_kind: 'provider-model', provider: 'openai', model: 'gpt-5' } }],
    }),
    declaredDeadProvider,
  ];
  for (const envelope of invalidEnvelopes) {
    const binding = envelope.vendor === 'opencode' ? OPENCODE_BINDING : CLAUDE_BINDING;
    const result = classify('anything', envelope, binding);
    assert.equal(result.selectorKind, 'unknown');
    assert.equal(result.diagnosticCode, 'metadata-envelope-malformed');
  }
});

test('metadata validation permits supported-schema forward fields without interpreting them', () => {
  const envelope = selectorMetadata();
  envelope.future_field = { untrusted: 'ignored' };
  envelope.selectors[0].future_record_field = true;
  assert.equal(validateSelectorMetadataEnvelope(envelope, CLAUDE_BINDING, NOW).valid, true);
});

test('concrete resolution is exact on one strict match and mismatch only for all comparable non-matches', () => {
  const exact = resolve({ effectiveSelector: 'claude-sonnet-4-6', observedModels: ['other', 'claude-sonnet-4-6'] });
  assert.equal(exact.resolutionStatus, 'exact');
  assert.equal(exact.resolutionDetail, 'concrete-runtime-exact');

  const mismatch = resolve({ effectiveSelector: 'claude-sonnet-4-6', observedModels: ['other-one', 'other-two'] });
  assert.equal(mismatch.resolutionStatus, 'mismatch');
  assert.equal(mismatch.resolutionDetail, 'concrete-runtime-mismatch');

  const structuredMetadata = selectorMetadata({ vendor: 'opencode' });
  const structuredExact = resolve({
    effectiveSelector: 'openai/gpt-5', metadata: structuredMetadata, binding: OPENCODE_BINDING,
    observedModels: ['anthropic/claude', 'openai/gpt-5'],
  });
  assert.equal(structuredExact.resolutionStatus, 'exact');
  const structuredMismatch = resolve({
    effectiveSelector: 'openai/gpt-5', metadata: structuredMetadata, binding: OPENCODE_BINDING,
    observedModels: ['anthropic/gpt-5'],
  });
  assert.equal(structuredMismatch.resolutionStatus, 'mismatch');
});

test('ambiguous or uncomparable concrete evidence never becomes mismatch', () => {
  const structuredMetadata = selectorMetadata({ vendor: 'opencode' });
  const result = resolve({
    effectiveSelector: 'openai/gpt-5', metadata: structuredMetadata, binding: OPENCODE_BINDING,
    observedModels: ['anthropic/gpt-5', 'gpt-5'],
  });
  assert.equal(result.resolutionStatus, 'unverified');
  assert.equal(result.resolutionDetail, 'concrete-runtime-unverifiable');
});

test('alias resolution requires both a valid alias record and valid runtime evidence', () => {
  const resolved = resolve({ effectiveSelector: 'fable', observedModels: ['claude-sonnet-4-6'] });
  assert.equal(resolved.resolutionStatus, 'alias-resolved');
  assert.equal(resolved.resolutionDetail, 'alias-runtime-resolved');

  const absent = resolve({ effectiveSelector: 'fable' });
  assert.equal(absent.resolutionStatus, 'unverified');
  assert.equal(absent.resolutionDetail, 'alias-no-runtime-metadata');

  const invalidAlias = selectorMetadata({ selectors: [{ literal: 'fable', kind: 'alias', expected_runtime_identity: { identity_kind: 'opaque-id', id: 'x' } }] });
  const malformed = resolve({ effectiveSelector: 'fable', metadata: invalidAlias, observedModels: ['claude-sonnet-4-6'] });
  assert.equal(malformed.selectorKind, 'unknown');
  assert.equal(malformed.resolutionStatus, 'unverified');
  assert.equal(malformed.diagnosticCode, 'metadata-envelope-malformed');
});

test('config-only is catalog evidence only when runtime evidence is absent', () => {
  const aliasConfigOnly = resolve({ effectiveSelector: 'fable', catalogSourceKind: 'config-only' });
  assert.equal(aliasConfigOnly.resolutionStatus, 'config-only');
  assert.equal(aliasConfigOnly.resolutionDetail, 'alias-config-only-no-runtime');

  const concreteConfigOnly = resolve({ effectiveSelector: 'claude-sonnet-4-6', catalogSourceKind: 'config-only' });
  assert.equal(concreteConfigOnly.resolutionStatus, 'config-only');
  assert.equal(concreteConfigOnly.resolutionDetail, 'concrete-config-only-no-runtime');
});

test('diagnostics use the frozen cross-domain precedence', () => {
  assert.equal(DIAGNOSTIC_PRECEDENCE[0], 'runtime-model-metadata-malformed');
  assert.equal(chooseDiagnosticCode(['metadata-envelope-malformed', 'runtime-model-metadata-conflict']), 'runtime-model-metadata-conflict');
  assert.equal(chooseDiagnosticCode(['selector-metadata-cache-adapter-mismatch', 'selector-metadata-cache-schema-unsupported']), 'selector-metadata-cache-schema-unsupported');
  assert.equal(chooseDiagnosticCode(['runtime-model-metadata-absent', 'catalog-unavailable']), 'catalog-unavailable');
  assert.equal(chooseDiagnosticCode(['unknown-future-code']), 'unknown');
  assert.equal(chooseDiagnosticCode([]), 'none');
});
