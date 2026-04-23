// ITEMS — data-only item registry. Scripts are parsed lazily (on first access)
// via getItemOps so stale content fails at the call site rather than at module
// import. Registry itself is a plain record; values are ItemDef.
//
// Bag size: 4 consumable slots (constant; UI wiring will clamp/reject).

import type { ItemDef, Slot } from "../types.js";

export const BAG_SIZE = 4;

export const SLOTS: readonly Slot[] = ["hat", "robe", "staff", "dagger", "focus"] as const;

export function emptyEquipped(): Record<Slot, null> {
  return { hat: null, robe: null, staff: null, dagger: null, focus: null };
}

// ──────────────────────────── registry ────────────────────────────

// Consumables
const health_potion: ItemDef = {
  id: "health_potion",
  name: "Health Potion",
  description: "Restores health over time.",
  category: "consumable",
  script: "apply regen 30",
};
const mana_crystal: ItemDef = {
  id: "mana_crystal",
  name: "Mana Crystal",
  description: "Restores 10 mana.",
  category: "consumable",
  script: "restore mp 10",
};
const haste_potion: ItemDef = {
  id: "haste_potion",
  name: "Haste Potion",
  description: "Quickens your step.",
  category: "consumable",
  script: "apply haste 40",
};
const cleanse_potion: ItemDef = {
  id: "cleanse_potion",
  name: "Cleanse Potion",
  description: "Purges noxious afflictions.",
  category: "consumable",
  script: "cleanse poison\ncleanse burning\ncleanse slow",
};

// Wearables — 2 per slot
const cloth_cap: ItemDef = {
  id: "cloth_cap", name: "Cloth Cap", description: "A soft cap.",
  category: "wearable", slot: "hat",
  script: "merge int 1",
};
const wizard_hat: ItemDef = {
  id: "wizard_hat", name: "Wizard Hat", description: "Pointy and arcane.",
  category: "wearable", slot: "hat",
  script: "merge int 2\nmerge maxMp 5",
};
const leather_robe: ItemDef = {
  id: "leather_robe", name: "Leather Robe", description: "Sturdy traveller's robe.",
  category: "wearable", slot: "robe",
  script: "merge def 1\nmerge maxHp 4",
};
const silk_robe: ItemDef = {
  id: "silk_robe", name: "Silk Robe", description: "Finely-woven mage's robe.",
  category: "wearable", slot: "robe",
  script: "merge int 2\nmerge def 1",
};
const wooden_staff: ItemDef = {
  id: "wooden_staff", name: "Wooden Staff", description: "A plain oak staff.",
  category: "wearable", slot: "staff",
  script: "merge atk 2\nmerge int 1",
};
const fire_staff: ItemDef = {
  id: "fire_staff", name: "Fire Staff", description: "Wreathed in embers.",
  category: "wearable", slot: "staff",
  script: "merge atk 2\nmerge int 3",
};
const bone_dagger: ItemDef = {
  id: "bone_dagger", name: "Bone Dagger", description: "Carved from old bone.",
  category: "wearable", slot: "dagger",
  script: "merge atk 2",
};
const venom_dagger: ItemDef = {
  id: "venom_dagger", name: "Venom Dagger", description: "Its edge glistens.",
  category: "wearable", slot: "dagger",
  script: "merge atk 2\non_hit inflict poison $TARGET 20 $L",
};
const quartz_focus: ItemDef = {
  id: "quartz_focus", name: "Quartz Focus", description: "A humming crystal shard.",
  category: "wearable", slot: "focus",
  script: "merge int 1\nmerge maxMp 5",
};
const runed_focus: ItemDef = {
  id: "runed_focus", name: "Runed Focus", description: "Etched with spellwork.",
  category: "wearable", slot: "focus",
  script: "merge int 3\nmerge maxMp 10",
};

export const ITEMS: Record<string, ItemDef> = {
  health_potion, mana_crystal, haste_potion, cleanse_potion,
  cloth_cap, wizard_hat, leather_robe, silk_robe,
  wooden_staff, fire_staff, bone_dagger, venom_dagger,
  quartz_focus, runed_focus,
};
