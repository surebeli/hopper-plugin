import express from 'express';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import actionsRouter from './routes/actions.js';
import costRouter from './routes/cost.js';
import queueRouter from './routes/queue.js';
import taskRouter from './routes/task.js';
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

export function createApp({ dev = false, distDir = DEFAULT_DIST } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, mode: dev ? 'dev' : 'prod' });
  });
  app.use('/api', queueRouter);
  app.use('/api/task', taskRouter);
  app.use('/api/vendors', vendorsRouter);
  app.use('/api/cost', costRouter);
  app.use('/api/action', actionsRouter);

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
  host = '127.0.0.1',
  port = 7777,
  requireDist = !dev,
} = {}) {
  if (host !== '127.0.0.1') throw new Error('hopper-dashboard only binds 127.0.0.1');
  if (requireDist && !existsSync(join(distDir, 'index.html'))) {
    throw new Error('dashboard client dist not found; run `npm run dashboard:build` first');
  }

  const app = createApp({ dev, distDir });
  return new Promise((resolveStart, rejectStart) => {
    const server = app.listen(port, host, () => {
      const address = server.address();
      const actualPort = typeof address === 'object' && address ? address.port : port;
      console.log(`hopper-dashboard listening on http://${host}:${actualPort}`);
      resolveStart({ app, server, host, port: actualPort });
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
