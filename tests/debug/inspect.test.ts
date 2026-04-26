import { describe, it, expect } from "vitest";
import type { Actor, Room } from "../../src/types.js";
import { startRoom } from "../../src/engine.js";
import { parse } from "../../src/lang/parser.js";

function room(over: Partial<Room> = {}): Room {
  return { w: 10, h: 10, doors: [], chests: [], ...over };
}

describe("debugger inspect()", () => {
  it("reports hp / pos / enemies count / maxHp", () => {
    const hero: Actor = {
      id: "h", kind: "hero", pos: { x: 1, y: 2 },
      hp: 15, maxHp: 20, speed: 12, energy: 0, alive: true,
      script: parse("wait()\nwait()\nhalt()\n"),
    };
    const gob: Actor = {
      id: "g", kind: "goblin", pos: { x: 5, y: 5 },
      hp: 5, maxHp: 5, speed: 10, energy: 0, alive: true,
      script: parse("halt()\n"),
    };
    const h = startRoom({ room: room(), actors: [hero, gob] });

    h.step(); // first wait
    const snap = h.inspect("h")!;
    expect(snap.visible.hp).toBe(15);
    expect(snap.visible.maxHp).toBe(20);
    expect(snap.visible.pos).toEqual({ x: 1, y: 2 });
    expect(snap.visible.enemies.length).toBe(1);
    expect(snap.visible.enemies[0]!.id).toBe("g");
  });

  it("surfaces user locals after assignment", () => {
    const src = [
      "x = 7",
      "target = enemies()[0]",
      "wait()",
      "halt()",
    ].join("\n") + "\n";
    const hero: Actor = {
      id: "h", kind: "hero", pos: { x: 0, y: 0 },
      hp: 20, maxHp: 20, speed: 12, energy: 0, alive: true,
      script: parse(src),
    };
    const gob: Actor = {
      id: "g", kind: "goblin", pos: { x: 3, y: 3 },
      hp: 5, maxHp: 5, speed: 10, energy: 0, alive: true,
      script: parse("halt()\n"),
    };
    const h = startRoom({ room: room(), actors: [hero, gob] });

    h.step(); // fires wait() — after assignments
    const snap = h.inspect("h")!;
    expect(snap.locals.x).toBe(7);
    // Actor-ref is stringified to a summary.
    expect(snap.locals.target).toMatchObject({ id: "g", kind: "goblin", hp: 5 });
    expect((snap.locals.target as any).pos).toEqual({ x: 3, y: 3 });
  });

  it("returns null for unknown actor", () => {
    const a: Actor = {
      id: "a", kind: "goblin", pos: { x: 0, y: 0 },
      hp: 5, maxHp: 5, speed: 10, energy: 0, alive: true,
      script: parse("halt()\n"),
    };
    const h = startRoom({ room: room(), actors: [a] });
    expect(h.inspect("nope")).toBeNull();
  });

  it("inspect output does not leak live world refs (mutation-safe)", () => {
    const a: Actor = {
      id: "a", kind: "goblin", pos: { x: 2, y: 2 },
      hp: 5, maxHp: 5, speed: 10, energy: 0, alive: true,
      script: parse("wait()\nhalt()\n"),
    };
    const h = startRoom({ room: room(), actors: [a] });
    h.step();
    const snap = h.inspect("a")!;
    snap.visible.pos.x = 999;
    expect(h.world.actors[0]!.pos.x).toBe(2);
  });
});
