import { describe, it, expect } from "vitest";
import type { Actor, Room, World } from "../../src/types.js";
import { queries, doPickup, doDrop } from "../../src/commands.js";
import { BAG_SIZE, emptyEquipped } from "../../src/content/items.js";
import { ensureInventory, mintInstance } from "../../src/items/execute.js";
import { spawnFloorItem } from "../../src/items/loot.js";
import { WireRendererAdapter, type WireDeps } from "../../src/render/wire-adapter.js";
import { script, cHalt } from "../../src/ast-helpers.js";

function mkWorld(actors: Actor[], room?: Partial<Room>): World {
  return {
    tick: 0,
    room: { w: 5, h: 5, doors: [], chests: [], clouds: [], floorItems: [], ...room },
    actors, log: [], aborted: false, ended: false,
    rngSeed: 1, floorSeq: 0,
  };
}
function mkHero(over: Partial<Actor> = {}): Actor {
  return {
    id: "h", kind: "hero", hp: 10, maxHp: 10, speed: 10, energy: 0, alive: true,
    pos: { x: 2, y: 2 }, script: script(cHalt()),
    inventory: { consumables: [], equipped: emptyEquipped() },
    ...over,
  };
}

describe("doPickup", () => {
  it("zero-arg picks up the topmost item on the hero's tile", () => {
    const h = mkHero();
    const w = mkWorld([h]);
    spawnFloorItem(w, "health_potion", { x: 2, y: 2 }, "death", null);
    spawnFloorItem(w, "mana_crystal", { x: 2, y: 2 }, "death", null);

    const events = doPickup(w, h, undefined);
    expect(events[0]!.type).toBe("ItemPickedUp");
    expect((events[0] as any).defId).toBe("mana_crystal"); // topmost = last-dropped
    expect(w.room.floorItems!.length).toBe(1);
    expect(h.inventory!.consumables.length).toBe(1);
    expect(h.inventory!.consumables[0]!.defId).toBe("mana_crystal");
  });

  it("pickup by defId targets the matching item on the tile", () => {
    const h = mkHero();
    const w = mkWorld([h]);
    spawnFloorItem(w, "health_potion", { x: 2, y: 2 }, "death", null);
    spawnFloorItem(w, "mana_crystal", { x: 2, y: 2 }, "death", null);

    doPickup(w, h, "health_potion");
    expect(h.inventory!.consumables[0]!.defId).toBe("health_potion");
    expect(w.room.floorItems!.length).toBe(1);
    expect(w.room.floorItems![0]!.defId).toBe("mana_crystal");
  });

  it("phase 15: pickup is uncapped — never fails for inventory size", () => {
    const h = mkHero();
    const inv = ensureInventory(h);
    for (let i = 0; i < 10; i++) inv.consumables.push(mintInstance("health_potion"));
    const w = mkWorld([h]);
    spawnFloorItem(w, "mana_crystal", { x: 2, y: 2 }, "death", null);

    const events = doPickup(w, h, undefined);
    expect(events[0]!.type).toBe("ItemPickedUp");
    expect(w.room.floorItems!.length).toBe(0);
    expect(h.inventory!.consumables.length).toBe(11);
  });

  it("fails when no item on the tile", () => {
    const h = mkHero();
    const w = mkWorld([h]);
    const events = doPickup(w, h, undefined);
    expect(events[0]!.type).toBe("ActionFailed");
  });

  it("equipment pickup queues into foundGear and lands in inventory", () => {
    const h = mkHero();
    const inv = ensureInventory(h);
    for (let i = 0; i < 4; i++) inv.consumables.push(mintInstance("health_potion"));
    const w = mkWorld([h]);
    spawnFloorItem(w, "fire_staff", { x: 2, y: 2 }, "death", null);

    const events = doPickup(w, h, undefined);
    expect(events[0]!.type).toBe("ItemPickedUp");
    expect(h.foundGear).toContain("fire_staff");
    expect(h.knownGear ?? []).not.toContain("fire_staff");
    // Phase 15: wearables stay in inventory until attempt-end auto-routing.
    expect(h.inventory!.consumables.find(i => i.defId === "fire_staff")).toBeTruthy();
    expect(w.room.floorItems!.length).toBe(0);
  });

  it("equipment pickup queues even if defId already known (processed at exit)", () => {
    const h = mkHero({ knownGear: ["fire_staff"] });
    const w = mkWorld([h]);
    spawnFloorItem(w, "fire_staff", { x: 2, y: 2 }, "death", null);

    doPickup(w, h, undefined);
    expect(h.foundGear).toEqual(["fire_staff"]);
  });
});

describe("doDrop", () => {
  it("round-trips: drop then pickup recovers the item", () => {
    const h = mkHero();
    ensureInventory(h).consumables.push(mintInstance("health_potion"));
    const w = mkWorld([h]);

    const dropped = doDrop(w, h, "health_potion");
    expect(dropped[0]!.type).toBe("ItemDropped");
    expect(h.inventory!.consumables.length).toBe(0);
    expect(w.room.floorItems!.length).toBe(1);

    const picked = doPickup(w, h, undefined);
    expect(picked[0]!.type).toBe("ItemPickedUp");
    expect(h.inventory!.consumables[0]!.defId).toBe("health_potion");
  });
});

describe("floor-item queries", () => {
  it("items() sorts by Chebyshev distance; items(r) filters by radius; items(0) is same tile", () => {
    const h = mkHero();
    const w = mkWorld([h]);
    spawnFloorItem(w, "health_potion", { x: 2, y: 2 }, "death", null);
    spawnFloorItem(w, "mana_crystal", { x: 2, y: 2 }, "death", null);
    spawnFloorItem(w, "haste_potion", { x: 4, y: 2 }, "death", null);
    spawnFloorItem(w, "cleanse_potion", { x: 2, y: 4 }, "death", null);

    const here = queries.items(w, h, 0);
    expect(here.every(f => f.pos.x === 2 && f.pos.y === 2)).toBe(true);
    expect(here).toHaveLength(2);

    const near = queries.items(w, h, 5);
    // First two are on-tile (distance 0), then distance 2.
    expect(near[0]!.pos).toEqual({ x: 2, y: 2 });
    expect(near[1]!.pos).toEqual({ x: 2, y: 2 });
    expect(near.slice(2).every(f => Math.max(Math.abs(f.pos.x - 2), Math.abs(f.pos.y - 2)) === 2)).toBe(true);

    const all = queries.items(w, h);
    expect(all).toHaveLength(4);

    const tight = queries.items(w, h, 1);
    expect(tight).toHaveLength(2);
  });
});

describe("renderer adapter — floor-item events", () => {
  function makeAdapter() {
    const deps: Partial<WireDeps> = {
      init: () => {}, render: () => {}, schedule: () => 0, cancel: () => {},
      runFrameLoop: false,
    };
    return new WireRendererAdapter(deps);
  }
  const room: Room = { w: 5, h: 5, doors: [], chests: [], floorItems: [] };

  it("ItemDropped adds a floor item and an effect; ItemPickedUp removes it", () => {
    const adapter = makeAdapter();
    const el = document.createElement("div");
    const h: Actor = {
      id: "hero", kind: "hero", hp: 10, maxHp: 10, speed: 1, energy: 0, pos: { x: 2, y: 2 },
      script: { main: [], handlers: [], funcs: [] }, alive: true,
    };
    adapter.mount(el, room, [h]);

    adapter.apply({
      type: "ItemDropped", actor: null, item: "fi1_health_potion",
      defId: "health_potion", pos: { x: 2, y: 2 }, source: "death",
    });
    let s = adapter.getState()!;
    expect(s.floorItems).toHaveLength(1);
    expect(s.floorItems[0]!.type).toBe("health_potion");
    expect(s.activeEffects.some(e => e.kind === "area")).toBe(true);

    adapter.apply({
      type: "ItemPickedUp", actor: "hero", item: "fi1_health_potion",
      defId: "health_potion", pos: { x: 2, y: 2 },
    });
    s = adapter.getState()!;
    expect(s.floorItems).toHaveLength(0);
    expect(s.activeEffects.some(e => e.name === "sparkling")).toBe(true);
  });
});
