// Model-name normalization (V4).
// Anchor: cli/src/model-normalize.js
//
// Maps a loosely-specified model (`GPT-5.5`, `gpt5.5`, `openai-codex/gpt-5.5`,
// `gemini 3.5 flash high`) to the vendor's EXACT accepted form by fuzzy-matching a
// canonicalized key against that vendor's `capabilities.modelArg.knownGood`. Advisory:
// if there is no confident match it returns the input verbatim (the vendor may have a
// newer model than knownGood, or an account-specific one). Always vendor-SCOPED — never
// cross-maps one vendor's slug onto another.

/** Vendors whose --model is a BARE slug (no provider prefix) — strip a `provider/` prefix. */
const BARE_SLUG_VENDORS = new Set(['codex', 'grok', 'claude', 'copilot']);
/** Vendors whose --model REQUIRES `provider/model` — do NOT strip the prefix. */
const PROVIDER_PREFIXED_VENDORS = new Set(['mimo', 'opencode']);
/** Vendors where the value is a CONFIG ALIAS KEY — a wrong fuzzy guess is a hard error,
 *  so only case/whitespace-normalize against the configured aliases; never rewrite. */
const ALIAS_KEY_VENDORS = new Set(['kimi']);

/**
 * Canonicalization key: lowercase and drop separators/brackets/parens/dots so that
 * `GPT-5.5`, `gpt 5.5`, `gpt5.5` all key to `gpt55`, and `Gemini 3.5 Flash (High)` keys to
 * `gemini35flashhigh`. Keeps the alphanumerics that distinguish models (so `gpt-5.4` →
 * `gpt54` ≠ `gpt-5.4-mini` → `gpt54mini`, and `opus` → `opus` ≠ `opus[1m]` → `opus1m`).
 * @param {string} s
 * @returns {string}
 */
export function canonKey(s) {
  return String(s).toLowerCase().replace(/[\s_\-[\]().]/g, '');
}

/**
 * Normalize a user-specified model to the vendor's canonical name.
 * @param {string} vendor       resolved vendor name
 * @param {string} model        the user-specified model (e.g. from --model or a prompt)
 * @param {string[]} [knownGood] the vendor's modelArg.knownGood
 * @returns {string} the canonical knownGood string on a confident match, else the input
 */
export function normalizeModel(vendor, model, knownGood = []) {
  if (typeof model !== 'string' || !model.trim()) return model;
  const trimmed = model.trim();
  const list = Array.isArray(knownGood) ? knownGood : [];
  const matchFull = (cand) => list.find((g) => canonKey(g) === canonKey(cand));

  // kimi: alias key — only exact-ish (case/space) match; never fuzzy-rewrite to an upstream id.
  if (ALIAS_KEY_VENDORS.has(vendor)) {
    return matchFull(trimmed) || trimmed;
  }

  // bare-slug vendors: strip a provider/ prefix before matching (codex rejects prefixes).
  let cand = trimmed;
  if (BARE_SLUG_VENDORS.has(vendor) && cand.includes('/')) {
    cand = cand.slice(cand.lastIndexOf('/') + 1);
  }

  // FULL-key equality (not startsWith — so `gpt-5.4` never matches `gpt-5.4-mini`).
  const exact = matchFull(cand);
  if (exact) return exact;

  // provider-prefixed vendors: try an UNAMBIGUOUS model_id-tail match (so a bare
  // `mimo-v2.5-pro`, or a wrong-prefixed `foo/mimo-v2.5-pro`, resolves to the single
  // `xiaomi/mimo-v2.5-pro` if exactly one provider supplies that id). `lastIndexOf('/')`
  // is -1 for a bare id, so `slice(0)` keeps the whole string — no slash gate needed.
  // Never invent a prefix when the tail is ambiguous (>1 provider) — passthrough instead.
  if (PROVIDER_PREFIXED_VENDORS.has(vendor)) {
    const tail = canonKey(cand.slice(cand.lastIndexOf('/') + 1));
    const hits = list.filter((g) => canonKey(g.slice(g.lastIndexOf('/') + 1)) === tail);
    if (hits.length === 1) return hits[0];
  }

  return trimmed; // no confident match → passthrough (newer/account-specific model)
}

/** Last path segment (the bare model id) — `xiaomi/mimo-v2.5-pro` → `mimo-v2.5-pro`. */
function tailSlug(s) {
  return s.includes('/') ? s.slice(s.lastIndexOf('/') + 1) : s;
}

/**
 * Vendor-scoped equality between two model identifiers, tolerant of the
 * bare-vs-prefixed / label-vs-id namespace gap between hardcoded defaults and a
 * live catalog. Mirrors normalizeModel's matching discipline:
 *   - bare-slug vendors: compare the canon key of each side's bare slug.
 *   - provider-prefixed: full canon key OR (tail canon key) match.
 *   - alias / unknown: full canon key only.
 * @returns {boolean}
 */
export function modelKeysMatch(vendor, a, b) {
  if (BARE_SLUG_VENDORS.has(vendor)) return canonKey(tailSlug(a)) === canonKey(tailSlug(b));
  if (PROVIDER_PREFIXED_VENDORS.has(vendor)) {
    if (canonKey(a) === canonKey(b)) return true;
    // Tail-match ONLY bridges the bare↔prefixed namespace gap (a live bare id vs a
    // prefixed default). Never tail-match prefixed↔prefixed: `xiaomi/mimo-v2.5-pro`
    // and `openai/mimo-v2.5-pro` are different models, and conflating them would
    // hide real drift (a model moving providers).
    const aHasPrefix = a.includes('/');
    const bHasPrefix = b.includes('/');
    if (aHasPrefix !== bHasPrefix) return canonKey(tailSlug(a)) === canonKey(tailSlug(b));
    return false;
  }
  return canonKey(a) === canonKey(b);
}

/**
 * Reconcile a vendor's hardcoded `knownGood` defaults against a LIVE-enumerated
 * model list (from --probe / doctor --deep). Advisory, vendor-scoped drift report:
 *   - matched:         knownGood entries the live catalog still lists
 *   - missingFromLive: knownGood entries the live catalog NO LONGER lists (stale defaults)
 *   - newOnLive:       live models not represented in knownGood (candidates to add)
 * Caller must only invoke this when a live catalog actually exists — a vendor with
 * no enumeration command (introspection 'none') would otherwise show every default
 * as "missing", a false alarm.
 * @param {string} vendor
 * @param {string[]} [knownGood]
 * @param {string[]} [enumerated]  live model identifiers
 * @returns {{matched:string[], missingFromLive:string[], newOnLive:string[]}}
 */
export function reconcileModels(vendor, knownGood = [], enumerated = []) {
  const clean = (arr) => (Array.isArray(arr) ? arr.filter((s) => typeof s === 'string' && s.trim()) : []);
  const kg = clean(knownGood);
  const live = clean(enumerated);
  const matches = (a, b) => modelKeysMatch(vendor, a, b);
  return {
    matched: kg.filter((g) => live.some((l) => matches(g, l))),
    missingFromLive: kg.filter((g) => !live.some((l) => matches(g, l))),
    newOnLive: live.filter((l) => !kg.some((g) => matches(g, l))),
  };
}
