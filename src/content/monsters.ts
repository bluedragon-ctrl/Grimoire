// Phase 14: monster template registry. Expanded from the Phase-11 starter
// roster (5 templates) to a 30-monster lineup keyed to the standalone
// sprites in render-monsters.js.
//
// Each entry is data: stats, a sprite key, optional spells/loot/inventory,
// and an AI script. Scripts come from the shared archetype library
// (src/content/ai-archetypes.ts) instantiated with per-monster spell names
// and notify flavour, or — for one-off behaviour — a raw DSL string. The
// AST is parsed once at module load and cached per template; a parse error
// here is a DEV-TIME hard fail, not a runtime script failure.
//
// Stats stored on the template are the LEVEL-1 baseline. createActor()
// applies scaleByLevel(stat, template.level) to hp / maxHp / mp / maxMp /
// atk / def / int at spawn — speed and immunities/family do NOT scale.
//
// All monster spawns go through `createActor(templateId, pos, id)` — do
// not hand-build monster Actors.

import type { Actor, EffectKind, ItemInstance, Pos, Script } from "../types.js";
import type { HelpMeta } from "../ui/help/types.js";
import { parse } from "../lang/parser.js";
import { scaleByLevel } from "./scaling.js";
import { AI_ARCHETYPES, instantiateArchetype } from "./ai-archetypes.js";
import { ITEMS } from "./items.js";
// Note: knownSpells are validated against SPELLS at runtime by validateCast
// (and by spells.ts on summon-template lookup). Importing SPELLS here would
// create a top-level cycle with spells.ts. Don't.

export type MonsterFamily =
  | "undead" | "beast" | "humanoid" | "elemental" | "construct" | "demon";

export interface MonsterStats {
  hp: number;
  maxHp: number;
  speed: number;
  atk?: number;
  def?: number;
  int?: number;
  mp?: number;
  maxMp?: number;
}

export interface MonsterTemplate {
  id: string;
  name: string;
  visual: string;
  baseVisual?: string;
  /** Phase 14: family axis — gates immunity-thematic balancing and loot. */
  family: MonsterFamily;
  /** Phase 14: tier level (1–10). Drives scaleByLevel at spawn. */
  level: number;
  /** Stats at level 1 baseline; createActor scales them at spawn. */
  stats: MonsterStats;
  knownSpells?: string[];
  /** Reference into AI_ARCHETYPES. Required unless `ai` (raw) is supplied. */
  aiArchetype?: string;
  /** Substitution variables for the archetype (e.g. SPELL → "firebolt"). */
  aiVars?: Record<string, string>;
  /** Raw DSL escape hatch — overrides aiArchetype when set. */
  ai?: string;
  loot?: string;
  /** Phase 14: optional render-color override merged over default `colors`. */
  tint?: Record<string, string>;
  /** @deprecated alias for tint kept for the existing wire-adapter path. */
  colors?: Record<string, string>;
  /** Phase 14: incoming effects of these kinds are silently dropped. */
  immunities?: EffectKind[];
  /** Phase 14: items the monster carries at spawn (consumables only). */
  startingInventory?: { itemId: string; count?: number }[];
  /** Phase 14: fired after Died, before corpse cleanup. Currently supports
   *  summon-on-death (slime split). Loop guard: spawned summons set
   *  summoned=true so their loot is suppressed and the existing
   *  appendDeathDrops cascade does not target them via owner. */
  onDeath?: { summon?: { template: string; count: number } };
  /** Phase 14: reserved flag for the future boss-room phase. No behaviour. */
  boss?: boolean;
  /** Phase 12: optional help override. */
  help?: HelpMeta;
  // Phase 13.2 — preserved.
  summonable?: boolean;
  summonMpCost?: number;
}

// ──────────────────────────── flavour banks ────────────────────────────

const FLAVOUR_LICH = [
  "The lich's whispers chill the air.",
  "A page of your spellbook curls and blackens.",
];
const FLAVOUR_DARK_WIZARD = [
  "Shadows pool around the dark wizard.",
  "The dark wizard's eyes glint with malice.",
];
const FLAVOUR_VAMPIRE = [
  "The vampire bares its fangs.",
  "A cold hunger meets your gaze.",
];
const FLAVOUR_DRAGON = [
  "The dragon's eyes track you.",
  "Heat rolls off the dragon in waves.",
];
const FLAVOUR_CULTIST = [
  "The cultist mutters dark verses.",
  "Incense and copper hang in the air.",
];
const FLAVOUR_MAGE = [
  "The mage weaves a quick sigil.",
  "Arcane motes spiral around the mage.",
];

// Compose: kite-and-cast loop with a 5%-chance flavour line each iteration.
// Used by intelligent monsters that wouldn't otherwise reach their flavour
// bank from the shared archetype library.
function withCasterNotify(spell: string, flavour: string[]): string {
  const f0 = flavour[0]!;
  const f1 = flavour[1]!;
  return `
while len(enemies()) > 0:
  foe = enemies()[0]
  if chance(5):
    pick = random(2)
    if pick == 0:
      notify("${f0}")
    else:
      notify("${f1}")
  if me.can_cast("${spell}", foe):
    cast("${spell}", foe)
  elif me.distance_to(foe) <= 2:
    flee(foe)
  else:
    approach(foe)
halt
`;
}

// Vampire — melee + occasional mana_leech + flavour.
const VAMPIRE_AI = `
while len(enemies()) > 0:
  foe = enemies()[0]
  if chance(5):
    pick = random(2)
    if pick == 0:
      notify("${FLAVOUR_VAMPIRE[0]}")
    else:
      notify("${FLAVOUR_VAMPIRE[1]}")
  if me.can_cast("mana_leech", foe) and chance(40):
    cast("mana_leech", foe)
  elif me.adjacent_to(foe):
    attack(foe)
  else:
    approach(foe)
halt
`;

// Dragon — flavour + every-3rd-turn fireball.
const DRAGON_AI = `
counter = 0
while len(enemies()) > 0:
  foe = enemies()[0]
  if chance(5):
    pick = random(2)
    if pick == 0:
      notify("${FLAVOUR_DRAGON[0]}")
    else:
      notify("${FLAVOUR_DRAGON[1]}")
  counter = counter + 1
  if counter % 3 == 0 and me.can_cast("fireball", foe):
    cast("fireball", foe)
  elif me.adjacent_to(foe):
    attack(foe)
  else:
    approach(foe)
halt
`;

// Lich — kite + 4-spell rotation + 60% cast gate + flavour.
const LICH_AI = `
while len(enemies()) > 0:
  foe = enemies()[0]
  if chance(5):
    pick = random(2)
    if pick == 0:
      notify("${FLAVOUR_LICH[0]}")
    else:
      notify("${FLAVOUR_LICH[1]}")
  pick = random(4)
  if chance(60) and pick == 0 and me.can_cast("firebolt", foe):
    cast("firebolt", foe)
  elif chance(60) and pick == 1 and me.can_cast("frost_lance", foe):
    cast("frost_lance", foe)
  elif chance(60) and pick == 2 and me.can_cast("curse", foe):
    cast("curse", foe)
  elif chance(60) and pick == 3 and me.can_cast("shock_bolt", foe):
    cast("shock_bolt", foe)
  elif me.distance_to(foe) <= 2:
    flee(foe)
  else:
    approach(foe)
halt
`;

// Goblin — melee + may chug a might potion when wounded.
const GOBLIN_AI = `
while len(enemies()) > 0:
  foe = enemies()[0]
  if me.hp * 2 < me.maxHp and not me.has_effect("might"):
    use("might_potion")
  if me.adjacent_to(foe):
    attack(foe)
  else:
    approach(foe)
halt
`;

// Knight — quaff might THEN iron_skin opportunistically.
const KNIGHT_AI = `
while len(enemies()) > 0:
  foe = enemies()[0]
  if not me.has_effect("might"):
    use("might_potion")
  elif not me.has_effect("iron_skin"):
    use("iron_skin_potion")
  if me.adjacent_to(foe):
    attack(foe)
  else:
    approach(foe)
halt
`;

// Orc knight — pop iron_skin once when threatened.
const ORC_KNIGHT_AI = `
while len(enemies()) > 0:
  foe = enemies()[0]
  if not me.has_effect("iron_skin") and me.distance_to(foe) <= 3:
    use("iron_skin_potion")
  if me.adjacent_to(foe):
    attack(foe)
  else:
    approach(foe)
halt
`;

// ──────────────────────────── templates ────────────────────────────

const RAW_TEMPLATES: MonsterTemplate[] = [
  // ── T1 (level 1–2) ─────────────────────────────────────────────────
  {
    id: "rat", name: "Rat", visual: "rat", family: "beast", level: 1,
    stats: { hp: 6, maxHp: 6, speed: 12, atk: 1 },
    aiArchetype: "melee_chase_flee",
  },
  {
    id: "bat", name: "Bat", visual: "bat", family: "beast", level: 1,
    stats: { hp: 4, maxHp: 4, speed: 12, atk: 1 },
    aiArchetype: "hit_and_run",
    summonable: true, summonMpCost: 4,
  },
  {
    id: "giant_snail", name: "Giant Snail", visual: "giant_snail", family: "beast", level: 2,
    stats: { hp: 14, maxHp: 14, speed: 6, atk: 2, def: 1 },
    aiArchetype: "slow_chase",
  },
  {
    id: "slime", name: "Slime", visual: "slime", family: "beast", level: 1,
    stats: { hp: 12, maxHp: 12, speed: 7, atk: 2 },
    aiArchetype: "melee_chase",
    onDeath: { summon: { template: "lesser_slime", count: 2 } },
    loot: "slime_loot",
    summonable: true, summonMpCost: 10,
  },
  {
    id: "lesser_slime", name: "Lesser Slime", visual: "slime", family: "beast", level: 1,
    stats: { hp: 6, maxHp: 6, speed: 7, atk: 1 },
    aiArchetype: "melee_chase",
    // Half stats, no further split — note: no onDeath here.
    tint: { body: "#88dd88" },
  },
  {
    id: "mushroom", name: "Mushroom", visual: "mushroom", family: "construct", level: 2,
    stats: { hp: 10, maxHp: 10, speed: 0, atk: 0, mp: 12, maxMp: 12, int: 2 },
    knownSpells: ["poison_cloud"],
    aiArchetype: "mushroom_passive",
  },
  {
    id: "spider", name: "Spider", visual: "spider", family: "beast", level: 2,
    stats: { hp: 8, maxHp: 8, speed: 11, atk: 2, mp: 8, maxMp: 8, int: 2 },
    knownSpells: ["venom_dart"],
    aiArchetype: "kite_and_cast", aiVars: { SPELL: "venom_dart" },
    immunities: ["poison"],
  },

  // ── T2 (level 3–4) ─────────────────────────────────────────────────
  {
    id: "goblin", name: "Goblin", visual: "skeleton", family: "humanoid", level: 3,
    stats: { hp: 16, maxHp: 16, speed: 10, atk: 3 },
    ai: GOBLIN_AI,
    startingInventory: [{ itemId: "might_potion" }],
    loot: "goblin_loot",
    summonable: true, summonMpCost: 5,
  },
  {
    id: "zombie", name: "Zombie", visual: "zombie", family: "undead", level: 3,
    stats: { hp: 22, maxHp: 22, speed: 7, atk: 3, def: 1 },
    aiArchetype: "slow_chase",
    immunities: ["poison", "mana_burn"],
  },
  {
    id: "skeleton", name: "Skeleton", visual: "skeleton", family: "undead", level: 3,
    stats: { hp: 18, maxHp: 18, speed: 10, atk: 3, def: 2 },
    aiArchetype: "melee_chase",
    immunities: ["poison", "mana_burn"],
    loot: "skeleton_loot",
    summonable: true, summonMpCost: 8,
  },
  {
    id: "skeleton_archer", name: "Skeleton Archer", visual: "skeleton_archer", family: "undead", level: 4,
    stats: { hp: 18, maxHp: 18, speed: 10, atk: 2, def: 1, mp: 12, maxMp: 12, int: 3 },
    knownSpells: ["bolt"],
    aiArchetype: "kite_and_cast", aiVars: { SPELL: "bolt" },
    immunities: ["poison", "mana_burn"],
  },
  {
    id: "orc_warrior", name: "Orc Warrior", visual: "orc_warrior", family: "humanoid", level: 4,
    stats: { hp: 24, maxHp: 24, speed: 9, atk: 4, def: 2 },
    aiArchetype: "melee_chase",
  },
  {
    id: "cultist", name: "Cultist", visual: "dark_wizard", family: "humanoid", level: 3,
    stats: { hp: 16, maxHp: 16, speed: 10, atk: 2, mp: 18, maxMp: 18, int: 4 },
    knownSpells: ["firebolt"],
    ai: withCasterNotify("firebolt", FLAVOUR_CULTIST),
    startingInventory: [{ itemId: "focus_potion" }],
    loot: "cultist_loot",
    summonable: true, summonMpCost: 12,
  },

  // ── T3 (level 5–6) ─────────────────────────────────────────────────
  {
    id: "ghost", name: "Ghost", visual: "ghost", family: "undead", level: 5,
    // Incorporeal — very high def, low atk. def reduces melee only, so spells
    // still bite. See [docs/monsters.md].
    stats: { hp: 28, maxHp: 28, speed: 10, atk: 3, def: 8 },
    aiArchetype: "melee_chase",
    immunities: ["poison", "mana_burn", "chill"],
  },
  {
    id: "wisp", name: "Wisp", visual: "wisp", family: "elemental", level: 5,
    stats: { hp: 26, maxHp: 26, speed: 12, atk: 3, mp: 14, maxMp: 14, int: 5 },
    knownSpells: ["shock_bolt"],
    aiArchetype: "kite_and_cast", aiVars: { SPELL: "shock_bolt" },
  },
  {
    id: "serpent", name: "Serpent", visual: "serpent", family: "beast", level: 5,
    stats: { hp: 30, maxHp: 30, speed: 10, atk: 4, def: 2, mp: 10, maxMp: 10, int: 4 },
    knownSpells: ["venom_dart"],
    aiArchetype: "kite_and_cast", aiVars: { SPELL: "venom_dart" },
    immunities: ["poison"],
  },
  {
    id: "orc_knight", name: "Orc Knight", visual: "orc_knight", family: "humanoid", level: 6,
    stats: { hp: 36, maxHp: 36, speed: 9, atk: 4, def: 6 },
    ai: ORC_KNIGHT_AI,
    startingInventory: [{ itemId: "iron_skin_potion" }],
  },
  {
    id: "gargoyle", name: "Gargoyle", visual: "gargoyle", family: "construct", level: 6,
    stats: { hp: 32, maxHp: 32, speed: 9, atk: 4, def: 4 },
    aiArchetype: "melee_chase",
    immunities: ["chill", "poison", "burning"],
  },
  {
    id: "wraith", name: "Wraith", visual: "wraith", family: "undead", level: 6,
    stats: { hp: 30, maxHp: 30, speed: 10, atk: 3, mp: 16, maxMp: 16, int: 6 },
    knownSpells: ["curse"],
    aiArchetype: "kite_and_cast", aiVars: { SPELL: "curse" },
    immunities: ["poison", "mana_burn", "chill"],
  },

  // ── T4 (level 7–8) ─────────────────────────────────────────────────
  {
    id: "knight", name: "Knight", visual: "knight", family: "humanoid", level: 7,
    stats: { hp: 50, maxHp: 50, speed: 9, atk: 6, def: 6 },
    ai: KNIGHT_AI,
    startingInventory: [
      { itemId: "might_potion" },
      { itemId: "iron_skin_potion" },
    ],
  },
  {
    id: "troll", name: "Troll", visual: "troll", family: "beast", level: 7,
    stats: { hp: 56, maxHp: 56, speed: 8, atk: 6, def: 3, mp: 12, maxMp: 12, int: 4 },
    knownSpells: ["focus"],   // self-buff regen-of-mana isn't quite regen; use regen via item
    // Use regen_brute archetype with a self-cast that keeps mana flowing —
    // the spec calls for auto-regen via inflict + chance gate; a focus
    // self-cast plus melee lets the troll keep casting out of combat too.
    // For HP regen specifically the troll relies on its huge hp pool +
    // monsters with regen_potion in the future; we model the "regenerating"
    // keyword as periodic self-buff (focus → mana → spell loop is light).
    aiArchetype: "regen_brute", aiVars: { SPELL: "focus" },
    startingInventory: [{ itemId: "regen_potion" }],
  },
  {
    id: "mage", name: "Mage", visual: "mage", family: "humanoid", level: 8,
    stats: { hp: 44, maxHp: 44, speed: 10, atk: 4, mp: 22, maxMp: 22, int: 8 },
    knownSpells: ["firebolt", "frost_lance", "shock_bolt"],
    ai: (() => {
      const base = instantiateArchetype("erratic_caster", {
        SPELL_A: "firebolt", SPELL_B: "frost_lance", SPELL_C: "shock_bolt",
      });
      return base.replace(
        "  pick = random(3)",
        `  if chance(5):
    pickF = random(2)
    if pickF == 0:
      notify("${FLAVOUR_MAGE[0]}")
    else:
      notify("${FLAVOUR_MAGE[1]}")
  pick = random(3)`,
      );
    })(),
    startingInventory: [{ itemId: "power_potion" }],
  },
  {
    id: "vampire", name: "Vampire", visual: "vampire", family: "undead", level: 8,
    stats: { hp: 50, maxHp: 50, speed: 10, atk: 6, def: 3, mp: 16, maxMp: 16, int: 6 },
    knownSpells: ["mana_leech"],
    ai: VAMPIRE_AI,
    immunities: ["poison", "mana_burn"],
  },
  {
    id: "golem", name: "Golem", visual: "golem", family: "construct", level: 8,
    stats: { hp: 60, maxHp: 60, speed: 6, atk: 7, def: 8 },
    aiArchetype: "slow_chase",
    immunities: ["chill", "poison", "burning"],
  },
  {
    id: "orc_mage", name: "Orc Mage", visual: "orc_mage", family: "humanoid", level: 7,
    stats: { hp: 42, maxHp: 42, speed: 9, atk: 4, mp: 20, maxMp: 20, int: 7 },
    knownSpells: ["fireball"],
    aiArchetype: "kite_and_cast", aiVars: { SPELL: "fireball" },
  },
  {
    id: "dark_wizard", name: "Dark Wizard", visual: "dark_wizard", family: "humanoid", level: 8,
    stats: { hp: 44, maxHp: 44, speed: 10, atk: 3, mp: 24, maxMp: 24, int: 9 },
    knownSpells: ["curse", "shock_bolt", "firebolt"],
    ai: (() => {
      const base = instantiateArchetype("erratic_caster", {
        SPELL_A: "curse", SPELL_B: "shock_bolt", SPELL_C: "firebolt",
      });
      // Splice notify hook into the loop body — keep the existing structure.
      return base.replace(
        "  pick = random(3)",
        `  if chance(5):
    pickF = random(2)
    if pickF == 0:
      notify("${FLAVOUR_DARK_WIZARD[0]}")
    else:
      notify("${FLAVOUR_DARK_WIZARD[1]}")
  pick = random(3)`,
      );
    })(),
  },

  // ── T5 (level 9–10) ────────────────────────────────────────────────
  {
    id: "fire_elemental", name: "Fire Elemental", visual: "fire_elemental", family: "elemental", level: 9,
    stats: { hp: 70, maxHp: 70, speed: 9, atk: 7, def: 4, mp: 24, maxMp: 24, int: 10 },
    knownSpells: ["fire_aura_pulse"],
    aiArchetype: "aura_brawler", aiVars: { SPELL: "fire_aura_pulse" },
    immunities: ["burning"],
  },
  {
    id: "water_elemental", name: "Water Elemental", visual: "water_elemental", family: "elemental", level: 9,
    stats: { hp: 70, maxHp: 70, speed: 9, atk: 6, def: 5, mp: 24, maxMp: 24, int: 10 },
    knownSpells: ["frost_aura_pulse"],
    aiArchetype: "aura_brawler", aiVars: { SPELL: "frost_aura_pulse" },
    immunities: ["chill"],
  },
  {
    id: "air_elemental", name: "Air Elemental", visual: "air_elemental", family: "elemental", level: 9,
    stats: { hp: 60, maxHp: 60, speed: 13, atk: 6, def: 3, mp: 22, maxMp: 22, int: 10 },
    knownSpells: ["shock_bolt"],
    aiArchetype: "kite_and_cast", aiVars: { SPELL: "shock_bolt" },
    immunities: ["shock"],
  },
  {
    id: "earth_elemental", name: "Earth Elemental", visual: "earth_elemental", family: "elemental", level: 10,
    stats: { hp: 90, maxHp: 90, speed: 6, atk: 8, def: 8 },
    aiArchetype: "slow_chase",
    immunities: ["poison", "chill"],
  },
  {
    id: "crystal_elemental", name: "Crystal Elemental", visual: "crystal_elemental", family: "elemental", level: 9,
    stats: { hp: 64, maxHp: 64, speed: 9, atk: 5, def: 6, mp: 22, maxMp: 22, int: 9 },
    knownSpells: ["frost_lance"],
    aiArchetype: "kite_and_cast", aiVars: { SPELL: "frost_lance" },
    immunities: ["chill", "poison", "burning"],
  },
  {
    id: "lich", name: "Lich", visual: "lich", family: "undead", level: 10,
    stats: { hp: 70, maxHp: 70, speed: 9, atk: 4, def: 4, mp: 28, maxMp: 28, int: 14 },
    knownSpells: ["firebolt", "frost_lance", "curse", "shock_bolt"],
    ai: LICH_AI,
    immunities: ["poison", "mana_burn", "chill"],
  },
  {
    id: "dragon", name: "Dragon", visual: "dragon", family: "beast", level: 10,
    stats: { hp: 100, maxHp: 100, speed: 9, atk: 10, def: 6, mp: 24, maxMp: 24, int: 8 },
    knownSpells: ["fireball"],
    ai: DRAGON_AI,
    immunities: ["burning"],
  },
];

// ──────────────────────────── registry validation ────────────────────────────
//
// Load-time validation. Every error here is a content bug; we want bad
// content to crash boot, not mid-game.

const _VALID_FAMILIES: ReadonlySet<MonsterFamily> = new Set([
  "undead", "beast", "humanoid", "elemental", "construct", "demon",
]);
const _VALID_EFFECT_KINDS = new Set<string>([
  "burning", "poison", "regen", "haste", "slow",
  "chill", "shock", "expose", "might", "iron_skin",
  "mana_regen", "mana_burn", "power", "shield", "blinded",
]);

function resolveAi(tpl: MonsterTemplate): string {
  if (tpl.ai) return tpl.ai;
  if (!tpl.aiArchetype) {
    throw new Error(`Monster '${tpl.id}': must specify either 'ai' or 'aiArchetype'.`);
  }
  if (!(tpl.aiArchetype in AI_ARCHETYPES)) {
    throw new Error(`Monster '${tpl.id}': unknown aiArchetype '${tpl.aiArchetype}'.`);
  }
  return instantiateArchetype(tpl.aiArchetype, tpl.aiVars ?? {});
}

for (const tpl of RAW_TEMPLATES) {
  if (!tpl.visual) throw new Error(`Monster '${tpl.id}': missing 'visual'.`);
  if (!_VALID_FAMILIES.has(tpl.family)) {
    throw new Error(`Monster '${tpl.id}': invalid family '${tpl.family}'.`);
  }
  if (typeof tpl.level !== "number" || tpl.level < 1) {
    throw new Error(`Monster '${tpl.id}': level must be a positive integer.`);
  }
  if (tpl.stats.atk === undefined) {
    throw new Error(`Monster '${tpl.id}': missing 'stats.atk'.`);
  }
  if (tpl.summonable && tpl.summonMpCost === undefined) {
    throw new Error(`Monster '${tpl.id}': summonable but missing summonMpCost.`);
  }
  for (const k of tpl.immunities ?? []) {
    if (!_VALID_EFFECT_KINDS.has(k)) {
      throw new Error(`Monster '${tpl.id}': unknown immunity '${k}'.`);
    }
  }
  for (const entry of tpl.startingInventory ?? []) {
    if (!ITEMS[entry.itemId]) {
      throw new Error(`Monster '${tpl.id}': startingInventory item '${entry.itemId}' not found.`);
    }
    if (ITEMS[entry.itemId]!.kind !== "consumable") {
      throw new Error(`Monster '${tpl.id}': startingInventory '${entry.itemId}' is not a consumable.`);
    }
  }
  if (tpl.onDeath?.summon) {
    const childId = tpl.onDeath.summon.template;
    if (!RAW_TEMPLATES.some(t => t.id === childId)) {
      throw new Error(`Monster '${tpl.id}': onDeath.summon.template '${childId}' not in registry.`);
    }
  }
}

// ──────────────────────────── parse cache ────────────────────────────

const SCRIPT_CACHE: Record<string, Script> = {};
for (const tpl of RAW_TEMPLATES) {
  try {
    const src = resolveAi(tpl);
    // Backfill tpl.ai with the resolved source so help-system catalogs
    // (which assume `template.ai` is always a string) work uniformly.
    tpl.ai = src;
    SCRIPT_CACHE[tpl.id] = parse(src);
  } catch (err) {
    throw new Error(
      `Monster '${tpl.id}' failed to parse its AI script: ${(err as Error).message}`,
    );
  }
}

export const MONSTER_TEMPLATES: Record<string, MonsterTemplate> = Object.freeze(
  Object.fromEntries(RAW_TEMPLATES.map(t => [t.id, t])),
);

export function scriptFor(id: string): Script | undefined {
  return SCRIPT_CACHE[id];
}

// ──────────────────────────── actor factory ────────────────────────────

// Local instance-id counter for monster startingInventory. Independent of
// items/execute::mintInstance to avoid a circular import (spells/primitives →
// monsters → items/execute). Module-level lifetime is intentional: each
// createActor call needs a fresh unique id across all monsters generated in a
// session, and ItemInstance ids do not appear in determinism-sensitive event
// payloads (they're opaque handles).
let _bagInstanceSeq = 1;
function mintBagInstance(defId: string): ItemInstance {
  return { id: `m${_bagInstanceSeq++}_${defId}`, defId };
}

export function createActor(templateId: string, pos: Pos, id: string): Actor {
  const tpl = MONSTER_TEMPLATES[templateId];
  if (!tpl) throw new Error(`Unknown monster template '${templateId}'.`);
  const script = SCRIPT_CACHE[templateId];
  if (!script) throw new Error(`No cached script for '${templateId}'.`);

  const s = tpl.stats;
  const lvl = tpl.level;
  const actor: Actor = {
    id,
    kind: tpl.id,
    isHero: false,
    faction: "enemy",
    hp:    scaleByLevel(s.hp, lvl),
    maxHp: scaleByLevel(s.maxHp, lvl),
    speed: s.speed,                        // not scaled — design rule.
    energy: 0,
    pos: { ...pos },
    script,
    alive: s.hp > 0,
    visual: tpl.visual,
  };
  if (s.atk   !== undefined) actor.atk   = scaleByLevel(s.atk, lvl);
  if (s.def   !== undefined) actor.def   = scaleByLevel(s.def, lvl);
  if (s.int   !== undefined) actor.int   = scaleByLevel(s.int, lvl);
  if (s.mp    !== undefined) actor.mp    = scaleByLevel(s.mp, lvl);
  if (s.maxMp !== undefined) actor.maxMp = scaleByLevel(s.maxMp, lvl);
  if (tpl.knownSpells) actor.knownSpells = [...tpl.knownSpells];
  if (tpl.loot) actor.lootTable = tpl.loot;
  if (tpl.baseVisual) actor.baseVisual = tpl.baseVisual;
  // tint takes precedence; legacy `colors` is kept as a fallback alias.
  const tint = tpl.tint ?? tpl.colors;
  if (tint) actor.colors = { ...tint };
  if (tpl.immunities) actor.immunities = [...tpl.immunities];

  // Starting inventory: monster-only consumables for self-buff/heal AIs.
  if (tpl.startingInventory && tpl.startingInventory.length > 0) {
    const consumables: ItemInstance[] = [];
    for (const entry of tpl.startingInventory) {
      const count = entry.count ?? 1;
      for (let i = 0; i < count; i++) consumables.push(mintBagInstance(entry.itemId));
    }
    actor.inventory = {
      consumables,
      equipped: { hat: null, robe: null, staff: null, dagger: null, focus: null },
    };
  }

  return actor;
}
