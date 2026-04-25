// Item execution: useItem / equipItem / unequipItem / onHitHook.
//
// Design:
// - Consumables (`use(item)`) dispatch SpellOp[] body through the PRIMITIVES
//   registry, consume the bag slot, and cost 15 energy. Gate validation
//   (faction, range, LOS) runs in doUse (commands.ts) BEFORE this function —
//   useItem trusts pre-validated target refs.
// - Equipment contributes via equipItem/unequipItem (UI-driven).
//   `merge` ops aggregate monotone-max per stat.
// - onHitHook runs after a successful attack: attacker's dagger on_hit_inflict
//   ops fire against the defender.

import type {
  Actor, ItemInstance, ItemDef, Slot, World, GameEvent, Pos, SpellOp,
} from "../types.js";
import { ITEMS, BAG_SIZE, emptyEquipped } from "../content/items.js";
import { parseItemScript, type ItemOp, type MergeStat } from "./script.js";
import { applyEffect, wireEquipmentBonuses, REGISTRY as EFFECT_REGISTRY } from "../effects.js";
import { PRIMITIVES, type TargetRef } from "../spells/primitives.js";
import { spawnOverflowDrop } from "./loot.js";

// ──────────────────────────── parse cache (equipment only) ────────────────────────────

const OP_CACHE = new Map<string, ItemOp[]>();

export function getItemOps(defId: string): ItemOp[] {
  let cached = OP_CACHE.get(defId);
  if (cached) return cached;
  const def = ITEMS[defId];
  if (!def) throw new Error(`unknown item '${defId}'`);
  if (!def.script) { const empty: ItemOp[] = []; OP_CACHE.set(defId, empty); return empty; }
  cached = parseItemScript(defId, def.script);
  OP_CACHE.set(defId, cached);
  return cached;
}

// Parse every equipment item — used at load-time to fail fast on bad content.
export function parseAllItems(): void {
  for (const id of Object.keys(ITEMS)) {
    const def = ITEMS[id]!;
    if (def.kind === "equipment" && def.script) getItemOps(id);
  }
}

// ──────────────────────────── inventory helpers ────────────────────────────

export function ensureInventory(actor: Actor): NonNullable<Actor["inventory"]> {
  if (!actor.inventory) actor.inventory = { consumables: [], equipped: emptyEquipped() };
  return actor.inventory;
}

let nextInstanceId = 1;
export function mintInstance(defId: string): ItemInstance {
  return { id: `it${nextInstanceId++}_${defId}`, defId };
}

function findInBag(actor: Actor, instance: ItemInstance): number {
  const inv = ensureInventory(actor);
  return inv.consumables.findIndex(i => i.id === instance.id);
}

// ──────────────────────────── use (consumable) ────────────────────────────

function fail(actor: Actor, reason: string): GameEvent {
  return { type: "ActionFailed", actor: actor.id, action: "use", reason };
}

// Execute a consumable item, dispatching its SpellOp[] body through PRIMITIVES.
// targetActor / targetPos are pre-resolved and pre-validated by doUse (commands.ts).
// This function ONLY checks bag membership and item kind; gate validation lives upstream.
export function useItem(
  world: World,
  actor: Actor,
  instance: ItemInstance,
  targetActor?: Actor | null,
  targetPos?: Pos | null,
): GameEvent[] {
  const def = ITEMS[instance.defId];
  if (!def) return [fail(actor, `Unknown item '${instance.defId}'.`)];
  if (def.kind !== "consumable") return [fail(actor, `${def.name} is not a consumable.`)];

  const idx = findInBag(actor, instance);
  if (idx < 0) return [fail(actor, `${def.name} is not in your bag.`)];

  // Resolve targets: default to self when not provided (self-target items).
  const resolvedActor: Actor = targetActor ?? actor;
  const resolvedPos: Pos = targetPos ?? actor.pos;

  const events: GameEvent[] = [];
  for (const op of (def.body ?? [])) {
    const prim = PRIMITIVES[op.op];
    if (!prim) {
      events.push(fail(actor, `Unknown primitive '${op.op}'.`));
      continue;
    }
    const ref: TargetRef = prim.targetType === "tile" ? resolvedPos : resolvedActor;
    events.push(...prim.execute(world, actor, ref, op.args));
  }

  ensureInventory(actor).consumables.splice(idx, 1);
  events.push({ type: "ItemUsed", actor: actor.id, item: instance.id, defId: def.id });
  return events;
}

// ──────────────────────────── equip / unequip ────────────────────────────

export function equipItem(world: World, actor: Actor, instance: ItemInstance): GameEvent[] {
  void world;
  const def = ITEMS[instance.defId];
  if (!def) return [{ type: "ActionFailed", actor: actor.id, action: "equip", reason: `Unknown item '${instance.defId}'.` }];
  if (def.kind !== "equipment" || !def.slot) {
    return [{ type: "ActionFailed", actor: actor.id, action: "equip", reason: `${def.name} cannot be equipped.` }];
  }
  const inv = ensureInventory(actor);
  const idx = inv.consumables.findIndex(i => i.id === instance.id);
  if (idx < 0) return [{ type: "ActionFailed", actor: actor.id, action: "equip", reason: `${def.name} is not in your bag.` }];

  const slot = def.slot;
  const events: GameEvent[] = [];
  const prev = inv.equipped[slot];
  inv.consumables.splice(idx, 1);
  if (prev) {
    events.push({ type: "ItemUnequipped", actor: actor.id, item: prev.id, defId: prev.defId, slot });
    inv.consumables.push(prev);
  }
  inv.equipped[slot] = instance;
  events.push({ type: "ItemEquipped", actor: actor.id, item: instance.id, defId: def.id, slot });
  return events;
}

export function unequipItem(world: World, actor: Actor, slot: Slot): GameEvent[] {
  const inv = ensureInventory(actor);
  const inst = inv.equipped[slot];
  if (!inst) return [{ type: "ActionFailed", actor: actor.id, action: "unequip", reason: `Nothing equipped in ${slot}.` }];
  inv.equipped[slot] = null;
  const def = ITEMS[inst.defId]!;
  const events: GameEvent[] = [
    { type: "ItemUnequipped", actor: actor.id, item: inst.id, defId: def.id, slot },
  ];
  if (inv.consumables.length < BAG_SIZE) {
    inv.consumables.push(inst);
  } else {
    events.push(spawnOverflowDrop(world, actor, inst));
  }
  return events;
}

// ──────────────────────────── merge aggregation ────────────────────────────

export function getEquipmentBonuses(actor: Actor): Partial<Record<MergeStat, number>> {
  const inv = actor.inventory;
  if (!inv) return {};
  const out: Partial<Record<MergeStat, number>> = {};
  for (const slotKey of Object.keys(inv.equipped) as Slot[]) {
    const inst = inv.equipped[slotKey];
    if (!inst) continue;
    const ops = getItemOps(inst.defId);
    for (const op of ops) {
      if (op.op !== "merge") continue;
      const cur = out[op.stat] ?? 0;
      if (op.amount > cur) out[op.stat] = op.amount;
    }
  }
  return out;
}

// ──────────────────────────── on-hit hook ────────────────────────────

export function onHitHook(world: World, attacker: Actor, defender: Actor): GameEvent[] {
  if (!defender.alive) return [];
  const inv = attacker.inventory;
  if (!inv) return [];
  const dagger = inv.equipped.dagger;
  if (!dagger) return [];
  const def = ITEMS[dagger.defId];
  if (!def) return [];
  const ops = getItemOps(dagger.defId);
  const events: GameEvent[] = [];
  for (const op of ops) {
    if (op.op !== "on_hit_inflict") continue;
    events.push({
      type: "OnHitTriggered",
      attacker: attacker.id, defender: defender.id,
      item: dagger.id, defId: def.id,
    });
    events.push(...applyEffect(world, defender.id, op.effectId, op.duration, { source: `item:${def.id}` }));
  }
  return events;
}

// ──────────────────────────── bag capacity ────────────────────────────

export function bagHasRoom(actor: Actor): boolean {
  const inv = ensureInventory(actor);
  return inv.consumables.length < BAG_SIZE;
}

export function addToBag(actor: Actor, instance: ItemInstance): boolean {
  if (!bagHasRoom(actor)) return false;
  ensureInventory(actor).consumables.push(instance);
  return true;
}

export const _EFFECTS = EFFECT_REGISTRY;

wireEquipmentBonuses(getEquipmentBonuses);
