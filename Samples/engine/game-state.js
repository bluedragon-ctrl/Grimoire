// Game state container — pure accessors and updaters.
// State is a plain object; functions return new/mutated state.

import { PLAYER_TEMPLATE } from '../config/entities.js';
import { DUNGEON_CONFIG as DC } from '../config/dungeon.js';
import { blocksMove } from '../config/tiles.js';
import { cloudsBlockMove, onEnterCloud } from './clouds.js';
import { DUNGEON_OBJECT_DEFS } from '../config/dungeon-objects.js';
import { CLOUD_DEFS } from '../config/clouds.js';

/** Build the set of tile keys opaque due to clouds (for FOV). */
export function buildCloudSightSet(state) {
  if (!state.clouds || state.clouds.length === 0) return null;
  const set = new Set();
  for (const c of state.clouds) {
    if (!CLOUD_DEFS[c.kind]?.blocksSight) continue;
    for (const t of c.tiles) set.add(`${t.x},${t.y}`);
  }
  return set.size ? set : null;
}
import { generateLevel } from './dungeon-gen.js';
import { computeFOV } from './fov.js';
import { spawnMonsters, spawnItems, spawnObjects } from './spawning.js';
import { noteSeen as catalogNoteSeen } from './catalog.js';

// Re-export level transitions so existing consumers don't need to change imports.
export { descendStairs, ascendStairs } from './level-manager.js';

// ── State Creation ──────────────────────────────────────────

export function createInitialState(startDepth = 1) {
  const depth = startDepth;
  const level = generateLevel(depth);

  const state = {
    depth,
    map: level.map,
    width: level.width,
    height: level.height,
    rooms: level.rooms,
    stairsDown: level.stairsDown,
    stairsUp: level.stairsUp,
    player: createPlayer(level.spawnPoint),
    monsters: [],
    floorItems: [],
    floorObjects: [],
    visible: new Uint8Array(level.width * level.height),
    explored: new Uint8Array(level.width * level.height),
    levelCache: {},  // depth → saved level state
    nextMonsterId: 0,
    nextItemId: 0,
    turn: 0,
    tick: 0,
    pendingKills: [],
    pendingTriggers: [],
    log: [],
    activeEffects: [],
    nextEffectId: 0,
    clouds: [],
    nextCloudId: 1,
  };

  state.monsters = spawnMonsters(state, depth);
  state.floorItems = spawnItems(state, depth);
  state.floorObjects = spawnObjects(state);
  updateVisibility(state);

  return state;
}

function createPlayer(spawnPoint) {
  return {
    id: 'player',
    ...PLAYER_TEMPLATE,
    // Per-instance clone — template is shared; resistances mutate at runtime.
    resistances: { ...(PLAYER_TEMPLATE.resistances || {}) },
    // Per-instance clone — school levels advance via tomes at runtime.
    schools: { ...(PLAYER_TEMPLATE.schools || {}) },
    // Per-instance equipment aggregate; the `merge` DSL verb writes here.
    equipment: { ...(PLAYER_TEMPLATE.equipment || {}) },
    x: spawnPoint.x,
    y: spawnPoint.y,
    energy: 10, // start ready to act — first command pays this down to 0
    inventory: [],
    statuses: [],
    knownCommands: ['move', 'attack', 'cast', 'pickup', 'use', 'drop', 'where', 'scan', 'inspect', 'inventory', 'wait', 'spells'],
    knownSpells: ['magic_missile'],
    knownTemplates: [],
    knownStatuses: [],
    scripts: {},
    lastAttacker: null,
    memory: {},
  };
}

// ── Entity Predicates ──────────────────────────────────────
// Single source of truth for "is this entity alive?". Any entity with an hp
// field is considered alive iff hp > 0. Entities without hp (e.g. floor items)
// are treated as alive so filters don't silently drop them.

export function isAlive(e) {
  return !!e && (e.hp === undefined || e.hp > 0);
}

// Read a stat with the entity's equipment aggregate folded in. Engine code
// that derives gameplay (damage, scheduler energy grant, FOV, caps) should
// route stat reads through here so equipment bonuses take effect without
// scattering `entity.equipment[stat] || 0` at every call site. DSL dot-access
// (`self.atk`, etc.) still returns the *base* stat — equipment is a derived
// layer surfaced via `inspect self`.
export function effectiveStat(entity, stat) {
  if (!entity) return 0;
  const base = entity[stat] || 0;
  const bonus = (entity.equipment && entity.equipment[stat]) || 0;
  return base + bonus;
}

export function isDead(e) {
  return !!e && e.hp !== undefined && e.hp <= 0;
}

// ── Utilities ──────────────────────────────────────────────

function isInBounds(state, x, y) {
  return x >= 0 && y >= 0 && y < state.height && x < state.width;
}

export function applyLevel(state, level) {
  state.map = level.map;
  state.width = level.width;
  state.height = level.height;
  state.rooms = level.rooms;
  state.stairsDown = level.stairsDown;
  state.stairsUp = level.stairsUp;
  state.monsters = level.monsters;
  state.floorItems = level.floorItems;
  // Visibility grids are flat Uint8Arrays of length width*height. Callers
  // may hand us pre-built ones (fresh floor) or we build empty ones so the
  // first updateVisibility can fill them in.
  const size = level.width * level.height;
  state.visible = level.visible instanceof Uint8Array ? level.visible : new Uint8Array(size);
  state.explored = level.explored instanceof Uint8Array ? level.explored : new Uint8Array(size);
}

// ── Tile Access ─────────────────────────────────────────────

export function getTile(state, x, y) {
  if (!isInBounds(state, x, y)) {
    return DC.TILE_WALL;
  }
  return state.map[y][x];
}

function objectBlocksMove(obj) {
  const def = DUNGEON_OBJECT_DEFS[obj.type];
  if (!def?.blocksMove) return false;
  if (obj.state && 'open' in obj.state) return !obj.state.open;
  return true;
}

export function isWalkable(state, x, y) {
  if (blocksMove(getTile(state, x, y))) return false;
  if (cloudsBlockMove(state, x, y)) return false;
  if (state.floorObjects?.some(o => o.x === x && o.y === y && objectBlocksMove(o))) return false;
  return true;
}

/** Set of "x,y" keys for tiles blocked by dungeon objects (e.g. closed doors). */
export function getBlockingObjectTiles(state) {
  if (!state.floorObjects?.length) return new Set();
  const set = new Set();
  for (const obj of state.floorObjects) {
    if (objectBlocksMove(obj)) set.add(`${obj.x},${obj.y}`);
  }
  return set;
}

/** Set of "x,y" keys that block line-of-sight due to dungeon objects (e.g. closed doors). */
export function buildObjectSightSet(state) {
  if (!state.floorObjects?.length) return null;
  const set = new Set();
  for (const obj of state.floorObjects) {
    const def = DUNGEON_OBJECT_DEFS[obj.type];
    if (!def?.blocksSight) continue;
    if (obj.state && 'open' in obj.state && obj.state.open) continue;
    set.add(`${obj.x},${obj.y}`);
  }
  return set.size ? set : null;
}

// ── Entity Access ───────────────────────────────────────────

function getMonsterAt(state, x, y) {
  return state.monsters.find(m => m.x === x && m.y === y && isAlive(m));
}

// ── Movement ────────────────────────────────────────────────

const DIRECTIONS = {
  north: { dx: 0, dy: -1 },
  south: { dx: 0, dy: 1 },
  east:  { dx: 1, dy: 0 },
  west:  { dx: -1, dy: 0 },
  n: { dx: 0, dy: -1 },
  s: { dx: 0, dy: 1 },
  e: { dx: 1, dy: 0 },
  w: { dx: -1, dy: 0 },
};

/**
 * Try to move an entity in a direction.
 * @returns {{ success: boolean, message: string }}
 */
export function moveEntity(state, entityId, direction) {
  const dir = DIRECTIONS[direction];
  if (!dir) {
    return { success: false, message: `Unknown direction: ${direction}` };
  }

  const entity = entityId === 'player'
    ? state.player
    : state.monsters.find(m => m.id === entityId);

  if (!entity) {
    return { success: false, message: `Entity not found: ${entityId}` };
  }

  const newX = entity.x + dir.dx;
  const newY = entity.y + dir.dy;

  if (!isWalkable(state, newX, newY)) {
    return { success: false, message: 'You bump into a wall.' };
  }

  const isPlayer = entity === state.player;
  if (isPlayer) {
    if (getMonsterAt(state, newX, newY)) {
      return { success: false, message: 'A monster blocks your path.' };
    }
  } else {
    if (state.player.x === newX && state.player.y === newY) {
      return { success: false, message: 'Blocked by the player.' };
    }
    const blocker = state.monsters.some(m => m !== entity && isAlive(m) && m.x === newX && m.y === newY);
    if (blocker) return { success: false, message: 'Blocked by another creature.' };
  }

  entity.x = newX;
  entity.y = newY;
  if (isPlayer) markRoomVisited(state, newX, newY);
  onEnterCloud(state, entity);
  enqueueTrapTriggers(state, entity, newX, newY);

  return { success: true, message: `Moved ${direction}.` };
}

/**
 * Move an entity to an absolute position with collision checks.
 * Used by approach/flee where pathfinding provides the target tile.
 * @returns {{ success: boolean }}
 */
export function moveEntityTo(state, entity, x, y) {
  if (!isWalkable(state, x, y)) return { success: false };

  const isPlayer = entity === state.player;
  if (isPlayer && getMonsterAt(state, x, y)) return { success: false };
  if (!isPlayer) {
    const blocked = state.monsters.some(m => m !== entity && isAlive(m) && m.x === x && m.y === y);
    if (blocked || (state.player.x === x && state.player.y === y)) return { success: false };
  }

  entity.x = x;
  entity.y = y;
  if (isPlayer) markRoomVisited(state, x, y);
  onEnterCloud(state, entity);
  enqueueTrapTriggers(state, entity, x, y);
  return { success: true };
}

/** Mark any room containing (x, y) as visited. */
function markRoomVisited(state, x, y) {
  if (!state.rooms) return;
  for (const room of state.rooms) {
    if (!room.visited && x >= room.x && x < room.x + room.w && y >= room.y && y < room.y + room.h) {
      room.visited = true;
    }
  }
}

/**
 * Check for dungeon objects with an onStep trigger at (x,y) and enqueue
 * them for the next world phase. Called after any successful entity move.
 */
export function enqueueTrapTriggers(state, entity, x, y) {
  if (!state.floorObjects) return;
  for (const obj of state.floorObjects) {
    if (obj.x === x && obj.y === y && obj.triggers?.onStep) {
      if (!state.pendingTriggers) state.pendingTriggers = [];
      state.pendingTriggers.push({ objectId: obj.id, trigger: 'onStep', interactor: entity });
    }
  }
}

// ── Visibility ──────────────────────────────────────────────
// Stored as two flat Uint8Array(width*height) — `state.visible` (wiped each
// recompute) and `state.explored` (additive; never cleared until floor
// transition). Use visIdx(x, y, width) to index.

export function visIdx(x, y, width) {
  return y * width + x;
}

/**
 * Allocate a fresh visibility pair for a given size. Returned as an object
 * so callers can spread it into applyLevel.
 */
export function createVisibilityGrid(width, height) {
  const size = width * height;
  return {
    visible: new Uint8Array(size),
    explored: new Uint8Array(size),
  };
}

/**
 * Recompute FOV from player position and update visibility grid.
 */
export function updateVisibility(state) {
  const p = state.player;
  const cloudOpaque = buildCloudSightSet(state);
  const objOpaque = buildObjectSightSet(state);
  let extraOpaque = null;
  if (cloudOpaque && objOpaque) {
    extraOpaque = new Set([...cloudOpaque, ...objOpaque]);
  } else {
    extraOpaque = cloudOpaque || objOpaque;
  }
  const fov = computeFOV(state.map, p.x, p.y, effectiveStat(p, 'fovRadius'), extraOpaque);

  const w = state.width;
  // visible is replaced each tick; explored is additive.
  state.visible.fill(0);

  for (const key of fov) {
    const [x, y] = key.split(',').map(Number);
    if (y >= 0 && y < state.height && x >= 0 && x < state.width) {
      const i = visIdx(x, y, w);
      state.visible[i] = 1;
      state.explored[i] = 1;
    }
  }

  // First-sight catalog registration — any monster type now in the player's
  // FOV gets a 'none' catalog entry (idempotent). Revealed tier is untouched.
  for (const m of state.monsters) {
    if (!isAlive(m)) continue;
    if (isInBounds(state, m.x, m.y) && state.visible[visIdx(m.x, m.y, w)]) {
      catalogNoteSeen(m.type, state.depth);
    }
  }
}

export function isVisible(state, x, y) {
  if (!isInBounds(state, x, y)) return false;
  return !!state.visible[visIdx(x, y, state.width)];
}

export function isExplored(state, x, y) {
  if (!isInBounds(state, x, y)) return false;
  return !!state.explored[visIdx(x, y, state.width)];
}

// ── Logging ─────────────────────────────────────────────────

export function addLog(state, message, type = 'info') {
  state.log.push({ message, type, turn: state.turn });
}
