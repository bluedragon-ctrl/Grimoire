import { describe, it, expect } from "vitest";
import {
  equipItem, unequipItem, mintInstance, ensureInventory, getEquipmentBonuses,
} from "../../src/items/execute.js";
import { effectiveStats } from "../../src/effects.js";
import { mkWorld, mkHero } from "../helpers.js";

describe("equip / unequip", () => {
  it("equipItem moves bag→slot, emits ItemEquipped", () => {
    const h = mkHero();
    const inst = mintInstance("wizard_hat");
    ensureInventory(h).consumables.push(inst);
    const events = equipItem(mkWorld([h]), h, inst);
    expect(h.inventory!.equipped.hat?.id).toBe(inst.id);
    expect(h.inventory!.consumables.length).toBe(0);
    expect(events.some(e => e.type === "ItemEquipped")).toBe(true);
  });

  it("slot conflict: equipping into a full slot swaps", () => {
    const h = mkHero();
    const a = mintInstance("cloth_cap");
    const b = mintInstance("wizard_hat");
    ensureInventory(h).consumables.push(a, b);
    equipItem(mkWorld([h]), h, a);
    const events = equipItem(mkWorld([h]), h, b);
    expect(h.inventory!.equipped.hat?.id).toBe(b.id);
    expect(h.inventory!.consumables.map(i => i.id)).toContain(a.id);
    expect(events.some(e => e.type === "ItemUnequipped")).toBe(true);
    expect(events.some(e => e.type === "ItemEquipped")).toBe(true);
  });

  it("unequipItem returns item to bag", () => {
    const h = mkHero();
    const inst = mintInstance("wizard_hat");
    ensureInventory(h).consumables.push(inst);
    equipItem(mkWorld([h]), h, inst);
    const events = unequipItem(mkWorld([h]), h, "hat");
    expect(h.inventory!.equipped.hat).toBeNull();
    expect(h.inventory!.consumables[0]?.id).toBe(inst.id);
    expect(events.some(e => e.type === "ItemUnequipped")).toBe(true);
  });

  it("merge aggregation: monotone-max, not sum", () => {
    // silk_robe: int +2. fire_staff: int +3. Expect int bonus = 3, not 5.
    const h = mkHero();
    const robe = mintInstance("silk_robe");
    const staff = mintInstance("fire_staff");
    ensureInventory(h).consumables.push(robe, staff);
    equipItem(mkWorld([h]), h, robe);
    equipItem(mkWorld([h]), h, staff);
    const bonuses = getEquipmentBonuses(h);
    expect(bonuses.int).toBe(3); // max(2,3) — not 5
    const eff = effectiveStats(h);
    expect(eff.int).toBe(3); // base 0 + bonus 3
    expect(eff.atk).toBe(3 + 2); // base + fire_staff atk
  });

  it("effectiveStats includes maxHp/maxMp merges", () => {
    const h = mkHero();
    const hat = mintInstance("wizard_hat");
    ensureInventory(h).consumables.push(hat);
    equipItem(mkWorld([h]), h, hat);
    const eff = effectiveStats(h);
    expect(eff.int).toBe(2);
    expect(eff.maxMp).toBe(20 + 5);
  });

  it("unequip from empty slot → ActionFailed", () => {
    const h = mkHero();
    const events = unequipItem(mkWorld([h]), h, "hat");
    expect((events[0] as any).type).toBe("ActionFailed");
  });
});
