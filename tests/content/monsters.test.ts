import { describe, it, expect } from "vitest";
import { MONSTER_TEMPLATES, scriptFor, createActor } from "../../src/content/monsters.js";
import { LOOT_TABLES } from "../../src/content/loot.js";

describe("MONSTER_TEMPLATES registry", () => {
  it("ships the five Phase 11 starter templates", () => {
    for (const id of ["goblin", "skeleton", "bat", "cultist", "slime"]) {
      expect(MONSTER_TEMPLATES[id], `missing template: ${id}`).toBeTruthy();
    }
  });

  it("every template has a parsed AI script cached", () => {
    for (const id of Object.keys(MONSTER_TEMPLATES)) {
      const s = scriptFor(id);
      expect(s, `no cached script for ${id}`).toBeTruthy();
      expect(Array.isArray(s!.main)).toBe(true);
      expect(Array.isArray(s!.handlers)).toBe(true);
    }
  });

  it("every declared loot key resolves in LOOT_TABLES", () => {
    for (const tpl of Object.values(MONSTER_TEMPLATES)) {
      if (!tpl.loot) continue;
      expect(
        LOOT_TABLES[tpl.loot],
        `loot key '${tpl.loot}' (from ${tpl.id}) is unregistered`,
      ).toBeTruthy();
    }
  });

  it("bat has no loot (hit-and-run, no drop)", () => {
    expect(MONSTER_TEMPLATES.bat!.loot).toBeUndefined();
  });

  it("registry is frozen", () => {
    expect(Object.isFrozen(MONSTER_TEMPLATES)).toBe(true);
  });
});

describe("createActor", () => {
  it("produces a non-hero Actor with template stats + script + visual", () => {
    // Phase 14: goblin is now T2 (level 3); hp/atk scale by 1 + 0.15*(level-1).
    const tpl = MONSTER_TEMPLATES.goblin!;
    const a = createActor("goblin", { x: 2, y: 3 }, "g1");
    expect(a.id).toBe("g1");
    expect(a.kind).toBe("goblin");
    expect(a.isHero).toBe(false);
    expect(a.pos).toEqual({ x: 2, y: 3 });
    expect(a.hp).toBe(Math.floor(tpl.stats.hp * (1 + 0.15 * (tpl.level - 1))));
    expect(a.maxHp).toBe(a.hp);
    expect(a.atk).toBe(Math.floor(tpl.stats.atk! * (1 + 0.15 * (tpl.level - 1))));
    expect(a.script).toBe(scriptFor("goblin"));
    expect(a.lootTable).toBe("goblin_loot");
  });

  it("copies knownSpells for casters", () => {
    const c = createActor("cultist", { x: 0, y: 0 }, "c1");
    // Phase 14: cultist now casts firebolt (was bolt).
    expect(c.knownSpells).toEqual(["firebolt"]);
    expect(c.mp).toBeGreaterThan(0);
    expect(c.maxMp).toBe(c.mp);
  });

  it("omits lootTable for templates without one", () => {
    const b = createActor("bat", { x: 0, y: 0 }, "b1");
    expect(b.lootTable).toBeUndefined();
  });

  it("throws on unknown template id", () => {
    expect(() => createActor("not_a_real_monster", { x: 0, y: 0 }, "x1")).toThrow(/Unknown/);
  });

  it("clones pos so mutating the input doesn't affect the actor", () => {
    const pos = { x: 4, y: 4 };
    const a = createActor("slime", pos, "s1");
    pos.x = 99;
    expect(a.pos.x).toBe(4);
  });
});
