// --check-model <vendor> <model> — assertion-style, zero-spawn pre-dispatch model check.
// Anchor: cli/src/model-check.js
//
// Motivation: model availability was previously only exposed at DISPATCH time —
// `warnIfModelUnknown()` (cli/bin/hopper-dispatch) is a non-blocking, advisory
// soft-warn that still lets a bad model through, so the first hard signal a bad
// model name gets is a live vendor 400. --check-model closes that gap with an
// assertion the caller can gate on (distinct exit codes) BEFORE spending a real
// dispatch.
//
// Zero-spawn by design (spec §3 #4): reads ONLY
//   (a) the probe cache (~/.hopper/cache/vendor-capabilities.json, read-only —
//       populated out-of-band by the opt-in `--probe`), and
//   (b) the adapter's static `capabilities.modelArg.knownGood` (the same static
//       source `--capabilities` reads).
// Never spawns a vendor subprocess and never writes the cache.
//
// Three-tier verdict:
//   verified      (exit 0) — model matches a knownGood/V-verified entry for this
//                 vendor. This is a hand-curated, live-confirmed list (see e.g.
//                 codex.js's per-model "V-verified <date> via live micro-test on
//                 codex CLI <version>" notes) — the strongest guarantee this tool
//                 can give without spawning anything itself.
//   catalog-only  (exit 2) — model is in the machine's PROBED catalog (what the
//                 vendor's own model-listing command returned) but has not been
//                 promoted to knownGood. Catalog inclusion is NOT the same as
//                 "this machine's installed CLI version will actually accept it
//                 at dispatch" — observed live: codex 0.142.5's bundled catalog
//                 listed gpt-5.6-sol/terra/luna, and all three 400'd at dispatch
//                 ("requires a newer version of Codex"); they only became
//                 dispatchable (and were promoted to knownGood) once the CLI was
//                 upgraded to >= 0.144 and a live micro-test confirmed each one.
//   not-found     (exit 1) — neither list has it. Degrades gracefully when the
//                 vendor has never been probed (cacheMissing): only the static
//                 knownGood list is checked, and the hint says so explicitly.
//
// A model string with a reasoning effort spliced onto its tail (`gpt-5.5-xhigh`)
// gets a dedicated `effort-spliced` verdict (exit 1) instead of a generic
// not-found, UNLESS that exact glued-together string is itself a real verified/
// catalog entry (never overrides a genuine match).

import { normalizeModel, modelKeysMatch } from './model-normalize.js';

/** Exit codes for each verdict (engineering convention: 0 ok, 1 hard-miss, 2 distinct/soft-fail — see e.g. process.exit(2) "write failure" in cli/bin/hopper-dispatch). */
export const CHECK_MODEL_EXIT = Object.freeze({
  verified: 0,
  'catalog-only': 2,
  'not-found': 1,
  'effort-spliced': 1,
});

const REASONING_SUFFIX_RE = /-(minimal|low|medium|high|xhigh)$/i;

/**
 * Detect a reasoning-effort level spliced onto the tail of a model name
 * (`gpt-5.5-xhigh` → `xhigh`). No known-good/catalog model across any adapter
 * ends in one of these words as of this writing, so the check is vendor-agnostic;
 * callers still gate it behind "no real verified/catalog match" so a future
 * legitimately-named model is never misclassified.
 * @param {string} model
 * @returns {string|null} the lowercased effort level, or null if no suffix matches
 */
export function detectSplicedEffort(model) {
  if (typeof model !== 'string') return null;
  const m = model.trim().match(REASONING_SUFFIX_RE);
  return m ? m[1].toLowerCase() : null;
}

/**
 * Pure decision function — no I/O, no subprocess, no cache read/write. The CLI
 * layer gathers `knownGood` (adapter static capabilities) and `catalog` (probe
 * cache models, or null when the vendor has never been probed) and calls this;
 * unit tests fabricate both directly.
 *
 * @param {string} vendor        resolved vendor name (already validated as a
 *                               registered adapter by the caller)
 * @param {string} rawModel      the user-typed model string
 * @param {string[]} [knownGood] adapter.capabilities.modelArg.knownGood
 * @param {string[]|null} [catalog] cached probe `models` for this vendor, or
 *                               `null` when there is no cache entry at all
 *                               (never-probed — triggers the degraded path)
 * @returns {{
 *   vendor: string,
 *   model: string,
 *   normalized: string,
 *   verdict: 'verified'|'catalog-only'|'not-found'|'effort-spliced',
 *   exitCode: number,
 *   verifiedList: string[],
 *   catalog: string[],
 *   cacheMissing: boolean,
 *   splicedEffort?: string,
 *   hint: string[],
 * }}
 */
export function evaluateModelCheck(vendor, rawModel, knownGood = [], catalog = null) {
  const kg = Array.isArray(knownGood) ? knownGood : [];
  const cacheMissing = catalog === null || catalog === undefined;
  const cat = Array.isArray(catalog) ? catalog : [];
  const model = typeof rawModel === 'string' ? rawModel.trim() : String(rawModel ?? '');

  // Step 1 (req #3): V4 normalization BEFORE matching — same normalizer + same
  // knownGood source the dispatch chokepoint (resolveAdapterOptsForTask) uses,
  // so 'GPT-5.5' / 'gpt5.5' / 'openai-codex/gpt-5.5' resolve exactly like an
  // explicit --model would at dispatch time.
  const normalized = normalizeModel(vendor, model, kg);

  const inVerified = kg.some((g) => modelKeysMatch(vendor, g, normalized));
  if (inVerified) {
    return {
      vendor, model, normalized, verdict: 'verified', exitCode: CHECK_MODEL_EXIT.verified,
      verifiedList: kg, catalog: cat, cacheMissing,
      hint: [`'${normalized}' is on the ${vendor} verified/known-good list.`],
    };
  }

  const inCatalog = !cacheMissing && cat.some((c) => modelKeysMatch(vendor, c, normalized));
  if (inCatalog) {
    return {
      vendor, model, normalized, verdict: 'catalog-only', exitCode: CHECK_MODEL_EXIT['catalog-only'],
      verifiedList: kg, catalog: cat, cacheMissing,
      hint: [
        `'${normalized}' is in the probed catalog for ${vendor} but is NOT on the verified list.`,
        `Catalog inclusion is the vendor's own listing command, not proof this machine's CLI ` +
          `version actually accepts it at dispatch (a bundled catalog can list a model an ` +
          `older CLI still rejects with 400 — see codex.js's gpt-5.6-* note).`,
        `Pin to a verified name, or run one small real dispatch to confirm before relying on it.`,
      ],
    };
  }

  // Dedicated effort-splice diagnosis (req #3) — only reached once neither list
  // matched, so it never shadows a genuine verified/catalog hit.
  const splicedEffort = detectSplicedEffort(model);
  if (splicedEffort) {
    const base = model.slice(0, model.length - splicedEffort.length - 1);
    return {
      vendor, model, normalized, verdict: 'effort-spliced', exitCode: CHECK_MODEL_EXIT['effort-spliced'],
      verifiedList: kg, catalog: cat, cacheMissing, splicedEffort,
      hint: [
        `'${model}' looks like a model name with the '${splicedEffort}' reasoning effort glued onto it.`,
        `--model and --reasoning are separate flags — try:`,
        `  --model ${base} --reasoning ${splicedEffort}`,
      ],
    };
  }

  // Degraded path (req #4): never-probed vendor — only the static knownGood was
  // checkable, say so plainly instead of implying a full catalog search happened.
  if (cacheMissing) {
    return {
      vendor, model, normalized, verdict: 'not-found', exitCode: CHECK_MODEL_EXIT['not-found'],
      verifiedList: kg, catalog: cat, cacheMissing: true,
      hint: [
        `'${normalized}' is not on the ${vendor} verified list.`,
        `probe cache missing for '${vendor}' (never probed on this machine) — this check only ` +
          `compared against the static known-good list, not the live catalog.`,
        `Verified: ${kg.join(', ') || '(none)'}`,
        `Run \`hopper-dispatch --probe ${vendor}\` to populate the catalog, then re-check.`,
      ],
    };
  }

  return {
    vendor, model, normalized, verdict: 'not-found', exitCode: CHECK_MODEL_EXIT['not-found'],
    verifiedList: kg, catalog: cat, cacheMissing: false,
    hint: [
      `'${normalized}' is not on the ${vendor} verified list or in the probed catalog.`,
      `Verified: ${kg.join(', ') || '(none)'}`,
      `Catalog (${cat.length}): ${cat.slice(0, 12).join(', ') || '(none)'}${cat.length > 12 ? ', ...' : ''}`,
      `Run \`hopper-dispatch --probe ${vendor}\` to refresh the catalog, or \`hopper-dispatch --models ${vendor}\` to browse the cached list.`,
    ],
  };
}
