// Commands (actions with cost) and queries (zero-cost lookups).
// Target resolution goes through a single seam: `resolveTarget`.

import type {
  Actor, World, Pos, GameEvent, Door, Direction, Item, Chest, ItemInstance, FloorItem, ResolveFailureMode, ItemDef,
} from "./types.js";
import { hasEffect, listEffects, effectiveStats } from "./effects.js";
import { castSpell, validateCast } from "./spells/cast.js";
import { useItem, onHitHook, onDamageHook, onKillHook, onCastHook } from "./items/execute.js";
import { doPickup, doDrop } from "./items/loot.js";
import { ITEMS } from "./content/items.js";
import { createActor, MONSTER_TEMPLATES } from "./content/monsters.js";
import { worldRandom } from "./rng.js";
import { hasLineOfSight } from "./los.js";

export { hasLineOfSight };

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
  summon: 15,
  notify: 0,
} as const;

// ──────────────────────────── small helpers ────────────────────────────

export function manhattan(a: Pos, b: Pos): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

// Phase 13.5: single source of truth for actor-to-actor distance. Matches
// approach()'s 8-directional one-tile-per-tick movement so adjacency,
// melee range, and pathing all agree.
export function chebyshev(a: Pos, b: Pos): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
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

// Phase 13.5: chebyshev-based adjacency. Diagonals count as adjacent for
// melee, matching how approach() steps. The old name is kept as an alias
// pointing at the new metric so existing imports don't break.
export function adjacent(a: Pos, b: Pos): boolean {
  return chebyshev(a, b) === 1;
}
export const orthogonallyAdjacent = adjacent;

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
    const da = chebyshev(getPos(a), self.pos);
    const db = chebyshev(getPos(b), self.pos);
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
    const sf = self.faction ?? (self.isHero ? "player" : "enemy");
    const others = world.actors.filter(a => {
      if (!a.alive || a.id === self.id) return false;
      const af = a.faction ?? (a.isHero ? "player" : "enemy");
      // Two neutrals ignore each other.
      if (sf === "neutral" && af === "neutral") return false;
      return af !== sf;
    });
    return sortByDistance(self, others);
  },
  allies: (world: World, self: Actor): Actor[] => {
    const sf = self.faction ?? (self.isHero ? "player" : "enemy");
    const others = world.actors.filter(a => {
      if (!a.alive || a.id === self.id) return false;
      const af = a.faction ?? (a.isHero ? "player" : "enemy");
      // Two neutrals are not allies.
      if (sf === "neutral" && af === "neutral") return false;
      return af === sf;
    });
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
  // distance(a, b), adjacent(a, b), can_cast(...), has_effect(...) and the
  // effects(...) standalone were dropped in Phase 13.5 — use the actor surface
  // methods instead: a.distance_to(b), a.adjacent_to(b), me.can_cast(...),
  // a.has_effect(...), a.list_effects().
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
    const within = floor.filter(f => chebyshev(f.pos, self.pos) <= radius);
    return sortByDistance(self, within).map(f => ({ ...f, pos: { ...f.pos } }));
  },
  // Phase 13.2: RNG builtins — backed by the world's seedable mulberry32 RNG.
  chance: (world: World, _self: Actor, p: unknown): boolean => {
    const pct = typeof p === "number" ? p : 0;
    return worldRandom(world) * 100 < pct;
  },
  random: (world: World, _self: Actor, n: unknown): number => {
    const max = typeof n === "number" ? Math.floor(n) : 0;
    if (max <= 0) return 0;
    return Math.floor(worldRandom(world) * max);
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
  if (!adjacent(self.pos, target.pos)) {
    return [fail(self, "attack", "not adjacent")];
  }

  // Phase 13.4: use effectiveStats so equipment bonuses and effect modifiers
  // (might, chill, etc.) are reflected. Defender's def is subtracted; minimum 1.
  const selfStats   = effectiveStats(self);
  const targetStats = effectiveStats(target);
  let rawDmg = Math.max(1, selfStats.atk - targetStats.def);

  // Phase 13: expose — target's incoming physical damage is multiplied by
  // (1 + magnitude%). Applied before shield absorption.
  const exposeEff = (target.effects ?? []).find(e => e.kind === "expose");
  if (exposeEff) rawDmg = Math.floor(rawDmg * (1 + (exposeEff.magnitude ?? 25) / 100));

  // Phase 13: shield — drain shieldHp first; only overflow reaches hp.
  // Attacked.damage carries the full raw hit so callers see the true blow.
  let shieldAbsorbed = 0;
  let hpDmg = rawDmg;
  if ((target.shieldHp ?? 0) > 0) {
    shieldAbsorbed = Math.min(target.shieldHp!, rawDmg);
    target.shieldHp = target.shieldHp! - shieldAbsorbed;
    hpDmg = rawDmg - shieldAbsorbed;
  }

  target.hp -= hpDmg;
  const events: GameEvent[] = [
    { type: "Attacked", attacker: self.id, defender: target.id, damage: rawDmg },
    { type: "Hit", actor: target.id, attacker: self.id, damage: hpDmg,
      ...(shieldAbsorbed > 0 ? { shieldAbsorbed } : {}) },
  ];

  const killed = target.hp <= 0;
  if (killed) {
    target.alive = false;
    events.push({ type: "Died", actor: target.id });
    if (target.isHero) events.push({ type: "HeroDied", actor: target.id });
    // on_kill: wearer kills the target.
    events.push(...onKillHook(world, self, target));
  }

  // on_hit: fires on any connected melee (even lethal — effect still applies).
  events.push(...onHitHook(world, self, target));

  // on_damage: fires on the defender after hp update. fromProc=false for melee.
  events.push(...onDamageHook(world, target, self, false));

  return events;
}

// ──────────────────────────── LOS helper ────────────────────────────

// ──────────────────────────── use() generalization ────────────────────────────

// Faction helper — mirrors sameFaction in spells/cast.ts.
function sameFaction(a: Actor, b: Actor): boolean {
  const fa = a.faction ?? (a.isHero ? "player" : "enemy");
  const fb = b.faction ?? (b.isHero ? "player" : "enemy");
  if (fa === "neutral" && fb === "neutral") return false;
  return fa === fb;
}

type UseValidation =
  | { ok: true; targetActor: Actor | null; targetPos: Pos | null }
  | { ok: false; reason: string };

function validateUseGates(
  world: World,
  self: Actor,
  def: ItemDef,
  targetRef: unknown,
): UseValidation {
  const useTarget = def.useTarget ?? "self";
  let targetActor: Actor | null = null;
  let targetPos: Pos | null = null;

  if (useTarget === "self") {
    targetActor = self;
    targetPos = { ...self.pos };
  } else if (useTarget === "tile") {
    // Accept a bare Pos or an actor position.
    const pos = resolvePos(world, targetRef);
    if (!pos) return { ok: false, reason: `${def.name} needs a tile target.` };
    targetPos = pos;
  } else {
    // ally or enemy — must be a live actor.
    targetActor = resolveActor(world, targetRef);
    if (!targetActor) {
      const need = useTarget === "ally" ? "an ally" : "an enemy";
      return { ok: false, reason: `${def.name} needs ${need} target.` };
    }
    if (useTarget === "ally" && !sameFaction(self, targetActor)) {
      return { ok: false, reason: `${def.name} can only target allies.` };
    }
    if (useTarget === "enemy" && sameFaction(self, targetActor)) {
      return { ok: false, reason: `${def.name} can only target enemies.` };
    }
    targetPos = { ...targetActor.pos };
  }

  // Range gate.
  const range = def.range ?? 0;
  if (targetPos && chebyshev(self.pos, targetPos) > range) {
    return { ok: false, reason: `Target is out of range (max ${range} tiles).` };
  }

  // LOS gate (skip for self-target — you always affect yourself).
  if (useTarget !== "self" && targetPos && !hasLineOfSight(world, self.pos, targetPos)) {
    return { ok: false, reason: "No line of sight to target." };
  }

  return { ok: true, targetActor, targetPos };
}

// Consumable use. Accepts an ItemInstance or a bare defId (string) as itemRef.
// Optional targetRef: omit for self-target items; provide an actor or tile for
// ally/enemy/tile-targeted items. All validation (faction, range, LOS) runs
// here BEFORE the item is consumed (pre-spend discipline).
export function doUse(world: World, self: Actor, itemRef: unknown, targetRef?: unknown): GameEvent[] {
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

  const def = ITEMS[instance.defId];
  if (!def) return [{ type: "ActionFailed", actor: self.id, action: "use", reason: `Unknown item '${instance.defId}'.` }];
  if (def.kind !== "consumable") {
    return [{ type: "ActionFailed", actor: self.id, action: "use", reason: `${def.name} is not a consumable.` }];
  }

  // Pre-spend gate: all validations before item is removed from bag.
  const v = validateUseGates(world, self, def, targetRef ?? self);
  if (!v.ok) return [{ type: "ActionFailed", actor: self.id, action: "use", reason: v.reason }];

  return useItem(world, self, instance, v.targetActor, v.targetPos);
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
  const events = castSpell(world, self, spell, targetRef);
  // on_cast: fires after a successful cast (mp spent, body executed).
  // Failed casts (ActionFailed only) do not trigger.
  if (!castFailedCleanly(events)) {
    events.push(...onCastHook(world, self));
  }
  return events;
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

// `exit` is position-driven: any door tile works. The arg is accepted for
// backward compat with `exit("N")` / `exit(doors()[0])` but ignored —
// whichever door the hero is standing on exits.
// Before emitting HeroExited, any scroll items in the bag are processed:
// new spells are learned; duplicates are silently discarded.
export function doExit(world: World, self: Actor, _doorRef?: unknown): GameEvent[] {
  const door = world.room.doors.find(
    d => d.pos.x === self.pos.x && d.pos.y === self.pos.y,
  );
  if (!door) return [fail(self, "exit", "not on a door tile")];
  const events: GameEvent[] = processScrolls(self);
  events.push({ type: "HeroExited", actor: self.id, door: door.dir });
  return events;
}

// Process all scroll items in the hero's bag at room exit.
// For each scroll: if its spell is not yet known → learn it (SpellLearned +
// ScrollDiscarded reason:"learned"); if already known → discard silently
// (ScrollDiscarded reason:"duplicate"). Scrolls are always removed from bag.
function processScrolls(hero: Actor): GameEvent[] {
  const bag = hero.inventory?.consumables;
  if (!bag || bag.length === 0) return [];

  const events: GameEvent[] = [];
  const keep: typeof bag = [];

  for (const inst of bag) {
    const def = ITEMS[inst.defId];
    if (!def || def.kind !== "scroll") {
      keep.push(inst);
      continue;
    }
    const spellId = def.spell;
    if (!spellId) {
      // Malformed scroll — discard silently.
      events.push({ type: "ScrollDiscarded", actor: hero.id, defId: inst.defId, reason: "duplicate" });
      continue;
    }
    const known = hero.knownSpells ?? [];
    if (!known.includes(spellId)) {
      hero.knownSpells = [...known, spellId];
      events.push({ type: "SpellLearned", actor: hero.id, spell: spellId });
      events.push({ type: "ScrollDiscarded", actor: hero.id, defId: inst.defId, reason: "learned" });
    } else {
      events.push({ type: "ScrollDiscarded", actor: hero.id, defId: inst.defId, reason: "duplicate" });
    }
  }

  hero.inventory!.consumables = keep;
  return events;
}

export function doHalt(world: World, self: Actor): GameEvent[] {
  return [{ type: "Halted", actor: self.id }];
}

export function doNotify(
  world: World, self: Actor,
  text: string,
  style?: string,
  duration?: number,
  position?: string,
): GameEvent[] {
  const ev: GameEvent = {
    type: "Notified",
    actor: self.id,
    text,
    ...(style    ? { style:    style    as "info" | "warning" | "error" | "success" } : {}),
    ...(duration !== undefined ? { duration } : {}),
    ...(position ? { position: position as "top" | "center" | "bottom" } : {}),
  };
  return [ev];
}

// Phase 13.2: direct-script summon(templateId, targetPos).
// Unlike the spell primitive version, this checks template.summonMpCost for the
// MP gate (the spell wrapper has already gated MP when called via cast()).
export function doSummon(
  world: World,
  self: Actor,
  templateRef: unknown,
  targetRef: unknown,
): GameEvent[] {
  const tid = String(templateRef ?? "");
  const tpl = MONSTER_TEMPLATES[tid];
  if (!tpl) {
    return [fail(self, "summon", `Unknown monster template '${tid}'.`)];
  }

  // MP gate — direct script calls pay template.summonMpCost.
  const mpCost = tpl.summonMpCost ?? 0;
  if ((self.mp ?? 0) < mpCost) {
    return [fail(self, "summon", `Not enough mana (needs ${mpCost}, you have ${self.mp ?? 0}).`)];
  }

  // Summon-cap check.
  const cap = Math.max(1, Math.floor((self.int ?? 0) / 4));
  const owned = world.actors.filter(a => a.alive && a.owner === self.id).length;
  if (owned >= cap) {
    return [fail(self, "summon", "summon cap reached")];
  }

  // Tile validation.
  const pos = resolvePos(world, targetRef);
  if (!pos) return [fail(self, "summon", "summon needs a tile target")];
  if (!inBounds(world, pos)) return [fail(self, "summon", "target tile is out of bounds")];
  if (actorAt(world, pos)) return [fail(self, "summon", "target tile is occupied")];

  // Deduct MP, spawn actor.
  if (mpCost > 0) {
    self.mp = (self.mp ?? 0) - mpCost;
    world.log.push({ t: world.tick, event: { type: "ManaChanged", actor: self.id, amount: -mpCost } });
  }

  const n = (world.actorSeq ?? 0) + 1;
  world.actorSeq = n;
  const newActor = createActor(tid, pos, `s${n}`);
  newActor.faction = self.faction ?? (self.isHero ? "player" : "enemy");
  newActor.owner = self.id;
  newActor.summoned = true;
  world.actors.push(newActor);

  return [
    { type: "Summoned", actor: newActor.id, summoner: self.id, template: tid, pos: { ...pos } },
    { type: "VisualBurst", pos: { ...pos }, visual: "summon_portal", element: "arcane" },
  ];
}

export function summonFailedCleanly(events: GameEvent[]): boolean {
  return events.length === 1 && events[0]!.type === "ActionFailed";
}

function fail(self: Actor, action: string, reason: string): GameEvent {
  return { type: "ActionFailed", actor: self.id, action, reason };
}
