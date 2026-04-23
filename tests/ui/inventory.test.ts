// Inventory prep panel — DOM smoke tests. Exercises rendering, slot clicks
// that open the picker, and picker selections that mutate the actor's
// inventory in place.
//
// Runs under happy-dom (provides a minimal document with canvas stubs).

import { describe, it, expect, beforeEach } from "vitest";
import { mountInventoryPanel } from "../../src/ui/inventory.js";
import { emptyEquipped } from "../../src/content/items.js";
import type { Actor } from "../../src/types.js";

function makeHero(): Actor {
  return {
    id: "hero", kind: "hero", hp: 20, maxHp: 20, speed: 1, energy: 0,
    pos: { x: 0, y: 0 }, script: { main: [], handlers: [], funcs: [] }, alive: true,
    inventory: {
      consumables: [],
      equipped: { ...emptyEquipped(), staff: { id: "ws1", defId: "wooden_staff" } },
    },
  };
}

describe("mountInventoryPanel", () => {
  let container: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = "";
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  it("renders 5 equipment slots and 4 bag slots", () => {
    const hero = makeHero();
    mountInventoryPanel(container, () => hero);
    // Two rows of .inv-cell: equipment (5) + bag (4).
    const cells = container.querySelectorAll(".inv-cell");
    expect(cells.length).toBe(9);
  });

  it("clicking an empty equip slot opens a picker with wearables for that slot", () => {
    const hero = makeHero();
    mountInventoryPanel(container, () => hero);
    const cells = Array.from(container.querySelectorAll<HTMLButtonElement>(".inv-cell"));
    // First equipment cell is 'hat' (SLOTS order).
    cells[0]!.click();

    const picker = document.querySelector(".inv-picker");
    expect(picker).not.toBeNull();
    const rows = picker!.querySelectorAll(".inv-picker-row");
    // 1 empty + 2 hats (cloth_cap, wizard_hat).
    expect(rows.length).toBe(3);
    expect(Array.from(rows).map(r => r.textContent)).toContain("Wizard Hat");
  });

  it("selecting a wearable from the picker mutates actor.inventory.equipped", () => {
    const hero = makeHero();
    mountInventoryPanel(container, () => hero);
    const firstEquip = container.querySelector<HTMLButtonElement>(".inv-cell")!;
    firstEquip.click();

    const rows = document.querySelectorAll<HTMLButtonElement>(".inv-picker-row");
    const wizardRow = Array.from(rows).find(r => r.textContent === "Wizard Hat")!;
    wizardRow.click();

    expect(hero.inventory!.equipped.hat?.defId).toBe("wizard_hat");
    // Picker closes after selection.
    expect(document.querySelector(".inv-picker")).toBeNull();
  });

  it("setEditable(false) disables all cells", () => {
    const hero = makeHero();
    const ctl = mountInventoryPanel(container, () => hero);
    ctl.setEditable(false);
    const cells = Array.from(container.querySelectorAll<HTMLButtonElement>(".inv-cell"));
    for (const c of cells) expect(c.disabled).toBe(true);
  });

  it("bag slot picker lists consumables only", () => {
    const hero = makeHero();
    mountInventoryPanel(container, () => hero);
    const cells = Array.from(container.querySelectorAll<HTMLButtonElement>(".inv-cell"));
    // Bag slots come after the 5 equipment slots.
    cells[5]!.click();

    const rows = document.querySelectorAll<HTMLButtonElement>(".inv-picker-row");
    const labels = Array.from(rows).map(r => r.textContent);
    expect(labels).toContain("Health Potion");
    // No wearables.
    expect(labels).not.toContain("Wooden Staff");
  });
});
