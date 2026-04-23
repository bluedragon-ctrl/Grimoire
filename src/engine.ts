// Public engine API. Two flavors:
//   runRoom(setup, opts)   — synchronous, runs to completion, existing API.
//   startRoom(setup, opts) — returns a DebugHandle for step-by-step execution.

import type {
  Actor, Room, World, EventLog, GameEvent, SourceLoc, Script,
} from "./types.js";
import {
  createScheduler, stepOne, type RunOptions, type SchedulerState, type StepResult,
} from "./scheduler.js";

export interface RoomSetup {
  room: Room;
  actors: Actor[];
}

export interface EngineHandle {
  log: EventLog;
  world: World;
  abort(): void;
}

export interface DebugHandle extends EngineHandle {
  step(): StepResult;
  run(): void;
  pause(): void;
  reset(): void;
  readonly currentLoc: SourceLoc | null;
  readonly paused: boolean;
  readonly done: boolean;
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
    },
    actors: setup.actors.map(a => cloneActor(a)),
  };
}

function cloneActor(a: Actor): Actor {
  return {
    id: a.id, kind: a.kind,
    hp: a.hp, maxHp: a.maxHp, speed: a.speed, energy: 0,
    pos: { ...a.pos }, alive: a.hp > 0,
    script: a.script as Script, // AST is immutable — safe to share
  };
}

function buildWorld(setup: RoomSetup): World {
  return {
    tick: 0,
    room: {
      w: setup.room.w, h: setup.room.h,
      doors: setup.room.doors.map(d => ({ ...d, pos: { ...d.pos } })),
      items: setup.room.items.map(i => ({ ...i, pos: { ...i.pos } })),
      chests: setup.room.chests.map(c => ({ ...c, pos: { ...c.pos } })),
    },
    actors: setup.actors.map(a => cloneActor(a)),
    log: [],
    aborted: false,
    ended: false,
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

  let world: World = buildWorld(snapshot);
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

    reset() {
      world = buildWorld(snapshot);
      sched = createScheduler(world, opts);
      paused = false;
      done = false;
    },
  };
  return handle;
}
