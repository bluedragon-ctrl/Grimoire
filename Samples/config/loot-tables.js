// Loot tables — weighted item pools and depth-based table routing.
// rollLoot(tableName, rng) → string[]  (list of item type keys)

// ── Item pools ────────────────────────────────────────────────
// Each entry: [itemTypeKey, weight]. Higher weight = more common.

export const ITEM_POOLS = {

  // Basic consumables available from depth 1
  consumables_common: [
    ['health_potion',        30],
    ['mana_crystal',         25],
    ['cleanse_potion',       12],
    ['haste_potion',         10],
    ['shield_potion',        10],
    ['mana_regen_potion',     8],
    ['fire_ward_potion',      5],
    ['frost_ward_potion',     5],
    ['arcane_ward_potion',    5],
    ['lightning_ward_potion', 5],
    ['poison_ward_potion',    5],
  ],

  // Mid-tier consumables, depth 4+
  consumables_mid: [
    ['health_potion',        20],
    ['mana_crystal',         15],
    ['haste_potion',         12],
    ['shield_potion',        12],
    ['mana_regen_potion',    10],
    ['potion_of_fury',        8],
    ['potion_of_warding',     8],
    ['potion_of_focus',       8],
    ['vitality_elixir',       8],
    ['focus_elixir',          8],
    ['might_elixir',          8],
    ['guard_elixir',          8],
    ['swift_elixir',          8],
    ['magic_ward_potion',     5],
  ],

  // Rare consumables, depth 7+
  consumables_rare: [
    ['potion_of_fury',       20],
    ['potion_of_warding',    20],
    ['potion_of_focus',      18],
    ['vitality_elixir',      15],
    ['focus_elixir',         15],
    ['might_elixir',         15],
    ['guard_elixir',         15],
    ['swift_elixir',         12],
    ['insight_elixir',       12],
    ['health_potion',        10],
    ['mana_crystal',         10],
  ],

  // Simple gear, depth 1-3
  gear_common: [
    ['wooden_staff',  25],
    ['leather_robe',  25],
    ['bone_dagger',   20],
    ['cloth_cap',     20],
  ],

  // Mid-tier gear, depth 4-6
  gear_mid: [
    ['fire_staff',       15],
    ['iron_staff',       12],
    ['shock_staff',      10],
    ['steel_dagger',     15],
    ['shadow_blade',     10],
    ['frost_shard',      10],
    ['silk_robe',        12],
    ['ember_robe',       10],
    ['wizard_hat',       12],
    ['scholar_circlet',  10],
    ['iron_helm',         8],
    ['quartz_focus',     10],
    ['runed_focus',       8],
    ['venom_dagger',      8],
    ['draining_staff',    6],
  ],

  // Rare gear, depth 7+
  gear_rare: [
    ['crystal_staff',   15],
    ['draining_staff',  12],
    ['warblade',        12],
    ['venom_dagger',    10],
    ['archmage_robe',   12],
    ['shadow_cloak',    12],
    ['arcane_cowl',     10],
    ['crown_of_ages',    5],
    ['void_focus',      12],
    ['bloodstone',      10],
    ['star_fragment',   10],
    ['prism_shard',      8],
  ],

  // Chest loot — consumable-heavy, one good gear piece
  chest_common: [
    ['health_potion',   35],
    ['mana_crystal',    30],
    ['haste_potion',    20],
    ['shield_potion',   20],
    ['cleanse_potion',  15],
    ['wooden_staff',    12],
    ['leather_robe',    12],
    ['bone_dagger',     10],
    ['cloth_cap',       10],
  ],

  chest_rich: [
    ['potion_of_fury',    20],
    ['potion_of_warding', 20],
    ['vitality_elixir',   18],
    ['focus_elixir',      15],
    ['fire_staff',        12],
    ['crystal_staff',     12],
    ['shadow_cloak',      12],
    ['archmage_robe',     10],
    ['void_focus',        12],
    ['crown_of_ages',      8],
    ['prism_shard',       10],
  ],

  // Room supply cache — restoratives only
  room_supply_cache: [
    ['health_potion',   40],
    ['mana_crystal',    35],
    ['cleanse_potion',  20],
    ['haste_potion',    15],
    ['shield_potion',   15],
    ['mana_regen_potion', 10],
  ],
};

// ── Loot tables ───────────────────────────────────────────────
// minRolls/maxRolls: how many items to draw from the pool.
// pool: key into ITEM_POOLS.

export const LOOT_TABLES = {
  floor_common:      { minRolls: 2, maxRolls: 4, pools: [['consumables_common', 55], ['gear_common', 35], ['consumables_mid', 10]] },
  floor_mid:         { minRolls: 3, maxRolls: 5, pools: [['consumables_mid', 45], ['gear_mid', 35], ['consumables_common', 10], ['gear_common', 10]] },
  floor_deep:        { minRolls: 4, maxRolls: 6, pools: [['consumables_rare', 40], ['gear_rare', 40], ['consumables_mid', 20]] },
  chest_common:      { minRolls: 1, maxRolls: 2, pools: [['chest_common', 100]] },
  chest_rich:        { minRolls: 2, maxRolls: 3, pools: [['chest_rich', 100]] },
  room_supply_cache: { minRolls: 2, maxRolls: 4, pools: [['room_supply_cache', 100]] },
};

// ── Depth routing ─────────────────────────────────────────────
// First entry where depth <= maxDepth wins.

export const FLOOR_LOOT_BY_DEPTH = [
  { maxDepth: 3,        table: 'floor_common' },
  { maxDepth: 6,        table: 'floor_mid'    },
  { maxDepth: Infinity, table: 'floor_deep'   },
];

export const CHEST_LOOT_BY_DEPTH = [
  { maxDepth: 3,        table: 'chest_common' },
  { maxDepth: Infinity, table: 'chest_rich'   },
];

export const ROOM_LOOT_BY_DEPTH = [
  { maxDepth: Infinity, table: 'room_supply_cache' },
];

// ── Helpers ───────────────────────────────────────────────────

function depthTable(routing, depth) {
  for (const entry of routing) {
    if (depth <= entry.maxDepth) return entry.table;
  }
  return routing[routing.length - 1].table;
}

export function floorLootTableForDepth(depth) { return depthTable(FLOOR_LOOT_BY_DEPTH, depth); }
export function chestLootTableForDepth(depth)  { return depthTable(CHEST_LOOT_BY_DEPTH, depth); }
export function roomLootTableForDepth(depth)   { return depthTable(ROOM_LOOT_BY_DEPTH, depth); }

// ── Monster death drop tables ─────────────────────────────────
// Each entry: { weight, entry } where entry is an item type key or 'none'.
// rollMonsterLoot draws exactly one entry per death roll.
// Tables are keyed as 'monster_<type>'. Bosses are out of scope here —
// set dropTable: null on boss templates; define tables when boss loot is designed.

export const MONSTER_LOOT_TABLES = {
  // Fallback for any monster without a specific table (should not fire in
  // practice now that every non-boss template has dropTable set, but kept
  // as a safety net).
  monster_default: [
    { weight: 80, entry: 'none' },
    { weight: 10, entry: 'health_potion' },
    { weight:  7, entry: 'mana_crystal' },
    { weight:  3, entry: 'mana_regen_potion' },
  ],

  // ── Weak tier ─────────────────────────────────────────────
  monster_rat: [
    { weight: 80, entry: 'none' },
    { weight: 10, entry: 'health_potion' },
    { weight:  7, entry: 'mana_crystal' },
    { weight:  3, entry: 'book_of_rat' },
  ],
  monster_mushroom: [
    { weight: 80, entry: 'none' },
    { weight: 10, entry: 'health_potion' },
    { weight:  7, entry: 'cleanse_potion' },
    { weight:  3, entry: 'book_of_mushroom' },
  ],
  monster_bat: [
    { weight: 80, entry: 'none' },
    { weight: 10, entry: 'health_potion' },
    { weight:  7, entry: 'mana_crystal' },
    { weight:  3, entry: 'book_of_bat' },
  ],

  // ── Standard tier ────────────────────────────────────────
  monster_skeleton: [
    { weight: 77, entry: 'none' },
    { weight: 10, entry: 'health_potion' },
    { weight:  7, entry: 'mana_crystal' },
    { weight:  3, entry: 'book_of_skeleton' },
    { weight:  3, entry: 'cleanse_potion' },
  ],
  monster_slime: [
    { weight: 77, entry: 'none' },
    { weight: 10, entry: 'health_potion' },
    { weight:  7, entry: 'cleanse_potion' },
    { weight:  3, entry: 'book_of_slime' },
    { weight:  3, entry: 'mana_regen_potion' },
  ],
  monster_spider: [
    { weight: 77, entry: 'none' },
    { weight: 10, entry: 'health_potion' },
    { weight:  7, entry: 'poison_ward_potion' },
    { weight:  3, entry: 'book_of_spider' },
    { weight:  3, entry: 'mana_crystal' },
  ],
  monster_serpent: [
    { weight: 77, entry: 'none' },
    { weight: 10, entry: 'health_potion' },
    { weight:  7, entry: 'poison_ward_potion' },
    { weight:  3, entry: 'book_of_serpent' },
    { weight:  3, entry: 'cleanse_potion' },
  ],
  monster_zombie: [
    { weight: 77, entry: 'none' },
    { weight: 10, entry: 'health_potion' },
    { weight:  7, entry: 'cleanse_potion' },
    { weight:  3, entry: 'book_of_zombie' },
    { weight:  3, entry: 'mana_regen_potion' },
  ],
  monster_skeleton_archer: [
    { weight: 75, entry: 'none' },
    { weight: 12, entry: 'health_potion' },
    { weight:  7, entry: 'mana_crystal' },
    { weight:  3, entry: 'book_of_skeleton_archer' },
    { weight:  3, entry: 'haste_potion' },
  ],
  monster_ghost: [
    { weight: 75, entry: 'none' },
    { weight: 10, entry: 'health_potion' },
    { weight:  7, entry: 'mana_crystal' },
    { weight:  5, entry: 'mana_regen_potion' },
    { weight:  3, entry: 'book_of_ghost' },
  ],
  monster_wisp: [
    { weight: 75, entry: 'none' },
    { weight: 10, entry: 'mana_crystal' },
    { weight:  7, entry: 'mana_regen_potion' },
    { weight:  5, entry: 'health_potion' },
    { weight:  3, entry: 'book_of_wisp' },
  ],

  // ── Strong tier ──────────────────────────────────────────
  monster_wraith: [
    { weight: 72, entry: 'none' },
    { weight: 12, entry: 'health_potion' },
    { weight:  8, entry: 'mana_crystal' },
    { weight:  5, entry: 'mana_regen_potion' },
    { weight:  3, entry: 'book_of_wraith' },
  ],
  monster_giant_snail: [
    { weight: 72, entry: 'none' },
    { weight: 15, entry: 'health_potion' },
    { weight:  7, entry: 'shield_potion' },
    { weight:  3, entry: 'book_of_giant_snail' },
    { weight:  3, entry: 'mana_regen_potion' },
  ],
  monster_gargoyle: [
    { weight: 72, entry: 'none' },
    { weight: 12, entry: 'health_potion' },
    { weight:  8, entry: 'shield_potion' },
    { weight:  5, entry: 'mana_crystal' },
    { weight:  3, entry: 'book_of_gargoyle' },
  ],
  monster_troll: [
    { weight: 70, entry: 'none' },
    { weight: 15, entry: 'health_potion' },
    { weight:  8, entry: 'mana_crystal' },
    { weight:  4, entry: 'shield_potion' },
    { weight:  3, entry: 'book_of_troll' },
  ],
  monster_knight: [
    { weight: 70, entry: 'none' },
    { weight: 13, entry: 'health_potion' },
    { weight:  9, entry: 'shield_potion' },
    { weight:  5, entry: 'mana_crystal' },
    { weight:  3, entry: 'book_of_knight' },
  ],
  monster_orc_warrior: [
    { weight: 72, entry: 'none' },
    { weight: 12, entry: 'health_potion' },
    { weight:  8, entry: 'mana_crystal' },
    { weight:  5, entry: 'shield_potion' },
    { weight:  3, entry: 'book_of_orc_warrior' },
  ],
  monster_orc_knight: [
    { weight: 70, entry: 'none' },
    { weight: 13, entry: 'health_potion' },
    { weight:  9, entry: 'shield_potion' },
    { weight:  5, entry: 'mana_crystal' },
    { weight:  3, entry: 'book_of_orc_knight' },
  ],
  monster_orc_patrol: [
    { weight: 72, entry: 'none' },
    { weight: 12, entry: 'health_potion' },
    { weight:  8, entry: 'mana_crystal' },
    { weight:  5, entry: 'haste_potion' },
    { weight:  3, entry: 'book_of_orc_patrol' },
  ],
  monster_orc_mage: [
    { weight: 70, entry: 'none' },
    { weight: 10, entry: 'mana_crystal' },
    { weight: 10, entry: 'health_potion' },
    { weight:  7, entry: 'mana_regen_potion' },
    { weight:  3, entry: 'book_of_orc_mage' },
  ],
  monster_dark_wizard: [
    { weight: 68, entry: 'none' },
    { weight: 12, entry: 'mana_crystal' },
    { weight:  9, entry: 'health_potion' },
    { weight:  5, entry: 'arcane_ward_potion' },
    { weight:  3, entry: 'book_of_dark_wizard' },
    { weight:  3, entry: 'mana_regen_potion' },
  ],
  monster_vampire: [
    { weight: 68, entry: 'none' },
    { weight: 12, entry: 'health_potion' },
    { weight:  9, entry: 'mana_crystal' },
    { weight:  5, entry: 'mana_regen_potion' },
    { weight:  3, entry: 'book_of_vampire' },
    { weight:  3, entry: 'shield_potion' },
  ],

  // ── Elite tier ───────────────────────────────────────────
  monster_lich: [
    { weight: 62, entry: 'none' },
    { weight: 13, entry: 'mana_crystal' },
    { weight: 10, entry: 'health_potion' },
    { weight:  7, entry: 'mana_regen_potion' },
    { weight:  5, entry: 'arcane_ward_potion' },
    { weight:  3, entry: 'book_of_lich' },
  ],
  monster_golem: [
    { weight: 62, entry: 'none' },
    { weight: 15, entry: 'health_potion' },
    { weight: 12, entry: 'shield_potion' },
    { weight:  5, entry: 'mana_crystal' },
    { weight:  3, entry: 'book_of_golem' },
    { weight:  3, entry: 'potion_of_warding' },
  ],
  monster_dragon: [
    { weight: 60, entry: 'none' },
    { weight: 15, entry: 'health_potion' },
    { weight: 10, entry: 'fire_ward_potion' },
    { weight:  8, entry: 'mana_crystal' },
    { weight:  4, entry: 'potion_of_fury' },
    { weight:  3, entry: 'book_of_dragon' },
  ],
  monster_fire_elemental: [
    { weight: 62, entry: 'none' },
    { weight: 13, entry: 'health_potion' },
    { weight: 10, entry: 'fire_ward_potion' },
    { weight:  8, entry: 'mana_crystal' },
    { weight:  4, entry: 'mana_regen_potion' },
    { weight:  3, entry: 'book_of_fire_elemental' },
  ],
  monster_water_elemental: [
    { weight: 62, entry: 'none' },
    { weight: 13, entry: 'health_potion' },
    { weight: 10, entry: 'frost_ward_potion' },
    { weight:  8, entry: 'mana_crystal' },
    { weight:  4, entry: 'mana_regen_potion' },
    { weight:  3, entry: 'book_of_water_elemental' },
  ],
  monster_air_elemental: [
    { weight: 62, entry: 'none' },
    { weight: 13, entry: 'health_potion' },
    { weight: 10, entry: 'lightning_ward_potion' },
    { weight:  8, entry: 'mana_crystal' },
    { weight:  4, entry: 'haste_potion' },
    { weight:  3, entry: 'book_of_air_elemental' },
  ],
  monster_earth_elemental: [
    { weight: 62, entry: 'none' },
    { weight: 13, entry: 'health_potion' },
    { weight: 10, entry: 'shield_potion' },
    { weight:  8, entry: 'mana_crystal' },
    { weight:  4, entry: 'potion_of_warding' },
    { weight:  3, entry: 'book_of_earth_elemental' },
  ],
  monster_crystal_elemental: [
    { weight: 62, entry: 'none' },
    { weight: 13, entry: 'mana_crystal' },
    { weight: 10, entry: 'arcane_ward_potion' },
    { weight:  8, entry: 'health_potion' },
    { weight:  4, entry: 'mana_regen_potion' },
    { weight:  3, entry: 'book_of_crystal_elemental' },
  ],
};

/**
 * Roll a single monster death drop. Returns an array of zero or one item type
 * key ('none' entries produce an empty array).
 * @param {string} tableName - Key into MONSTER_LOOT_TABLES
 * @param {() => number} rng  - Zero-arg function returning [0, 1)
 * @returns {string[]}
 */
export function rollMonsterLoot(tableName, rng) {
  const entries = MONSTER_LOOT_TABLES[tableName];
  if (!entries || entries.length === 0) return [];
  const total = entries.reduce((s, e) => s + e.weight, 0);
  let r = rng() * total;
  for (const { weight, entry } of entries) {
    r -= weight;
    if (r <= 0) return entry === 'none' ? [] : [entry];
  }
  return [];
}

/**
 * Roll items from a loot table. Returns an array of item type strings.
 * @param {string} tableName - Key into LOOT_TABLES
 * @param {() => number} rng  - Zero-arg function returning [0, 1)
 * @returns {string[]}
 */
export function rollLoot(tableName, rng) {
  const table = LOOT_TABLES[tableName];
  if (!table) return [];

  // Pick which pool to draw from (weighted)
  const poolTotal = table.pools.reduce((s, [, w]) => s + w, 0);
  let pr = rng() * poolTotal;
  let poolKey = table.pools[table.pools.length - 1][0];
  for (const [key, w] of table.pools) {
    pr -= w;
    if (pr <= 0) { poolKey = key; break; }
  }

  const pool = ITEM_POOLS[poolKey];
  if (!pool || pool.length === 0) return [];

  const count = table.minRolls + Math.floor(rng() * (table.maxRolls - table.minRolls + 1));
  const total = pool.reduce((s, [, w]) => s + w, 0);
  const result = [];
  for (let i = 0; i < count; i++) {
    let r = rng() * total;
    for (const [type, weight] of pool) {
      r -= weight;
      if (r <= 0) { result.push(type); break; }
    }
  }
  return result;
}
