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

Dev mode starts Vite on `127.0.0.1:5173` and the API server on
`127.0.0.1:7777`.

## Port

```bash
node cli/bin/hopper-dashboard --port 9090
```

The server binds only to `127.0.0.1`.

## Not Supported

- Remote access
- Auth or multi-user mode
- Server-side persistence
- Direct queue mutation from the dashboard
