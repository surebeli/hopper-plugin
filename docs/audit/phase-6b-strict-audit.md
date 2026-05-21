# Phase 6b strict audit — codex
**Date:** 2026-05-21
**Reviewer:** codex [GPT-5; reasoning level not exposed by runtime]
**Verdict:** REWORK

## F-tier findings

1. **F2 — Concurrent-writer race in `setVendorCache()`**
   `cli/src/cache.js:68-73` + `cli/src/cache.js:88-97` — cache writes are only atomic at the single-file replace level; concurrent `setVendorCache()` writers (e.g., two parallel `--probe` calls for different vendors) can lose each other's vendor entries.
   Problematic pattern:
   ```js
   const c = readCache() || { version: CACHE_VERSION, host: hostname(), probed_at_global: new Date().toISOString(), vendors: {} };
   c.vendors[name] = entry;
   c.probed_at_global = new Date().toISOString();
   writeCache(c);
   ```
   `writeCache()` uses tmp + `renameSync()` with no lock or compare-and-merge. Last writer wins and silently drops prior entries.
   **Suggested fix:** add a file lock (e.g., lock-file via `open(path, O_EXCL)` retry loop) or perform a locked re-read-merge-write: re-read the cache file inside the critical section before writing, merge instead of overwrite.

## P-tier findings

1. **P1 — Parser paths lack static-fixture tests**
   `tests/unit/vendor-probe.test.js:4-6`, `tests/unit/vendor-probe.test.js:60-69` and the parsing code in `cli/src/vendor-probe/opencode.js:52-60`, `cli/src/vendor-probe/kimi.js:35-63`, `cli/src/vendor-probe/copilot.js:55-74` — ANSI-strip, quoted-TOML-key, and `.agent.md` parsing paths are only exercised on live data, not static fixture strings. Probe-specific parsing functions should be split into pure helpers and tested against inert strings.

2. **P2 — Kimi TOML key matching misses quoted keys with slashes**
   `cli/src/vendor-probe/kimi.js:42-60` — capability extraction uses `content.indexOf(\`[models.${name}]\`)` which misses `[models."foo/bar"]` quoted keys. Use regex that accounts for optional surrounding quotes, or use a minimal TOML section-header parser.

3. **P4 — Windows process-tree leak on timeout**
   `cli/src/vendor-probe/codex.js:25-28`, `cli/src/vendor-probe/opencode.js:17-20`, `cli/src/vendor-probe/copilot.js:20-23` — timeout uses `child.kill()` only; on Windows, child process trees can survive. Reuse the existing `killProcessTree()` utility already present in `cli/src/subprocess.js`.

4. **P3 — Soft-warn scope gap: background dispatch path**
   `cli/bin/hopper-dispatch:249-253`, `cli/bin/hopper-dispatch:337-357`, `cli/bin/hopper-dispatch:430-482` — the soft-warn for `--model X` not in cache only fires on the synchronous dispatch path. A user who passes `--background --model unknown-model` gets no warning. Extract a `warnIfModelUnknown()` helper and call it for both paths.

5. **P3 — Cache parse errors silently become `null`**
   `cli/src/cache.js:53-62` — a malformed or unreadable cache file is swallowed as `null`. This is acceptable for dispatch soft-warn, but `--models` and `--probe --verbose` should expose the error origin so the user knows to delete/re-probe rather than seeing empty output with no explanation.

6. **P5 — `agy.js` model identifier includes prose**
   `cli/src/vendor-probe/agy.js:20-23` — cached model is `"gemini-3.5-flash (baked in)"`. The parenthetical makes the identifier non-canonical and will fail any `model.includes(adapterOpts.model)` soft-warn string match if a user passes `--model gemini-3.5-flash`. Store `"gemini-3.5-flash"` as the identifier; put `"baked in"` in a separate `source` or `notes` field.

## N-tier findings

1. `cli/bin/hopper-dispatch:825-829` and `docs/release/INSTALL-MATRIX.md:414-416` — the cost table says "~5 subprocesses" for all-vendor probe, but OpenCode spawns 3 commands alone; total is ~6.

2. `docs/release/INSTALL-MATRIX.md:42-43` — version references still say `0.4.0-phase-3`; CLI binary header at `cli/bin/hopper-dispatch:34` reports `0.5.0-phase-5a`. Update for consistency.

3. `cli/src/vendor-probe/agy.js:23` — wording "Antigravity 2.0 docs" is imprecise here given the explicit agy/antigravity distinction maintained in `cli/src/vendors/agy.js:43-62`. Change to "agy CLI static model (source: agy vendor README)".

## Spec compliance summary

- **§3 #4 no-harness-core:** PASS with REWORK item. Probe is purely opt-in diagnostic; no retry / fallback / round-robin / circuit-breaker / consensus found in any Phase 6b path.
- **Single-spawn invariant:** PASS. `cli/src/vendors/index.js` lazy-imports probes only at lines 120-129 via dynamic `import()`; no static `vendor-probe` import present in top-level lines 1-18. `cli/src/path-resolve.js` and all five `cli/src/vendors/*.js` adapter files contain no spawn calls. `--check` and `--capabilities` code paths confirmed not to pull vendor-probe.
- **No-hardcoded-models:** PASS. No fallback model catalog arrays found in any probe adapter. The `agy` static model (`gemini-3.5-flash`) is the allowed baked-by-vendor exception per spec; the identifier cleanup (P-tier item 6) does not affect correctness of this verdict.
- **agy/antigravity distinction:** PASS with N-tier wording nit. `cli/src/vendors/agy.js:43-62` explicitly routes to `~/AppData/Local/agy/bin/agy.exe` and does not reference the Antigravity editor binary. The probe adapter does not conflate them.

## Tests status

Command run from `F:\workspace\ai\hopper-plugin`:
```
node --test tests/unit/*.test.js tests/integration/*.test.js
```

Exit code: `0`

Leading diagnostic (benign — NVM settings file absent on this machine):
```
ERROR open C:\Users\litianyi\.hawk\nvm\settings.txt: The system cannot find the file specified.
TAP version 13
```

Final summary:
```
1..325
# tests 325
# suites 0
# pass  307
# fail  0
# cancelled 0
# skipped 18
# todo  0
# duration_ms 11494.4256
```

Implementer-reported counts (`307 pass / 0 fail / 18 skipped`) **match this independent run exactly.** The 20 new Phase 6b tests are present and passing within those totals.
