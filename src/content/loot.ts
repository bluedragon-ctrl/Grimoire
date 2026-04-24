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

// Phase 11 keys: `<monster>_loot`, matching MONSTER_TEMPLATES[id].loot. The
// legacy `"goblin"` key is retained as an alias for Phase 9 tests that key
// rollDeathDrops by actor.kind directly.
//
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
  // Legacy alias — Phase 9 tests look up LOOT_TABLES["goblin"]. New code keys
  // by template.loot (e.g. "goblin_loot").
  goblin: [
    { defId: "health_potion", chance: 0.5 },
  ],
};

// Convenience: typed lookup used by the scheduler. Returns [] for unknown
// keys so the call site can stay branch-free.
export function lootTableFor(kind: ActorKind | string): LootEntry[] {
  return LOOT_TABLES[kind] ?? [];
}
