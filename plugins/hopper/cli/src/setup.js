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

import { listAdapters, getAdapter, installCheckForAdapter, capabilitiesForAdapter } from './vendors/index.js';
import { getVendorCache } from './cache.js';
import { compatCheckForAdapter } from './vendor-compat.js';

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
 * @param {string}  [o.only]  restrict to a single vendor
 * @param {Date}    [o.now]   injectable clock for capability-staleness (testable)
 * @returns {Promise<Array<object>>}
 */
export async function buildVendorReadiness({ deep = false, only = null, now = new Date() } = {}) {
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
    }
    rows.push(row);
  }
  return rows;
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
