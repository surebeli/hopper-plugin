import { strict as assert } from 'node:assert';
import { rmSync } from 'node:fs';

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForPidExit(pid, { isAlive, timeoutMs = 5000, intervalMs = 25 } = {}) {
  assert.equal(typeof isAlive, 'function', 'waitForPidExit requires an isAlive predicate');
  const alive = () => Boolean(pid) && isAlive(pid);
  const deadline = Date.now() + timeoutMs;
  while (alive() && Date.now() < deadline) await delay(intervalMs);
  assert.equal(alive(), false, `PID ${pid} remained alive after ${timeoutMs}ms`);
}

export async function removeWithRetries(path, { attempts = 20, retryDelayMs = 25 } = {}) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      rmSync(path, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts) await delay(retryDelayMs);
    }
  }
  throw lastError;
}

export async function cleanupAfterPidExit(path, pid, {
  pidExitObserved = false,
  isAlive,
  kill,
  remove = removeWithRetries,
} = {}) {
  if (!pidExitObserved && pid && isAlive(pid)) {
    kill(pid, process.platform === 'win32');
    await waitForPidExit(pid, { isAlive });
  }
  await remove(path);
}
