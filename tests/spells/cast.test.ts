import { describe, it, expect } from "vitest";
import type { Actor, World, Room, GameEvent } from "../../src/types.js";
import { castSpell } from "../../src/spells/cast.js";
import { script, cHalt } from "../../src/ast-helpers.js";

function mkWorld(actors: Actor[], room?: Partial<Room>): World {
  return {
    tick: 0,
    room: { w: 10, h: 10, doors: [], items: [], chests: [], clouds: [], ...room },
    actors, log: [], aborted: false, ended: false,
  };
}

function mkHero(over: Partial<Actor> & { id: string; pos: { x: number; y: number } }): Actor {
  return {
    kind: "hero",
    hp: 20, maxHp: 20, speed: 12, energy: 0, alive: true,
    script: script(cHalt()),
    mp: 20, maxMp: 20, atk: 3, def: 0, int: 0,
    effects: [], knownSpells: ["bolt", "heal"],
    ...over,
  };
}
function mkGoblin(over: Partial<Actor> & { id: string; pos: { x: number; y: number } }): Actor {
  return {
    kind: "goblin",
    hp: 10, maxHp: 10, speed: 10, energy: 0, alive: true,
    script: script(cHalt()),
    mp: 0, maxMp: 0, atk: 1, def: 0, int: 0,
    effects: [], knownSpells: [],
    ...over,
  };
}

describe("castSpell validation", () => {
  it("unknown spell → ActionFailed with did-you-mean; no mana deducted", () => {
    const h = mkHero({ id: "h", pos: { x: 0, y: 0 } });
    const g = mkGoblin({ id: "g", pos: { x: 1, y: 0 } });
    const w = mkWorld([h, g]);
    const events = castSpell(w, h, "bolr", g);
    expect(events.length).toBe(1);
    const f = events[0] as any;
    expect(f.type).toBe("ActionFailed");
    expect(f.reason).toContain("Unknown spell 'bolr'");
    expect(f.reason).toContain("bolt");
    expect(h.mp).toBe(20);
  });

  it("unlearned spell → ActionFailed; no mana deducted", () => {
    const h = mkHero({ id: "h", pos: { x: 0, y: 0 }, knownSpells: ["heal"] });
    const g = mkGoblin({ id: "g", pos: { x: 1, y: 0 } });
    const w = mkWorld([h, g]);
    const events = castSpell(w, h, "bolt", g);
    expect((events[0] as any).reason).toContain("haven't learned");
    expect(h.mp).toBe(20);
  });

  it("wrong target type: bolt on ally / heal on enemy fail", () => {
    const h = mkHero({ id: "h", pos: { x: 0, y: 0 }, knownSpells: ["bolt", "heal"] });
    const ally = mkHero({ id: "h2", pos: { x: 1, y: 0 } });
    const g = mkGoblin({ id: "g", pos: { x: 1, y: 0 } });
    const w = mkWorld([h, ally, g]);
    const e1 = castSpell(w, h, "bolt", ally);
    expect((e1[0] as any).type).toBe("ActionFailed");
    const e2 = castSpell(w, h, "heal", g);
    expect((e2[0] as any).type).toBe("ActionFailed");
    expect(h.mp).toBe(20);
  });

  it("out of range → ActionFailed", () => {
    const h = mkHero({ id: "h", pos: { x: 0, y: 0 } });
    const g = mkGoblin({ id: "g", pos: { x: 9, y: 9 } }); // cheb=9, bolt range=6
    const w = mkWorld([h, g]);
    const events = castSpell(w, h, "bolt", g);
    expect((events[0] as any).reason).toContain("out of range");
    expect(h.mp).toBe(20);
  });

  it("insufficient mana → ActionFailed", () => {
    const h = mkHero({ id: "h", pos: { x: 0, y: 0 }, mp: 3, maxMp: 20 });
    const g = mkGoblin({ id: "g", pos: { x: 1, y: 0 } });
    const w = mkWorld([h, g]);
    const events = castSpell(w, h, "bolt", g);
    expect((events[0] as any).reason).toContain("Not enough mana");
    expect(h.mp).toBe(3);
  });

  it("successful bolt: deducts mana, deals damage, emits Cast + Hit", () => {
    const h = mkHero({ id: "h", pos: { x: 0, y: 0 } });
    const g = mkGoblin({ id: "g", pos: { x: 1, y: 0 } });
    const w = mkWorld([h, g]);
    const events = castSpell(w, h, "bolt", g);
    expect(h.mp).toBe(15);
    expect(g.hp).toBe(6); // int=0 → damage 4
    const types = events.map(e => e.type);
    expect(types).toContain("Cast");
    expect(types).toContain("Hit");
  });

  it("successful heal: restores hp, clamped at maxHp", () => {
    const h = mkHero({ id: "h", pos: { x: 0, y: 0 }, hp: 8, maxHp: 10 });
    const w = mkWorld([h]);
    const events = castSpell(w, h, "heal", h);
    expect(h.hp).toBe(10);
    const healed = events.find(e => e.type === "Healed") as any;
    expect(healed.amount).toBe(2);
    expect(h.mp).toBe(15);
  });

  it("failed cast does not cost energy (runs through engine)", async () => {
    const { runRoom } = await import("../../src/engine.js");
    const { call, lit, ident, exprStmt, while_ } = await import("../../src/ast-helpers.js");
    // Hero attempts to cast unknown spell — should ActionFailed repeatedly,
    // with energy refunded so cast fires each tick, and eventually halt.
    const hero: Actor = {
      id: "h", kind: "hero", hp: 20, maxHp: 20, speed: 12, energy: 0, alive: true,
      pos: { x: 0, y: 0 }, mp: 100, maxMp: 100, int: 0,
      knownSpells: ["bolt", "heal"],
      script: script(
        // try unknown spell 3 times, then halt
        exprStmt(call("cast", lit("nope"), ident("me"))),
        exprStmt(call("cast", lit("nope"), ident("me"))),
        exprStmt(call("cast", lit("nope"), ident("me"))),
        cHalt(),
      ),
      effects: [],
    };
    const gob: Actor = {
      id: "g", kind: "goblin", hp: 5, maxHp: 5, speed: 10, energy: 0, alive: true,
      pos: { x: 5, y: 5 }, script: script(cHalt()), knownSpells: [], effects: [],
    };
    const { log } = runRoom({
      room: { w: 10, h: 10, doors: [], items: [], chests: [] },
      actors: [hero, gob],
    }, { maxTicks: 200 });
    const fails = log.filter(l => l.event.type === "ActionFailed" && (l.event as any).action === "cast");
    expect(fails.length).toBe(3);
    // With energy refund the casts fire on consecutive non-empty energy slots,
    // all within a small tick span. Without refund the hero would stall.
    const firstFailTick = fails[0]!.t;
    const lastFailTick = fails[fails.length - 1]!.t;
    expect(lastFailTick - firstFailTick).toBeLessThan(5);
  });
});
