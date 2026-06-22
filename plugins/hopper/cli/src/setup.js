// Consolidated vendor readiness report ("setup" / "doctor").
// Anchor: cli/src/setup.js
//
// A PURE AGGREGATOR over the existing discovery primitives — it adds no new
// probing logic, so the single-spawn invariant (spec §3 #4) is preserved:
//   - installCheckForAdapter : install path + auth (filesystem only, no spawn)
//   - capabilitiesForAdapter : model/effort acceptance + staleAfter (static)
//   - getVendorCache         : last-probed model catalog (reads cache file)
//   - adapter.args()         : derive sandbox-control + web-search support (pure)
//   - compatCheckForAdapter  : flag/param drift — ONLY in the opt-in `deep` tier,
//                              which spawns `<vendor> --help` once per vendor.
//
// One place to answer "is each vendor ready, and what can it do" before a
// dispatch: installed? · auth? · models? · capability fresh? · full-access? ·
// web-search? — the three axes the operator cares about (run / safety / research).

import { listAdapters, getAdapter, installCheckForAdapter, capabilitiesForAdapter, probeVendor } from './vendors/index.js';
import { getVendorCache, setVendorCache } from './cache.js';
import { compatCheckForAdapter } from './vendor-compat.js';
import { reconcileModels } from './model-normalize.js';

/**
 * Does the adapter enforce the sandbox through argv (so hopper can downgrade a
 * dispatch to read-only), or does the vendor only honor its own native policy?
 * Derived by diffing the argv the adapter emits for full-access vs read-only.
 * @returns {'argv'|'native'|'?'}
 */
export function sandboxControl(adapter) {
  try {
    const full = adapter.args('x', { sandbox: 'danger-full-access' }).join('');
    const ro = adapter.args('x', { sandbox: 'read-only' }).join('');
    return full !== ro ? 'argv' : 'native';
  } catch (_) { return '?'; }
}

/**
 * Does the adapter plumb a web-search toggle (needed for PRD / market research)?
 * Reads the declared capabilities.webSearch (argv-diff fallback when undeclared).
 * @returns {'yes'|'manual'|'no'|'?'}
 */
export function webSearchSupport(adapter) {
  const ws = adapter && adapter.capabilities && adapter.capabilities.webSearch;
  if (ws && typeof ws.hopperEnabled === 'boolean') {
    if (ws.hopperEnabled) return 'yes';      // hopper enables it on --web-search
    return ws.headless ? 'manual' : 'no';    // vendor can search but needs env/config, or unsupported
  }
  try {
    const on = adapter.args('x', { webSearch: true }).join('');
    const off = adapter.args('x', {}).join('');
    return on !== off ? 'yes' : 'no';
  } catch (_) { return '?'; }
}

/**
 * Build the per-vendor readiness rows. Pure except for the optional `deep` tier.
 * @param {object} [o]
 * @param {boolean} [o.deep]  also run the flag-drift compat probe (spawns --help)
 *                            AND live-enumerate each vendor's models, reconciling
 *                            the result against the hardcoded knownGood (V3).
 * @param {string}  [o.only]  restrict to a single vendor
 * @param {Date}    [o.now]   injectable clock for capability-staleness (testable)
 * @param {Function}[o.probeFn] injectable model-enumeration probe (defaults to the
 *                            real probeVendor; tests pass a fake to avoid spawning)
 * @param {boolean} [o.persist] write the live catalog to the probe cache (default true)
 * @returns {Promise<Array<object>>}
 */
export async function buildVendorReadiness({ deep = false, only = null, now = new Date(), probeFn = probeVendor, persist = true } = {}) {
  const names = only ? [only] : listAdapters();
  const rows = [];
  for (const name of names) {
    let install = null;
    let error = null;
    try { install = await installCheckForAdapter(name); } catch (e) { error = String((e && e.message) || e); }
    const caps = capabilitiesForAdapter(name) || null;
    let cache = null;
    try { cache = getVendorCache(name); } catch (_) { cache = null; }
    const adapter = (() => { try { return getAdapter(name); } catch (_) { return null; } })();

    const staleAfter = caps && caps.staleAfter ? caps.staleAfter : null;
    const row = {
      name,
      installed: install ? Boolean(install.binaryFound) : false,
      path: install ? (install.resolvedPath || null) : null,
      authOk: install ? Boolean(install.authOk) : false,
      authNotes: install ? (install.authNotes || []) : [],
      status: install ? install.overallStatus : (error ? 'ERROR' : 'UNKNOWN'),
      models: cache && Array.isArray(cache.models) ? cache.models : null,
      modelsProbedAt: cache ? (cache.probed_at || null) : null,
      modelAccepted: caps ? caps.modelArg.accepted : '?',
      reasoningAccepted: caps ? caps.reasoningArg.accepted : '?',
      capsStaleAfter: staleAfter,
      capsStale: staleAfter ? now > new Date(staleAfter) : false,
      sandboxControl: adapter ? sandboxControl(adapter) : '?',
      webSearch: adapter ? webSearchSupport(adapter) : '?',
      error,
      compat: null,
    };
    if (deep) {
      try { row.compat = compatCheckForAdapter(name); }
      catch (e) { row.compat = { ran: false, reason: String((e && e.message) || e) }; }

      // V3: live-enumerate the vendor's models, reconcile vs hardcoded knownGood.
      const kg = (caps && caps.modelArg && Array.isArray(caps.modelArg.knownGood)) ? caps.modelArg.knownGood : [];
      try {
        const live = await probeFn(name);
        const liveModels = live && Array.isArray(live.models) ? live.models.filter((m) => typeof m === 'string' && m.trim()) : [];
        const introspection = (live && live.introspection_supported) || 'none';
        // A GENUINELY-live catalog requires `introspection_supported === 'full'` — NOT
        // merely a non-empty list. 'partial' (claude version+static aliases) and
        // 'config-only' (kimi config names) return a static/fallback list that is NOT a
        // live enumeration; reconciling it would flag every default as STALE — the exact
        // false alarm this guards against.
        const liveEnumerated = introspection === 'full' && liveModels.length > 0;
        // knownGood must be a real catalog, not a placeholder sentinel (opencode ships
        // `['<provider>/<model>']` as a format example, not a model list).
        const kgUsable = kg.length > 0 && !kg.some((g) => typeof g === 'string' && g.includes('<'));
        row.modelsLive = liveModels;
        row.modelsLiveSource = live ? (live.models_source || null) : null;
        row.introspection = introspection;
        // Refresh the cache + Models column ONLY for genuinely-live catalogs, so doctor
        // never stamps a fresh probed_at onto static/fallback data.
        if (persist && liveEnumerated) {
          try { setVendorCache(name, { ...live, probed_at: now.toISOString() }); } catch (_) { /* cache write best-effort */ }
          row.models = liveModels;
          row.modelsProbedAt = now.toISOString();
        }
        if (!liveEnumerated) {
          row.modelReconcile = { applicable: false, reason: introspection === 'full'
            ? 'live enumeration returned no models'
            : `no live model-enumeration command (introspection: ${introspection}); model list is static/account-dependent` };
        } else if (!kgUsable) {
          row.modelReconcile = { applicable: false, reason: 'no hardcoded knownGood catalog to reconcile against (placeholder/empty)' };
        } else {
          const driftExpected = (caps && caps.modelArg && Array.isArray(caps.modelArg.driftExpected)) ? caps.modelArg.driftExpected : [];
          row.modelReconcile = { applicable: true, ...reconcileModels(name, kg, liveModels, driftExpected) };
        }
      } catch (e) {
        row.modelsLive = null;
        row.modelReconcile = { applicable: false, reason: `probe failed: ${String((e && e.message) || e)}` };
      }
    }
    rows.push(row);
  }
  return rows;
}

/**
 * Format the per-vendor "Model catalog drift" detail (doctor --deep). PURE and
 * exported so the renderer logic is unit-testable without spawning the CLI.
 * @param {object} row a buildVendorReadiness row (expects .modelReconcile, .modelsLive)
 * @returns {{verdict: 'OK'|'DRIFT'|'n/a'|'—', detail: string}}
 */
export function formatModelDrift(row) {
  const rec = row && row.modelReconcile;
  if (!rec) return { verdict: '—', detail: '' };
  if (rec.applicable === false) return { verdict: 'n/a', detail: rec.reason || '' };
  const liveN = Array.isArray(row.modelsLive) ? row.modelsLive.length : 0;
  const suppressed = Array.isArray(rec.expectedSuppressed) ? rec.expectedSuppressed.length : 0;
  // Count matches from the LIVE side (liveN minus the new + suppressed live models) so
  // the "N of M" is accurate even if two defaults map to one live model (rec.matched is
  // a knownGood-side count that could exceed the distinct matched-live count).
  const liveMatched = Math.max(0, liveN - rec.newOnLive.length - suppressed);
  const parts = [`${liveMatched} of ${liveN} live model(s) match defaults`];
  if (suppressed > 0) parts.push(`${suppressed} expected-divergence suppressed (driftExpected)`);
  if (rec.missingFromLive.length) parts.push(`STALE default(s) not in live catalog: ${rec.missingFromLive.join(', ')}`);
  if (rec.newOnLive.length) parts.push(`NEW live model(s) absent from defaults: ${rec.newOnLive.slice(0, 8).join(', ')}${rec.newOnLive.length > 8 ? '…' : ''}`);
  const verdict = (rec.missingFromLive.length || rec.newOnLive.length) ? 'DRIFT' : 'OK';
  return { verdict, detail: parts.join('; ') };
}

/**
 * Roll the rows up into a one-line readiness verdict.
 * @param {Array<object>} rows
 * @returns {{ ready: number, total: number, notInstalled: string[], authMissing: string[], capsStale: string[] }}
 */
export function summarizeReadiness(rows) {
  const notInstalled = rows.filter((r) => !r.installed).map((r) => r.name);
  const authMissing = rows.filter((r) => r.installed && !r.authOk).map((r) => r.name);
  const capsStale = rows.filter((r) => r.capsStale).map((r) => r.name);
  const ready = rows.filter((r) => r.installed && r.authOk).length;
  return { ready, total: rows.length, notInstalled, authMissing, capsStale };
}
