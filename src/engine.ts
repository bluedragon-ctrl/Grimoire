// Public engine API. Two flavors:
//   runRoom(setup, opts)   — synchronous, runs to completion, existing API.
//   startRoom(setup, opts) — returns a DebugHandle for step-by-step execution.

import type {
  Actor, Room, World, EventLog, GameEvent, SourceLoc, Script,
} from "./types.js";
import {
  createScheduler, stepOne, type RunOptions, type SchedulerState, type StepResult,
} from "./scheduler.js";
// Side-effect import: registers equipment-bonus wiring into effects.ts so
// effectiveStats() picks up equipped-item bonuses. Must land before any run.
import "./items/execute.js";
import { emptyEquipped } from "./content/items.js";

export interface RoomSetup {
  room: Room;
  actors: Actor[];
}

export interface EngineHandle {
  log: EventLog;
  world: World;
  abort(): void;
}

export interface ActorSummary { id: string; kind: string; pos: { x: number; y: number }; hp: number; }
export interface ItemSummary { id: string; kind: string; pos: { x: number; y: number }; }

export interface InspectSnapshot {
  locals: Record<string, unknown>;
  visible: {
    enemies: ActorSummary[];
    items: ItemSummary[];
    hp: number;
    maxHp: number;
    pos: { x: number; y: number };
  };
}

export interface DebugHandle extends EngineHandle {
  step(): StepResult;
  run(): void;
  pause(): void;
  reset(): void;
  inspect(actorId: string): InspectSnapshot | null;
  readonly currentLoc: SourceLoc | null;
  readonly paused: boolean;
  readonly done: boolean;
}

// Turn a live actor ref into a read-only summary for the inspector.
function summarizeActor(a: Actor): ActorSummary {
  return { id: a.id, kind: a.kind, pos: { ...a.pos }, hp: a.hp };
}

// Best-effort JSON-safe projection of a local value. Recognizes actor-like
// objects and stringifies them as summaries; otherwise copies primitives and
// plain structures shallowly to avoid leaking live world references.
function jsonSafe(v: unknown): unknown {
  if (v === null || v === undefined) return v;
  const t = typeof v;
  if (t === "number" || t === "string" || t === "boolean") return v;
  if (Array.isArray(v)) return v.map(jsonSafe);
  if (t === "object") {
    const obj = v as any;
    if (typeof obj.id === "string" && typeof obj.kind === "string"
        && obj.pos && typeof obj.pos.x === "number" && typeof obj.hp === "number") {
      return summarizeActor(obj as Actor);
    }
    if (obj.pos && typeof obj.pos.x === "number") {
      return { ...obj, pos: { ...obj.pos } };
    }
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj)) out[k] = jsonSafe(obj[k]);
    return out;
  }
  return String(v);
}

// Snapshot the setup so reset() can rebuild a fresh world from the initial
// values, even after the live world has been mutated by a run.
function snapshotSetup(setup: RoomSetup): RoomSetup {
  return {
    room: {
      w: setup.room.w,
      h: setup.room.h,
      doors: setup.room.doors.map(d => ({ ...d, pos: { ...d.pos } })),
      items: setup.room.items.map(i => ({ ...i, pos: { ...i.pos } })),
      chests: setup.room.chests.map(c => ({ ...c, pos: { ...c.pos } })),
      clouds: (setup.room.clouds ?? []).map(c => ({ ...c, pos: { ...c.pos } })),
      floorItems: (setup.room.floorItems ?? []).map(f => ({ ...f, pos: { ...f.pos } })),
    },
    actors: setup.actors.map(a => cloneActor(a)),
  };
}

function cloneActor(a: Actor): Actor {
  // Phase 11: stat defaults branch on `isHero`, not on kind string. Monsters
  // built via createActor always bring their own stats; the hero path keeps
  // the historical hero defaults (mp 20, atk 3, bolt+heal spellbook).
  const defaults = a.isHero
    ? { mp: 20, maxMp: 20, atk: 3, def: 0, int: 0, knownSpells: ["bolt", "heal"] }
    : { mp: 0,  maxMp: 0,  atk: 1, def: 0, int: 0, knownSpells: [] as string[] };
  const out: Actor = {
    id: a.id, kind: a.kind,
    isHero: a.isHero ?? false,
    hp: a.hp, maxHp: a.maxHp, speed: a.speed, energy: 0,
    pos: { ...a.pos }, alive: a.hp > 0,
    script: a.script as Script, // AST is immutable — safe to share
    mp:    a.mp    ?? defaults.mp,
    maxMp: a.maxMp ?? defaults.maxMp,
    atk:   a.atk   ?? defaults.atk,
    def:   a.def   ?? defaults.def,
    int:   a.int   ?? defaults.int,
    effects: (a.effects ?? []).map(e => ({ ...e })),
    knownSpells: a.knownSpells ? [...a.knownSpells] : [...defaults.knownSpells],
    inventory: a.inventory ? {
      consumables: a.inventory.consumables.map(i => ({ ...i })),
      equipped: { ...a.inventory.equipped },
    } : { consumables: [], equipped: emptyEquipped() },
  };
  if (a.lootTable !== undefined) out.lootTable = a.lootTable;
  if (a.visual !== undefined)    out.visual = a.visual;
  if (a.baseVisual !== undefined) out.baseVisual = a.baseVisual;
  if (a.colors !== undefined)    out.colors = { ...a.colors };
  return out;
}

function buildWorld(setup: RoomSetup, seed: number): World {
  return {
    tick: 0,
    room: {
      w: setup.room.w, h: setup.room.h,
      doors: setup.room.doors.map(d => ({ ...d, pos: { ...d.pos } })),
      items: setup.room.items.map(i => ({ ...i, pos: { ...i.pos } })),
      chests: setup.room.chests.map(c => ({ ...c, pos: { ...c.pos } })),
      clouds: (setup.room.clouds ?? []).map(c => ({ ...c, pos: { ...c.pos } })),
      floorItems: (setup.room.floorItems ?? []).map(f => ({ ...f, pos: { ...f.pos } })),
    },
    actors: setup.actors.map(a => cloneActor(a)),
    log: [],
    aborted: false,
    ended: false,
    rngSeed: seed >>> 0,
    floorSeq: 0,
  };
}

// ──────────────────────────── public entry points ────────────────────────────

export function runRoom(setup: RoomSetup, opts: RunOptions = {}): EngineHandle {
  const h = startRoom(setup, opts);
  h.run();
  return { log: h.log, world: h.world, abort: h.abort };
}

export function startRoom(setup: RoomSetup, opts: RunOptions = {}): DebugHandle {
  const snapshot = snapshotSetup(setup);

  const seed = opts.seed ?? 1;
  let world: World = buildWorld(snapshot, seed);
  let sched: SchedulerState = createScheduler(world, opts);
  let paused = false;
  let done = false;

  const handle: DebugHandle = {
    get log() { return world.log; },
    get world() { return world; },
    get currentLoc() { return sched.lastFiredLoc; },
    get paused() { return paused; },
    get done() { return done; },

    abort() { world.aborted = true; done = true; },

    step(): StepResult {
      if (done) return { events: [], done: true };
      const r = stepOne(world, sched);
      if (r.done) done = true;
      return r;
    },

    run() {
      paused = false;
      while (!done && !paused) {
        const r = stepOne(world, sched);
        if (r.done) { done = true; break; }
      }
    },

    pause() { paused = true; },

    inspect(actorId: string): InspectSnapshot | null {
      const actor = world.actors.find(a => a.id === actorId);
      if (!actor) return null;
      const rt = sched.runtimes.find(r => r.actor.id === actorId);
      const frame = rt && rt.stack.length > 0 ? rt.stack[rt.stack.length - 1]! : null;
      const rawLocals = frame?.pending?.locals ?? {};
      const locals: Record<string, unknown> = {};
      for (const k of Object.keys(rawLocals)) locals[k] = jsonSafe(rawLocals[k]);
      return {
        locals,
        visible: {
          enemies: world.actors.filter(a => a.alive && a.id !== actorId).map(summarizeActor),
          items: world.room.items.map(i => ({ id: i.id, kind: i.kind, pos: { ...i.pos } })),
          hp: actor.hp,
          maxHp: actor.maxHp,
          pos: { ...actor.pos },
        },
      };
    },

    reset() {
      world = buildWorld(snapshot, seed);
      sched = createScheduler(world, opts);
      paused = false;
      done = false;
    },
  };
  return handle;
}
