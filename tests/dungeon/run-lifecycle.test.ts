// Phase 15: run-lifecycle integration tests.

import { describe, it, expect, beforeEach } from "vitest";
import { RunController } from "../../src/ui/run-state.js";
import { generateRoom } from "../../src/dungeon/generator.js";
import { freshRun, loadRun, saveRun, wipeRun, routeInventoryToRun, buildAttemptHero } from "../../src/persistence.js";
import type { PersistentRun, Actor } from "../../src/types.js";
import { emptyEquipped } from "../../src/content/items.js";

function ctrl(initialRun?: PersistentRun): RunController {
  return new RunController({
    generate: (depth) => generateRoom(depth, depth * 99991),
    initialRun: initialRun ?? freshRun(),
  });
}

beforeEach(() => {
  if (typeof localStorage !== "undefined") localStorage.clear();
});

describe("HP/MP persistence across rooms", () => {
  it("advanceDepth carries hp/mp into the next room", () => {
    const c = ctrl();
    c.startAttempt();
    const hero = c.getState().current.actors[0]!;
    hero.hp = 7;
    hero.mp = 4;
    c.advanceDepth(hero);
    const next = c.getState().current.actors[0]!;
    expect(next.hp).toBe(7);
    expect(next.mp).toBe(4);
  });
});

describe("Death routing — wearables fill empty slots, overflow to depot", () => {
  it("wearables in inventory fill empty slots; equipped wearables stay", () => {
    const run = freshRun();
    // freshRun has hat/focus empty and staff/dagger equipped — perfect for this test.
    const hero: Actor = {
      id: "hero", kind: "hero", isHero: true, hp: 0, maxHp: 20, speed: 1, energy: 0,
      pos: { x: 0, y: 0 }, script: { main: [], handlers: [], funcs: [] }, alive: false,
      inventory: {
        consumables: [
          { id: "i1", defId: "wizard_hat" },
          { id: "i2", defId: "quartz_focus" },
          { id: "i3", defId: "fire_staff" }, // staff slot already occupied → depot
          { id: "i4", defId: "health_potion" },
          { id: "i5", defId: "key" },
        ],
        equipped: {
          ...emptyEquipped(),
          staff: { id: "s_orig", defId: "wooden_staff" },
          dagger: { id: "d_orig", defId: "bone_dagger" },
        },
      },
    };
    routeInventoryToRun(hero, run);
    expect(run.equipped.hat?.defId).toBe("wizard_hat");
    expect(run.equipped.focus?.defId).toBe("quartz_focus");
    // Original staff stays equipped (we copy from hero.inventory.equipped).
    expect(run.equipped.staff?.defId).toBe("wooden_staff");
    // Overflow staff went to depot.
    expect(run.depot.some(i => i.defId === "fire_staff")).toBe(true);
    // Consumable went to depot.
    expect(run.depot.some(i => i.defId === "health_potion")).toBe(true);
    // Key was discarded.
    expect(run.depot.some(i => i.defId === "key")).toBe(false);
  });
});

describe("Pre-attempt loadout", () => {
  it("selecting items moves depot → inventory; deselected stays", () => {
    const run = freshRun();
    const initialDepotSize = run.depot.length;
    const c = ctrl(run);
    c.toggleLoadout("health_potion");
    c.toggleLoadout("mana_crystal");
    c.startAttempt();
    const hero = c.getState().current.actors[0]!;
    expect(hero.inventory!.consumables.length).toBe(2);
    expect(c.getState().run.depot.length).toBe(initialDepotSize - 2);
  });

  it("supports 0 selections (BREACH with empty inventory)", () => {
    const c = ctrl();
    c.startAttempt();
    const hero = c.getState().current.actors[0]!;
    expect(hero.inventory!.consumables.length).toBe(0);
  });

  it("caps at 4 selections (MAX_LOADOUT)", () => {
    const run = freshRun();
    for (let i = 0; i < 10; i++) run.depot.push({ id: `x${i}`, defId: "health_potion" });
    const c = ctrl(run);
    for (let i = 0; i < 10; i++) c.toggleLoadout("health_potion");
    expect(c.getState().loadout.length).toBeLessThanOrEqual(4);
  });
});

describe("New attempt after death", () => {
  it("starts at depth 1 with hero equipped wearables intact", () => {
    const c = ctrl();
    c.startAttempt();
    const hero = c.getState().current.actors[0]!;
    c.die(5, hero);
    c.tryAgain();
    const s = c.getState();
    expect(s.depth).toBe(1);
    expect(s.attempts).toBe(2);
    // Equipped slots from the run carry through into a fresh hero on startAttempt.
    expect(s.run.equipped.staff).toBeTruthy();
  });
});

describe("buildAttemptHero", () => {
  it("pulls selected defIds out of depot and equips run.equipped", () => {
    const run = freshRun();
    const beforeCount = run.depot.filter(i => i.defId === "health_potion").length;
    const hero = buildAttemptHero(run, ["health_potion"], { x: 1, y: 1 });
    expect(hero.inventory!.consumables.find(i => i.defId === "health_potion")).toBeTruthy();
    expect(hero.inventory!.equipped.staff?.defId).toBe("wooden_staff");
    const afterCount = run.depot.filter(i => i.defId === "health_potion").length;
    expect(afterCount).toBe(beforeCount - 1);
  });
});

describe("localStorage round-trip", () => {
  it("saveRun + loadRun preserves state; wipeRun clears it", () => {
    if (typeof localStorage === "undefined") return; // skip in non-DOM envs
    const run = freshRun();
    run.stats.attempts = 5;
    run.stats.deepestDepth = 7;
    saveRun(run);
    const loaded = loadRun();
    expect(loaded.stats.attempts).toBe(5);
    expect(loaded.stats.deepestDepth).toBe(7);
    wipeRun();
    const fresh = loadRun();
    expect(fresh.stats.attempts).toBe(0);
  });
});

describe("QUIT confirmation flow", () => {
  it("confirmQuit captures finalSnapshot; acknowledgeFinal wipes and reseeds", () => {
    if (typeof localStorage === "undefined") return;
    const c = ctrl();
    c.startAttempt();
    const hero = c.getState().current.actors[0]!;
    c.die(1, hero);
    c.requestQuit();
    c.confirmQuit();
    expect(c.getState().finalSnapshot).not.toBeNull();
    c.acknowledgeFinal();
    const s = c.getState();
    expect(s.phase).toBe("loadout");
    // Storage was wiped.
    expect(localStorage.getItem("grimoire.run.v1")).toBeNull();
  });
});

describe("Run stats accumulate", () => {
  it("attempts increment across deaths", () => {
    const c = ctrl();
    c.startAttempt();
    let hero = c.getState().current.actors[0]!;
    c.die(1, hero);
    c.tryAgain();
    expect(c.getState().attempts).toBe(2);
    c.startAttempt();
    hero = c.getState().current.actors[0]!;
    c.die(1, hero);
    c.tryAgain();
    expect(c.getState().attempts).toBe(3);
  });
});
