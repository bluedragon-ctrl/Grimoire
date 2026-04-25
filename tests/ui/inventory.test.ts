// Inventory panel — DOM smoke tests. Equipment slots are interactive in prep
// phase; clicking opens a picker over the hero's knownGear filtered by slot.
// The bag stays inspect-only.
//
// Runs under happy-dom (provides a minimal document with canvas stubs).

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mountInventoryPanel } from "../../src/ui/inventory.js";
import { emptyEquipped } from "../../src/content/items.js";
import type { Actor } from "../../src/types.js";

function makeHero(): Actor {
  return {
    id: "hero", kind: "hero", hp: 20, maxHp: 20, speed: 1, energy: 0,
    pos: { x: 0, y: 0 }, script: { main: [], handlers: [], funcs: [] }, alive: true,
    knownGear: ["wooden_staff", "fire_staff", "leather_robe"],
    inventory: {
      consumables: [{ id: "hp1", defId: "health_potion" }],
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
  afterEach(() => {
    document.querySelectorAll(".inv-picker").forEach(p => p.remove());
  });

  it("renders 5 equipment slots and 4 bag slots", () => {
    const hero = makeHero();
    mountInventoryPanel(container, () => hero);
    const cells = container.querySelectorAll(".inv-cell");
    expect(cells.length).toBe(9);
  });

  it("equipment slots are buttons; bag slots are divs (inspect-only)", () => {
    const hero = makeHero();
    mountInventoryPanel(container, () => hero);
    const cells = Array.from(container.querySelectorAll(".inv-cell"));
    const equip = cells.slice(0, 5);
    const bag   = cells.slice(5);
    for (const c of equip) expect(c.tagName.toLowerCase()).toBe("button");
    for (const c of bag)   expect(c.tagName.toLowerCase()).toBe("div");
  });

  it("shows equipped item names in their slot caption", () => {
    const hero = makeHero();
    mountInventoryPanel(container, () => hero);
    const captions = Array.from(container.querySelectorAll(".inv-cap")).map(c => c.textContent);
    expect(captions).toContain("Wooden Staff");
    expect(captions).toContain("Health Potion");
  });

  it("clicking a staff slot opens a picker with its knownGear options + (empty)", () => {
    const hero = makeHero();
    mountInventoryPanel(container, () => hero);
    // Find the staff cell by caption.
    const staffCell = Array.from(container.querySelectorAll(".inv-cell"))
      .find(c => c.querySelector(".inv-cap")?.textContent === "Wooden Staff") as HTMLElement;
    staffCell.click();
    const picker = document.querySelector(".inv-picker");
    expect(picker).not.toBeNull();
    const labels = Array.from(picker!.querySelectorAll(".inv-picker-row")).map(r => r.textContent);
    expect(labels).toContain("— (empty) —");
    expect(labels).toContain("Wooden Staff");
    expect(labels).toContain("Fire Staff");
    // robe-slot gear is excluded
    expect(labels).not.toContain("Leather Robe");
  });

  it("selecting a different option swaps equipped instance and refreshes", () => {
    const hero = makeHero();
    const ctl = mountInventoryPanel(container, () => hero);
    const staffCell = Array.from(container.querySelectorAll(".inv-cell"))
      .find(c => c.querySelector(".inv-cap")?.textContent === "Wooden Staff") as HTMLElement;
    staffCell.click();
    const fireRow = Array.from(document.querySelectorAll(".inv-picker-row"))
      .find(r => r.textContent === "Fire Staff") as HTMLElement;
    fireRow.click();
    expect(hero.inventory!.equipped.staff?.defId).toBe("fire_staff");
    expect(document.querySelector(".inv-picker")).toBeNull();
    void ctl;
  });

  it("selecting (empty) clears the slot", () => {
    const hero = makeHero();
    mountInventoryPanel(container, () => hero);
    const staffCell = Array.from(container.querySelectorAll(".inv-cell"))
      .find(c => c.querySelector(".inv-cap")?.textContent === "Wooden Staff") as HTMLElement;
    staffCell.click();
    const emptyRow = Array.from(document.querySelectorAll(".inv-picker-row"))
      .find(r => r.textContent === "— (empty) —") as HTMLElement;
    emptyRow.click();
    expect(hero.inventory!.equipped.staff).toBeNull();
  });

  it("setEditable(false) re-renders cells as non-interactive divs", () => {
    const hero = makeHero();
    const ctl = mountInventoryPanel(container, () => hero);
    ctl.setEditable(false);
    const cells = Array.from(container.querySelectorAll(".inv-cell")).slice(0, 5);
    for (const c of cells) expect(c.tagName.toLowerCase()).toBe("div");
    (cells[0] as HTMLElement).click();
    expect(document.querySelector(".inv-picker")).toBeNull();
  });
});
