// Inventory panel — prep-phase loadout editor.
//
// Equipment slots are interactive: clicking a slot opens a picker sourced from
// `hero.knownGear` (mirrors `knownSpells`) filtered to that slot. Selecting an
// option swaps the equipped instance; the bag (4 consumables) stays inspect-
// only and is filled by mid-run pickup, not the picker.

import type { Actor, ItemInstance, Slot } from "../types.js";
import { ITEMS, SLOTS, emptyEquipped } from "../content/items.js";

// Phase 15: inventory is uncapped; display all consumables (min 4 visible slots).
const MIN_INVENTORY_SLOTS = 4;
import { ITEM_DRAWS } from "../render/items.js";
import { ITEM_VISUAL_PRESETS, FALLBACK_PRESETS, type ItemShape } from "../content/item-visuals.js";
import { getEquipmentBonuses } from "../items/execute.js";
import { formatItemProcs } from "./proc-format.js";
import type { MergeStat } from "../items/script.js";

const ICON_PX = 40;
const PICKER_ICON_PX = 24;

function ensureInventory(a: Actor): NonNullable<Actor["inventory"]> {
  if (!a.inventory) a.inventory = { consumables: [], equipped: emptyEquipped() };
  return a.inventory;
}

function iconColors(defId: string): { col1?: string; col2?: string; color?: string } {
  const preset = ITEM_VISUAL_PRESETS[defId];
  if (preset) return preset.colors;
  const def = ITEMS[defId];
  const shape = def?.slot
    ? (def.slot as ItemShape)
    : (def?.kind === "consumable" ? ("potion" as ItemShape) : ("scroll" as ItemShape));
  return FALLBACK_PRESETS[shape].colors;
}

function drawItemIcon(canvas: HTMLCanvasElement, defId: string): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const drawKey = pickDrawFn(defId);
  const fn = ITEM_DRAWS[drawKey];
  if (!fn) return;
  // Item draw fns are tuned for an ~ICON_PX-sized cell; scale to fit smaller
  // canvases (e.g., picker rows) so the art doesn't clip at the edges.
  const scale = Math.min(canvas.width, canvas.height) / ICON_PX;
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.scale(scale, scale);
  fn(ctx, 0, 0, 0, iconColors(defId));
  ctx.restore();
}

// ITEM_VISUAL_PRESETS shape names ("potion", "staff", "robe", "hat", "dagger",
// "focus", "crystal", "scroll") map 1:1 to ITEM_DRAWS keys, so we just look up
// the preset's shape (with a sensible fallback per item kind).
function pickDrawFn(defId: string): string {
  const preset = ITEM_VISUAL_PRESETS[defId];
  if (preset) return preset.shape;
  const def = ITEMS[defId];
  if (def?.slot) return def.slot as string;
  if (def?.kind === "consumable") return "potion";
  if (def?.kind === "scroll") return "scroll";
  return "generic";
}

// ── Public ────────────────────────────────────────────────────────────

export interface InventoryController {
  refresh: () => void;
  setEditable: (yes: boolean) => void;
}

/** Phase 15: optional loadout-mode binding. When provided the bag becomes a
 *  fixed-length picker backed by the run's depot. */
export interface LoadoutBinding {
  /** Returns the current 4-slot loadout (null = empty slot). */
  getSelection: () => Array<string | null>;
  /** Returns counts of available depot consumables (excluding scrolls + keys). */
  getDepotCounts: () => Map<string, number>;
  /** Called when the user picks/clears a slot. */
  setSlot: (idx: number, defId: string | null) => void;
}

export function mountInventoryPanel(
  container: HTMLElement,
  getHero: () => Actor | null,
  loadoutBinding?: LoadoutBinding | (() => LoadoutBinding | null),
): InventoryController {
  let editable = true;
  let instSeq = 0;
  const mintInstId = (defId: string) => `eq_${defId}_${++instSeq}`;
  const getLoadout = (): LoadoutBinding | null => {
    if (!loadoutBinding) return null;
    return typeof loadoutBinding === "function" ? loadoutBinding() : loadoutBinding;
  };

  function closePicker(): void {
    document.querySelectorAll(".inv-picker").forEach(p => p.remove());
  }

  function openPicker(anchor: HTMLElement, slot: Slot, hero: Actor): void {
    closePicker();
    const known = (hero.knownGear ?? []).filter(id => {
      const d = ITEMS[id];
      return d && d.kind === "equipment" && d.slot === slot;
    });

    const picker = document.createElement("div");
    picker.className = "inv-picker";
    picker.style.position = "absolute";

    const empty = document.createElement("button");
    empty.className = "inv-picker-row";
    empty.type = "button";
    empty.textContent = "— (empty) —";
    empty.addEventListener("click", () => {
      ensureInventory(hero).equipped[slot] = null;
      closePicker();
      render();
    });
    picker.appendChild(empty);

    for (const defId of known) {
      const def = ITEMS[defId]!;
      const row = document.createElement("button");
      row.className = "inv-picker-row";
      row.type = "button";
      const icon = document.createElement("canvas");
      icon.width = PICKER_ICON_PX;
      icon.height = PICKER_ICON_PX;
      icon.className = "inv-picker-icon";
      drawItemIcon(icon, defId);
      row.appendChild(icon);
      const label = document.createElement("span");
      label.textContent = def.name;
      row.appendChild(label);
      row.addEventListener("click", () => {
        const inv = ensureInventory(hero);
        const current = inv.equipped[slot];
        if (current?.defId === defId) {
          closePicker();
          return;
        }
        const inst: ItemInstance = { id: mintInstId(defId), defId };
        inv.equipped[slot] = inst;
        closePicker();
        render();
      });
      picker.appendChild(row);
    }

    document.body.appendChild(picker);
    const r = anchor.getBoundingClientRect();
    picker.style.left = `${r.left + window.scrollX}px`;
    picker.style.top  = `${r.bottom + window.scrollY + 4}px`;

    const onDocClick = (ev: MouseEvent) => {
      if (!picker.contains(ev.target as Node) && ev.target !== anchor) {
        closePicker();
        document.removeEventListener("click", onDocClick, true);
      }
    };
    setTimeout(() => document.addEventListener("click", onDocClick, true), 0);
  }

  function render(): void {
    closePicker();
    container.innerHTML = "";
    const hero = getHero();
    if (!hero) {
      const empty = document.createElement("div");
      empty.className = "inventory-empty";
      empty.textContent = "No hero.";
      container.appendChild(empty);
      return;
    }
    const inv = ensureInventory(hero);

    const layout = document.createElement("div");
    layout.className = "inv-layout";
    const slotsCol = document.createElement("div");
    slotsCol.className = "inv-slots";
    const statsCol = document.createElement("div");
    statsCol.className = "inv-stats";
    layout.appendChild(slotsCol);
    layout.appendChild(statsCol);
    container.appendChild(layout);

    const equipH = document.createElement("h3");
    equipH.textContent = "Equipment";
    slotsCol.appendChild(equipH);
    const equipRow = document.createElement("div");
    equipRow.className = "inv-row";
    for (const slot of SLOTS) {
      equipRow.appendChild(renderEquipSlot(slot, inv.equipped[slot], hero));
    }
    slotsCol.appendChild(equipRow);

    const bagH = document.createElement("h3");
    const loadout = getLoadout();
    const inLoadoutMode = editable && !!loadout;
    bagH.textContent = inLoadoutMode ? "Loadout (4 consumables)" : "Inventory";
    slotsCol.appendChild(bagH);
    const bagRow = document.createElement("div");
    bagRow.className = "inv-row";

    if (inLoadoutMode && loadout) {
      const sel = loadout.getSelection();
      for (let i = 0; i < MIN_INVENTORY_SLOTS; i++) {
        bagRow.appendChild(renderLoadoutSlot(i, sel[i] ?? null, loadout));
      }
    } else {
      const slots = Math.max(MIN_INVENTORY_SLOTS, inv.consumables.length);
      for (let i = 0; i < slots; i++) {
        bagRow.appendChild(renderBagSlot(i, inv.consumables[i] ?? null));
      }
    }
    slotsCol.appendChild(bagRow);

    renderStats(statsCol, hero);
  }

  function openLoadoutPicker(anchor: HTMLElement, slotIdx: number, loadout: LoadoutBinding): void {
    closePicker();
    const counts = loadout.getDepotCounts();
    const sel = loadout.getSelection();
    const usedByOtherSlots = new Map<string, number>();
    sel.forEach((d, i) => {
      if (!d || i === slotIdx) return;
      usedByOtherSlots.set(d, (usedByOtherSlots.get(d) ?? 0) + 1);
    });

    const picker = document.createElement("div");
    picker.className = "inv-picker";
    picker.style.position = "absolute";

    const empty = document.createElement("button");
    empty.className = "inv-picker-row";
    empty.type = "button";
    empty.textContent = "— (empty) —";
    empty.addEventListener("click", () => {
      loadout.setSlot(slotIdx, null);
      closePicker();
      render();
    });
    picker.appendChild(empty);

    for (const [defId, total] of counts) {
      const def = ITEMS[defId]!;
      const used = usedByOtherSlots.get(defId) ?? 0;
      const remaining = total - used;
      if (remaining <= 0) continue;
      const row = document.createElement("button");
      row.className = "inv-picker-row";
      row.type = "button";
      const icon = document.createElement("canvas");
      icon.width = PICKER_ICON_PX;
      icon.height = PICKER_ICON_PX;
      icon.className = "inv-picker-icon";
      drawItemIcon(icon, defId);
      row.appendChild(icon);
      const label = document.createElement("span");
      label.textContent = `${def.name} × ${remaining}`;
      row.appendChild(label);
      row.addEventListener("click", () => {
        loadout.setSlot(slotIdx, defId);
        closePicker();
        render();
      });
      picker.appendChild(row);
    }

    document.body.appendChild(picker);
    const r = anchor.getBoundingClientRect();
    picker.style.left = `${r.left + window.scrollX}px`;
    picker.style.top = `${r.bottom + window.scrollY + 4}px`;

    const onDocClick = (ev: MouseEvent) => {
      if (!picker.contains(ev.target as Node) && ev.target !== anchor) {
        closePicker();
        document.removeEventListener("click", onDocClick, true);
      }
    };
    setTimeout(() => document.addEventListener("click", onDocClick, true), 0);
  }

  function renderLoadoutSlot(idx: number, defId: string | null, loadout: LoadoutBinding): HTMLElement {
    const def = defId ? ITEMS[defId] : undefined;
    const cell = renderSlotCell(defId, def?.name ?? `Slot ${idx + 1}`, true);
    cell.title = def ? `${def.name} (loadout slot ${idx + 1})` : `Empty loadout slot ${idx + 1}`;
    cell.addEventListener("click", ev => {
      ev.stopPropagation();
      openLoadoutPicker(cell as HTMLElement, idx, loadout);
    });
    return cell;
  }

  function renderStats(col: HTMLElement, hero: Actor): void {
    const h = document.createElement("h3");
    h.textContent = "Stats";
    col.appendChild(h);

    const base: Record<string, number> = {
      hp:    hero.hp,
      maxHp: hero.maxHp,
      mp:    hero.mp    ?? 20,
      maxMp: hero.maxMp ?? 20,
      atk:   hero.atk   ?? 3,
      def:   hero.def   ?? 0,
      int:   hero.int   ?? 0,
      speed: hero.speed,
    };
    const bonuses = getEquipmentBonuses(hero) as Partial<Record<MergeStat, number>>;

    const table = document.createElement("table");
    table.className = "inv-stats-tbl";
    const rows: Array<[string, number, MergeStat | null]> = [
      ["HP",     base.hp!,    null],
      ["Max HP", base.maxHp!, "maxHp"],
      ["MP",     base.mp!,    null],
      ["Max MP", base.maxMp!, "maxMp"],
      ["ATK",    base.atk!,   "atk"],
      ["DEF",    base.def!,   "def"],
      ["INT",    base.int!,   "int"],
      ["Speed",  base.speed!, "speed"],
    ];
    for (const [label, value, statKey] of rows) {
      const tr = document.createElement("tr");
      const td1 = document.createElement("td"); td1.className = "k"; td1.textContent = label;
      const td2 = document.createElement("td"); td2.className = "v";
      td2.textContent = String(value);
      const bonus = statKey ? bonuses[statKey] : undefined;
      if (bonus && bonus > 0) {
        const span = document.createElement("span");
        span.className = "inv-bonus";
        span.textContent = ` +${bonus}`;
        td2.appendChild(span);
      }
      tr.appendChild(td1); tr.appendChild(td2);
      table.appendChild(tr);
    }
    col.appendChild(table);

    for (const slotKey of SLOTS) {
      const inst = hero.inventory?.equipped[slotKey];
      if (!inst) continue;
      const def = ITEMS[inst.defId];
      if (!def || def.kind !== "equipment") continue;
      const lines = formatItemProcs(def);
      if (!lines.length) continue;
      const itemH = document.createElement("h3");
      itemH.textContent = def.name;
      col.appendChild(itemH);
      const ul = document.createElement("ul");
      ul.className = "inv-perm";
      for (const s of lines) {
        const li = document.createElement("li");
        li.textContent = s;
        ul.appendChild(li);
      }
      col.appendChild(ul);
    }
  }

  function renderSlotCell(defId: string | null, label: string, asButton: boolean): HTMLElement {
    const cell = document.createElement(asButton ? "button" : "div") as HTMLElement;
    cell.className = "inv-cell";
    if (asButton) (cell as HTMLButtonElement).type = "button";
    const canvas = document.createElement("canvas");
    canvas.width = ICON_PX;
    canvas.height = ICON_PX;
    cell.appendChild(canvas);
    const cap = document.createElement("span");
    cap.className = "inv-cap";
    cap.textContent = label;
    cell.appendChild(cap);
    if (defId) drawItemIcon(canvas, defId);
    else cell.classList.add("inv-empty");
    return cell;
  }

  function renderEquipSlot(slot: Slot, current: ItemInstance | null, hero: Actor): HTMLElement {
    const def = current ? ITEMS[current.defId] : undefined;
    const cell = renderSlotCell(current?.defId ?? null, def?.name ?? slot, editable);
    cell.title = def ? `${def.name} (${slot})` : `Empty ${slot}`;
    if (editable) {
      cell.addEventListener("click", ev => {
        ev.stopPropagation();
        openPicker(cell, slot, hero);
      });
    }
    return cell;
  }

  function renderBagSlot(idx: number, current: ItemInstance | null): HTMLElement {
    const def = current ? ITEMS[current.defId] : undefined;
    const cell = renderSlotCell(current?.defId ?? null, def?.name ?? `Slot ${idx + 1}`, false);
    cell.title = def ? def.name : `Empty slot ${idx + 1}`;
    return cell;
  }

  render();
  return {
    refresh: render,
    setEditable: (yes: boolean) => {
      editable = yes;
      render();
    },
  };
}
