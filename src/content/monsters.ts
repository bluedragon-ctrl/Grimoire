// Phase 11: monster template registry.
//
// Each monster is data: stats, a sprite key, and a DSL AI script that parses
// through the same pipeline as the hero's editor source. Scripts are parsed
// once at module load and the AST is cached on the template — a parse error
// here is a DEV-TIME hard fail (thrown from the import side effect), not a
// runtime script failure.
//
// `createActor(templateId, pos, id)` stamps a template onto a fresh Actor
// ready to insert into World.actors. Room generation and any future spawn
// code should go through this helper — do not hand-build monster Actors.

import type { Actor, Pos, Script } from "../types.js";
import { parse } from "../lang/parser.js";

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
  id: string;                        // registry key; also the default actor.kind
  name: string;                      // display name (currently unused by UI; future HUD/log)
  visual: string;                    // key into MONSTER_RENDERERS
  baseVisual?: string;               // fallback sprite key
  stats: MonsterStats;
  knownSpells?: string[];            // Phase 6 spell ids the monster can cast
  ai: string;                        // DSL source — parsed at load time
  loot?: string;                     // key into LOOT_TABLES (Phase 9)
  colors?: Record<string, string>;   // optional renderer tint
}

// ──────────────────────────── AI scripts ────────────────────────────
// Kept short (<15 lines each) and readable — these are copy-paste fodder for
// kids learning the DSL. Intent comments sit above each block.

// Goblin: the simplest melee — always charge the nearest foe, swing when
// adjacent, idle when the room is clear.
const GOBLIN_AI = `
while enemies().length > 0:
  approach(enemies()[0])
  attack(enemies()[0])
halt
`;

// Skeleton: moderate melee with armor. Avoids redundant approach steps when
// already adjacent. Flees below 3 HP rather than dying in place.
const SKELETON_AI = `
while enemies().length > 0:
  if hp() < 3:
    flee(enemies()[0])
  elif adjacent(me, enemies()[0]):
    attack(enemies()[0])
  else:
    approach(enemies()[0])
halt
`;

// Bat: very fast, paper-thin. Attacks once then immediately puts distance
// between itself and the foe — hit-and-run, loops forever.
const BAT_AI = `
while enemies().length > 0:
  if adjacent(me, enemies()[0]):
    attack(enemies()[0])
    flee(enemies()[0])
  else:
    approach(enemies()[0])
halt
`;

// Cultist: ranged caster. Bolts the nearest foe while in range and has MP;
// approaches otherwise. When out of MP the main halts — but the hit handler
// still fires on retaliation, so a cornered cultist flees whoever hit it.
// (Phase 10.2 carry-forward: handlers must work after main halts.)
const CULTIST_AI = `
while enemies().length > 0:
  if can_cast("bolt", enemies()[0]):
    cast("bolt", enemies()[0])
  else:
    approach(enemies()[0])
halt

on hit as attacker:
  flee(attacker)
`;

// Slime: slow, beefy, dumb. One behavior: walk at the foe and hit it. No
// fleeing, no branching — the reference AI for new readers.
const SLIME_AI = `
while enemies().length > 0:
  approach(enemies()[0])
  attack(enemies()[0])
halt
`;

// ──────────────────────────── templates ────────────────────────────

const RAW_TEMPLATES: MonsterTemplate[] = [
  {
    id: "goblin",
    name: "Goblin",
    visual: "skeleton",         // MONSTER_RENDERERS has no goblin sprite (carried from Phase 10)
    stats: { hp: 5, maxHp: 5, speed: 10, atk: 1 },
    ai: GOBLIN_AI,
    loot: "goblin_loot",
  },
  {
    id: "skeleton",
    name: "Skeleton",
    visual: "skeleton",
    stats: { hp: 8, maxHp: 8, speed: 10, atk: 2, def: 1 },
    ai: SKELETON_AI,
    loot: "skeleton_loot",
  },
  {
    id: "bat",
    name: "Bat",
    visual: "bat",
    stats: { hp: 2, maxHp: 2, speed: 18, atk: 1 },
    ai: BAT_AI,
    // No loot — bats don't drop.
  },
  {
    id: "cultist",
    name: "Cultist",
    visual: "dark_wizard",
    stats: { hp: 4, maxHp: 4, speed: 10, atk: 1, int: 0, mp: 15, maxMp: 15 },
    knownSpells: ["bolt"],
    ai: CULTIST_AI,
    loot: "cultist_loot",
  },
  {
    id: "slime",
    name: "Slime",
    visual: "slime",
    stats: { hp: 12, maxHp: 12, speed: 5, atk: 2 },
    ai: SLIME_AI,
    loot: "slime_loot",
  },
];

// ──────────────────────────── registry validation ────────────────────────────
// Validate required fields at module load — a missing field is a content bug,
// not a runtime default.
for (const tpl of RAW_TEMPLATES) {
  if (!tpl.visual) throw new Error(`Monster template '${tpl.id}': missing required field 'visual'.`);
  if (tpl.stats.atk === undefined) throw new Error(`Monster template '${tpl.id}': missing required stat 'stats.atk'.`);
}

// ──────────────────────────── parse cache ────────────────────────────
// Parse every AI source once; cache the Script so each createActor() call
// attaches the same immutable AST. Parse errors throw on import — we want
// bad content to crash boot, not mid-game.

const SCRIPT_CACHE: Record<string, Script> = {};
for (const tpl of RAW_TEMPLATES) {
  try {
    SCRIPT_CACHE[tpl.id] = parse(tpl.ai);
  } catch (err) {
    throw new Error(
      `Monster template '${tpl.id}' failed to parse its AI script: ${(err as Error).message}`,
    );
  }
}

export const MONSTER_TEMPLATES: Record<string, MonsterTemplate> = Object.freeze(
  Object.fromEntries(RAW_TEMPLATES.map(t => [t.id, t])),
);

/** Read-only access to the cached AST for a template id. */
export function scriptFor(id: string): Script | undefined {
  return SCRIPT_CACHE[id];
}

// ──────────────────────────── actor factory ────────────────────────────

export function createActor(templateId: string, pos: Pos, id: string): Actor {
  const tpl = MONSTER_TEMPLATES[templateId];
  if (!tpl) throw new Error(`Unknown monster template '${templateId}'.`);
  const script = SCRIPT_CACHE[templateId];
  if (!script) throw new Error(`No cached script for '${templateId}'.`);

  const s = tpl.stats;
  const actor: Actor = {
    id,
    kind: tpl.id,
    isHero: false,
    hp: s.hp,
    maxHp: s.maxHp,
    speed: s.speed,
    energy: 0,
    pos: { ...pos },
    script,
    alive: s.hp > 0,
    visual: tpl.visual,
  };
  if (s.atk !== undefined) actor.atk = s.atk;
  if (s.def !== undefined) actor.def = s.def;
  if (s.int !== undefined) actor.int = s.int;
  if (s.mp !== undefined)  actor.mp = s.mp;
  if (s.maxMp !== undefined) actor.maxMp = s.maxMp;
  if (tpl.knownSpells) actor.knownSpells = [...tpl.knownSpells];
  if (tpl.loot) actor.lootTable = tpl.loot;
  if (tpl.baseVisual) actor.baseVisual = tpl.baseVisual;
  if (tpl.colors) actor.colors = { ...tpl.colors };
  return actor;
}
