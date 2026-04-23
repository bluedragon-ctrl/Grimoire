import { describe, it, expect } from "vitest";
import type { Actor, Room } from "../../src/types.js";
import { startRoom, runRoom } from "../../src/engine.js";
import { applyEffect } from "../../src/effects.js";
import {
  script, while_, ident, call, lit, if_, cWait, cHalt,
} from "../../src/ast-helpers.js";

function emptyRoom(): Room {
  return { w: 10, h: 10, doors: [], items: [], chests: [] };
}

function makeHero(scr: Actor["script"]): Actor {
  return {
    id: "h", kind: "hero", hp: 20, maxHp: 20, speed: 10, energy: 0,
    pos: { x: 0, y: 0 }, alive: true,
    script: scr,
  };
}

describe("effects — query commands", () => {
  it("if has_effect(me, 'burning'): halt() — halts immediately when burning is pre-applied", () => {
    const h: Actor = {
      ...makeHero(script(
        if_(
          call("has_effect", ident("me"), lit("burning")),
          [cHalt()],
          [cWait()],
        ),
      )),
      effects: [{
        id: "pre", kind: "burning", target: "h",
        magnitude: 1, duration: 50, remaining: 50, tickEvery: 10,
      }],
    };
    const { log } = runRoom({ room: emptyRoom(), actors: [h] }, { maxTicks: 100 });
    expect(log.some(l => l.event.type === "Halted")).toBe(true);
    expect(log.some(l => l.event.type === "Waited")).toBe(false);
  });

  it("while has_effect(me, 'burning'): wait — script halts after burning expires", () => {
    const h: Actor = {
      ...makeHero(script(
        while_(call("has_effect", ident("me"), lit("burning")), [cWait()]),
        cHalt(),
      )),
      effects: [{
        id: "pre", kind: "burning", target: "h",
        magnitude: 1, duration: 50, remaining: 50, tickEvery: 10,
      }],
    };
    const { log } = runRoom({ room: emptyRoom(), actors: [h] }, { maxTicks: 500 });
    expect(log.some(l => l.event.type === "Halted")).toBe(true);
    expect(log.some(l => l.event.type === "EffectExpired")).toBe(true);
  });
});
