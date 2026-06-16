// Codex vendor adapter (T-PLUGIN-05a)
// Anchor: cli/src/vendors/codex.js
//
// Implements VendorAdapter contract per cli/src/types.js.
// Per spec §3 #4: thin wrapper, ZERO retry/fallback/circuit-breaker.
// Per T-PLUGIN-00 Prong 2 resolved: codex exec is the noninteractive form.

import {
  existsSync, mkdirSync, copyFileSync, symlinkSync, lstatSync, readlinkSync, statSync, unlinkSync,
  readFileSync, writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { applyTaskTypeFloor } from '../subprocess.js';

/**
 * HOPPER-3: build the `-c key=value` overrides that isolate a dispatched codex
 * from the dispatching machine's global config. Without this, `codex exec`
 * loads ~/.codex/config.toml + AGENTS.md (global and project) + marketplace
 * skills + the notify hook from the HOST, which contaminates the vendor run and
 * breaks deterministic dispatch (spec §3 #4, Host != Vendor). On a hopper dev
 * box this is acute: codex would load hopper's OWN marketplace skills while
 * being dispatched BY hopper — a feedback loop.
 *
 * `-c key=value` is the highest-precedence config layer and overrides every
 * config file (verified: developers.openai.com codex config-reference; the
 * precedence table at codex.danielvaughan.com). We override the two keys that
 * `-c` reliably controls:
 *   - project_doc_max_bytes=0 → stop reading AGENTS.md / project + global docs
 *   - notify=[]               → disable the notify hook (a program-argv array)
 *
 * What `-c` CANNOT do: disable globally-installed marketplace skills for a
 * single invocation (openai/codex#20210 — project-scoped skill filtering is
 * unimplemented upstream). Skills are isolated instead by pointing codex at an
 * auto-built, login-preserving CODEX_HOME — see resolveIsolatedCodexHome().
 *
 * Escape hatches (no code change needed):
 *   - HOPPER_CODEX_ISOLATE=0          → disable ALL isolation (these overrides
 *                                        AND the CODEX_HOME swap), e.g. if a
 *                                        future codex changes a key's type and
 *                                        the override would error.
 *   - HOPPER_CODEX_EXTRA_CONFIG="a=b,c=d" → append extra `-c` overrides.
 *
 * @returns {string[]} flat argv fragments, e.g. ['-c', 'project_doc_max_bytes=0', ...]
 */
export function codexIsolationConfig() {
  if (process.env.HOPPER_CODEX_ISOLATE === '0') return [];
  const pairs = ['project_doc_max_bytes=0', 'notify=[]'];
  const extra = process.env.HOPPER_CODEX_EXTRA_CONFIG;
  if (extra) {
    for (const kv of extra.split(',')) {
      const trimmed = kv.trim();
      if (trimmed) pairs.push(trimmed);
    }
  }
  return pairs.flatMap((p) => ['-c', p]);
}

/**
 * HOPPER-3 (auto-isolation): build a cached, login-preserving CODEX_HOME that
 * has the user's auth but NOT their globally-installed marketplace skills, so a
 * dispatched codex runs deterministically with ZERO user setup.
 *
 * codex resolves its home as `$CODEX_HOME || ~/.codex` — a deterministic 1–2
 * candidate lookup (we mirror codex's own rule, not a guess). We discover that
 * real home, then materialize an isolated home (default ~/.hopper/codex-isolated,
 * override via HOPPER_CODEX_HOME) containing:
 *   - auth.json   → symlinked to the real one so token refresh stays live;
 *                   copied as a fallback where symlinks need privilege (Windows).
 *   - config.toml → copied if present (model/provider/MCP config preserved; the
 *                   notify hook is still neutralized by the -c override).
 *   - NO skills/ directory → the host's global marketplace skills do not load.
 *
 * Returns the isolated home path, or null meaning "leave CODEX_HOME as-is"
 * (isolation disabled, no discoverable auth to preserve, or a build failure) —
 * codex then runs against its default home with only the -c overrides applied.
 * Never spawns a subprocess (single-spawn invariant intact).
 *
 * @returns {string|null}
 */
export function resolveIsolatedCodexHome() {
  if (process.env.HOPPER_CODEX_ISOLATE === '0') return null;

  const realHome = process.env.CODEX_HOME || join(homedir(), '.codex');
  const realAuth = join(realHome, 'auth.json');
  const haveAuthFile = existsSync(realAuth);
  const haveAuthEnv = Boolean(process.env.CODEX_API_KEY || process.env.OPENAI_API_KEY);
  // Building an isolated home with no auth would strip the user's login. Only
  // isolate when auth can be preserved (a discoverable auth.json, or an env key
  // codex reads directly). Otherwise fall back to the default home + -c.
  if (!haveAuthFile && !haveAuthEnv) return null;

  const isoHome = process.env.HOPPER_CODEX_HOME || join(homedir(), '.hopper', 'codex-isolated');
  // Never let the isolated home BE — or live INSIDE — the real home: that would
  // defeat isolation and risk hopper writing/symlinking into the real ~/.codex
  // tree (e.g. a stray HOPPER_CODEX_HOME=~/.codex/sub). Default location is
  // safely outside the real home.
  const isoResolved = resolve(isoHome);
  const realResolved = resolve(realHome);
  if (isoResolved === realResolved || isoResolved.startsWith(realResolved + sep)) return null;

  try {
    mkdirSync(isoHome, { recursive: true });
    if (haveAuthFile) linkOrCopy(realAuth, join(isoHome, 'auth.json'));
    const realCfg = join(realHome, 'config.toml');
    // ISSUE-codex-review-hijack: copy config.toml but STRIP skill registrations.
    // The skill-free isoHome/skills already excludes DIRECTORY skills, but
    // config-registered skills ([[skills.config]] absolute paths / a [skills]
    // table) would otherwise be re-introduced by copying the host config — which
    // is exactly how gstack/superpowers/cli-audit skills hijacked dispatched
    // reviews. Sanitizing keeps model/provider/MCP config intact.
    if (existsSync(realCfg)) writeSanitizedCodexConfig(realCfg, join(isoHome, 'config.toml'));
    // Intentionally never create isoHome/skills — that omission IS the isolation.
    return isoHome;
  } catch (_) {
    return null;  // any build error → safe fallback to default home + -c overrides
  }
}

/** Symlink src→dest (preferred — keeps token refresh live); copy as fallback. */
function linkOrCopy(src, dest) {
  try {
    if (lstatExists(dest)) {
      try {
        const st = lstatSync(dest);
        if (st.isSymbolicLink() && resolve(readlinkSync(dest)) === resolve(src)) return;
      } catch (_) {}
      try { unlinkSync(dest); } catch (_) {}
    }
    try { symlinkSync(src, dest); return; } catch (_) { /* privilege/unsupported → copy */ }
    copyFileSync(src, dest);
  } catch (_) { /* leave whatever exists; resolveIsolatedCodexHome() will catch */ }
}

/** lstat-based existence check that also sees broken symlinks. */
function lstatExists(p) {
  try { lstatSync(p); return true; } catch (_) { return false; }
}

/** Copy src→dest only when src is newer than dest (or dest is absent). */
function refreshCopy(src, dest) {
  try {
    if (existsSync(dest)) {
      try { if (statSync(dest).mtimeMs >= statSync(src).mtimeMs) return; } catch (_) {}
    }
    copyFileSync(src, dest);
  } catch (_) { /* best-effort */ }
}

/**
 * Strip skill registrations from a codex config.toml (ISSUE-codex-review-hijack).
 * Removes any `[skills...]` table and any `[[skills.config]]` array-of-tables
 * block (plus their body lines, up to the next table header), so a dispatched,
 * isolated codex does NOT auto-load the host's globally-registered skills
 * (gstack-review / using-superpowers / cli-audit) that otherwise hijack the task
 * and ignore the brief. Upstream has no global skills off-switch
 * (openai/codex#20210). Leaves model/provider/MCP/sandbox config untouched.
 * Pure — exported for unit testing.
 * @param {string} toml
 * @returns {string}
 */
export function stripCodexSkillsConfig(toml) {
  const lines = String(toml ?? '').split(/\r?\n/);
  const isTableHeader = (l) => /^\s*\[\[?[^\]]+\]\]?\s*(#.*)?$/.test(l);
  const isSkillsHeader = (l) => /^\s*\[\[?\s*skills(\.|\s|\]|\b)/i.test(l);
  const out = [];
  let skipping = false;
  for (const line of lines) {
    if (isTableHeader(line)) {
      skipping = isSkillsHeader(line);
      if (skipping) continue;          // drop the skills table header itself
    }
    if (!skipping) out.push(line);     // keep preamble + non-skills tables + their bodies
  }
  return out.join('\n');
}

/** Read src config, strip skill registrations, write to dest (idempotent). */
function writeSanitizedCodexConfig(src, dest) {
  try {
    const cleaned = stripCodexSkillsConfig(readFileSync(src, 'utf-8'));
    if (existsSync(dest)) {
      try { if (readFileSync(dest, 'utf-8') === cleaned) return; } catch (_) {}
    }
    writeFileSync(dest, cleaned, 'utf-8');
  } catch (_) { /* best-effort; leave whatever exists */ }
}

/** @type {import('../types.js').VendorAdapter} */
export const codexAdapter = {
  name: 'codex',
  command: 'codex',
  stdinMode: 'none',

  // Phase 6a static capability hint (no live vendor introspection — would
  // break single-spawn proof). Source: docs/research/.
  capabilities: {
    modelArg: {
      accepted: 'ignored',
      knownGood: [],  // codex available models depend on user ChatGPT subscription
      // Phase 6a dogfood 2026-05-21: codex CLI supports `-m, --model <MODEL>`.
      // Our adapter currently uses `model_reasoning_effort` config flag only,
      // NOT --model. Mark as adapter-ignored. Available models also depend
      // on user's ChatGPT login + entitlements — not hardcoded here either.
      sourceNote: 'codex CLI supports `-m <MODEL>` (verified 2026-05-21). Our adapter uses opts.reasoning via config flag only — does NOT forward opts.model. Adapter-ignored, not CLI-unsupported. Machine-readable model catalog available via `codex debug models --bundled` (JSON) per official cli reference; user can run it to see what their ChatGPT login can access.',
    },
    reasoningArg: {
      accepted: 'enumerated',
      // Phase 6b vendor-introspection research 2026-05-21: codex supports 5
      // reasoning levels per official config-reference, not 4. `minimal` is
      // the lowest tier (cheap routing/extraction use cases).
      knownGood: ['minimal', 'low', 'medium', 'high', 'xhigh'],
      sourceNote: 'docs/research/async-execution/01-openai-hosts.md + docs/research/vendor-introspection/01-codex-opencode.md (live: 5 levels, including `minimal` previously missed).',
    },
    features: {
      sessionResume: { supported: true, mechanism: '`codex exec resume <SESSION_ID>` — hopper does not currently auto-capture session_id' },
      fileOutput: { supported: true, mechanism: '`--output-last-message <path>` exists (NOT currently used by adapter)' },
      streaming: { supported: true, mechanism: 'codex exec streams progress to stderr; final message to stdout' },
    },
    staleAfter: '2026-08-21',
  },

  args(input, opts) {
    const sandbox = opts.sandbox ?? 'danger-full-access';
    return [
      'exec',
      input,
      // Set the workspace root explicitly (CONFIRMED `--cd/-C <path>` works with
      // `codex exec`, developers.openai.com/codex/cli/reference). hopper injects
      // opts.cwd = resolved vendor CWD (repo root by default, or $HOPPER_VENDOR_CWD).
      // Product default: full write permission for implementation dispatches.
      // The dispatcher sets opts.sandbox='read-only' only when task text
      // explicitly says read-only, or when the user passes --sandbox read-only.
      ...(opts.cwd ? ['--cd', opts.cwd] : []),
      '-s', sandbox,
      '-c', `model_reasoning_effort="${opts.reasoning ?? 'medium'}"`,
      // HOPPER-3: isolate the dispatched codex from the HOST's global config so
      // dispatch stays deterministic (Host != Vendor, spec §3 #4).
      ...codexIsolationConfig(),
      ...(opts.webSearch ? ['--enable', 'web_search_cached'] : []),
    ];
  },

  // HOPPER-3 (auto-isolation): extra env merged into the codex spawn. Points
  // codex at an auto-built, login-preserving CODEX_HOME with the host's global
  // marketplace skills excluded — zero user setup. Returns {} (no override) when
  // isolation is off or no auth is discoverable, so codex falls back to its
  // default home. Threaded into the spawn by dispatch.js + hopper-runner.
  env() {
    const iso = resolveIsolatedCodexHome();
    return iso ? { CODEX_HOME: iso } : {};
  },

  envPreflight() {
    // Per codex Phase 2 audit F1: broaden checks to avoid false-negatives.
    // codex supports: ~/.codex/auth.json (default), $CODEX_HOME override,
    // $CODEX_API_KEY env, $OPENAI_API_KEY env (keychain backed in some installs).
    const codexHome = process.env.CODEX_HOME || join(homedir(), '.codex');
    if (existsSync(join(codexHome, 'auth.json'))) return { ok: true, missing: [] };
    if (process.env.CODEX_API_KEY || process.env.OPENAI_API_KEY) return { ok: true, missing: [] };
    // Soft warn instead of hard block — codex may use keychain we cannot detect.
    return {
      ok: true,
      missing: ['Note: no obvious codex auth artifact found. If smoke fails, run `codex login` OR set CODEX_API_KEY/OPENAI_API_KEY.'],
    };
  },

  timeoutMs(opts) {
    // Native: codex scales with reasoning level
    let native = 300_000;
    if (opts.reasoning === 'xhigh') native = 900_000;
    else if (opts.reasoning === 'high') native = 600_000;
    // Phase 6c F1: review task-types get raised to 30min floor
    return applyTaskTypeFloor(native, opts);
  },

  parseResult(raw) {
    if (raw.timedOut) {
      return {
        text: raw.stdout,
        status: 'timeout',
        error: `codex exec timed out after ${raw.durationMs}ms`,
      };
    }
    if (raw.exitCode === 127) {
      return {
        text: '',
        status: 'permission-fail',
        error: 'codex binary not found in PATH. Install: see https://github.com/openai/codex',
      };
    }
    if (raw.exitCode === 0 && raw.stdout) {
      // Parse tokens from stderr metadata if present
      const tokenMatch = raw.stderr.match(/tokens used\s*\n(\d+)/);
      const tokens = tokenMatch ? parseInt(tokenMatch[1]) : undefined;
      return {
        text: raw.stdout.trim(),
        status: 'success',
        usage: tokens ? { totalTokens: tokens } : undefined,
      };
    }
    return {
      text: raw.stdout,
      status: 'unknown-fail',
      error: `codex exited ${raw.exitCode}: ${(raw.stderr || '').slice(0, 500)}`,
    };
  },
};
