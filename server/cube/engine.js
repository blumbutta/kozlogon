export const SIZE = 8;
export const BOMB_STEP_SECONDS = 1 / 3;
export const FACE_COLLAPSE_INTERVAL = 60;
export const FACE_COLLAPSE_WARNING = 10;
export const FACE_SHRINK_INTERVAL = 30;
export const FACE_SHRINK_WARNING = 10;
export const FACES = [
  { id: 0, name: 'Верх', n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { id: 1, name: 'Фронт', n: [0, 0, 1], u: [1, 0, 0], v: [0, -1, 0] },
  { id: 2, name: 'Право', n: [1, 0, 0], u: [0, 0, -1], v: [0, -1, 0] },
  { id: 3, name: 'Тыл', n: [0, 0, -1], u: [-1, 0, 0], v: [0, -1, 0] },
  { id: 4, name: 'Лево', n: [-1, 0, 0], u: [0, 0, 1], v: [0, -1, 0] },
  { id: 5, name: 'Низ', n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, -1] },
];

const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];
const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
const direction = (face, dir) => (dir % 2 ? face.u : face.v).map(value => value * (dir === 0 || dir === 3 ? -1 : 1));
export const tileKey = (face, x, y) => `${face}:${x}:${y}`;
const keyOf = cell => tileKey(cell.face, cell.x, cell.y);
const withinBounds = (cell, bounds) => cell.x >= bounds.minX && cell.x <= bounds.maxX && cell.y >= bounds.minY && cell.y <= bounds.maxY;

/** Physical progress shared with the renderer, using the duration fixed at takeoff. */
export function movementProgress(actor, time) {
  if (!actor.previous || keyOf(actor.previous) === keyOf(actor) || !(actor.stepDuration > 0) || !Number.isFinite(actor.movedAt)) return 1;
  const progress = Math.max(0, Math.min(1, (time - actor.movedAt) / actor.stepDuration));
  return progress * progress * (3 - 2 * progress);
}

export function flameVulnerableCells(actor, time) {
  const current = { face: actor.face, x: actor.x, y: actor.y };
  const progress = movementProgress(actor, time);
  if (progress >= 1) return [current];
  const cells = [];
  // Tiny tolerances keep exact 20% / 80% boundaries stable after easing arithmetic.
  if (progress < 0.8 - 1e-12) cells.push({ face: actor.previous.face, x: actor.previous.x, y: actor.previous.y });
  if (progress > 0.2 + 1e-12) cells.push(current);
  return cells;
}

/** A bomb's visible body can overlap both cells while it rolls across their border. */
export function bombFlameCells(bomb, time) {
  return flameVulnerableCells({ ...bomb, stepDuration: BOMB_STEP_SECONDS }, time);
}

export function bombExplosionCell(bomb, time) {
  const progress = movementProgress({ ...bomb, stepDuration: BOMB_STEP_SECONDS }, time);
  const center = progress < 0.5 - 1e-12 ? bomb.previous : bomb;
  return { face: center.face, x: center.x, y: center.y };
}

export function worldPoint(face, x, y, height = 0) {
  const { n, u, v } = FACES[face];
  return n.map((value, i) => value * (SIZE / 2 + height) + u[i] * (x - (SIZE - 1) / 2) + v[i] * (y - (SIZE - 1) / 2));
}

/** A step unfolds across an edge; the returned direction is local to the new face. */
export function neighbor(face, x, y, dir) {
  const nextX = x + DX[dir];
  const nextY = y + DY[dir];
  if (nextX >= 0 && nextX < SIZE && nextY >= 0 && nextY < SIZE) return { face, x: nextX, y: nextY, dir };
  const source = FACES[face];
  const tangent = direction(source, dir);
  const target = FACES.find(candidate => dot(candidate.n, tangent) === 1);
  const point = worldPoint(face, x, y).map((value, i) => value + tangent[i] / 2 - source.n[i] / 2);
  const forward = source.n.map(value => -value);
  return {
    face: target.id,
    x: Math.round(dot(point, target.u) + (SIZE - 1) / 2),
    y: Math.round(dot(point, target.v) + (SIZE - 1) / 2),
    dir: [0, 1, 2, 3].find(candidate => dot(direction(target, candidate), forward) === 1),
  };
}

function seededRandom(seed) {
  let value = Number(seed) >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let mixed = value;
    mixed = Math.imul(mixed ^ mixed >>> 15, mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ mixed >>> 7, mixed | 61);
    return ((mixed ^ mixed >>> 14) >>> 0) / 4294967296;
  };
}

export class Game {
  constructor({ seed = Date.now(), bots = true, humanIds = [0], multiplayer = false } = {}) {
    this.botsEnabled = bots;
    this.humanIds = new Set(humanIds);
    this.multiplayer = multiplayer;
    this.reset(seed);
  }

  reset(seed = this.seed) {
    this.seed = seed;
    this.random = seededRandom(seed);
    this.time = 0;
    this.status = 'playing';
    this.winnerId = null;
    this.endedAt = null;
    this.bombs = [];
    this.flames = [];
    this.bonuses = [];
    this.events = [];
    this.collapsedFaces = new Set();
    this.faceCollapses = new Map();
    this.faceBounds = FACES.map(() => ({ minX: 0, maxX: SIZE - 1, minY: 0, maxY: SIZE - 1 }));
    this.nextShrink = null;
    this.shrinkHistory = [];
    this.shrinkWarningIssued = false;
    this.nextCollapse = null;
    this.collapseWarningIssued = false;
    this.nextBombId = 1;
    this.grid = FACES.map(() => Array.from({ length: SIZE }, (_, y) => Array.from({ length: SIZE }, (_, x) => {
      // The diagonal in this small spawn room provides cover for the first bomb.
      if ((x === 3 || x === 4) && (y === 3 || y === 4)) return 0;
      const perimeter = x === 0 || y === 0 || x === SIZE - 1 || y === SIZE - 1;
      if (!perimeter && x % 2 === 0 && y % 2 === 0) return 1;
      const spawnRing = ((x === 2 || x === 5) && (y === 3 || y === 4)) || ((y === 2 || y === 5) && (x === 3 || x === 4));
      if (spawnRing) return 2;
      return this.random() < (perimeter ? 0.72 : 0.8) ? 2 : 0;
    })));
    const names = ['Вы · Люми', 'Бубо', 'Зип', 'Пип', 'Вольт', 'Физзи'];
    this.players = FACES.map(face => ({
      id: face.id, name: names[face.id], face: face.id, x: 3, y: 3, dir: 2,
      alive: true, diedAt: null, place: null, range: 1, capacity: 1, speed: 1, moveCooldown: 0,
      previous: { face: face.id, x: 3, y: 3 }, movedAt: 0, stepDuration: 0,
      protectedUntil: 1, botThink: 0.3 + this.random() * 0.8,
      targetId: null, targetUntil: 0, bombCooldown: 0,
    }));
    this.scheduleCollapse(null, FACE_COLLAPSE_INTERVAL);
    this.events.push({ type: 'reset', seed });
    return this;
  }

  moveDuration(actor) { return 0.3 / (1 + (actor.speed - 1) * 0.07); }

  isRunning() {
    if (this.multiplayer) return this.status === 'playing';
    return this.status === 'playing' || (this.status === 'lost' && this.players[0].diedAt !== null && this.time < this.players[0].diedAt + 3 - 1e-9);
  }

  isFaceActive(face) { return Boolean(FACES[face]) && !this.collapsedFaces.has(face); }

  isCellActive(cell) { return this.isFaceActive(cell.face) && withinBounds(cell, this.faceBounds[cell.face]); }

  cellsOutsideBounds(face, bounds) {
    const cells = [];
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const cell = { face, x, y };
      if (this.isCellActive(cell) && !withinBounds(cell, bounds)) cells.push(cell);
    }
    return cells;
  }

  scheduleCollapse(previousFace, at) {
    const active = FACES.filter(face => this.isFaceActive(face.id)).map(face => face.id);
    this.nextCollapse = null;
    this.collapseWarningIssued = false;
    if (active.length <= 1) {
      if (active.length === 1 && !this.nextShrink && this.shrinkHistory.length === 0) this.scheduleShrink(active[0], this.time + FACE_SHRINK_INTERVAL, 1);
      return;
    }
    const adjacent = (a, b) => dot(FACES[a].n, FACES[b].n) === 0;
    const candidates = active.filter(candidate => {
      if (previousFace !== null && !adjacent(previousFace, candidate)) return false;
      const remaining = active.filter(face => face !== candidate);
      const reached = new Set([remaining[0]]);
      const queue = [remaining[0]];
      for (let i = 0; i < queue.length; i++) for (const face of remaining) {
        if (!reached.has(face) && adjacent(queue[i], face)) { reached.add(face); queue.push(face); }
      }
      return reached.size === remaining.length;
    });
    if (candidates.length) this.nextCollapse = { face: candidates[Math.floor(this.random() * candidates.length)], at };
  }

  returnFromCollapsedFace(entity, isActor, cause = 'collapse') {
    const from = { face: entity.face, x: entity.x, y: entity.y };
    const to = { ...entity.previous };
    const backwards = [0, 1, 2, 3].find(dir => keyOf(neighbor(entity.face, entity.x, entity.y, dir)) === keyOf(to));
    const previousDir = entity.dir ?? (backwards + 2) % 4;
    const reverse = neighbor(entity.face, entity.x, entity.y, backwards ?? (previousDir + 2) % 4);
    entity.dir = (reverse.dir + 2) % 4;
    Object.assign(entity, to, { previous: { ...to }, movedAt: this.time });
    if (isActor) {
      entity.stepDuration = 0;
      entity.moveCooldown = 0;
      this.events.push({ type: 'collapse-return', id: entity.id, from, to, previousDir, dir: entity.dir, cause });
    } else {
      entity.moving = false;
      entity.moveAccumulator = 0;
    }
  }

  collapseFace(face) {
    if (!this.isFaceActive(face) || this.collapsedFaces.size >= FACES.length - 1) return false;
    const cells = this.cellsOutsideBounds(face, { minX: SIZE, maxX: SIZE, minY: SIZE, maxY: SIZE });
    this.collapsedFaces.add(face);
    this.faceCollapses.set(face, this.time);
    this.events.push({ type: 'collapse', face });
    this.removeArenaCells(cells, 'collapse');
    this.scheduleCollapse(face, this.time + FACE_COLLAPSE_INTERVAL);
    this.checkEnd();
    return true;
  }

  removeArenaCells(cells, cause) {
    const removed = new Set(cells.map(keyOf));
    for (const cell of cells) this.grid[cell.face][cell.y][cell.x] = 0;
    const victims = this.players.filter(actor => actor.alive && flameVulnerableCells(actor, this.time).some(cell => removed.has(keyOf(cell))));
    this.killPlayers(victims, cause, actor => flameVulnerableCells(actor, this.time).find(cell => removed.has(keyOf(cell))));
    for (const actor of this.players) {
      if (actor.alive && !this.isCellActive(actor) && actor.previous && this.isCellActive(actor.previous)) this.returnFromCollapsedFace(actor, true, cause);
    }
    this.bombs = this.bombs.filter(bomb => this.isCellActive(bombExplosionCell(bomb, this.time)));
    for (const bomb of this.bombs) {
      if (!this.isCellActive(bomb) && bomb.previous && this.isCellActive(bomb.previous)) this.returnFromCollapsedFace(bomb, false, cause);
    }
    this.bonuses = this.bonuses.filter(bonus => this.isCellActive(bonus));
    this.flames = this.flames.filter(flame => this.isCellActive(flame));
  }

  scheduleShrink(face, at, stage) {
    this.shrinkWarningIssued = false;
    this.nextShrink = stage > 2 ? null : { face, at, stage, bounds: { minX: stage === 1 ? 0 : 1, maxX: 6, minY: stage === 1 ? 0 : 1, maxY: 6 } };
  }

  shrinkFace(face, bounds, stage = 1) {
    if (!this.isFaceActive(face) || this.collapsedFaces.size !== FACES.length - 1) return false;
    const cells = this.cellsOutsideBounds(face, bounds);
    if (!cells.length) return false;
    this.faceBounds[face] = { ...bounds };
    const entry = { face, at: this.time, cells, bounds: { ...bounds } };
    this.shrinkHistory.push(entry);
    this.events.push({ type: 'shrink', face, cells, bounds: { ...bounds }, stage });
    this.removeArenaCells(cells, 'shrink');
    this.scheduleShrink(face, this.time + FACE_SHRINK_INTERVAL, stage + 1);
    this.checkEnd();
    return true;
  }

  updateCollapseSchedule() {
    if (this.nextCollapse && !this.collapseWarningIssued && this.time >= this.nextCollapse.at - FACE_COLLAPSE_WARNING - 1e-9) {
      this.collapseWarningIssued = true;
      this.events.push({ type: 'collapse-warning', ...this.nextCollapse });
    }
    if (this.nextCollapse && this.time >= this.nextCollapse.at - 1e-9) this.collapseFace(this.nextCollapse.face);
    if (this.nextShrink && !this.shrinkWarningIssued && this.time >= this.nextShrink.at - FACE_SHRINK_WARNING - 1e-9) {
      this.shrinkWarningIssued = true;
      this.events.push({ type: 'shrink-warning', ...this.nextShrink, cells: this.cellsOutsideBounds(this.nextShrink.face, this.nextShrink.bounds) });
    }
    if (this.nextShrink && this.time >= this.nextShrink.at - 1e-9) this.shrinkFace(this.nextShrink.face, this.nextShrink.bounds, this.nextShrink.stage);
  }

  canEnter(cell) {
    return this.isCellActive(cell) && this.grid[cell.face][cell.y][cell.x] === 0 && !this.bombs.some(bomb => keyOf(bomb) === keyOf(cell));
  }

  canBombEnter(cell) {
    return this.canEnter(cell) && !this.players.some(actor => actor.alive && keyOf(actor) === keyOf(cell));
  }

  advanceBomb(bomb) {
    const next = neighbor(bomb.face, bomb.x, bomb.y, bomb.dir);
    if (!this.canBombEnter(next)) { bomb.moving = false; return false; }
    bomb.previous = { face: bomb.face, x: bomb.x, y: bomb.y };
    bomb.face = next.face;
    bomb.x = next.x;
    bomb.y = next.y;
    bomb.dir = next.dir;
    bomb.movedAt = this.time;
    return true;
  }

  move(actorId, dir) {
    const actor = this.players.find(player => player.id === actorId);
    if (!actor || !actor.alive || !this.isRunning() || !this.isCellActive(actor) || actor.moveCooldown > 0.0001 || !Number.isInteger(dir) || dir < 0 || dir > 3) return false;
    // The camera transports the input tangent, not the previous facing direction.
    const previousDir = dir;
    actor.dir = dir;
    const next = neighbor(actor.face, actor.x, actor.y, dir);
    if (!this.isCellActive(next)) return false;
    if (!this.canEnter(next)) {
      const bomb = this.bombs.find(candidate => keyOf(candidate) === keyOf(next));
      if (!bomb || bomb.owner !== actor.id || this.grid[next.face][next.y][next.x] !== 0) return false;
      bomb.dir = next.dir;
      if (!this.advanceBomb(bomb)) return false;
      bomb.moving = true;
      bomb.moveAccumulator = 0;
      this.events.push({ type: 'kick', id: actor.id, bombId: bomb.id, face: bomb.face, x: bomb.x, y: bomb.y, dir: bomb.dir });
    }
    const from = { face: actor.face, x: actor.x, y: actor.y };
    const to = { face: next.face, x: next.x, y: next.y };
    actor.previous = from;
    actor.face = next.face;
    actor.x = next.x;
    actor.y = next.y;
    actor.dir = next.dir;
    actor.movedAt = this.time;
    actor.stepDuration = Math.max(this.moveDuration(actor), from.face !== to.face ? 0.5 : 0);
    actor.moveCooldown = actor.stepDuration;
    this.events.push({ type: 'move', id: actor.id, from, to, dir: next.dir, previousDir });
    this.collectBonus(actor);
    this.checkFlameDeaths();
    this.checkEnd();
    return true;
  }

  placeBomb(actorId) {
    const actor = this.players.find(player => player.id === actorId);
    if (!actor || !actor.alive || !this.isRunning() || !this.isCellActive(actor) || this.bombs.some(bomb => keyOf(bomb) === keyOf(actor)) || this.bombs.filter(bomb => bomb.owner === actorId).length >= actor.capacity) return false;
    const bomb = { id: this.nextBombId++, owner: actorId, face: actor.face, x: actor.x, y: actor.y, range: actor.range, fuse: 2.7, moving: false, moveAccumulator: 0 };
    this.bombs.push(bomb);
    this.events.push({ type: 'bomb', ...bomb });
    return true;
  }

  blastCells(bomb) {
    const origin = bombExplosionCell(bomb, this.time);
    if (!this.isCellActive(origin)) return [];
    const cells = [origin];
    const seen = new Set([keyOf(origin)]);
    const blockers = new Set(this.bombs.filter(other => other.id !== bomb.id).flatMap(other => bombFlameCells(other, this.time).filter(cell => this.isCellActive(cell)).map(keyOf)));
    for (let dir = 0; dir < 4; dir++) {
      let cell = { ...origin, dir };
      for (let distance = 0; distance < bomb.range; distance++) {
        cell = neighbor(cell.face, cell.x, cell.y, cell.dir);
        if (!this.isCellActive(cell)) break;
        const tile = this.grid[cell.face][cell.y][cell.x];
        if (tile === 1) break;
        const key = keyOf(cell);
        if (!seen.has(key)) cells.push({ face: cell.face, x: cell.x, y: cell.y });
        seen.add(key);
        if (tile === 2 || blockers.has(key)) break;
      }
    }
    return cells;
  }

  /** Earliest arrival of fire, including chain reactions. Active flames have time zero. */
  dangerMap() {
    const result = new Map();
    const burning = new Set(this.flames.filter(flame => this.isCellActive(flame)).map(keyOf));
    const times = this.bombs.map(bomb => bombFlameCells(bomb, this.time).some(cell => burning.has(keyOf(cell))) ? 0 : Math.max(0, bomb.fuse));
    const rays = this.bombs.map(bomb => this.blastCells(bomb));
    const bombIndices = new Map();
    this.bombs.forEach((bomb, i) => bombFlameCells(bomb, this.time).forEach(cell => {
      if (!this.isCellActive(cell)) return;
      const key = keyOf(cell);
      if (!bombIndices.has(key)) bombIndices.set(key, []);
      bombIndices.get(key).push(i);
    }));
    for (let pass = 0; pass < this.bombs.length; pass++) {
      let changed = false;
      rays.forEach((cells, i) => cells.forEach(cell => {
        for (const j of bombIndices.get(keyOf(cell)) || []) {
          if (times[j] > times[i]) { times[j] = times[i]; changed = true; }
        }
      }));
      if (!changed) break;
    }
    rays.forEach((cells, i) => cells.forEach(cell => {
      const key = keyOf(cell);
      result.set(key, Math.min(result.get(key) ?? Infinity, times[i]));
    }));
    this.flames.filter(flame => this.isCellActive(flame)).forEach(flame => result.set(keyOf(flame), 0));
    if (this.nextCollapse && this.nextCollapse.at - this.time <= FACE_COLLAPSE_WARNING + 1e-9) {
      const remaining = Math.max(0, this.nextCollapse.at - this.time);
      for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
        const key = tileKey(this.nextCollapse.face, x, y);
        result.set(key, Math.min(result.get(key) ?? Infinity, remaining));
      }
    }
    if (this.nextShrink && this.nextShrink.at - this.time <= FACE_SHRINK_WARNING + 1e-9) {
      const remaining = Math.max(0, this.nextShrink.at - this.time);
      for (const cell of this.cellsOutsideBounds(this.nextShrink.face, this.nextShrink.bounds)) {
        const key = keyOf(cell);
        result.set(key, Math.min(result.get(key) ?? Infinity, remaining));
      }
    }
    return result;
  }

  collectBonus(actor) {
    const index = this.bonuses.findIndex(bonus => keyOf(bonus) === keyOf(actor));
    if (index < 0) return;
    const [bonus] = this.bonuses.splice(index, 1);
    if (bonus.type === 'range') actor.range = Math.min(12, actor.range + 1);
    if (bonus.type === 'bomb') actor.capacity = Math.min(5, actor.capacity + 1);
    if (bonus.type === 'speed') actor.speed = Math.min(4, actor.speed + 1);
    this.events.push({ ...bonus, type: 'bonus', id: actor.id, bonus: bonus.type });
  }

  explode(bomb) {
    if (!this.bombs.includes(bomb)) return;
    const origin = bombExplosionCell(bomb, this.time);
    const cells = this.blastCells(bomb);
    this.bombs.splice(this.bombs.indexOf(bomb), 1);
    const hit = new Set(cells.map(keyOf));
    const chained = this.bombs.filter(other => bombFlameCells(other, this.time).some(cell => hit.has(keyOf(cell))));
    for (const cell of cells) {
      const existing = this.flames.find(flame => keyOf(flame) === keyOf(cell));
      if (existing) existing.ttl = 0.75;
      else this.flames.push({ ...cell, ttl: 0.75 });
      const tile = this.grid[cell.face][cell.y][cell.x];
      if (tile === 2) {
        this.grid[cell.face][cell.y][cell.x] = 0;
        this.events.push({ type: 'brick', ...cell });
        if (this.random() < 0.45) {
          const bonusRoll = this.random();
          const type = bonusRoll < 0.65 ? 'bomb' : bonusRoll < 0.85 ? 'speed' : 'range';
          this.bonuses.push({ ...cell, type });
        }
      }
    }
    this.events.push({ type: 'explode', id: bomb.id, owner: bomb.owner, ...origin, cells });
    chained.forEach(other => this.explode(other));
  }

  killPlayers(victims, cause, locationOf = actor => actor) {
    const living = this.players.filter(actor => actor.alive);
    for (const actor of victims) {
      if (!actor.alive) continue;
      actor.alive = false;
      actor.diedAt = this.time;
      actor.place = living.length;
      const location = locationOf(actor);
      this.events.push({ type: 'death', id: actor.id, face: location.face, x: location.x, y: location.y, diedAt: actor.diedAt, place: actor.place, ...(cause ? { cause } : {}) });
    }
  }

  checkFlameDeaths() {
    const burning = new Set(this.flames.filter(flame => this.isCellActive(flame)).map(keyOf));
    this.killPlayers(this.players.filter(actor => actor.alive && this.time >= actor.protectedUntil && flameVulnerableCells(actor, this.time).some(cell => burning.has(keyOf(cell)))));
  }

  checkEnd() {
    if (this.status !== 'playing') return;
    if (this.multiplayer) {
      const living = this.players.filter(player => player.alive);
      if (living.length <= 1) {
        this.status = 'finished';
        this.winnerId = living[0]?.id ?? null;
        this.endedAt = this.time;
        if (living[0]) living[0].place = 1;
        this.events.push({ type: 'end', status: this.status, winnerId: this.winnerId, endedAt: this.endedAt });
      }
      return;
    }
    if (!this.players[0].alive) { this.players[0].diedAt ??= this.time; this.status = 'lost'; }
    else if (this.players.filter(player => player.alive).length === 1) { this.status = 'won'; this.players[0].place = 1; }
    if (this.status !== 'playing') {
      this.endedAt = this.time;
      this.winnerId = this.status === 'won' ? 0 : null;
      this.events.push({ type: 'end', status: this.status });
    }
  }

  /** Find the quickest surface route, including remaining and edge-crossing cooldowns. */
  findPath(actor, danger, goal, { escape = false, maxDepth = 48 } = {}) {
    const queue = [{ face: actor.face, x: actor.x, y: actor.y, depth: 0, firstDir: null, elapsed: actor.moveCooldown }];
    const earliest = new Map([[keyOf(actor), actor.moveCooldown]]);
    const step = this.moveDuration(actor);
    while (queue.length) {
      const cell = queue.shift();
      if (cell.elapsed > earliest.get(keyOf(cell)) + 1e-9) continue;
      if (cell.depth > 0 && goal(cell)) return cell;
      if (cell.depth >= maxDepth) continue;
      const offset = (actor.id + Math.floor(this.time / 3)) % 4;
      for (let i = 0; i < 4; i++) {
        const dir = (i + offset) % 4;
        const next = neighbor(cell.face, cell.x, cell.y, dir);
        const key = keyOf(next);
        if (!this.canEnter(next)) continue;
        const arrival = cell.elapsed + Math.max(step, cell.face !== next.face ? 0.5 : 0);
        if (arrival >= (earliest.get(key) ?? Infinity) - 1e-9) continue;
        const fireTime = danger.get(key);
        // Escape may cross a future ray while there is still enough time to leave it.
        if (fireTime !== undefined && (!escape || fireTime < arrival + step + 0.2)) continue;
        const sourceFire = danger.get(keyOf(cell));
        if (escape && sourceFire !== undefined && sourceFire < arrival + 0.1) continue;
        earliest.set(key, arrival);
        const queued = { ...next, depth: cell.depth + 1, firstDir: cell.firstDir ?? dir, elapsed: arrival };
        const insertAt = queue.findIndex(other => other.elapsed > arrival);
        if (insertAt < 0) queue.push(queued);
        else queue.splice(insertAt, 0, queued);
      }
    }
    return null;
  }

  canEscapeBomb(actor) {
    const hypothetical = { id: -1, owner: actor.id, face: actor.face, x: actor.x, y: actor.y, range: actor.range, fuse: 2.7 };
    this.bombs.push(hypothetical);
    const danger = this.dangerMap();
    const route = this.findPath(actor, danger, cell => (danger.get(keyOf(cell)) ?? Infinity) > hypothetical.fuse + 0.85, { escape: true, maxDepth: 8 });
    this.bombs.pop();
    return Boolean(route);
  }

  thinkBot(actor) {
    const danger = this.dangerMap();
    if (danger.has(keyOf(actor))) {
      const escape = this.findPath(actor, danger, cell => !danger.has(keyOf(cell)), { escape: true, maxDepth: 48 });
      if (escape) { this.move(actor.id, escape.firstDir); return; }
      const currentDanger = danger.get(keyOf(actor));
      const cover = this.findPath(actor, danger, cell => (danger.get(keyOf(cell)) ?? Infinity) > currentDanger + 0.85, { escape: true, maxDepth: 12 });
      if (cover) { this.move(actor.id, cover.firstDir); return; }
      const collapseWarning = this.nextCollapse?.face === actor.face && this.nextCollapse.at - this.time <= FACE_COLLAPSE_WARNING && this.nextCollapse.at - this.time > 3.6;
      const shrinkWarning = this.nextShrink?.face === actor.face && !withinBounds(actor, this.nextShrink.bounds) && this.nextShrink.at - this.time <= FACE_SHRINK_WARNING && this.nextShrink.at - this.time > 3.6;
      const warning = collapseWarning || shrinkWarning;
      if (warning && actor.bombCooldown <= 0 && this.bombs.filter(bomb => bomb.owner === actor.id).length < actor.capacity) {
        const preview = this.blastCells({ id: -1, face: actor.face, x: actor.x, y: actor.y, range: actor.range });
        if (preview.some(cell => this.grid[cell.face][cell.y][cell.x] === 2) && this.canEscapeBomb(actor) && this.placeBomb(actor.id)) {
          actor.bombCooldown = 1.2;
          const nextDanger = this.dangerMap();
          const retreat = this.findPath(actor, nextDanger, cell => (nextDanger.get(keyOf(cell)) ?? Infinity) > 3.55, { escape: true, maxDepth: 12 });
          if (retreat) this.move(actor.id, retreat.firstDir);
        }
      }
      return;
    }
    const preview = this.blastCells({ id: -1, face: actor.face, x: actor.x, y: actor.y, range: actor.range });
    const hit = new Set(preview.map(keyOf));
    const hitsOpponent = this.players.some(other => other.alive && other.id !== actor.id && hit.has(keyOf(other)));
    const hitsBrick = preview.some(cell => this.grid[cell.face][cell.y][cell.x] === 2);
    if (actor.bombCooldown <= 0 && (hitsOpponent || (hitsBrick && this.random() < 0.22)) && this.bombs.filter(bomb => bomb.owner === actor.id).length < actor.capacity && this.canEscapeBomb(actor)) {
      if (this.placeBomb(actor.id)) {
        actor.bombCooldown = 1.1 + this.random() * 0.8;
        const newDanger = this.dangerMap();
        const escape = this.findPath(actor, newDanger, cell => !newDanger.has(keyOf(cell)), { escape: true, maxDepth: 12 });
        if (escape) this.move(actor.id, escape.firstDir);
        return;
      }
    }
    const liveOthers = this.players.filter(other => other.alive && other.id !== actor.id);
    if (actor.targetUntil < this.time || !liveOthers.some(other => other.id === actor.targetId)) {
      actor.targetId = liveOthers[Math.floor(this.random() * liveOthers.length)]?.id;
      actor.targetUntil = this.time + 3 + this.random() * 4;
    }
    // Bonuses are useful local detours; enemies keep bots travelling between faces.
    const nearBonus = this.findPath(actor, danger, cell => this.bonuses.some(bonus => keyOf(bonus) === keyOf(cell)), { maxDepth: 4 });
    const target = this.players.find(other => other.id === actor.targetId);
    const route = nearBonus || (target && this.findPath(actor, danger, cell => keyOf(cell) === keyOf(target)));
    if (route) { this.move(actor.id, route.firstDir); return; }
    const offset = Math.floor(this.random() * 4);
    for (let i = 0; i < 4; i++) {
      const dir = (offset + i) % 4;
      const cell = neighbor(actor.face, actor.x, actor.y, dir);
      if (!danger.has(keyOf(cell)) && this.move(actor.id, dir)) return;
    }
  }

  update(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    let remaining = dt;
    while (remaining > 0.000001) {
      let running = this.isRunning();
      if (running) { this.updateCollapseSchedule(); running = this.isRunning(); }
      const untilDeathEnds = this.status === 'lost' && running ? this.players[0].diedAt + 3 - this.time : Infinity;
      const collapseBoundary = this.nextCollapse ? (this.collapseWarningIssued ? this.nextCollapse.at : this.nextCollapse.at - FACE_COLLAPSE_WARNING) : Infinity;
      const shrinkBoundary = this.nextShrink ? (this.shrinkWarningIssued ? this.nextShrink.at : this.nextShrink.at - FACE_SHRINK_WARNING) : Infinity;
      const boundary = Math.min(collapseBoundary, shrinkBoundary);
      const untilCollapseBoundary = running && boundary - this.time > 1e-9 ? boundary - this.time : Infinity;
      const step = Math.min(remaining, 0.05, untilDeathEnds, untilCollapseBoundary);
      remaining -= step;
      this.time += step;
      if (!running) continue;
      this.updateCollapseSchedule();
      if (this.status === 'won' || this.status === 'finished') continue;
      for (const actor of this.players) {
        actor.moveCooldown = Math.max(0, actor.moveCooldown - step);
        actor.bombCooldown = Math.max(0, actor.bombCooldown - step);
        actor.botThink -= step;
      }
      this.flames.forEach(flame => flame.ttl -= step);
      this.flames = this.flames.filter(flame => flame.ttl > 0);
      this.bombs.forEach(bomb => bomb.fuse -= step);
      for (const bomb of [...this.bombs]) {
        if (!this.bombs.includes(bomb)) continue;
        if (bombFlameCells(bomb, this.time).some(cell => this.flames.some(flame => keyOf(flame) === keyOf(cell)))) { this.explode(bomb); continue; }
        if (!bomb.moving) continue;
        bomb.moveAccumulator = (bomb.moveAccumulator || 0) + step;
        while (bomb.moving && bomb.moveAccumulator >= BOMB_STEP_SECONDS - 0.00001) {
          bomb.moveAccumulator -= BOMB_STEP_SECONDS;
          this.advanceBomb(bomb);
          if (bombFlameCells(bomb, this.time).some(cell => this.flames.some(flame => keyOf(flame) === keyOf(cell)))) {
            this.explode(bomb);
            break;
          }
        }
      }
      this.bombs.filter(bomb => bomb.fuse <= 0.00001).forEach(bomb => this.explode(bomb));
      this.checkFlameDeaths();
      this.checkEnd();
      if (this.botsEnabled && this.isRunning()) {
        for (const actor of this.players) {
          if (this.humanIds.has(actor.id)) continue;
          if (!actor.alive || actor.moveCooldown > 0.0001 || actor.botThink > 0) continue;
          this.thinkBot(actor);
          actor.botThink = this.moveDuration(actor) * (0.85 + this.random() * 0.15);
        }
      }
    }
  }
}
