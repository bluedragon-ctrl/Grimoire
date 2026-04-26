import { describe, it, expect } from "vitest";
import { ITEMS, BAG_SIZE, SLOTS } from "../../src/content/items.js";
import { parseAllItems, getItemOps, validateAllWearables } from "../../src/items/execute.js";
import { ITEM_VISUAL_PRESETS } from "../../src/content/item-visuals.js";

describe("items registry", () => {
  it("parseAllItems: parses without throwing", () => {
    expect(() => parseAllItems()).not.toThrow();
  });

  it("validateAllWearables: all 31 wearables pass load-time validation", () => {
    expect(() => validateAllWearables()).not.toThrow();
  });

  it("equipment items with DSL script parse to non-empty ItemOp[]", () => {
    for (const [id, def] of Object.entries(ITEMS)) {
      if (def.kind === "equipment" && def.script) {
        const ops = getItemOps(id);
        expect(ops.length, `${id} ops empty`).toBeGreaterThan(0);
      }
    }
  });

  it("equipment items have a valid slot", () => {
    for (const [id, def] of Object.entries(ITEMS)) {
      if (def.kind === "equipment") {
        expect(SLOTS.includes(def.slot!), `${id} missing/bad slot`).toBe(true);
      }
    }
  });

  it("consumables have useTarget, range, and body", () => {
    for (const [id, def] of Object.entries(ITEMS)) {
      if (def.kind === "consumable") {
        expect(def.useTarget, `${id} missing useTarget`).toBeDefined();
        expect(def.range, `${id} missing range`).toBeDefined();
        expect(def.body, `${id} missing body`).toBeDefined();
        // Phase 15: `key` is an inert consumable consumed by interact() — empty body OK.
        if (id !== "key") {
          expect(def.body!.length, `${id} empty body`).toBeGreaterThan(0);
        }
      }
    }
  });

  it("scrolls have a spell field", () => {
    for (const [id, def] of Object.entries(ITEMS)) {
      if (def.kind === "scroll") {
        expect(def.spell, `${id} missing spell`).toBeTruthy();
      }
    }
  });

  it("all items have level", () => {
    for (const [id, def] of Object.entries(ITEMS)) {
      expect(typeof def.level === "number", `${id} missing level`).toBe(true);
    }
  });

  it("every slot has at least 5 wearables", () => {
    const counts: Record<string, number> = {};
    for (const def of Object.values(ITEMS)) {
      if (def.kind === "equipment" && def.slot) {
        counts[def.slot] = (counts[def.slot] ?? 0) + 1;
      }
    }
    for (const slot of SLOTS) {
      expect(counts[slot] ?? 0, `slot '${slot}' has too few wearables`).toBeGreaterThanOrEqual(5);
    }
  });

  it("total equipment count is 31", () => {
    const equipment = Object.values(ITEMS).filter(d => d.kind === "equipment");
    expect(equipment.length).toBe(31);
  });

  it("every item has a visual preset", () => {
    for (const [id, def] of Object.entries(ITEMS)) {
      const key = def.visualPreset ?? id;
      expect(ITEM_VISUAL_PRESETS[key], `${id} missing visual preset`).toBeTruthy();
    }
  });

  it("BAG_SIZE is unbounded (Phase 15)", () => {
    expect(BAG_SIZE).toBe(Number.POSITIVE_INFINITY);
  });
});
