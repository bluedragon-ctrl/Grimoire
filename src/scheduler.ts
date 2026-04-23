// Scheduler: energy accrual, action firing, event dispatch, abort.
//
// Per actor: a stack of frames [main, handler1, handler2, ...]. Each frame
// has its own generator and its own currently-yielded pending action, so
// preempting main with a handler doesn't discard main's pending.

import type {
  Actor, World, PendingAction, GameEvent, EventLog, SourceLoc,
} from "./types.js";
import { compile, type CompiledScript } from "./interpreter.js";
import {
  doApproach, doFlee, doAttack, doCast, doWait, doExit, doHalt, castFailedCleanly,
} from "./commands.js";
import { tickEffects, effectiveStats } from "./effects.js";
import { tickClouds } from "./clouds.js";

interface Frame {
  gen: Generator<PendingAction, void, void>;
  pending: PendingAction | null;
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
    const mainFrame: Frame = { gen: compiled.makeMain(), pending: null };
    return { actor, compiled, stack: [mainFrame], eventQueue: [], halted: false };
  });
  for (const rt of runtimes) ensurePending(rt);
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
      // Phase 6: failed casts don't cost energy (actor tries again next tick).
      if (action.kind === "cast" && castFailedCleanly(events)) {
        rt.actor.energy += action.cost;
      }
      dispatch(world, s.runtimes, events);

      if (events.some(e => e.type === "HeroExited" || e.type === "HeroDied")) {
        world.ended = true;
      }
      if (action.kind === "halt") { rt.stack = []; rt.halted = true; }
      if (!rt.actor.alive)        { rt.stack = []; rt.halted = true; }

      for (const r of s.runtimes) ensurePending(r);
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
    if (effectEvents.length > 0) {
      dispatch(world, s.runtimes, effectEvents);
      if (effectEvents.some(e => e.type === "HeroDied" || e.type === "HeroExited")) {
        world.ended = true;
      }
    }
    for (const r of s.runtimes) ensurePending(r);
    if (world.ended || world.aborted) return { events: effectEvents, done: true };

    if (!anyLiveWork(s)) return { events: [], done: true };
  }
}

function anyLiveWork(s: SchedulerState): boolean {
  return s.runtimes.some(r => r.actor.alive && !r.halted && r.stack.length > 0);
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

function ensurePending(rt: ActorRuntime): void {
  if (rt.halted || !rt.actor.alive) return;
  while (true) {
    const frame = activeFrame(rt);
    if (!frame) {
      // Stack empty: main is done. Handlers can still fire — drain queue.
      if (tryStartNextHandler(rt)) continue;
      return;
    }
    if (frame.pending !== null) return;
    let r: IteratorResult<PendingAction, void>;
    try { r = frame.gen.next(); } catch { r = { done: true, value: undefined }; }
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
    rt.stack.push({ gen: rt.compiled.makeHandler(h, next.binding), pending: null });
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
  }
}

export type { EventLog };
