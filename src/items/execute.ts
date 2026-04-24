// Item execution: useItem / equipItem / unequipItem / onHitHook.
//
// Design:
// - Consumables (`use(item)`) run their parsed ItemOp[], consume the bag slot,
//   and cost 15 energy. Failed use emits ActionFailed (refunded by scheduler).
// - Wearables contribute via equipItem/unequipItem (UI-driven — NOT exposed
//   as a script builtin). `merge` ops aggregate monotone-max per stat across
//   all equipped items; see getEquipmentBonuses.
// - onHitHook runs after a successful attack: the attacker's equipped dagger's
//   `on_hit_inflict` ops fire against the defender.

import type {
  Actor, ItemInstance, ItemDef, Slot, World, GameEvent,
} from "../types.js";
import { ITEMS, BAG_SIZE, emptyEquipped } from "../content/items.js";
import { parseItemScript, type ItemOp, type MergeStat } from "./script.js";
import { applyEffect, wireEquipmentBonuses, REGISTRY as EFFECT_REGISTRY } from "../effects.js";
import { spawnOverflowDrop } from "./loot.js";

// ──────────────────────────── parse cache ────────────────────────────

const OP_CACHE = new Map<string, ItemOp[]>();

export function getItemOps(defId: string): ItemOp[] {
  let cached = OP_CACHE.get(defId);
  if (cached) return cached;
  const def = ITEMS[defId];
  if (!def) throw new Error(`unknown item '${defId}'`);
  cached = parseItemScript(defId, def.script);
  OP_CACHE.set(defId, cached);
  return cached;
}

// Parse every registered item — used at load-time to fail fast on bad content.
export function parseAllItems(): void {
  for (const id of Object.keys(ITEMS)) getItemOps(id);
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

export function useItem(world: World, actor: Actor, instance: ItemInstance): GameEvent[] {
  const def = ITEMS[instance.defId];
  if (!def) return [fail(actor, `Unknown item '${instance.defId}'.`)];
  if (def.category !== "consumable") return [fail(actor, `${def.name} is not a consumable.`)];

  const idx = findInBag(actor, instance);
  if (idx < 0) return [fail(actor, `${def.name} is not in your bag.`)];

  const ops = getItemOps(def.id);
  const events: GameEvent[] = [];

  for (const op of ops) {
    switch (op.op) {
      case "apply": {
        events.push(...applyEffect(world, actor.id, op.effectId, op.duration, { source: `item:${def.id}` }));
        break;
      }
      case "restore": {
        if (op.pool === "hp") {
          const healed = Math.min(op.amount, actor.maxHp - actor.hp);
          if (healed > 0) {
            actor.hp += healed;
            events.push({ type: "Healed", actor: actor.id, amount: healed });
          }
        } else {
          const maxMp = actor.maxMp ?? 0;
          const cur = actor.mp ?? 0;
          const restored = Math.min(op.amount, maxMp - cur);
          if (restored > 0) actor.mp = cur + restored;
        }
        break;
      }
      case "cleanse": {
        const effs = actor.effects ?? [];
        const keep: typeof effs = [];
        for (const e of effs) {
          if (e.kind === op.effectId) {
            events.push({ type: "EffectExpired", actor: actor.id, kind: e.kind });
          } else keep.push(e);
        }
        actor.effects = keep;
        break;
      }
      case "modify": {
        bumpBaseStat(actor, op.stat, op.amount);
        break;
      }
      // Consumable scripts should not contain merge/on_hit_inflict — silently
      // ignored here so authoring mistakes surface via tests, not crashes.
      case "merge":
      case "on_hit_inflict":
        break;
    }
  }

  // Remove the item from the bag.
  ensureInventory(actor).consumables.splice(idx, 1);
  events.push({ type: "ItemUsed", actor: actor.id, item: instance.id, defId: def.id });
  return events;
}

function bumpBaseStat(actor: Actor, stat: MergeStat, amount: number): void {
  switch (stat) {
    case "atk":   actor.atk   = (actor.atk   ?? 0) + amount; break;
    case "def":   actor.def   = (actor.def   ?? 0) + amount; break;
    case "int":   actor.int   = (actor.int   ?? 0) + amount; break;
    case "speed": actor.speed = actor.speed + amount; break;
    case "maxHp": actor.maxHp = actor.maxHp + amount; break;
    case "maxMp": actor.maxMp = (actor.maxMp ?? 0) + amount; break;
  }
}

// ──────────────────────────── equip / unequip ────────────────────────────

export function equipItem(world: World, actor: Actor, instance: ItemInstance): GameEvent[] {
  void world;
  const def = ITEMS[instance.defId];
  if (!def) return [{ type: "ActionFailed", actor: actor.id, action: "equip", reason: `Unknown item '${instance.defId}'.` }];
  if (def.category !== "wearable" || !def.slot) {
    return [{ type: "ActionFailed", actor: actor.id, action: "equip", reason: `${def.name} cannot be equipped.` }];
  }
  const inv = ensureInventory(actor);
  const idx = inv.consumables.findIndex(i => i.id === instance.id);
  if (idx < 0) return [{ type: "ActionFailed", actor: actor.id, action: "equip", reason: `${def.name} is not in your bag.` }];

  const slot = def.slot;
  const events: GameEvent[] = [];
  const prev = inv.equipped[slot];
  // Pull the incoming instance out of the bag first (its index is `idx`).
  inv.consumables.splice(idx, 1);
  // If the slot was occupied, return the old item to the bag and emit an
  // Unequipped event. Bag capacity is generous enough in practice (we just
  // freed a slot by removing the incoming); overflow silently drops — UI
  // enforces the real bag-size check.
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
    // Phase 9: bag was full — the ex-equipped item falls to the floor at
    // the actor's feet rather than vanishing. Emits ItemDropped{source:"overflow"}.
    events.push(spawnOverflowDrop(world, actor, inst));
  }
  return events;
}

// ──────────────────────────── merge aggregation ────────────────────────────

// Fold all equipped items' `merge <stat> <N>` ops. Monotone-max: the highest
// contribution per stat wins — two +2 int items give +2 int, not +4.
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

// Fires every on_hit_inflict op from the attacker's equipped dagger against
// the defender. Called by doAttack after the hit resolves. Skipped if the
// defender is already dead (avoids proccing into a corpse) or the attacker
// has no dagger.
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

// Expose the effect registry so internal callers outside this module can
// validate effect kinds without re-importing effects.ts (keeps the public
// Phase 7 surface small).
export const _EFFECTS = EFFECT_REGISTRY;

// Wire the bonus calculator into the effects module so effectiveStats()
// includes equipment contributions. One-shot at module load.
wireEquipmentBonuses(getEquipmentBonuses);
