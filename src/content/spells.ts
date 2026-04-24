// SPELLS dict — data-only. Engine reads bodies via PRIMITIVES registry.
// Adding a new spell here (with primitives that already exist) requires no
// engine changes.
//
// Scaling note: range and mpCost are FIXED.
// damage / duration / magnitude / radius all scale with caster INT via
// scale() and scaleRadius() in primitives — never here.

import type { PrimitiveName } from "../spells/primitives.js";
import type { HelpMeta } from "../ui/help/types.js";
import type { EffectKind } from "../types.js";
import { MONSTER_TEMPLATES } from "./monsters.js";

export type SpellTargetType = "self" | "ally" | "enemy" | "any" | "tile";

export interface SpellOp {
  op: PrimitiveName;
  args: Record<string, unknown>;
}

export interface Spell {
  name: string;
  description: string;
  targetType: SpellTargetType;
  range: number;      // Chebyshev distance
  mpCost: number;
  body: SpellOp[];
  /** Phase 12: optional help override. If absent, help auto-generates from other fields. */
  help?: HelpMeta;
}

export const SPELLS: Record<string, Spell> = {
  // ── Single-target (projectile) ──────────────────────────────────────────
  bolt: {
    name: "bolt",
    description: "A simple arcane bolt.",
    targetType: "enemy", range: 6, mpCost: 5,
    body: [{ op: "project", args: { damage: 4, visual: "bolt_orange", element: "arcane" } }],
  },
  firebolt: {
    name: "firebolt",
    description: "A blazing bolt that burns its target.",
    targetType: "enemy", range: 6, mpCost: 8,
    body: [
      { op: "project", args: { damage: 3, visual: "bolt_red", element: "fire" } },
      { op: "inflict",  args: { kind: "burning" as EffectKind, duration: 30 } },
    ],
  },
  frost_lance: {
    name: "frost_lance",
    description: "A frost beam that chills and slows its target.",
    targetType: "enemy", range: 6, mpCost: 7,
    body: [
      { op: "project", args: { damage: 3, visual: "beam_frost", element: "frost" } },
      { op: "inflict",  args: { kind: "chill" as EffectKind, duration: 25, magnitude: 2 } },
    ],
  },
  shock_bolt: {
    name: "shock_bolt",
    description: "A crackling bolt that lowers the target's defence.",
    targetType: "enemy", range: 6, mpCost: 7,
    body: [
      { op: "project", args: { damage: 3, visual: "zigzag_yellow", element: "lightning" } },
      { op: "inflict",  args: { kind: "shock" as EffectKind, duration: 25, magnitude: 2 } },
    ],
  },
  venom_dart: {
    name: "venom_dart",
    description: "A venomous dart that poisons its target.",
    targetType: "enemy", range: 6, mpCost: 6,
    body: [
      { op: "project", args: { damage: 2, visual: "arrow_green", element: "poison" } },
      { op: "inflict",  args: { kind: "poison" as EffectKind, duration: 40, magnitude: 1 } },
    ],
  },
  curse: {
    name: "curse",
    description: "Exposes an enemy, increasing damage they receive.",
    targetType: "enemy", range: 3, mpCost: 6,
    body: [
      { op: "inflict", args: { kind: "expose" as EffectKind, duration: 30, magnitude: 25, visual: "beam_violet", element: "arcane" } },
    ],
  },
  mana_leech: {
    name: "mana_leech",
    description: "Drains the target's mana each tick.",
    targetType: "enemy", range: 3, mpCost: 4,
    body: [
      { op: "inflict", args: { kind: "mana_burn" as EffectKind, duration: 20, magnitude: 2, visual: "beam_violet", element: "arcane" } },
    ],
  },

  // ── AoE explosions ───────────────────────────────────────────────────────
  fireball: {
    name: "fireball",
    description: "A fiery explosion that burns all enemies in the blast.",
    targetType: "tile", range: 4, mpCost: 12,
    body: [{ op: "explode", args: { radius: 2, damage: 5, kind: "burning" as EffectKind, duration: 25, visual: "explosion_fire", element: "fire" } }],
  },
  frost_nova: {
    name: "frost_nova",
    description: "An icy burst around the caster that chills nearby foes.",
    targetType: "self", range: 0, mpCost: 11,
    body: [{ op: "explode", args: { radius: 2, damage: 3, kind: "chill" as EffectKind, duration: 25, magnitude: 2, selfCenter: true, visual: "explosion_frost", element: "frost" } }],
  },
  thunderclap: {
    name: "thunderclap",
    description: "A shockwave that shocks adjacent enemies.",
    targetType: "self", range: 0, mpCost: 10,
    body: [{ op: "explode", args: { radius: 1, damage: 4, kind: "shock" as EffectKind, duration: 20, magnitude: 2, selfCenter: true, visual: "explosion_shock", element: "lightning" } }],
  },
  meteor: {
    name: "meteor",
    description: "A massive meteor strike that devastates a large area.",
    targetType: "tile", range: 5, mpCost: 18,
    body: [{ op: "explode", args: { radius: 3, damage: 8, kind: "burning" as EffectKind, duration: 30, visual: "explosion_fire_big", element: "fire" } }],
  },

  // ── Clouds ───────────────────────────────────────────────────────────────
  firewall: {
    name: "firewall",
    description: "Spawns a fire cloud that burns actors passing through.",
    targetType: "tile", range: 4, mpCost: 10,
    body: [{ op: "spawn_cloud", args: { kind: "fire", duration: 50, visual: "cloud_fire", element: "fire" } }],
  },
  poison_cloud: {
    name: "poison_cloud",
    description: "Spawns a toxic cloud that poisons actors in the area.",
    targetType: "tile", range: 4, mpCost: 11,
    body: [{ op: "spawn_cloud", args: { kind: "poison", duration: 60, visual: "cloud_poison", element: "poison" } }],
  },

  // ── Buffs ─────────────────────────────────────────────────────────────────
  bless: {
    name: "bless",
    description: "Hastens an ally.",
    targetType: "ally", range: 1, mpCost: 7,
    body: [{ op: "inflict", args: { kind: "haste" as EffectKind, duration: 40, magnitude: 2, visual: "sparkle_gold", element: "arcane" } }],
  },
  might: {
    name: "might",
    description: "Boosts the caster's attack.",
    targetType: "self", range: 0, mpCost: 6,
    body: [{ op: "inflict", args: { kind: "might" as EffectKind, duration: 30, magnitude: 3, visual: "sparkle_red", element: "arcane" } }],
  },
  iron_skin: {
    name: "iron_skin",
    description: "Hardens the caster's skin, raising defence.",
    targetType: "self", range: 0, mpCost: 6,
    body: [{ op: "inflict", args: { kind: "iron_skin" as EffectKind, duration: 30, magnitude: 3, visual: "barrier_steel", element: "arcane" } }],
  },
  mind_spark: {
    name: "mind_spark",
    description: "Sharpens the mind, boosting spell power.",
    targetType: "self", range: 0, mpCost: 6,
    body: [{ op: "inflict", args: { kind: "power" as EffectKind, duration: 30, magnitude: 3, visual: "sparkle_gold", element: "arcane" } }],
  },
  focus: {
    name: "focus",
    description: "Channels arcane energy to regenerate mana over time.",
    targetType: "self", range: 0, mpCost: 5,
    body: [{ op: "inflict", args: { kind: "mana_regen" as EffectKind, duration: 30, magnitude: 2, visual: "healing_blue", element: "arcane" } }],
  },
  shield: {
    name: "shield",
    description: "Conjures a protective shield that absorbs incoming damage.",
    targetType: "self", range: 0, mpCost: 8,
    body: [{ op: "inflict", args: { kind: "shield" as EffectKind, duration: 40, magnitude: 10, visual: "barrier_cyan", element: "arcane" } }],
  },

  // ── Heal ─────────────────────────────────────────────────────────────────
  heal: {
    name: "heal",
    description: "Restores an ally's health.",
    targetType: "ally", range: 1, mpCost: 5,
    body: [{ op: "heal", args: { amount: 5, visual: "healing_green", element: "arcane" } }],
  },
  // Phase 13.2: summon spells — one per summonable template.
  summon_goblin: {
    name: "summon_goblin",
    description: "Summon a Goblin to fight beside you.",
    targetType: "tile", range: 3, mpCost: 5,
    body: [{ op: "summon", args: { template: "goblin", visual: "summon_portal", element: "arcane" } }],
  },
  summon_skeleton: {
    name: "summon_skeleton",
    description: "Summon a Skeleton to fight beside you.",
    targetType: "tile", range: 3, mpCost: 8,
    body: [{ op: "summon", args: { template: "skeleton", visual: "summon_portal", element: "arcane" } }],
  },
  summon_bat: {
    name: "summon_bat",
    description: "Summon a Bat to harry your enemies.",
    targetType: "tile", range: 3, mpCost: 4,
    body: [{ op: "summon", args: { template: "bat", visual: "summon_portal", element: "arcane" } }],
  },
  summon_cultist: {
    name: "summon_cultist",
    description: "Summon a Cultist to cast spells for you.",
    targetType: "tile", range: 3, mpCost: 12,
    body: [{ op: "summon", args: { template: "cultist", visual: "summon_portal", element: "arcane" } }],
  },
  summon_slime: {
    name: "summon_slime",
    description: "Summon a Slime to absorb blows for you.",
    targetType: "tile", range: 3, mpCost: 10,
    body: [{ op: "summon", args: { template: "slime", visual: "summon_portal", element: "arcane" } }],
  },
};

// ── Load-time validation ─────────────────────────────────────────────────────
// Catches content errors at import rather than silently at cast time.

const _VALID_PRIMITIVE_NAMES = new Set<string>([
  "project", "inflict", "heal", "spawn_cloud", "explode", "summon", "teleport", "push",
]);
const _VALID_EFFECT_KINDS = new Set<string>([
  "burning", "poison", "regen", "haste", "slow",
  "chill", "shock", "expose", "might", "iron_skin",
  "mana_regen", "mana_burn", "power", "shield",
]);

for (const [id, spell] of Object.entries(SPELLS)) {
  for (const op of spell.body) {
    if (!_VALID_PRIMITIVE_NAMES.has(op.op)) {
      throw new Error(`SPELLS['${id}']: unknown primitive '${op.op}'.`);
    }
    if (op.op === "inflict") {
      const kind = op.args.kind;
      if (typeof kind !== "string" || !_VALID_EFFECT_KINDS.has(kind)) {
        throw new Error(`SPELLS['${id}'] op 'inflict': invalid EffectKind '${kind}'.`);
      }
    }
    if (op.op === "summon" && id.startsWith("summon_")) {
      const tid = String(op.args.template ?? "");
      const tpl = MONSTER_TEMPLATES[tid];
      if (!tpl) throw new Error(`Summon spell '${id}': template '${tid}' not found in MONSTER_TEMPLATES.`);
      if (!tpl.summonable) throw new Error(`Summon spell '${id}': template '${tid}' is not summonable.`);
      if (tpl.summonMpCost === undefined) throw new Error(`Summon spell '${id}': template '${tid}' missing summonMpCost.`);
    }
  }
}
