import { createServer } from 'node:http';

// Deployment bootstrap; multiplayer rooms and physics will be added here later.
const port = Number(process.env.PORT || 10000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}

const server = createServer((request, response) => {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');

  const send = (status, body) => {
    response.writeHead(status);
    response.end(request.method === 'HEAD' ? undefined : JSON.stringify(body));
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD');
    send(405, { error: 'Method not allowed' });
    return;
  }

  const path = request.url.split('?')[0];
  if (path === '/health') {
    send(200, { ok: true });
  } else if (path === '/') {
    send(200, {
      service: 'kozlogon-server',
      status: 'online',
      multiplayerReady: false,
      message: 'Сервер запущен. Мультиплеер ещё в разработке.',
      gameUrl: 'https://blumbutta.github.io/kozlogon/',
    });
  } else {
    send(404, { error: 'Not found' });
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Kozlogon server listening on port ${port}`);
});

let closing = false;
function shutdown() {
  if (closing) return;
  closing = true;
  const timeout = setTimeout(() => {
    server.closeAllConnections();
    process.exit(1);
  }, 5000);
  timeout.unref();
  server.close(() => {
    clearTimeout(timeout);
    process.exitCode = 0;
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
