// Procedural dungeon generator — pure function, no side effects.
// Uses random room placement + L-shaped corridor connections.

import { DUNGEON_CONFIG as DC } from '../config/dungeon.js';

// ── Public API ──────────────────────────────────────────────

/**
 * Generate a dungeon level.
 * @param {number} depth - Current dungeon depth (1-based)
 * @param {number} [seed] - Optional seed (not used yet, for future determinism)
 * @returns {{ map: string[][], rooms: {x,y,w,h}[], spawnPoint: {x,y}, stairsDown: {x,y}, stairsUp: {x,y} }}
 */
export function generateLevel(depth, seed) {
  const width = DC.baseWidth + DC.widthPerDepth * depth;
  const height = DC.baseHeight + DC.heightPerDepth * depth;

  // Fill with walls
  const map = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => DC.TILE_WALL)
  );

  // Place rooms
  const targetRooms = DC.minRooms + DC.roomsPerDepth * depth;
  const rooms = placeRooms(map, width, height, targetRooms);

  // Enrich rooms with id, center, visited flag, neighbors, objects.
  // Neighbor graph mirrors connectRooms' sequential connection logic.
  for (let i = 0; i < rooms.length; i++) {
    const r = rooms[i];
    const c = roomCenter(r);
    r.id = `room_${i}`;
    r.cx = c.x;
    r.cy = c.y;
    r.visited = false;
    r.neighbors = [];
    r.objects = [];
    r.archetype = null;
  }
  for (let i = 1; i < rooms.length; i++) {
    rooms[i - 1].neighbors.push(rooms[i].id);
    rooms[i].neighbors.push(rooms[i - 1].id);
  }

  // Connect rooms with corridors
  connectRooms(map, rooms);

  // Compute stair positions — objects are spawned separately via spawnObjects
  const spawnRoom = rooms[0];
  const spawnPoint = roomCenter(spawnRoom);

  const farthestRoom = findFarthestRoom(rooms, spawnPoint);
  const stairsDown = roomCenter(farthestRoom);

  const stairsUp = { ...spawnPoint };

  // Phase 10 (themes) will parameterize which variant pools appear per theme.
  scatterTileVariants(map, width, height);

  return { map, rooms, spawnPoint, stairsDown, stairsUp, width, height };
}

// ── Room Placement ──────────────────────────────────────────

function placeRooms(map, mapWidth, mapHeight, targetCount) {
  const rooms = [];
  let attempts = 0;
  const maxAttempts = DC.roomAttempts * targetCount;

  while (rooms.length < targetCount && attempts < maxAttempts) {
    attempts++;
    const w = randInt(DC.minRoomSize, DC.maxRoomSize);
    const h = randInt(DC.minRoomSize, DC.maxRoomSize);
    const x = randInt(1, mapWidth - w - 1);
    const y = randInt(1, mapHeight - h - 1);

    const room = { x, y, w, h };
    if (rooms.some(r => roomsOverlap(r, room, 1))) continue;

    rooms.push(room);
    carveRoom(map, room);
  }

  return rooms;
}

function carveRoom(map, room) {
  for (let dy = 0; dy < room.h; dy++) {
    for (let dx = 0; dx < room.w; dx++) {
      map[room.y + dy][room.x + dx] = DC.TILE_FLOOR;
    }
  }
}

function roomsOverlap(a, b, padding) {
  return !(
    a.x + a.w + padding <= b.x ||
    b.x + b.w + padding <= a.x ||
    a.y + a.h + padding <= b.y ||
    b.y + b.h + padding <= a.y
  );
}

// ── Corridor Connection ─────────────────────────────────────

function connectRooms(map, rooms) {
  // Connect each room to the next in the list (guarantees connectivity)
  for (let i = 1; i < rooms.length; i++) {
    const from = roomCenter(rooms[i - 1]);
    const to = roomCenter(rooms[i]);
    carveLCorridor(map, from, to);
  }
}

function carveLCorridor(map, from, to) {
  // Randomly choose horizontal-first or vertical-first
  if (Math.random() < 0.5) {
    carveHorizontal(map, from.x, to.x, from.y);
    carveVertical(map, to.x, from.y, to.y);
  } else {
    carveVertical(map, from.x, from.y, to.y);
    carveHorizontal(map, from.x, to.x, to.y);
  }
}

function carveHorizontal(map, x1, x2, y) {
  const start = Math.min(x1, x2);
  const end = Math.max(x1, x2);
  for (let x = start; x <= end; x++) {
    if (map[y] && map[y][x] === DC.TILE_WALL) {
      map[y][x] = DC.TILE_FLOOR;
    }
  }
}

function carveVertical(map, x, y1, y2) {
  const start = Math.min(y1, y2);
  const end = Math.max(y1, y2);
  for (let y = start; y <= end; y++) {
    if (map[y] && map[y][x] === DC.TILE_WALL) {
      map[y][x] = DC.TILE_FLOOR;
    }
  }
}

// ── Utilities ───────────────────────────────────────────────

function roomCenter(room) {
  return {
    x: Math.floor(room.x + room.w / 2),
    y: Math.floor(room.y + room.h / 2),
  };
}

function findFarthestRoom(rooms, from) {
  let best = rooms[rooms.length - 1];
  let bestDist = 0;
  for (const room of rooms) {
    const c = roomCenter(room);
    const dist = Math.abs(c.x - from.x) + Math.abs(c.y - from.y);
    if (dist > bestDist) {
      bestDist = dist;
      best = room;
    }
  }
  return best;
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Tile Variant Scatter ─────────────────────────────────────

// Phase 10 (themes) will parameterize which variant pools appear per theme.
function scatterTileVariants(map, width, height) {
  const FLOOR_VARIANTS = ['floor_cracked', 'floor_mosaic', 'floor_dirt', 'floor_mossy', 'floor_rune'];
  const WALL_VARIANTS  = ['wall_rough', 'wall_reinforced', 'wall_mossy', 'wall_cyclopean', 'wall_cave'];

  const floorCount = randInt(4, 8);
  const wallCount  = randInt(6, 12);

  for (let i = 0; i < floorCount; i++) {
    const x = randInt(1, width - 2);
    const y = randInt(1, height - 2);
    if (map[y][x] === DC.TILE_FLOOR) {
      map[y][x] = randPick(FLOOR_VARIANTS);
    }
  }
  for (let i = 0; i < wallCount; i++) {
    const x = randInt(1, width - 2);
    const y = randInt(1, height - 2);
    if (map[y][x] === DC.TILE_WALL) {
      map[y][x] = randPick(WALL_VARIANTS);
    }
  }
}
