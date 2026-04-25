import type { Actor, Room, World } from "../src/types.js";
import { script, cHalt } from "../src/ast-helpers.js";
import { emptyEquipped } from "../src/content/items.js";

export function mkRoom(over: Partial<Room> = {}): Room {
  return { w: 10, h: 10, doors: [], items: [], chests: [], clouds: [], ...over };
}

export function mkWorld(actors: Actor[], room?: Partial<Room>): World {
  return {
    tick: 0,
    room: mkRoom(room),
    actors, log: [], aborted: false, ended: false,
  } as World;
}

export function mkHero(over: Partial<Actor> = {}): Actor {
  return {
    id: "h", kind: "hero", isHero: true,
    hp: 20, maxHp: 20, speed: 12, energy: 0, alive: true,
    pos: { x: 0, y: 0 }, mp: 20, maxMp: 20, atk: 3, def: 0, int: 0,
    effects: [], knownSpells: ["bolt", "heal"],
    inventory: { consumables: [], equipped: emptyEquipped() },
    script: script(cHalt()),
    ...over,
  } as Actor;
}

export function mkGoblin(over: Partial<Actor> = {}): Actor {
  return {
    id: "g", kind: "goblin",
    hp: 10, maxHp: 10, speed: 10, energy: 0, alive: true,
    pos: { x: 1, y: 0 }, mp: 0, maxMp: 0, atk: 1, def: 0, int: 0,
    effects: [], knownSpells: [],
    script: script(cHalt()),
    ...over,
  } as Actor;
}

export function mkActor(over: Partial<Actor> & Pick<Actor, "id" | "kind" | "pos">): Actor {
  return {
    hp: 20, maxHp: 20, speed: 10, energy: 0,
    alive: true, script: script(cHalt()),
    mp: 20, maxMp: 20, atk: 1, def: 0, int: 0, effects: [],
    knownSpells: [],
    ...over,
  } as Actor;
}
