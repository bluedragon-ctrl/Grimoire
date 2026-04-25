import { describe, it, expect } from "vitest";
import { doAttack } from "../../src/commands.js";
import { equipItem, mintInstance, ensureInventory } from "../../src/items/execute.js";
import { mkWorld, mkHero, mkGoblin } from "../helpers.js";

describe("onHitHook", () => {
  it("venom_dagger on_hit inflicts poison after attack", () => {
    const h = mkHero();
    const g = mkGoblin();
    const dagger = mintInstance("venom_dagger");
    ensureInventory(h).consumables.push(dagger);
    equipItem(mkWorld([h, g]), h, dagger);
    const w = mkWorld([h, g]);
    const events = doAttack(w, h, g);
    expect(events.some(e => e.type === "Hit")).toBe(true);
    expect(events.some(e => e.type === "OnHitTriggered")).toBe(true);
    expect(g.effects!.some(e => e.kind === "poison")).toBe(true);
  });

  it("fire_staff on_hit inflicts burning", () => {
    const h = mkHero();
    const g = mkGoblin();
    const staff = mintInstance("fire_staff");
    ensureInventory(h).consumables.push(staff);
    equipItem(mkWorld([h, g]), h, staff);
    const w = mkWorld([h, g]);
    const events = doAttack(w, h, g);
    expect(events.some(e => e.type === "OnHitTriggered")).toBe(true);
    expect(g.effects!.some(e => e.kind === "burning")).toBe(true);
  });

  it("no equipment → no on-hit proc", () => {
    const h = mkHero();
    const g = mkGoblin();
    const events = doAttack(mkWorld([h, g]), h, g);
    expect(events.some(e => e.type === "OnHitTriggered")).toBe(false);
  });

  it("bone_dagger (no on_hit) → no proc emitted", () => {
    const h = mkHero();
    const g = mkGoblin();
    const dagger = mintInstance("bone_dagger");
    ensureInventory(h).consumables.push(dagger);
    equipItem(mkWorld([h, g]), h, dagger);
    const events = doAttack(mkWorld([h, g]), h, g);
    expect(events.some(e => e.type === "OnHitTriggered")).toBe(false);
  });

  it("on-hit skipped when defender dies from the strike", () => {
    const h = mkHero();
    const g = mkGoblin({ hp: 1, def: 0 });
    const dagger = mintInstance("venom_dagger");
    ensureInventory(h).consumables.push(dagger);
    equipItem(mkWorld([h, g]), h, dagger);
    const events = doAttack(mkWorld([h, g]), h, g);
    expect(events.some(e => e.type === "Died")).toBe(true);
    expect(events.some(e => e.type === "OnHitTriggered")).toBe(false);
  });
});
