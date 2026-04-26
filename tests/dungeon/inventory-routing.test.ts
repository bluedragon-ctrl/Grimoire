// Inventory routing tests.

import { describe, it, expect } from "vitest";
import type { Actor, Room, World } from "../../src/types.js";
import { doPickup } from "../../src/commands.js";
import { spawnFloorItem } from "../../src/items/loot.js";
import { mintInstance } from "../../src/items/execute.js";
import { emptyEquipped } from "../../src/content/items.js";
import { script, cHalt } from "../../src/ast-helpers.js";
import { freshRun, routeInventoryToRun } from "../../src/persistence.js";

function mkWorld(actors: Actor[], room?: Partial<Room>): World {
  return {
    tick: 0,
    room: { w: 5, h: 5, doors: [], items: [], chests: [], floorItems: [], ...room },
    actors, log: [], aborted: false, ended: false,
    rngSeed: 1, floorSeq: 0,
  };
}

function mkHero(over: Partial<Actor> = {}): Actor {
  return {
    id: "h", kind: "hero", isHero: true, hp: 10, maxHp: 10, speed: 10, energy: 0, alive: true,
    pos: { x: 2, y: 2 }, script: script(cHalt()),
    inventory: { consumables: [], equipped: emptyEquipped() },
    ...over,
  };
}

describe("pickup is uncapped", () => {
  it("adds to inventory regardless of count", () => {
    const h = mkHero();
    for (let i = 0; i < 20; i++) h.inventory!.consumables.push(mintInstance("health_potion"));
    const w = mkWorld([h]);
    spawnFloorItem(w, "mana_crystal", { x: 2, y: 2 }, "death", null);
    const events = doPickup(w, h, undefined);
    expect(events[0]!.type).toBe("ItemPickedUp");
    expect(h.inventory!.consumables.length).toBe(21);
  });
});

describe("wearable pickup keeps it in inventory until attempt-end", () => {
  it("equipped slot unchanged during attempt", () => {
    const h = mkHero({
      inventory: {
        consumables: [],
        equipped: { ...emptyEquipped(), staff: { id: "ws1", defId: "wooden_staff" } },
      },
    });
    const w = mkWorld([h]);
    spawnFloorItem(w, "fire_staff", { x: 2, y: 2 }, "death", null);
    const events = doPickup(w, h, undefined);
    expect(events[0]!.type).toBe("ItemPickedUp");
    // fire_staff lives in inventory.
    expect(h.inventory!.consumables.find(i => i.defId === "fire_staff")).toBeTruthy();
    // Equipped staff unchanged.
    expect(h.inventory!.equipped.staff?.defId).toBe("wooden_staff");
  });
});

describe("chest contents push to inventory", () => {
  it("opening a chest with a loot table pushes items into hero inventory", async () => {
    // Build a forced chest + loot table so this test is deterministic.
    const { CHEST_LOOT_TABLES } = await import("../../src/content/loot.js");
    const prev = CHEST_LOOT_TABLES["__test_forced"];
    CHEST_LOOT_TABLES["__test_forced"] = [
      { defId: "health_potion", chance: 1.0, min: 2, max: 2 },
      { defId: "mana_crystal", chance: 1.0 },
    ];
    try {
      const { doInteractCore } = await import("../../src/dungeon/objects.js");
      const h = mkHero({ pos: { x: 2, y: 2 } });
      const w = mkWorld([h], {
        objects: [{ id: "c1", kind: "chest", pos: { x: 2, y: 2 }, locked: false, lootTableId: "__test_forced" }],
      });
      const result = doInteractCore(w, h, undefined);
      expect(result.ok).toBe(true);
      expect(h.inventory!.consumables.filter(i => i.defId === "health_potion").length).toBe(2);
      expect(h.inventory!.consumables.filter(i => i.defId === "mana_crystal").length).toBe(1);
    } finally {
      if (prev) CHEST_LOOT_TABLES["__test_forced"] = prev;
      else delete CHEST_LOOT_TABLES["__test_forced"];
    }
  });
});

describe("death-routing", () => {
  it("inventory wearables fill empty slots first, remainder to depot", () => {
    const run = freshRun();
    // freshRun.equipped.hat is null already.
    const hero = mkHero({
      inventory: {
        consumables: [
          { id: "x1", defId: "wizard_hat" },
          { id: "x2", defId: "iron_helm" },  // overflow → depot (hat slot now filled)
        ],
        equipped: emptyEquipped(),
      },
    });
    routeInventoryToRun(hero, run);
    expect((run.equipped.hat as any)?.defId).toBe("wizard_hat");
    expect(run.depot.some(i => i.defId === "iron_helm")).toBe(true);
  });

  it("equipped wearables are not displaced by inventory wearables", () => {
    const run = freshRun();
    // Hat slot starts empty in freshRun, fill it explicitly.
    run.equipped.hat = { id: "h_orig", defId: "iron_helm" };
    const hero = mkHero({
      inventory: {
        consumables: [{ id: "x1", defId: "wizard_hat" }],
        equipped: { ...emptyEquipped(), hat: { id: "h_orig", defId: "iron_helm" } },
      },
    });
    routeInventoryToRun(hero, run);
    expect(run.equipped.hat?.defId).toBe("iron_helm");
    expect(run.depot.some(i => i.defId === "wizard_hat")).toBe(true);
  });

  it("consumables go to depot, keys are discarded", () => {
    const run = freshRun();
    const initialDepotSize = run.depot.length;
    const hero = mkHero({
      inventory: {
        consumables: [
          { id: "k1", defId: "key" },
          { id: "p1", defId: "haste_potion" },
          { id: "p2", defId: "shield_potion" },
        ],
        equipped: emptyEquipped(),
      },
    });
    routeInventoryToRun(hero, run);
    const newDepotItems = run.depot.slice(initialDepotSize);
    expect(newDepotItems.find(i => i.defId === "haste_potion")).toBeTruthy();
    expect(newDepotItems.find(i => i.defId === "shield_potion")).toBeTruthy();
    expect(newDepotItems.find(i => i.defId === "key")).toBeFalsy();
  });

  it("known spells and known gear persist via routing", () => {
    const run = freshRun();
    const hero = mkHero({
      knownSpells: ["bolt", "heal", "fireball"],
      knownGear: ["wooden_staff", "fire_staff"],
      inventory: { consumables: [], equipped: emptyEquipped() },
    });
    routeInventoryToRun(hero, run);
    expect(run.knownSpells).toContain("fireball");
    expect(run.knownGear).toContain("fire_staff");
  });
});
