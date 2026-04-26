// Phase 15: archetype generators. Each archetype owns the "what's in the
// room" decision (monster count + bias, objects, partitions). Layout/size
// and pre-placed floor items are handled by the parent generator.
//
// Five archetypes, weighted at the call site (generator.ts):
//   combat (40%) | vault (20%) | conduit (20%) | cache (10%) | trap (10%)

import type { Actor, InteriorWall, Pos, Room, RoomObject } from "../types.js";
import { MONSTER_TEMPLATES, createActor } from "../content/monsters.js";
import { chestLootTableFor } from "../content/loot.js";
import { floorTier } from "../content/scaling.js";
import { chebyshev } from "../geometry.js";

export type Rng = () => number;

export type Archetype = "combat" | "vault" | "conduit" | "cache" | "trap";

export interface ArchCtx {
  depth: number;
  rng: Rng;
  width: number;
  height: number;
  hero: Pos;
  /** Existing actor positions (hero + monsters added so far). */
  taken: Pos[];
  /** Tiles already declared off-limits (e.g. inside a partition). */
  blocked: Set<string>;
  /** Door positions of the room. */
  doors: { dir: "N" | "S" | "E" | "W"; pos: Pos }[];
  /** Monotonic id source for objects in this room. */
  nextObjectId: () => string;
  /** Monotonic id source for monsters in this room. */
  nextActorId: () => string;
}

export interface ArchResult {
  monsters: Actor[];
  objects: RoomObject[];
  walls: InteriorWall[];
  /** When set, the keymaster monster is the one with this id. Tagged later. */
  keymasterId?: string;
}

const TILE_KEY = (p: Pos) => `${p.x},${p.y}`;

function randInt(rng: Rng, lo: number, hi: number): number {
  if (hi <= lo) return lo;
  return lo + Math.floor(rng() * (hi - lo + 1));
}

function pickFloorTile(ctx: ArchCtx, opts: { minDist?: number } = {}): Pos | null {
  const { minDist = 0 } = opts;
  for (let i = 0; i < 80; i++) {
    const x = randInt(ctx.rng, 1, ctx.width - 2);
    const y = randInt(ctx.rng, 1, ctx.height - 2);
    const p = { x, y };
    if (ctx.blocked.has(TILE_KEY(p))) continue;
    if (ctx.taken.some(q => q.x === x && q.y === y)) continue;
    if (chebyshev(p, ctx.hero) < minDist) continue;
    return p;
  }
  return null;
}

// ──────────────────────────── monster picks ────────────────────────────

function templatesAtTier(tier: number): string[] {
  return Object.entries(MONSTER_TEMPLATES)
    .filter(([_, t]) => Math.min(5, Math.max(1, Math.ceil(t.level / 2))) === tier)
    .map(([id]) => id);
}

function pickTemplateId(rng: Rng, depth: number, eliteChance = 0.15): { id: string; elite: boolean } {
  const tier = floorTier(depth);
  const baseList = templatesAtTier(tier);
  const eliteList = templatesAtTier(Math.min(5, tier + 1));
  const useElite = eliteList.length > 0 && rng() < eliteChance;
  const list = useElite ? eliteList : (baseList.length > 0 ? baseList : Object.keys(MONSTER_TEMPLATES));
  const idx = randInt(rng, 0, list.length - 1);
  return { id: list[idx]!, elite: useElite };
}

function spawnMonsters(
  ctx: ArchCtx,
  count: number,
  opts: { weakOnly?: boolean; minDistFromHero?: number } = {},
): Actor[] {
  const { weakOnly = false, minDistFromHero = 3 } = opts;
  const out: Actor[] = [];
  for (let i = 0; i < count; i++) {
    const eliteChance = weakOnly ? 0 : 0.15;
    const pick = pickTemplateId(ctx.rng, weakOnly ? Math.max(1, ctx.depth - 2) : ctx.depth, eliteChance);
    const pos = pickFloorTile(ctx, { minDist: minDistFromHero });
    if (!pos) break;
    ctx.taken.push(pos);
    const id = ctx.nextActorId();
    const a = createActor(pick.id, pos, id);
    // Phase 14 already scaled by template.level; we re-scale to current depth
    // by overriding via per-actor scaling. Simplest: set their level field
    // implicitly through hp/atk multipliers driven by depth — but the templates
    // already set static stats. We rely on createActor's scaleByLevel which
    // uses template.level; depth-scaling is handled by spawning elite-tier
    // templates as depth grows.
    out.push(a);
  }
  return out;
}

function tagKeymaster(monsters: Actor[]): string | undefined {
  if (monsters.length === 0) return undefined;
  // Most "elite" = highest level, then deterministic by spawn position.
  const sorted = [...monsters].sort((a, b) => {
    const la = MONSTER_TEMPLATES[a.kind]?.level ?? 1;
    const lb = MONSTER_TEMPLATES[b.kind]?.level ?? 1;
    if (la !== lb) return lb - la;
    if (a.pos.y !== b.pos.y) return a.pos.y - b.pos.y;
    return a.pos.x - b.pos.x;
  });
  const km = sorted[0]!;
  km.lootTable = "keymaster_loot";
  return km.id;
}

// ──────────────────────────── archetype: combat ────────────────────────────

export function genCombat(ctx: ArchCtx): ArchResult {
  const base = randInt(ctx.rng, 2, 4);
  const count = base + Math.floor(ctx.depth / 6);
  const monsters = spawnMonsters(ctx, count);
  return { monsters, objects: [], walls: [] };
}

// ──────────────────────────── archetype: vault ────────────────────────────
// Vault: 1–3 monsters incl. keymaster, 1 locked chest behind a 3-wall + door
// partition in a corner. At depth ≤ 3 the chest is unlocked + door also
// unlocked (still drawn, but no key needed) — teaching variant.

export function genVault(ctx: ArchCtx): ArchResult {
  const baseCount = randInt(ctx.rng, 1, 3);
  const count = baseCount + Math.floor(ctx.depth / 6);

  // Pick a corner for the partition. Each corner gets a 2x2 inner cell.
  const corners: { cx: number; cy: number; doorOffset: { dx: number; dy: number } }[] = [
    { cx: 1, cy: 1, doorOffset: { dx: 2, dy: 0 } },
    { cx: ctx.width - 3, cy: 1, doorOffset: { dx: 0, dy: 2 } },
    { cx: 1, cy: ctx.height - 3, doorOffset: { dx: 2, dy: 0 } },
    { cx: ctx.width - 3, cy: ctx.height - 3, doorOffset: { dx: 0, dy: 2 } },
  ];
  const corner = corners[randInt(ctx.rng, 0, corners.length - 1)]!;

  // 2x2 inner cell at (cx,cy)..(cx+1,cy+1). Place chest at (cx,cy).
  const chestPos: Pos = { x: corner.cx, y: corner.cy };
  // Build 3 walls + 1 door around the chest cell. We'll wall in chestPos
  // alone with a door on one of its 4 neighbors.
  // Door sits adjacent to chest along an axis pointing into the room.
  const doorPos: Pos = {
    x: corner.cx + corner.doorOffset.dx > 0 ? corner.cx + 1 : corner.cx,
    y: corner.cy + corner.doorOffset.dy > 0 ? corner.cy + 1 : corner.cy,
  };
  // Compute walls = the 4 neighbors of chestPos minus the door tile.
  const walls: InteriorWall[] = [];
  const neighbors: Pos[] = [
    { x: chestPos.x - 1, y: chestPos.y },
    { x: chestPos.x + 1, y: chestPos.y },
    { x: chestPos.x, y: chestPos.y - 1 },
    { x: chestPos.x, y: chestPos.y + 1 },
  ];
  for (const n of neighbors) {
    if (n.x === doorPos.x && n.y === doorPos.y) continue;
    if (n.x <= 0 || n.x >= ctx.width - 1 || n.y <= 0 || n.y >= ctx.height - 1) continue;
    walls.push({ pos: n });
  }
  // Block these tiles from spawn picks.
  for (const w of walls) ctx.blocked.add(TILE_KEY(w.pos));
  ctx.blocked.add(TILE_KEY(chestPos));
  ctx.blocked.add(TILE_KEY(doorPos));

  const lockedRoom = ctx.depth >= 4;
  const objects: RoomObject[] = [
    {
      id: ctx.nextObjectId(),
      kind: "chest",
      pos: chestPos,
      locked: lockedRoom,
      lootTableId: chestLootTableFor(ctx.depth),
    },
    {
      id: ctx.nextObjectId(),
      kind: "door_closed",
      pos: doorPos,
      locked: lockedRoom,
    },
  ];

  // Spawn monsters in the open area; tag the most elite as keymaster (only
  // matters when the room is locked — at depth ≤ 3 the door is open, no key
  // required, but keymaster still drops a key so the spec reads cleanly).
  const monsters = spawnMonsters(ctx, count);
  const keymasterId = lockedRoom ? tagKeymaster(monsters) : undefined;

  return { monsters, objects, walls, keymasterId };
}

// ──────────────────────────── archetype: conduit ────────────────────────────
// Conduit: 0–2 weak monsters + 1 fountain (50/50 health vs mana).

export function genConduit(ctx: ArchCtx): ArchResult {
  const count = randInt(ctx.rng, 0, 2);
  const monsters = spawnMonsters(ctx, count, { weakOnly: true });

  const fountainKind: "fountain_health" | "fountain_mana" =
    ctx.rng() < 0.5 ? "fountain_health" : "fountain_mana";
  const fpos = pickFloorTile(ctx, { minDist: 2 });
  const objects: RoomObject[] = [];
  if (fpos) {
    ctx.taken.push(fpos);
    objects.push({
      id: ctx.nextObjectId(),
      kind: fountainKind,
      pos: fpos,
    });
  }
  return { monsters, objects, walls: [] };
}

// ──────────────────────────── archetype: cache ────────────────────────────
// Cache: 2–3 monsters + 1 unlocked chest standing in the open.

export function genCache(ctx: ArchCtx): ArchResult {
  const baseCount = randInt(ctx.rng, 2, 3);
  const count = baseCount + Math.floor(ctx.depth / 6);
  const monsters = spawnMonsters(ctx, count);
  const cpos = pickFloorTile(ctx, { minDist: 2 });
  const objects: RoomObject[] = [];
  if (cpos) {
    ctx.taken.push(cpos);
    objects.push({
      id: ctx.nextObjectId(),
      kind: "chest",
      pos: cpos,
      locked: false,
      lootTableId: chestLootTableFor(ctx.depth),
    });
  }
  return { monsters, objects, walls: [] };
}

// ──────────────────────────── archetype: trap ────────────────────────────
// Trap: 2–4 monsters incl. keymaster + locked exit door (must kill keymaster
// for the key, then interact() to unlock).

export function genTrap(ctx: ArchCtx): ArchResult {
  const baseCount = randInt(ctx.rng, 2, 4);
  const count = baseCount + Math.floor(ctx.depth / 6);
  const monsters = spawnMonsters(ctx, count);
  const keymasterId = tagKeymaster(monsters);

  // Place exit_door_closed on the room's exit door tile (the first door in
  // the room is treated as the exit by convention).
  const objects: RoomObject[] = [];
  const exitDoor = ctx.doors[0];
  if (exitDoor) {
    objects.push({
      id: ctx.nextObjectId(),
      kind: "exit_door_closed",
      pos: { ...exitDoor.pos },
      locked: true,
    });
  }
  return { monsters, objects, walls: [], keymasterId };
}

// ──────────────────────────── dispatcher ────────────────────────────

export const ARCHETYPE_BY_NAME: Record<Archetype, (ctx: ArchCtx) => ArchResult> = {
  combat: genCombat,
  vault: genVault,
  conduit: genConduit,
  cache: genCache,
  trap: genTrap,
};

/** Weighted pick. Combat 40 / Vault 20 / Conduit 20 / Cache 10 / Trap 10. */
export function pickArchetype(rng: Rng, depth: number): Archetype {
  // Teaching ramp: trap suppressed at depths 1–3.
  const allowTrap = depth >= 4;
  const entries: { name: Archetype; weight: number }[] = [
    { name: "combat", weight: 40 },
    { name: "vault", weight: 20 },
    { name: "conduit", weight: 20 },
    { name: "cache", weight: 10 },
    { name: "trap", weight: allowTrap ? 10 : 0 },
  ];
  const total = entries.reduce((s, e) => s + e.weight, 0);
  let r = rng() * total;
  for (const e of entries) {
    r -= e.weight;
    if (r <= 0) return e.name;
  }
  return "combat";
}

// Re-export type used by tests.
export type { Room };
