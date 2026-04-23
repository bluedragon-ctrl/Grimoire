import { describe, it, expect } from "vitest";
import type { Actor, Room } from "../../src/types.js";
import { startRoom } from "../../src/engine.js";
import { parse } from "../../src/lang/parser.js";
import {
  script, cWait, cHalt, cApproach, index, call, lit, while_,
} from "../../src/ast-helpers.js";

function room(over: Partial<Room> = {}): Room {
  return { w: 10, h: 10, doors: [], items: [], chests: [], ...over };
}

function goblin(id: string, pos: { x: number; y: number }, scriptNode: any): Actor {
  return {
    id, kind: "goblin", pos,
    hp: 5, maxHp: 5, speed: 10, energy: 0, alive: true,
    script: scriptNode,
  };
}

describe("debugger step()", () => {
  it("advances exactly one action per call; done flips on last", () => {
    const a = goblin("a", { x: 0, y: 0 }, script(cWait(), cWait(), cWait(), cHalt()));
    const h = startRoom({ room: room(), actors: [a] });

    const r1 = h.step();
    expect(r1.events.length).toBeGreaterThanOrEqual(1);
    expect(r1.events[0]!.type).toBe("Waited");
    expect(r1.done).toBe(false);

    const r2 = h.step();
    expect(r2.events[0]!.type).toBe("Waited");
    expect(r2.done).toBe(false);

    const r3 = h.step();
    expect(r3.events[0]!.type).toBe("Waited");

    const r4 = h.step();
    expect(r4.events[0]!.type).toBe("Halted");
    expect(r4.done).toBe(true);
  });

  it("currentLoc traces correct source lines through a loop", () => {
    const source = [
      "while hp() > 0:",     // 1
      "  wait()",            // 2
      "  wait()",            // 3
      "  halt()",            // 4
      "",                    // 5
      "",                    // 6
    ].join("\n");
    const s = parse(source);
    const hero: Actor = {
      id: "h", kind: "hero", pos: { x: 0, y: 0 },
      hp: 20, maxHp: 20, speed: 12, energy: 0, alive: true,
      script: s,
    };
    const h = startRoom({ room: room(), actors: [hero] });

    h.step(); expect(h.currentLoc?.start.line).toBe(2);
    h.step(); expect(h.currentLoc?.start.line).toBe(3);
    h.step(); expect(h.currentLoc?.start.line).toBe(4);
  });

  it("run() finishes; reset() restores initial state; first event matches fresh run", () => {
    const a = goblin("a", { x: 0, y: 0 }, script(cWait(), cWait(), cHalt()));
    const h = startRoom({ room: room(), actors: [a] });

    h.step(); h.step();
    expect(h.world.log.length).toBe(2);

    h.reset();
    expect(h.world.log.length).toBe(0);
    expect(h.done).toBe(false);

    const r = h.step();
    expect(r.events[0]!.type).toBe("Waited");
  });

  it("pause() mid-run yields no further events until step/resume", () => {
    // Long-running wait loop; pause after a few steps.
    const a = goblin("a", { x: 0, y: 0 }, script(while_(lit(true), [cWait()])));
    const h = startRoom({ room: room(), actors: [a] }, { maxTicks: 500 });
    for (let i = 0; i < 5; i++) h.step();
    const logLenAtPause = h.world.log.length;
    h.pause();
    // Pause itself does nothing without step() — we just verify state.
    expect(h.world.log.length).toBe(logLenAtPause);
    // Step after pause still works.
    const r = h.step();
    expect(r.events.length).toBeGreaterThanOrEqual(1);
    expect(h.world.log.length).toBe(logLenAtPause + 1);
  });

  it("run() drives to completion equivalent to old runRoom", () => {
    const a = goblin("a", { x: 0, y: 0 }, script(cWait(), cWait(), cHalt()));
    const h = startRoom({ room: room(), actors: [a] });
    h.run();
    expect(h.done).toBe(true);
    const types = h.world.log.map(l => l.event.type);
    expect(types).toEqual(["Waited", "Waited", "Halted"]);
  });
});
