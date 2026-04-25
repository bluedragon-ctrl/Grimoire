// ITEMS — data-only item registry.
//
// Consumables: still use the DSL script body (parsed lazily by items/execute.ts).
// Wearables: structured data (bonuses, procs, aura). No DSL script.
//
// Bag size: 4 consumable slots (constant; UI wiring will clamp/reject).

import type { ConsumableDef, WearableDef, Slot } from "../types.js";

export const BAG_SIZE = 4;

export const SLOTS: readonly Slot[] = ["hat", "robe", "staff", "dagger", "focus"] as const;

export function emptyEquipped(): Record<Slot, null> {
  return { hat: null, robe: null, staff: null, dagger: null, focus: null };
}

// ──────────────────────────── consumables ────────────────────────────

const health_potion: ConsumableDef = {
  id: "health_potion",
  name: "Health Potion",
  description: "Restores health over time.",
  category: "consumable",
  script: "apply regen 30",
};
const mana_crystal: ConsumableDef = {
  id: "mana_crystal",
  name: "Mana Crystal",
  description: "Restores 10 mana.",
  category: "consumable",
  script: "restore mp 10",
};
const haste_potion: ConsumableDef = {
  id: "haste_potion",
  name: "Haste Potion",
  description: "Quickens your step.",
  category: "consumable",
  script: "apply haste 40",
};
const cleanse_potion: ConsumableDef = {
  id: "cleanse_potion",
  name: "Cleanse Potion",
  description: "Purges noxious afflictions.",
  category: "consumable",
  script: "cleanse poison\ncleanse burning\ncleanse slow",
};

// ──────────────────────────── wearables: hats ────────────────────────────

const cloth_cap: WearableDef = {
  id: "cloth_cap", name: "Cloth Cap", description: "A soft cap.",
  category: "wearable", slot: "hat", level: 1,
  bonuses: { maxHp: 6 },
};
const wizard_hat: WearableDef = {
  id: "wizard_hat", name: "Wizard Hat", description: "Pointy and arcane.",
  category: "wearable", slot: "hat", level: 1,
  bonuses: { int: 4 },
};
const iron_helm: WearableDef = {
  id: "iron_helm", name: "Iron Helm", description: "Heavy iron headgear.",
  category: "wearable", slot: "hat", level: 1,
  bonuses: { def: 3, maxHp: 10 },
};
const stoic_helm: WearableDef = {
  id: "stoic_helm", name: "Stoic Helm", description: "Pain sharpens the will.",
  category: "wearable", slot: "hat", level: 1,
  bonuses: { def: 2 },
  on_damage: { target: "self", effect: { kind: "might", duration: 5, magnitude: 2 } },
};
const crown_of_ages: WearableDef = {
  id: "crown_of_ages", name: "Crown of Ages", description: "Ancient royal crown.",
  category: "wearable", slot: "hat", level: 1,
  bonuses: { int: 5, def: 2, maxHp: 5 },
  aura: { kind: "regen", magnitude: 1 },
};
const lucky_crown: WearableDef = {
  id: "lucky_crown", name: "Lucky Crown", description: "Fortune smiles on the bold.",
  category: "wearable", slot: "hat", level: 1,
  bonuses: { int: 2 },
  on_damage: { target: "self", chance: 25, effect: { kind: "shield", duration: 10, magnitude: 10 } },
};
const arcane_diadem: WearableDef = {
  id: "arcane_diadem", name: "Arcane Diadem", description: "Spellwork fuels the wearer's strength.",
  category: "wearable", slot: "hat", level: 1,
  bonuses: { int: 3 },
  on_cast: { target: "self", chance: 20, effect: { kind: "might", duration: 5, magnitude: 2 } },
};

// ──────────────────────────── wearables: robes ────────────────────────────

const leather_robe: WearableDef = {
  id: "leather_robe", name: "Leather Robe", description: "Sturdy traveller's robe.",
  category: "wearable", slot: "robe", level: 1,
  bonuses: { def: 2, maxHp: 5 },
};
const silk_robe: WearableDef = {
  id: "silk_robe", name: "Silk Robe", description: "Finely-woven mage's robe.",
  category: "wearable", slot: "robe", level: 1,
  bonuses: { def: 3, maxMp: 10 },
};
const chain_vestment: WearableDef = {
  id: "chain_vestment", name: "Chain Vestment", description: "Interlocked rings of steel.",
  category: "wearable", slot: "robe", level: 1,
  bonuses: { def: 5, maxHp: 8 },
};
const thorned_robe: WearableDef = {
  id: "thorned_robe", name: "Thorned Robe", description: "Strike me and bleed.",
  category: "wearable", slot: "robe", level: 1,
  bonuses: { def: 3 },
  on_damage: { target: "attacker", effect: { kind: "poison", duration: 15 } },
};
const shadow_cloak: WearableDef = {
  id: "shadow_cloak", name: "Shadow Cloak", description: "Woven from umbral thread.",
  category: "wearable", slot: "robe", level: 1,
  bonuses: { def: 2, atk: 3, speed: 1 },
  aura: { kind: "haste", magnitude: 1 },
};
const spellweaver_robe: WearableDef = {
  id: "spellweaver_robe", name: "Spellweaver Robe", description: "Each cast mends its wearer.",
  category: "wearable", slot: "robe", level: 1,
  bonuses: { def: 2, maxMp: 8 },
  on_cast: { target: "self", damage: -1 },
};

// ──────────────────────────── wearables: staves ────────────────────────────

const wooden_staff: WearableDef = {
  id: "wooden_staff", name: "Wooden Staff", description: "A plain oak staff.",
  category: "wearable", slot: "staff", level: 1,
  bonuses: { int: 3 },
};
const fire_staff: WearableDef = {
  id: "fire_staff", name: "Fire Staff", description: "Wreathed in embers.",
  category: "wearable", slot: "staff", level: 1,
  bonuses: { int: 8 },
  on_hit: { target: "victim", effect: { kind: "burning", duration: 20 } },
};
const shock_staff: WearableDef = {
  id: "shock_staff", name: "Shock Staff", description: "Crackling with static.",
  category: "wearable", slot: "staff", level: 1,
  bonuses: { int: 5 },
  on_hit: { target: "victim", effect: { kind: "shock", duration: 15 } },
};
const draining_staff: WearableDef = {
  id: "draining_staff", name: "Draining Staff", description: "Saps the mind.",
  category: "wearable", slot: "staff", level: 1,
  bonuses: { int: 6 },
  on_hit: { target: "victim", effect: { kind: "mana_burn", duration: 15 } },
};
const crystal_staff: WearableDef = {
  id: "crystal_staff", name: "Crystal Staff", description: "Pure arcane conduit.",
  category: "wearable", slot: "staff", level: 1,
  bonuses: { int: 10 },
};

// ──────────────────────────── wearables: daggers ────────────────────────────

const bone_dagger: WearableDef = {
  id: "bone_dagger", name: "Bone Dagger", description: "Carved from old bone.",
  category: "wearable", slot: "dagger", level: 1,
  bonuses: { atk: 3 },
};
const steel_dagger: WearableDef = {
  id: "steel_dagger", name: "Steel Dagger", description: "Well-balanced blade.",
  category: "wearable", slot: "dagger", level: 1,
  bonuses: { atk: 5, speed: 1 },
};
const venom_dagger: WearableDef = {
  id: "venom_dagger", name: "Venom Dagger", description: "Its edge glistens.",
  category: "wearable", slot: "dagger", level: 1,
  bonuses: { atk: 2 },
  on_hit: { target: "victim", effect: { kind: "poison", duration: 20 } },
};
const shadow_blade: WearableDef = {
  id: "shadow_blade", name: "Shadow Blade", description: "Opens hidden wounds.",
  category: "wearable", slot: "dagger", level: 1,
  bonuses: { atk: 4 },
  on_hit: { target: "victim", effect: { kind: "expose", duration: 15 } },
};
const frost_shard: WearableDef = {
  id: "frost_shard", name: "Frost Shard", description: "Leaves foes sluggish.",
  category: "wearable", slot: "dagger", level: 1,
  bonuses: { atk: 3 },
  on_hit: { target: "victim", effect: { kind: "chill", duration: 15 } },
};
const wild_dagger: WearableDef = {
  id: "wild_dagger", name: "Wild Dagger", description: "Unpredictably volatile.",
  category: "wearable", slot: "dagger", level: 1,
  bonuses: { atk: 4 },
  on_hit: { target: "victim", chance: 30, effect: { kind: "burning", duration: 15 } },
};
const vampiric_blade: WearableDef = {
  id: "vampiric_blade", name: "Vampiric Blade", description: "Drink deep from the dying.",
  category: "wearable", slot: "dagger", level: 1,
  bonuses: { atk: 4 },
  on_kill: { target: "self", damage: -4 },
};

// ──────────────────────────── wearables: foci ────────────────────────────

const quartz_focus: WearableDef = {
  id: "quartz_focus", name: "Quartz Focus", description: "A humming crystal shard.",
  category: "wearable", slot: "focus", level: 1,
  bonuses: { int: 3 },
};
const runed_focus: WearableDef = {
  id: "runed_focus", name: "Runed Focus", description: "Etched with spellwork.",
  category: "wearable", slot: "focus", level: 1,
  bonuses: { int: 5, maxMp: 8 },
};
const void_focus: WearableDef = {
  id: "void_focus", name: "Void Focus", description: "Channels pure emptiness.",
  category: "wearable", slot: "focus", level: 1,
  bonuses: { int: 9 },
};
const bloodstone: WearableDef = {
  id: "bloodstone", name: "Bloodstone", description: "Power drawn from life itself.",
  category: "wearable", slot: "focus", level: 1,
  bonuses: { int: 4, maxHp: 12 },
};
const star_fragment: WearableDef = {
  id: "star_fragment", name: "Star Fragment", description: "A sliver of distant light.",
  category: "wearable", slot: "focus", level: 1,
  bonuses: { int: 6, maxMp: 12 },
  aura: { kind: "mana_regen", magnitude: 1 },
};
const necromancer_focus: WearableDef = {
  id: "necromancer_focus", name: "Necromancer's Focus", description: "Death feeds the caster.",
  category: "wearable", slot: "focus", level: 1,
  bonuses: { int: 4 },
  on_kill: { target: "self", effect: { kind: "mana_regen", duration: 15, magnitude: 2 } },
};

// ──────────────────────────── registry ────────────────────────────

export const ITEMS: Record<string, ConsumableDef | WearableDef> = {
  // Consumables
  health_potion, mana_crystal, haste_potion, cleanse_potion,
  // Hats (7)
  cloth_cap, wizard_hat, iron_helm, stoic_helm, crown_of_ages,
  lucky_crown, arcane_diadem,
  // Robes (6)
  leather_robe, silk_robe, chain_vestment, thorned_robe, shadow_cloak,
  spellweaver_robe,
  // Staves (5)
  wooden_staff, fire_staff, shock_staff, draining_staff, crystal_staff,
  // Daggers (7)
  bone_dagger, steel_dagger, venom_dagger, shadow_blade, frost_shard,
  wild_dagger, vampiric_blade,
  // Foci (6)
  quartz_focus, runed_focus, void_focus, bloodstone, star_fragment,
  necromancer_focus,
};
