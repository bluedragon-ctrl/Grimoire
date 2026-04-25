// Phase 13.7 – Equipment auto-process tests.
// doExit processes foundGear (equipment picked up this run) before HeroExited:
//   • New defId → GearLearned + GearDiscarded(reason:"learned"), merged into knownGear
//   • Already known → GearDiscarded(reason:"duplicate"), no GearLearned
//   • foundGear is cleared
//   • Non-equipment defIds are discarded silently as duplicates

import { describe, it, expect } from "vitest";
import type { Actor, World } from "../../src/types.js";
import { doExit } from "../../src/commands.js";
import { emptyEquipped } from "../../src/content/items.js";
import { script, cHalt } from "../../src/ast-helpers.js";

const S = script(cHalt());

function mkWorld(hero: Actor): World {
  return {
    tick: 0,
    room: {
      w: 10, h: 10,
      doors: [{ dir: "N", pos: { x: 5, y: 0 } }],
      items: [], chests: [], clouds: [],
    },
    actors: [hero], log: [], aborted: false, ended: false,
  };
}

function mkHero(): Actor {
  return {
    id: "h", kind: "hero", isHero: true,
    hp: 20, maxHp: 20, speed: 12, energy: 0, alive: true,
    pos: { x: 5, y: 0 }, mp: 10, maxMp: 10, atk: 3, def: 0, int: 0,
    effects: [], knownSpells: [], faction: "player",
    inventory: { consumables: [], equipped: emptyEquipped() },
    script: S,
  };
}

describe("foundGear processing at room exit", () => {
  it("new defId emits GearLearned + GearDiscarded(learned) and adds to knownGear", () => {
    const hero = mkHero();
    hero.foundGear = ["fire_staff"];
    const w = mkWorld(hero);

    const events = doExit(w, hero);
    expect(events.some(e => e.type === "GearLearned" && (e as any).defId === "fire_staff")).toBe(true);
    expect(events.some(e => e.type === "GearDiscarded" && (e as any).defId === "fire_staff" && (e as any).reason === "learned")).toBe(true);
    expect(hero.knownGear).toContain("fire_staff");
    expect(hero.foundGear).toEqual([]);
  });

  it("already-known defId emits only GearDiscarded(duplicate)", () => {
    const hero = mkHero();
    hero.knownGear = ["fire_staff"];
    hero.foundGear = ["fire_staff"];
    const w = mkWorld(hero);

    const events = doExit(w, hero);
    expect(events.some(e => e.type === "GearLearned")).toBe(false);
    expect(events.some(e => e.type === "GearDiscarded" && (e as any).reason === "duplicate")).toBe(true);
    expect(hero.knownGear).toEqual(["fire_staff"]);
    expect(hero.foundGear).toEqual([]);
  });

  it("multiple gears in one exit are all processed in order", () => {
    const hero = mkHero();
    hero.knownGear = ["wooden_staff"];
    hero.foundGear = ["fire_staff", "wooden_staff", "bone_dagger"];
    const w = mkWorld(hero);

    const events = doExit(w, hero);
    const learnedIds = events.filter(e => e.type === "GearLearned").map(e => (e as any).defId);
    expect(learnedIds).toEqual(["fire_staff", "bone_dagger"]);
    expect(hero.knownGear).toEqual(expect.arrayContaining(["wooden_staff", "fire_staff", "bone_dagger"]));
  });

  it("HeroExited is emitted after gear processing", () => {
    const hero = mkHero();
    hero.foundGear = ["fire_staff"];
    const w = mkWorld(hero);

    const events = doExit(w, hero);
    const lastIdx = events.findIndex(e => e.type === "HeroExited");
    const learnedIdx = events.findIndex(e => e.type === "GearLearned");
    expect(lastIdx).toBeGreaterThan(learnedIdx);
  });
});
