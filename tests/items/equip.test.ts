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

  it("bonus aggregation: additive across slots", () => {
    // leather_robe: {def:2, maxHp:5}, iron_helm: {def:3, maxHp:10}
    // Additive: def=5, maxHp=15 (not max(2,3)=3)
    const h = mkHero();
    const robe = mintInstance("leather_robe");
    const helm = mintInstance("iron_helm");
    ensureInventory(h).consumables.push(robe, helm);
    equipItem(mkWorld([h]), h, robe);
    equipItem(mkWorld([h]), h, helm);
    const bonuses = getEquipmentBonuses(h);
    expect(bonuses.def).toBe(5);    // 2 + 3 additive
    expect(bonuses.maxHp).toBe(15); // 5 + 10 additive
    const eff = effectiveStats(h);
    expect(eff.def).toBe(5);
    expect(eff.maxHp).toBe(35);    // base 20 + 15
  });

  it("effectiveStats includes int and maxMp from wearables", () => {
    const h = mkHero();
    // wizard_hat: {int:4}
    const hat = mintInstance("wizard_hat");
    ensureInventory(h).consumables.push(hat);
    equipItem(mkWorld([h]), h, hat);
    const eff = effectiveStats(h);
    expect(eff.int).toBe(4);
    // runed_focus: {int:5, maxMp:8}
    const focus = mintInstance("runed_focus");
    ensureInventory(h).consumables.push(focus);
    equipItem(mkWorld([h]), h, focus);
    const eff2 = effectiveStats(h);
    expect(eff2.int).toBe(9);       // 4 + 5
    expect(eff2.maxMp).toBe(28);    // base 20 + 8
  });

  it("unequip from empty slot → ActionFailed", () => {
    const h = mkHero();
    const events = unequipItem(mkWorld([h]), h, "hat");
    expect((events[0] as any).type).toBe("ActionFailed");
  });
});
