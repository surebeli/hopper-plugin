// Output.md writer (T-PLUGIN-06)
// Anchor: cli/src/output.js
//
// Per spec §6 T-PLUGIN-06: write .hopper/handoffs/<task-id>-output.md from a
// dispatch result, plus emit suggested queue.md row + COST-LOG.md row edits
// for the user/Leader to manually apply.
//
// Per spec §3 #4 (no harness reaction core): this writer is a pure formatter.
// It does NOT auto-apply queue/cost edits — only suggests them. User remains
// the actuator. Per spec §11 unified user-action gate: any "task done" claim
// requires user verification, which the dispatcher cannot do unilaterally.
//
// Per codex T-06 mini-audit (2026-05-20):
//   F1 — Format MUST match Phase 2 output.md schema (Strategy-as-developer wrote
//        outputs in this order; Recipient sessions expect it).
//   F2 — Long vendor outputs also persisted to <task-id>-output-raw.txt sidecar.
//   F3 — task.id validated as path-safe before file write.
//   F4 — Markdown fence length adapts to embedded backticks; control bytes
//        normalized; metadata fields quoted/sanitized.

import { mkdir, writeFile, access, lstat, realpath } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { validateTaskId as canonicalValidateTaskId } from './validation.js';

const PREVIEW_CHAR_LIMIT = 4096;

// HOPPER-5: budget for the parsed-vendor-text preview embedded into the
// BACKGROUND output.md body (see renderVendorOutputSection). Larger than the
// sync preview because background dispatches are usually reviews/verdicts the
// consumer reads straight from output.md; the full raw stream still lives in
// the sibling <task-id>-output.log.
export const VENDOR_OUTPUT_PREVIEW_LIMIT = 8000;

/**
 * Write the .hopper/handoffs/<task-id>-output.md file based on a dispatch result.
 * Also writes a sidecar <task-id>-output-raw.txt when the vendor output exceeds
 * PREVIEW_CHAR_LIMIT (per codex F2: no information loss).
 *
 * @param {object} args
 * @param {string} args.hopperDir         Path to .hopper/ directory
 * @param {object} args.dispatchResult    Output of executeDispatch / executeWithAdapter
 * @param {boolean} [args.force]          Overwrite existing output.md
 * @returns {Promise<{
 *   path: string,
 *   rawPath: string | null,
 *   content: string,
 *   queueEdit: string,
 *   costEdit: string,
 *   overwritten: boolean
 * }>}
 */
export async function writeOutput({ hopperDir, dispatchResult, force = false, model = null }) {
  const { task, vendor, output, raw } = dispatchResult;
  if (!task || !task.id) throw new Error('writeOutput: dispatchResult.task.id is required');

  // Per codex F3: validate task ID is safe for file path.
  validateTaskId(task.id);

  const handoffDir = join(hopperDir, 'handoffs');
  const path = join(handoffDir, `${task.id}-output.md`);

  // Per codex F3: enforce lexical containment under handoffs/ first
  // (cheap check before any fs work).
  const resolvedPath = resolve(path);
  const resolvedHandoffs = resolve(handoffDir);
  if (!resolvedPath.startsWith(resolvedHandoffs + sep) && resolvedPath !== resolvedHandoffs) {
    throw new Error(`writeOutput: resolved path "${resolvedPath}" escapes handoffs/ — refusing.`);
  }

  await mkdir(handoffDir, { recursive: true });

  // Per codex Phase 3 audit F3: symlink safety. Before any write, verify the
  // target is either absent OR a real file (not a symlink). Also verify the
  // parent handoffs/ dir is not itself a symlink that points outside .hopper/.
  // This prevents an attacker who can plant a symlink at handoffs/T-foo-output.md
  // from making writeFile follow it to e.g. /etc/passwd.
  let exists = false;
  try {
    const st = await lstat(path);
    exists = true;
    if (st.isSymbolicLink()) {
      throw new Error(`writeOutput: output path "${path}" is a symlink — refusing to follow (potential escape).`);
    }
    if (!st.isFile()) {
      throw new Error(`writeOutput: output path "${path}" exists but is not a regular file (type: ${st.isDirectory() ? 'directory' : 'other'}).`);
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  if (exists && !force) {
    throw new Error(`Output file already exists: ${path}. Use --force to overwrite.`);
  }

  // Verify the parent handoffs/ dir's real path is still inside .hopper/.
  // Catches the case where handoffs/ itself was replaced with a symlink to /tmp.
  try {
    const handoffsReal = await realpath(handoffDir);
    const hopperReal = await realpath(hopperDir);
    if (!handoffsReal.startsWith(hopperReal + sep) && handoffsReal !== hopperReal) {
      throw new Error(`writeOutput: handoffs/ real path "${handoffsReal}" escapes hopperDir "${hopperReal}" — refusing.`);
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  // Per codex F2: persist full output to sidecar raw file when truncation would happen.
  // Per codex Phase 3 F3: same symlink check as the main output file.
  const fullText = output.text || '';
  let rawPath = null;
  if (fullText.length > PREVIEW_CHAR_LIMIT) {
    rawPath = join(handoffDir, `${task.id}-output-raw.txt`);
    try {
      const st = await lstat(rawPath);
      if (st.isSymbolicLink()) {
        throw new Error(`writeOutput: sidecar raw path "${rawPath}" is a symlink — refusing.`);
      }
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    await writeFile(rawPath, fullText, 'utf-8');
  }

  const content = renderOutputMarkdown({ task, vendor, output, raw, rawPath, model });
  await writeFile(path, content, 'utf-8');

  return {
    path,
    rawPath,
    content,
    queueEdit: suggestQueueEdit(task, output),
    costEdit: suggestCostEdit(task, vendor, output, raw),
    overwritten: exists,
  };
}

/**
 * Validate task.id is safe for file path use. Per codex Phase 4 audit P1,
 * delegates to the canonical validator in cli/src/validation.js so all
 * entry points share the same regex + '..' check.
 */
export function validateTaskId(id) {
  canonicalValidateTaskId(id);
}

/**
 * Render the output.md content (pure function — exported for testability).
 *
 * Per codex F1: section order MATCHES Phase 2 outputs:
 *   Summary → Files touched → Acceptance verification → Decisions / deviations
 *   → Open questions → Commit → Verdict → Checks → Next recommendation
 *
 * Dispatcher-specific sections (vendor execution metadata, output text, error
 * context, suggested protocol edits) land AFTER the schema, so Recipient
 * sessions see the familiar structure first.
 */
export function renderOutputMarkdown({ task, vendor, output, raw, rawPath = null, model = null }) {
  const today = todayDate();
  const statusBadge = output.status === 'success' ? '[OK]' : '[FAIL]';
  const safeVendor = sanitizeInline(vendor);
  const safeTaskId = sanitizeInline(task.id);
  const safeTaskType = sanitizeInline(task.taskType);
  const safeBrief = task.brief ? sanitizeInline(task.brief) : '(no brief in queue.md)';
  const previewText = truncate(output.text || '', PREVIEW_CHAR_LIMIT);
  const fullTextLen = (output.text || '').length;

  return `# ${safeTaskId} — ${safeTaskType} Output (vendor: ${safeVendor})

## Summary

${safeBrief}

_Recipient to fill: 2-4 sentences describing what was actually delivered._

## Files touched

_Recipient to fill — list created/modified files with one-line rationale each._

- (none recorded by dispatcher; Leader/Recipient updates this section after review)

## Acceptance verification (N/N)

_Recipient to verify each acceptance criterion from \`.hopper/handoffs/leader-tasklist.md\` for this task._

1. ⏳ Criterion 1: ...
2. ⏳ Criterion 2: ...

## Decisions / deviations from spec

_Recipient to fill — any judgment calls or scope changes vs leader-tasklist._

- none

## Open questions for Leader

_(Recipient fills in any questions for Leader, or "none")_

- none

## Commit

_(Leader fills in after commit lands; format: \`<sha> <subject>\`)_

## Verdict

_(Recipient: PASS | PASS_WITH_NOTE | REWORK | FAIL — fill after verifying acceptance criteria)_

## Checks

- Vendor dispatch status: \`${output.status}\` ${statusBadge}
- Subprocess exit code: ${raw.exitCode}${raw.timedOut ? ' (timed out)' : ''}
- Subprocess duration: ${raw.durationMs}ms
- Single-spawn invariant: per executeDispatch spec §3 #4, one dispatch = one subprocess (E2E counter-tested)
- (Recipient to add task-specific checks: tests pass, grep guards, build clean, etc.)

## Next recommendation

_(Recipient fills in after verdict; e.g. "proceed to T-XX" or "REWORK before T-XX")_

---

## Dispatcher execution metadata _(auto-generated)_

- Task ID: \`${safeTaskId}\`
- Task-type: \`${safeTaskType}\`
- Resolved vendor: \`${safeVendor}\`
- Resolved model: \`${model ? sanitizeInline(model) : '(vendor default)'}\`
- Output status: \`${output.status}\`
- Subprocess exit: ${raw.exitCode}
- Duration: ${raw.durationMs}ms
- Timed out: ${raw.timedOut}
- Stdout bytes: ${(raw.stdout || '').length}
- Stderr bytes: ${(raw.stderr || '').length}
- Log file bytes: ${raw.logFileContent === undefined ? 'n/a (no log file)' : (raw.logFileContent || '').length}
- Output text length: ${fullTextLen} chars${rawPath ? ` (full text in sidecar: \`${posixify(rawPath)}\`)` : ''}
- Dispatched: ${today}

## Vendor output text _(preview, ${previewText.length}/${fullTextLen} chars)_

${fence(previewText || '(empty)')}
${rawPath ? `\n_Full vendor output exceeds ${PREVIEW_CHAR_LIMIT}-char preview limit; complete text written to \`${posixify(rawPath)}\`._\n` : ''}
${output.error ? `## Vendor error context\n\n${fence(truncate(output.error, 2000))}\n${raw.stderr ? `\n**Stderr excerpt** (${(raw.stderr || '').length} bytes total):\n\n${fence(truncate(raw.stderr, 1000))}\n` : ''}` : ''}

## Suggested protocol edits _(auto-generated)_

The dispatcher proposes the following edits. **Per spec §11 unified user-action gate: apply only after manual review.** The dispatcher cannot mark this task done unilaterally.

### Suggested queue.md row edit

${fence(suggestQueueEdit(task, output))}

### Suggested COST-LOG.md row (append under current Phase section)

${fence(suggestCostEdit(task, vendor, output, raw))}
`;
}

/**
 * HOPPER-5: render the "Vendor output (parsed)" section for the BACKGROUND
 * output.md body. Background mode (hopper-runner) previously left the vendor's
 * actual answer ONLY in the raw .log — output.md held boilerplate + a status
 * footer — so grok/codex left effectively empty output.md files (the
 * 2026-06-04 retrospective's "no .md produced" finding). This embeds a readable
 * preview of the PARSED text (the answer/verdict the adapter extracted from
 * stdout) directly in output.md, while the full raw stream stays in the .log.
 *
 * Distinct heading from the sync writer's "## Vendor output text" so the two
 * code paths stay greppable/independent. Placed BEFORE the runner's
 * "## Status (background completion)" footer so `--result` (which truncates the
 * body at that footer) still surfaces it.
 *
 * @param {string} text        adapter.parseResult().text (the parsed answer)
 * @param {object} [opts]
 * @param {string} [opts.rawLogName]  basename of the raw .log for the pointer note
 * @returns {string} a leading-newline markdown block
 */
export function renderVendorOutputSection(text, { rawLogName } = {}) {
  const logRef = rawLogName ? `\`${sanitizeInline(rawLogName)}\`` : 'the .log file';
  const full = typeof text === 'string' ? text : '';
  if (!full.trim()) {
    return `\n## Vendor output (parsed)\n\n_(vendor produced no parsed text; see ${logRef} for the raw output stream.)_\n`;
  }
  const preview = truncate(full, VENDOR_OUTPUT_PREVIEW_LIMIT);
  const note = full.length > VENDOR_OUTPUT_PREVIEW_LIMIT
    ? ` _(preview ${VENDOR_OUTPUT_PREVIEW_LIMIT}/${full.length} chars; full raw stream in ${logRef})_`
    : '';
  return `\n## Vendor output (parsed)${note}\n\n${fence(preview)}\n`;
}

/**
 * Generate the suggested queue.md edit (status flip + activity log entry).
 * Pure function exported for testability.
 */
export function suggestQueueEdit(task, output) {
  const newStatus = mapDispatchStatusToQueueStatus(output.status);
  return `# Find row for ${task.id} in .hopper/queue.md
# Change status column: '${task.status}' -> '${newStatus}'
# Also append to Activity log section:
#   - ${todayDate()}: ${task.id} dispatched via hopper-dispatch; vendor=${task.vendor || '(resolved from AGENTS.md)'}; status=${output.status}; see .hopper/handoffs/${task.id}-output.md`;
}

/**
 * Map dispatch output.status to queue.md status column value.
 * Per codex final strict audit P1 (Category A): output must be a LEGAL
 * queue status per the .hopper/queue.md schema {pending, in-progress, done,
 * failed, removed}. Previously suggested 'failure-detected' which is not
 * legal — parser would silently re-eligibilize the task.
 *
 * - success → done
 * - any failure (auth-fail / timeout / permission-fail / unknown-fail) → failed
 *   (Per spec §3 #4: dispatcher does not distinguish retry-worthy from
 *   terminal failures; that's user's call. The user reviews the output.md
 *   error context and decides whether to re-flip from 'failed' back to
 *   'pending' or leave it terminally failed.)
 */
export function mapDispatchStatusToQueueStatus(dispatchStatus) {
  if (dispatchStatus === 'success') return 'done';
  return 'failed';
}

/**
 * Generate the suggested COST-LOG.md row (markdown table row).
 * Token count is "n/a" unless the adapter populated output.usage (most don't yet).
 */
export function suggestCostEdit(task, vendor, output, raw) {
  const date = todayDate();
  const tokenStr = output.usage && output.usage.totalTokens
    ? `~${output.usage.totalTokens}`
    : 'n/a';
  const durationSec = (raw.durationMs / 1000).toFixed(1);
  const notes = output.status === 'success'
    ? `${output.status}; duration ${durationSec}s`
    : `${output.status}; duration ${durationSec}s; error="${truncate((output.error || '').replace(/[\r\n]+/g, ' '), 80)}"`;
  return `| ${date} | ${task.id} | ${task.taskType} | ${vendor} | ${tokenStr} | n/a | n/a | ${notes} |`;
}

// ─── helpers ──────────────────────────────────────────────────────────────

/**
 * Per codex F4: dynamic-length fence. If content contains ``` runs, use a
 * longer fence so the embedded fence cannot terminate ours early.
 */
function fence(content) {
  const safe = stripControl(String(content == null ? '' : content));
  // Find the longest run of backticks in the content
  const matches = safe.match(/`+/g);
  const longest = matches ? Math.max(...matches.map((s) => s.length)) : 0;
  const fenceLen = Math.max(3, longest + 1);
  const f = '`'.repeat(fenceLen);
  return `${f}\n${safe}\n${f}`;
}

/**
 * Per codex F4: replace NUL and other unprintable control bytes with U+FFFD.
 * Preserve \t, \n, \r since they are valid in vendor output transcripts.
 */
function stripControl(s) {
  // Strip control characters that would confuse markdown / terminals
  return s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '�');
}

/**
 * Sanitize a value going into a single-line markdown context (heading,
 * metadata list). Strips newlines + control chars, escapes backticks so they
 * don't break the H1, and clips length.
 */
function sanitizeInline(v) {
  let s = String(v == null ? '' : v);
  s = stripControl(s);
  s = s.replace(/[\r\n]+/g, ' ');
  s = s.replace(/`/g, "'");  // backticks in headings/metadata corrupt the .md
  if (s.length > 200) s = s.slice(0, 197) + '...';
  return s;
}

function truncate(s, n) {
  if (typeof s !== 'string') return '';
  if (s.length <= n) return s;
  return s.slice(0, n) + `\n\n... [truncated, ${s.length - n} chars omitted]`;
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function posixify(p) {
  return p.split(sep).join('/');
}
