import { describe, it, expect } from "vitest";
import type { Actor, Room } from "../../src/types.js";
import { runRoom } from "../../src/engine.js";
import { applyEffect } from "../../src/effects.js";
import { script, while_, lit, cWait } from "../../src/ast-helpers.js";

function emptyRoom(): Room {
  return { w: 10, h: 10, doors: [], chests: [] };
}

function waiter(over: Partial<Actor> = {}): Actor {
  return {
    id: "h", kind: "hero", hp: 20, maxHp: 20, speed: 10, energy: 0,
    pos: { x: 0, y: 0 }, alive: true,
    script: script(while_(lit(true), [cWait()])),
    ...over,
  };
}

function countWaits(log: any[]): number {
  return log.filter(l => l.event.type === "Waited").length;
}

describe("effects — modifiers on speed", () => {
  it("haste on speed=10 → effective 15, 180 waits over 60 ticks", () => {
    const a = waiter({ speed: 10 });
    let applied = false;
    const { log } = runRoom({ room: emptyRoom(), actors: [a] }, {
      maxTicks: 60,
      onTick: (w) => {
        if (!applied) {
          applyEffect(w, "h", "haste", Infinity);
          applied = true;
        }
      },
    });
    // speed 15, cost 5 → 3 per tick → 180 over 60.
    expect(countWaits(log)).toBe(180);
  });

  it("slow on speed=10 → effective 5, 60 waits over 60 ticks", () => {
    const a = waiter({ speed: 10 });
    let applied = false;
    const { log } = runRoom({ room: emptyRoom(), actors: [a] }, {
      maxTicks: 60,
      onTick: (w) => {
        if (!applied) { applyEffect(w, "h", "slow", Infinity); applied = true; }
      },
    });
    expect(countWaits(log)).toBe(60);
  });

  it("haste + slow → floor(10 * 1.5 * 0.5) = 7, 84 waits over 60 ticks", () => {
    const a = waiter({ speed: 10 });
    let applied = false;
    const { log } = runRoom({ room: emptyRoom(), actors: [a] }, {
      maxTicks: 60,
      onTick: (w) => {
        if (!applied) {
          applyEffect(w, "h", "haste", Infinity);
          applyEffect(w, "h", "slow", Infinity);
          applied = true;
        }
      },
    });
    // floor(10 * 0.75) = 7. 7/5 = 1.4/tick → 84 over 60.
    expect(countWaits(log)).toBe(84);
  });
});
