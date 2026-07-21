// Closed public projection for vendor capability inventory.
// Anchor: cli/src/inventory-contract.js
//
// Cache entries may retain future/additive fields. Public inventory must not
// forward them: this module is the sole input contract for renderers.

const DECLARED_VENDORS = new Set(['agy', 'claude', 'codex', 'copilot', 'grok', 'kimi', 'mimo', 'opencode']);
const BINARY_BASENAMES = new Map([
  ['claude', 'claude'],
  ['opencode', 'opencode'],
  ['kimi', 'kimi'],
]);
const DIAGNOSTIC_CODES = new Set([
  'none',
  'metadata-envelope-malformed',
  'selector-metadata-cache-schema-unsupported',
  'selector-metadata-cache-adapter-mismatch',
  'selector-metadata-cache-expired',
  'selector-metadata-cache-missing',
  'runtime-model-metadata-malformed',
  'runtime-model-metadata-conflict',
  'runtime-model-metadata-absent',
  'inventory-cache-version-unsupported',
  'inventory-cache-malformed',
  'inventory-cache-recovery-backup-create-failed',
  'inventory-cache-recovery-replace-failed',
  'inventory-cache-recovery-durability-unknown',
  'capability-failed',
  'probe-failed',
  'catalog-unavailable',
  'unknown',
]);

function sourcePair(vendor, sourceKind) {
  if (!DECLARED_VENDORS.has(vendor)) return { sourceKind: 'unknown', sourceLabel: 'unknown' };
  if (sourceKind === 'static') return { sourceKind, sourceLabel: 'adapter-static-selectors' };
  if (sourceKind === 'unavailable') return { sourceKind, sourceLabel: 'unavailable' };
  if (vendor === 'claude' && sourceKind === 'adapter-aliases') {
    return { sourceKind, sourceLabel: 'claude-selector-metadata' };
  }
  if (vendor === 'opencode' && sourceKind === 'cli-catalog') {
    return { sourceKind, sourceLabel: 'opencode-cli-catalog' };
  }
  if (vendor === 'kimi' && sourceKind === 'config') {
    return { sourceKind, sourceLabel: 'kimi-configured-aliases' };
  }
  return { sourceKind: 'unknown', sourceLabel: 'unknown' };
}
function outcomeDiagnostic(outcome) {
  if (outcome === 'version-mismatch') return 'inventory-cache-version-unsupported';
  if (outcome === 'malformed') return 'inventory-cache-malformed';
  if (outcome === 'missing') return 'catalog-unavailable';
  return null;
}

function normalizeDiagnostic(code) {
  return DIAGNOSTIC_CODES.has(code) ? code : 'unknown';
}

function diagnosticState(code) {
  if (code === 'none') return 'none';
  if (code === 'unknown') return 'unknown';
  if (code === 'catalog-unavailable' || code === 'probe-failed' || code === 'capability-failed') return 'unavailable';
  return 'degraded';
}

function binaryAvailability(value) {
  return ['present', 'missing', 'unknown'].includes(value) ? value : 'unknown';
}

function binaryBasename(vendor, value) {
  if (value == null) return null;
  return BINARY_BASENAMES.get(vendor) === value ? value : 'unknown';
}

/**
 * Convert one private cache entry into its six-field, shape-closed v2 public
 * representation. Unknown/future fields are intentionally dropped.
 */
export function projectInventoryEntry(vendor, entry, outcome = 'ok-v1') {
  const provenance = entry && typeof entry.provenance === 'object' && !Array.isArray(entry.provenance)
    ? entry.provenance
    : {};
  const source = sourcePair(vendor, provenance.source_kind);
  const diagnosticCode = normalizeDiagnostic(outcomeDiagnostic(outcome) || entry?.diagnostic_code || 'none');
  return {
    binaryAvailability: binaryAvailability(provenance.binary_availability),
    binaryBasename: binaryBasename(vendor, provenance.binary_basename),
    sourceKind: source.sourceKind,
    sourceLabel: source.sourceLabel,
    diagnosticCode,
    diagnosticState: diagnosticState(diagnosticCode),
  };
}
