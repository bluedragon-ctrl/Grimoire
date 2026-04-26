// Loot rolls + floor-item spawn/pickup/drop helpers (Phase 9).
//
// All randomness is threaded through worldRandom so replays are deterministic
// given the same seed. Callers pass `source` so the renderer (and future
// analytics) can tell a death drop apart from an overflow drop.

import type {
  Actor, FloorItem, GameEvent, Pos, World, ItemInstance,
} from "../types.js";
import { ITEMS } from "../content/items.js";
import { lootTableFor } from "../content/loot.js";
import { worldRandom, worldRandInt } from "../rng.js";
import { ensureInventory } from "./execute.js";
import { actionFailed } from "../lang/errors.js";

// ──────────────────────────── floor-item bookkeeping ────────────────────────────

function ensureFloor(world: World): FloorItem[] {
  if (!world.room.floorItems) world.room.floorItems = [];
  return world.room.floorItems;
}

function mintFloorId(world: World, defId: string): string {
  const n = (world.floorSeq ?? 0) + 1;
  world.floorSeq = n;
  return `fi${n}_${defId}`;
}

// Place a defId on the floor at `pos` (a fresh instance each call). Emits
// ItemDropped so the renderer + log see it.
export function spawnFloorItem(
  world: World,
  defId: string,
  pos: Pos,
  source: "death" | "drop" | "overflow",
  actorId: string | null,
): GameEvent {
  const floor = ensureFloor(world);
  const fi: FloorItem = { id: mintFloorId(world, defId), defId, pos: { ...pos } };
  floor.push(fi);
  return {
    type: "ItemDropped",
    actor: actorId,
    item: fi.id,
    defId,
    pos: { ...pos },
    source,
  };
}

// ──────────────────────────── death rolls ────────────────────────────

// Walk `actor`'s loot table, roll each entry independently, and spawn N
// instances on the actor's tile. Events are appended in the order rolled,
// matching scheduler expectations (one bundle per step).
export function rollDeathDrops(world: World, actor: Actor): GameEvent[] {
  // Phase 11+: use the explicit template key set by createActor from
  // MONSTER_TEMPLATES[id].loot. Actors with no lootTable drop nothing.
  const table = actor.lootTable ? lootTableFor(actor.lootTable) : [];
  if (table.length === 0) return [];
  const out: GameEvent[] = [];
  for (const entry of table) {
    const roll = worldRandom(world);
    if (roll >= entry.chance) continue;
    const lo = entry.min ?? 1;
    const hi = entry.max ?? lo;
    const count = worldRandInt(world, lo, hi);
    for (let i = 0; i < count; i++) {
      out.push(spawnFloorItem(world, entry.defId, actor.pos, "death", actor.id));
    }
  }
  return out;
}

// ──────────────────────────── pickup / drop commands ────────────────────────────

const fail = actionFailed;

export function floorItemsAt(world: World, pos: Pos): FloorItem[] {
  const floor = world.room.floorItems ?? [];
  return floor.filter(f => f.pos.x === pos.x && f.pos.y === pos.y);
}

// pickup() — with no target, take the topmost (last-dropped) item on the
// hero's tile. With a target, match either a FloorItem ref (has `id`) or a
// bare defId string.
export function doPickup(world: World, self: Actor, ref: unknown): GameEvent[] {
  const floor = world.room.floorItems ?? [];
  let fi: FloorItem | undefined;
  let idx = -1;

  if (ref === undefined || ref === null) {
    for (let i = floor.length - 1; i >= 0; i--) {
      const f = floor[i]!;
      if (f.pos.x === self.pos.x && f.pos.y === self.pos.y) { fi = f; idx = i; break; }
    }
  } else if (typeof ref === "string") {
    for (let i = floor.length - 1; i >= 0; i--) {
      const f = floor[i]!;
      if (f.defId === ref && f.pos.x === self.pos.x && f.pos.y === self.pos.y) {
        fi = f; idx = i; break;
      }
    }
  } else if (typeof ref === "object") {
    const r = ref as FloorItem;
    idx = floor.findIndex(f => f.id === r.id);
    if (idx >= 0) fi = floor[idx];
  }

  if (!fi || idx < 0) return [fail(self, "pickup", "no item here")];
  if (fi.pos.x !== self.pos.x || fi.pos.y !== self.pos.y) {
    return [fail(self, "pickup", "item not on your tile")];
  }
  const def = ITEMS[fi.defId];
  if (!def) return [fail(self, "pickup", `Unknown item '${fi.defId}'.`)];

  const inv = ensureInventory(self);

  // Phase 15: pickup is uncapped. All items go into inventory; equipment
  // stays in inventory until attempt-end auto-routing handles it.
  // Scrolls still auto-learn at room-clear (existing Phase 13.3 behavior).
  if (def.kind === "equipment" && !self.foundGear) self.foundGear = [];
  if (def.kind === "equipment") self.foundGear!.push(fi.defId);

  const inst: ItemInstance = { id: fi.id, defId: fi.defId };
  inv.consumables.push(inst);
  floor.splice(idx, 1);
  return [{
    type: "ItemPickedUp",
    actor: self.id, item: fi.id, defId: fi.defId,
    pos: { ...self.pos },
  }];
}

// drop(slot_or_item) — pulls an instance out of the bag (or equipped slot)
// and leaves it on the floor. Accepts:
//   - bare defId string (drops the first matching bag instance)
//   - ItemInstance-like ref (matches by id in bag; falls back to equipped)
export function doDrop(world: World, self: Actor, ref: unknown): GameEvent[] {
  const inv = ensureInventory(self);

  let defId: string | null = null;
  let fromBagIdx = -1;

  if (typeof ref === "string") {
    fromBagIdx = inv.consumables.findIndex(i => i.defId === ref);
    if (fromBagIdx < 0) return [fail(self, "drop", `No '${ref}' in bag.`)];
    defId = inv.consumables[fromBagIdx]!.defId;
  } else if (ref && typeof ref === "object") {
    const r = ref as ItemInstance;
    if (typeof r.id === "string") {
      fromBagIdx = inv.consumables.findIndex(i => i.id === r.id);
      if (fromBagIdx >= 0) defId = inv.consumables[fromBagIdx]!.defId;
    }
  }

  if (!defId || fromBagIdx < 0) return [fail(self, "drop", "no item")];

  inv.consumables.splice(fromBagIdx, 1);
  return [spawnFloorItem(world, defId, self.pos, "drop", self.id)];
}

// Overflow helper — used by unequip when the bag is full. Drops `inst` at
// `actor.pos` and returns the corresponding ItemDropped event.
export function spawnOverflowDrop(world: World, actor: Actor, inst: ItemInstance): GameEvent {
  return spawnFloorItem(world, inst.defId, actor.pos, "overflow", actor.id);
}


