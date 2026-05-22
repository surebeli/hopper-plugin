// v1.0 progress notification verification and redline gates.
// Anchor: tests/unit/progress-redline.test.js

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..', '..');
const WAVE4_OUTPUT = join(REPO_ROOT, 'docs', 'specs', 'background-progress-notification-v1-must-wave4-OUTPUT.md');

function readRepo(path) {
  return readFileSync(join(REPO_ROOT, path), 'utf-8');
}

test('redline: watch-events uses fs.watchFile over output.md, not progress.log', () => {
  const dispatch = readRepo('cli/bin/hopper-dispatch');
  assert.match(dispatch, /watchFile\(/);
  assert.match(dispatch, /endsWith\('-output\.md'\)/);
  assert.doesNotMatch(dispatch, /fs\.watch\(/);
  assert.doesNotMatch(dispatch, /chokidar/i);
  assert.doesNotMatch(dispatch, /watchFile\([^)]*progress/i);
});

test('redline: sync dispatch path remains progress-free', () => {
  for (const path of ['cli/src/dispatch.js', 'cli/src/subprocess.js', 'cli/src/output.js']) {
    const source = readRepo(path);
    assert.doesNotMatch(source, /appendProgressEvent|progressLogPath|progress_log|progress\.log/,
      `${path} must not write or mention progress sidecars in sync mode`);
  }
});

test('redline: Claude monitor is the only v1.0 native host wake bridge', () => {
  const claudeMonitor = readRepo('monitors/monitors.json');
  assert.match(claudeMonitor, /hopper-dispatch/);
  assert.match(claudeMonitor, /--watch-events/);

  for (const path of ['hosts/codex-cli/README.md', 'hosts/opencode/plugins/hopper-async.ts']) {
    const source = readRepo(path);
    assert.doesNotMatch(source, /--watch-events|monitors\/monitors\.json|hopper-watch-events/,
      `${path} must not grow a v1.0 native wake bridge`);
  }
});

test('redline: R18 output records AC subset and deferred reviewer notes', () => {
  assert.ok(existsSync(WAVE4_OUTPUT), 'wave4 OUTPUT must exist for N2 review evidence');
  const output = readFileSync(WAVE4_OUTPUT, 'utf-8');
  for (const ac of ['AC-01', 'AC-03', 'AC-04', 'AC-06', 'AC-11', 'AC-12', 'AC-13']) {
    assert.match(output, new RegExp(`${ac}[^\\n]*(PASS|covered|verified)`, 'i'),
      `${ac} must have verification evidence`);
  }
  for (const note of ['N-w3.1', 'N-w3.2', 'N-w3.3', 'N-w3.4']) {
    assert.match(output, new RegExp(`${note}[^\\n]*(defer|accepted|documented|acknowledged)`, 'i'),
      `${note} must be acknowledged or deferred`);
  }
  assert.match(output, /HOPPER_TEST_ONLY_TIMEOUT_MS.*test-only/i);
});
