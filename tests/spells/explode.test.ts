import { describe, it, expect } from "vitest";
import type { Actor } from "../../src/types.js";
import { PRIMITIVES } from "../../src/spells/primitives.js";
import { castSpell } from "../../src/spells/cast.js";
import { hasEffect } from "../../src/effects.js";
import { scaleRadius } from "../../src/content/scaling.js";
import { mkWorld, mkActor } from "../helpers.js";

// ── scaleRadius unit tests ────────────────────────────────────────────────────

describe("scaleRadius", () => {
  it("int=0 returns base unchanged", () => {
    expect(scaleRadius(2, 0)).toBe(2);
  });
  it("int=8 adds 1", () => {
    expect(scaleRadius(2, 8)).toBe(3);
  });
  it("int=16 adds 2", () => {
    expect(scaleRadius(2, 16)).toBe(4);
  });
  it("int=24 adds 3", () => {
    expect(scaleRadius(2, 24)).toBe(5);
  });
});

// ── explode primitive ─────────────────────────────────────────────────────────

describe("explode primitive", () => {
  it("radius 0 hits only the target tile", () => {
    const caster = mkActor({ id: "c", kind: "hero", pos: { x: 0, y: 0 }, int: 0 });
    const onTarget = mkActor({ id: "t1", kind: "goblin", pos: { x: 3, y: 3 }, hp: 20, maxHp: 20 });
    const adjacent = mkActor({ id: "t2", kind: "goblin", pos: { x: 4, y: 3 }, hp: 20, maxHp: 20 });
    const w = mkWorld([caster, onTarget, adjacent]);

    PRIMITIVES.explode.execute(w, caster, { x: 3, y: 3 }, { radius: 0, damage: 5 });

    expect(onTarget.hp).toBe(15);  // hit
    expect(adjacent.hp).toBe(20);  // not hit — outside radius 0
  });

  it("radius 1 hits tiles within Chebyshev 1 (3×3 square)", () => {
    const caster = mkActor({ id: "c", kind: "hero", pos: { x: 0, y: 0 }, int: 0 });
    const diag = mkActor({ id: "d", kind: "goblin", pos: { x: 4, y: 4 }, hp: 20, maxHp: 20 });
    const far  = mkActor({ id: "f", kind: "goblin", pos: { x: 5, y: 3 }, hp: 20, maxHp: 20 });
    const w = mkWorld([caster, diag, far]);

    PRIMITIVES.explode.execute(w, caster, { x: 3, y: 3 }, { radius: 1, damage: 5 });

    expect(diag.hp).toBe(15);
    expect(far.hp).toBe(20);
  });

  it("radius scales correctly with int — victim 2 tiles away is hit", () => {
    const caster = mkActor({ id: "c", kind: "hero", pos: { x: 0, y: 0 }, int: 8 });
    const victim = mkActor({ id: "v", kind: "goblin", pos: { x: 5, y: 3 }, hp: 20, maxHp: 20 });
    const w = mkWorld([caster, victim]);

    PRIMITIVES.explode.execute(w, caster, { x: 3, y: 3 }, { radius: 1, damage: 5 });

    expect(victim.hp).toBeLessThan(20);
  });

  it("selfCenter=true excludes the caster", () => {
    const caster = mkActor({ id: "c", kind: "hero", pos: { x: 3, y: 3 }, int: 0 });
    const enemy  = mkActor({ id: "e", kind: "goblin", pos: { x: 4, y: 3 }, hp: 20, maxHp: 20 });
    const w = mkWorld([caster, enemy]);

    PRIMITIVES.explode.execute(w, caster, { x: 3, y: 3 }, {
      radius: 1, damage: 5, selfCenter: true,
    });

    expect(caster.hp).toBe(20); // never hit self
    expect(enemy.hp).toBe(15);
  });

  it("selfCenter=false (default) allows caster to be hit", () => {
    const caster = mkActor({ id: "c", kind: "hero", pos: { x: 3, y: 3 }, int: 0 });
    const w = mkWorld([caster]);

    PRIMITIVES.explode.execute(w, caster, { x: 3, y: 3 }, { radius: 0, damage: 5 });

    expect(caster.hp).toBe(15); // caster on target tile and not excluded
  });

  it("applies damage and effect to each victim", () => {
    const caster = mkActor({ id: "c", kind: "hero", pos: { x: 0, y: 0 }, int: 0 });
    const v1 = mkActor({ id: "v1", kind: "goblin", pos: { x: 3, y: 3 }, hp: 20, maxHp: 20 });
    const v2 = mkActor({ id: "v2", kind: "goblin", pos: { x: 4, y: 3 }, hp: 20, maxHp: 20 });
    const w = mkWorld([caster, v1, v2]);

    PRIMITIVES.explode.execute(w, caster, { x: 3, y: 3 }, {
      radius: 1, damage: 4, kind: "burning", duration: 10,
    });

    expect(v1.hp).toBe(16);
    expect(v2.hp).toBe(16);
    expect(hasEffect(v1, "burning")).toBe(true);
    expect(hasEffect(v2, "burning")).toBe(true);
  });

  it("does not hit actors at out-of-bounds tiles (wall filter)", () => {
    const caster  = mkActor({ id: "c", kind: "hero",   pos: { x: 1, y: 1 }, int: 0 });
    const inBound = mkActor({ id: "i", kind: "goblin", pos: { x: 4, y: 3 }, hp: 20, maxHp: 20 });
    const outOfBound = mkActor({ id: "o", kind: "goblin", pos: { x: 5, y: 3 }, hp: 20, maxHp: 20 });
    const w = mkWorld([caster, inBound, outOfBound], { w: 5, h: 5 });

    PRIMITIVES.explode.execute(w, caster, { x: 3, y: 3 }, { radius: 2, damage: 5 });

    expect(inBound.hp).toBe(15);   // in bounds — hit
    expect(outOfBound.hp).toBe(20); // out of bounds — skipped
  });

  it("emits VisualBurst at target position", () => {
    const caster = mkActor({ id: "c", kind: "hero", pos: { x: 0, y: 0 }, int: 0 });
    const w = mkWorld([caster]);
    const events = PRIMITIVES.explode.execute(w, caster, { x: 4, y: 4 }, {
      radius: 1, damage: 3, visual: "explosion_fire", element: "fire",
    });
    const burst = events.find(e => e.type === "VisualBurst") as any;
    expect(burst).toBeDefined();
    expect(burst.pos).toEqual({ x: 4, y: 4 });
    expect(burst.visual).toBe("explosion_fire");
    expect(burst.element).toBe("fire");
  });

  it("dead actors are not hit", () => {
    const caster = mkActor({ id: "c", kind: "hero", pos: { x: 0, y: 0 }, int: 0 });
    const dead   = mkActor({ id: "d", kind: "goblin", pos: { x: 1, y: 0 }, hp: 0, maxHp: 20, alive: false });
    const w = mkWorld([caster, dead]);

    PRIMITIVES.explode.execute(w, caster, { x: 0, y: 0 }, { radius: 1, damage: 5 });

    expect(dead.hp).toBe(0); // unchanged
  });
});

// ── fireball placement risk ───────────────────────────────────────────────────

describe("fireball placement risk", () => {
  it("caster takes damage when high-INT fireball radius reaches their tile", () => {
    const caster = mkActor({
      id: "c", kind: "hero", isHero: true,
      pos: { x: 0, y: 0 }, int: 24, // scaleRadius(2,24)=5
      hp: 30, maxHp: 30,
      knownSpells: ["fireball"],
      mp: 30, maxMp: 30,
    });
    const w = mkWorld([caster], { w: 10, h: 10 });

    const events = castSpell(w, caster, "fireball", { x: 4, y: 0 });

    const hit = events.filter(e => e.type === "Hit") as any[];
    const casterHit = hit.find(h => h.actor === "c");
    expect(casterHit).toBeDefined();
    expect(caster.hp).toBeLessThan(30);
  });
});

// ── self-cast AoE never self-damages ─────────────────────────────────────────

describe("frost_nova and thunderclap self-exclusion", () => {
  function hero(int = 0): Actor {
    return mkActor({
      id: "h", kind: "hero", isHero: true,
      pos: { x: 3, y: 3 }, int,
      hp: 20, maxHp: 20, mp: 20, maxMp: 20,
      knownSpells: ["frost_nova", "thunderclap"],
    });
  }
  function enemy(id: string, pos: { x: number; y: number }): Actor {
    return mkActor({ id, kind: "goblin", pos, hp: 20, maxHp: 20 });
  }

  it("frost_nova does not damage the caster", () => {
    const h = hero(0);
    const e = enemy("e", { x: 4, y: 3 });
    const w = mkWorld([h, e]);

    castSpell(w, h, "frost_nova", h);

    expect(h.hp).toBe(20);
    expect(e.hp).toBeLessThan(20);
  });

  it("thunderclap does not damage the caster", () => {
    const h = hero(0);
    const e = enemy("e", { x: 4, y: 3 });
    const w = mkWorld([h, e]);

    castSpell(w, h, "thunderclap", h);

    expect(h.hp).toBe(20);
    expect(e.hp).toBeLessThan(20);
  });

  it("frost_nova still hits enemies even with high int (radius grows)", () => {
    const h = hero(16); // scaleRadius(2,16)=4
    const farEnemy = enemy("f", { x: 7, y: 3 }); // Chebyshev 4 from caster
    const w = mkWorld([h, farEnemy]);

    castSpell(w, h, "frost_nova", h);

    expect(h.hp).toBe(20);
    expect(farEnemy.hp).toBeLessThan(20);
  });
});
