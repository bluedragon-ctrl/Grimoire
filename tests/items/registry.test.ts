import { describe, it, expect } from "vitest";
import { ITEMS, BAG_SIZE, SLOTS } from "../../src/content/items.js";
import { parseAllItems, getItemOps } from "../../src/items/execute.js";

describe("items registry", () => {
  it("all ITEMS entries parse at load (parseAllItems)", () => {
    expect(() => parseAllItems()).not.toThrow();
  });

  it("every item gets a non-empty ItemOp[] after parse", () => {
    for (const id of Object.keys(ITEMS)) {
      const ops = getItemOps(id);
      expect(ops.length).toBeGreaterThan(0);
    }
  });

  it("wearables have a valid slot", () => {
    for (const [id, def] of Object.entries(ITEMS)) {
      if (def.category === "wearable") {
        expect(SLOTS.includes(def.slot!), `${id} missing/bad slot`).toBe(true);
      }
    }
  });

  it("BAG_SIZE is 4", () => {
    expect(BAG_SIZE).toBe(4);
  });
});
