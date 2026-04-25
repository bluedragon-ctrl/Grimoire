// Tests for the death/recall recap screen via run-state.ts.

import { describe, it, expect } from "vitest";
import { RunController, type RecapInfo } from "../../src/ui/run-state.js";
import type { RoomSetup } from "../../src/engine.js";
import { parse } from "../../src/lang/index.js";
import { emptyEquipped } from "../../src/content/items.js";

function makeSetup(): RoomSetup {
  return {
    room: { w: 5, h: 5, doors: [{ dir: "N", pos: { x: 2, y: 0 } }], items: [], chests: [] },
    actors: [{
      id: "hero", kind: "hero", isHero: true, hp: 20, maxHp: 20,
      speed: 10, energy: 0, pos: { x: 2, y: 2 },
      script: parse("halt\n"), alive: true,
      inventory: { consumables: [], equipped: emptyEquipped() },
    }],
  };
}

function makeCtl(): RunController {
  return new RunController({ generate: () => makeSetup() });
}

describe("RunController — death recap", () => {
  it("die() transitions to recap with outcome=death", () => {
    const ctl = makeCtl();
    ctl.startRun();
    ctl.die(42, "Killed by goblin in room 1.");
    const s = ctl.getState();
    expect(s.phase).toBe("recap");
    expect(s.recap).not.toBeNull();
    expect(s.recap!.outcome).toBe("death");
    expect(s.recap!.turns).toBe(42);
    expect(s.recap!.cause).toBe("Killed by goblin in room 1.");
  });

  it("die() then continueAfterRecap() increments attempts and stays on same level", () => {
    const ctl = makeCtl();
    ctl.startRun();
    ctl.die(10);
    expect(ctl.getState().phase).toBe("recap");
    ctl.continueAfterRecap();
    const s = ctl.getState();
    expect(s.phase).toBe("prep");
    expect(s.level).toBe(1);        // same level
    expect(s.attempts).toBe(2);     // incremented
    expect(s.recap).toBeNull();
  });

  it("succeed() sets outcome=success", () => {
    const ctl = makeCtl();
    ctl.startRun();
    ctl.succeed(30);
    const s = ctl.getState();
    expect(s.recap!.outcome).toBe("success");
  });

  it("succeed() then continueAfterRecap() advances to next level", () => {
    const ctl = makeCtl();
    ctl.startRun();
    ctl.succeed(30);
    ctl.continueAfterRecap();
    const s = ctl.getState();
    expect(s.level).toBe(2);
    expect(s.attempts).toBe(1);
  });

  it("recap.cause is undefined when die() called without cause arg", () => {
    const ctl = makeCtl();
    ctl.startRun();
    ctl.die(5);
    expect(ctl.getState().recap!.cause).toBeUndefined();
  });
});

describe("RunController — success recap (unchanged behaviour)", () => {
  it("recap title outcomes are distinct", () => {
    const ctlD = makeCtl(); ctlD.startRun(); ctlD.die(1);
    const ctlS = makeCtl(); ctlS.startRun(); ctlS.succeed(1);
    expect(ctlD.getState().recap!.outcome).toBe("death");
    expect(ctlS.getState().recap!.outcome).toBe("success");
  });
});
