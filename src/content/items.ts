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

// ─── Effect potions ─────────────────────────────────────────────────────────
// 6 new potions (haste_potion already above).

const shield_potion: ItemDef = {
  id: "shield_potion", name: "Shield Potion",
  description: "Grants a magical shield that absorbs damage.",
  kind: "consumable", level: 1,
  useTarget: "ally", range: 4, polarity: "buff",
  body: [{ op: "inflict", args: { kind: "shield" as EffectKind, duration: 30, magnitude: 6 } }],
};
const might_potion: ItemDef = {
  id: "might_potion", name: "Might Potion",
  description: "Increases attack power briefly.",
  kind: "consumable", level: 1,
  useTarget: "ally", range: 4, polarity: "buff",
  body: [{ op: "inflict", args: { kind: "might" as EffectKind, duration: 30, magnitude: 3 } }],
};
const iron_skin_potion: ItemDef = {
  id: "iron_skin_potion", name: "Iron Skin Potion",
  description: "Hardens the skin against physical blows.",
  kind: "consumable", level: 1,
  useTarget: "ally", range: 4, polarity: "buff",
  body: [{ op: "inflict", args: { kind: "iron_skin" as EffectKind, duration: 30, magnitude: 2 } }],
};
const regen_potion: ItemDef = {
  id: "regen_potion", name: "Regen Potion",
  description: "Slowly regenerates HP over time.",
  kind: "consumable", level: 1,
  useTarget: "ally", range: 4, polarity: "buff",
  body: [{ op: "inflict", args: { kind: "regen" as EffectKind, duration: 30, magnitude: 2 } }],
};
const power_potion: ItemDef = {
  id: "power_potion", name: "Power Potion",
  description: "Amplifies spell damage briefly.",
  kind: "consumable", level: 1,
  useTarget: "ally", range: 4, polarity: "buff",
  body: [{ op: "inflict", args: { kind: "power" as EffectKind, duration: 30, magnitude: 3 } }],
};
const focus_potion: ItemDef = {
  id: "focus_potion", name: "Focus Potion",
  description: "Restores mana flow.",
  kind: "consumable", level: 1,
  useTarget: "ally", range: 4, polarity: "buff",
  body: [{ op: "inflict", args: { kind: "mana_regen" as EffectKind, duration: 30, magnitude: 3 } }],
};

// ─── Elixirs (permanent boosts) ──────────────────────────────────────────────

const vitality_elixir: ItemDef = {
  id: "vitality_elixir", name: "Vitality Elixir",
  description: "Permanently increases max HP by 5.",
  kind: "consumable", level: 2,
  useTarget: "self", range: 0, polarity: "buff",
  body: [{ op: "permanent_boost", args: { stat: "hp", amount: 5 } }],
};
const insight_elixir: ItemDef = {
  id: "insight_elixir", name: "Insight Elixir",
  description: "Permanently increases intelligence by 2.",
  kind: "consumable", level: 2,
  useTarget: "self", range: 0, polarity: "buff",
  body: [{ op: "permanent_boost", args: { stat: "int", amount: 2 } }],
};
const might_elixir: ItemDef = {
  id: "might_elixir", name: "Might Elixir",
  description: "Permanently increases attack power by 2.",
  kind: "consumable", level: 2,
  useTarget: "self", range: 0, polarity: "buff",
  body: [{ op: "permanent_boost", args: { stat: "atk", amount: 2 } }],
};
const guard_elixir: ItemDef = {
  id: "guard_elixir", name: "Guard Elixir",
  description: "Permanently increases defence by 2.",
  kind: "consumable", level: 2,
  useTarget: "self", range: 0, polarity: "buff",
  body: [{ op: "permanent_boost", args: { stat: "def", amount: 2 } }],
};
const swift_elixir: ItemDef = {
  id: "swift_elixir", name: "Swift Elixir",
  description: "Permanently increases speed by 2.",
  kind: "consumable", level: 2,
  useTarget: "self", range: 0, polarity: "buff",
  body: [{ op: "permanent_boost", args: { stat: "speed", amount: 2 } }],
};
const focus_elixir: ItemDef = {
  id: "focus_elixir", name: "Focus Elixir",
  description: "Permanently increases max mana by 5.",
  kind: "consumable", level: 2,
  useTarget: "self", range: 0, polarity: "buff",
  body: [{ op: "permanent_boost", args: { stat: "mp", amount: 5 } }],
};

// ─── Bombs (tile-targeted) ────────────────────────────────────────────────────

const fire_bomb: ItemDef = {
  id: "fire_bomb", name: "Fire Bomb",
  description: "Hurls a flask that erupts into a fire cloud.",
  kind: "consumable", level: 1,
  useTarget: "tile", range: 5, polarity: "debuff",
  body: [{ op: "spawn_cloud", args: { kind: "fire", duration: 8, visual: "cloud_fire" } }],
};
const frost_bomb: ItemDef = {
  id: "frost_bomb", name: "Frost Bomb",
  description: "Shatters on impact, creating a frost cloud.",
  kind: "consumable", level: 1,
  useTarget: "tile", range: 5, polarity: "debuff",
  body: [{ op: "spawn_cloud", args: { kind: "frost", duration: 8, visual: "cloud_frost" } }],
};
const shock_bomb: ItemDef = {
  id: "shock_bomb", name: "Shock Bomb",
  description: "Cracks into a crackling shock cloud.",
  kind: "consumable", level: 1,
  useTarget: "tile", range: 5, polarity: "debuff",
  body: [{ op: "spawn_cloud", args: { kind: "shock", duration: 8, visual: "cloud_shock" } }],
};
const smoke_bomb: ItemDef = {
  id: "smoke_bomb", name: "Smoke Bomb",
  description: "Fills the area with blinding smoke.",
  kind: "consumable", level: 1,
  useTarget: "tile", range: 5, polarity: "debuff",
  body: [{ op: "spawn_cloud", args: { kind: "smoke", duration: 8, visual: "cloud_smoke" } }],
};

// ─── Scrolls (auto-consumed at room exit) ────────────────────────────────────
// One scroll per learnable spell. Summon spells are not on scrolls
// (they are monster-only). Scroll id: "scroll_<spell_id>".

const scroll_bolt: ItemDef = {
  id: "scroll_bolt", name: "Scroll of Bolt",
  description: "Teaches the arcane bolt spell.", kind: "scroll", level: 1, spell: "bolt",
};
const scroll_firebolt: ItemDef = {
  id: "scroll_firebolt", name: "Scroll of Firebolt",
  description: "Teaches the firebolt spell.", kind: "scroll", level: 1, spell: "firebolt",
};
const scroll_frost_lance: ItemDef = {
  id: "scroll_frost_lance", name: "Scroll of Frost Lance",
  description: "Teaches the frost lance spell.", kind: "scroll", level: 1, spell: "frost_lance",
};
const scroll_shock_bolt: ItemDef = {
  id: "scroll_shock_bolt", name: "Scroll of Shock Bolt",
  description: "Teaches the shock bolt spell.", kind: "scroll", level: 1, spell: "shock_bolt",
};
const scroll_venom_dart: ItemDef = {
  id: "scroll_venom_dart", name: "Scroll of Venom Dart",
  description: "Teaches the venom dart spell.", kind: "scroll", level: 1, spell: "venom_dart",
};
const scroll_curse: ItemDef = {
  id: "scroll_curse", name: "Scroll of Curse",
  description: "Teaches the curse spell.", kind: "scroll", level: 1, spell: "curse",
};
const scroll_mana_leech: ItemDef = {
  id: "scroll_mana_leech", name: "Scroll of Mana Leech",
  description: "Teaches the mana leech spell.", kind: "scroll", level: 1, spell: "mana_leech",
};
const scroll_fireball: ItemDef = {
  id: "scroll_fireball", name: "Scroll of Fireball",
  description: "Teaches the fireball spell.", kind: "scroll", level: 2, spell: "fireball",
};
const scroll_frost_nova: ItemDef = {
  id: "scroll_frost_nova", name: "Scroll of Frost Nova",
  description: "Teaches the frost nova spell.", kind: "scroll", level: 2, spell: "frost_nova",
};
const scroll_thunderclap: ItemDef = {
  id: "scroll_thunderclap", name: "Scroll of Thunderclap",
  description: "Teaches the thunderclap spell.", kind: "scroll", level: 2, spell: "thunderclap",
};
const scroll_meteor: ItemDef = {
  id: "scroll_meteor", name: "Scroll of Meteor",
  description: "Teaches the meteor spell.", kind: "scroll", level: 3, spell: "meteor",
};
const scroll_firewall: ItemDef = {
  id: "scroll_firewall", name: "Scroll of Firewall",
  description: "Teaches the firewall spell.", kind: "scroll", level: 2, spell: "firewall",
};
const scroll_poison_cloud: ItemDef = {
  id: "scroll_poison_cloud", name: "Scroll of Poison Cloud",
  description: "Teaches the poison cloud spell.", kind: "scroll", level: 2, spell: "poison_cloud",
};
const scroll_bless: ItemDef = {
  id: "scroll_bless", name: "Scroll of Bless",
  description: "Teaches the bless spell.", kind: "scroll", level: 1, spell: "bless",
};
const scroll_might: ItemDef = {
  id: "scroll_might", name: "Scroll of Might",
  description: "Teaches the might spell.", kind: "scroll", level: 1, spell: "might",
};
const scroll_iron_skin: ItemDef = {
  id: "scroll_iron_skin", name: "Scroll of Iron Skin",
  description: "Teaches the iron skin spell.", kind: "scroll", level: 1, spell: "iron_skin",
};
const scroll_mind_spark: ItemDef = {
  id: "scroll_mind_spark", name: "Scroll of Mind Spark",
  description: "Teaches the mind spark spell.", kind: "scroll", level: 1, spell: "mind_spark",
};
const scroll_focus: ItemDef = {
  id: "scroll_focus", name: "Scroll of Focus",
  description: "Teaches the focus spell.", kind: "scroll", level: 1, spell: "focus",
};
const scroll_shield: ItemDef = {
  id: "scroll_shield", name: "Scroll of Shield",
  description: "Teaches the shield spell.", kind: "scroll", level: 1, spell: "shield",
};
const scroll_heal: ItemDef = {
  id: "scroll_heal", name: "Scroll of Heal",
  description: "Teaches the heal spell.", kind: "scroll", level: 1, spell: "heal",
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
  // Flat consumables (direct heal/restore)
  health_potion, mana_crystal,
  // Effect potions (buffs)
  haste_potion, shield_potion, might_potion, iron_skin_potion,
  regen_potion, power_potion, focus_potion,
  // Cleanse
  cleanse_potion,
  // Elixirs (permanent boosts)
  vitality_elixir, insight_elixir, might_elixir, guard_elixir,
  swift_elixir, focus_elixir,
  // Bombs (tile-targeted clouds)
  fire_bomb, frost_bomb, shock_bomb, smoke_bomb,
  // Scrolls
  scroll_bolt, scroll_firebolt, scroll_frost_lance, scroll_shock_bolt,
  scroll_venom_dart, scroll_curse, scroll_mana_leech,
  scroll_fireball, scroll_frost_nova, scroll_thunderclap,
  scroll_meteor, scroll_firewall, scroll_poison_cloud,
  scroll_bless, scroll_might, scroll_iron_skin, scroll_mind_spark,
  scroll_focus, scroll_shield, scroll_heal,
  // Equipment
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
