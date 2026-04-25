// Scheduler: energy accrual, action firing, event dispatch, abort.
//
// Per actor: a stack of frames [main, handler1, handler2, ...]. Each frame
// has its own generator and its own currently-yielded pending action, so
// preempting main with a handler doesn't discard main's pending.

import type {
  Actor, World, PendingAction, GameEvent, EventLog, SourceLoc,
} from "./types.js";
import { compile, type CompiledScript } from "./interpreter.js";
import { DSLRuntimeError } from "./lang/errors.js";
import {
  doApproach, doFlee, doAttack, doCast, doWait, doExit, doHalt, doUse,
  doPickup, doDrop, doSummon, doNotify,
  castFailedCleanly, useFailedCleanly, pickupFailedCleanly, dropFailedCleanly, summonFailedCleanly,
} from "./commands.js";
import { tickEffects, effectiveStats } from "./effects.js";
import { tickClouds } from "./clouds.js";
import { rollDeathDrops } from "./items/loot.js";
import { MONSTER_TEMPLATES, createActor } from "./content/monsters.js";

interface Frame {
  gen: Generator<PendingAction, void, unknown>;
  pending: PendingAction | null;
  // Resumed value for the next gen.next(). When a command call appears in
  // expression position the script receives this as the bool success result.
  lastResult: unknown;
}

interface QueuedEvent { event: string; binding: unknown; }

interface ActorRuntime {
  actor: Actor;
  compiled: CompiledScript;
  stack: Frame[];                  // [0] = main; last = active
  eventQueue: QueuedEvent[];
  halted: boolean;
}

export interface RunOptions {
  maxTicks?: number;
  onTick?: (world: World) => void; // called at the start of each tick
  // Phase 9: seed for the engine's deterministic RNG (mulberry32). Defaults
  // to 1 so omitting the option still produces reproducible runs.
  seed?: number;
}

export interface SchedulerState {
  runtimes: ActorRuntime[];
  opts: RunOptions;
  maxTicks: number;
  lastFiredLoc: SourceLoc | null;
}

export function createScheduler(world: World, opts: RunOptions = {}): SchedulerState {
  const runtimes: ActorRuntime[] = world.actors.map(actor => {
    const compiled = compile(actor.script, { world, self: actor });
    const mainFrame: Frame = { gen: compiled.makeMain(), pending: null, lastResult: undefined };
    return { actor, compiled, stack: [mainFrame], eventQueue: [], halted: false };
  });
  for (const rt of runtimes) ensurePending(rt, world);
  return { runtimes, opts, maxTicks: opts.maxTicks ?? 5000, lastFiredLoc: null };
}

export interface StepResult {
  events: GameEvent[];
  done: boolean;
}

// Advance the scheduler until exactly one actor-action fires, and return the
// events bundle from that action (cascading events — e.g. Attacked+Hit+Died —
// all come from one fire and count as one step).
export function stepOne(world: World, s: SchedulerState): StepResult {
  while (true) {
    if (world.aborted || world.ended) return { events: [], done: true };

    const ready = s.runtimes
      .filter(rt => rt.actor.alive && activeFrame(rt)?.pending != null
                    && rt.actor.energy >= activeFrame(rt)!.pending!.cost)
      .sort((a, b) => {
        if (b.actor.energy !== a.actor.energy) return b.actor.energy - a.actor.energy;
        return a.actor.id.localeCompare(b.actor.id);
      });

    if (ready.length > 0) {
      const rt = ready[0]!;
      const frame = activeFrame(rt)!;
      const action = frame.pending!;
      rt.actor.energy -= action.cost;
      frame.pending = null;
      s.lastFiredLoc = action.loc ?? null;

      const events = fireAction(world, rt.actor, action);
      appendOnDeathProcs(world, events);
      appendDeathDrops(world, events);
      appendRoomExitDespawn(world, events);
      // Phase 6: failed casts don't cost energy (actor tries again next tick).
      if (action.kind === "cast" && castFailedCleanly(events)) {
        rt.actor.energy += action.cost;
      }
      // Phase 7: failed use() mirrors the cast refund policy.
      if (action.kind === "use" && useFailedCleanly(events)) {
        rt.actor.energy += action.cost;
      }
      if (action.kind === "pickup" && pickupFailedCleanly(events)) {
        rt.actor.energy += action.cost;
      }
      if (action.kind === "drop" && dropFailedCleanly(events)) {
        rt.actor.energy += action.cost;
      }
      // Phase 13.2: failed direct summon() refunds energy like cast.
      if (action.kind === "summon" && summonFailedCleanly(events)) {
        rt.actor.energy += action.cost;
      }
      // Phase 13.5: feed bool back to the script. Any ActionFailed event in
      // this fire's bundle means the command did not succeed.
      frame.lastResult = !events.some(e => e.type === "ActionFailed");
      dispatch(world, s.runtimes, events);

      if (events.some(e => e.type === "HeroExited" || e.type === "HeroDied")) {
        world.ended = true;
      }
      if (action.kind === "halt") { rt.stack = []; rt.halted = true; }
      if (!rt.actor.alive)        { rt.stack = []; rt.halted = true; }

      for (const r of s.runtimes) ensurePending(r, world);
      // Sync newly spawned actors (e.g., summons) into the runtime list.
      syncNewActors(world, s);
      const done = world.ended || world.aborted || !anyLiveWork(s);
      return { events, done };
    }

    // Nothing ready this instant — advance one tick, accrue energy.
    if (world.tick >= s.maxTicks) return { events: [], done: true };
    world.tick += 1;
    s.opts.onTick?.(world);
    if (world.aborted) return { events: [], done: true };
    for (const a of world.actors) if (a.alive) a.energy += effectiveStats(a).speed;
    // Effect phase: runs after the prior tick's actions. Any emitted events
    // (EffectTick, Died, Healed, HeroDied) flow through dispatch so handlers
    // (e.g. on hit) see them uniformly.
    const effectEvents: GameEvent[] = [];
    for (const a of world.actors) effectEvents.push(...tickEffects(world, a));
    // Cloud phase: after effects, before next action. Emits its own events
    // (CloudTicked, CloudExpired) and may also emit EffectApplied/Died/etc.
    effectEvents.push(...tickClouds(world));
    appendOnDeathProcs(world, effectEvents);
    appendDeathDrops(world, effectEvents);
    if (effectEvents.length > 0) {
      dispatch(world, s.runtimes, effectEvents);
      if (effectEvents.some(e => e.type === "HeroDied" || e.type === "HeroExited")) {
        world.ended = true;
      }
    }
    for (const r of s.runtimes) ensurePending(r, world);
    if (world.ended || world.aborted) return { events: effectEvents, done: true };

    if (!anyLiveWork(s)) return { events: [], done: true };
  }
}

// Phase 14: for each Died, fire the victim's template-level on_death proc
// (currently: summon-on-death for slime → 2× lesser_slime). Runs BEFORE
// appendDeathDrops so corpse cleanup sees the spawned summons.
//
// Spec shape on MonsterTemplate:
//   onDeath?: { summon?: { template: string; count: number } }
//
// Spawned actors take the dying actor's faction (so a slime split keeps the
// slime's side) and are flagged summoned=true with owner=victim.id, which
// makes them follow the existing summoned-actor rules (no loot drops, etc).
// Loop guard: spawned summons themselves can declare onDeath, but their own
// death is a fresh Died event in a later tick — no recursion within a single
// scan. summoned=true also means a player-spawned slime split won't yield
// player loot.
function appendOnDeathProcs(world: World, events: GameEvent[]): void {
  const end = events.length;
  for (let i = 0; i < end; i++) {
    const ev = events[i]!;
    if (ev.type !== "Died") continue;
    const victim = world.actors.find(a => a.id === ev.actor);
    if (!victim) continue;
    const tpl = MONSTER_TEMPLATES[victim.kind];
    if (!tpl || !tpl.onDeath) continue;
    const sum = tpl.onDeath.summon;
    if (!sum) continue;
    const childTpl = MONSTER_TEMPLATES[sum.template];
    if (!childTpl) continue;
    let spawned = 0;
    const cx = victim.pos.x;
    const cy = victim.pos.y;
    // Walk the 8 adjacent tiles in a stable order; bail when we hit count.
    const offsets: Array<[number, number]> = [
      [-1, -1], [0, -1], [1, -1],
      [-1,  0],          [1,  0],
      [-1,  1], [0,  1], [1,  1],
    ];
    for (const [dx, dy] of offsets) {
      if (spawned >= sum.count) break;
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= world.room.w || ny >= world.room.h) continue;
      if (world.actors.some(a => a.alive && a.pos.x === nx && a.pos.y === ny)) continue;
      const n = (world.actorSeq ?? 0) + 1;
      world.actorSeq = n;
      const child = createActor(sum.template, { x: nx, y: ny }, `s${n}`);
      child.faction = victim.faction ?? (victim.isHero ? "player" : "enemy");
      // Mark summoned so the loot path skips them, but DO NOT set owner —
      // appendDeathDrops cascades despawnOwned(victim.id) right after this
      // helper, which would immediately kill any actor we just spawned.
      child.summoned = true;
      world.actors.push(child);
      events.push({
        type: "Summoned", actor: child.id, summoner: victim.id,
        template: sum.template, pos: { x: nx, y: ny },
      });
      spawned += 1;
    }
  }
}

// Phase 9: for each Died in `events`, roll the victim's loot table and append
// the resulting ItemDropped events in-place. Hero deaths never drop (no hero
// loot table, and even with one the HeroDied path ends the room anyway).
// Phase 13.2: summoned actors skip loot; their owner's death cascades despawns.
function appendDeathDrops(world: World, events: GameEvent[]): void {
  // Snapshot the current length — drops/despawns we push must not themselves
  // be re-scanned (they can't trigger further deaths/drops).
  const end = events.length;
  for (let i = 0; i < end; i++) {
    const ev = events[i]!;
    if (ev.type !== "Died") continue;
    const actor = world.actors.find(a => a.id === ev.actor);
    if (!actor) continue;
    if (!actor.summoned) events.push(...rollDeathDrops(world, actor));
    // Cascade: despawn all live actors this actor owned.
    events.push(...despawnOwned(world, actor.id, "summoner_died"));
  }
}

// Mark all live actors owned by `ownerId` as dead and emit Despawned events.
// Cascades recursively so a summon that itself has summons also despawns them.
function despawnOwned(world: World, ownerId: string, reason: "room_exit" | "summoner_died"): GameEvent[] {
  const out: GameEvent[] = [];
  for (const a of world.actors) {
    if (!a.alive || a.owner !== ownerId) continue;
    a.alive = false;
    out.push({ type: "Despawned", actor: a.id, reason });
    out.push(...despawnOwned(world, a.id, reason));
  }
  return out;
}

// Phase 13.2: on room-exit, despawn every owned (summoned) actor.
function appendRoomExitDespawn(world: World, events: GameEvent[]): void {
  if (!events.some(e => e.type === "HeroExited")) return;
  events.push(...despawnAllOwned(world));
}

function despawnAllOwned(world: World): GameEvent[] {
  const out: GameEvent[] = [];
  for (const a of world.actors) {
    if (!a.alive || !a.owner) continue;
    a.alive = false;
    out.push({ type: "Despawned", actor: a.id, reason: "room_exit" });
  }
  return out;
}

function anyLiveWork(s: SchedulerState): boolean {
  // A halted actor with an active handler frame still has work to do.
  return s.runtimes.some(r => r.actor.alive && r.stack.length > 0);
}

// Phase 13.2: create runtimes for any actors that were added to world.actors
// after createScheduler() ran (e.g., summoned actors). Called after each step.
function syncNewActors(world: World, s: SchedulerState): void {
  const knownIds = new Set(s.runtimes.map(r => r.actor.id));
  for (const a of world.actors) {
    if (knownIds.has(a.id)) continue;
    const compiled = compile(a.script, { world, self: a });
    const rt: ActorRuntime = {
      actor: a,
      compiled,
      stack: [{ gen: compiled.makeMain(), pending: null, lastResult: undefined }],
      eventQueue: [],
      halted: false,
    };
    s.runtimes.push(rt);
    ensurePending(rt, world);
  }
}

export function runLoop(world: World, opts: RunOptions = {}): void {
  const s = createScheduler(world, opts);
  while (true) {
    const r = stepOne(world, s);
    if (r.done) break;
  }
  return;
}


function activeFrame(rt: ActorRuntime): Frame | null {
  return rt.stack.length > 0 ? rt.stack[rt.stack.length - 1]! : null;
}

// ──────────────────────────── generator advancement ────────────────────────────

function ensurePending(rt: ActorRuntime, world: World): void {
  // NB: `halted` means main ran halt(); per engine-design.md § Events and
  // handler preemption, handlers must still fire. So we only gate on alive —
  // a handler frame pushed onto a halted actor's stack still advances.
  if (!rt.actor.alive) return;
  while (true) {
    const frame = activeFrame(rt);
    if (!frame) {
      // Stack empty: main is done. Handlers can still fire — drain queue.
      if (tryStartNextHandler(rt)) continue;
      return;
    }
    if (frame.pending !== null) return;
    let r: IteratorResult<PendingAction, void>;
    try {
      // The first .next() call's argument is ignored by the generator
      // protocol; subsequent calls feed the resumed value back into the
      // yield expression. Tracking lastResult per-frame lets command calls
      // in expression position resolve to a bool.
      r = frame.gen.next(frame.lastResult);
      frame.lastResult = undefined;
    } catch (e) {
      if (e instanceof DSLRuntimeError) {
        world.log.push({ t: world.tick, event: { type: "ScriptError", actor: rt.actor.id, message: e.message } });
        r = { done: true, value: undefined };
      } else {
        throw e;
      }
    }
    if (r.done) {
      rt.stack.pop();
      const poppedWasHandler = rt.stack.length >= 1;
      if (poppedWasHandler) {
        // A handler finished. Drain queue (one-at-a-time).
        tryStartNextHandler(rt);
      }
      // Loop continues: active frame is now the thing underneath (main or
      // a still-running handler) — its pending is already set if any.
      continue;
    }
    frame.pending = r.value;
    return;
  }
}

function tryStartNextHandler(rt: ActorRuntime): boolean {
  while (rt.eventQueue.length > 0) {
    const next = rt.eventQueue.shift()!;
    const h = rt.compiled.handlerFor(next.event);
    if (!h) continue;
    rt.stack.push({ gen: rt.compiled.makeHandler(h, next.binding), pending: null, lastResult: undefined });
    return true;
  }
  return false;
}

// ──────────────────────────── action firing ────────────────────────────

function fireAction(world: World, self: Actor, action: PendingAction): GameEvent[] {
  switch (action.kind) {
    case "approach": return doApproach(world, self, action.target);
    case "flee":     return doFlee(world, self, action.target);
    case "attack":   return doAttack(world, self, action.target);
    case "cast":     return doCast(world, self, action.spell, action.target);
    case "wait":     return doWait(world, self);
    case "exit":     return doExit(world, self, action.door);
    case "halt":     return doHalt(world, self);
    case "use":      return doUse(world, self, action.item, action.target);
    case "pickup":   return doPickup(world, self, action.target);
    case "drop":     return doDrop(world, self, action.target);
    case "summon":   return doSummon(world, self, action.template, action.target);
    case "notify":   return doNotify(world, self, action.text, action.style, action.duration, action.position);
  }
}

// ──────────────────────────── event dispatch ────────────────────────────

function dispatch(world: World, runtimes: ActorRuntime[], events: GameEvent[]): void {
  for (const ev of events) {
    world.log.push({ t: world.tick, event: ev });

    const routed = mapEventToHandler(world, ev);
    if (!routed) continue;

    const targetRt = runtimes.find(rt => rt.actor.id === routed.actorId);
    if (!targetRt || !targetRt.actor.alive) continue;
    if (!targetRt.compiled.handlerFor(routed.event)) continue;

    // One handler at a time per actor.
    const handlerActive = targetRt.stack.length > 1;
    if (handlerActive) {
      targetRt.eventQueue.push({ event: routed.event, binding: routed.binding });
    } else {
      const h = targetRt.compiled.handlerFor(routed.event)!;
      targetRt.stack.push({
        gen: targetRt.compiled.makeHandler(h, routed.binding),
        pending: null,
        lastResult: undefined,
      });
    }
  }
}

function mapEventToHandler(
  world: World,
  ev: GameEvent,
): { actorId: string; event: string; binding: unknown } | null {
  switch (ev.type) {
    case "Hit": {
      const attacker = world.actors.find(a => a.id === ev.attacker) ?? null;
      return { actorId: ev.actor, event: "hit", binding: attacker };
    }
    case "See":
      return { actorId: ev.actor, event: "see", binding: ev.what };
    default:
      return null;
  }
}

// ──────────────────────────── log helpers ────────────────────────────

export function formatLogEntry(e: { t: number; event: GameEvent }): string {
  const { t, event } = e;
  switch (event.type) {
    case "Moved": return `[t=${t}] ${event.actor}.moved — (${event.from.x},${event.from.y})→(${event.to.x},${event.to.y})`;
    case "Attacked": return `[t=${t}] ${event.attacker}.attacked — ${event.defender} for ${event.damage}`;
    case "Hit": return `[t=${t}] ${event.actor}.hit — by ${event.attacker} for ${event.damage}`;
    case "Missed": return `[t=${t}] ${event.actor}.missed — ${event.reason}`;
    case "Cast": return `[t=${t}] ${event.actor}.cast — ${event.spell}${event.target ? ` on ${event.target}` : ""} (${event.amount})`;
    case "Healed": return `[t=${t}] ${event.actor}.healed — +${event.amount}`;
    case "Waited": return `[t=${t}] ${event.actor}.waited`;
    case "Died": return `[t=${t}] ${event.actor}.died`;
    case "HeroDied": return `[t=${t}] ${event.actor}.heroDied`;
    case "HeroExited": return `[t=${t}] ${event.actor}.heroExited — ${event.door}`;
    case "Halted": return `[t=${t}] ${event.actor}.halted`;
    case "Idled": return `[t=${t}] ${event.actor}.idled`;
    case "ActionFailed": return `[t=${t}] ${event.actor}.actionFailed — ${event.action}: ${event.reason}`;
    case "See": return `[t=${t}] ${event.actor}.see — ${event.what}`;
    case "EffectApplied": return `[t=${t}] ${event.actor}.effectApplied — ${event.kind}`;
    case "EffectTick": return `[t=${t}] ${event.actor}.effectTick — ${event.kind}${event.magnitude !== undefined ? ` (${event.magnitude})` : ""}`;
    case "EffectExpired": return `[t=${t}] ${event.actor}.effectExpired — ${event.kind}`;
    case "CloudSpawned": return `[t=${t}] cloud.${event.id}.spawned — ${event.kind} @(${event.pos.x},${event.pos.y})`;
    case "CloudTicked": return `[t=${t}] cloud.${event.id}.ticked — ${event.appliedTo.length} affected`;
    case "CloudExpired": return `[t=${t}] cloud.${event.id}.expired`;
    case "VisualBurst": return `[t=${t}] burst — ${event.visual} @(${event.pos.x},${event.pos.y})`;
    case "ItemUsed": return `[t=${t}] ${event.actor}.itemUsed — ${event.defId}`;
    case "ItemEquipped": return `[t=${t}] ${event.actor}.itemEquipped — ${event.defId} (${event.slot})`;
    case "ItemUnequipped": return `[t=${t}] ${event.actor}.itemUnequipped — ${event.defId} (${event.slot})`;
    case "OnHitTriggered": return `[t=${t}] ${event.attacker}.onHit — ${event.defId} → ${event.defender}`;
    case "ItemDropped": return `[t=${t}] ${event.actor ?? "?"}.itemDropped — ${event.defId} @(${event.pos.x},${event.pos.y}) [${event.source}]`;
    case "ItemPickedUp": return `[t=${t}] ${event.actor}.itemPickedUp — ${event.defId}`;
    case "Summoned": return `[t=${t}] ${event.actor}.summoned — by ${event.summoner} (${event.template}) @(${event.pos.x},${event.pos.y})`;
    case "Despawned": return `[t=${t}] ${event.actor}.despawned — ${event.reason}`;
    case "ScriptError": return `[t=${t}] ${event.actor}.scriptError — ${event.message}`;
    case "SpellLearned": return `[t=${t}] ${event.actor}.spellLearned — ${event.spell}`;
    case "ScrollDiscarded": return `[t=${t}] ${event.actor}.scrollDiscarded — ${event.defId} (${event.reason})`;
    case "GearLearned": return `[t=${t}] ${event.actor}.gearLearned — ${event.defId}`;
    case "GearDiscarded": return `[t=${t}] ${event.actor}.gearDiscarded — ${event.defId} (${event.reason})`;
    case "ManaChanged": return `[t=${t}] ${event.actor}.manaChanged — ${event.amount}`;
    case "Notified": return `[t=${t}] ${event.actor}.notify — ${event.text}`;
  }
}

export type { EventLog };
