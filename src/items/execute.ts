// Item execution: useItem / equipItem / unequipItem + proc hooks.
//
// Design:
// - Consumables run their parsed ItemOp[] and consume the bag slot.
// - Wearables use structured data (WearableDef.bonuses / procs / aura);
//   no DSL script. getEquipmentBonuses is additive across all equipped slots.
// - Aura effects (WearableDef.aura) are applied on equip with Infinity duration
//   and removed on unequip. Source is { type:"item", id:defId }; they are immune
//   to cleanse (checked in useItem).
// - Four proc hooks (on_hit, on_damage, on_kill, on_cast) share fireProcSpec:
//   chance gate → target resolution → effect + damage application.
// - Loop guard: proc damage is tagged fromProc:true. onDamageHook returns []
//   when fromProc is true, preventing retaliation chains.

import type {
  Actor, ItemInstance, ProcSpec, WearableDef, Slot, World, GameEvent,
} from "../types.js";
import { ITEMS, BAG_SIZE, SLOTS, emptyEquipped } from "../content/items.js";
import { parseItemScript, type ItemOp, type MergeStat } from "./script.js";
import {
  applyEffect, wireEquipmentBonuses, wireOnKillHook,
  callOnKillHook, REGISTRY as EFFECT_REGISTRY,
} from "../effects.js";
import { spawnOverflowDrop } from "./loot.js";
import { worldRandom } from "../rng.js";

// ──────────────────────────── parse cache (consumables only) ────────────────────────────

const OP_CACHE = new Map<string, ItemOp[]>();

export function getItemOps(defId: string): ItemOp[] {
  let cached = OP_CACHE.get(defId);
  if (cached) return cached;
  const def = ITEMS[defId];
  if (!def) throw new Error(`unknown item '${defId}'`);
  if (def.category !== "consumable") {
    throw new Error(`getItemOps called on wearable '${defId}' — wearables use structured data`);
  }
  cached = parseItemScript(defId, def.script);
  OP_CACHE.set(defId, cached);
  return cached;
}

// Parse every consumable — used at load-time to fail fast on bad content.
export function parseAllItems(): void {
  for (const [id, def] of Object.entries(ITEMS)) {
    if (def.category === "consumable") getItemOps(id);
  }
}

// Validate all wearables at load time: effect kinds, stat keys, target arity,
// chance range.
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
    if (def.category !== "wearable") continue;
    const w = def as WearableDef;

    if (w.bonuses) {
      for (const k of Object.keys(w.bonuses)) {
        if (!validStatKeys.has(k)) throw new Error(`[${id}] invalid stat key '${k}'`);
      }
    }
    if (w.aura && !validEffectKinds.has(w.aura.kind)) {
      throw new Error(`[${id}] aura.kind '${w.aura.kind}' unknown`);
    }
    checkProc(id, "on_hit",    w.on_hit,    ["victim"]);
    checkProc(id, "on_damage", w.on_damage, ["attacker", "self"]);
    checkProc(id, "on_kill",   w.on_kill,   ["victim", "self"]);
    checkProc(id, "on_cast",   w.on_cast,   ["self"]);
  }

  // Verify every slot has at least one wearable.
  const covered = new Set<Slot>();
  for (const def of Object.values(ITEMS)) {
    if (def.category === "wearable") covered.add((def as WearableDef).slot);
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
        events.push(...applyEffect(world, actor.id, op.effectId, op.duration, {
          source: { type: "item", id: def.id },
        }));
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
          // Item-sourced effects (auras) are immune to cleanse.
          if (e.kind === op.effectId && e.source?.type !== "item") {
            events.push({ type: "EffectExpired", actor: actor.id, kind: e.kind });
          } else {
            keep.push(e);
          }
        }
        actor.effects = keep;
        break;
      }
      case "modify": {
        bumpBaseStat(actor, op.stat, op.amount);
        break;
      }
      case "merge":
      case "on_hit_inflict":
        break;
    }
  }

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

// ──────────────────────────── aura helpers ────────────────────────────

// Remove all effects whose source is { type:"item", id: itemDefId }.
// Fires onExpire hooks so shield pools etc. clean up correctly.
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

function applyAura(world: World, actor: Actor, w: WearableDef): GameEvent[] {
  if (!w.aura) return [];
  return applyEffect(world, actor.id, w.aura.kind, Infinity, {
    source: { type: "item", id: w.id },
    magnitude: w.aura.magnitude,
  });
}

// ──────────────────────────── equip / unequip ────────────────────────────

export function equipItem(world: World, actor: Actor, instance: ItemInstance): GameEvent[] {
  const def = ITEMS[instance.defId];
  if (!def) return [{ type: "ActionFailed", actor: actor.id, action: "equip", reason: `Unknown item '${instance.defId}'.` }];
  if (def.category !== "wearable") {
    return [{ type: "ActionFailed", actor: actor.id, action: "equip", reason: `${def.name} cannot be equipped.` }];
  }
  const w = def as WearableDef;
  const inv = ensureInventory(actor);
  const idx = inv.consumables.findIndex(i => i.id === instance.id);
  if (idx < 0) return [{ type: "ActionFailed", actor: actor.id, action: "equip", reason: `${def.name} is not in your bag.` }];

  const slot = w.slot;
  const events: GameEvent[] = [];
  const prev = inv.equipped[slot];

  // Pull the incoming instance out of the bag first.
  inv.consumables.splice(idx, 1);

  // If the slot was occupied: remove its aura, return it to bag, emit Unequipped.
  if (prev) {
    events.push(...removeItemEffects(world, actor, prev.defId));
    events.push({ type: "ItemUnequipped", actor: actor.id, item: prev.id, defId: prev.defId, slot });
    inv.consumables.push(prev);
  }

  inv.equipped[slot] = instance;

  // Apply new item's aura (if any). Swap order: A remove above, B apply here → no gap/double.
  events.push(...applyAura(world, actor, w));
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

  // Remove item-sourced effects (aura) before unequip event.
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

// Fold all equipped WearableDef.bonuses additively. Each item contributes its
// bonuses independently; two items with +2 int give +4 int total.
export function getEquipmentBonuses(actor: Actor): Partial<Record<MergeStat, number>> {
  const inv = actor.inventory;
  if (!inv) return {};
  const out: Partial<Record<MergeStat, number>> = {};
  for (const slotKey of Object.keys(inv.equipped) as Slot[]) {
    const inst = inv.equipped[slotKey];
    if (!inst) continue;
    const def = ITEMS[inst.defId];
    if (!def || def.category !== "wearable") continue;
    const w = def as WearableDef;
    if (!w.bonuses) continue;
    for (const [stat, amount] of Object.entries(w.bonuses) as [MergeStat, number][]) {
      out[stat] = (out[stat] ?? 0) + amount;
    }
  }
  return out;
}

// ──────────────────────────── proc engine ────────────────────────────

// Core proc application: chance gate, target liveness check, effect + damage.
// target is pre-resolved by the caller; null = silently skip.
// itemDefId is the wearable that owns this proc (used as effect source).
function fireProcSpec(
  world: World,
  wearer: Actor,
  proc: ProcSpec,
  target: Actor | null,
  itemDefId: string,
): GameEvent[] {
  // Chance gate — uses seeded world RNG for determinism.
  if (proc.chance !== undefined && proc.chance < 100) {
    if (worldRandom(world) * 100 >= proc.chance) return [];
  }
  if (!target || !target.alive) return [];

  const events: GameEvent[] = [];

  // Apply status effect.
  if (proc.effect) {
    events.push(...applyEffect(world, target.id, proc.effect.kind, proc.effect.duration, {
      source: { type: "item", id: itemDefId },
      ...(proc.effect.magnitude !== undefined ? { magnitude: proc.effect.magnitude } : {}),
    }));
  }

  // Apply damage or heal. negative damage = heal target by |damage|.
  if (proc.damage !== undefined) {
    if (proc.damage < 0) {
      const healAmt = Math.min(-proc.damage, target.maxHp - target.hp);
      if (healAmt > 0) {
        target.hp += healAmt;
        events.push({ type: "Healed", actor: target.id, amount: healAmt });
      }
    } else if (proc.damage > 0) {
      // Proc damage: tagged fromProc:true so onDamageHook ignores it (loop guard).
      target.hp -= proc.damage;
      events.push({ type: "Hit", actor: target.id, attacker: wearer.id, damage: proc.damage, fromProc: true });
      if (target.hp <= 0 && target.alive) {
        target.alive = false;
        events.push({ type: "Died", actor: target.id });
        if (target.isHero) events.push({ type: "HeroDied", actor: target.id });
        // No recursive on_kill for proc damage (one-step retaliation guard).
      }
    }
  }

  return events;
}

// ──────────────────────────── on_hit hook ────────────────────────────

// Fires after a successful melee connect. Checks ALL equipped slots (staves
// and daggers both carry on_hit procs). Skipped if defender is already dead.
export function onHitHook(world: World, attacker: Actor, defender: Actor): GameEvent[] {
  if (!defender.alive) return [];
  const inv = attacker.inventory;
  if (!inv) return [];
  const events: GameEvent[] = [];
  for (const slot of SLOTS) {
    const inst = inv.equipped[slot];
    if (!inst) continue;
    const def = ITEMS[inst.defId];
    if (!def || def.category !== "wearable") continue;
    const w = def as WearableDef;
    if (!w.on_hit) continue;
    events.push({ type: "OnHitTriggered", attacker: attacker.id, defender: defender.id, item: inst.id, defId: def.id });
    events.push(...fireProcSpec(world, attacker, w.on_hit, defender, def.id));
  }
  return events;
}

// ──────────────────────────── on_damage hook ────────────────────────────

// Fires after the wearer's hp updates from a hit. fromProc=true → skip entirely
// (loop guard: proc retaliation damage must not re-trigger on_damage).
// attacker=null for sourceless damage (cloud ticks, environment); procs with
// target:"attacker" silently skip in that case.
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
    if (!def || def.category !== "wearable") continue;
    const w = def as WearableDef;
    if (!w.on_damage) continue;
    let target: Actor | null;
    if (w.on_damage.target === "self") {
      target = wearer;
    } else {
      // target: "attacker"
      if (!attacker) continue; // sourceless damage — skip silently
      target = attacker;
    }
    events.push(...fireProcSpec(world, wearer, w.on_damage, target, def.id));
  }
  return events;
}

// ──────────────────────────── on_kill hook ────────────────────────────

// Fires when the killer lands a killing blow. target:"self" heals/buffs the
// killer; target:"victim" applies to the slain actor (position-based effects).
export function onKillHook(world: World, killer: Actor, victim: Actor): GameEvent[] {
  return callOnKillHook(world, killer, victim);
}

// Internal implementation — called by the wire injected into effects.ts so
// DoT/effect kills also fire this hook.
function _onKillImpl(world: World, killer: Actor, victim: Actor): GameEvent[] {
  const inv = killer.inventory;
  if (!inv) return [];
  const events: GameEvent[] = [];
  for (const slot of SLOTS) {
    const inst = inv.equipped[slot];
    if (!inst) continue;
    const def = ITEMS[inst.defId];
    if (!def || def.category !== "wearable") continue;
    const w = def as WearableDef;
    if (!w.on_kill) continue;
    const target = w.on_kill.target === "self" ? killer : victim;
    events.push(...fireProcSpec(world, killer, w.on_kill, target, def.id));
  }
  return events;
}

// ──────────────────────────── on_cast hook ────────────────────────────

// Fires after any successful spell cast. target is always "self".
export function onCastHook(world: World, caster: Actor): GameEvent[] {
  const inv = caster.inventory;
  if (!inv) return [];
  const events: GameEvent[] = [];
  for (const slot of SLOTS) {
    const inst = inv.equipped[slot];
    if (!inst) continue;
    const def = ITEMS[inst.defId];
    if (!def || def.category !== "wearable") continue;
    const w = def as WearableDef;
    if (!w.on_cast) continue;
    // target: "self" only
    events.push(...fireProcSpec(world, caster, w.on_cast, caster, def.id));
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

// Expose the effect registry so callers outside this module can validate
// effect kinds without re-importing effects.ts (keeps the public surface small).
export const _EFFECTS = EFFECT_REGISTRY;

// Wire the bonus calculator and on_kill hook into their respective modules.
// One-shot at module load.
wireEquipmentBonuses(getEquipmentBonuses);
wireOnKillHook(_onKillImpl);
