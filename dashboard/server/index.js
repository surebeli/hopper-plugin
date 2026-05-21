import express from 'express';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import actionsRouter from './routes/actions.js';
import costRouter from './routes/cost.js';
import { createSseHub, createSseRouter } from './events/sse.js';
import { createWatcher } from './events/watcher.js';
import { findHopperDir } from './lib/hopper-dir.js';
import { createLogTailer } from './lib/tail.js';
import { createQueueRouter } from './routes/queue.js';
import { createTaskRouter } from './routes/task.js';
import vendorsRouter from './routes/vendors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DEFAULT_DIST = resolve(__dirname, '..', 'client', 'dist');

export function parseServerArgs(argv = process.argv.slice(2)) {
  const opts = { dev: false, host: '127.0.0.1', port: 7777 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dev') {
      opts.dev = true;
      continue;
    }
    if (arg === '--port') {
      const value = argv[i + 1];
      if (!value || value.startsWith('-')) throw new Error('--port requires a value');
      const port = Number(value);
      if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('--port must be 1-65535');
      opts.port = port;
      i += 1;
      continue;
    }
    if (arg === '--host') {
      const value = argv[i + 1];
      if (value !== '127.0.0.1') throw new Error('hopper-dashboard only binds 127.0.0.1');
      opts.host = value;
      i += 1;
      continue;
    }
    throw new Error(`unknown flag ${arg}`);
  }
  return opts;
}

export function createApp({ dev = false, distDir = DEFAULT_DIST, hopperDir = null, sseHub = createSseHub(), logTailer = null } = {}) {
  const app = express();
  const root = hopperDir || findHopperDir();
  const tailer = logTailer || createLogTailer({ hopperDir: root });
  app.locals.sseHub = sseHub;
  app.locals.logTailer = tailer;
  app.disable('x-powered-by');
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, mode: dev ? 'dev' : 'prod' });
  });
  app.use('/api', createQueueRouter({ hopperDir: root }));
  app.use('/api/task', createTaskRouter({ hopperDir: root }));
  app.use('/api/vendors', vendorsRouter);
  app.use('/api/cost', costRouter);
  app.use('/api/action', actionsRouter);
  app.use('/events', createSseRouter(sseHub, { logTailer: tailer }));

  if (dev) {
    app.get('/', (_req, res) => res.type('text').send('hopper dashboard api online'));
    return app;
  }

  app.use(express.static(distDir));
  app.use((req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/events')) return next();
    res.sendFile(join(distDir, 'index.html'));
  });
  return app;
}

export function startServer({
  dev = false,
  distDir = DEFAULT_DIST,
  hopperDir = null,
  host = '127.0.0.1',
  port = 7777,
  requireDist = !dev,
  watchEvents = true,
  watcherFactory = createWatcher,
} = {}) {
  if (host !== '127.0.0.1') throw new Error('hopper-dashboard only binds 127.0.0.1');
  if (requireDist && !existsSync(join(distDir, 'index.html'))) {
    throw new Error('dashboard client dist not found; run `npm run dashboard:build` first');
  }

  const app = createApp({ dev, distDir, hopperDir });
  return new Promise((resolveStart, rejectStart) => {
    let watcher = null;
    let closed = false;
    const server = app.listen(port, host, () => {
      const address = server.address();
      const actualPort = typeof address === 'object' && address ? address.port : port;
      const root = hopperDir || findHopperDir();
      if (watchEvents && root) {
        watcher = watcherFactory({ hopperDir: root, hub: app.locals.sseHub, logTailer: app.locals.logTailer });
      }
      const close = async () => {
        if (closed) return;
        closed = true;
        app.locals.sseHub.close();
        await watcher?.close();
        await new Promise((resolveClose) => server.close(resolveClose));
      };
      server.once('close', () => {
        if (!closed) {
          closed = true;
          void watcher?.close();
          app.locals.sseHub.close();
        }
      });
      console.log(`hopper-dashboard listening on http://${host}:${actualPort}`);
      resolveStart({ app, close, server, watcher, host, port: actualPort });
    });
    server.once('error', rejectStart);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const opts = parseServerArgs();
    await startServer(opts);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
