import { describe, it, expect } from "vitest";
import { queries } from "../../src/commands.js";
import { runRoom } from "../../src/engine.js";
import {
  script, onEvent, cHalt, cFlee, ident, exprStmt, call, index, lit,
} from "../../src/ast-helpers.js";
import { mkRoom, mkWorld, mkHero, mkGoblin } from "../helpers.js";

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

describe("adjacent() query", () => {
  it("orthogonal neighbours are adjacent", () => {
    const a = mkGoblin({ id: "a", pos: { x: 2, y: 2 } });
    const b = mkGoblin({ id: "b", pos: { x: 3, y: 2 } });
    const w = mkWorld([a, b]);
    expect(queries.adjacent(w, a, a, b)).toBe(true);
  });

  it("diagonal neighbours are adjacent (Chebyshev)", () => {
    const a = mkGoblin({ id: "a", pos: { x: 2, y: 2 } });
    const b = mkGoblin({ id: "b", pos: { x: 3, y: 3 } });
    const w = mkWorld([a, b]);
    expect(queries.adjacent(w, a, a, b)).toBe(true);
  });

  it("two tiles away is not adjacent", () => {
    const a = mkGoblin({ id: "a", pos: { x: 0, y: 0 } });
    const b = mkGoblin({ id: "b", pos: { x: 2, y: 0 } });
    const w = mkWorld([a, b]);
    expect(queries.adjacent(w, a, a, b)).toBe(false);
  });

  it("same tile is NOT adjacent (adjacent(me, me) → false)", () => {
    const a = mkGoblin({ id: "a", pos: { x: 0, y: 0 } });
    const w = mkWorld([a]);
    expect(queries.adjacent(w, a, a, a)).toBe(false);
  });

  it("accepts actor + door", () => {
    const a = mkGoblin({ id: "a", pos: { x: 2, y: 2 } });
    const room = mkRoom({ doors: [{ dir: "N", pos: { x: 2, y: 3 } }] });
    const w = mkWorld([a], room);
    expect(queries.adjacent(w, a, a, w.room.doors[0])).toBe(true);
  });

  it("accepts actor + bare pos", () => {
    const a = mkGoblin({ id: "a", pos: { x: 5, y: 5 } });
    const w = mkWorld([a]);
    expect(queries.adjacent(w, a, a, { pos: { x: 6, y: 6 } })).toBe(true);
    expect(queries.adjacent(w, a, a, { pos: { x: 7, y: 7 } })).toBe(false);
  });

  it("returns false for non-positional args (no crash)", () => {
    const a = mkGoblin({ id: "a", pos: { x: 0, y: 0 } });
    const w = mkWorld([a]);
    expect(queries.adjacent(w, a, a, null)).toBe(false);
    expect(queries.adjacent(w, a, a, 42)).toBe(false);
    expect(queries.adjacent(w, a, null, a)).toBe(false);
  });
});

describe("monster event handlers dispatch", () => {
  it("goblin's on-hit handler fires after hero attacks it", () => {
    const heroScript = script(
      exprStmt(call("attack", index(call("enemies"), lit(0)))),
      cHalt(),
    );
    const hero = mkHero({ id: "h", pos: { x: 1, y: 1 }, script: heroScript });
    const goblin = mkGoblin({
      id: "g",
      pos: { x: 2, y: 1 },
      hp: 20, maxHp: 20,
      script: script(
        onEvent("hit", [cFlee(ident("attacker"))], "attacker"),
      ),
    });
    const { world, log } = runRoom(
      { room: mkRoom(), actors: [hero, goblin] },
      { maxTicks: 100 },
    );
    const g = world.actors.find(a => a.id === "g")!;
    expect(g.pos.x !== 2 || g.pos.y !== 1).toBe(true);
    const dx = Math.abs(g.pos.x - 1);
    const dy = Math.abs(g.pos.y - 1);
    expect(Math.max(dx, dy)).toBeGreaterThan(1);
    expect(log.some(l => l.event.type === "Hit" && l.event.actor === "g")).toBe(true);
  });

  it("handler fires even after the monster's main has halted", () => {
    const heroScript = script(
      exprStmt(call("attack", index(call("enemies"), lit(0)))),
      exprStmt(call("attack", index(call("enemies"), lit(0)))),
      cHalt(),
    );
    const hero = mkHero({ id: "h", pos: { x: 1, y: 1 }, script: heroScript });
    const goblin = mkGoblin({
      id: "g", pos: { x: 2, y: 1 }, hp: 50, maxHp: 50,
      script: script(
        cHalt(),
        onEvent("hit", [cFlee(ident("attacker"))], "attacker"),
      ),
    });
    const { world } = runRoom({ room: mkRoom(), actors: [hero, goblin] }, { maxTicks: 100 });
    const g = world.actors.find(a => a.id === "g")!;
    expect(g.pos.x !== 2 || g.pos.y !== 1).toBe(true);
  });
});
