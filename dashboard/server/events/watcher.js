import chokidar from 'chokidar';
import { basename, join, relative } from 'node:path';
import { projectPublicProgressEvents } from '../routes/task.js';
import { validateTaskId } from '../../../cli/src/validation.js';

const PUBLIC_FILE_EVENT_KINDS = new Set(['add', 'change', 'unlink']);

export function createWatcher({
  hopperDir,
  hub,
  progressTailer = null,
  livenessIntervalMs = 5000,
  watch = chokidar.watch,
} = {}) {
  if (!hopperDir || !hub) return { close: async () => {}, paths: [] };

  const paths = watchTargets(hopperDir);
  const watcher = watch(paths, {
    awaitWriteFinish: { pollInterval: 50, stabilityThreshold: 150 },
    ignoreInitial: true,
    persistent: true,
  });
  watcher.on('all', (type, filePath) => {
    const mapped = mapFileEvent(hopperDir, type, filePath);
    if (!mapped) return;
    if (mapped.event === 'progress' && progressTailer) {
      const chunk = progressTailer.readNew(mapped.payload.taskId);
      if (chunk.chunk) {
        const events = projectPublicProgressEvents(parseProgressEvents(chunk.chunk));
        if (events.length) hub.publish(mapped.channel, 'progress', { events });
      }
      return;
    }
    hub.publish(mapped.channel, mapped.event, mapped.payload);
  });
  const liveness = livenessIntervalMs > 0
    ? setInterval(() => publishLiveness(hub), livenessIntervalMs)
    : null;
  liveness?.unref?.();

  return {
    paths,
    close: async () => {
      if (liveness) clearInterval(liveness);
      await watcher.close();
    },
  };
}

export function watchTargets(hopperDir) {
  return [
    join(hopperDir, 'queue.md'),
    join(hopperDir, 'handoffs', '*.md'),
    join(hopperDir, 'handoffs', '*-progress.log'),
    join(hopperDir, 'COST-LOG.md'),
    join(hopperDir, 'AGENTS.md'),
  ];
}

export function mapFileEvent(hopperDir, type, filePath) {
  const rel = relative(hopperDir, filePath).replace(/\\/g, '/');
  const payload = { kind: PUBLIC_FILE_EVENT_KINDS.has(type) ? type : 'unknown', at: new Date().toISOString() };
  if (rel === 'queue.md') return withChannel('queue', 'queue', payload);
  if (rel === 'COST-LOG.md') return withChannel('cost', 'cost', payload);
  if (rel === 'AGENTS.md') return withChannel('agents', 'agents', payload);
  if (rel.startsWith('handoffs/') && rel.endsWith('.md')) {
    const taskId = taskIdFromHandoff(filePath);
    return taskId ? withChannel(`task/${taskId}`, 'task', { ...payload, taskId }) : null;
  }
  if (rel.startsWith('handoffs/') && rel.endsWith('-progress.log')) {
    const taskId = basename(filePath, '-progress.log');
    return safeTaskId(taskId) ? withChannel(`progress/${taskId}`, 'progress', { ...payload, taskId }) : null;
  }
  return null;
}

function publishLiveness(hub) {
  hub.publish('liveness', 'liveness', {
    kind: 'tick',
    at: new Date().toISOString(),
  });
}

function taskIdFromHandoff(filePath) {
  const name = basename(filePath, '.md');
  const taskId = name
    .replace(/-REVIEW-.+$/, '')
    .replace(/-leader-feedback$/, '')
    .replace(/-output$/, '');
  return safeTaskId(taskId) ? taskId : null;
}

function safeTaskId(taskId) {
  try { validateTaskId(taskId); return true; } catch (_) { return false; }
}

function withChannel(channel, event, payload) {
  return { channel, event, payload };
}

function parseProgressEvents(chunk) {
  const events = [];
  for (const line of chunk.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed === 'object') events.push(parsed);
    } catch (_) {
      // Ignore partial or corrupt JSONL lines while tailing live progress.
    }
  }
  return events;
}
