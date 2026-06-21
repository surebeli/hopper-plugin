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
