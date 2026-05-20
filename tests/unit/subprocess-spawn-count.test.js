// Real spawn-count test (codex Phase 1 audit F1 fix)
// Anchor: tests/unit/subprocess-spawn-count.test.js
//
// Previous "single-attempt verification" test only checked exit code.
// This test PROVES single-spawn behavior by side-effect counter file.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { runSubprocessOnce } from '../../cli/src/subprocess.js';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('runSubprocessOnce invokes subprocess EXACTLY ONCE per call (real counter)', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-spawn-count-'));
  try {
    const counterFile = join(tmp, 'count.txt');
    writeFileSync(counterFile, '0');

    // Script: read counter, increment, write back, exit with failure
    // If runSubprocessOnce had a retry loop, this would be called multiple times
    const incrementScript = `
      const fs = require('node:fs');
      const file = ${JSON.stringify(counterFile)};
      const n = parseInt(fs.readFileSync(file, 'utf-8')) + 1;
      fs.writeFileSync(file, String(n));
      console.error("invocation " + n);
      process.exit(1);
    `;

    const result = await runSubprocessOnce({
      command: process.execPath,
      args: ['-e', incrementScript],
      stdinInput: null,
      timeoutMs: 10000,
    });

    // The subprocess exited 1, indicating failure
    assert.equal(result.exitCode, 1);
    assert.equal(result.timedOut, false);

    // CRITICAL: counter must be exactly 1 (not 2, not 3, not N)
    // If runSubprocessOnce had retry logic, counter would be > 1
    const finalCount = parseInt(readFileSync(counterFile, 'utf-8'));
    assert.equal(finalCount, 1, `Spawn count must be 1; got ${finalCount}. ` +
      `If >1, runSubprocessOnce has retry logic which violates spec §3 #4.`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('runSubprocessOnce invokes subprocess EXACTLY ONCE on success too', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-spawn-count-success-'));
  try {
    const counterFile = join(tmp, 'count.txt');
    writeFileSync(counterFile, '0');

    const incrementScript = `
      const fs = require('node:fs');
      const file = ${JSON.stringify(counterFile)};
      const n = parseInt(fs.readFileSync(file, 'utf-8')) + 1;
      fs.writeFileSync(file, String(n));
      console.log("success " + n);
      process.exit(0);
    `;

    const result = await runSubprocessOnce({
      command: process.execPath,
      args: ['-e', incrementScript],
      stdinInput: null,
      timeoutMs: 10000,
    });

    assert.equal(result.exitCode, 0);
    const finalCount = parseInt(readFileSync(counterFile, 'utf-8'));
    assert.equal(finalCount, 1, 'success path must also be single-spawn');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('multiple runSubprocessOnce calls produce independent invocations (no caching/memoization)', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-spawn-count-multi-'));
  try {
    const counterFile = join(tmp, 'count.txt');
    writeFileSync(counterFile, '0');

    const incrementScript = `
      const fs = require('node:fs');
      const file = ${JSON.stringify(counterFile)};
      const n = parseInt(fs.readFileSync(file, 'utf-8')) + 1;
      fs.writeFileSync(file, String(n));
      process.exit(0);
    `;

    // Call runSubprocessOnce 3 times with identical args
    // Per codex F1 "no memoization across dispatches", each call must produce a fresh spawn
    for (let i = 0; i < 3; i++) {
      await runSubprocessOnce({
        command: process.execPath,
        args: ['-e', incrementScript],
        stdinInput: null,
        timeoutMs: 10000,
      });
    }

    const finalCount = parseInt(readFileSync(counterFile, 'utf-8'));
    assert.equal(finalCount, 3, `3 identical calls must produce 3 invocations; got ${finalCount}. ` +
      `If <3, there is hidden memoization/caching which violates codex F1.`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
