// macOS subject-root process guard for read-only Hopper dispatches.
// Anchor: cli/src/subject-root-guard.js
//
// Boundary: this is a process-level write guard for one explicit subject tree.
// It does NOT prevent reads, network exfiltration, IPC, or writes outside that
// tree. During guarded execution, it also denies creation of a new hard link
// using a subject path as either endpoint, so a vendor cannot create an external
// alias. It cannot revoke a hard link that already existed before the guard;
// if that known alias is outside the subject, allowed outside writes can still
// mutate the same inode.
// sandbox-exec is a deprecated Apple transition mechanism, not a complete
// confinement boundary; callers must keep using vendor-native controls as well.

import { existsSync, realpathSync, statSync } from 'node:fs';
import { homedir, platform as hostPlatform } from 'node:os';
import { dirname, isAbsolute, parse, resolve, sep } from 'node:path';

export const SANDBOX_EXEC_PATH = '/usr/bin/sandbox-exec';

// Keep this profile fixed. The subject path enters only through sandbox-exec's
// discrete -D parameter, never through interpolation into SBPL or a shell.
export const SUBJECT_ROOT_SBPL = [
  '(version 1)',
  '(allow default)',
  '(deny file-write* (literal (param "SUBJECT_ROOT")))',
  '(deny file-write* (subpath (param "SUBJECT_ROOT")))',
  '(deny file-link (literal (param "SUBJECT_ROOT")))',
  '(deny file-link (subpath (param "SUBJECT_ROOT")))',
].join('\n');

function hasControlCharacter(value) {
  return /[\u0000-\u001F\u007F]/.test(value);
}

/** Validate only user-controlled syntax; filesystem checks happen at spawn time. */
export function validateSubjectRootArgument(subjectRoot) {
  if (typeof subjectRoot !== 'string' || subjectRoot.length === 0) {
    throw new Error('--subject-root requires a non-empty absolute path.');
  }
  if (hasControlCharacter(subjectRoot)) {
    throw new Error('--subject-root rejects NUL and control characters.');
  }
  if (!isAbsolute(subjectRoot)) {
    throw new Error(`--subject-root must be an absolute path (got "${subjectRoot}").`);
  }
  return subjectRoot;
}

function isTooBroad(realSubjectRoot, realHome) {
  const root = parse(realSubjectRoot).root;
  if (realSubjectRoot === root || realSubjectRoot === realHome) return true;
  // Reject home’s parent (normally /Users/<name> → /Users), plus one-component
  // filesystem roots such as /tmp and /private. A project directory below them
  // remains legitimate, including a mkdtemp subject under /tmp.
  if (realSubjectRoot === dirname(realHome)) return true;
  const relative = realSubjectRoot.slice(root.length).split(sep).filter(Boolean);
  return relative.length < 2;
}

/**
 * Build a fail-closed macOS sandbox-exec invocation. Returns null only when
 * the operator did not request a subject root.
 */
export function prepareSubjectRootGuard({
  subjectRoot = null,
  sandbox,
  platform = hostPlatform(),
  sandboxExecPath = SANDBOX_EXEC_PATH,
  realpath = realpathSync,
  stat = statSync,
  home = homedir,
  exists = existsSync,
} = {}) {
  if (subjectRoot == null) return null;
  validateSubjectRootArgument(subjectRoot);
  if (sandbox !== 'read-only') {
    throw new Error('--subject-root is only valid when the effective sandbox is read-only.');
  }
  if (platform !== 'darwin' || !exists(sandboxExecPath)) {
    throw new Error('--subject-root requires macOS /usr/bin/sandbox-exec; refusing to spawn the vendor without a process guard.');
  }
  let realSubjectRoot;
  let realHome;
  try {
    // Do not assume realpath's result preserves caller-controlled syntax
    // invariants. Revalidate the canonical value before building SBPL argv.
    realSubjectRoot = validateSubjectRootArgument(realpath(subjectRoot));
    realHome = realpath(home());
  } catch (err) {
    throw new Error(`--subject-root must exist and resolve successfully: ${err.message}`);
  }
  let subjectStat;
  try {
    subjectStat = stat(realSubjectRoot);
  } catch (err) {
    throw new Error(`--subject-root cannot be stat'ed after realpath: ${err.message}`);
  }
  if (!subjectStat.isDirectory()) {
    throw new Error('--subject-root must resolve to an existing directory.');
  }
  if (isTooBroad(realSubjectRoot, realHome)) {
    throw new Error(`--subject-root "${realSubjectRoot}" is too broad; use a specific project directory, not /, a filesystem root, or your home directory.`);
  }
  return {
    subjectRoot: realSubjectRoot,
    command: sandboxExecPath,
    prefixArgs: ['-p', SUBJECT_ROOT_SBPL, '-D', `SUBJECT_ROOT=${realSubjectRoot}`],
  };
}

/** Wrap a vendor command using argv only. No shell is ever involved. */
export function wrapSubjectRootInvocation(command, args, guard) {
  if (!guard) return { command, args };
  return {
    command: guard.command,
    args: [...guard.prefixArgs, command, ...args],
  };
}
