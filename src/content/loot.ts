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

// Key is a string (currently aligns with ActorKind) so Phase 10 can reuse
// without a breaking rename. The hero never rolls loot — omit or leave empty.
export const LOOT_TABLES: Record<string, LootEntry[]> = {
  goblin: [
    { defId: "health_potion", chance: 0.5 },
  ],
};

// Convenience: typed lookup used by the scheduler. Returns [] for unknown
// keys so the call site can stay branch-free.
export function lootTableFor(kind: ActorKind | string): LootEntry[] {
  return LOOT_TABLES[kind] ?? [];
}
