import chokidar from 'chokidar';
import { basename, join, relative } from 'node:path';

export function createWatcher({
  hopperDir,
  hub,
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
    if (mapped) hub.publish(mapped.channel, mapped.event, mapped.payload);
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
  if (rel.startsWith('handoffs/') && rel.endsWith('.log')) {
    return withChannel(`log/${taskIdFromLog(filePath)}`, 'log', payload);
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
  return name.replace(/-REVIEW-.+$/, '').replace(/-output$/, '');
}

function taskIdFromLog(filePath) {
  return basename(filePath, '.log').replace(/-output$/, '');
}

function withChannel(channel, event, payload) {
  return { channel, event, payload: { channel, ...payload } };
}
