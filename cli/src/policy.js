// Task-type policy cell parsing — Effort policy / Model rule columns in the
// .hopper/AGENTS.md task-vendor-preference table (batch 2, 2026-07: mechanizes
// the two columns that used to be pure prose so dispatch can actually CONSUME
// them, not just display them).
// Anchor: cli/src/policy.js
//
// Pure parsing + resolution helpers — no I/O, no vendor knowledge beyond the
// (vendor, knownGood) values the caller passes in. Consumed by:
//   - dispatch.js  (resolveAdapterOptsForTask: --reasoning / --model fallback chains)
//   - setup.js     (--setup "Task-type policy" lint section)
//
// Shared OOB convention (same as the Default-vendor column, see agents.js):
// a cell that STARTS WITH '(' is a note, not a binding — e.g. `(bind per
// project)`. Parsed as unbound, never as an error.

/** OOB convention shared with the Default-vendor column. */
export function isOobCell(raw) {
  return typeof raw === 'string' && /^\s*\(/.test(raw.trim());
}

function stripBackticks(s) {
  if (!s) return s;
  return s.replace(/^`/, '').replace(/`$/, '').trim();
}

// Duplicated (not imported) from validation.js's ALLOWED_REASONING on purpose:
// this module must stay dependency-free of validation.js's CLI-flag concerns
// (e.g. HOPPER_DEFAULT_REASONING resolution) — it only needs the vocabulary.
// Kept byte-identical; a unit test cross-checks the two stay in sync.
export const ALLOWED_REASONING_LEVELS = Object.freeze(['minimal', 'low', 'medium', 'high', 'xhigh']);

/** Canonical ordinal scale (index = ordinal position), used by clamp-direction labeling. */
const CANONICAL_EFFORT_ORDER = ALLOWED_REASONING_LEVELS;

/**
 * Parse an Effort policy cell for a specific vendor. Two accepted forms:
 *   - single token:      `medium`                      (vendor-agnostic)
 *   - per-vendor table:  `codex:xhigh, grok:high`       (comma-separated pairs)
 *
 * @param {string} raw     the raw table-cell text
 * @param {string} vendor  the resolved vendor for this task-type (may be '' /
 *                         null if the task-type has no vendor binding yet —
 *                         the single-token form still resolves in that case;
 *                         the per-vendor form cannot select an entry)
 * @returns {{ status: 'ok'|'unbound'|'unparseable', value: string|null }}
 *   - 'ok':          a concrete reasoning level was resolved for this vendor
 *   - 'unbound':     empty / OOB cell, OR a well-formed per-vendor table that
 *                    simply doesn't name this vendor — NOT an error, just
 *                    "no policy for you", falls back to the next chain level
 *   - 'unparseable': the cell has content but matches neither accepted form
 */
export function parseEffortPolicyCell(raw, vendor) {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (!trimmed || isOobCell(trimmed)) return { status: 'unbound', value: null };

  // Per-vendor table form: comma-separated `vendor:level` pairs.
  if (trimmed.includes(':')) {
    const pairs = trimmed.split(',').map((s) => stripBackticks(s.trim())).filter(Boolean);
    if (pairs.length === 0) return { status: 'unparseable', value: null };
    const map = {};
    for (const pair of pairs) {
      const m = pair.match(/^([a-z][a-z0-9-]*)\s*:\s*([a-z]+)$/i);
      if (!m || !ALLOWED_REASONING_LEVELS.includes(m[2].toLowerCase())) {
        return { status: 'unparseable', value: null };
      }
      map[m[1].toLowerCase()] = m[2].toLowerCase();
    }
    const v = (vendor || '').toLowerCase();
    if (v && Object.prototype.hasOwnProperty.call(map, v)) {
      return { status: 'ok', value: map[v] };
    }
    // Parses fine, just doesn't name this vendor (or there is no vendor yet) —
    // no value FOR THIS VENDOR; the next fallback level takes over.
    return { status: 'unbound', value: null };
  }

  // Single-token form — vendor-agnostic, applies to whichever vendor dispatches.
  const token = stripBackticks(trimmed).toLowerCase();
  if (ALLOWED_REASONING_LEVELS.includes(token)) return { status: 'ok', value: token };
  return { status: 'unparseable', value: null };
}

/**
 * Model-rule sentinel registry. `verified-latest` is the only entry today
 * (resolves to the vendor adapter's `capabilities.modelArg.knownGood[0]` —
 * see resolveVerifiedLatest below and the ordering convention documented on
 * codex.js's knownGood array). Extend this array, not the call sites, when a
 * second sentinel is added.
 */
export const MODEL_SENTINELS = Object.freeze(['verified-latest']);

/**
 * Parse a Model rule cell. The column holds a SENTINEL NAME, never a literal
 * vendor model id — that keeps the AGENTS.md binding decoupled from any one
 * vendor's naming scheme (a project should not have to hand-write "gpt-5.5"
 * into a vendor-neutral policy table).
 * @param {string} raw
 * @returns {{ status: 'ok'|'unbound'|'unparseable', sentinel: string|null }}
 */
export function parseModelRuleCell(raw) {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (!trimmed || isOobCell(trimmed)) return { status: 'unbound', sentinel: null };
  const bare = stripBackticks(trimmed);
  if (MODEL_SENTINELS.includes(bare)) return { status: 'ok', sentinel: bare };
  return { status: 'unparseable', sentinel: null };
}

/**
 * Resolve the `verified-latest` sentinel for a vendor: convention is that
 * `capabilities.modelArg.knownGood[0]` (index 0) is the CURRENT preferred/
 * verified model for that vendor — see the ordering comment on codex.js's
 * knownGood array, which this sentinel depends on staying accurate.
 * Returns null when there is nothing usable to resolve to (empty knownGood,
 * or a documentation placeholder like opencode's `<provider>/<model>`), so
 * callers can omit --model (vendor CLI default) rather than forward a
 * placeholder string as a real argv value.
 * @param {string[]} knownGood
 * @returns {string|null}
 */
export function resolveVerifiedLatest(knownGood) {
  const first = Array.isArray(knownGood) ? knownGood[0] : null;
  if (!first || typeof first !== 'string' || /^<.*>$/.test(first.trim())) return null;
  return first;
}

/**
 * Generic effort clamp: map a requested reasoning level onto the nearest
 * level a vendor's `reasoningArg.knownGood` enum actually supports, by
 * canonical-ordinal distance. This reproduces what grok/copilot's adapter-
 * private clamp functions already do (xhigh->high, minimal->low) WITHOUT
 * needing a vendor-specific function — any vendor whose knownGood is a
 * (possibly sparse) subset of the canonical 5-level scale gets a sensible
 * clamp for free. Vendors with an EMPTY knownGood (kimi/opencode/agy/claude —
 * they ignore --reasoning entirely) are correctly treated as "not applicable"
 * (returns null), not "everything is out of range".
 * @param {string} requested
 * @param {string[]} vendorKnownGood
 * @returns {string|null} the clamped level, or null if not applicable/no clamp needed
 */
export function genericClampEffort(requested, vendorKnownGood) {
  if (!Array.isArray(vendorKnownGood) || vendorKnownGood.length === 0) return null;
  if (vendorKnownGood.includes(requested)) return requested; // already in range — no clamp
  const reqIdx = CANONICAL_EFFORT_ORDER.indexOf(requested);
  if (reqIdx === -1) return null; // not even a canonical level — nothing to clamp
  let best = null;
  let bestDist = Infinity;
  for (const level of vendorKnownGood) {
    const idx = CANONICAL_EFFORT_ORDER.indexOf(level);
    if (idx === -1) continue;
    const dist = Math.abs(idx - reqIdx);
    if (dist < bestDist) { bestDist = dist; best = level; }
  }
  return best;
}

/**
 * Compute a human-readable clamp notice (req #2: "clamp visibility" — no more
 * silent vendor-side remapping). Returns `{ inRange, clamped, notice }`;
 * `notice` is null when no clamp happened (in-range, or vendor doesn't clamp
 * at all — e.g. kimi/opencode/agy/claude, whose reasoningArg.knownGood is empty).
 * @param {string} vendor
 * @param {string} requested          the resolved effort BEFORE vendor clamping
 * @param {string[]} vendorKnownGood  vendor's capabilities.reasoningArg.knownGood
 * @returns {{ inRange: boolean, clamped: string|null, notice: string|null }}
 */
export function computeEffortClamp(vendor, requested, vendorKnownGood = []) {
  if (!requested) return { inRange: true, clamped: null, notice: null };
  if (!Array.isArray(vendorKnownGood) || vendorKnownGood.length === 0) {
    return { inRange: true, clamped: null, notice: null }; // vendor doesn't consume reasoning at all
  }
  if (vendorKnownGood.includes(requested)) return { inRange: true, clamped: null, notice: null };
  const clamped = genericClampEffort(requested, vendorKnownGood);
  if (!clamped || clamped === requested) return { inRange: false, clamped: null, notice: null };
  const reqIdx = CANONICAL_EFFORT_ORDER.indexOf(requested);
  const clampedIdx = CANONICAL_EFFORT_ORDER.indexOf(clamped);
  const bound = reqIdx > clampedIdx ? ' max' : (reqIdx < clampedIdx ? ' min' : '');
  return {
    inRange: false,
    clamped,
    notice: `effort ${requested} → clamped to ${clamped} (${vendor}${bound})`,
  };
}
