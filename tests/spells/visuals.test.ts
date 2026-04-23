import { describe, it, expect } from "vitest";
import type { Actor, World } from "../../src/types.js";
import { castSpell } from "../../src/spells/cast.js";
import { PRIMITIVES } from "../../src/spells/primitives.js";
import { script, cHalt } from "../../src/ast-helpers.js";

function mkWorld(actors: Actor[]): World {
  return {
    tick: 0,
    room: { w: 10, h: 10, doors: [], items: [], chests: [], clouds: [] },
    actors, log: [], aborted: false, ended: false,
  };
}

function mkHero(over: Partial<Actor> & Pick<Actor, "id" | "pos">): Actor {
  return {
    kind: "hero",
    hp: 20, maxHp: 20, speed: 12, energy: 0, alive: true,
    script: script(cHalt()),
    mp: 20, maxMp: 20, atk: 3, def: 0, int: 0, effects: [],
    knownSpells: ["bolt", "heal", "firebolt", "chill", "bless", "firewall"],
    ...over,
  };
}
function mkGob(over: Partial<Actor> & Pick<Actor, "id" | "pos">): Actor {
  return {
    kind: "goblin",
    hp: 20, maxHp: 20, speed: 10, energy: 0, alive: true,
    script: script(cHalt()),
    mp: 0, maxMp: 0, atk: 1, def: 0, int: 0, effects: [],
    knownSpells: [],
    ...over,
  };
}

describe("visual metadata on events", () => {
  it("casting bolt emits a Cast event with visual=bolt_orange, element=arcane", () => {
    const h = mkHero({ id: "h", pos: { x: 0, y: 0 } });
    const g = mkGob({ id: "g", pos: { x: 1, y: 0 } });
    const w = mkWorld([h, g]);
    const events = castSpell(w, h, "bolt", g);
    const cast = events.find(e => e.type === "Cast") as any;
    expect(cast.visual).toBe("bolt_orange");
    expect(cast.element).toBe("arcane");
  });

  it("casting firewall emits CloudSpawned with visual=cloud_fire, element=fire", () => {
    const h = mkHero({ id: "h", pos: { x: 0, y: 0 } });
    const w = mkWorld([h]);
    const events = castSpell(w, h, "firewall", { x: 2, y: 2 });
    const spawn = events.find(e => e.type === "CloudSpawned") as any;
    expect(spawn.visual).toBe("cloud_fire");
    expect(spawn.element).toBe("fire");
  });

  it("stub explode emits ActionFailed + VisualBurst with provided visual", () => {
    const h = mkHero({ id: "h", pos: { x: 0, y: 0 } });
    const w = mkWorld([h]);
    const events = PRIMITIVES.explode.execute(w, h, { x: 2, y: 2 }, {
      visual: "burst_ember", element: "fire",
    });
    const failed = events.find(e => e.type === "ActionFailed") as any;
    const burst = events.find(e => e.type === "VisualBurst") as any;
    expect(failed.reason).toContain("not implemented");
    expect(burst.visual).toBe("burst_ember");
    expect(burst.element).toBe("fire");
  });
});
