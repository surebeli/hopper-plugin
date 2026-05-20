// Centralized task-id and flag validation (codex Phase 4 audit P1 fix)
// Anchor: cli/src/validation.js
//
// Per Phase 4 audit: previously the regex `^[A-Za-z][A-Za-z0-9._-]{0,99}$`
// was duplicated across:
//   - commands/dispatch.md (prose in Claude Code slash command)
//   - hosts/codex-cli/bin/hopper-codex (bash wrapper)
//   - hosts/opencode/bin/hopper-opencode (bash wrapper)
//   - cli/src/output.js (validateTaskId function)
// and the dispatcher CLI itself had no equivalent validation at entry point.
//
// This module exports the canonical validation. The dispatcher CLI now calls
// it before any work. Wrappers keep their inline regex (defense in depth +
// fast-fail before subprocess invocation) but tests assert the patterns are
// byte-equivalent.

/** Canonical task-id pattern. Matches what dispatch.md / hopper-codex / hopper-opencode enforce. */
export const TASK_ID_PATTERN = /^[A-Za-z][A-Za-z0-9._-]{0,99}$/;

/** Canonical flag whitelist for dispatch invocations. */
export const ALLOWED_DISPATCH_FLAGS = Object.freeze(['--write', '--force']);

/**
 * Validate a task ID. Throws on rejection.
 * Per codex Phase 3 F3 + Phase 4 P1: regex + explicit '..' rejection.
 */
export function validateTaskId(id) {
  if (typeof id !== 'string') throw new Error(`task-id must be string, got ${typeof id}`);
  if (id.length === 0) throw new Error('task-id must not be empty');
  if (id.length > 100) throw new Error(`task-id exceeds 100 chars (got ${id.length})`);
  if (!TASK_ID_PATTERN.test(id)) {
    throw new Error(`task-id "${id}" contains unsafe characters. ` +
      `Allowed: ^[A-Za-z][A-Za-z0-9._-]{0,99}$ (no slashes, no leading dot).`);
  }
  if (id.includes('..')) {
    throw new Error(`task-id "${id}" contains '..' (path traversal).`);
  }
}

/**
 * Validate that all flags are in the allowed whitelist. Throws on rejection.
 * @param {string[]} flags
 */
export function validateDispatchFlags(flags) {
  for (const f of flags) {
    if (!ALLOWED_DISPATCH_FLAGS.includes(f)) {
      throw new Error(`Invalid flag "${f}". Allowed: ${ALLOWED_DISPATCH_FLAGS.join(', ')}.`);
    }
  }
}
