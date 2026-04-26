// Phase 15: run-state machine tests. New lifecycle:
//   loadout → running → death_recap → loadout
//                     ↘ quit_confirm → final_review → loadout

import { describe, it, expect } from "vitest";
import { RunController, inspectorTabEnabled, helpTabEnabled } from "../../src/ui/run-state.js";
import { generateRoom } from "../../src/dungeon/generator.js";
import { freshRun } from "../../src/persistence.js";

function ctrl(): RunController {
  // Use freshRun() so each test starts clean (avoids any localStorage leakage).
  return new RunController({
    generate: (depth) => generateRoom(depth, depth * 1234567),
    initialRun: freshRun(),
  });
}

describe("RunController (phase 15)", () => {
  it("starts in loadout at depth 1, attempts 1", () => {
    const c = ctrl();
    const s = c.getState();
    expect(s.phase).toBe("loadout");
    expect(s.depth).toBe(1);
    expect(s.attempts).toBe(1);
    expect(s.current.actors.length).toBeGreaterThan(0);
  });

  it("startAttempt → running (loadout consumables move into hero inventory)", () => {
    const c = ctrl();
    c.toggleLoadout("health_potion");
    c.toggleLoadout("mana_crystal");
    c.startAttempt();
    const s = c.getState();
    expect(s.phase).toBe("running");
    const hero = s.current.actors[0]!;
    expect(hero.inventory!.consumables.map(i => i.defId).sort())
      .toEqual(["health_potion", "mana_crystal"].sort());
  });

  it("toggleLoadout caps at MAX_LOADOUT (4)", () => {
    const c = ctrl();
    // Seed depot with 5 items via internal manipulation.
    c.getState().run.depot.push(
      { id: "x1", defId: "health_potion" },
      { id: "x2", defId: "health_potion" },
      { id: "x3", defId: "health_potion" },
      { id: "x4", defId: "health_potion" },
      { id: "x5", defId: "health_potion" },
    );
    for (let i = 0; i < 6; i++) c.toggleLoadout("health_potion");
    expect(c.getState().loadout.length).toBeLessThanOrEqual(4);
  });

  it("die() routes inventory to depot and shows death_recap", () => {
    const c = ctrl();
    c.toggleLoadout("health_potion");
    c.startAttempt();
    const hero = c.getState().current.actors[0]!;
    // Pretend the hero picked up another potion mid-run.
    hero.inventory!.consumables.push({ id: "found1", defId: "haste_potion" });
    c.die(42, hero, "Killed by goblin.");
    const s = c.getState();
    expect(s.phase).toBe("death_recap");
    expect(s.recap!.outcome).toBe("death");
    expect(s.recap!.turns).toBe(42);
    // Depot now contains the haste potion routed at death.
    expect(s.run.depot.some(i => i.defId === "haste_potion")).toBe(true);
  });

  it("tryAgain resets to loadout at depth=1, attempts++", () => {
    const c = ctrl();
    c.startAttempt();
    const hero = c.getState().current.actors[0]!;
    c.die(10, hero);
    c.tryAgain();
    const s = c.getState();
    expect(s.phase).toBe("loadout");
    expect(s.depth).toBe(1);
    expect(s.attempts).toBe(2);
  });

  it("requestQuit → quit_confirm; cancelQuit returns to death_recap", () => {
    const c = ctrl();
    c.startAttempt();
    const hero = c.getState().current.actors[0]!;
    c.die(1, hero);
    c.requestQuit();
    expect(c.getState().phase).toBe("quit_confirm");
    c.cancelQuit();
    expect(c.getState().phase).toBe("death_recap");
  });

  it("confirmQuit → final_review; acknowledgeFinal wipes and reseeds to loadout", () => {
    const c = ctrl();
    c.startAttempt();
    const hero = c.getState().current.actors[0]!;
    c.die(1, hero);
    c.requestQuit();
    c.confirmQuit();
    expect(c.getState().phase).toBe("final_review");
    expect(c.getState().finalSnapshot).not.toBeNull();
    c.acknowledgeFinal();
    const s = c.getState();
    expect(s.phase).toBe("loadout");
    expect(s.depth).toBe(1);
    expect(s.attempts).toBe(1);
  });

  it("advanceDepth bumps depth and regenerates room, carrying hp/mp", () => {
    const c = ctrl();
    c.startAttempt();
    const heroBefore = c.getState().current.actors[0]!;
    heroBefore.hp = 8;
    heroBefore.mp = 5;
    c.advanceDepth(heroBefore);
    const s = c.getState();
    expect(s.depth).toBe(2);
    expect(s.current.actors[0]!.hp).toBe(8);
    expect(s.current.actors[0]!.mp).toBe(5);
  });
});

describe("tab enablement (phase 15)", () => {
  it("help tab enabled only during loadout", () => {
    expect(helpTabEnabled("loadout")).toBe(true);
    expect(helpTabEnabled("running")).toBe(false);
    expect(helpTabEnabled("paused")).toBe(false);
    expect(helpTabEnabled("death_recap")).toBe(false);
  });

  it("inspector tab enabled only during paused", () => {
    expect(inspectorTabEnabled("loadout")).toBe(false);
    expect(inspectorTabEnabled("running")).toBe(false);
    expect(inspectorTabEnabled("paused")).toBe(true);
    expect(inspectorTabEnabled("death_recap")).toBe(false);
  });
});
