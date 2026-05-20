// E2E executeDispatch single-spawn proof (codex Phase 2 audit F3 fix)
// Anchor: tests/integration/execute-dispatch-e2e.test.js
//
// F3 finding: previous tests proved runSubprocessOnce single-spawn in isolation,
// but no test exercised the full chain (resolveDispatch → executeWithAdapter →
// runSubprocessOnce → parseResult). This test fills that gap using a fake
// counter-incrementing adapter that demonstrates end-to-end single-spawn.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { executeWithAdapter } from '../../cli/src/dispatch.js';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Build a fake adapter that increments a counter file on every spawn.
 * Uses process.execPath (node) as the command + an inline script.
 */
function makeCounterAdapter(counterFile, options = {}) {
  const { exitCode = 0, stdoutPrefix = 'OK' } = options;
  return {
    name: 'fake-counter',
    command: process.execPath,
    stdinMode: 'none',
    args: (input, _opts) => [
      '-e',
      `
        const fs = require('node:fs');
        const file = ${JSON.stringify(counterFile)};
        const n = parseInt(fs.readFileSync(file, 'utf-8')) + 1;
        fs.writeFileSync(file, String(n));
        console.log(${JSON.stringify(stdoutPrefix)} + ":invocation " + n);
        console.log("INPUT:" + ${JSON.stringify(input.slice(0, 50))});
        process.exit(${exitCode});
      `,
    ],
    envPreflight: () => ({ ok: true, missing: [] }),
    timeoutMs: () => 30_000,
    parseResult: (raw) => {
      if (raw.exitCode === 0 && raw.stdout) {
        return { text: raw.stdout, status: 'success' };
      }
      return { text: raw.stdout, status: 'unknown-fail', error: `exit ${raw.exitCode}` };
    },
  };
}

test('executeWithAdapter spawns subprocess EXACTLY ONCE on success path (E2E)', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-e2e-success-'));
  try {
    const counterFile = join(tmp, 'count.txt');
    writeFileSync(counterFile, '0');

    const fakeAdapter = makeCounterAdapter(counterFile, { exitCode: 0, stdoutPrefix: 'OK' });

    // Build a minimal "resolved" object (skipping full resolveDispatch which would
    // need temp .hopper/ scaffolding; this directly tests the executeWithAdapter chain)
    const resolved = {
      task: { id: 'T-fake-e2e', taskType: 'code-impl', status: 'pending', depends: [], priority: 'normal', brief: 'e2e', vendor: null },
      vendor: 'fake-counter',
      composedPrompt: 'pretend this is a real task spec',
      frame: '',
      taskSpec: '',
    };

    const result = await executeWithAdapter({ resolved, adapter: fakeAdapter });

    assert.equal(result.output.status, 'success');
    assert.match(result.output.text, /OK:invocation 1/);

    // CRITICAL: counter MUST be exactly 1
    const finalCount = parseInt(readFileSync(counterFile, 'utf-8'));
    assert.equal(finalCount, 1,
      `executeWithAdapter must spawn EXACTLY ONCE; counter == ${finalCount}. ` +
      `If >1, hidden retry/respawn logic exists somewhere in dispatch chain.`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('executeWithAdapter spawns subprocess EXACTLY ONCE on failure path (E2E)', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-e2e-fail-'));
  try {
    const counterFile = join(tmp, 'count.txt');
    writeFileSync(counterFile, '0');

    const fakeAdapter = makeCounterAdapter(counterFile, { exitCode: 1, stdoutPrefix: 'FAIL' });

    const resolved = {
      task: { id: 'T-fake-fail', taskType: 'code-impl', status: 'pending', depends: [], priority: 'normal', brief: 'e2e fail', vendor: null },
      vendor: 'fake-counter',
      composedPrompt: 'pretend this fails',
      frame: '',
      taskSpec: '',
    };

    const result = await executeWithAdapter({ resolved, adapter: fakeAdapter });

    assert.notEqual(result.output.status, 'success', 'fake adapter exits 1; must not be classified success');

    // CRITICAL: counter MUST still be exactly 1 even though subprocess failed
    // If executeWithAdapter had retry logic, counter would be > 1
    const finalCount = parseInt(readFileSync(counterFile, 'utf-8'));
    assert.equal(finalCount, 1,
      `executeWithAdapter must NOT retry on failure; counter == ${finalCount}. ` +
      `Per spec §3 #4: one dispatch = one subprocess attempt.`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('executeWithAdapter aborts BEFORE spawn when envPreflight returns ok=false', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-e2e-preflight-'));
  try {
    const counterFile = join(tmp, 'count.txt');
    writeFileSync(counterFile, '0');

    const fakeAdapter = makeCounterAdapter(counterFile);
    // Override envPreflight to return not-ok
    fakeAdapter.envPreflight = () => ({ ok: false, missing: ['SIMULATED_PREFLIGHT_FAIL'] });

    const resolved = {
      task: { id: 'T-fake-preflight-fail', taskType: 'code-impl', status: 'pending', depends: [], priority: 'normal', brief: '', vendor: null },
      vendor: 'fake-counter',
      composedPrompt: 'should not be sent',
      frame: '',
      taskSpec: '',
    };

    const result = await executeWithAdapter({ resolved, adapter: fakeAdapter });

    assert.equal(result.output.status, 'auth-fail');
    assert.match(result.output.error, /SIMULATED_PREFLIGHT_FAIL/);

    // CRITICAL: counter MUST be 0 — subprocess never spawned
    const finalCount = parseInt(readFileSync(counterFile, 'utf-8'));
    assert.equal(finalCount, 0,
      `executeWithAdapter must abort BEFORE spawn on preflight fail; counter == ${finalCount}. ` +
      `If >0, the preflight gate is broken.`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('multiple executeWithAdapter calls each spawn independently (no cross-call state)', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hopper-e2e-multi-'));
  try {
    const counterFile = join(tmp, 'count.txt');
    writeFileSync(counterFile, '0');

    const fakeAdapter = makeCounterAdapter(counterFile);
    const resolved = {
      task: { id: 'T-fake-multi', taskType: 'code-impl', status: 'pending', depends: [], priority: 'normal', brief: '', vendor: null },
      vendor: 'fake-counter',
      composedPrompt: 'task',
      frame: '',
      taskSpec: '',
    };

    // 5 sequential executeWithAdapter calls
    for (let i = 0; i < 5; i++) {
      await executeWithAdapter({ resolved, adapter: fakeAdapter });
    }

    const finalCount = parseInt(readFileSync(counterFile, 'utf-8'));
    assert.equal(finalCount, 5,
      `5 calls must produce 5 invocations; got ${finalCount}. ` +
      `If <5, there is hidden memoization/caching in the dispatch chain.`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
