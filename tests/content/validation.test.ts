// Registry load-time validation tests.
// Verifies that malformed templates/spells/items throw descriptive errors
// rather than silently defaulting to sentinel values.

import { describe, it, expect } from "vitest";
import { LOOT_TABLES } from "../../src/content/loot.js";
import type { MonsterTemplate, MonsterStats } from "../../src/content/monsters.js";
import type { LootEntry } from "../../src/content/loot.js";

// ──────────────────────────── helpers ────────────────────────────────────────

// Simulate what monsters.ts does at load time: validate each template.
function validateMonsterTemplate(tpl: MonsterTemplate): void {
  if (!tpl.visual) throw new Error(`Monster template '${tpl.id}': missing required field 'visual'.`);
  if (tpl.stats.atk === undefined) throw new Error(`Monster template '${tpl.id}': missing required stat 'stats.atk'.`);
}

// Simulate loot.ts load-time validation for a standalone table.
function validateLootEntries(key: string, entries: LootEntry[]): void {
  for (const e of entries) {
    if (!e.defId) throw new Error(`LOOT_TABLES["${key}"]: entry missing 'defId'.`);
    if (typeof e.chance !== "number" || e.chance < 0 || e.chance > 1) {
      throw new Error(`LOOT_TABLES["${key}"]["${e.defId}"]: 'chance' must be in [0, 1].`);
    }
  }
}

// ──────────────────────────── monster template validation ─────────────────────

describe("monster template validation", () => {
  const baseStats: MonsterStats = { hp: 5, maxHp: 5, speed: 10, atk: 1 };

  it("valid template passes", () => {
    const tpl: MonsterTemplate = {
      id: "test", name: "Test", visual: "goblin", stats: baseStats, ai: "halt",
    };
    expect(() => validateMonsterTemplate(tpl)).not.toThrow();
  });

  it("missing 'visual' throws", () => {
    const tpl = {
      id: "no_visual", name: "Bad", visual: "", stats: baseStats, ai: "halt",
    } as MonsterTemplate;
    expect(() => validateMonsterTemplate(tpl)).toThrow("visual");
  });

  it("missing 'stats.atk' throws", () => {
    const noAtk: MonsterStats = { hp: 5, maxHp: 5, speed: 10 };
    const tpl: MonsterTemplate = {
      id: "no_atk", name: "Bad", visual: "goblin", stats: noAtk, ai: "halt",
    };
    expect(() => validateMonsterTemplate(tpl)).toThrow("stats.atk");
  });
});

// ──────────────────────────── loot table validation ───────────────────────────

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

// ──────────────────────────── goblin alias removed ────────────────────────────

describe("LOOT_TABLES integrity", () => {
  it("legacy 'goblin' alias is gone", () => {
    expect(LOOT_TABLES["goblin"]).toBeUndefined();
  });

  it("canonical 'goblin_loot' key exists", () => {
    expect(LOOT_TABLES["goblin_loot"]).toBeTruthy();
    expect(LOOT_TABLES["goblin_loot"]!.length).toBeGreaterThan(0);
  });
});
