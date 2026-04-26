// Commands (actions with cost) and queries (zero-cost lookups).
// Target resolution goes through a single seam: `resolveTarget`.

import type {
  Actor, World, Pos, GameEvent, Door, Direction, Chest, ItemInstance, FloorItem, ResolveFailureMode, ItemDef, RoomObject,
} from "./types.js";
import { hasEffect, listEffects, effectiveStats, getEffect } from "./effects.js";
import { castSpell, validateCast } from "./spells/cast.js";
import { useItem, onHitHook, onDamageHook, onKillHook, onCastHook } from "./items/execute.js";
import { doPickup, doDrop } from "./items/loot.js";
import { ITEMS } from "./content/items.js";
import { createActor, MONSTER_TEMPLATES } from "./content/monsters.js";
import { worldRandom } from "./rng.js";
import { hasLineOfSight } from "./los.js";
import { doInteractCore, tileBlocked } from "./dungeon/objects.js";
import { chebyshev, manhattan, inBounds, adjacent } from "./geometry.js";
import { resolveActor, resolvePos, sameFaction } from "./resolve.js";
import { actionFailed } from "./lang/errors.js";

export { hasLineOfSight };
export { chebyshev, manhattan, inBounds, adjacent };
export { resolveActor, resolvePos };

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
  interact: 10,
} as const;

// Local alias kept short for the many call sites in this file.
const fail = actionFailed;

// ──────────────────────────── small helpers ────────────────────────────

export function actorAt(world: World, p: Pos): Actor | null {
  for (const a of world.actors) {
    if (a.alive && a.pos.x === p.x && a.pos.y === p.y) return a;
  }
  return null;
}

// Pre-13.5 alias kept so existing imports don't break.
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
  // Shortcuts for self-state. The convention is "room data = bare query,
  // self data = me.foo" — these four are kept as aliases because they show
  // up constantly in scripts (`if hp() < 5: ...`) and read more naturally
  // than `me.hp` in arithmetic-heavy guards.
  hp:     (_world: World, self: Actor): number => self.hp,
  max_hp: (_world: World, self: Actor): number => self.maxHp ?? 0,
  mp:     (_world: World, self: Actor): number => self.mp ?? 0,
  max_mp: (_world: World, self: Actor): number => self.maxMp ?? 0,
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
  chests: (world: World, self: Actor): Chest[] => sortByDistance(self, world.room.chests),
  doors: (world: World, self: Actor): Door[] => sortByDistance(self, world.room.doors),
  at: (_world: World, self: Actor, target: unknown): boolean => {
    const p = resolvePos(target);
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
  // Floor pickups, Chebyshev nearest-first. No arg → all floor items in the
  // room. With `r`, restrict to Chebyshev distance ≤ r (so `items(0)` is the
  // stack on the hero's tile).
  items: (world: World, self: Actor, r?: unknown): FloorItem[] => {
    const floor = world.room.floorItems ?? [];
    const filtered = (typeof r === "number" && r >= 0)
      ? floor.filter(f => chebyshev(f.pos, self.pos) <= Math.floor(r))
      : floor;
    return sortByDistance(self, filtered).map(f => ({ ...f, pos: { ...f.pos } }));
  },
  // Dungeon objects (chests, fountains, doors), Chebyshev nearest-first.
  // No arg → all objects in the room. With `r`, restrict to Chebyshev ≤ r.
  objects: (world: World, self: Actor, r?: unknown): RoomObject[] => {
    const objs = world.room.objects ?? [];
    const filtered = (typeof r === "number" && r >= 0)
      ? objs.filter(o => chebyshev(o.pos, self.pos) <= Math.floor(r))
      : objs;
    return sortByDistance(self, filtered).map(o => ({ ...o, pos: { ...o.pos } }));
  },
  // Chebyshev distance between any two pos-likes (actors, items, objects,
  // doors, chests, or bare {x,y} / {pos:{x,y}}). Returns 0 on unresolvable args.
  distance: (_world: World, _self: Actor, a: unknown, b: unknown): number => {
    const pa = resolvePos(a);
    const pb = resolvePos(b);
    if (!pa || !pb) return 0;
    return chebyshev(pa, pb);
  },
  // RNG builtins — backed by the world's seedable mulberry32 RNG.
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
  const pos = resolvePos(targetRef);
  if (!pos) return [fail(self, "approach", "no target")];
  return stepToward(world, self, pos, "approach", +1);
}

export function doFlee(world: World, self: Actor, targetRef: unknown): GameEvent[] {
  const pos = resolvePos(targetRef);
  if (!pos) return [fail(self, "flee", "no target")];
  return stepAwayFrom(world, self, pos);
}

// Flee scoring: among the 8 neighbors that don't decrease Chebyshev distance
// from the threat, pick the one with the most open neighbors (so we don't
// step into a corner). Ties broken by raw distance from threat.
function stepAwayFrom(world: World, self: Actor, threat: Pos): GameEvent[] {
  const here = self.pos;
  const curDist = chebyshev(here, threat);
  type Cand = { pos: Pos; dist: number; openness: number };
  const cands: Cand[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const next = { x: here.x + dx, y: here.y + dy };
      if (!inBounds(world, next)) continue;
      if (actorAt(world, next)) continue;
      if (tileBlocked(world, next)) continue;
      const dist = chebyshev(next, threat);
      if (dist < curDist) continue;
      let openness = 0;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          if (ox === 0 && oy === 0) continue;
          const n = { x: next.x + ox, y: next.y + oy };
          if (!inBounds(world, n)) continue;
          if (tileBlocked(world, n)) continue;
          openness++;
        }
      }
      cands.push({ pos: next, dist, openness });
    }
  }
  if (cands.length === 0) return [fail(self, "flee", "blocked")];
  cands.sort((a, b) => (b.openness - a.openness) || (b.dist - a.dist));
  const from = { ...self.pos };
  self.pos = cands[0]!.pos;
  return [{ type: "Moved", actor: self.id, from, to: self.pos }];
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
    if (tileBlocked(world, next)) continue;
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
  const exposeEff = getEffect(target, "expose");
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

// ──────────────────────────── use() generalization ────────────────────────────

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
    const pos = resolvePos(targetRef);
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
    else return [fail(self, "use", `No '${itemRef}' in bag.`)];
  }
  if (!instance) return [fail(self, "use", "no item")];

  const def = ITEMS[instance.defId];
  if (!def) return [fail(self, "use", `Unknown item '${instance.defId}'.`)];
  if (def.kind !== "consumable") {
    return [fail(self, "use", `${def.name} is not a consumable.`)];
  }

  // Pre-spend gate: all validations before item is removed from bag.
  const v = validateUseGates(world, self, def, targetRef ?? self);
  if (!v.ok) return [fail(self, "use", v.reason)];

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
  // Phase 15: locked exit door blocks exit() until interact() unlocks it.
  const lockedExit = (world.room.objects ?? []).find(
    o => o.kind === "exit_door_closed" && o.locked
        && Math.max(Math.abs(o.pos.x - self.pos.x), Math.abs(o.pos.y - self.pos.y)) <= 1,
  );
  if (lockedExit) return [fail(self, "exit", "the exit is sealed")];
  const events: GameEvent[] = processScrolls(self);
  events.push(...processFoundGear(self));
  events.push({ type: "HeroExited", actor: self.id, door: door.dir });
  return events;
}

// Process equipment picked up this run. New defIds are merged into knownGear
// (GearLearned + GearDiscarded reason:"learned"); already-known defIds are
// discarded silently (GearDiscarded reason:"duplicate"). foundGear is cleared.
function processFoundGear(hero: Actor): GameEvent[] {
  const found = hero.foundGear;
  if (!found || found.length === 0) return [];
  const events: GameEvent[] = [];
  const known = hero.knownGear ? [...hero.knownGear] : [];
  for (const defId of found) {
    const def = ITEMS[defId];
    if (!def || def.kind !== "equipment") {
      events.push({ type: "GearDiscarded", actor: hero.id, defId, reason: "duplicate" });
      continue;
    }
    if (!known.includes(defId)) {
      known.push(defId);
      events.push({ type: "GearLearned", actor: hero.id, defId });
      events.push({ type: "GearDiscarded", actor: hero.id, defId, reason: "learned" });
    } else {
      events.push({ type: "GearDiscarded", actor: hero.id, defId, reason: "duplicate" });
    }
  }
  hero.knownGear = known;
  hero.foundGear = [];
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
  const pos = resolvePos(targetRef);
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


// Phase 15: interact() — adjacent dungeon objects (chest/fountain/door/exit).
export function doInteract(world: World, self: Actor, ref: unknown): GameEvent[] {
  const result = doInteractCore(world, self, ref);
  return result.events;
}

export function interactFailedCleanly(events: GameEvent[]): boolean {
  // Failure shape from doInteractCore: ObjectInteracted result:"failed:*" + ActionFailed.
  if (events.length < 1) return false;
  return events.some(e => e.type === "ActionFailed");
}
