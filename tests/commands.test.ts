import { describe, it, expect } from "vitest";
import type { Actor, Room, World } from "../src/types.js";
import { queries } from "../src/commands.js";
import { runRoom } from "../src/engine.js";
import {
  script, call, lit, while_, un, index, cApproach, cExit, cHalt,
} from "../src/ast-helpers.js";

function emptyRoom(overrides: Partial<Room> = {}): Room {
  return { w: 10, h: 10, doors: [], items: [], chests: [], ...overrides };
}

function mkActor(id: string, pos: { x: number; y: number }, kind: "hero" | "goblin" = "goblin"): Actor {
  const hp = kind === "hero" ? 20 : 5;
  return {
    id, kind, pos, hp, maxHp: hp, speed: 10, energy: 0, alive: true,
    script: script(cHalt()),
  };
}

function mkWorld(actors: Actor[], room: Room = emptyRoom()): World {
  return { room, actors, tick: 0, ended: false, aborted: false } as any;
}

describe("at() / distance() queries", () => {
  it("at(me) is always true", () => {
    const a = mkActor("a", { x: 3, y: 4 });
    const w = mkWorld([a]);
    expect(queries.at(w, a, a)).toBe(true);
  });

  it("at(other) flips when target moves onto same tile", () => {
    const a = mkActor("a", { x: 1, y: 1 });
    const b = mkActor("b", { x: 2, y: 2 });
    const w = mkWorld([a, b]);
    expect(queries.at(w, a, b)).toBe(false);
    b.pos = { x: 1, y: 1 };
    expect(queries.at(w, a, b)).toBe(true);
  });

  it("at() accepts bare pos objects and doors", () => {
    const a = mkActor("a", { x: 2, y: 2 });
    const w = mkWorld([a], emptyRoom({ doors: [{ dir: "N", pos: { x: 2, y: 2 } }] }));
    expect(queries.at(w, a, { pos: { x: 2, y: 2 } })).toBe(true);
    expect(queries.at(w, a, w.room.doors[0])).toBe(true);
    expect(queries.at(w, a, { pos: { x: 0, y: 0 } })).toBe(false);
  });

  it("at() returns false for non-positional arg (no crash)", () => {
    const a = mkActor("a", { x: 0, y: 0 });
    const w = mkWorld([a]);
    expect(queries.at(w, a, null)).toBe(false);
    expect(queries.at(w, a, 42)).toBe(false);
    expect(queries.at(w, a, "hi")).toBe(false);
  });

  it("distance() is Chebyshev", () => {
    const a = mkActor("a", { x: 0, y: 0 });
    const w = mkWorld([a]);
    const p = (x: number, y: number) => ({ pos: { x, y } });
    expect(queries.distance(w, a, p(0, 0), p(0, 0))).toBe(0);
    expect(queries.distance(w, a, p(3, 0), p(0, 0))).toBe(3); // straight
    expect(queries.distance(w, a, p(0, 4), p(0, 0))).toBe(4);
    expect(queries.distance(w, a, p(3, 3), p(0, 0))).toBe(3); // diagonal
    expect(queries.distance(w, a, p(-2, 5), p(1, 1))).toBe(4); // mixed
  });

  it("integration: while not at(door): approach(door); exit succeeds", () => {
    const room = emptyRoom({ doors: [{ dir: "N", pos: { x: 3, y: 3 } }] });
    const hero: Actor = {
      id: "h", kind: "hero", pos: { x: 0, y: 0 },
      hp: 20, maxHp: 20, speed: 12, energy: 0, alive: true,
      script: script(
        while_(
          un("!", call("at", index(call("doors"), lit(0)))),
          [cApproach(index(call("doors"), lit(0)))],
        ),
        cExit("N"),
        cHalt(),
      ),
    };
    const { world, log } = runRoom({ room, actors: [hero] }, { maxTicks: 200 });
    const h = world.actors.find(a => a.id === "h")!;
    expect(h.pos).toEqual({ x: 3, y: 3 });
    expect(log.some(l => l.event.type === "HeroExited")).toBe(true);
  });
});
