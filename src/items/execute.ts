// Item execution: useItem / equipItem / unequipItem + proc hooks.
//
// - Consumables dispatch SpellOp[] body through PRIMITIVES at use-time.
// - Equipment (wearables): structured data (bonuses, procs, aura). Aura effects
//   are applied on equip with Infinity duration and removed on unequip; they are
//   immune to cleanse (source.type === "item").
// - Four proc hooks (on_hit, on_damage, on_kill, on_cast) share fireProcSpec:
//   chance gate → target resolution → effect + damage application.
// - Loop guard: proc damage is tagged fromProc:true. onDamageHook returns []
//   when fromProc is true, preventing retaliation chains.
// - Bonus aggregation: additive across all equipped slots.

import type {
  Actor, ItemInstance, ItemDef, ProcSpec, Slot, StatKey, World, GameEvent, Pos,
} from "../types.js";
import { ITEMS, BAG_SIZE, SLOTS, emptyEquipped } from "../content/items.js";
import {
  applyEffect, wireEquipmentBonuses, wireOnKillHook,
  callOnKillHook, REGISTRY as EFFECT_REGISTRY,
} from "../effects.js";
import { PRIMITIVES, type TargetRef } from "../spells/primitives.js";
import { spawnOverflowDrop } from "./loot.js";
import { worldRandom } from "../rng.js";

// Validate all wearables at load time: effect kinds, stat keys, target arity, chance range.
export function validateAllWearables(): void {
  const validEffectKinds = new Set(Object.keys(EFFECT_REGISTRY));
  const validStatKeys = new Set<string>(["atk", "def", "int", "speed", "maxHp", "maxMp"]);

  function checkProc(
    itemId: string,
    name: string,
    proc: ProcSpec | undefined,
    validTargets: ReadonlyArray<string>,
  ): void {
    if (!proc) return;
    if (!validTargets.includes(proc.target)) {
      throw new Error(`[${itemId}] ${name}.target '${proc.target}' invalid (valid: ${validTargets.join(",")})`);
    }
    if (proc.chance !== undefined && (proc.chance < 0 || proc.chance > 100)) {
      throw new Error(`[${itemId}] ${name}.chance ${proc.chance} out of [0,100]`);
    }
    if (proc.effect) {
      if (!validEffectKinds.has(proc.effect.kind)) {
        throw new Error(`[${itemId}] ${name}.effect.kind '${proc.effect.kind}' unknown`);
      }
      if (proc.effect.duration <= 0) {
        throw new Error(`[${itemId}] ${name}.effect.duration must be > 0`);
      }
    }
  }

  for (const [id, def] of Object.entries(ITEMS)) {
    if (def.kind !== "equipment") continue;

    if (def.bonuses) {
      for (const k of Object.keys(def.bonuses)) {
        if (!validStatKeys.has(k)) throw new Error(`[${id}] invalid stat key '${k}'`);
      }
    }
    if (def.aura && !validEffectKinds.has(def.aura.kind)) {
      throw new Error(`[${id}] aura.kind '${def.aura.kind}' unknown`);
    }
    checkProc(id, "on_hit",    def.on_hit,    ["victim"]);
    checkProc(id, "on_damage", def.on_damage, ["attacker", "self"]);
    checkProc(id, "on_kill",   def.on_kill,   ["victim", "self"]);
    checkProc(id, "on_cast",   def.on_cast,   ["self"]);
  }

  // Verify every slot has at least one wearable.
  const covered = new Set<Slot>();
  for (const def of Object.values(ITEMS)) {
    if (def.kind === "equipment" && def.slot) covered.add(def.slot);
  }
  for (const slot of SLOTS) {
    if (!covered.has(slot)) throw new Error(`no wearable registered for slot '${slot}'`);
  }
}

// ──────────────────────────── inventory helpers ────────────────────────────

export function ensureInventory(actor: Actor): NonNullable<Actor["inventory"]> {
  if (!actor.inventory) actor.inventory = { consumables: [], equipped: emptyEquipped() };
  return actor.inventory;
}

// Module-level counter is intentional: callers (mostly tests) need monotonically
// unique ids across many calls within a single process. Engine determinism is
// unaffected — tests that care about replay build inputs explicitly, and the
// engine itself never calls mintInstance.
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

// ──────────────────────────── aura helpers ────────────────────────────

// Remove all effects sourced from a specific equipped item (auras).
function removeItemEffects(world: World, actor: Actor, itemDefId: string): GameEvent[] {
  if (!actor.effects) return [];
  const events: GameEvent[] = [];
  const keep: NonNullable<Actor["effects"]> = [];
  for (const eff of actor.effects) {
    if (eff.source?.type === "item" && eff.source.id === itemDefId) {
      const spec = EFFECT_REGISTRY[eff.kind];
      if (spec?.onExpire) events.push(...spec.onExpire(world, eff, actor));
      events.push({ type: "EffectExpired", actor: actor.id, kind: eff.kind });
    } else {
      keep.push(eff);
    }
  }
  actor.effects = keep;
  return events;
}

function applyAura(world: World, actor: Actor, def: ItemDef): GameEvent[] {
  if (!def.aura) return [];
  return applyEffect(world, actor.id, def.aura.kind, Infinity, {
    source: { type: "item", id: def.id },
    magnitude: def.aura.magnitude,
  });
}

// ──────────────────────────── equip / unequip ────────────────────────────

export function equipItem(world: World, actor: Actor, instance: ItemInstance): GameEvent[] {
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
    events.push(...removeItemEffects(world, actor, prev.defId));
    events.push({ type: "ItemUnequipped", actor: actor.id, item: prev.id, defId: prev.defId, slot });
    inv.consumables.push(prev);
  }

  inv.equipped[slot] = instance;
  events.push(...applyAura(world, actor, def));
  events.push({ type: "ItemEquipped", actor: actor.id, item: instance.id, defId: def.id, slot });
  return events;
}

export function unequipItem(world: World, actor: Actor, slot: Slot): GameEvent[] {
  const inv = ensureInventory(actor);
  const inst = inv.equipped[slot];
  if (!inst) return [{ type: "ActionFailed", actor: actor.id, action: "unequip", reason: `Nothing equipped in ${slot}.` }];
  inv.equipped[slot] = null;
  const def = ITEMS[inst.defId]!;
  const events: GameEvent[] = [];
  events.push(...removeItemEffects(world, actor, inst.defId));
  events.push({ type: "ItemUnequipped", actor: actor.id, item: inst.id, defId: def.id, slot });
  if (inv.consumables.length < BAG_SIZE) {
    inv.consumables.push(inst);
  } else {
    events.push(spawnOverflowDrop(world, actor, inst));
  }
  return events;
}

// ──────────────────────────── bonus aggregation (additive) ────────────────────────────

// Sum bonuses across all equipped slots. Two items each with +2 int yield +4 total.
export function getEquipmentBonuses(actor: Actor): Partial<Record<StatKey, number>> {
  const inv = actor.inventory;
  if (!inv) return {};
  const out: Partial<Record<StatKey, number>> = {};
  for (const slotKey of Object.keys(inv.equipped) as Slot[]) {
    const inst = inv.equipped[slotKey];
    if (!inst) continue;
    const def = ITEMS[inst.defId];
    if (!def || def.kind !== "equipment") continue;
    if (def.bonuses) {
      for (const [stat, amount] of Object.entries(def.bonuses) as [StatKey, number][]) {
        out[stat] = (out[stat] ?? 0) + amount;
      }
    }
  }
  return out;
}

// ──────────────────────────── proc engine ────────────────────────────

// Shared proc execution: chance gate → target liveness → effect + damage/heal.
function fireProcSpec(
  world: World,
  wearer: Actor,
  proc: ProcSpec,
  target: Actor | null,
  itemDefId: string,
): GameEvent[] {
  if (proc.chance !== undefined && proc.chance < 100) {
    if (worldRandom(world) * 100 >= proc.chance) return [];
  }
  if (!target || !target.alive) return [];

  const events: GameEvent[] = [];

  if (proc.effect) {
    events.push(...applyEffect(world, target.id, proc.effect.kind, proc.effect.duration, {
      source: { type: "item", id: itemDefId },
      ...(proc.effect.magnitude !== undefined ? { magnitude: proc.effect.magnitude } : {}),
    }));
  }

  if (proc.damage !== undefined) {
    if (proc.damage < 0) {
      const healAmt = Math.min(-proc.damage, target.maxHp - target.hp);
      if (healAmt > 0) {
        target.hp += healAmt;
        events.push({ type: "Healed", actor: target.id, amount: healAmt });
      }
    } else if (proc.damage > 0) {
      target.hp -= proc.damage;
      events.push({ type: "Hit", actor: target.id, attacker: wearer.id, damage: proc.damage, fromProc: true });
      if (target.hp <= 0 && target.alive) {
        target.alive = false;
        events.push({ type: "Died", actor: target.id });
        if (target.isHero) events.push({ type: "HeroDied", actor: target.id });
      }
    }
  }

  return events;
}

// ──────────────────────────── on_hit hook ────────────────────────────

export function onHitHook(world: World, attacker: Actor, defender: Actor): GameEvent[] {
  if (!defender.alive) return [];
  const inv = attacker.inventory;
  if (!inv) return [];
  const events: GameEvent[] = [];
  for (const slot of SLOTS) {
    const inst = inv.equipped[slot];
    if (!inst) continue;
    const def = ITEMS[inst.defId];
    if (!def || def.kind !== "equipment" || !def.on_hit) continue;
    events.push({ type: "OnHitTriggered", attacker: attacker.id, defender: defender.id, item: inst.id, defId: def.id });
    events.push(...fireProcSpec(world, attacker, def.on_hit, defender, def.id));
  }
  return events;
}

// ──────────────────────────── on_damage hook ────────────────────────────

// fromProc=true → skip (loop guard: proc retaliation must not re-trigger on_damage).
export function onDamageHook(
  world: World,
  wearer: Actor,
  attacker: Actor | null,
  fromProc: boolean,
): GameEvent[] {
  if (fromProc) return [];
  const inv = wearer.inventory;
  if (!inv) return [];
  const events: GameEvent[] = [];
  for (const slot of SLOTS) {
    const inst = inv.equipped[slot];
    if (!inst) continue;
    const def = ITEMS[inst.defId];
    if (!def || def.kind !== "equipment" || !def.on_damage) continue;
    let target: Actor | null;
    if (def.on_damage.target === "self") {
      target = wearer;
    } else {
      if (!attacker) continue;
      target = attacker;
    }
    events.push(...fireProcSpec(world, wearer, def.on_damage, target, def.id));
  }
  return events;
}

// ──────────────────────────── on_kill hook ────────────────────────────

export function onKillHook(world: World, killer: Actor, victim: Actor): GameEvent[] {
  return callOnKillHook(world, killer, victim);
}

function _onKillImpl(world: World, killer: Actor, victim: Actor): GameEvent[] {
  const inv = killer.inventory;
  if (!inv) return [];
  const events: GameEvent[] = [];
  for (const slot of SLOTS) {
    const inst = inv.equipped[slot];
    if (!inst) continue;
    const def = ITEMS[inst.defId];
    if (!def || def.kind !== "equipment" || !def.on_kill) continue;
    const target = def.on_kill.target === "self" ? killer : victim;
    events.push(...fireProcSpec(world, killer, def.on_kill, target, def.id));
  }
  return events;
}

// ──────────────────────────── on_cast hook ────────────────────────────

export function onCastHook(world: World, caster: Actor): GameEvent[] {
  const inv = caster.inventory;
  if (!inv) return [];
  const events: GameEvent[] = [];
  for (const slot of SLOTS) {
    const inst = inv.equipped[slot];
    if (!inst) continue;
    const def = ITEMS[inst.defId];
    if (!def || def.kind !== "equipment" || !def.on_cast) continue;
    events.push(...fireProcSpec(world, caster, def.on_cast, caster, def.id));
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
wireOnKillHook(_onKillImpl);
