// Death recap + try-again flow.

import { describe, it, expect } from "vitest";
import { RunController } from "../../src/ui/run-state.js";
import type { RoomSetup } from "../../src/engine.js";
import { parse } from "../../src/lang/index.js";
import { emptyEquipped } from "../../src/content/items.js";
import { freshRun } from "../../src/persistence.js";

function makeSetup(): RoomSetup {
  return {
    room: { w: 5, h: 5, doors: [{ dir: "N", pos: { x: 2, y: 0 } }], chests: [] },
    actors: [{
      id: "hero", kind: "hero", isHero: true, hp: 20, maxHp: 20,
      speed: 10, energy: 0, pos: { x: 2, y: 2 },
      script: parse("halt\n"), alive: true,
      inventory: { consumables: [], equipped: emptyEquipped() },
    }],
  };
}

function makeCtl(): RunController {
  return new RunController({ generate: () => makeSetup(), initialRun: freshRun() });
}

describe("RunController — death recap (phase 15)", () => {
  it("die() transitions to death_recap with the right metadata", () => {
    const ctl = makeCtl();
    ctl.startAttempt();
    const hero = ctl.getState().current.actors[0]!;
    ctl.die(42, hero, "Killed by goblin at depth 1.");
    const s = ctl.getState();
    expect(s.phase).toBe("death_recap");
    expect(s.recap!.outcome).toBe("death");
    expect(s.recap!.turns).toBe(42);
    expect(s.recap!.cause).toBe("Killed by goblin at depth 1.");
  });

  it("tryAgain after death increments attempts and resets to depth 1", () => {
    const ctl = makeCtl();
    ctl.startAttempt();
    const hero = ctl.getState().current.actors[0]!;
    ctl.die(10, hero);
    expect(ctl.getState().phase).toBe("death_recap");
    ctl.tryAgain();
    const s = ctl.getState();
    expect(s.phase).toBe("loadout");
    expect(s.depth).toBe(1);
    expect(s.attempts).toBe(2);
    expect(s.recap).toBeNull();
  });

  it("recap.cause is undefined when die() called without cause arg", () => {
    const ctl = makeCtl();
    ctl.startAttempt();
    const hero = ctl.getState().current.actors[0]!;
    ctl.die(5, hero);
    expect(ctl.getState().recap!.cause).toBeUndefined();
  });
});
