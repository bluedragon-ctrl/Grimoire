// Public engine API: runRoom(setup) → { log, abort, world }.

import type { Actor, Room, World, EventLog } from "./types.js";
import { runLoop, type RunOptions } from "./scheduler.js";

export interface RoomSetup {
  room: Room;
  actors: Actor[];
}

export interface EngineHandle {
  log: EventLog;
  world: World;
  abort(): void;
}

// Synchronous. For MVP the engine runs to completion before returning.
// The `abort` callback is only useful if the scheduler is driven tick-at-a-
// time later; for now it flips the flag and the loop will exit on the next
// check. Exposed so the UI wiring stays stable when we switch to async.
export function runRoom(setup: RoomSetup, opts: RunOptions = {}): EngineHandle {
  const world: World = {
    tick: 0,
    room: setup.room,
    actors: setup.actors.map(a => ({ ...a, alive: a.hp > 0 })),
    log: [],
    aborted: false,
    ended: false,
  };
  const handle: EngineHandle = {
    log: world.log,
    world,
    abort() { world.aborted = true; },
  };
  runLoop(world, opts);
  return handle;
}
