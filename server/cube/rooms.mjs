import { randomBytes } from 'node:crypto';
import { Game } from './engine.js';
import { CHARACTERS } from './characters.js';

export const CUBE_HZ = 20;
export const RECONNECT_MS = 20_000;
export const INPUT_STALE_MS = 500;
const token = () => randomBytes(24).toString('base64url');
const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
const send = (connection, packet) => { try { connection?.send(packet); } catch {} };
const nickname = (value, fallback = 'Игрок') => (typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, '').trim().slice(0, 24) : '') || fallback;
const validCharacter = id => Number.isInteger(id) && id >= 0 && id < 6;

export function serializeGame(game) {
  return {
    seed: game.seed, time: game.time, status: game.status,
    winnerId: game.winnerId ?? null, endedAt: game.endedAt ?? null,
    grid: game.grid, players: game.players, bombs: game.bombs, flames: game.flames, bonuses: game.bonuses,
    faceBounds: game.faceBounds, nextShrink: game.nextShrink ?? null, shrinkHistory: game.shrinkHistory ?? [],
    collapsedFaces: [...game.collapsedFaces], faceCollapses: [...game.faceCollapses],
    nextCollapse: game.nextCollapse ?? null, humanIds: [...game.humanIds], multiplayer: true,
  };
}

export class CubeRoom {
  constructor(manager, id) {
    this.manager = manager; this.id = id; this.phase = 'lobby'; this.roundId = 0;
    this.hostId = null; this.members = new Map(); this.slots = CHARACTERS.map((character, id) => ({ id, characterId: character.id }));
    this.game = null; this.startAt = null; this.tick = 0; this.eventId = 0;
    this.accumulator = 0; this.lastActiveAt = manager.now();
  }
  memberForSlot(id) { return [...this.members.values()].find(member => member.playerId === id); }
  online() { return [...this.members.values()].filter(member => member.connection); }
  describe() {
    return { roomId: this.id, phase: this.phase, hostId: this.hostId, roundId: this.roundId, startAt: this.startAt,
      serverTime: this.manager.now(), maxPlayers: 6, simulationHz: CUBE_HZ,
      members: [...this.members.values()].map(member => ({ id: member.id, playerId: member.playerId, nickname: member.nickname, connected: Boolean(member.connection) })),
      slots: this.slots.map(slot => { const member = this.memberForSlot(slot.id); return { ...slot,
        nickname: member?.nickname || CHARACTERS[slot.characterId].name, memberId: member?.id || null,
        isBot: !member?.connection, connected: Boolean(member?.connection) }; }),
    };
  }
  broadcast(packet) { for (const member of this.members.values()) send(member.connection, packet); }
  broadcastRoom() { this.broadcast({ type: 'room', ...this.describe() }); }
  welcome(member) {
    send(member.connection, { type: 'welcome', roomId: this.id, memberId: member.id, playerId: member.playerId,
      reconnectToken: member.reconnectToken, serverTime: this.manager.now() });
  }
  transferHost() {
    if (this.members.get(this.hostId)?.connection) return;
    this.hostId = this.online()[0]?.id ?? this.members.keys().next().value ?? null;
  }
  select(member, id) {
    if (!validCharacter(id)) fail('invalid_character', 'Такого персонажа нет.');
    const slot = this.slots[member.playerId], other = this.slots.find(slot => slot.characterId === id);
    if (other.id === slot.id) return;
    if (this.memberForSlot(other.id)) fail('character_taken', 'Этот персонаж уже занят.');
    [slot.characterId, other.characterId] = [other.characterId, slot.characterId];
  }
  join(connection, payload) {
    let member = typeof payload.reconnectToken === 'string' ? [...this.members.values()].find(member => member.reconnectToken === payload.reconnectToken) : null;
    if (member && !member.connection && this.manager.now() - member.disconnectedAt >= RECONNECT_MS) { this.remove(member); member = null; }
    if (payload.reconnectToken && !member) fail('reconnect_expired', 'Время переподключения истекло.');
    if (member) {
      if (member.connection && member.connection !== connection) {
        const old = member.connection; old.room = null; old.member = null;
        send(old, { type: 'replaced', message: 'Комната открыта в другом окне.' }); old.close?.(4001, 'Reconnected elsewhere');
      }
      member.connection = connection; member.disconnectedAt = null; member.lastInputAt = this.manager.now();
      member.input = { seq: -1, dir: null }; member.bombSeq = -1;
    } else {
      if (this.phase !== 'lobby') fail('round_started', 'Матч уже идёт. Дождитесь нового приглашения.');
      const slot = this.slots.find(slot => !this.memberForSlot(slot.id));
      if (!slot) fail('room_full', 'В комнате уже шесть игроков.');
      member = { id: token(), reconnectToken: token(), playerId: slot.id, connection,
        nickname: nickname(payload.nickname, CHARACTERS[slot.characterId].name), disconnectedAt: null,
        input: { seq: -1, dir: null }, bombSeq: -1, lastInputAt: this.manager.now(), lastBombAt: -Infinity };
      if (validCharacter(payload.characterId)) {
        const desired = this.slots.find(slot => slot.characterId === payload.characterId);
        if (!this.memberForSlot(desired.id)) this.select(member, payload.characterId);
      }
      this.members.set(member.id, member);
    }
    connection.member = member; connection.room = this; this.transferHost(); this.lastActiveAt = this.manager.now();
    this.updateControllers(); this.welcome(member); this.broadcastRoom(); if (this.game) this.sendState(connection);
    return member;
  }
  updateControllers() {
    if (!this.game) return;
    this.game.humanIds = new Set(this.online().map(member => member.playerId));
    for (const slot of this.slots) {
      const member = this.memberForSlot(slot.id), actor = this.game.players[slot.id];
      actor.characterId = slot.characterId; actor.isBot = !member?.connection;
      actor.nickname = member?.nickname || CHARACTERS[slot.characterId].name;
      actor.name = actor.nickname;
    }
  }
  action(connection, payload) {
    const member = connection.member;
    if (!member || member.connection !== connection) fail('not_joined', 'Сначала войди в комнату.');
    const now = this.manager.now(); this.lastActiveAt = now;
    switch (payload.type) {
      case 'select':
        if (this.phase !== 'lobby') fail('round_started', 'Персонажа можно выбрать перед стартом.');
        if (payload.characterId !== undefined) this.select(member, payload.characterId);
        if (payload.nickname !== undefined) member.nickname = nickname(payload.nickname, member.nickname);
        this.broadcastRoom(); return;
      case 'start':
        this.requireHost(member); if (this.phase !== 'lobby') fail('round_started', 'Матч уже начался.');
        this.start(); return;
      case 'returnLobby':
        this.requireHost(member); if (this.phase !== 'finished') fail('round_running', 'Сначала дождись конца матча.');
        this.game = null; this.phase = 'lobby'; this.startAt = null;
        for (const absent of [...this.members.values()]) if (!absent.connection) this.remove(absent);
        this.broadcastRoom(); return;
      case 'input':
        if (this.phase !== 'playing') return;
        if (!Number.isSafeInteger(payload.seq) || payload.seq < 0 || payload.seq <= member.input.seq) return;
        if (payload.dir !== null && (!Number.isInteger(payload.dir) || payload.dir < 0 || payload.dir > 3)) fail('invalid_input', 'Некорректное направление.');
        member.input = { seq: payload.seq, dir: payload.dir }; member.lastInputAt = now; return;
      case 'bomb':
        if (this.phase !== 'playing' || !Number.isSafeInteger(payload.seq) || payload.seq < 0 || payload.seq <= member.bombSeq) return;
        member.bombSeq = payload.seq;
        if (now - member.lastBombAt < 75) return;
        member.lastBombAt = now; this.game.placeBomb(member.playerId); return;
      case 'ping': send(connection, { type: 'pong', clientTime: Number.isFinite(payload.clientTime) ? payload.clientTime : null, serverTime: now }); return;
      default: fail('unknown_message', 'Неизвестная команда.');
    }
  }
  requireHost(member) { if (this.hostId !== member.id) fail('host_only', 'Начать матч может хозяин комнаты.'); }
  start() {
    if (this.manager.activeRooms() >= this.manager.maxActiveRooms) fail('server_busy', 'Сейчас идёт другой матч. Попробуй чуть позже.');
    this.game = this.manager.engineFactory({ seed: randomBytes(4).readUInt32LE(), bots: true, humanIds: this.online().map(member => member.playerId), multiplayer: true });
    this.roundId++; this.tick = 0; this.eventId = 0; this.accumulator = 0; this.phase = 'countdown'; this.startAt = this.manager.now() + 3000;
    for (const member of this.members.values()) { member.input = { seq: -1, dir: null }; member.bombSeq = -1; member.lastInputAt = this.manager.now(); }
    this.updateControllers(); this.game.events.length = 0; this.broadcastRoom(); this.sendState();
  }
  sendState(connection = null, events = []) {
    if (!this.game) return;
    const packet = { type: 'state', roomId: this.id, phase: this.phase, roundId: this.roundId, tick: this.tick,
      startAt: this.startAt, serverTime: this.manager.now(), state: serializeGame(this.game), events };
    if (connection) send(connection, packet); else this.broadcast(packet);
  }
  advance(dt) {
    const now = this.manager.now();
    let removedMember = false;
    for (const member of [...this.members.values()]) if (!member.connection && now - member.disconnectedAt >= RECONNECT_MS) { this.remove(member); removedMember = true; }
    if (removedMember) this.broadcastRoom();
    if (this.phase === 'countdown') {
      if (now < this.startAt) { this.sendState(); return; }
      this.phase = 'playing'; this.accumulator = 0; this.broadcastRoom();
      dt = Math.min(dt, Math.max(0, (now - this.startAt) / 1000));
    }
    if (this.phase !== 'playing') return;
    this.updateControllers();
    this.accumulator += Math.min(.2, Math.max(0, dt));
    const events = [];
    while (this.accumulator + 1e-9 >= 1 / CUBE_HZ) {
      this.accumulator -= 1 / CUBE_HZ; this.tick++;
      for (const member of this.online()) {
        if (now - member.lastInputAt >= INPUT_STALE_MS) member.input.dir = null;
        if (member.input.dir === null) continue;
        if (this.game.move(member.playerId, member.input.dir)) member.input.dir = this.game.players[member.playerId].dir;
      }
      this.game.update(1 / CUBE_HZ);
      events.push(...this.game.events.splice(0).map(event => ({ ...event, eventId: ++this.eventId })));
      if (this.game.status === 'finished') { this.phase = 'finished'; break; }
    }
    this.sendState(null, events);
    if (this.phase === 'finished') this.broadcastRoom();
  }
  disconnect(connection, voluntary = false) {
    const member = connection.member; if (!member || member.connection !== connection) return;
    member.connection = null; member.disconnectedAt = this.manager.now(); member.input.dir = null;
    connection.member = null; connection.room = null; this.lastActiveAt = this.manager.now();
    if (voluntary) this.remove(member);
    this.transferHost(); this.updateControllers(); this.broadcastRoom();
  }
  remove(member) { this.members.delete(member.id); this.transferHost(); this.updateControllers(); }
}

export class CubeRoomManager {
  constructor({ now = () => Date.now(), maxRooms = 4, maxActiveRooms = 1, engineFactory = options => new Game(options) } = {}) {
    this.now = now; this.maxRooms = maxRooms; this.maxActiveRooms = maxActiveRooms; this.engineFactory = engineFactory;
    this.rooms = new Map(); this.lastTick = now();
  }
  activeRooms() { return [...this.rooms.values()].filter(room => ['countdown', 'playing'].includes(room.phase)).length; }
  receive(connection, payload) {
    try {
      if (!payload || typeof payload !== 'object' || Array.isArray(payload) || typeof payload.type !== 'string') fail('invalid_message', 'Некорректное сообщение.');
      if (payload.type === 'create' || payload.type === 'join') {
        if (connection.room) fail('already_joined', 'Ты уже в комнате.');
        let room;
        if (payload.type === 'create') {
          if (this.rooms.size >= this.maxRooms) fail('server_busy', 'Все комнаты заняты. Попробуй позже.');
          let id; do { id = randomBytes(5).toString('hex').slice(0, 8).toUpperCase(); } while (this.rooms.has(id));
          room = new CubeRoom(this, id); this.rooms.set(id, room);
        } else {
          const id = typeof payload.roomId === 'string' ? payload.roomId.trim().toUpperCase() : '';
          if (!/^[A-F0-9]{8}$/.test(id) || !this.rooms.has(id)) fail('room_not_found', 'Комната не найдена или уже закрыта.');
          room = this.rooms.get(id);
        }
        room.join(connection, payload); return room;
      }
      if (payload.type === 'leave') { connection.room?.disconnect(connection, true); send(connection, { type: 'left' }); return; }
      if (!connection.room) fail('not_joined', 'Сначала создай комнату или введи код.');
      connection.room.action(connection, payload);
    } catch (error) { send(connection, { type: 'error', code: error.code || 'internal_error', message: error.code ? error.message : 'Не удалось выполнить действие.' }); }
  }
  disconnect(connection) { connection.room?.disconnect(connection); }
  advance() {
    const now = this.now(), dt = Math.max(0, (now - this.lastTick) / 1000); this.lastTick = now;
    for (const [id, room] of this.rooms) {
      room.advance(dt);
      if ((!room.online().length && (!room.members.size || now - room.lastActiveAt > RECONNECT_MS + 1000)) || (room.phase !== 'playing' && now - room.lastActiveAt > 30 * 60_000)) {
        room.broadcast({ type: 'closed', message: 'Комната закрыта из-за бездействия.' });
        for (const member of room.members.values()) if (member.connection) {
          member.connection.room = null; member.connection.member = null; member.connection.close?.(1000, 'Room closed');
        }
        this.rooms.delete(id);
      }
    }
  }
  shutdown() { for (const room of this.rooms.values()) room.broadcast({ type: 'serverRestart', message: 'Сервер перезапускается.' }); this.rooms.clear(); }
}
