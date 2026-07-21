// Strict selector classification and runtime model-attestation contract.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { chmodSync, existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  parseStrictProviderModel,
  compareRuntimeIdentity,
  validateSelectorMetadataEnvelope,
  classifyEffectiveSelector,
  resolveAttestation,
  chooseDiagnosticCode,
  DIAGNOSTIC_PRECEDENCE,
} from '../../cli/src/model-attestation.js';
import { projectInventoryEntry } from '../../cli/src/inventory-contract.js';
import { parseProbeCacheRecoveryArgs } from '../../cli/bin/hopper-dispatch';

const DISPATCH = resolvePath(fileURLToPath(import.meta.url), '..', '..', '..', 'cli', 'bin', 'hopper-dispatch');

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

test('inventory projection returns only the six closed v2 fields and never copies raw cache data', () => {
  const projected = projectInventoryEntry('claude', {
    binary_path: 'C:\\Users\\person\\AppData\\Local\\bin\\claude.exe',
    models_source: 'C:\\Users\\person\\.config\\claude.json',
    notes: ['provider/account/token/stderr should never escape'],
    sourceNote: 'https://private.example.invalid/path',
    provenance: {
      source_kind: 'adapter-aliases',
      source_label: 'raw arbitrary label is ignored',
      binary_availability: 'present',
      binary_basename: 'claude',
      provider: 'private-account',
    },
    diagnostic_code: 'none',
  }, 'ok-v1');
  assert.deepEqual(projected, {
    binaryAvailability: 'present',
    binaryBasename: 'claude',
    sourceKind: 'adapter-aliases',
    sourceLabel: 'claude-selector-metadata',
    diagnosticCode: 'none',
    diagnosticState: 'none',
  });
  assert.deepEqual(Object.keys(projected).sort(), [
    'binaryAvailability', 'binaryBasename', 'diagnosticCode', 'diagnosticState', 'sourceKind', 'sourceLabel',
  ]);
});

test('inventory projection uses the closed vendor/source allow map and normalizes future values', () => {
  assert.deepEqual(projectInventoryEntry('opencode', {
    provenance: { source_kind: 'cli-catalog', binary_availability: 'missing', binary_basename: 'opencode' },
    diagnostic_code: 'probe-failed',
  }, 'ok-v1'), {
    binaryAvailability: 'missing', binaryBasename: 'opencode', sourceKind: 'cli-catalog',
    sourceLabel: 'opencode-cli-catalog', diagnosticCode: 'probe-failed', diagnosticState: 'unavailable',
  });
  assert.deepEqual(projectInventoryEntry('kimi', {
    provenance: { source_kind: 'adapter-aliases', binary_availability: 'future', binary_basename: 'C:/unsafe/kimi.exe' },
    diagnostic_code: 'future-private-error',
  }, 'ok-v1'), {
    binaryAvailability: 'unknown', binaryBasename: 'unknown', sourceKind: 'unknown',
    sourceLabel: 'unknown', diagnosticCode: 'unknown', diagnosticState: 'unknown',
  });
});

test('inventory projection derives closed cache diagnostics from an unreadable outcome', () => {
  assert.deepEqual(projectInventoryEntry('claude', null, 'version-mismatch'), {
    binaryAvailability: 'unknown', binaryBasename: null, sourceKind: 'unknown', sourceLabel: 'unknown',
    diagnosticCode: 'inventory-cache-version-unsupported', diagnosticState: 'degraded',
  });
  assert.deepEqual(projectInventoryEntry('claude', null, 'malformed'), {
    binaryAvailability: 'unknown', binaryBasename: null, sourceKind: 'unknown', sourceLabel: 'unknown',
    diagnosticCode: 'inventory-cache-malformed', diagnosticState: 'degraded',
  });
});

test('cache recovery parser accepts only one declared probe vendor and never implies recovery', () => {
  assert.deepEqual(parseProbeCacheRecoveryArgs(['--probe', 'claude', '--recover-cache'], ['claude', 'kimi']), {
    target: 'claude', recoverCache: true, error: null,
  });
  for (const args of [
    ['--recover-cache'],
    ['--probe', '--recover-cache'],
    ['--probe', 'unknown', '--recover-cache'],
    ['--probe', 'claude', '--probe', 'kimi', '--recover-cache'],
    ['--probe', 'claude', '--recover-cache', '--deep'],
  ]) {
    const parsed = parseProbeCacheRecoveryArgs(args, ['claude', 'kimi']);
    assert.equal(parsed.recoverCache, false, args.join(' '));
    assert.match(parsed.error, /--recover-cache/, args.join(' '));
  }
  assert.deepEqual(parseProbeCacheRecoveryArgs(['--probe', 'claude'], ['claude', 'kimi']), {
    target: 'claude', recoverCache: false, error: null,
  });
});

test('public discovery commands render cache and install state through the closed inventory projection', () => {
  const root = mkdtempSync(join(tmpdir(), 'hopper-private-discovery-'));
  const cacheDir = join(root, 'cache');
  const hopperDir = join(root, 'PRIVATE_WORKSPACE_PATH', '.hopper');
  const privateBinDir = join(root, 'PRIVATE_BINARY_DIRECTORY');
  const forbidden = [
    root, 'C:\\PRIVATE_BINARY\\claude.exe', 'C:\\PRIVATE_CONFIG\\claude.json',
    'RAW_STDERR_PRIVATE', 'AUTH_PROSE_PRIVATE', 'PRIVATE_PROVIDER_NAME',
    'https://private.example.invalid/model', 'sk-private-secret-token',
    'SOURCE_NOTE_PRIVATE', 'CACHE_ERROR_PRIVATE', 'models_source', 'modelsSource', 'sourceNote', 'cacheError',
  ];
  try {
    mkdirSync(cacheDir, { recursive: true });
    mkdirSync(hopperDir, { recursive: true });
    mkdirSync(privateBinDir, { recursive: true });
    const command = process.platform === 'win32' ? 'claude.cmd' : 'claude';
    writeFileSync(join(privateBinDir, command), process.platform === 'win32' ? '@exit /b 0\r\n' : '#!/bin/sh\nexit 0\n', 'utf-8');
    writeFileSync(join(cacheDir, 'vendor-capabilities.json'), JSON.stringify({
      version: 1,
      host: 'PRIVATE_PROVIDER_NAME',
      probed_at_global: '2026-07-22T00:00:00.000Z',
      vendors: {
        claude: {
          introspection_supported: 'full', version: 'PRIVATE_PROVIDER_NAME', duration_ms: 999,
          models: ['private-cache-model'], models_source: 'C:\\PRIVATE_CONFIG\\claude.json', modelsSource: 'modelsSource',
          sourceNote: 'SOURCE_NOTE_PRIVATE https://private.example.invalid/model',
          notes: ['AUTH_PROSE_PRIVATE sk-private-secret-token'], cacheError: 'CACHE_ERROR_PRIVATE', stderr: 'RAW_STDERR_PRIVATE',
          provider: 'PRIVATE_PROVIDER_NAME', binary_path: 'C:\\PRIVATE_BINARY\\claude.exe',
          provenance: { source_kind: 'adapter-aliases', binary_availability: 'present', binary_basename: 'claude' },
          diagnostic_code: 'none',
        },
      },
    }), 'utf-8');

    for (const args of [['--models', 'claude'], ['--capabilities', 'claude'], ['--setup', 'claude'], ['--check', 'claude']]) {
      const pathValue = `${privateBinDir}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH || process.env.Path || ''}`;
      const result = spawnSync(process.execPath, [DISPATCH, ...args], {
        encoding: 'utf-8',
        env: { ...process.env, HOPPER_CACHE_DIR: cacheDir, HOPPER_DIR: hopperDir, PATH: pathValue, Path: pathValue },
      });
      assert.equal(result.status, 0, `${args.join(' ')}\n${result.stderr}`);
      const output = `${result.stdout}\n${result.stderr}`;
      for (const value of forbidden) assert.ok(!output.includes(value), `${args.join(' ')} leaked ${value}`);
      assert.match(output, /binaryAvailability=/, `${args.join(' ')} must render safe binary availability`);
      assert.match(output, /binaryBasename=claude/, `${args.join(' ')} must render a validated basename only`);
      assert.match(output, /sourceKind=/, `${args.join(' ')} must render a closed source kind`);
      assert.match(output, /sourceLabel=/, `${args.join(' ')} must render a closed source label`);
      assert.match(output, /diagnosticCode=/, `${args.join(' ')} must render a closed diagnostic code`);
      assert.match(output, /diagnosticState=/, `${args.join(' ')} must render a closed diagnostic state`);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('--check --compat still runs its explicit help probe while withholding the raw help output', () => {
  const root = mkdtempSync(join(tmpdir(), 'hopper-compat-probe-'));
  const bin = join(root, 'PRIVATE_COMPAT_BIN');
  const counter = join(root, 'PRIVATE_COMPAT_COUNTER');
  try {
    mkdirSync(bin, { recursive: true });
    const command = process.platform === 'win32' ? 'claude.cmd' : 'claude';
    const shim = join(bin, command);
    if (process.platform === 'win32') {
      writeFileSync(shim, '@echo off\r\necho --print --output-format --model --permission-mode --add-dir> "%HOPPER_COMPAT_COUNTER%"\r\n', 'utf-8');
    } else {
      writeFileSync(shim, '#!/bin/sh\nprintf "%s" "--print --output-format --model --permission-mode --add-dir" > "$HOPPER_COMPAT_COUNTER"\n', 'utf-8');
      chmodSync(shim, 0o755);
    }
    const pathValue = `${bin}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH || process.env.Path || ''}`;
    const result = spawnSync(process.execPath, [DISPATCH, '--check', 'claude', '--compat'], {
      encoding: 'utf-8',
      env: { ...process.env, HOPPER_COMPAT_COUNTER: counter, PATH: pathValue, Path: pathValue },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(existsSync(counter), '--compat must run the explicit vendor --help probe');
    assert.match(result.stdout, /compatibility=(?:compatible|incompatible|unavailable)/);
    assert.match(result.stdout, /raw help output is withheld/i);
    assert.ok(!`${result.stdout}\n${result.stderr}`.includes('PRIVATE_COMPAT_COUNTER'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
