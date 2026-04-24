// Smoke test: every exported draw function renders on the canvas mock without
// throwing. Catches missing imports, arity bugs, and typos across the ported
// visual suite.

import { describe, it, expect } from "vitest";
import { makeCanvasMock } from "./canvas-mock.js";
import * as items from "../../src/render/items.js";
import * as effects from "../../src/render/effects.js";
import * as prims from "../../src/render/prims.js";
import { wire, lighten, darken, C } from "../../src/render/context.js";

describe("render/context", () => {
  it("exposes palette and helpers", () => {
    expect(typeof C.mage).toBe("string");
    expect(lighten("#112233", 0.5)).toMatch(/^#[0-9a-f]{6}$/);
    expect(darken("#112233", 0.5)).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("wire() sets stroke state", () => {
    const ctx = makeCanvasMock();
    wire(ctx, "#aabbcc", 8);
    expect(ctx.strokeStyle).toBe("#aabbcc");
    expect(ctx.shadowBlur).toBe(8);
  });
});

describe("render/prims — smoke", () => {
  const ctx = makeCanvasMock();
  it("dots/eyePair/lines/poly/zigzag/orbit don't throw", () => {
    expect(() => prims.dots(ctx, [[0, 0], [5, 5]], 2)).not.toThrow();
    expect(() => prims.eyePair(ctx, 10, 10, 3, 1)).not.toThrow();
    expect(() => prims.lines(ctx, [[0, 0, 10, 10]])).not.toThrow();
    expect(() => prims.poly(ctx, [[0, 0], [5, 5], [10, 0]], true)).not.toThrow();
    expect(() => prims.zigzag(ctx, [0, 0, 5, 5, 10, 0])).not.toThrow();
    expect(() => prims.orbit(ctx, 10, 10, 4, 0.5, 5, 5, 1, 1)).not.toThrow();
  });
});

describe("render/items — smoke (every exported draw)", () => {
  const ctx = makeCanvasMock();
  for (const [name, fn] of Object.entries(items)) {
    if (typeof fn !== "function") continue;
    if (name === "ITEM_DRAWS" || name === "drawItem") continue;
    it(`${name} renders without throwing`, () => {
      expect(() => (fn as (c: unknown, x: number, y: number, t?: number) => void)(ctx, 20, 20, 0.3)).not.toThrow();
    });
  }
});

describe("render/effects — smoke (every exported draw)", () => {
  const ctx = makeCanvasMock();
  const projectileParams = { x1: 0, y1: 0, x2: 30, y2: 30 };
  const areaParams = { cx: 20, cy: 20, radius: 1 };
  const overlayParams = { cx: 20, cy: 20 };

  const cases: Array<[string, (c: CanvasRenderingContext2D) => void]> = [
    ["beam",          c => effects.beam(c, projectileParams, 0.4)],
    ["bolt",          c => effects.bolt(c, projectileParams, 0.5)],
    ["arrow",         c => effects.arrow(c, projectileParams, 0.5)],
    ["zigzag",        c => effects.zigzag(c, projectileParams, 0.5)],
    ["orbs",          c => effects.orbs(c, projectileParams, 0.5)],
    ["thrown",        c => effects.thrown(c, projectileParams, 0.5)],
    ["explosion",     c => effects.explosion(c, areaParams, 0.5)],
    ["blobExplosion", c => effects.blobExplosion(c, areaParams, 0.5)],
    ["deathBurst",    c => effects.deathBurst(c, areaParams, 0.5)],
    ["cloudWavy",     c => effects.cloudWavy(c, overlayParams, 0.5)],
    ["burning",       c => effects.burning(c, overlayParams, 0.5)],
    ["sparkling",     c => effects.sparkling(c, overlayParams, 0.5)],
    ["dripping",      c => effects.dripping(c, overlayParams, 0.5)],
    ["healing",       c => effects.healing(c, overlayParams, 0.5)],
    ["barrier",       c => effects.barrier(c, overlayParams, 0.5)],
  ];

  for (const [name, run] of cases) {
    it(`${name} renders without throwing`, () => {
      expect(() => run(ctx)).not.toThrow();
    });
  }

  it("drawEffect dispatches by name", () => {
    expect(() => effects.drawEffect(ctx, "beam", projectileParams, 0.3)).not.toThrow();
    expect(() => effects.drawEffect(ctx, "nope", projectileParams, 0.3)).not.toThrow();
  });

  it("EFFECT_KIND and EFFECT_DURATION cover all renderers", () => {
    for (const name of Object.keys(effects.EFFECT_RENDERERS)) {
      expect(effects.EFFECT_KIND).toHaveProperty(name);
      expect(effects.EFFECT_DURATION).toHaveProperty(name);
    }
  });
});
