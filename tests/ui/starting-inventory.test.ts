// §4: new-run hero state has exactly two equipped items, no bag, three empty equip slots.

import { describe, it, expect } from "vitest";
import { demoSetup } from "../../src/demo.js";
import { SLOTS } from "../../src/content/items.js";

describe("starting inventory (Phase 13.7)", () => {
  it("hero has wooden_staff in staff slot", () => {
    const { actors } = demoSetup();
    const hero = actors.find(a => a.isHero)!;
    expect(hero.inventory?.equipped.staff?.defId).toBe("wooden_staff");
  });

  it("hero has bone_dagger in dagger slot", () => {
    const { actors } = demoSetup();
    const hero = actors.find(a => a.isHero)!;
    expect(hero.inventory?.equipped.dagger?.defId).toBe("bone_dagger");
  });

  it("hero has exactly two equipped items", () => {
    const { actors } = demoSetup();
    const hero = actors.find(a => a.isHero)!;
    const filled = SLOTS.filter(s => hero.inventory?.equipped[s] !== null);
    expect(filled.length).toBe(2);
  });

  it("hat, robe, focus slots are empty", () => {
    const { actors } = demoSetup();
    const hero = actors.find(a => a.isHero)!;
    expect(hero.inventory?.equipped.hat).toBeNull();
    expect(hero.inventory?.equipped.robe).toBeNull();
    expect(hero.inventory?.equipped.focus).toBeNull();
  });

  it("bag is empty", () => {
    const { actors } = demoSetup();
    const hero = actors.find(a => a.isHero)!;
    expect(hero.inventory?.consumables).toHaveLength(0);
  });

  it("knownGear lists the starter equipment defIds", () => {
    const { actors } = demoSetup();
    const hero = actors.find(a => a.isHero)!;
    expect(hero.knownGear).toEqual(expect.arrayContaining(["wooden_staff", "bone_dagger"]));
  });
});
