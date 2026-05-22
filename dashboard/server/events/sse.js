import { Router } from 'express';

export function createSseHub({ heartbeatMs = 15000 } = {}) {
  const clients = new Map();
  let nextId = 1;
  const heartbeat = heartbeatMs > 0 ? setInterval(() => writeAll(': heartbeat\n\n'), heartbeatMs) : null;
  heartbeat?.unref?.();

  function add(channel, res) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    if (!clients.has(channel)) clients.set(channel, new Set());
    clients.get(channel).add(res);
    res.write('retry: 1000\n');
    write(res, 'connected', { channel, at: new Date().toISOString() });
    res.on('close', () => clients.get(channel)?.delete(res));
  }

  function publish(channel, event, data) {
    const payload = format({ id: nextId, event, data });
    nextId += 1;
    for (const res of clients.get(channel) || []) res.write(payload);
  }

  function size(channel) {
    if (channel) return clients.get(channel)?.size || 0;
    let total = 0;
    for (const group of clients.values()) total += group.size;
    return total;
  }

  function close() {
    if (heartbeat) clearInterval(heartbeat);
    for (const group of clients.values()) {
      for (const res of group) res.end?.();
    }
    clients.clear();
  }

  function writeAll(payload) {
    for (const group of clients.values()) {
      for (const res of group) res.write(payload);
    }
  }

  function send(res, event, data) {
    write(res, event, data);
  }

  return { add, close, publish, send, size };
}

export function createSseRouter(hub, { logTailer = null } = {}) {
  const router = Router();
  router.get('/queue', (_req, res) => hub.add('queue', res));
  router.get('/task/:id', (req, res) => hub.add(`task/${req.params.id}`, res));
  router.get('/log/:id', (req, res) => {
    hub.add(`log/${req.params.id}`, res);
    if (logTailer) {
      const offset = Number(req.query.offset || 0);
      hub.send(res, 'log', logTailer.readFrom(req.params.id, offset));
    }
  });
  router.get('/progress/:id', (req, res) => hub.add(`progress/${req.params.id}`, res));
  router.get('/cost', (_req, res) => hub.add('cost', res));
  router.get('/agents', (_req, res) => hub.add('agents', res));
  router.get('/liveness', (_req, res) => hub.add('liveness', res));
  return router;
}

function write(res, event, data) {
  res.write(format({ event, data }));
}

function format({ id, event, data }) {
  const lines = [];
  if (id != null) lines.push(`id: ${id}`);
  if (event) lines.push(`event: ${event}`);
  lines.push(`data: ${JSON.stringify(data)}`);
  lines.push('');
  lines.push('');
  return lines.join('\n');
}
