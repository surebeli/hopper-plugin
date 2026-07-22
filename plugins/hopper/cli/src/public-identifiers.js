// Closed public projection for model selectors and observed model identities.
// Anchor: cli/src/public-identifiers.js
//
// This is intentionally a static catalog: public persistence/rendering must not
// import live adapter/cache state, which both avoids cycles and keeps a hostile
// legacy handoff from widening the accepted display vocabulary.

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,63}(?:\/[A-Za-z0-9][A-Za-z0-9._:+-]{0,63})?$/;
const PRINTABLE_ASCII = /^[\x20-\x7e]+$/;
const SECRET_LIKE_IDENTIFIERS = Object.freeze([
  /^gh[pousr]_[A-Za-z0-9]{20,}$/i,
  /^github_pat_[A-Za-z0-9_]{20,}$/i,
  /^glpat-[A-Za-z0-9_-]{20,}$/i,
  /^xapp-[A-Za-z0-9-]{20,}$/i,
  /^xox[baprs]-[A-Za-z0-9-]{20,}$/i,
  /^xai-[A-Za-z0-9_-]{20,}$/i,
  /^(?:sk|pk|rk)[_-][A-Za-z0-9_-]{20,}$/i,
  /^(?:api[_-]?key|access[_-]?token|secret)[_-][A-Za-z0-9_-]{20,}$/i,
]);

// The regular known-good values are grammar-safe. These are the declared exact
// labels that intentionally need spaces/brackets and therefore cannot pass the
// generic grammar alone.
const DECLARED_DISPLAY_LABELS = Object.freeze({
  agy: new Set([
    'Gemini 3.5 Flash (High)', 'Gemini 3.5 Flash (Medium)',
    'Gemini 3.1 Pro (High)', 'Gemini 3.1 Pro (Low)',
  ]),
  claude: new Set(['sonnet[1m]', 'opus[1m]']),
});

function isSafeText(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 128 || value !== value.trim()) return false;
  if (!PRINTABLE_ASCII.test(value) || /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(value)) return false;
  if (/^(?:[A-Za-z]:[\\/]|[\\/])/.test(value) || value.includes('\\')) return false;
  return !value.split('/').some((part) => SECRET_LIKE_IDENTIFIERS.some((pattern) => pattern.test(part)));
}

function declaredLabel(value, vendor = null) {
  if (vendor) return DECLARED_DISPLAY_LABELS[vendor]?.has(value) === true;
  return Object.values(DECLARED_DISPLAY_LABELS).some((labels) => labels.has(value));
}

/** Return a safe public identifier or null; never return a secret-like value. */
export function publicModelIdentifier(value, vendor = null) {
  if (!isSafeText(value)) return null;
  if (SAFE_IDENTIFIER.test(value)) return value;
  return declaredLabel(value, vendor) ? value : null;
}

/** First-seen de-duplicated projection for persisted/public model arrays. */
export function publicModelIdentifiers(value, vendor = null) {
  if (!Array.isArray(value)) return [];
  const result = [];
  for (const item of value) {
    const safe = publicModelIdentifier(item, vendor);
    if (safe !== null && !result.includes(safe)) result.push(safe);
  }
  return result;
}

/** CLI-safe predicate used before an argv model value is persisted or spawned. */
export function isSafeModelIdentifier(value) {
  return publicModelIdentifier(value) !== null;
}
