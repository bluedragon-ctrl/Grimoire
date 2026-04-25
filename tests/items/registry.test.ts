import { describe, it, expect } from "vitest";
import type { WearableDef } from "../../src/types.js";
import { ITEMS, BAG_SIZE, SLOTS } from "../../src/content/items.js";
import { parseAllItems, getItemOps, validateAllWearables } from "../../src/items/execute.js";
import { ITEM_VISUAL_PRESETS } from "../../src/content/item-visuals.js";

describe("items registry", () => {
  it("parseAllItems: all consumables parse without throwing", () => {
    expect(() => parseAllItems()).not.toThrow();
  });

  it("every consumable has a non-empty ItemOp[] after parse", () => {
    for (const [id, def] of Object.entries(ITEMS)) {
      if (def.category !== "consumable") continue;
      const ops = getItemOps(id);
      expect(ops.length, `${id} has no ops`).toBeGreaterThan(0);
    }
  });

  it("getItemOps throws for wearables (they use structured data)", () => {
    expect(() => getItemOps("cloth_cap")).toThrow();
  });

  it("validateAllWearables: all 31 wearables pass load-time validation", () => {
    expect(() => validateAllWearables()).not.toThrow();
  });

  it("wearables have a valid slot", () => {
    for (const [id, def] of Object.entries(ITEMS)) {
      if (def.category === "wearable") {
        const w = def as WearableDef;
        expect(SLOTS.includes(w.slot), `${id} missing/bad slot`).toBe(true);
      }
    }
  });

  it("every slot has at least 5 wearables", () => {
    const counts: Record<string, number> = {};
    for (const def of Object.values(ITEMS)) {
      if (def.category === "wearable") {
        const slot = (def as WearableDef).slot;
        counts[slot] = (counts[slot] ?? 0) + 1;
      }
    }
    for (const slot of SLOTS) {
      expect(counts[slot] ?? 0, `slot '${slot}' has too few wearables`).toBeGreaterThanOrEqual(5);
    }
  });

  it("total wearable count is 31", () => {
    const wearables = Object.values(ITEMS).filter(d => d.category === "wearable");
    expect(wearables.length).toBe(31);
  });

  it("every item has a visual preset", () => {
    for (const [id, def] of Object.entries(ITEMS)) {
      const key = def.visualPreset ?? id;
      expect(ITEM_VISUAL_PRESETS[key], `${id} missing visual preset`).toBeTruthy();
    }
  });

  it("BAG_SIZE is 4", () => {
    expect(BAG_SIZE).toBe(4);
  });
});
