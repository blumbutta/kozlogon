import WebSocket from 'ws';
import { inflateSync } from 'node:zlib';
import { monitorEventLoopDelay } from 'node:perf_hooks';

// Run against an explicitly selected server: node scripts/load-test.mjs https://host 120 2
// The test creates private rooms and voluntarily leaves every connection.
const target = process.argv[2];
if (!target) throw new Error('Pass the server URL explicitly.');
const serverUrl = new URL(target);
if (!['http:', 'https:'].includes(serverUrl.protocol)) throw new Error('Expected HTTP(S) server URL.');
const durationSeconds = Number(process.argv[3] || 120);
if (!Number.isFinite(durationSeconds) || durationSeconds < 20 || durationSeconds > 300) throw new Error('Duration must be 20–300 seconds.');
const roomsCount = Number(process.argv[4] || 2);
if (![1, 2].includes(roomsCount)) throw new Error('Rooms count must be 1 or 2.');
const warmupSeconds = Math.min(15, durationSeconds / 4);
const socketUrl = new URL('/ws', serverUrl);
socketUrl.protocol = serverUrl.protocol === 'https:' ? 'wss:' : 'ws:';
const clients = [], rooms = [], errors = [], healthSamples = [];
let inputTimer, pingTimer, abilityTimer, healthTimer, progressTimer, startedAt = 0, cleaningUp = false;
const round = (value, precision = 2) => Number.isFinite(value) ? Math.round(value * 10 ** precision) / 10 ** precision : null;
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const percentile = (values, fraction) => values.length ? [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * fraction))] : 0;
const nowSeconds = () => startedAt ? (performance.now() - startedAt) / 1000 : 0;
const send = (client, payload) => {
  if (client.ws.readyState !== WebSocket.OPEN) return;
  client.ws.send(JSON.stringify(payload));
};
const log = value => console.log(JSON.stringify(value));
const eventLoop = monitorEventLoopDelay({ resolution: 20 });
eventLoop.enable();
const cpuStart = process.cpuUsage();

function connect(room, payload, leader = false) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(socketUrl, { origin: 'https://blumbutta.github.io' });
    const client = { ws, room, leader, seq: 0, bytes: 0, packets: 0, pings: [], welcomed: false, attempts: {}, errors: [] };
    clients.push(client); room.clients.push(client);
    const timeout = setTimeout(() => reject(new Error('connection_timeout')), 15_000);
    ws.on('open', () => send(client, { ...payload, compression: true }));
    ws.on('error', () => {
      errors.push({ room: room.worldId, kind: 'socket_error' });
      if (!client.welcomed) { clearTimeout(timeout); reject(new Error('socket_error')); }
    });
    ws.on('close', (code, reason) => {
      if (!cleaningUp) errors.push({ room: room.worldId, kind: 'socket_closed', code, reason: reason.toString() });
      if (!client.welcomed) { clearTimeout(timeout); reject(new Error('socket_closed_before_welcome')); }
    });
    ws.on('message', (raw, binary) => {
      const receivedAt = performance.now();
      if (startedAt) { client.bytes += raw.length; client.packets++; }
      // All peers receive the actual traffic; only one per room inflates snapshots.
      if (binary && !leader) return;
      let message;
      try { message = JSON.parse(binary ? inflateSync(raw) : raw.toString()); }
      catch { errors.push({ room: room.worldId, kind: 'decode_error' }); return; }
      if (message.type === 'welcome') {
        client.welcome = message; client.welcomed = true; clearTimeout(timeout); resolve(client);
      }
      if (leader && ['raceStart', 'state'].includes(message.type)) {
        room.latest = message.state;
        if (message.type === 'state') room.samples.push({
          time: receivedAt, wall: nowSeconds(), tick: message.tick,
          elapsed: message.state.elapsed, phase: message.state.phase,
          bytes: client.bytes,
        });
      }
      if (message.type === 'room') room.phase = message.phase;
      if (message.type === 'pong' && startedAt) client.pings.push({ wall: nowSeconds(), ms: Date.now() - message.clientTime });
      if (leader && message.type === 'event') {
        const type = message.event.type;
        room.events[type] = (room.events[type] || 0) + 1;
      }
      if (message.type === 'error') {
        client.errors.push(message.code);
        errors.push({ room: room.worldId, kind: message.code });
        if (!client.welcomed) { clearTimeout(timeout); reject(new Error(message.code)); }
      }
    });
  });
}

function intervalSummary(samples) {
  const racing = samples.filter(sample => sample.phase === 'racing');
  if (racing.length < 2) return null;
  const first = racing[0], last = racing.at(-1), seconds = (last.time - first.time) / 1000;
  return {
    wallSeconds: round(seconds),
    simulationTickHz: round((last.tick - first.tick) / seconds),
    simulationElapsedRatio: round((last.elapsed - first.elapsed) / seconds, 3),
    snapshotsPerSecond: round((racing.length - 1) / seconds),
    maximumSnapshotGapMs: round(Math.max(...racing.slice(1).map((sample, index) => sample.time - racing[index].time))),
    bytesPerClientPerSecond: round((last.bytes - first.bytes) / seconds, 0),
  };
}

function roomSummary(room) {
  const measurement = room.samples.filter(sample => sample.wall >= warmupSeconds);
  const latency = room.clients.flatMap(client => client.pings.filter(ping => ping.wall >= warmupSeconds).map(ping => ping.ms));
  const windows = [];
  for (let start = warmupSeconds; start + 8 < nowSeconds(); start += 10) {
    const samples = room.samples.filter(sample => sample.wall >= start && sample.wall < start + 10);
    const result = intervalSummary(samples);
    if (result) windows.push({ fromSecond: round(start), ...result });
  }
  const state = room.latest;
  return {
    world: room.worldId, players: 20, spectators: 1,
    phase: state?.phase, elapsed: state?.elapsed,
    ...intervalSummary(measurement),
    pingMeanMs: round(mean(latency), 0), pingP95Ms: round(percentile(latency, .95), 0),
    pingMaxMs: latency.length ? Math.max(...latency) : null,
    bytesAllClients: room.clients.reduce((sum, client) => sum + client.bytes, 0),
    humanCount: state?.goats.filter(goat => !goat.isBot).length,
    uniquePlayerIds: new Set(room.clients.filter(client => client.welcome?.role === 'player').map(client => client.welcome.playerId)).size,
    acceptedInputsMinimum: state ? Math.min(...state.goats.map(goat => goat.lastInputSeq || 0)) : null,
    furthestDistance: state ? round(Math.max(...state.goats.map(goat => goat.s)), 0) : null,
    finished: state?.goats.filter(goat => goat.finishTime !== null).length,
    deaths: state?.goats.reduce((sum, goat) => sum + goat.stats.deaths, 0),
    bombs: state?.goats.reduce((sum, goat) => sum + goat.stats.bombs, 0),
    traps: state?.goats.reduce((sum, goat) => sum + goat.stats.traps, 0),
    events: room.events, windows,
  };
}

async function pollHealth() {
  const started = performance.now();
  try {
    const response = await fetch(new URL('/health', serverUrl), { signal: AbortSignal.timeout(4000) });
    const body = await response.json();
    if (!response.ok || !body.ok) throw new Error('health_invalid');
    healthSamples.push({ wall: nowSeconds(), ms: performance.now() - started, ok: true });
  } catch (error) {
    healthSamples.push({ wall: nowSeconds(), ms: performance.now() - started, ok: false });
    errors.push({ kind: 'health_failed', reason: error.name });
  }
}

try {
  const response = await fetch(new URL('/', serverUrl), { signal: AbortSignal.timeout(15_000) });
  const health = await response.json();
  if (!health.multiplayerReady) throw new Error('deployment_not_ready');
  if (Number.isInteger(health.maxActiveRaces) && health.maxActiveRaces < roomsCount) throw new Error('configured_race_limit_below_requested_room_count');
  for (const worldId of ['alps', 'hell'].slice(0, roomsCount)) {
    const room = { worldId, clients: [], samples: [], latest: null, events: {}, phase: 'lobby' };
    rooms.push(room);
    room.host = await connect(room, { type: 'create', worldId, nickname: `Тест ${worldId} 1` }, true);
    for (let first = 1; first < 20; first += 4) {
      await Promise.all(Array.from({ length: Math.min(4, 20 - first) }, (_, offset) => connect(room, {
        type: 'join', roomId: room.host.welcome.roomId, nickname: `Тест ${worldId} ${first + offset + 1}`,
      })));
    }
    const playerIds = room.clients.map(client => client.welcome.playerId).sort((a, b) => a - b);
    if (playerIds.some((id, index) => id !== index)) throw new Error('duplicate_or_missing_player_slot');
    const spectator = await connect(room, { type: 'join', roomId: room.host.welcome.roomId, nickname: `Зритель ${worldId}` });
    if (spectator.welcome.role !== 'spectator') throw new Error('full_room_observer_failed');
  }
  startedAt = performance.now();
  eventLoop.reset();
  for (const room of rooms) send(room.host, { type: 'start' });
  log({ status: 'testing', rooms: roomsCount, players: roomsCount * 20, spectators: roomsCount, durationSeconds, warmupSeconds });
  inputTimer = setInterval(() => {
    const wall = nowSeconds();
    for (const client of clients) {
      if (client.welcome?.role !== 'player') continue;
      const goat = client.room.latest?.goats.find(value => value.id === client.welcome.playerId);
      const lane = ((client.welcome.playerId % 5) - 2) * 3;
      const steer = goat ? Math.max(-.9, Math.min(.9, (lane - goat.x) * .095 - goat.vx * .014 + Math.sin(wall / 4 + goat.id) * .08)) : 0;
      send(client, { type: 'input', seq: ++client.seq, steer, drive: 1 });
    }
  }, 1000 / 30);
  pingTimer = setInterval(() => clients.forEach(client => send(client, { type: 'ping', clientTime: Date.now() })), 1000);
  let abilityTurn = 0;
  abilityTimer = setInterval(() => {
    const wall = nowSeconds(), kind = ['bomb', 'trap', 'jump'][abilityTurn++ % 3];
    if (wall < warmupSeconds) return;
    for (const client of clients) {
      if (client.welcome?.role !== 'player') continue;
      const goat = client.room.latest?.goats.find(value => value.id === client.welcome.playerId);
      if (!goat || goat.dead || goat.finishTime !== null) continue;
      // A few fastest racers respawn near the lower course so both rooms remain
      // active for the whole measurement, without freezing or synthetic physics.
      const action = goat.s > 1800 && wall < durationSeconds - 10 ? 'recover' : kind;
      if (action !== 'recover' && (goat.cd[action] > 0 || (action === 'jump' && !goat.grounded))) continue;
      if (wall - (client.attempts[action] || -10) < (action === 'recover' ? 2.5 : .7)) continue;
      client.attempts[action] = wall;
      send(client, { type: 'ability', kind: action });
    }
  }, 200);
  await pollHealth();
  healthTimer = setInterval(() => { void pollHealth(); }, 2000);
  progressTimer = setInterval(() => {
    log({ status: 'progress', wallSeconds: round(nowSeconds()), rooms: rooms.map(room => ({
      world: room.worldId, phase: room.latest?.phase,
      ...intervalSummary(room.samples.filter(sample => sample.wall > nowSeconds() - 20)),
      pingP95Ms: round(percentile(room.clients.flatMap(client => client.pings.filter(ping => ping.wall > nowSeconds() - 20).map(ping => ping.ms)), .95), 0),
    })), errors: errors.length });
  }, 20_000);
  await new Promise((resolve, reject) => {
    const deadline = performance.now() + 10_000;
    const timer = setInterval(() => {
      if (errors.length || performance.now() > deadline) { clearInterval(timer); reject(new Error('races_failed_to_start')); }
      else if (rooms.every(room => ['countdown', 'racing'].includes(room.latest?.phase))) { clearInterval(timer); resolve(); }
    }, 50);
  });
  await new Promise(resolve => setTimeout(resolve, durationSeconds * 1000));
  const summaries = rooms.map(roomSummary);
  const measurementHealth = healthSamples.filter(sample => sample.wall >= warmupSeconds);
  const allRacing = summaries.every(summary => summary.phase === 'racing' && summary.humanCount === 20 && summary.uniquePlayerIds === 20 && summary.acceptedInputsMinimum > 100);
  const cpu = process.cpuUsage(cpuStart);
  const status = errors.length || !allRacing ? 'failed' : summaries.every(summary => summary.simulationElapsedRatio >= .98 && summary.windows.every(window => window.simulationElapsedRatio >= .96) && summary.pingP95Ms < 400 && summary.maximumSnapshotGapMs < 1000) ? 'stable' : summaries.every(summary => summary.simulationElapsedRatio >= .9) ? 'borderline' : 'unusable';
  log({
    status, durationSeconds: round(nowSeconds()), warmupSeconds,
    rooms: summaries, errors,
    health: { samples: measurementHealth.length, failed: measurementHealth.filter(sample => !sample.ok).length, meanMs: round(mean(measurementHealth.map(sample => sample.ms)), 0), p95Ms: round(percentile(measurementHealth.map(sample => sample.ms), .95), 0), maxMs: round(Math.max(...measurementHealth.map(sample => sample.ms)), 0) },
    testClient: { cpuSeconds: round((cpu.user + cpu.system) / 1e6), eventLoopP95Ms: round(eventLoop.percentile(95) / 1e6), eventLoopMaxMs: round(eventLoop.max / 1e6) },
  });
  if (status === 'failed' || status === 'unusable') process.exitCode = 1;
} catch (error) {
  log({ status: 'failed', reason: error.message, errors });
  process.exitCode = 1;
} finally {
  cleaningUp = true;
  for (const timer of [inputTimer, pingTimer, abilityTimer, healthTimer, progressTimer]) clearInterval(timer);
  eventLoop.disable();
  await Promise.all(clients.map(client => new Promise(resolve => {
    if (client.ws.readyState !== WebSocket.OPEN) { client.ws.terminate(); resolve(); return; }
    const timeout = setTimeout(() => { client.ws.terminate(); resolve(); }, 2000);
    client.ws.on('close', () => { clearTimeout(timeout); resolve(); });
    send(client, { type: 'leave' }); client.ws.close();
  })));
  log({ status: 'cleaned_up', closedConnections: clients.length });
}
