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

import { mkdir, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Write the .hopper/handoffs/<task-id>-output.md file based on a dispatch result.
 *
 * @param {object} args
 * @param {string} args.hopperDir         Path to .hopper/ directory
 * @param {object} args.dispatchResult    Output of executeDispatch / executeWithAdapter
 * @param {boolean} [args.force]          Overwrite existing output.md
 * @returns {Promise<{
 *   path: string,
 *   content: string,
 *   queueEdit: string,
 *   costEdit: string,
 *   overwritten: boolean
 * }>}
 */
export async function writeOutput({ hopperDir, dispatchResult, force = false }) {
  const { task, vendor, output, raw } = dispatchResult;
  if (!task || !task.id) throw new Error('writeOutput: dispatchResult.task.id is required');

  const handoffDir = join(hopperDir, 'handoffs');
  const path = join(handoffDir, `${task.id}-output.md`);

  let exists = false;
  try {
    await access(path);
    exists = true;
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  if (exists && !force) {
    throw new Error(`Output file already exists: ${path}. Use --force to overwrite.`);
  }

  await mkdir(handoffDir, { recursive: true });
  const content = renderOutputMarkdown({ task, vendor, output, raw });
  await writeFile(path, content, 'utf-8');

  return {
    path,
    content,
    queueEdit: suggestQueueEdit(task, output),
    costEdit: suggestCostEdit(task, vendor, output, raw),
    overwritten: exists,
  };
}

/**
 * Render the output.md content (pure function — exported for testability).
 */
export function renderOutputMarkdown({ task, vendor, output, raw }) {
  const today = todayDate();
  const statusBadge = output.status === 'success' ? '[OK]' : '[FAIL]';
  const textPreview = truncate(output.text || '', 4096);
  const errorSection = output.error
    ? `## Error context

\`\`\`
${truncate(output.error, 2000)}
\`\`\`
${raw.stderr ? `\nStderr excerpt:\n\`\`\`\n${truncate(raw.stderr, 1000)}\n\`\`\`\n` : ''}`
    : '';

  return `# ${task.id} — ${task.taskType} Output (${vendor})

## Summary

Vendor: \`${vendor}\` | Status: **${output.status}** ${statusBadge} | Duration: ${raw.durationMs}ms | Exit: ${raw.exitCode}${raw.timedOut ? ' (TIMED OUT)' : ''}

${task.brief || '(no brief in queue.md)'}

## Vendor execution metadata

- Task ID: \`${task.id}\`
- Task-type: \`${task.taskType}\`
- Vendor: \`${vendor}\`
- Status: \`${output.status}\`
- Duration: ${raw.durationMs}ms
- Exit code: ${raw.exitCode}
- Timed out: ${raw.timedOut}
- Dispatched: ${today}

## Output text

\`\`\`
${textPreview || '(empty)'}
\`\`\`

${errorSection}

## Acceptance verification

_Recipient (Leader or Strategy) to fill in by reviewing leader-tasklist.md acceptance criteria._

- [ ] Criterion 1: ...
- [ ] Criterion 2: ...

## Suggested protocol edits

The dispatcher proposes the following edits. **Per spec §11 unified user-action gate: apply only after manual review.** The dispatcher cannot mark this task done unilaterally.

### Suggested queue.md row edit

\`\`\`
${suggestQueueEdit(task, output)}
\`\`\`

### Suggested COST-LOG.md row (append under current Phase section)

\`\`\`
${suggestCostEdit(task, vendor, output, raw)}
\`\`\`

## Open questions

_(Recipient fills in any questions for Leader, or "none")_

## Commit

_(Leader fills in after commit lands; format: \`<sha> <subject>\`)_
`;
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
 * - success → done
 * - all other statuses → failure-detected (per spec §3 #4: dispatcher does not
 *   distinguish retry-worthy from terminal failures; that's user's call)
 */
export function mapDispatchStatusToQueueStatus(dispatchStatus) {
  if (dispatchStatus === 'success') return 'done';
  return 'failure-detected';
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
    : `${output.status}; duration ${durationSec}s; error="${truncate((output.error || '').replace(/\n/g, ' '), 80)}"`;
  return `| ${date} | ${task.id} | ${task.taskType} | ${vendor} | ${tokenStr} | n/a | n/a | ${notes} |`;
}

function truncate(s, n) {
  if (typeof s !== 'string') return '';
  if (s.length <= n) return s;
  return s.slice(0, n) + `\n\n... [truncated, ${s.length - n} chars omitted]`;
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}
