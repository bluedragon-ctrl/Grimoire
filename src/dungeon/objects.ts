// Phase 15: dungeon RoomObject runtime — interact() handlers + walkability.
//
// RoomObjects live on Room.objects. The renderer dispatches via OBJECT_RENDERERS
// keyed on `kind`; the engine routes interact() through this module.
//
// Design notes:
//  - All randomness goes through worldRandom so chest rolls stay deterministic.
//  - Locked door tiles block movement until unlocked. Locked exit_door tiles
//    also block movement (hero must interact from adjacent before stepping
//    onto the exit tile).
//  - Fountains never deplete. Chests are removed from the room on open.

import type {
  Actor, GameEvent, ItemInstance, Pos, RoomObject, RoomObjectKind, World,
} from "../types.js";
import { worldRandom, worldRandInt } from "../rng.js";
import { ITEMS } from "../content/items.js";
import { CHEST_LOOT_TABLES } from "../content/loot.js";

// ──────────────────────────── walkability ────────────────────────────

export function tileBlocked(world: World, pos: Pos): boolean {
  const interior = world.room.interiorWalls;
  if (interior && interior.some(w => w.pos.x === pos.x && w.pos.y === pos.y)) return true;
  const objects = world.room.objects ?? [];
  for (const o of objects) {
    if (o.pos.x !== pos.x || o.pos.y !== pos.y) continue;
    if ((o.kind === "door_closed" || o.kind === "exit_door_closed") && o.locked) {
      return true;
    }
  }
  return false;
}

// ──────────────────────────── adjacency / picking ────────────────────────────

function chebyshev(a: Pos, b: Pos): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/** Return all RoomObjects within Chebyshev radius `r` of `from` (inclusive). */
export function objectsWithin(world: World, from: Pos, r: number): RoomObject[] {
  const out: RoomObject[] = [];
  for (const o of world.room.objects ?? []) {
    if (chebyshev(from, o.pos) <= r) out.push(o);
  }
  return out;
}

/** Sort objects by Chebyshev distance, ties broken by id. */
function sortObjects(self: Pos, list: RoomObject[]): RoomObject[] {
  return [...list].sort((a, b) => {
    const da = chebyshev(self, a.pos);
    const db = chebyshev(self, b.pos);
    if (da !== db) return da - db;
    return a.id.localeCompare(b.id);
  });
}

/** Pick the most relevant object to interact with (self tile or adjacent). */
function pickInteractTarget(world: World, self: Actor, ref: unknown): RoomObject | null {
  const here = objectsWithin(world, self.pos, 1);
  if (here.length === 0) return null;
  if (ref && typeof ref === "object") {
    const r = ref as RoomObject;
    if (typeof r.id === "string") {
      const hit = here.find(o => o.id === r.id);
      if (hit) return hit;
    }
  }
  // No explicit target: prefer one on the hero's tile, else closest by id.
  const onSelf = here.filter(o => o.pos.x === self.pos.x && o.pos.y === self.pos.y);
  const sorted = sortObjects(self.pos, onSelf.length > 0 ? onSelf : here);
  return sorted[0] ?? null;
}

// ──────────────────────────── key consumption ────────────────────────────

function findKey(self: Actor): { idx: number; instance: ItemInstance } | null {
  const inv = self.inventory;
  if (!inv) return null;
  const idx = inv.consumables.findIndex(i => i.defId === "key");
  if (idx < 0) return null;
  return { idx, instance: inv.consumables[idx]! };
}

function consumeKey(self: Actor): void {
  const hit = findKey(self);
  if (!hit) return;
  self.inventory!.consumables.splice(hit.idx, 1);
}

// ──────────────────────────── chest open ────────────────────────────

function openChest(world: World, self: Actor, obj: RoomObject): GameEvent[] {
  const events: GameEvent[] = [];
  const tableId = obj.lootTableId;
  if (tableId) {
    const entries = CHEST_LOOT_TABLES[tableId] ?? [];
    for (const entry of entries) {
      const roll = worldRandom(world);
      if (roll >= entry.chance) continue;
      const lo = entry.min ?? 1;
      const hi = entry.max ?? lo;
      const count = worldRandInt(world, lo, hi);
      for (let i = 0; i < count; i++) {
        const def = ITEMS[entry.defId];
        if (!def) continue;
        if (!self.inventory) self.inventory = { consumables: [], equipped: { hat: null, robe: null, staff: null, dagger: null, focus: null } };
        const seq = (world.itemSeq ?? 0) + 1;
        world.itemSeq = seq;
        const inst: ItemInstance = { id: `ch${seq}_${entry.defId}`, defId: entry.defId };
        self.inventory.consumables.push(inst);
        events.push({
          type: "ItemPickedUp",
          actor: self.id, item: inst.id, defId: entry.defId,
          pos: { ...self.pos },
        });
      }
    }
  }
  // Remove the chest from the room.
  if (world.room.objects) {
    world.room.objects = world.room.objects.filter(o => o.id !== obj.id);
  }
  events.push({
    type: "ObjectChanged",
    objectId: obj.id, kind: obj.kind, removed: true,
  });
  return events;
}

// ──────────────────────────── interact dispatcher ────────────────────────────

export interface InteractResult {
  events: GameEvent[];
  /** true if the action completed (energy is spent), false if it failed cleanly. */
  ok: boolean;
}

export function doInteractCore(world: World, self: Actor, ref: unknown): InteractResult {
  const target = pickInteractTarget(world, self, ref);
  if (!target) {
    return {
      ok: false,
      events: [{
        type: "ObjectInteracted",
        actor: self.id, objectId: "", kind: "chest",
        result: "failed:no_target",
      }, {
        type: "ActionFailed", actor: self.id, action: "interact", reason: "no object nearby",
      }],
    };
  }

  switch (target.kind) {
    case "chest": {
      if (target.locked) {
        const key = findKey(self);
        if (!key) {
          return {
            ok: false,
            events: [{
              type: "ObjectInteracted",
              actor: self.id, objectId: target.id, kind: target.kind,
              result: "failed:locked",
            }, {
              type: "ActionFailed", actor: self.id, action: "interact", reason: "chest is locked",
            }],
          };
        }
        consumeKey(self);
        const events: GameEvent[] = [
          { type: "ObjectInteracted", actor: self.id, objectId: target.id, kind: target.kind, result: "unlocked" },
          { type: "Notified", actor: self.id, text: "CHEST UNLOCKED", style: "info", duration: 1.5 },
        ];
        events.push(...openChest(world, self, target));
        events.push({ type: "Notified", actor: self.id, text: "CHEST OPENED", style: "info", duration: 1.5 });
        return { ok: true, events };
      }
      const events: GameEvent[] = [
        { type: "ObjectInteracted", actor: self.id, objectId: target.id, kind: target.kind, result: "opened" },
        { type: "Notified", actor: self.id, text: "CHEST OPENED", style: "info", duration: 1.5 },
      ];
      events.push(...openChest(world, self, target));
      return { ok: true, events };
    }

    case "fountain_health": {
      const before = self.hp;
      self.hp = self.maxHp;
      const events: GameEvent[] = [
        { type: "ObjectInteracted", actor: self.id, objectId: target.id, kind: target.kind, result: "drained" },
        { type: "Healed", actor: self.id, amount: Math.max(0, self.hp - before) },
        { type: "Notified", actor: self.id, text: "FOUNTAIN TAPPED — HP RESTORED", style: "success", duration: 1.5 },
      ];
      return { ok: true, events };
    }

    case "fountain_mana": {
      const max = self.maxMp ?? 0;
      const before = self.mp ?? 0;
      self.mp = max;
      const events: GameEvent[] = [
        { type: "ObjectInteracted", actor: self.id, objectId: target.id, kind: target.kind, result: "drained" },
        { type: "ManaChanged", actor: self.id, amount: Math.max(0, max - before) },
        { type: "Notified", actor: self.id, text: "FOUNTAIN TAPPED — MP RESTORED", style: "success", duration: 1.5 },
      ];
      return { ok: true, events };
    }

    case "door_closed": {
      if (!target.locked) {
        target.locked = false;
        if (world.room.objects) world.room.objects = world.room.objects.filter(o => o.id !== target.id);
        return {
          ok: true,
          events: [
            { type: "ObjectInteracted", actor: self.id, objectId: target.id, kind: target.kind, result: "opened" },
            { type: "ObjectChanged", objectId: target.id, kind: target.kind, removed: true },
          ],
        };
      }
      const key = findKey(self);
      if (!key) {
        return {
          ok: false,
          events: [{
            type: "ObjectInteracted", actor: self.id, objectId: target.id, kind: target.kind, result: "failed:locked",
          }, {
            type: "ActionFailed", actor: self.id, action: "interact", reason: "the door is locked",
          }],
        };
      }
      consumeKey(self);
      // Unlock + remove the door so the tile is walkable.
      target.locked = false;
      if (world.room.objects) world.room.objects = world.room.objects.filter(o => o.id !== target.id);
      return {
        ok: true,
        events: [
          { type: "ObjectInteracted", actor: self.id, objectId: target.id, kind: target.kind, result: "unlocked" },
          { type: "Notified", actor: self.id, text: "DOOR UNLOCKED", style: "info", duration: 1.5 },
          { type: "ObjectChanged", objectId: target.id, kind: target.kind, removed: true },
        ],
      };
    }

    case "exit_door_closed": {
      if (!target.locked) {
        // Already open — no-op success.
        return {
          ok: true,
          events: [{
            type: "ObjectInteracted", actor: self.id, objectId: target.id, kind: target.kind, result: "opened",
          }],
        };
      }
      const key = findKey(self);
      if (!key) {
        return {
          ok: false,
          events: [{
            type: "ObjectInteracted", actor: self.id, objectId: target.id, kind: target.kind, result: "failed:locked",
          }, {
            type: "ActionFailed", actor: self.id, action: "interact", reason: "the exit is sealed",
          }],
        };
      }
      consumeKey(self);
      target.locked = false;
      // Don't remove — the renderer keeps the open door visually present.
      return {
        ok: true,
        events: [
          { type: "ObjectInteracted", actor: self.id, objectId: target.id, kind: target.kind, result: "unlocked" },
          { type: "Notified", actor: self.id, text: "EXIT UNLOCKED", style: "success", duration: 2 },
          { type: "ObjectChanged", objectId: target.id, kind: target.kind, locked: false },
        ],
      };
    }
  }
}
