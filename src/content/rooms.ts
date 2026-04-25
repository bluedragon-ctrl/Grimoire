// Phase 11: room generation spawns 2 monsters per room, picked uniformly
// from MONSTER_TEMPLATES using a seeded RNG (no Math.random). Layout is
// still a single 10x10 box with N/S doors — Phase 12 will branch on layout.
//
// `rng` is a seedable `() => number` (Math.random-compatible). Callers from
// the gameplay loop pass a mulberry32 stream seeded per level; tests pass a
// deterministic stub.

import type { RoomSetup } from "../engine.js";
import type { Actor, Pos, Room, Script } from "../types.js";
import {
  script, ident, call, lit, while_, if_, bin, member, index, exprStmt,
  cApproach, cAttack, cExit, cHalt,
} from "../ast-helpers.js";
import { emptyEquipped } from "./items.js";
import { MONSTER_TEMPLATES, createActor } from "./monsters.js";

export type Rng = () => number;

// Build the default hero script used when the user has not yet typed their own.
// Kept identical to demoSetup so Phase 9 demo behavior is preserved.
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

const ROOM_W = 10;
const ROOM_H = 10;
const HERO_SPAWN: Pos = { x: 1, y: 5 };
const MIN_DIST_FROM_HERO = 3;   // Manhattan — monsters can't crowd the hero.
const MONSTER_COUNT = 2;

function chebyshev(a: Pos, b: Pos): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

// Uniform integer in [lo, hi] via the injected rng stream.
function randInt(rng: Rng, lo: number, hi: number): number {
  if (hi <= lo) return lo;
  return lo + Math.floor(rng() * (hi - lo + 1));
}

function pickFloorTile(rng: Rng, taken: Pos[]): Pos | null {
  // Interior tiles only (exclude the wall border). Retry until we find one
  // that's at least MIN_DIST_FROM_HERO from the hero and doesn't overlap any
  // previously picked monster tile. Bounded to 50 tries so a pathological
  // seed can't hang the room gen.
  for (let i = 0; i < 50; i++) {
    const x = randInt(rng, 1, ROOM_W - 2);
    const y = randInt(rng, 1, ROOM_H - 2);
    const p = { x, y };
    if (chebyshev(p, HERO_SPAWN) < MIN_DIST_FROM_HERO) continue;
    if (taken.some(q => q.x === x && q.y === y)) continue;
    return p;
  }
  return null;
}

function pickTemplateId(rng: Rng): string {
  const ids = Object.keys(MONSTER_TEMPLATES);
  const idx = randInt(rng, 0, ids.length - 1);
  return ids[idx]!;
}

// mulberry32 — same algorithm as src/rng.ts but a local closure so room gen
// can run before a World (with rngSeed) exists. Kept in-file so we don't
// leak a new public RNG primitive.
function seededRng(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    let t = (s += 0x6D2B79F5) | 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

export function generateRoom(level: number, rng?: Rng): RoomSetup {
  // Default stream is seeded from the level number so each level is
  // reproducible even when no seed is threaded from the UI. No Math.random.
  const stream: Rng = rng ?? seededRng(level * 0x9E3779B1);
  void level;  // Phase 11 keeps uniform picks — level-based weighting is Phase 12.
  const room: Room = {
    w: ROOM_W,
    h: ROOM_H,
    doors: [
      { dir: "N", pos: { x: 5, y: 0 } },
      { dir: "S", pos: { x: 5, y: 9 } },
    ],
    items: [],
    chests: [],
  };

  const hero: Actor = {
    id: "hero", kind: "hero", isHero: true, hp: 20, maxHp: 20,
    speed: 12, energy: 0, pos: { ...HERO_SPAWN },
    script: buildHeroScript(), alive: true,
    knownGear: ["wooden_staff", "leather_robe"],
    inventory: {
      consumables: [
        { id: "hp1", defId: "health_potion" },
        { id: "mp1", defId: "mana_crystal" },
      ],
      equipped: {
        ...emptyEquipped(),
        staff: { id: "ws1", defId: "wooden_staff" },
        robe:  { id: "lr1", defId: "leather_robe" },
      },
    },
  };

  const actors: Actor[] = [hero];
  const taken: Pos[] = [HERO_SPAWN];
  for (let i = 0; i < MONSTER_COUNT; i++) {
    const tpl = pickTemplateId(stream);
    const pos = pickFloorTile(stream, taken);
    if (!pos) break;
    taken.push(pos);
    actors.push(createActor(tpl, pos, `m${i + 1}`));
  }

  return { room, actors };
}
