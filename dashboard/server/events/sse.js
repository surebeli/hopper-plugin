export function createSseHub() {
  const clients = new Set();
  return {
    size: () => clients.size,
    add: (res) => {
      clients.add(res);
      res.on('close', () => clients.delete(res));
    },
    send: (event, data) => {
      const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      for (const res of clients) res.write(payload);
    },
  };
}
