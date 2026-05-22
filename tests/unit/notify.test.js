// OS notification helper tests.
// Anchor: tests/unit/notify.test.js

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { EventEmitter } from 'node:events';

import { notify, quoteAppleScript, quotePowerShell } from '../../cli/src/notify.js';

test('Windows: spawns PowerShell BurntToast command', async () => {
  const spawn = mockSpawn([{ code: 0 }]);
  const result = await notify({
    title: 'hopper: T-1',
    message: 'codex done',
    _platform: 'win32',
    _spawn: spawn,
  });

  assert.equal(result.ok, true);
  assert.equal(result.mechanism, 'burnt-toast');
  assert.equal(spawn.calls.length, 1);
  assert.equal(spawn.calls[0].command, 'powershell');
  assert.match(spawn.calls[0].args.join(' '), /New-BurntToastNotification/);
});

test('Windows: falls through from BurntToast failure to MessageBox', async () => {
  const spawn = mockSpawn([{ code: 1, stderr: 'missing module' }, { code: 0 }]);
  const result = await notify({
    title: 'hopper: T-2',
    message: 'codex failed',
    _platform: 'win32',
    _spawn: spawn,
  });

  assert.equal(result.ok, true);
  assert.equal(result.mechanism, 'powershell-mbox');
  assert.equal(spawn.calls.length, 2);
  assert.match(spawn.calls[1].args.join(' '), /System\.Windows\.Forms/);
  assert.match(spawn.calls[1].args.join(' '), /MessageBox/);
});

test('macOS: spawns osascript with escaped notification script', async () => {
  const spawn = mockSpawn([{ code: 0 }]);
  const result = await notify({
    title: 'hopper "quoted"',
    message: 'done "ok"',
    _platform: 'darwin',
    _spawn: spawn,
  });

  assert.equal(result.ok, true);
  assert.equal(result.mechanism, 'osascript');
  assert.equal(spawn.calls[0].command, 'osascript');
  assert.deepEqual(spawn.calls[0].args.slice(0, 1), ['-e']);
  assert.match(spawn.calls[0].args[1], /display notification "done \\"ok\\""/);
  assert.match(spawn.calls[0].args[1], /with title "hopper \\"quoted\\""/);
});

test('Linux: spawns notify-send with title and message as separate args', async () => {
  const spawn = mockSpawn([{ code: 0 }]);
  const result = await notify({
    title: 'hopper: T-3',
    message: 'opencode done',
    _platform: 'linux',
    _spawn: spawn,
  });

  assert.equal(result.ok, true);
  assert.equal(result.mechanism, 'notify-send');
  assert.equal(spawn.calls[0].command, 'notify-send');
  assert.deepEqual(spawn.calls[0].args, ['hopper: T-3', 'opencode done']);
});

test('HOPPER_NOTIFY=0 disables notification without spawning', async () => {
  const spawn = mockSpawn([{ code: 0 }]);
  const result = await notify({
    title: 'hopper: T-4',
    message: 'done',
    _platform: 'linux',
    _spawn: spawn,
    _env: { HOPPER_NOTIFY: '0' },
  });

  assert.equal(result.ok, false);
  assert.equal(result.mechanism, 'disabled');
  assert.equal(spawn.calls.length, 0);
});

test('shell injection strings are quoted or passed without shell splitting', async () => {
  const hostile = "hopper '; rm -rf /;";
  assert.equal(quotePowerShell(hostile), "'hopper ''; rm -rf /;'");
  assert.equal(quoteAppleScript('say "hi"'), '"say \\"hi\\""');

  const spawn = mockSpawn([{ code: 0 }]);
  await notify({
    title: hostile,
    message: 'done',
    _platform: 'linux',
    _spawn: spawn,
  });

  assert.equal(spawn.calls[0].args[0], hostile);
  assert.equal(spawn.calls[0].options.shell, undefined);
});

test('spawn timeout kills child and returns timeout without throwing', async () => {
  const spawn = mockSpawn([{ hang: true }]);
  const result = await notify({
    title: 'hopper: T-5',
    message: 'done',
    _platform: 'linux',
    _spawn: spawn,
    _timeoutMs: 10,
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, 'timeout');
  assert.equal(spawn.calls[0].child.killed, true);
});

test('spawn errors never throw into caller', async () => {
  const throwingSpawn = Object.assign(() => {
    throw new Error('spawn failed');
  }, { calls: [] });

  const result = await notify({
    title: 'hopper: T-6',
    message: 'done',
    _platform: 'linux',
    _spawn: throwingSpawn,
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /spawn failed/);
});

function mockSpawn(scenarios) {
  const calls = [];
  const fn = (command, args, options) => {
    const scenario = scenarios[calls.length] || { code: 0 };
    const child = new EventEmitter();
    child.stderr = new EventEmitter();
    child.killed = false;
    child.kill = () => { child.killed = true; };
    calls.push({ command, args, options, child });

    if (!scenario.hang) {
      queueMicrotask(() => {
        if (scenario.stderr) child.stderr.emit('data', scenario.stderr);
        if (scenario.error) child.emit('error', scenario.error);
        else child.emit('exit', scenario.code ?? 0, scenario.signal ?? null);
      });
    }
    return child;
  };
  fn.calls = calls;
  return fn;
}
