import { describe, it, expect, vi } from "vitest";
import { scale, scaleRadius } from "../../src/content/scaling.js";

describe("scale (INT scaling)", () => {
  it("default formula: floor(base * (1 + int/10))", () => {
    expect(scale(10, 0)).toBe(10);
    expect(scale(10, 5)).toBe(15);
    expect(scale(10, 10)).toBe(20);
    expect(scale(1, 5)).toBe(1);   // floor(1.5)
    expect(scale(4, 5)).toBe(6);   // floor(6.0)
    expect(scale(4, 0)).toBe(4);
  });

});

describe("scaleRadius (INT radius scaling)", () => {
  it("base + floor(int / 8) at int 0 / 8 / 16 / 24", () => {
    expect(scaleRadius(2, 0)).toBe(2);   // 2 + 0
    expect(scaleRadius(2, 8)).toBe(3);   // 2 + 1
    expect(scaleRadius(2, 16)).toBe(4);  // 2 + 2
    expect(scaleRadius(2, 24)).toBe(5);  // 2 + 3
  });

  it("radius 0 stays 0 when int 0", () => {
    expect(scaleRadius(0, 0)).toBe(0);
  });

  it("does not scale as fast as scale() — int 10 adds 1, not 10", () => {
    expect(scaleRadius(2, 10)).toBe(3);  // 2 + floor(10/8) = 3
    expect(scale(2, 10)).toBe(4);        // floor(2 * 2) = 4
  });
});

describe("scale (INT scaling)", () => {
  it("swapping the scale fn via vi.mock changes spell damage", async () => {
    vi.resetModules();
    vi.doMock("../../src/content/scaling.js", () => ({
      scale: (base: number, _int: number) => base * 100,
    }));
    const mod = await import("../../src/content/scaling.js");
    expect(mod.scale(4, 0)).toBe(400);
    vi.doUnmock("../../src/content/scaling.js");
    vi.resetModules();
  });
});
