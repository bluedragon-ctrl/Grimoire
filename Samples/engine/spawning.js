// Spawning — monster, item, and dungeon-object placement on a level.

import { MONSTER_TEMPLATES } from '../config/entities.js';
import { ITEM_DEFS } from '../config/items.js';
import { DUNGEON_OBJECT_DEFS, rollSpecialObject } from '../config/dungeon-objects.js';
import { DUNGEON_CONFIG as DC } from '../config/dungeon.js';
import { tileKind } from '../config/tiles.js';
import { MONSTER_GROUPS, groupPoolForDepth } from '../config/monster-groups.js';
import { floorLootTableForDepth, rollLoot } from '../config/loot-tables.js';

const MAX_SPAWN_ATTEMPTS = 200;

// ── Seeded RNG ────────────────────────────────────────────────

/**
 * Mulberry32 — fast, seedable, good quality for game use.
 * Returns a zero-arg function producing uniform [0, 1).
 */
export function makeSeedRng(seed) {
  let s = seed >>> 0;
  return function rng() {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

// ── Weighted random ───────────────────────────────────────────

function rngWeighted(rng, pool) {
  const total = pool.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [item, weight] of pool) {
    r -= weight;
    if (r <= 0) return item;
  }
  return pool[pool.length - 1][0];
}

// ── Tile finding ──────────────────────────────────────────────

/**
 * Build the shared forbidden set: player position, stairs, all current monsters,
 * plus any extra occupied keys passed in.
 */
function buildForbidden(state, occupied) {
  const forbidden = new Set(occupied);
  if (state.player) forbidden.add(`${state.player.x},${state.player.y}`);
  if (state.stairsDown) forbidden.add(`${state.stairsDown.x},${state.stairsDown.y}`);
  if (state.stairsUp)   forbidden.add(`${state.stairsUp.x},${state.stairsUp.y}`);
  for (const m of state.monsters) forbidden.add(`${m.x},${m.y}`);
  return forbidden;
}

/**
 * Find a random free floor tile. Adds the found position to `occupied`.
 * Falls back to null if MAX_SPAWN_ATTEMPTS exhausted.
 */
function findFreeTile(state, rng, occupied) {
  const forbidden = buildForbidden(state, occupied);
  for (let i = 0; i < MAX_SPAWN_ATTEMPTS; i++) {
    const x = Math.floor(rng() * state.width);
    const y = Math.floor(rng() * state.height);
    const key = `${x},${y}`;
    if (tileKind(state.map[y][x]) === 'floor' && !forbidden.has(key)) {
      occupied.add(key);
      return { x, y };
    }
  }
  return null;
}

/**
 * Find a free floor tile within `radius` of (cx, cy).
 * Returns null if no suitable tile found within 30 attempts.
 */
function findNearTile(state, cx, cy, radius, rng, occupied) {
  const forbidden = buildForbidden(state, occupied);
  for (let i = 0; i < 30; i++) {
    const dx = Math.floor(rng() * (radius * 2 + 1)) - radius;
    const dy = Math.floor(rng() * (radius * 2 + 1)) - radius;
    const x = cx + dx;
    const y = cy + dy;
    if (x < 0 || y < 0 || y >= state.height || x >= state.width) continue;
    const key = `${x},${y}`;
    if (tileKind(state.map[y][x]) === 'floor' && !forbidden.has(key)) {
      occupied.add(key);
      return { x, y };
    }
  }
  return null;
}

// Legacy Math.random tile finder — preserved for spawnObjects (not yet seeded).
function findSpawnTile(state, extraOccupied) {
  const forbidden = new Set();
  forbidden.add(`${state.player.x},${state.player.y}`);
  forbidden.add(`${state.stairsDown.x},${state.stairsDown.y}`);
  forbidden.add(`${state.stairsUp.x},${state.stairsUp.y}`);
  for (const m of state.monsters) {
    forbidden.add(`${m.x},${m.y}`);
  }
  if (extraOccupied) {
    for (const k of extraOccupied) forbidden.add(k);
  }

  for (let i = 0; i < MAX_SPAWN_ATTEMPTS; i++) {
    const x = Math.floor(Math.random() * state.width);
    const y = Math.floor(Math.random() * state.height);
    const key = `${x},${y}`;
    if (tileKind(state.map[y][x]) === 'floor' && !forbidden.has(key)) {
      forbidden.add(key);
      if (extraOccupied) extraOccupied.add(key);
      return { x, y };
    }
  }

  return null;
}

// ── Formation helpers ─────────────────────────────────────────

function expandMembers(members) {
  const result = [];
  for (const [type, count] of members) {
    for (let i = 0; i < count; i++) result.push(type);
  }
  return result;
}

/**
 * Cluster placement: seed tile + nearby tiles (radius 3) for each member.
 * Falls back to any free tile if no near tile is found.
 */
function placeCluster(state, types, rng, occupied) {
  const seed = findFreeTile(state, rng, occupied);
  if (!seed) return;
  spawnMonsterFromTemplate(state, types[0], seed);

  for (let i = 1; i < types.length; i++) {
    const pos = findNearTile(state, seed.x, seed.y, 3, rng, occupied)
             || findFreeTile(state, rng, occupied);
    if (pos) spawnMonsterFromTemplate(state, types[i], pos);
  }
}

/**
 * Line placement: seed + members in a straight H or V direction.
 * Falls back to any free tile when the line is blocked.
 * Returns false if the seed tile couldn't be found (caller tries cluster).
 */
function tryLine(state, types, rng, occupied) {
  const seed = findFreeTile(state, rng, occupied);
  if (!seed) return false;
  spawnMonsterFromTemplate(state, types[0], seed);

  const horizontal = rng() < 0.5;
  const sign = rng() < 0.5 ? 1 : -1;

  for (let step = 1; step < types.length; step++) {
    const x = horizontal ? seed.x + step * sign : seed.x;
    const y = horizontal ? seed.y : seed.y + step * sign;
    let pos = null;
    if (x >= 0 && y >= 0 && y < state.height && x < state.width) {
      const key = `${x},${y}`;
      const forbidden = buildForbidden(state, occupied);
      if (tileKind(state.map[y][x]) === 'floor' && !forbidden.has(key)) {
        occupied.add(key);
        pos = { x, y };
      }
    }
    if (!pos) pos = findFreeTile(state, rng, occupied);
    if (pos) spawnMonsterFromTemplate(state, types[step], pos);
  }
  return true;
}

/**
 * Adjacent placement: seed + one adjacent tile for the second member.
 * Any further members use any free tile.
 * Returns false only if the seed tile couldn't be found.
 */
function tryAdjacent(state, types, rng, occupied) {
  const seed = findFreeTile(state, rng, occupied);
  if (!seed) return false;
  spawnMonsterFromTemplate(state, types[0], seed);

  if (types.length < 2) return true;

  const dirs = [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }];
  // Fisher-Yates shuffle for random direction order
  for (let i = dirs.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
  }

  const forbidden = buildForbidden(state, occupied);
  let placed = false;
  for (const { dx, dy } of dirs) {
    const x = seed.x + dx;
    const y = seed.y + dy;
    if (x < 0 || y < 0 || y >= state.height || x >= state.width) continue;
    const key = `${x},${y}`;
    if (tileKind(state.map[y][x]) !== 'floor' || forbidden.has(key)) continue;
    occupied.add(key);
    spawnMonsterFromTemplate(state, types[1], { x, y });
    placed = true;
    break;
  }
  if (!placed) {
    const pos = findFreeTile(state, rng, occupied);
    if (pos) spawnMonsterFromTemplate(state, types[1], pos);
  }

  // Any members beyond the pair use free tiles
  for (let i = 2; i < types.length; i++) {
    const pos = findFreeTile(state, rng, occupied);
    if (pos) spawnMonsterFromTemplate(state, types[i], pos);
  }
  return true;
}

/**
 * Place one monster group according to its formation spec.
 * Falls back to cluster if the formation can't place the first member.
 */
function placeGroup(state, group, rng, occupied) {
  const types = expandMembers(group.members);
  if (types.length === 0) return;

  switch (group.formation) {
    case 'single':
      // Single is just the first member; treat as cluster of 1
      placeCluster(state, [types[0]], rng, occupied);
      return;
    case 'line':
      if (!tryLine(state, types, rng, occupied)) placeCluster(state, types, rng, occupied);
      return;
    case 'adjacent':
      if (!tryAdjacent(state, types, rng, occupied)) placeCluster(state, types, rng, occupied);
      return;
    default:
      placeCluster(state, types, rng, occupied);
  }
}

// ── Public API ─────────────────────────────────────────────────

/**
 * Build a fully realized monster instance from a template, place it at `pos`,
 * and push it onto `state.monsters`. Returns the new instance, or null if the
 * template key is unknown.
 */
export function spawnMonsterFromTemplate(state, templateKey, pos, overrides = {}) {
  const template = MONSTER_TEMPLATES[templateKey];
  if (!template) return null;

  state.nextMonsterId++;

  const startInv = Array.isArray(template.startingInventory) ? template.startingInventory : [];
  const inventory = [];
  for (const key of startInv) {
    const def = ITEM_DEFS[key];
    if (!def) continue;
    state.nextItemId++;
    inventory.push({
      id: `${key}_${state.nextItemId}`,
      type: key,
      level: DC.itemLevel(state.depth),
      colors: def.colors ? { ...def.colors } : undefined,
    });
  }

  const spawnLevel = overrides.level ?? template.level;
  const levelDelta = Math.max(0, spawnLevel - template.level);

  const scaledStats = {};
  if (template.statScaling && levelDelta > 0) {
    for (const [stat, perLevel] of Object.entries(template.statScaling)) {
      if (typeof template[stat] === 'number') {
        scaledStats[stat] = template[stat] + perLevel * levelDelta;
      }
    }
    if (scaledStats.maxHp !== undefined) scaledStats.hp = scaledStats.maxHp;
    if (scaledStats.maxMp !== undefined) scaledStats.mp = scaledStats.maxMp;
  }

  const instance = {
    id: `${template.type}_${state.nextMonsterId}`,
    ...template,
    ...scaledStats,
    resistances: { ...(template.resistances || {}) },
    level: spawnLevel,
    x: pos.x,
    y: pos.y,
    energy: 0,
    inventory,
    statuses: [],
    scripts: {},
    lastAttacker: null,
    memory: {},
    ownerId: null,
    duration: null,
    ...overrides,
  };

  state.monsters.push(instance);
  return instance;
}

/**
 * Spawn monster groups for a floor using the depth-based group pool.
 * @param {object} state
 * @param {number} depth
 * @param {() => number} rng - Seeded RNG (pass makeSeedRng result)
 */
export function spawnMonsters(state, depth, rng = () => Math.random()) {
  const groupCount = DC.groupsPerLevel(depth);
  const pool = groupPoolForDepth(depth);

  const monsters = [];
  const prev = state.monsters;
  state.monsters = monsters;
  state.depth = depth;
  const occupied = new Set();

  try {
    for (let i = 0; i < groupCount; i++) {
      const groupName = rngWeighted(rng, pool);
      const group = MONSTER_GROUPS[groupName];
      if (!group) continue;
      placeGroup(state, group, rng, occupied);
    }
  } finally {
    state.monsters = prev;
  }

  return monsters;
}

/**
 * Spawn floor items using depth-routed loot tables.
 * @param {object} state
 * @param {number} depth
 * @param {() => number} rng
 */
export function spawnItems(state, depth, rng = () => Math.random()) {
  const tableName = floorLootTableForDepth(depth);
  const types = rollLoot(tableName, rng);

  const items = [];
  const occupied = new Set();

  for (const type of types) {
    const pos = findFreeTile(state, rng, occupied);
    if (!pos) break;

    state.nextItemId++;
    const def = ITEM_DEFS[type];
    if (!def) continue;

    items.push({
      id: `${type}_${state.nextItemId}`,
      type,
      level: DC.itemLevel(depth),
      x: pos.x,
      y: pos.y,
      colors: def.colors ? { ...def.colors } : undefined,
    });
  }

  return items;
}

export function spawnObjects(state) {
  const occupied = new Set();
  if (state.player) occupied.add(`${state.player.x},${state.player.y}`);
  for (const m of state.monsters) occupied.add(`${m.x},${m.y}`);

  const objects = [];

  // ── Stairs — always one pair per floor ───────────────────
  function makeStairs(type, pos) {
    const def = DUNGEON_OBJECT_DEFS[type];
    const obj = {
      id: `${type}_0`,
      type,
      x: pos.x,
      y: pos.y,
      state: {},
      triggers: def.triggers ? { ...def.triggers } : undefined,
    };
    objects.push(obj);
    occupied.add(`${pos.x},${pos.y}`);
    const room = (state.rooms || []).find(
      r => pos.x >= r.x && pos.x < r.x + r.w && pos.y >= r.y && pos.y < r.y + r.h
    );
    if (room) room.objects.push(obj.id);
  }

  if (state.stairsDown) makeStairs('stairs_down', state.stairsDown);
  if (state.stairsUp)   makeStairs('stairs_up',   state.stairsUp);

  // ── Chests — 1–2 per floor in non-spawn rooms ────────────
  if (!state.rooms || state.rooms.length < 2) return objects;

  const eligibleRooms = state.rooms.slice(1).filter(r => r.w > 0 && r.h > 0);
  if (eligibleRooms.length === 0) return objects;

  const chestCount = 1 + Math.floor(Math.random() * 2);
  for (let i = 0; i < chestCount; i++) {
    const room = eligibleRooms[Math.floor(Math.random() * eligibleRooms.length)];
    let placed = false;
    for (let attempt = 0; attempt < 50 && !placed; attempt++) {
      const x = room.x + Math.floor(Math.random() * room.w);
      const y = room.y + Math.floor(Math.random() * room.h);
      const key = `${x},${y}`;
      if (tileKind(state.map[y][x]) !== 'floor' || occupied.has(key)) continue;
      occupied.add(key);
      const chestDef = DUNGEON_OBJECT_DEFS['chest'];
      const obj = {
        id: `chest_${objects.length}`,
        type: 'chest',
        x, y,
        state: { opened: false },
        triggers: chestDef.triggers ? { ...chestDef.triggers } : undefined,
      };
      objects.push(obj);
      room.objects.push(obj.id);
      placed = true;
    }
  }

  // ── Doors — corridor chokepoints between rooms ──────────
  const chokepoints = findCorridorChokepoints(state);
  const doorCount = Math.min(chokepoints.length, 1 + Math.floor(Math.random() * 2));
  const shuffled = chokepoints.slice().sort(() => Math.random() - 0.5);
  const doorDef = DUNGEON_OBJECT_DEFS['door'];
  let doorsPlaced = 0;
  for (const pos of shuffled) {
    if (doorsPlaced >= doorCount) break;
    const key = `${pos.x},${pos.y}`;
    if (occupied.has(key)) continue;
    occupied.add(key);
    const obj = {
      id: `door_${objects.length}`,
      type: 'door',
      x: pos.x,
      y: pos.y,
      state: { ...doorDef.defaultState },
      triggers: doorDef.triggers ? { ...doorDef.triggers } : undefined,
    };
    objects.push(obj);
    doorsPlaced++;
  }

  // ── Traps — 2-4 per floor, random types ─────────────────
  const TRAP_TYPES = [
    'trap_spike', 'trap_poison_spike', 'trap_bear_trap',
    'trap_fire', 'trap_cold', 'trap_steam',
    'trap_lightning', 'trap_teleport', 'trap_mana_burn', 'trap_weaken',
  ];
  const trapCount = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < trapCount; i++) {
    const type = TRAP_TYPES[Math.floor(Math.random() * TRAP_TYPES.length)];
    const def = DUNGEON_OBJECT_DEFS[type];
    const pos = findSpawnTile(state, occupied);
    if (!pos) continue;
    const obj = {
      id: `${type}_${objects.length}`,
      type,
      x: pos.x,
      y: pos.y,
      state: { ...(def.defaultState || {}) },
      triggers: def.triggers ? { ...def.triggers } : undefined,
      colors: def.colors ? { ...def.colors } : undefined,
      hidden: def.hidden ?? false,
    };
    objects.push(obj);
  }

  // ── Fountains — one health, one mana per floor ──────────
  for (const type of ['fountain_health', 'fountain_mana']) {
    const def = DUNGEON_OBJECT_DEFS[type];
    const pos = findSpawnTile(state, occupied);
    if (!pos) continue;
    const obj = {
      id: `${type}_${objects.length}`,
      type,
      x: pos.x,
      y: pos.y,
      state: { ...(def.defaultState || {}) },
      triggers: def.triggers ? { ...def.triggers } : undefined,
    };
    objects.push(obj);
  }

  // ── Special objects — 0-1 per floor via pool ─────────────
  // Uses a throwaway RNG since spawnObjects doesn't yet receive the seeded rng.
  const specialRng = () => Math.random();
  const specialType = rollSpecialObject(state.depth || 1, specialRng);
  if (specialType && eligibleRooms.length > 0) {
    const room = eligibleRooms[Math.floor(Math.random() * eligibleRooms.length)];
    let placed = false;
    for (let attempt = 0; attempt < 50 && !placed; attempt++) {
      const x = room.x + Math.floor(Math.random() * room.w);
      const y = room.y + Math.floor(Math.random() * room.h);
      const key = `${x},${y}`;
      if (tileKind(state.map[y][x]) !== 'floor' || occupied.has(key)) continue;
      occupied.add(key);
      const def = DUNGEON_OBJECT_DEFS[specialType];
      if (!def) break;
      const obj = {
        id: `${specialType}_${objects.length}`,
        type: specialType,
        x, y,
        state: { ...(def.defaultState || {}) },
        triggers: def.triggers ? { ...def.triggers } : undefined,
      };
      objects.push(obj);
      room.objects.push(obj.id);
      placed = true;
    }
  }

  return objects;
}

function findCorridorChokepoints(state) {
  const { map, rooms } = state;
  if (!map || !rooms || rooms.length === 0) return [];

  const roomTileSet = new Set();
  for (const r of rooms) {
    for (let dy = 0; dy < r.h; dy++) {
      for (let dx = 0; dx < r.w; dx++) {
        roomTileSet.add(`${r.x + dx},${r.y + dy}`);
      }
    }
  }

  const chokepoints = [];
  for (let y = 1; y < map.length - 1; y++) {
    for (let x = 1; x < map[0].length - 1; x++) {
      if (tileKind(map[y][x]) !== 'floor') continue;
      if (roomTileSet.has(`${x},${y}`)) continue;

      const nFloor = tileKind(map[y - 1][x]) === 'floor';
      const sFloor = tileKind(map[y + 1][x]) === 'floor';
      const eFloor = tileKind(map[y][x + 1]) === 'floor';
      const wFloor = tileKind(map[y][x - 1]) === 'floor';

      if ((nFloor && sFloor && !eFloor && !wFloor) ||
          (eFloor && wFloor && !nFloor && !sFloor)) {
        chokepoints.push({ x, y });
      }
    }
  }
  return chokepoints;
}
