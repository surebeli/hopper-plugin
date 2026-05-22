import chokidar from 'chokidar';
import { basename, join, relative } from 'node:path';

export function createWatcher({
  hopperDir,
  hub,
  logTailer = null,
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
    if (mapped.event === 'log' && logTailer) {
      const chunk = logTailer.readNew(mapped.payload.taskId);
      if (chunk.chunk) hub.publish(mapped.channel, 'log', { ...mapped.payload, ...chunk });
      return;
    }
    if (mapped.event === 'progress' && progressTailer) {
      const chunk = progressTailer.readNew(mapped.payload.taskId);
      if (chunk.chunk) {
        const events = parseProgressEvents(chunk.chunk);
        if (events.length) hub.publish(mapped.channel, 'progress', { ...mapped.payload, ...chunk, events });
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
    join(hopperDir, 'handoffs', '*.log'),
    join(hopperDir, 'COST-LOG.md'),
    join(hopperDir, 'AGENTS.md'),
  ];
}

export function mapFileEvent(hopperDir, type, filePath) {
  const rel = relative(hopperDir, filePath).replace(/\\/g, '/');
  const payload = { type, path: rel, at: new Date().toISOString() };
  if (rel === 'queue.md') return withChannel('queue', 'queue', payload);
  if (rel === 'COST-LOG.md') return withChannel('cost', 'cost', payload);
  if (rel === 'AGENTS.md') return withChannel('agents', 'agents', payload);
  if (rel.startsWith('handoffs/') && rel.endsWith('.md')) {
    return withChannel(`task/${taskIdFromHandoff(filePath)}`, 'task', payload);
  }
  if (rel.startsWith('handoffs/') && rel.endsWith('-progress.log')) {
    const taskId = basename(filePath, '-progress.log');
    return withChannel(`progress/${taskId}`, 'progress', { ...payload, taskId });
  }
  if (rel.startsWith('handoffs/') && rel.endsWith('-output.log')) {
    const taskId = taskIdFromLog(filePath);
    return withChannel(`log/${taskId}`, 'log', { ...payload, taskId });
  }
  return null;
}

function publishLiveness(hub) {
  hub.publish('liveness', 'liveness', {
    channel: 'liveness',
    type: 'tick',
    pid: process.pid,
    at: new Date().toISOString(),
  });
}

function taskIdFromHandoff(filePath) {
  const name = basename(filePath, '.md');
  return name
    .replace(/-REVIEW-.+$/, '')
    .replace(/-leader-feedback$/, '')
    .replace(/-output$/, '');
}

export function taskIdFromLog(filePath) {
  return basename(filePath, '.log').replace(/-output$/, '');
}

function withChannel(channel, event, payload) {
  return { channel, event, payload: { channel, ...payload } };
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
