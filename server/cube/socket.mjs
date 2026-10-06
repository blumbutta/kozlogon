import { createServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { CubeRoomManager, CUBE_HZ } from './rooms.mjs';

export function createCubeTransport({ manager = new CubeRoomManager(), originAllowed = origin => !origin || origin === 'https://blumbutta.github.io' || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) } = {}) {
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 2048, perMessageDeflate: false });
  const ips = new Map();
  sockets.on('connection', ws => {
    const ip = ws.clientIp; ips.set(ip, (ips.get(ip) || 0) + 1);
    const connection = {
      send(packet) {
        if (ws.readyState !== WebSocket.OPEN) return;
        if (ws.bufferedAmount >= 512 * 1024) { ws.close(1013, 'Connection too slow'); return; }
        ws.send(typeof packet === 'string' ? packet : JSON.stringify(packet));
      },
      close(code = 4001, reason = 'Reconnected elsewhere') { ws.close(code, reason); },
    };
    ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true; });
    let windowAt = Date.now(), count = 0;
    const idle = setTimeout(() => { if (!connection.room) ws.close(1008, 'Join a room first'); }, 30_000); idle.unref();
    ws.on('message', (data, binary) => {
      const now = Date.now(); if (now - windowAt >= 1000) { windowAt = now; count = 0; }
      if (++count > 80 || binary) { ws.close(1008, 'Invalid message rate'); return; }
      let payload;
      try { payload = JSON.parse(data.toString()); } catch { connection.send({ type: 'error', code: 'invalid_message', message: 'Некорректное сообщение.' }); return; }
      manager.receive(connection, payload);
    });
    ws.on('error', () => {});
    ws.on('close', () => { clearTimeout(idle); manager.disconnect(connection); const count = (ips.get(ip) || 1) - 1; if (count) ips.set(ip, count); else ips.delete(ip); });
  });
  const heartbeat = setInterval(() => {
    for (const ws of sockets.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; ws.ping(); }
  }, 10_000); heartbeat.unref();
  return {
    manager, sockets,
    handleUpgrade(request, socket, head) {
      const ip = String(request.headers['x-forwarded-for'] || request.socket.remoteAddress || 'unknown').split(',')[0].trim();
      if (!originAllowed(request.headers.origin) || sockets.clients.size >= 48 || (ips.get(ip) || 0) >= 24) {
        socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); socket.destroy(); return;
      }
      sockets.handleUpgrade(request, socket, head, ws => { ws.clientIp = ip; sockets.emit('connection', ws, request); });
    },
    close() { clearInterval(heartbeat); manager.shutdown(); for (const ws of sockets.clients) { ws.close(1012, 'Server restarting'); ws.terminate(); } sockets.close(); },
  };
}

export function createCubeServer(options = {}) {
  const transport = createCubeTransport(options);
  const server = createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json; charset=utf-8'); response.setHeader('Cache-Control', 'no-store');
    const healthy = request.url.split('?')[0] === '/health'; response.writeHead(healthy ? 200 : 404);
    response.end(JSON.stringify(healthy ? { ok: true, game: 'cube-bomber', websocketPath: '/cube-ws' } : { error: 'Not found' }));
  });
  server.on('upgrade', (request, socket, head) => {
    if (request.url.split('?')[0] !== '/cube-ws') { socket.destroy(); return; }
    transport.handleUpgrade(request, socket, head);
  });
  const timer = setInterval(() => transport.manager.advance(), 1000 / CUBE_HZ); timer.unref();
  return { server, manager: transport.manager, transport, close() { clearInterval(timer); transport.close(); server.close(); } };
}
