import { describe, it, expect } from "vitest";
import { ITEMS, BAG_SIZE, SLOTS } from "../../src/content/items.js";
import { parseAllItems, getItemOps } from "../../src/items/execute.js";

describe("items registry", () => {
  it("all ITEMS entries parse at load (parseAllItems)", () => {
    expect(() => parseAllItems()).not.toThrow();
  });

  it("every equipment item gets a non-empty ItemOp[] after parse", () => {
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
        expect(def.body!.length, `${id} empty body`).toBeGreaterThan(0);
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

  it("BAG_SIZE is 4", () => {
    expect(BAG_SIZE).toBe(4);
  });
});
