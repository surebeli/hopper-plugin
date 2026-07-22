import { Router } from 'express';

export function createSseHub({ heartbeatMs = 15000 } = {}) {
  const clients = new Map();
  const registrations = new WeakMap();
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
    const onClose = () => remove(channel, res);
    const onError = () => remove(channel, res, { destroy: true });
    registrations.set(res, { channel, onClose, onError });
    res.once('close', onClose);
    res.once('error', onError);
    if (!safeWrite(res, 'retry: 1000\n', () => remove(channel, res, { end: true }))) return;
    safeWrite(res, format({ event: 'connected', data: { channel, at: new Date().toISOString() } }), () => {
      remove(channel, res, { end: true });
    });
  }

  function publish(channel, event, data) {
    const payload = format({ id: nextId, event, data });
    nextId += 1;
    for (const res of [...(clients.get(channel) || [])]) {
      safeWrite(res, payload, () => remove(channel, res, { end: true }));
    }
  }

  function size(channel) {
    if (channel) return clients.get(channel)?.size || 0;
    let total = 0;
    for (const group of clients.values()) total += group.size;
    return total;
  }

  function close() {
    if (heartbeat) clearInterval(heartbeat);
    for (const [channel, group] of [...clients.entries()]) {
      for (const res of [...group]) remove(channel, res, { end: true });
    }
    clients.clear();
  }

  function writeAll(payload) {
    for (const [channel, group] of clients) {
      for (const res of [...group]) {
        safeWrite(res, payload, () => remove(channel, res, { end: true }));
      }
    }
  }

  function send(res, event, data) {
    const registration = registrations.get(res);
    safeWrite(res, format({ event, data }), () => {
      if (registration) remove(registration.channel, res, { end: true });
      else terminate(res);
    });
  }

  function remove(channel, res, { destroy = false, end = false } = {}) {
    const group = clients.get(channel);
    group?.delete(res);
    if (group?.size === 0) clients.delete(channel);
    const registration = registrations.get(res);
    if (registration) {
      res.off?.('close', registration.onClose);
      res.off?.('error', registration.onError);
      registrations.delete(res);
    }
    if (destroy) destroyResponse(res);
    else if (end) terminate(res);
  }

  return { add, close, publish, send, size };
}

function safeWrite(res, payload, onFailure) {
  if (!res || typeof res.write !== 'function' || res.destroyed || res.writableEnded || res.writable === false) {
    onFailure();
    return false;
  }
  try {
    if (res.write(payload) === false) {
      onFailure();
      return false;
    }
    return true;
  } catch (_) {
    onFailure();
    return false;
  }
}

function terminate(res) {
  if (res?.destroyed || res?.writableEnded) return;
  try {
    res.end?.();
  } catch (_) {
    destroyResponse(res);
  }
}

function destroyResponse(res) {
  if (res?.destroyed) return;
  try {
    res.destroy?.();
  } catch (_) {
    // The client is already unusable; it has been removed from the hub.
  }
}

export function createSseRouter(hub) {
  const router = Router();
  router.get('/queue', (_req, res) => hub.add('queue', res));
  router.get('/task/:id', (req, res) => hub.add(`task/${req.params.id}`, res));
  router.get('/progress/:id', (req, res) => hub.add(`progress/${req.params.id}`, res));
  router.get('/cost', (_req, res) => hub.add('cost', res));
  router.get('/agents', (_req, res) => hub.add('agents', res));
  router.get('/liveness', (_req, res) => hub.add('liveness', res));
  return router;
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
