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

/** Canonical bare flag whitelist for dispatch invocations. */
export const ALLOWED_DISPATCH_FLAGS = Object.freeze(['--write', '--force', '--background']);

/** Value-taking flag whitelist (each consumes the next argv as its value). */
export const ALLOWED_DISPATCH_VALUE_FLAGS = Object.freeze(['--model', '--reasoning']);

/**
 * Model-name pattern: alphanumeric + . - _ / : (for namespaced model strings
 * like `gpt-5.5`, `claude-opus-4-7`, `deepseek/v4-flash`, `org/model:tag`).
 * Per cross-host validation discipline: same regex applies at every entry
 * point (CLI / dispatch.md / Tier C wrappers).
 */
export const MODEL_PATTERN = /^[A-Za-z][A-Za-z0-9._/:-]{0,99}$/;

/**
 * Reasoning effort whitelist. Matches codex CLI's vocabulary; kimi/opencode/
 * copilot adapters may or may not honor this opt — they ignore unrecognized
 * opts harmlessly. agy currently ignores it.
 *
 * Per Phase 6b vendor-introspection research 2026-05-21: codex actually
 * supports 5 levels (`minimal | low | medium | high | xhigh`), not 4.
 * Our prior whitelist missed `minimal`. Source: official codex config-reference.
 */
export const ALLOWED_REASONING = Object.freeze(['minimal', 'low', 'medium', 'high', 'xhigh']);

/**
 * Legal queue status values per .hopper/queue.md schema convention.
 * Per codex final strict audit P1 (Category A): the parser previously mapped
 * unknown statuses to 'pending' silently, which meant a "failure-detected"
 * task would be re-eligibilized. Statuses are now validated explicitly.
 */
export const LEGAL_QUEUE_STATUSES = Object.freeze([
  'pending',
  'in-progress',
  'done',
  'failed',
  'removed',
]);

/**
 * Task-type pattern. Names a .hopper/tasks/<type>.md file directly, so it
 * needs the same path-safety guarantees as task-id.
 * Per codex final strict audit P1 (Category E): tasks.js previously did
 * `join(hopperDir, 'tasks', `${taskType}.md`)` without validation; a
 * malicious queue row could escape via '../' or absolute path.
 */
export const TASK_TYPE_PATTERN = /^[a-z][a-z0-9-]{0,49}$/;

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
 * Validate that all bare flags are in the allowed whitelist. Throws on rejection.
 * @param {string[]} flags
 */
export function validateDispatchFlags(flags) {
  for (const f of flags) {
    if (!ALLOWED_DISPATCH_FLAGS.includes(f)) {
      throw new Error(`Invalid flag "${f}". Allowed: ${ALLOWED_DISPATCH_FLAGS.join(', ')}.`);
    }
  }
}

/**
 * Validate a model name. Throws on rejection.
 *
 * Note: model strings are passed as argv to vendor CLIs, not used as file
 * paths, so the regex enforces shell-safety (no metachars, no spaces) rather
 * than path-safety. The character class intentionally permits `/` and `:`
 * because real model names like `deepseek/v4-flash` and `org/model:tag` use
 * them; these are not interpreted as path separators by the receiving CLI.
 */
export function validateModelName(model) {
  if (typeof model !== 'string') throw new Error(`--model value must be string, got ${typeof model}`);
  if (model.length === 0) throw new Error('--model value must not be empty');
  if (!MODEL_PATTERN.test(model)) {
    throw new Error(`--model "${model}" contains unsafe characters. ` +
      `Allowed: ^[A-Za-z][A-Za-z0-9._/:-]{0,99}$ (no shell metachars, no spaces).`);
  }
}

/**
 * Validate a reasoning effort level. Throws on rejection.
 */
export function validateReasoning(reasoning) {
  if (typeof reasoning !== 'string') throw new Error(`--reasoning value must be string, got ${typeof reasoning}`);
  if (!ALLOWED_REASONING.includes(reasoning)) {
    throw new Error(`--reasoning "${reasoning}" invalid. Allowed: ${ALLOWED_REASONING.join(', ')}.`);
  }
}

/**
 * Enforce the product rule that a host must not dispatch back into the same
 * vendor identity. Hosts are allowed to omit hostVendor (standalone path).
 *
 * @param {string | undefined} hostVendor
 * @param {string} resolvedVendor
 */
export function validateHostVendorSeparation(hostVendor, resolvedVendor) {
  if (!hostVendor) return;
  if (typeof resolvedVendor !== 'string' || resolvedVendor.length === 0) {
    throw new Error(`resolved vendor must be non-empty string, got ${typeof resolvedVendor}`);
  }
  if (hostVendor === resolvedVendor) {
    throw new Error(
      `Host '${hostVendor}' cannot dispatch to the same vendor '${resolvedVendor}'. ` +
      `hopper-plugin requires host != vendor. Choose a different vendor in .hopper/AGENTS.md or invoke from a different host.`
    );
  }
}

/**
 * Validate a task-type string. Per codex final strict audit P1 (Category E):
 * task-type names a `.hopper/tasks/<type>.md` file path, so it must be
 * lowercase, kebab-case, no path separators, no '..'.
 */
export function validateTaskType(taskType) {
  if (typeof taskType !== 'string') throw new Error(`task-type must be string, got ${typeof taskType}`);
  if (taskType.length === 0) throw new Error('task-type must not be empty');
  if (!TASK_TYPE_PATTERN.test(taskType)) {
    throw new Error(`task-type "${taskType}" contains unsafe characters. ` +
      `Allowed: ^[a-z][a-z0-9-]{0,49}$ (lowercase kebab-case, no slashes, no '..').`);
  }
  if (taskType.includes('..')) {
    throw new Error(`task-type "${taskType}" contains '..' (path traversal).`);
  }
}

/**
 * Returns true if status is a legal queue status, false otherwise.
 * Caller decides whether to throw or just warn.
 */
export function isLegalQueueStatus(status) {
  return LEGAL_QUEUE_STATUSES.includes(status);
}
