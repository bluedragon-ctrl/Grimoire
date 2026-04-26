// LOOT_TABLES — declarative drop tables keyed by actor kind (for now).
//
// Shape is forward-compatible with Phase 10's planned monster registry: when
// monsters become data-driven, each entry in MONSTER_TEMPLATES can point at a
// table key here (or embed an equivalent array).
//
// Each entry: `{ defId, chance, min?, max? }`.
//   - chance: probability in [0,1] that this entry fires (independent rolls).
//   - min/max: stack size when it fires (default 1/1). For consumables the
//     engine mints N FloorItem instances at the drop position.
//
// Rolls use the engine's mulberry32 RNG (src/rng.ts). No Math.random.

import type { ActorKind } from "../types.js";

export interface LootEntry {
  defId: string;
  chance: number;
  min?: number;
  max?: number;
}

// Phase 11+ keys: `<monster>_loot`, matching MONSTER_TEMPLATES[id].loot.
// The hero never rolls loot — omit or leave empty.
export const LOOT_TABLES: Record<string, LootEntry[]> = {
  goblin_loot: [
    { defId: "health_potion", chance: 0.3 },
  ],
  skeleton_loot: [
    { defId: "mana_crystal", chance: 0.2 },
  ],
  cultist_loot: [
    { defId: "mana_crystal", chance: 0.4 },
  ],
  slime_loot: [
    { defId: "health_potion", chance: 0.15 },
  ],
  // Phase 15: keymaster monsters (vault/trap archetypes) always drop a key.
  keymaster_loot: [
    { defId: "key", chance: 1.0 },
    { defId: "health_potion", chance: 0.4 },
  ],
};

// Registry load-time validation.
for (const [key, entries] of Object.entries(LOOT_TABLES)) {
  for (const e of entries) {
    if (!e.defId) throw new Error(`LOOT_TABLES["${key}"]: entry missing 'defId'.`);
    if (typeof e.chance !== "number" || e.chance < 0 || e.chance > 1) {
      throw new Error(`LOOT_TABLES["${key}"]["${e.defId}"]: 'chance' must be in [0, 1].`);
    }
  }
}

// Convenience: typed lookup used by the scheduler. Returns [] for unknown
// keys so the call site can stay branch-free.
export function lootTableFor(kind: ActorKind | string): LootEntry[] {
  return LOOT_TABLES[kind] ?? [];
}

// ──────────────────────────── Phase 15: chest loot tables ────────────────────────────
// Keyed by depth tier (1..5). Generator picks a tier based on room depth and
// stamps the lootTableId onto the chest object at gen time. Rolled lazily on
// chest open via dungeon/objects.openChest.

export const CHEST_LOOT_TABLES: Record<string, LootEntry[]> = {
  chest_t1: [
    { defId: "health_potion", chance: 0.9 },
    { defId: "mana_crystal",  chance: 0.7 },
    { defId: "haste_potion",  chance: 0.3 },
  ],
  chest_t2: [
    { defId: "health_potion", chance: 0.9, min: 1, max: 2 },
    { defId: "mana_crystal",  chance: 0.8 },
    { defId: "might_potion",  chance: 0.4 },
    { defId: "shield_potion", chance: 0.4 },
  ],
  chest_t3: [
    { defId: "health_potion", chance: 0.9, min: 1, max: 2 },
    { defId: "mana_crystal",  chance: 0.9, min: 1, max: 2 },
    { defId: "iron_skin_potion", chance: 0.5 },
    { defId: "regen_potion",  chance: 0.5 },
    { defId: "vitality_elixir", chance: 0.2 },
  ],
  chest_t4: [
    { defId: "health_potion", chance: 0.95, min: 1, max: 3 },
    { defId: "mana_crystal",  chance: 0.95, min: 1, max: 2 },
    { defId: "power_potion",  chance: 0.5 },
    { defId: "iron_skin_potion", chance: 0.5 },
    { defId: "might_elixir",  chance: 0.2 },
    { defId: "guard_elixir",  chance: 0.2 },
  ],
  chest_t5: [
    { defId: "health_potion", chance: 1.0, min: 2, max: 3 },
    { defId: "mana_crystal",  chance: 1.0, min: 2, max: 3 },
    { defId: "power_potion",  chance: 0.6 },
    { defId: "shield_potion", chance: 0.6 },
    { defId: "vitality_elixir", chance: 0.3 },
    { defId: "insight_elixir",  chance: 0.3 },
    { defId: "focus_elixir",    chance: 0.3 },
  ],
};

for (const [key, entries] of Object.entries(CHEST_LOOT_TABLES)) {
  for (const e of entries) {
    if (!e.defId) throw new Error(`CHEST_LOOT_TABLES["${key}"]: entry missing 'defId'.`);
    if (typeof e.chance !== "number" || e.chance < 0 || e.chance > 1) {
      throw new Error(`CHEST_LOOT_TABLES["${key}"]["${e.defId}"]: 'chance' must be in [0, 1].`);
    }
  }
}

export function chestLootTableFor(depth: number): string {
  const tier = Math.min(5, Math.max(1, Math.ceil(depth / 3)));
  return `chest_t${tier}`;
}
