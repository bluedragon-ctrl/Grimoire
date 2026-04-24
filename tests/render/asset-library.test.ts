// Smoke tests for the visual asset library (Phase 12.6).
// Verifies every exported draw function:
//   (a) can be called without throwing, and
//   (b) makes at least one canvas draw call (fillRect, stroke, fill, or arc).
// Pixel correctness is intentionally NOT tested here.

import { describe, it, expect, vi } from "vitest";
import { makeCanvasMock } from "./canvas-mock.js";

import { MONSTER_RENDERERS, drawMonster } from "../../src/render/monsters.js";
import { TILE_RENDERERS, drawTile }        from "../../src/render/tiles.js";
import { OBJECT_RENDERERS, drawObject }    from "../../src/render/objects.js";
import { ITEM_RENDERERS, ITEM_DRAWS, drawItem } from "../../src/render/items.js";

import {
  MONSTER_VISUALS,
  TILE_VISUALS,
  OBJECT_VISUALS,
  ITEM_VISUALS,
} from "../../src/content/visuals.js";

// ── helpers ──────────────────────────────────────────────────────────────────

function spyCtx() {
  const ctx = makeCanvasMock();
  const calls: string[] = [];
  for (const m of ["fillRect", "stroke", "fill", "arc", "strokeRect", "fillText"] as const) {
    vi.spyOn(ctx, m).mockImplementation((..._args: unknown[]) => { calls.push(m); });
  }
  return { ctx, calls };
}

function didDraw(calls: string[]): boolean {
  return calls.length > 0;
}

// ── MONSTER_RENDERERS ─────────────────────────────────────────────────────────

describe("MONSTER_RENDERERS — every key draws without throwing", () => {
  for (const [key, fn] of Object.entries(MONSTER_RENDERERS)) {
    it(key, () => {
      const { ctx, calls } = spyCtx();
      expect(() => fn(ctx, 24, 24, 0)).not.toThrow();
      expect(didDraw(calls)).toBe(true);
    });
  }
});

// ── TILE_RENDERERS ────────────────────────────────────────────────────────────

describe("TILE_RENDERERS — every key draws without throwing", () => {
  for (const [key, fn] of Object.entries(TILE_RENDERERS)) {
    it(key, () => {
      const { ctx, calls } = spyCtx();
      expect(() => fn(ctx, 0, 0)).not.toThrow();
      expect(didDraw(calls)).toBe(true);
    });
  }
});

// ── OBJECT_RENDERERS ──────────────────────────────────────────────────────────

describe("OBJECT_RENDERERS — every key draws without throwing", () => {
  for (const [key, fn] of Object.entries(OBJECT_RENDERERS)) {
    it(key, () => {
      const { ctx, calls } = spyCtx();
      expect(() => fn(ctx, 24, 24, 0)).not.toThrow();
      expect(didDraw(calls)).toBe(true);
    });
  }
});

// ── ITEM_RENDERERS ────────────────────────────────────────────────────────────

describe("ITEM_RENDERERS — every key draws without throwing", () => {
  for (const [key, fn] of Object.entries(ITEM_RENDERERS)) {
    it(key, () => {
      const { ctx, calls } = spyCtx();
      expect(() => fn(ctx, 24, 24, 0)).not.toThrow();
      expect(didDraw(calls)).toBe(true);
    });
  }
});

// ITEM_DRAWS (shape-keyed internal registry) — also fully smoke-tested
describe("ITEM_DRAWS — every key draws without throwing", () => {
  for (const [key, fn] of Object.entries(ITEM_DRAWS)) {
    it(key, () => {
      const { ctx, calls } = spyCtx();
      expect(() => fn(ctx, 24, 24, 0)).not.toThrow();
      expect(didDraw(calls)).toBe(true);
    });
  }
});

// ── Dispatcher guards ─────────────────────────────────────────────────────────

describe("drawMonster — throws for unknown type", () => {
  it("unknown type without baseVisual", () => {
    const { ctx } = spyCtx();
    expect(() => drawMonster(ctx, 0, 0, "not_a_monster", 0)).toThrow(/no renderer/);
  });
  it("unknown type AND unknown baseVisual", () => {
    const { ctx } = spyCtx();
    expect(() => drawMonster(ctx, 0, 0, "x", 0, undefined, "y")).toThrow(/no renderer/);
  });
  it("unknown type but valid baseVisual falls back", () => {
    const { ctx } = spyCtx();
    expect(() => drawMonster(ctx, 0, 0, "unknown_boss", 0, undefined, "skeleton")).not.toThrow();
  });
});

describe("drawTile — throws for unknown kind", () => {
  it("unknown tile kind", () => {
    const { ctx } = spyCtx();
    expect(() => drawTile(ctx, "not_a_tile", 0, 0)).toThrow(/unknown tile kind/);
  });
  it("known tile kind does not throw", () => {
    const { ctx } = spyCtx();
    expect(() => drawTile(ctx, "floor", 0, 0)).not.toThrow();
  });
});

describe("drawObject — throws for unknown type", () => {
  it("unknown object type", () => {
    const { ctx } = spyCtx();
    expect(() => drawObject(ctx, 0, 0, "not_an_object", 0)).toThrow(/unknown type/);
  });
  it("known object type does not throw", () => {
    const { ctx } = spyCtx();
    expect(() => drawObject(ctx, 24, 24, "shrine", 0)).not.toThrow();
  });
});

describe("drawItem — prefix fallbacks and generic", () => {
  it("scroll_ prefix → drawScroll", () => {
    const { ctx } = spyCtx();
    expect(() => drawItem(ctx, 24, 24, "scroll_fire", 0)).not.toThrow();
  });
  it("_elixir suffix → drawElixir", () => {
    const { ctx } = spyCtx();
    expect(() => drawItem(ctx, 24, 24, "fury_elixir", 0)).not.toThrow();
  });
  it("totally unknown → drawGenericItem (no throw)", () => {
    const { ctx } = spyCtx();
    expect(() => drawItem(ctx, 24, 24, "???", 0)).not.toThrow();
  });
});

// ── Visual catalog cross-checks ───────────────────────────────────────────────

describe("MONSTER_VISUALS — every renderer key exists in MONSTER_RENDERERS", () => {
  for (const [key, spec] of Object.entries(MONSTER_VISUALS)) {
    it(key, () => {
      expect(MONSTER_RENDERERS[spec.renderer]).toBeDefined();
    });
  }
});

describe("TILE_VISUALS — every renderer key exists in TILE_RENDERERS", () => {
  for (const [key, spec] of Object.entries(TILE_VISUALS)) {
    it(key, () => {
      expect(TILE_RENDERERS[spec.renderer]).toBeDefined();
    });
  }
});

describe("OBJECT_VISUALS — every renderer key exists in OBJECT_RENDERERS", () => {
  for (const [key, spec] of Object.entries(OBJECT_VISUALS)) {
    it(key, () => {
      expect(OBJECT_RENDERERS[spec.renderer]).toBeDefined();
    });
  }
});

describe("ITEM_VISUALS — every renderer key exists in ITEM_RENDERERS", () => {
  for (const [key, spec] of Object.entries(ITEM_VISUALS)) {
    it(key, () => {
      expect(ITEM_RENDERERS[spec.renderer]).toBeDefined();
    });
  }
});

describe("MONSTER_RENDERERS — no orphans (every key has a MONSTER_VISUALS entry)", () => {
  for (const key of Object.keys(MONSTER_RENDERERS)) {
    it(key, () => {
      expect(MONSTER_VISUALS[key]).toBeDefined();
    });
  }
});
