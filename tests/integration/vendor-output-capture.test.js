// HOPPER-5 end-to-end: hopper-runner writes the parsed vendor answer into the
// background output.md body (previously it lived only in the raw .log).
// Anchor: tests/integration/vendor-output-capture.test.js
//
// POSIX-only, like tests/integration/runner-single-spawn.test.js: it PATH-shims
// a fake `codex` binary, which is fragile on Windows (CreateProcessW can't exec
// .cmd directly). renderVendorOutputSection itself is unit-tested cross-platform
// in tests/unit/output-vendor-section.test.js.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFrontmatter } from '../../cli/src/background.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const RUNNER_PATH = join(REPO_ROOT, 'cli', 'bin', 'hopper-runner');
const isWin = platform() === 'win32';

test('HOPPER-5: runner mirrors the parsed vendor answer into output.md body', { skip: isWin }, async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-vout-'));
  try {
    const hopperDir = join(tmp, '.hopper');
    mkdirSync(join(hopperDir, 'handoffs'), { recursive: true });

    // Fake `codex` that prints a sentinel answer to stdout and exits 0.
    const shimDir = join(tmp, 'shim');
    mkdirSync(shimDir);
    const shimPath = join(shimDir, 'codex');
    writeFileSync(shimPath, '#!/usr/bin/env bash\necho "HOPPER5_SENTINEL verdict=PASS"\nexit 0\n', 'utf-8');
    chmodSync(shimPath, 0o755);

    const taskId = 'T-VOUT';
    const outputMdPath = join(hopperDir, 'handoffs', `${taskId}-output.md`);
    const logPath = outputMdPath.replace(/\.md$/, '.log');
    writeFrontmatter(outputMdPath, {
      task_id: taskId,
      adapter: 'codex',
      status: 'in-progress',
      pid: null,
      start_time: new Date().toISOString(),
      mode: 'background',
      log: `./${taskId}-output.log`,
      _body: '',
    });

    await new Promise((resolveP, rejectP) => {
      const child = spawn(process.execPath, [
        RUNNER_PATH,
        '--task-id', taskId,
        '--hopper-dir', hopperDir,
        '--adapter', 'codex',
        '--output-md', outputMdPath,
        '--log', logPath,
        '--',
        'exec', 'noop', '-s', 'read-only',
      ], {
        env: { ...process.env, PATH: shimDir + ':' + (process.env.PATH || ''), HOPPER_RUNNER_INVOKED: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const timer = setTimeout(() => { child.kill('SIGKILL'); rejectP(new Error('runner timeout')); }, 15000);
      child.on('exit', () => { clearTimeout(timer); resolveP(); });
      child.on('error', (err) => { clearTimeout(timer); rejectP(err); });
    });

    const md = readFileSync(outputMdPath, 'utf-8');
    assert.match(md, /## Vendor output \(parsed\)/, 'output.md must contain the parsed vendor section');
    assert.match(md, /HOPPER5_SENTINEL verdict=PASS/, 'output.md must embed the vendor answer');
    // The section appears BEFORE the runner status footer so --result surfaces it.
    assert.ok(
      md.indexOf('## Vendor output (parsed)') < md.indexOf('## Status (background completion)'),
      'vendor section must precede the status footer',
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
