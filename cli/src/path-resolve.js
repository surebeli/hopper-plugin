// In-process PATH + PATHEXT resolver — no subprocess.
// Anchor: cli/src/path-resolve.js
//
// Used by:
//   - cli/bin/hopper-runner (decide whether to wrap with cmd.exe for .cmd/.bat)
//   - cli/src/vendors/index.js installCheckForAdapter (report install status)
//
// Extracted from hopper-runner's inline resolveWindowsCommand per the
// Phase 6a discovery-API addition so both code paths share one implementation.
// Per spec §3 #4: no subprocess in this resolver. statSync + accessSync only.
//
// Per codex Phase 6a strict audit P2 #1 (trust boundary): PATH is treated
// as TRUSTED INPUT. A hostile PATH entry (UNC path, Windows junction,
// relative `..`) can cause statSync probes outside the cwd, but cannot
// execute code — discovery is read-only. Users with untrusted PATH should
// audit `echo $PATH` (POSIX) or `$env:Path` (Windows) before running --check.

import { statSync, accessSync, constants } from 'node:fs';
import { join, delimiter } from 'node:path';

/**
 * Walk PATH (+ PATHEXT on Windows) for an unqualified command name.
 * Pure-sync, pure-fs. No subprocess.
 *
 * On Windows: tries PATHEXT extensions in order within each PATH dir,
 * first match wins. `.exe`/`.com` returns directly executable; `.cmd`/`.bat`
 * returns wrapped via cmd.exe `/c` (because CreateProcessW can't execute
 * batch files directly).
 *
 * On POSIX (Linux + macOS): returns the first executable-by-name match in
 * PATH order. `accessSync(path, X_OK)` is used to verify the file is
 * actually executable (honoring owner/group/world bits + filesystem ACLs);
 * a non-executable same-named file is skipped.
 *
 * @param {string} cmd  Unqualified command name (e.g. "codex").
 *                      If already a path or has an extension, returned as-is.
 * @returns {{ command: string, prependArgs: string[], resolvedPath: string|null } | null}
 *   `command` + `prependArgs` are ready-to-pass to spawn().
 *   `resolvedPath` is the actual file found (null if cmd was already qualified).
 *   Returns null if cmd is unqualified and NOT found on PATH.
 */
export function resolveCommandOnPath(cmd) {
  if (cmd.includes('/') || cmd.includes('\\') || /\.\w+$/.test(cmd)) {
    return { command: cmd, prependArgs: [], resolvedPath: null };
  }
  const isWindows = process.platform === 'win32';
  const pathDirs = (process.env.PATH || '').split(delimiter).filter(Boolean);

  if (!isWindows) {
    // POSIX (Linux + macOS): first executable-by-name match in PATH order.
    // MUST check exec permission, not just file existence — a non-executable
    // file with the same name would otherwise be falsely reported "found".
    for (const dir of pathDirs) {
      const candidate = join(dir, cmd);
      try {
        const st = statSync(candidate);
        if (!st.isFile()) continue;
        // X_OK = execute bit. accessSync throws if not executable for the
        // current process (owner/group/world + filesystem ACLs all checked).
        try {
          accessSync(candidate, constants.X_OK);
        } catch (_) {
          continue;
        }
        return { command: candidate, prependArgs: [], resolvedPath: candidate };
      } catch (_) {
        // not found / not accessible — continue
      }
    }
    return null;
  }

  // Windows: PATH+PATHEXT, first-match-in-first-dir semantics
  const exts = (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';')
    .map(e => e.trim()).filter(Boolean);
  for (const dir of pathDirs) {
    for (const ext of exts) {
      const candidate = join(dir, cmd + ext);
      try {
        if (statSync(candidate).isFile()) {
          const lower = ext.toLowerCase();
          if (lower === '.exe' || lower === '.com') {
            return { command: candidate, prependArgs: [], resolvedPath: candidate };
          }
          // .cmd / .bat / other → cmd.exe /c wrapper
          return {
            command: process.env.ComSpec || 'cmd.exe',
            prependArgs: ['/c', candidate],
            resolvedPath: candidate,
          };
        }
      } catch (_) {
        // continue
      }
    }
  }
  return null;
}

/**
 * Convenience: just check if a command is installed (resolvable on PATH).
 * @param {string} cmd
 * @returns {boolean}
 */
export function isCommandAvailable(cmd) {
  const r = resolveCommandOnPath(cmd);
  return r !== null && r.resolvedPath !== null;
}
