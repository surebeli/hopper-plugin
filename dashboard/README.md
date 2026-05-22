# Hopper Dashboard

Local read-mostly web dashboard for hopper sidequest work.

## Commands

```bash
npm install
npm run dashboard:build
npm run dashboard:start
```

Open `http://127.0.0.1:7777`.

## Dev

```bash
npm run dashboard:dev
```

Dev mode starts Vite HMR on `127.0.0.1:5173` and the API server on
`127.0.0.1:7777`. Prod mode serves `dashboard/client/dist` from the API
server after `npm run dashboard:build`.

## Port

```bash
node cli/bin/hopper-dashboard --port 9090
```

The server binds only to `127.0.0.1`.

## Shortcuts

- `j` / `k`: move queue selection
- `enter`: open selected task
- `esc`: close task drawer
- `/`: focus queue search
- `g q`, `g v`, `g c`: jump to Queue, Vendors, Cost

## Not Supported

- Remote access
- Auth or multi-user mode
- Server-side persistence
- Direct queue mutation from the dashboard
- Remote dispatch orchestration
