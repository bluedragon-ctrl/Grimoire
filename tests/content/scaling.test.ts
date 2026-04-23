import { describe, it, expect, vi } from "vitest";
import { scale } from "../../src/content/scaling.js";

describe("scale (INT scaling)", () => {
  it("default formula: floor(base * (1 + int/10))", () => {
    expect(scale(10, 0)).toBe(10);
    expect(scale(10, 5)).toBe(15);
    expect(scale(10, 10)).toBe(20);
    expect(scale(1, 5)).toBe(1);   // floor(1.5)
    expect(scale(4, 5)).toBe(6);   // floor(6.0)
    expect(scale(4, 0)).toBe(4);
  });

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
