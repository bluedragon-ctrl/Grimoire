// Commands (actions with cost) and queries (zero-cost lookups).
// Target resolution goes through a single seam: `resolveTarget`.

import type {
  Actor, World, Pos, GameEvent, Door, Direction, Item, Chest, ItemInstance, FloorItem, ResolveFailureMode,
} from "./types.js";
import { hasEffect, listEffects } from "./effects.js";
import { castSpell, validateCast } from "./spells/cast.js";
import { useItem, onHitHook } from "./items/execute.js";
import { doPickup, doDrop } from "./items/loot.js";

export { doPickup, doDrop };

// ──────────────────────────── cost table ────────────────────────────

export const COST = {
  approach: 10,
  flee: 10,
  attack: 10,
  cast: 15,
  wait: 5,
  exit: 10,
  halt: 0,
  use: 15,
  pickup: 10,
  drop: 5,
} as const;

const DAMAGE_BY_KIND: Record<string, number> = {
  hero: 3,
  goblin: 1,
};

// ──────────────────────────── small helpers ────────────────────────────

export function manhattan(a: Pos, b: Pos): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function inBounds(world: World, p: Pos): boolean {
  return p.x >= 0 && p.y >= 0 && p.x < world.room.w && p.y < world.room.h;
}

export function actorAt(world: World, p: Pos): Actor | null {
  for (const a of world.actors) {
    if (a.alive && a.pos.x === p.x && a.pos.y === p.y) return a;
  }
  return null;
}

export function orthogonallyAdjacent(a: Pos, b: Pos): boolean {
  return manhattan(a, b) === 1;
}

function sign(n: number): number {
  return n > 0 ? 1 : n < 0 ? -1 : 0;
}

// Deterministic sort key for ties: id for actors, (x,y) lex for positions.
function tieKey(o: unknown): string {
  if (o && typeof o === "object") {
    const anyO = o as any;
    if (typeof anyO.id === "string") return anyO.id;
    if (typeof anyO.x === "number" && typeof anyO.y === "number") {
      return `${anyO.x},${anyO.y}`;
    }
  }
  return "";
}

function sortByDistance<T extends { pos: Pos } | Pos>(
  self: Actor,
  list: T[],
): T[] {
  const getPos = (t: T): Pos => ("pos" in (t as any) ? (t as any).pos : (t as Pos));
  return [...list].sort((a, b) => {
    const da = manhattan(getPos(a), self.pos);
    const db = manhattan(getPos(b), self.pos);
    if (da !== db) return da - db;
    return tieKey(a).localeCompare(tieKey(b));
  });
}

// ──────────────────────────── target resolution seam ────────────────────────────

export const FAILURE_MODE: ResolveFailureMode = "silent";

// MVP: validates `ref` is a living actor currently in the room. Returns it
// or null. Swap this function (or return sentinel for "cancel", throw for
// "throw") to change the whole engine's failure policy.
export function resolveActor(world: World, ref: unknown): Actor | null {
  if (!ref || typeof ref !== "object") return null;
  const r = ref as Actor;
  if (typeof r.id !== "string") return null;
  const found = world.actors.find(a => a.id === r.id);
  if (!found || !found.alive) return null;
  return found;
}

// Lenient position resolver: accepts actors, doors, items, chests, or bare
// Pos-like objects. Used by approach/flee, which can legitimately target
// any positioned thing.
export function resolvePos(_world: World, ref: unknown): Pos | null {
  if (!ref || typeof ref !== "object") return null;
  const r = ref as any;
  if (r.pos && typeof r.pos.x === "number" && typeof r.pos.y === "number") {
    return r.pos as Pos;
  }
  if (typeof r.x === "number" && typeof r.y === "number") {
    return { x: r.x, y: r.y };
  }
  return null;
}

export function resolveDoor(world: World, ref: unknown): Door | null {
  if (typeof ref === "string") {
    const dir = ref as Direction;
    return world.room.doors.find(d => d.dir === dir) ?? null;
  }
  if (ref && typeof ref === "object" && "dir" in (ref as any)) {
    const dir = (ref as Door).dir;
    return world.room.doors.find(d => d.dir === dir) ?? null;
  }
  return null;
}

// ──────────────────────────── queries (zero cost) ────────────────────────────

export const queries = {
  me: (world: World, self: Actor): Actor => self,
  hp: (world: World, self: Actor): number => self.hp,
  enemies: (world: World, self: Actor): Actor[] => {
    const others = world.actors.filter(a => a.alive && a.id !== self.id);
    return sortByDistance(self, others);
  },
  items: (world: World, self: Actor): Item[] => sortByDistance(self, world.room.items),
  chests: (world: World, self: Actor): Chest[] => sortByDistance(self, world.room.chests),
  doors: (world: World, self: Actor): Door[] => sortByDistance(self, world.room.doors),
  at: (_world: World, self: Actor, target: unknown): boolean => {
    const p = resolvePos(_world, target);
    if (!p) return false;
    return self.pos.x === p.x && self.pos.y === p.y;
  },
  // Chebyshev distance — matches approach()'s 8-directional, one-tile-per-tick movement.
  distance: (_world: World, _self: Actor, a: unknown, b: unknown): number => {
    const pa = resolvePos(_world, a);
    const pb = resolvePos(_world, b);
    if (!pa || !pb) return 0;
    return Math.max(Math.abs(pa.x - pb.x), Math.abs(pa.y - pb.y));
  },
  can_cast: (world: World, self: Actor, name: unknown, target?: unknown): boolean => {
    if (typeof name !== "string") return false;
    const v = validateCast(world, self, name, target, {
      skipTarget: target === undefined || target === null,
    });
    return v.ok;
  },
  has_effect: (world: World, _self: Actor, target: unknown, kind: unknown): boolean => {
    const a = resolveActor(world, target);
    if (!a) return false;
    if (typeof kind !== "string") return false;
    return hasEffect(a, kind);
  },
  effects: (world: World, _self: Actor, target: unknown): string[] => {
    const a = resolveActor(world, target);
    if (!a) return [];
    return listEffects(a);
  },
  clouds: (world: World, _self: Actor): { id: string; pos: Pos; kind: string; remaining: number }[] => {
    const cs = world.room.clouds ?? [];
    return cs.map(c => ({ id: c.id, pos: { ...c.pos }, kind: c.kind, remaining: c.remaining }));
  },
  cloud_at: (world: World, _self: Actor, target: unknown): string | null => {
    const p = resolvePos(world, target);
    if (!p) return null;
    const cs = world.room.clouds ?? [];
    // Topmost = most recently spawned (last in array).
    for (let i = cs.length - 1; i >= 0; i--) {
      const c = cs[i]!;
      if (c.pos.x === p.x && c.pos.y === p.y) return c.kind;
    }
    return null;
  },
  mp: (_world: World, self: Actor): number => self.mp ?? 0,
  max_mp: (_world: World, self: Actor): number => self.maxMp ?? 0,
  known_spells: (_world: World, self: Actor): string[] => [...(self.knownSpells ?? [])],
  // Phase 9: floor-item queries. Zero-cost. `items_here()` returns the stack
  // on the hero's tile (topmost first — LIFO, matches doPickup() default).
  // `items_nearby(r?)` Manhattan-sorted by distance; radius defaults to 4.
  items_here: (world: World, self: Actor): FloorItem[] => {
    const floor = world.room.floorItems ?? [];
    const here = floor.filter(f => f.pos.x === self.pos.x && f.pos.y === self.pos.y);
    here.reverse();
    return here.map(f => ({ ...f, pos: { ...f.pos } }));
  },
  items_nearby: (world: World, self: Actor, r?: unknown): FloorItem[] => {
    const radius = typeof r === "number" && r >= 0 ? Math.floor(r) : 4;
    const floor = world.room.floorItems ?? [];
    const within = floor.filter(f => manhattan(f.pos, self.pos) <= radius);
    return sortByDistance(self, within).map(f => ({ ...f, pos: { ...f.pos } }));
  },
};

// ──────────────────────────── command impls ────────────────────────────

// Each command returns the list of events to append. The scheduler bills
// cost separately; a failed action still costs (see design doc).

export function doApproach(world: World, self: Actor, targetRef: unknown): GameEvent[] {
  const pos = resolvePos(world, targetRef);
  if (!pos) return [fail(self, "approach", "no target")];
  return stepToward(world, self, pos, "approach", +1);
}

export function doFlee(world: World, self: Actor, targetRef: unknown): GameEvent[] {
  const pos = resolvePos(world, targetRef);
  if (!pos) return [fail(self, "flee", "no target")];
  return stepToward(world, self, pos, "flee", -1);
}

function stepToward(
  world: World,
  self: Actor,
  target: Pos,
  actionName: string,
  direction: 1 | -1,
): GameEvent[] {
  const dx = (target.x - self.pos.x) * direction;
  const dy = (target.y - self.pos.y) * direction;
  // primary = larger |delta|; tie → x first
  const tryOrder: Pos[] = [];
  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx !== 0) tryOrder.push({ x: self.pos.x + sign(dx), y: self.pos.y });
    if (dy !== 0) tryOrder.push({ x: self.pos.x, y: self.pos.y + sign(dy) });
  } else {
    if (dy !== 0) tryOrder.push({ x: self.pos.x, y: self.pos.y + sign(dy) });
    if (dx !== 0) tryOrder.push({ x: self.pos.x + sign(dx), y: self.pos.y });
  }
  for (const next of tryOrder) {
    if (!inBounds(world, next)) continue;
    if (actorAt(world, next)) continue;
    const from = { ...self.pos };
    self.pos = next;
    return [{ type: "Moved", actor: self.id, from, to: next }];
  }
  return [fail(self, actionName, "blocked")];
}

export function doAttack(world: World, self: Actor, targetRef: unknown): GameEvent[] {
  const target = resolveActor(world, targetRef);
  if (!target) return [fail(self, "attack", "no target")];
  if (!orthogonallyAdjacent(self.pos, target.pos)) {
    return [fail(self, "attack", "not adjacent")];
  }
  const dmg = DAMAGE_BY_KIND[self.kind] ?? 1;
  target.hp -= dmg;
  const events: GameEvent[] = [
    { type: "Attacked", attacker: self.id, defender: target.id, damage: dmg },
    { type: "Hit", actor: target.id, attacker: self.id, damage: dmg },
  ];
  if (target.hp <= 0) {
    target.alive = false;
    events.push({ type: "Died", actor: target.id });
    if (target.kind === "hero") {
      events.push({ type: "HeroDied", actor: target.id });
    }
  }
  // Phase 7: on-hit proc from attacker's dagger (if any). Skipped if defender
  // died — onHitHook re-checks alive internally, so this is belt-and-braces.
  events.push(...onHitHook(world, self, target));
  return events;
}

// Phase 7: consumable use. Accepts an ItemInstance or a bare defId (string).
// defId lookup picks the first matching instance in the bag (deterministic
// by insertion order).
export function doUse(world: World, self: Actor, itemRef: unknown): GameEvent[] {
  let instance: ItemInstance | null = null;
  if (itemRef && typeof itemRef === "object") {
    const r = itemRef as ItemInstance;
    if (typeof r.id === "string" && typeof r.defId === "string") instance = r;
  } else if (typeof itemRef === "string") {
    const bag = self.inventory?.consumables ?? [];
    const hit = bag.find(i => i.defId === itemRef);
    if (hit) instance = hit;
    else return [{ type: "ActionFailed", actor: self.id, action: "use", reason: `No '${itemRef}' in bag.` }];
  }
  if (!instance) return [{ type: "ActionFailed", actor: self.id, action: "use", reason: "no item" }];
  return useItem(world, self, instance);
}

// Mirrors castFailedCleanly: failed use() emits only ActionFailed → refund.
export function useFailedCleanly(events: GameEvent[]): boolean {
  return events.length === 1 && events[0]!.type === "ActionFailed";
}

// Phase 9: same refund shape for pickup/drop so bag-full loops don't drain
// energy while the hero retries.
export function pickupFailedCleanly(events: GameEvent[]): boolean {
  return events.length === 1 && events[0]!.type === "ActionFailed";
}
export function dropFailedCleanly(events: GameEvent[]): boolean {
  return events.length === 1 && events[0]!.type === "ActionFailed";
}

export function doCast(
  world: World,
  self: Actor,
  spell: string,
  targetRef: unknown,
): GameEvent[] {
  // Heal defaults to self when called without target (cCast("heal") / legacy scripts).
  if (spell === "heal" && (targetRef === null || targetRef === undefined)) {
    targetRef = self;
  }
  return castSpell(world, self, spell, targetRef);
}

// True when a cast emitted only an ActionFailed and no other effects — used
// by the scheduler to refund the cast cost (Phase 6 policy: failed spells
// don't consume the action slot).
export function castFailedCleanly(events: GameEvent[]): boolean {
  return events.length === 1 && events[0]!.type === "ActionFailed";
}

export function doWait(world: World, self: Actor): GameEvent[] {
  return [{ type: "Waited", actor: self.id }];
}

export function doExit(world: World, self: Actor, doorRef: unknown): GameEvent[] {
  const door = resolveDoor(world, doorRef);
  if (!door) return [fail(self, "exit", "no such door")];
  if (self.pos.x !== door.pos.x || self.pos.y !== door.pos.y) {
    return [fail(self, "exit", "not on door tile")];
  }
  return [{ type: "HeroExited", actor: self.id, door: door.dir }];
}

export function doHalt(world: World, self: Actor): GameEvent[] {
  return [{ type: "Halted", actor: self.id }];
}

function fail(self: Actor, action: string, reason: string): GameEvent {
  return { type: "ActionFailed", actor: self.id, action, reason };
}
