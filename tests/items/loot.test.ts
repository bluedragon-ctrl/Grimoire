import { describe, it, expect } from "vitest";
import type { Actor, Room, World } from "../../src/types.js";
import { rollDeathDrops, spawnOverflowDrop } from "../../src/items/loot.js";
import { unequipItem, ensureInventory, mintInstance } from "../../src/items/execute.js";
import { BAG_SIZE, emptyEquipped } from "../../src/content/items.js";
import { LOOT_TABLES } from "../../src/content/loot.js";
import { runRoom } from "../../src/engine.js";
import {
  script, call, lit, while_, if_, bin, member, index, exprStmt,
  cApproach, cAttack, cExit, cHalt,
} from "../../src/ast-helpers.js";

function mkWorld(actors: Actor[], room?: Partial<Room>): World {
  return {
    tick: 0,
    room: { w: 5, h: 5, doors: [], chests: [], clouds: [], floorItems: [], ...room },
    actors, log: [], aborted: false, ended: false,
    rngSeed: 1, floorSeq: 0,
  };
}
function mkGob(over: Partial<Actor> = {}): Actor {
  return {
    id: "g", kind: "goblin", hp: 0, maxHp: 5, speed: 10, energy: 0, alive: false,
    pos: { x: 2, y: 2 }, script: script(cHalt()), lootTable: "goblin_loot", ...over,
  };
}
function mkHero(over: Partial<Actor> = {}): Actor {
  return {
    id: "h", kind: "hero", hp: 10, maxHp: 10, speed: 10, energy: 0, alive: true,
    pos: { x: 0, y: 0 }, script: script(cHalt()),
    inventory: { consumables: [], equipped: emptyEquipped() },
    ...over,
  };
}

describe("rollDeathDrops", () => {
  it("is deterministic for a given seed", () => {
    const g1 = mkGob();
    const w1 = mkWorld([g1]);
    w1.rngSeed = 42;
    const events1 = rollDeathDrops(w1, g1);

    const g2 = mkGob();
    const w2 = mkWorld([g2]);
    w2.rngSeed = 42;
    const events2 = rollDeathDrops(w2, g2);

    expect(events1.map(e => e.type)).toEqual(events2.map(e => e.type));
    expect(events1.length).toBe(events2.length);
    if (events1.length > 0) {
      expect((events1[0] as any).defId).toBe((events2[0] as any).defId);
    }
  });

  it("spawns FloorItem entries at the actor's position with source='death'", () => {
    const g = mkGob({ pos: { x: 3, y: 4 } });
    const w = mkWorld([g]);
    // Force the chance to hit: use a seed where the first draw is < 0.5.
    // Iterate a few seeds to find one that produces at least one drop.
    for (let s = 1; s < 200; s++) {
      w.rngSeed = s; w.floorSeq = 0; w.room.floorItems = [];
      const evs = rollDeathDrops(w, g);
      if (evs.length > 0) {
        expect(evs[0]!.type).toBe("ItemDropped");
        expect((evs[0] as any).source).toBe("death");
        expect((evs[0] as any).pos).toEqual({ x: 3, y: 4 });
        expect((evs[0] as any).actor).toBe("g");
        expect(w.room.floorItems!.length).toBe(1);
        return;
      }
    }
    throw new Error("no seed produced a drop in first 200 tries");
  });

  it("empty table → no events", () => {
    const h = mkHero({ alive: false });
    const w = mkWorld([h]);
    expect(rollDeathDrops(w, h)).toEqual([]);
  });

  it("legacy 'goblin' alias is removed; canonical 'goblin_loot' key exists", () => {
    expect(LOOT_TABLES["goblin"]).toBeUndefined();
    expect(LOOT_TABLES["goblin_loot"]).toBeTruthy();
  });
});

describe("unequip routing (Phase 15: inventory uncapped)", () => {
  it("unequip pushes the ex-equipped item back into inventory (no overflow)", () => {
    const h = mkHero();
    const inv = ensureInventory(h);
    for (let i = 0; i < 10; i++) inv.consumables.push(mintInstance("health_potion"));
    const dagger = mintInstance("bone_dagger");
    inv.equipped.dagger = dagger;

    const w = mkWorld([h]);
    const events = unequipItem(w, h, "dagger");

    expect(events.some(e => e.type === "ItemUnequipped")).toBe(true);
    expect(w.room.floorItems?.length ?? 0).toBe(0);
    expect(inv.consumables.find(i => i.defId === "bone_dagger")).toBeTruthy();
  });

  it("end-to-end: hero kills goblin, walks to drop, picks up — with a forced-drop table", () => {
    // Temporarily pin goblin loot to 100% so this test is seed-insensitive.
    const prev = LOOT_TABLES["goblin_loot"];
    LOOT_TABLES["goblin_loot"] = [{ defId: "health_potion", chance: 1 }];
    try {
      const enemies0 = member(call("enemies"), "length");
      const firstEnemy = index(call("enemies"), lit(0));
      const hereLen = member(call("items", lit(0)), "length");
      const nearbyLen = member(call("items"), "length");
      const firstNearby = index(call("items"), lit(0));

      const heroScript = script(
        while_(bin(">", enemies0, lit(0)), [
          cApproach(firstEnemy),
          cAttack(firstEnemy),
        ]),
        while_(bin(">", nearbyLen, lit(0)), [
          if_(bin("==", hereLen, lit(0)),
            [cApproach(firstNearby)],
            [exprStmt(call("pickup"))]),
        ]),
        cHalt(),
      );

      const hero: Actor = {
        id: "hero", kind: "hero", hp: 20, maxHp: 20, speed: 12, energy: 0,
        pos: { x: 1, y: 1 }, script: heroScript, alive: true,
        inventory: { consumables: [], equipped: emptyEquipped() },
      };
      const gob: Actor = {
        id: "g", kind: "goblin", hp: 2, maxHp: 2, speed: 10, energy: 0,
        pos: { x: 3, y: 1 }, script: script(cHalt()), alive: true,
        lootTable: "goblin_loot",  // must be explicit now — no actor.kind fallback
      };
      const room: Room = { w: 6, h: 6, doors: [], chests: [] };
      const h = runRoom({ room, actors: [hero, gob] }, { seed: 1, maxTicks: 500 });

      const events = h.log.map(l => l.event);
      expect(events.some(e => e.type === "Died" && (e as any).actor === "g")).toBe(true);
      expect(events.some(e => e.type === "ItemDropped" && (e as any).source === "death")).toBe(true);
      expect(events.some(e => e.type === "ItemPickedUp" && (e as any).defId === "health_potion")).toBe(true);
      const heroAfter = h.world.actors.find(a => a.id === "hero")!;
      expect(heroAfter.inventory!.consumables.some(i => i.defId === "health_potion")).toBe(true);
    } finally {
      LOOT_TABLES["goblin_loot"] = prev!;
    }
  });

  it("direct helper places an item on the floor", () => {
    const h = mkHero({ pos: { x: 1, y: 2 } });
    const w = mkWorld([h]);
    const inst = mintInstance("health_potion");
    const ev = spawnOverflowDrop(w, h, inst);
    expect(ev.type).toBe("ItemDropped");
    expect((ev as any).pos).toEqual({ x: 1, y: 2 });
    expect(w.room.floorItems!.length).toBe(1);
  });
});
