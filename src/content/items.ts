// ITEMS — data-only item registry. Equipment scripts are parsed lazily on
// first access via getItemOps so stale content fails at the call site.
// Consumables carry SpellOp[] body dispatched through PRIMITIVES at use-time.
// Scrolls carry a spell name consumed at room completion.
//
// Bag size: 4 consumable slots (constant; UI wiring will clamp/reject).

import type { ItemDef, Slot, SpellOp, EffectKind } from "../types.js";

export const BAG_SIZE = 4;

export const SLOTS: readonly Slot[] = ["hat", "robe", "staff", "dagger", "focus"] as const;

export function emptyEquipped(): Record<Slot, null> {
  return { hat: null, robe: null, staff: null, dagger: null, focus: null };
}

// ──────────────────────────── registry ────────────────────────────

// Existing consumables — migrated to SpellOp[] body shape.
const health_potion: ItemDef = {
  id: "health_potion",
  name: "Health Potion",
  description: "Heals an ally for 10 HP.",
  kind: "consumable", level: 1,
  useTarget: "ally", range: 4, polarity: "buff",
  body: [{ op: "heal", args: { amount: 10 } }],
};
const mana_crystal: ItemDef = {
  id: "mana_crystal",
  name: "Mana Crystal",
  description: "Grants a burst of mana regeneration.",
  kind: "consumable", level: 1,
  useTarget: "ally", range: 4, polarity: "buff",
  body: [{ op: "inflict", args: { kind: "mana_regen" as EffectKind, duration: 15, magnitude: 3 } }],
};
const haste_potion: ItemDef = {
  id: "haste_potion",
  name: "Haste Potion",
  description: "Quickens an ally's step.",
  kind: "consumable", level: 1,
  useTarget: "ally", range: 4, polarity: "buff",
  body: [{ op: "inflict", args: { kind: "haste" as EffectKind, duration: 40, magnitude: 2 } }],
};
const cleanse_potion: ItemDef = {
  id: "cleanse_potion",
  name: "Cleanse Potion",
  description: "Purges all debuffs from an ally.",
  kind: "consumable", level: 1,
  useTarget: "ally", range: 4, polarity: "buff",
  body: [{ op: "cleanse", args: {} }],
};

// Equipment (wearables) — renamed kind from "wearable" → "equipment", level added.
const cloth_cap: ItemDef = {
  id: "cloth_cap", name: "Cloth Cap", description: "A soft cap.",
  kind: "equipment", level: 1, slot: "hat",
  script: "merge int 1",
};
const wizard_hat: ItemDef = {
  id: "wizard_hat", name: "Wizard Hat", description: "Pointy and arcane.",
  kind: "equipment", level: 1, slot: "hat",
  script: "merge int 2\nmerge maxMp 5",
};
const leather_robe: ItemDef = {
  id: "leather_robe", name: "Leather Robe", description: "Sturdy traveller's robe.",
  kind: "equipment", level: 1, slot: "robe",
  script: "merge def 1\nmerge maxHp 4",
};
const silk_robe: ItemDef = {
  id: "silk_robe", name: "Silk Robe", description: "Finely-woven mage's robe.",
  kind: "equipment", level: 1, slot: "robe",
  script: "merge int 2\nmerge def 1",
};
const wooden_staff: ItemDef = {
  id: "wooden_staff", name: "Wooden Staff", description: "A plain oak staff.",
  kind: "equipment", level: 1, slot: "staff",
  script: "merge atk 2\nmerge int 1",
};
const fire_staff: ItemDef = {
  id: "fire_staff", name: "Fire Staff", description: "Wreathed in embers.",
  kind: "equipment", level: 1, slot: "staff",
  script: "merge atk 2\nmerge int 3",
};
const bone_dagger: ItemDef = {
  id: "bone_dagger", name: "Bone Dagger", description: "Carved from old bone.",
  kind: "equipment", level: 1, slot: "dagger",
  script: "merge atk 2",
};
const venom_dagger: ItemDef = {
  id: "venom_dagger", name: "Venom Dagger", description: "Its edge glistens.",
  kind: "equipment", level: 1, slot: "dagger",
  script: "merge atk 2\non_hit inflict poison $TARGET 20 $L",
};
const quartz_focus: ItemDef = {
  id: "quartz_focus", name: "Quartz Focus", description: "A humming crystal shard.",
  kind: "equipment", level: 1, slot: "focus",
  script: "merge int 1\nmerge maxMp 5",
};
const runed_focus: ItemDef = {
  id: "runed_focus", name: "Runed Focus", description: "Etched with spellwork.",
  kind: "equipment", level: 1, slot: "focus",
  script: "merge int 3\nmerge maxMp 10",
};

export const ITEMS: Record<string, ItemDef> = {
  health_potion, mana_crystal, haste_potion, cleanse_potion,
  cloth_cap, wizard_hat, leather_robe, silk_robe,
  wooden_staff, fire_staff, bone_dagger, venom_dagger,
  quartz_focus, runed_focus,
};

// ──────────────────────────── load-time validation ────────────────────────────

const _VALID_PRIMITIVES = new Set<string>([
  "project", "inflict", "heal", "spawn_cloud", "explode",
  "summon", "teleport", "push", "cleanse", "permanent_boost",
]);
const _VALID_EFFECT_KINDS = new Set<string>([
  "burning", "poison", "regen", "haste", "slow",
  "chill", "shock", "expose", "might", "iron_skin",
  "mana_regen", "mana_burn", "power", "shield", "blinded",
]);

for (const [id, def] of Object.entries(ITEMS)) {
  if (def.kind === "consumable") {
    if (!def.body) throw new Error(`ITEMS['${id}']: consumable missing body`);
    if (def.useTarget === undefined) throw new Error(`ITEMS['${id}']: consumable missing useTarget`);
    if (def.range === undefined) throw new Error(`ITEMS['${id}']: consumable missing range`);
    if (def.useTarget === "self" && def.range !== 0) throw new Error(`ITEMS['${id}']: self-target must have range 0`);
    if (def.useTarget !== "self" && def.range < 1) throw new Error(`ITEMS['${id}']: targeted consumable must have range >= 1`);
    for (const op of def.body) {
      if (!_VALID_PRIMITIVES.has(op.op)) throw new Error(`ITEMS['${id}'] op '${op.op}': unknown primitive`);
      if (op.op === "inflict") {
        const k = op.args.kind;
        if (typeof k !== "string" || !_VALID_EFFECT_KINDS.has(k)) {
          throw new Error(`ITEMS['${id}'] op 'inflict': invalid EffectKind '${k}'`);
        }
      }
    }
  }
  if (def.kind === "scroll") {
    if (!def.spell) throw new Error(`ITEMS['${id}']: scroll missing spell`);
  }
  if (def.kind === "equipment") {
    if (!def.slot) throw new Error(`ITEMS['${id}']: equipment missing slot`);
  }
}
