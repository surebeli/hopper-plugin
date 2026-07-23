// T6: --jobs retains its in-progress table and lists only closed recovered terminal records.
// Anchor: tests/unit/jobs-recovered-output.test.js

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = resolve(fileURLToPath(import.meta.url), '..', '..', '..', 'cli', 'bin', 'hopper-dispatch');

function writeTask(handoffs, {
  id,
  status,
  recoveredOutput = false,
  recoveredOutputState = 'no-text',
  recoveredOutputSource = 'none',
  pid = undefined,
}) {
  const fields = [
    '---',
    `task_id: ${id}`,
    'adapter: opencode',
    `status: ${status}`,
    `phase: ${status}`,
    `recovered_output: ${recoveredOutput}`,
    `recovered_output_state: ${recoveredOutputState}`,
    `recovered_output_source: ${recoveredOutputSource}`,
  ];
  if (pid !== undefined) fields.push(`pid: ${pid}`, 'start_time: 2026-07-23T00:00:00.000Z');
  fields.push('---', '', '# Safe output', '');
  writeFileSync(join(handoffs, `${id}-output.md`), fields.join('\n'), 'utf8');
}

test('T6: --jobs preserves failed status while appending recovered terminal advisory suffixes', () => {
  const root = mkdtempSync(join(tmpdir(), 'hopper-jobs-recovery-'));
  const hopper = join(root, '.hopper');
  const handoffs = join(hopper, 'handoffs');
  mkdirSync(handoffs, { recursive: true });
  try {
    writeTask(handoffs, {
      id: 'T-RECOVERED',
      status: 'failed',
      recoveredOutput: true,
      recoveredOutputState: 'unknown-completeness',
      recoveredOutputSource: 'event-stream',
    });
    writeTask(handoffs, {
      id: 'T-VERIFIED',
      status: 'failed',
      recoveredOutput: true,
      recoveredOutputState: 'verified-complete',
      recoveredOutputSource: 'event-stream',
    });
    writeTask(handoffs, { id: 'T-NO-TEXT', status: 'failed' });
    writeTask(handoffs, { id: 'T-IN-PROGRESS', status: 'in-progress', pid: process.pid });

    const result = spawnSync(process.execPath, [BIN, '--jobs'], {
      encoding: 'utf8', env: { ...process.env, HOPPER_DIR: hopper },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /TASK ID\s+VENDOR\s+PID\s+AGE\s+ALIVE\s+STARTED/);
    assert.match(result.stdout, /T-IN-PROGRESS/);
    assert.match(result.stdout, /Recovered terminal output:/);
    assert.match(result.stdout, /T-RECOVERED\s+status: failed; recovered-output: unknown-completeness \(advisory\)/);
    assert.match(result.stdout, /T-VERIFIED\s+status: failed; recovered-output: verified-complete \(parser terminal marker; task remains failed\)/);
    assert.match(result.stdout, /Next steps: each listed task remains failed\. Read only its parser-designated text with `hopper-dispatch --result <task-id> --full`; unknown-completeness is advisory and must be independently verified\. Do not derive findings from raw \.log diagnostics\./);
    assert.doesNotMatch(result.stdout, /T-NO-TEXT\s+status: failed; recovered-output/);
    assert.doesNotMatch(result.stdout, /failed-with-recovered-output/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
