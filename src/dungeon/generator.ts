// Phase 15: procedural single-room dungeon generator.
//
// generateRoom(depth, seed) → RoomSetup
//
// Replaces the Phase 11 fixed-10x10 layout. Picks one of 5 archetypes,
// rolls room size, places hero + monsters, scatters pre-placed floor items,
// and stamps depth/archetype onto Room for the UI flash.
//
// Determinism: same (depth, seed) always yields the same Room. Internally
// uses a mulberry32 closure derived from depth+seed; never reads Math.random.

import type { RoomSetup } from "../engine.js";
import type { Actor, Direction, FloorItem, ItemInstance, Pos, Room, Script } from "../types.js";
import {
  script, ident, call, lit, while_, if_, bin, member, index, exprStmt,
  cApproach, cAttack, cExit, cHalt,
} from "../ast-helpers.js";
import { emptyEquipped } from "../content/items.js";
import {
  ARCHETYPE_BY_NAME, pickArchetype, type ArchCtx, type Archetype, type Rng,
} from "./archetypes.js";

// ──────────────────────────── default hero script ────────────────────────────

function buildHeroScript(): Script {
  const enemiesLen = member(call("enemies"), "length");
  const firstEnemy = index(call("enemies"), lit(0));
  const firstDoor = index(call("doors"), lit(0));
  const mePos = member(ident("me"), "pos");
  const doorPos = member(firstDoor, "pos");
  const hereItemsLen = member(call("items_here"), "length");

  return script(
    while_(bin(">", enemiesLen, lit(0)), [
      cApproach(firstEnemy),
      cAttack(firstEnemy),
    ]),
    if_(bin(">", member(call("items_nearby"), "length"), lit(0)), [
      while_(
        bin(">", member(call("items_nearby"), "length"), lit(0)),
        [
          if_(bin("==", hereItemsLen, lit(0)),
            [cApproach(index(call("items_nearby"), lit(0)))],
            [exprStmt(call("pickup"))],
          ),
        ],
      ),
    ]),
    while_(
      bin("||",
        bin("!=", member(mePos, "x"), member(doorPos, "x")),
        bin("!=", member(mePos, "y"), member(doorPos, "y"))),
      [cApproach(firstDoor)],
    ),
    cExit("N"),
    cHalt(),
  );
}

// ──────────────────────────── seeded RNG ────────────────────────────

function seededRng(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    let t = (s += 0x6D2B79F5) | 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

// ──────────────────────────── helpers ────────────────────────────

function randInt(rng: Rng, lo: number, hi: number): number {
  if (hi <= lo) return lo;
  return lo + Math.floor(rng() * (hi - lo + 1));
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function roomSize(depth: number, rng: Rng): { w: number; h: number } {
  const base = clamp(8 + Math.floor(depth / 4), 8, 16);
  const w = clamp(base + randInt(rng, -2, 2), 8, 16);
  const h = clamp(base + randInt(rng, -2, 2), 8, 16);
  return { w, h };
}

// ──────────────────────────── pre-placed floor items ────────────────────────────

function healthPotionChance(depth: number): number {
  return depth >= 10 ? 0.55 : 0.50;
}
function manaCrystalChance(depth: number): number {
  return depth >= 10 ? 0.45 : 0.40;
}

function pickEmptyTile(
  rng: Rng, w: number, h: number, taken: Set<string>, blocked: Set<string>,
): Pos | null {
  for (let i = 0; i < 60; i++) {
    const x = randInt(rng, 1, w - 2);
    const y = randInt(rng, 1, h - 2);
    const k = `${x},${y}`;
    if (taken.has(k) || blocked.has(k)) continue;
    return { x, y };
  }
  return null;
}

// ──────────────────────────── public entry ────────────────────────────

export interface GenerateOptions {
  /** Override the hero spawn pos. Defaults to (1, floor(h/2)). */
  heroPos?: Pos;
  /** Provide a hero actor template (knownSpells, equipped, inventory). */
  hero?: Actor;
}

let _objectSeq = 0;

export function generateRoom(
  depth: number, seed: number = depth * 0x9E3779B1, opts: GenerateOptions = {},
): RoomSetup {
  const rng = seededRng(seed);
  const { w, h } = roomSize(depth, rng);

  const heroPos: Pos = opts.heroPos ?? { x: 1, y: Math.floor(h / 2) };

  const doors: { dir: Direction; pos: Pos }[] = [
    { dir: "N", pos: { x: Math.floor(w / 2), y: 0 } },
    { dir: "S", pos: { x: Math.floor(w / 2), y: h - 1 } },
  ];

  const archetype: Archetype = pickArchetype(rng, depth);

  const taken: Pos[] = [heroPos];
  const blocked = new Set<string>();
  // Mark door tiles as taken so monsters / objects don't sit on them.
  for (const d of doors) blocked.add(`${d.pos.x},${d.pos.y}`);

  let objSeq = 0;
  let actSeq = 0;
  const ctx: ArchCtx = {
    depth, rng, width: w, height: h,
    hero: heroPos, taken, blocked, doors,
    nextObjectId: () => `o${++objSeq}`,
    nextActorId: () => `m${++actSeq}`,
  };

  const arch = ARCHETYPE_BY_NAME[archetype](ctx);

  // Tag the keymaster monster so the loot path drops a key.
  // (`tagKeymaster` already set lootTable on the actor.)
  void arch.keymasterId;

  const monsters = arch.monsters;

  // Pre-placed floor items (universal across archetypes).
  const takenSet = new Set<string>(taken.map(p => `${p.x},${p.y}`));
  for (const m of monsters) takenSet.add(`${m.pos.x},${m.pos.y}`);
  // Wall tiles for vault partitions:
  for (const wall of arch.walls) blocked.add(`${wall.pos.x},${wall.pos.y}`);
  // Object positions are valid for floor items in some cases (chest), so we
  // exclude only locked door / fountain tiles. Simpler rule: skip every object
  // tile to keep floor items off all interactive cells.
  for (const o of arch.objects) blocked.add(`${o.pos.x},${o.pos.y}`);

  const floorItems: FloorItem[] = [];
  let fiSeq = 0;
  const tryPlace = (defId: string, chance: number) => {
    if (rng() >= chance) return;
    const p = pickEmptyTile(rng, w, h, takenSet, blocked);
    if (!p) return;
    floorItems.push({ id: `fi${++fiSeq}_${defId}`, defId, pos: p });
    takenSet.add(`${p.x},${p.y}`);
  };
  tryPlace("health_potion", healthPotionChance(depth));
  tryPlace("mana_crystal", manaCrystalChance(depth));

  // Build the hero. Caller-provided hero template wins; default produces
  // the legacy Phase 13.7 starter.
  const hero: Actor = opts.hero ?? defaultHero(heroPos);
  hero.pos = { ...heroPos };
  hero.energy = 0;

  const room: Room = {
    w, h,
    doors,
    items: [],
    chests: [],
    floorItems,
    objects: arch.objects,
    interiorWalls: arch.walls,
    depth,
    archetype,
  };

  // Inject a synthetic monster id offset so re-runs from the same setup
  // don't collide with hero id.
  void _objectSeq;

  return { room, actors: [hero, ...monsters] };
}

// ──────────────────────────── default hero factory ────────────────────────────

export function defaultHero(pos: Pos): Actor {
  return {
    id: "hero", kind: "hero", isHero: true,
    hp: 20, maxHp: 20,
    speed: 12, energy: 0,
    pos: { ...pos },
    script: buildHeroScript(), alive: true,
    knownGear: ["wooden_staff", "bone_dagger"],
    inventory: {
      consumables: [],
      equipped: {
        ...emptyEquipped(),
        staff: { id: "ws1", defId: "wooden_staff" },
        dagger: { id: "bd1", defId: "bone_dagger" },
      },
    },
  };
}
