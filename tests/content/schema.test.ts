// Registry load-time validation: monster templates, loot tables, and visual registries.

import { describe, it, expect, vi, afterEach } from "vitest";
import type { EffectKind } from "../../src/types.js";
import { LOOT_TABLES } from "../../src/content/loot.js";
import type { MonsterTemplate, MonsterStats } from "../../src/content/monsters.js";
import type { LootEntry } from "../../src/content/loot.js";

// ── helpers ───────────────────────────────────────────────────────────────────

function validateMonsterTemplate(tpl: MonsterTemplate): void {
  if (!tpl.visual) throw new Error(`Monster template '${tpl.id}': missing required field 'visual'.`);
  if (tpl.stats.atk === undefined) throw new Error(`Monster template '${tpl.id}': missing required stat 'stats.atk'.`);
}

function validateLootEntries(key: string, entries: LootEntry[]): void {
  for (const e of entries) {
    if (!e.defId) throw new Error(`LOOT_TABLES["${key}"]: entry missing 'defId'.`);
    if (typeof e.chance !== "number" || e.chance < 0 || e.chance > 1) {
      throw new Error(`LOOT_TABLES["${key}"]["${e.defId}"]: 'chance' must be in [0, 1].`);
    }
  }
}

// Every visual referenced by a stock MonsterTemplate.
const KNOWN_RENDERERS = new Set([
  "skeleton", "bat", "slime", "dark_wizard", "rat", "giant_snail",
  "mushroom", "spider", "zombie", "skeleton_archer", "orc_warrior",
  "ghost", "wisp", "serpent", "orc_knight", "gargoyle", "wraith",
  "knight", "troll", "mage", "vampire", "golem", "orc_mage",
  "fire_elemental", "water_elemental", "air_elemental",
  "earth_elemental", "crystal_elemental", "lich", "dragon",
]);

// ── monster template validation ───────────────────────────────────────────────

describe("monster template validation", () => {
  const baseStats: MonsterStats = { hp: 5, maxHp: 5, speed: 10, atk: 1 };

  it("valid template passes", () => {
    const tpl: MonsterTemplate = {
      id: "test", name: "Test", visual: "goblin", family: "humanoid", level: 1, stats: baseStats, ai: "halt",
    };
    expect(() => validateMonsterTemplate(tpl)).not.toThrow();
  });

  it("missing 'visual' throws", () => {
    const tpl = {
      id: "no_visual", name: "Bad", visual: "", family: "humanoid", level: 1, stats: baseStats, ai: "halt",
    } as MonsterTemplate;
    expect(() => validateMonsterTemplate(tpl)).toThrow("visual");
  });

  it("missing 'stats.atk' throws", () => {
    const noAtk: MonsterStats = { hp: 5, maxHp: 5, speed: 10 };
    const tpl: MonsterTemplate = {
      id: "no_atk", name: "Bad", visual: "goblin", family: "humanoid", level: 1, stats: noAtk, ai: "halt",
    };
    expect(() => validateMonsterTemplate(tpl)).toThrow("stats.atk");
  });
});

// ── loot table validation ─────────────────────────────────────────────────────

describe("loot table validation", () => {
  it("valid entry passes", () => {
    expect(() => validateLootEntries("test", [{ defId: "health_potion", chance: 0.5 }])).not.toThrow();
  });

  it("missing defId throws", () => {
    expect(() => validateLootEntries("bad_table", [{ defId: "", chance: 0.5 }])).toThrow("defId");
  });

  it("chance out of range throws", () => {
    expect(() => validateLootEntries("bad_table", [{ defId: "x", chance: 1.5 }])).toThrow("chance");
  });

  it("negative chance throws", () => {
    expect(() => validateLootEntries("bad_table", [{ defId: "x", chance: -0.1 }])).toThrow("chance");
  });
});

// ── LOOT_TABLES integrity ─────────────────────────────────────────────────────

describe("LOOT_TABLES integrity", () => {
  it("legacy 'goblin' alias is gone", () => {
    expect(LOOT_TABLES["goblin"]).toBeUndefined();
  });

  it("canonical 'goblin_loot' key exists", () => {
    expect(LOOT_TABLES["goblin_loot"]).toBeTruthy();
    expect(LOOT_TABLES["goblin_loot"]!.length).toBeGreaterThan(0);
  });
});

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
    expect(() => validateVisuals(KNOWN_RENDERERS)).not.toThrow();
  });

  it("throws when a template visual is absent from renderer keys", async () => {
    vi.resetModules();
    vi.doMock("../../src/content/monsters.js", async (importOriginal) => {
      const real = await importOriginal<typeof import("../../src/content/monsters.js")>();
      // Only ghost_thing should fail validation: drop the real `ghost`
      // template so it's not what gets reported first.
      const { ghost: _drop, ...rest } = real.MONSTER_TEMPLATES;
      return {
        ...real,
        MONSTER_TEMPLATES: {
          ...rest,
          ghost_thing: { id: "ghost_thing", name: "Ghost", visual: "ghost", stats: { hp: 3, maxHp: 3, speed: 8, atk: 1 } },
        },
      };
    });
    const { validateVisuals } = await import("../../src/content/visuals-validate.js");
    // Phase 14: every real template's visual is present except `ghost`,
    // so the only template that should fail is the injected `ghost_thing`.
    const noGhost = new Set(KNOWN_RENDERERS);
    noGhost.delete("ghost");
    expect(() => validateVisuals(noGhost)).toThrow("ghost_thing");
    expect(() => validateVisuals(noGhost)).toThrow("ghost");
  });

  afterEach(() => {
    vi.doUnmock("../../src/content/monsters.js");
    vi.resetModules();
  });
});
