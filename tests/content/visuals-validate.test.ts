// Tests for src/content/visuals-validate.ts.
// Each test constructs a deliberately-broken registry fragment and asserts that
// validateVisuals() throws a descriptive error containing the offending key.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { EffectKind } from "../../src/types.js";

// ── helpers ───────────────────────────────────────────────────────────────────

// Re-import validateVisuals fresh each time by resetting the module cache.
// We use vi.doMock to override specific sub-modules so the function sees our
// tampered registries without touching the real content files.

// A minimal set of known renderer keys that all real templates resolve to.
const KNOWN_RENDERERS = new Set(["skeleton", "bat", "slime", "dark_wizard"]);

// ── spell visual validation ───────────────────────────────────────────────────

describe("validateVisuals — spell ops", () => {
  it("passes with all well-formed spells", async () => {
    const { validateVisuals } = await import("../../src/content/visuals-validate.js");
    expect(() => validateVisuals(KNOWN_RENDERERS)).not.toThrow();
  });

  it("throws when a project op names an unknown preset", async () => {
    vi.resetModules();
    vi.doMock("../../src/content/spells.js", () => ({
      SPELLS: {
        bad_spell: {
          name: "bad", description: "", targetType: "enemy", range: 5, mpCost: 1,
          body: [{ op: "project", args: { damage: 1, visual: "nonexistent_preset", element: "fire" } }],
        },
      },
    }));
    const { validateVisuals } = await import("../../src/content/visuals-validate.js");
    expect(() => validateVisuals(KNOWN_RENDERERS)).toThrow("bad_spell");
    expect(() => validateVisuals(KNOWN_RENDERERS)).toThrow("nonexistent_preset");
  });

  it("throws when a project op has neither visual nor element", async () => {
    vi.resetModules();
    vi.doMock("../../src/content/spells.js", () => ({
      SPELLS: {
        bare_project: {
          name: "bare", description: "", targetType: "enemy", range: 5, mpCost: 1,
          body: [{ op: "project", args: { damage: 1 } }],
        },
      },
    }));
    const { validateVisuals } = await import("../../src/content/visuals-validate.js");
    expect(() => validateVisuals(KNOWN_RENDERERS)).toThrow("bare_project");
    expect(() => validateVisuals(KNOWN_RENDERERS)).toThrow("visual");
  });

  it("throws when a spawn_cloud op has no visual", async () => {
    vi.resetModules();
    vi.doMock("../../src/content/spells.js", () => ({
      SPELLS: {
        cloudless: {
          name: "cloudless", description: "", targetType: "tile", range: 4, mpCost: 5,
          body: [{ op: "spawn_cloud", args: { kind: "fire", duration: 30 } }],
        },
      },
    }));
    const { validateVisuals } = await import("../../src/content/visuals-validate.js");
    expect(() => validateVisuals(KNOWN_RENDERERS)).toThrow("cloudless");
    expect(() => validateVisuals(KNOWN_RENDERERS)).toThrow("spawn_cloud");
  });

  it("throws when a spawn_cloud op names an unknown cloud preset", async () => {
    vi.resetModules();
    vi.doMock("../../src/content/spells.js", () => ({
      SPELLS: {
        bad_cloud: {
          name: "bad_cloud", description: "", targetType: "tile", range: 4, mpCost: 5,
          body: [{ op: "spawn_cloud", args: { kind: "fire", duration: 30, visual: "cloud_lava" } }],
        },
      },
    }));
    const { validateVisuals } = await import("../../src/content/visuals-validate.js");
    expect(() => validateVisuals(KNOWN_RENDERERS)).toThrow("bad_cloud");
    expect(() => validateVisuals(KNOWN_RENDERERS)).toThrow("cloud_lava");
  });

  it("throws when an explode op has no visual", async () => {
    vi.resetModules();
    vi.doMock("../../src/content/spells.js", () => ({
      SPELLS: {
        bare_explode: {
          name: "bare_explode", description: "", targetType: "tile", range: 3, mpCost: 8,
          body: [{ op: "explode", args: {} }],
        },
      },
    }));
    const { validateVisuals } = await import("../../src/content/visuals-validate.js");
    expect(() => validateVisuals(KNOWN_RENDERERS)).toThrow("bare_explode");
    expect(() => validateVisuals(KNOWN_RENDERERS)).toThrow("explode");
  });

  it("throws when an explode op names an unknown burst preset", async () => {
    vi.resetModules();
    vi.doMock("../../src/content/spells.js", () => ({
      SPELLS: {
        bad_burst: {
          name: "bad_burst", description: "", targetType: "tile", range: 3, mpCost: 8,
          body: [{ op: "explode", args: { visual: "burst_lava" } }],
        },
      },
    }));
    const { validateVisuals } = await import("../../src/content/visuals-validate.js");
    expect(() => validateVisuals(KNOWN_RENDERERS)).toThrow("bad_burst");
    expect(() => validateVisuals(KNOWN_RENDERERS)).toThrow("burst_lava");
  });

  afterEach(() => {
    vi.doUnmock("../../src/content/spells.js");
    vi.resetModules();
  });
});

// ── cloud kind validation ─────────────────────────────────────────────────────

describe("validateVisuals — cloud kinds", () => {
  it("throws when a cloud kind names an unknown preset", async () => {
    vi.resetModules();
    vi.doMock("../../src/content/clouds.js", () => ({
      CLOUD_KINDS: {
        lava: { effect: { kind: "burning", duration: 10 }, visual: "cloud_lava" },
      },
    }));
    const { validateVisuals } = await import("../../src/content/visuals-validate.js");
    expect(() => validateVisuals(KNOWN_RENDERERS)).toThrow("lava");
    expect(() => validateVisuals(KNOWN_RENDERERS)).toThrow("cloud_lava");
  });

  it("throws when a cloud kind has an empty visual string", async () => {
    vi.resetModules();
    vi.doMock("../../src/content/clouds.js", () => ({
      CLOUD_KINDS: {
        empty: { effect: { kind: "slow", duration: 5 }, visual: "" },
      },
    }));
    const { validateVisuals } = await import("../../src/content/visuals-validate.js");
    expect(() => validateVisuals(KNOWN_RENDERERS)).toThrow("empty");
    expect(() => validateVisuals(KNOWN_RENDERERS)).toThrow("visual");
  });

  afterEach(() => {
    vi.doUnmock("../../src/content/clouds.js");
    vi.resetModules();
  });
});

// ── effect overlay validation ─────────────────────────────────────────────────

describe("validateVisuals — effect overlays", () => {
  it("throws when EFFECT_OVERLAY_PRESETS is missing an EffectKind", async () => {
    vi.resetModules();
    vi.doMock("../../src/content/visuals.js", async (importOriginal) => {
      const real = await importOriginal<typeof import("../../src/content/visuals.js")>();
      // Strip 'poison' so its absence is detectable.
      const { poison: _dropped, ...rest } = real.EFFECT_OVERLAY_PRESETS;
      return { ...real, EFFECT_OVERLAY_PRESETS: rest };
    });
    const { validateVisuals } = await import("../../src/content/visuals-validate.js");
    expect(() => validateVisuals(KNOWN_RENDERERS)).toThrow("poison");
  });

  afterEach(() => {
    vi.doUnmock("../../src/content/visuals.js");
    vi.resetModules();
  });
});

// ── monster sprite validation ─────────────────────────────────────────────────

describe("validateVisuals — monster sprites", () => {
  it("passes when all template visuals are in the renderer set", async () => {
    const { validateVisuals } = await import("../../src/content/visuals-validate.js");
    // Real templates use: skeleton, bat, slime, dark_wizard — all in KNOWN_RENDERERS.
    expect(() => validateVisuals(KNOWN_RENDERERS)).not.toThrow();
  });

  it("throws when a template visual is absent from renderer keys", async () => {
    vi.resetModules();
    vi.doMock("../../src/content/monsters.js", async (importOriginal) => {
      const real = await importOriginal<typeof import("../../src/content/monsters.js")>();
      return {
        ...real,
        MONSTER_TEMPLATES: {
          ...real.MONSTER_TEMPLATES,
          ghost_thing: { id: "ghost_thing", name: "Ghost", visual: "ghost", stats: { hp: 3, maxHp: 3, speed: 8, atk: 1 } },
        },
      };
    });
    const { validateVisuals } = await import("../../src/content/visuals-validate.js");
    const noGhost = new Set(["skeleton", "bat", "slime", "dark_wizard"]);
    expect(() => validateVisuals(noGhost)).toThrow("ghost_thing");
    expect(() => validateVisuals(noGhost)).toThrow("ghost");
  });

  afterEach(() => {
    vi.doUnmock("../../src/content/monsters.js");
    vi.resetModules();
  });
});
