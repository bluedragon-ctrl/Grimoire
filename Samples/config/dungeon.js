// Dungeon generation parameters — all pure data, no logic.

export const DUNGEON_CONFIG = {
  // Base map dimensions (grow slightly with depth)
  baseWidth: 40,
  baseHeight: 30,
  widthPerDepth: 2,
  heightPerDepth: 1,

  // Room parameters
  minRoomSize: 4,
  maxRoomSize: 9,
  roomAttempts: 20,      // how many times to try placing a room
  minRooms: 4,
  roomsPerDepth: 1,      // extra rooms per depth level

  // Corridor width (always 1 for now)
  corridorWidth: 1,

  // Monster groups per floor (replaces monstersPerLevel).
  // Rough: 2 at depth 1, +1 per 3 depths; each group spawns 1–5 monsters.
  groupsPerLevel: (depth) => 2 + Math.floor(depth / 3),

  // Per-instance level roll (±1 variance around depth, clamped to >=1).
  // Used for both monsters and items on spawn; scales damage/range/power.
  monsterLevel: (depth) => Math.max(1, depth + (Math.floor(Math.random() * 3) - 1)),
  itemLevel:    (depth) => Math.max(1, depth + (Math.floor(Math.random() * 3) - 1)),

  // Tile types
  TILE_WALL: 'wall',
  TILE_FLOOR: 'floor',
};
