import { describe, it, expect } from "vitest";
import type { Actor, World, Cloud } from "../../src/types.js";
import { queries } from "../../src/commands.js";
import { script, cHalt } from "../../src/ast-helpers.js";

function mkActor(over: Partial<Actor> & Pick<Actor, "id" | "kind" | "pos">): Actor {
  return {
    hp: 20, maxHp: 20, speed: 10, energy: 0, alive: true,
    script: script(cHalt()),
    mp: 10, maxMp: 20, atk: 1, def: 0, int: 0, effects: [],
    knownSpells: ["bolt", "heal"],
    ...over,
  };
}

function mkWorld(actors: Actor[], clouds: Cloud[] = []): World {
  return {
    tick: 0,
    room: { w: 10, h: 10, doors: [], items: [], chests: [], clouds },
    actors, log: [], aborted: false, ended: false,
  };
}

describe("phase 6 queries", () => {
  it("clouds() returns list matching world state; cloud_at finds kind", () => {
    const h = mkActor({ id: "h", kind: "hero", pos: { x: 0, y: 0 } });
    const fire: Cloud = { id: "c1", pos: { x: 3, y: 3 }, kind: "fire", duration: 20, remaining: 20 };
    const frost: Cloud = { id: "c2", pos: { x: 3, y: 3 }, kind: "frost", duration: 20, remaining: 20 };
    const w = mkWorld([h], [fire, frost]);
    const list = queries.clouds(w, h);
    expect(list.length).toBe(2);
    expect(list[0]).toEqual({ id: "c1", pos: { x: 3, y: 3 }, kind: "fire", remaining: 20 });
    // cloud_at topmost = most recent.
    expect(queries.cloud_at(w, h, { x: 3, y: 3 })).toBe("frost");
    expect(queries.cloud_at(w, h, { x: 0, y: 0 })).toBe(null);
  });

  it("known_spells() returns default hero spells", () => {
    const h = mkActor({ id: "h", kind: "hero", pos: { x: 0, y: 0 } });
    const w = mkWorld([h]);
    expect(queries.known_spells(w, h)).toEqual(["bolt", "heal"]);
  });

  it("mp() / max_mp() reflect current values", () => {
    const h = mkActor({ id: "h", kind: "hero", pos: { x: 0, y: 0 }, mp: 7, maxMp: 20 });
    const w = mkWorld([h]);
    expect(queries.mp(w, h)).toBe(7);
    expect(queries.max_mp(w, h)).toBe(20);
  });
});
