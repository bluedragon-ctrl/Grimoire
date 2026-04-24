import { describe, it, expect } from "vitest";
import type { Actor, Room, World } from "../../src/types.js";
import { queries } from "../../src/commands.js";
import { script, cHalt } from "../../src/ast-helpers.js";

function mkRoom(over: Partial<Room> = {}): Room {
  return { w: 10, h: 10, doors: [], items: [], chests: [], clouds: [], ...over };
}

function mkHero(over: Partial<Actor> & { id: string; pos: { x: number; y: number } }): Actor {
  return {
    kind: "hero",
    hp: 20, maxHp: 20, speed: 12, energy: 0, alive: true,
    script: script(cHalt()),
    mp: 20, maxMp: 20, atk: 3, def: 0, int: 0,
    effects: [], knownSpells: ["bolt", "heal"],
    ...over,
  } as Actor;
}

function mkGoblin(over: Partial<Actor> & { id: string; pos: { x: number; y: number } }): Actor {
  return {
    kind: "goblin",
    hp: 10, maxHp: 10, speed: 10, energy: 0, alive: true,
    script: script(cHalt()),
    mp: 0, maxMp: 0, atk: 1, def: 0, int: 0,
    effects: [], knownSpells: [],
    ...over,
  } as Actor;
}

function mkWorld(actors: Actor[], room: Room = mkRoom()): World {
  return {
    room, actors, tick: 0, ended: false, aborted: false, log: [],
  } as any;
}

describe("can_cast() query", () => {
  it("true when all conditions satisfied (spell known, mp ok, target valid+in range)", () => {
    const h = mkHero({ id: "h", pos: { x: 0, y: 0 } });
    const g = mkGoblin({ id: "g", pos: { x: 3, y: 0 } });
    const w = mkWorld([h, g]);
    expect(queries.can_cast(w, h, "bolt", g)).toBe(true);
  });

  it("false when spell name is unknown", () => {
    const h = mkHero({ id: "h", pos: { x: 0, y: 0 } });
    const g = mkGoblin({ id: "g", pos: { x: 1, y: 0 } });
    const w = mkWorld([h, g]);
    expect(queries.can_cast(w, h, "bolr", g)).toBe(false);
  });

  it("false when caster hasn't learned the spell", () => {
    const h = mkHero({ id: "h", pos: { x: 0, y: 0 }, knownSpells: ["heal"] });
    const g = mkGoblin({ id: "g", pos: { x: 1, y: 0 } });
    const w = mkWorld([h, g]);
    expect(queries.can_cast(w, h, "bolt", g)).toBe(false);
  });

  it("false when insufficient mp", () => {
    const h = mkHero({ id: "h", pos: { x: 0, y: 0 }, mp: 2 });
    const g = mkGoblin({ id: "g", pos: { x: 1, y: 0 } });
    const w = mkWorld([h, g]);
    expect(queries.can_cast(w, h, "bolt", g)).toBe(false);
  });

  it("false when target out of range", () => {
    const h = mkHero({ id: "h", pos: { x: 0, y: 0 } });
    const g = mkGoblin({ id: "g", pos: { x: 8, y: 0 } }); // bolt range 6
    const w = mkWorld([h, g]);
    expect(queries.can_cast(w, h, "bolt", g)).toBe(false);
  });

  it("false when target is wrong type (ally target for enemy-only spell)", () => {
    const h = mkHero({ id: "h", pos: { x: 0, y: 0 } });
    const ally = mkHero({ id: "h2", pos: { x: 1, y: 0 } });
    const w = mkWorld([h, ally]);
    expect(queries.can_cast(w, h, "bolt", ally)).toBe(false);
  });

  it("true when target omitted (range/target checks skipped, mp still verified)", () => {
    const h = mkHero({ id: "h", pos: { x: 0, y: 0 } });
    const w = mkWorld([h]);
    expect(queries.can_cast(w, h, "bolt")).toBe(true);
  });

  it("false when target omitted but mp too low", () => {
    const h = mkHero({ id: "h", pos: { x: 0, y: 0 }, mp: 0 });
    const w = mkWorld([h]);
    expect(queries.can_cast(w, h, "bolt")).toBe(false);
  });

  it("is zero-cost (mana unchanged after call)", () => {
    const h = mkHero({ id: "h", pos: { x: 0, y: 0 } });
    const g = mkGoblin({ id: "g", pos: { x: 1, y: 0 } });
    const w = mkWorld([h, g]);
    const mpBefore = h.mp;
    queries.can_cast(w, h, "bolt", g);
    expect(h.mp).toBe(mpBefore);
  });
});
