// Best-effort OS notification helpers for watcher consumers.
// Anchor: cli/src/notify.js

import { spawn as defaultSpawn } from 'node:child_process';

const NOTIFY_TIMEOUT_MS = 5000;

/**
 * Best-effort OS-level toast notification.
 * Never throws. Never modifies caller exit code. Honors HOPPER_NOTIFY=0 disable.
 *
 * @param {object} args
 * @param {string} args.title short notification title
 * @param {string} args.message notification body
 * @param {string} [args.taskId] optional task id for deep-link context
 * @param {Function} [args._spawn] test injection for child_process.spawn
 * @param {string} [args._platform] test injection for process.platform
 * @param {object} [args._env] test injection for process.env
 * @param {number} [args._timeoutMs] test injection for timeout duration
 * @returns {Promise<{ ok: boolean, platform: string, mechanism: string|null, error?: string }>}
 */
export async function notify({
  title,
  message,
  taskId = '',
  _spawn = defaultSpawn,
  _platform = process.platform,
  _env = process.env,
  _timeoutMs = NOTIFY_TIMEOUT_MS,
}) {
  const platform = _platform;
  if (_env.HOPPER_NOTIFY === '0') {
    return { ok: false, platform, mechanism: 'disabled' };
  }

  try {
    const normalized = normalizeNotification({ title, message, taskId });
    if (platform === 'win32') return await notifyWindows(normalized, _spawn, _timeoutMs);
    if (platform === 'darwin') return await notifyMac(normalized, _spawn, _timeoutMs);
    if (platform === 'linux') return await notifyLinux(normalized, _spawn, _timeoutMs);
    return { ok: false, platform, mechanism: 'unsupported', error: `unsupported platform: ${platform}` };
  } catch (err) {
    return { ok: false, platform, mechanism: null, error: errorMessage(err) };
  }
}

async function notifyWindows(payload, spawnImpl, timeoutMs) {
  const burntToast = await runCommand(spawnImpl, 'powershell', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    [
      'Import-Module BurntToast -ErrorAction Stop;',
      `New-BurntToastNotification -Text ${quotePowerShell(payload.title)},${quotePowerShell(payload.message)} -ErrorAction Stop`,
    ].join(' '),
  ], timeoutMs);
  if (burntToast.ok) return { ok: true, platform: 'win32', mechanism: 'burnt-toast' };

  const messageBox = await runCommand(spawnImpl, 'powershell', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    [
      'Add-Type -AssemblyName System.Windows.Forms;',
      `[System.Windows.Forms.MessageBox]::Show(${quotePowerShell(payload.message)}, ${quotePowerShell(payload.title)}) | Out-Null`,
    ].join(' '),
  ], timeoutMs);
  if (messageBox.ok) return { ok: true, platform: 'win32', mechanism: 'powershell-mbox' };

  return {
    ok: false,
    platform: 'win32',
    mechanism: 'unsupported',
    error: messageBox.error || burntToast.error || 'notification command failed',
  };
}

async function notifyMac(payload, spawnImpl, timeoutMs) {
  const script = `display notification ${quoteAppleScript(payload.message)} with title ${quoteAppleScript(payload.title)}`;
  const result = await runCommand(spawnImpl, 'osascript', ['-e', script], timeoutMs);
  return result.ok
    ? { ok: true, platform: 'darwin', mechanism: 'osascript' }
    : { ok: false, platform: 'darwin', mechanism: 'osascript', error: result.error };
}

async function notifyLinux(payload, spawnImpl, timeoutMs) {
  const result = await runCommand(spawnImpl, 'notify-send', [payload.title, payload.message], timeoutMs);
  return result.ok
    ? { ok: true, platform: 'linux', mechanism: 'notify-send' }
    : { ok: false, platform: 'linux', mechanism: 'notify-send', error: result.error };
}

function normalizeNotification({ title, message, taskId }) {
  const safeTitle = String(title || 'hopper');
  const safeMessage = String(message || taskId || 'task completed');
  return {
    title: taskId ? `${safeTitle}` : safeTitle,
    message: safeMessage,
  };
}

export function quotePowerShell(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

export function quoteAppleScript(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n')}"`;
}

function runCommand(spawnImpl, command, args, timeoutMs) {
  return new Promise((resolve) => {
    let child;
    let stderr = '';
    let settled = false;
    let timer;

    function finish(result) {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(result);
    }

    try {
      child = spawnImpl(command, args, {
        stdio: ['ignore', 'ignore', 'pipe'],
        windowsHide: true,
      });
    } catch (err) {
      finish({ ok: false, error: errorMessage(err) });
      return;
    }

    if (!child || typeof child.once !== 'function') {
      finish({ ok: false, error: 'spawn did not return a child process' });
      return;
    }

    if (child.stderr && typeof child.stderr.on === 'function') {
      child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    }
    child.once('error', (err) => finish({ ok: false, error: errorMessage(err) }));
    child.once('exit', (code, signal) => {
      if (code === 0) {
        finish({ ok: true });
        return;
      }
      const reason = signal ? `signal ${signal}` : `exit ${code}`;
      finish({ ok: false, error: stderr.trim() || reason });
    });

    timer = setTimeout(() => {
      try {
        if (typeof child.kill === 'function') child.kill();
      } catch (_) {
        // Toast is best-effort; kill failures should not escape.
      }
      finish({ ok: false, error: 'timeout' });
    }, timeoutMs);
  });
}

function errorMessage(err) {
  return err && typeof err.message === 'string' ? err.message : String(err);
}
