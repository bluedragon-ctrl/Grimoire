import { describe, it, expect } from "vitest";
import { ITEMS } from "../../src/content/items.js";
import { ITEM_VISUAL_PRESETS, FALLBACK_PRESETS } from "../../src/content/item-visuals.js";

describe("ITEM_VISUAL_PRESETS", () => {
  it("every item resolves to a preset (by id or type fallback)", () => {
    for (const [id, def] of Object.entries(ITEMS)) {
      const key = def.visualPreset ?? id;
      const preset = ITEM_VISUAL_PRESETS[key];
      if (preset) {
        expect(preset.shape).toBeTruthy();
      } else {
        // Fallback path: must exist for some shape — we at least must know
        // which fallback to pick. Fail loudly if neither path works.
        expect(Object.keys(FALLBACK_PRESETS).length).toBeGreaterThan(0);
        throw new Error(`no preset for item '${id}' (key='${key}')`);
      }
    }
  });

  it("colors have at least one color field", () => {
    for (const [id, preset] of Object.entries(ITEM_VISUAL_PRESETS)) {
      const c = preset.colors;
      const any = c.color || c.col1 || c.col2;
      expect(any, `${id} has no color`).toBeTruthy();
    }
  });
});
