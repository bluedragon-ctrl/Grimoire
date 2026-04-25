// Inventory prep panel — visible only during the idle (pre-run) phase.
// Lets the user inspect/configure the hero's starting gear: 5 equipment
// slots (hat/robe/staff/dagger/focus) and a 4-slot consumables bag.
// Mutates the passed-in RoomSetup so the next Run picks up the choices.
//
// Each slot renders a small canvas with the item's ported draw + preset
// colors; clicking opens a picker of available ItemDefs for that category.

import type { Actor, ItemDef, ItemInstance, Slot } from "../types.js";
import { ITEMS, BAG_SIZE, SLOTS, emptyEquipped } from "../content/items.js";
import { ITEM_DRAWS } from "../render/items.js";
import { ITEM_VISUAL_PRESETS, FALLBACK_PRESETS, type ItemShape } from "../content/item-visuals.js";
import type { WearableDef, ProcSpec } from "../types.js";
import { getEquipmentBonuses } from "../items/execute.js";
import type { MergeStat } from "../items/script.js";

const ICON_PX = 40;
let instanceCounter = 0;

function nextInstanceId(prefix: string): string {
  instanceCounter++;
  return `${prefix}_${instanceCounter}`;
}

function ensureInventory(a: Actor): NonNullable<Actor["inventory"]> {
  if (!a.inventory) a.inventory = { consumables: [], equipped: emptyEquipped() };
  return a.inventory;
}

function iconColors(defId: string): { col1?: string; col2?: string; color?: string } {
  const preset = ITEM_VISUAL_PRESETS[defId];
  if (preset) return preset.colors;
  // Fall back by shape if no specific preset. We rarely hit this; defId is
  // keyed 1:1 with ITEM_VISUAL_PRESETS today.
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
  fn(ctx, canvas.width / 2, canvas.height / 2, 0, iconColors(defId));
}

// Map a defId to an ITEM_DRAWS key. Visual presets use shape names that
// closely match the draw registry ("potion", "staff", …); items.ts exports
// both shape-based and bespoke draws (drawHealthPotion, drawWoodenStaff, …).
function pickDrawFn(defId: string): string {
  // Bespoke per-item draws available in items.ts:
  const bespoke: Record<string, string> = {
    health_potion: "drawHealthPotion",
    mana_crystal: "drawManaCrystal",
    haste_potion: "drawPotion1",
    cleanse_potion: "drawPotion2",
    cloth_cap: "drawHat1",
    wizard_hat: "drawHat2",
    leather_robe: "drawRobeFolded",
    silk_robe: "drawRobeFoldedEmber",
    wooden_staff: "drawWoodenStaff",
    fire_staff: "drawFireStaff",
    bone_dagger: "drawDaggerA",
    venom_dagger: "drawDaggerB",
    quartz_focus: "drawFocusA",
    runed_focus: "drawFocusB",
  };
  return bespoke[defId] ?? "drawGenericItem";
}

// ── Picker (inline popup) ─────────────────────────────────────────────

function closePicker(): void {
  const ex = document.querySelector(".inv-picker");
  if (ex) ex.remove();
}

function openPicker(
  anchor: HTMLElement,
  options: { label: string; defId: string | null }[],
  onPick: (defId: string | null) => void,
): void {
  closePicker();
  const box = document.createElement("div");
  box.className = "inv-picker";
  for (const opt of options) {
    const btn = document.createElement("button");
    btn.className = "inv-picker-row";
    btn.textContent = opt.label;
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      onPick(opt.defId);
      closePicker();
    });
    box.appendChild(btn);
  }
  // Position near the anchor.
  const rect = anchor.getBoundingClientRect();
  box.style.position = "fixed";
  box.style.left = `${rect.left}px`;
  box.style.top = `${rect.bottom + 2}px`;
  document.body.appendChild(box);
  // Click-away to dismiss.
  setTimeout(() => {
    const close = (e: MouseEvent) => {
      if (!box.contains(e.target as Node)) {
        closePicker();
        document.removeEventListener("mousedown", close);
      }
    };
    document.addEventListener("mousedown", close);
  }, 0);
}

// ── Public: render the inventory panel into `container` ───────────────

export interface InventoryController {
  /** Redraw the panel (call after external state changes). */
  refresh: () => void;
  /** Enable/disable editing (disable once the run starts). */
  setEditable: (yes: boolean) => void;
}

export function mountInventoryPanel(
  container: HTMLElement,
  getHero: () => Actor | null,
): InventoryController {
  let editable = true;

  function render(): void {
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

    // Two-column layout: slots on the left, stats on the right.
    const layout = document.createElement("div");
    layout.className = "inv-layout";
    const slotsCol = document.createElement("div");
    slotsCol.className = "inv-slots";
    const statsCol = document.createElement("div");
    statsCol.className = "inv-stats";
    layout.appendChild(slotsCol);
    layout.appendChild(statsCol);
    container.appendChild(layout);

    // Equipment row
    const equipH = document.createElement("h3");
    equipH.textContent = "Equipment";
    slotsCol.appendChild(equipH);
    const equipRow = document.createElement("div");
    equipRow.className = "inv-row";
    for (const slot of SLOTS) {
      equipRow.appendChild(renderEquipSlot(slot, inv.equipped[slot], hero));
    }
    slotsCol.appendChild(equipRow);

    // Bag row
    const bagH = document.createElement("h3");
    bagH.textContent = "Bag";
    slotsCol.appendChild(bagH);
    const bagRow = document.createElement("div");
    bagRow.className = "inv-row";
    for (let i = 0; i < BAG_SIZE; i++) {
      bagRow.appendChild(renderBagSlot(i, inv.consumables[i] ?? null, hero));
    }
    slotsCol.appendChild(bagRow);

    renderStats(statsCol, hero);
  }

  function renderStats(col: HTMLElement, hero: Actor): void {
    const h = document.createElement("h3");
    h.textContent = "Stats";
    col.appendChild(h);

    // Baseline stats from the actor object. Phase 5 normalizes these on
    // the engine side via `cloneActor`, but in prep phase we read whatever
    // the setup provides, falling back to hero defaults.
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

    // Proc effects from equipped wearables (on_hit, on_damage, on_kill, on_cast).
    const procLines: string[] = [];
    for (const slotKey of SLOTS) {
      const inst = hero.inventory?.equipped[slotKey];
      if (!inst) continue;
      const def = ITEMS[inst.defId];
      if (!def || def.category !== "wearable") continue;
      const w = def as WearableDef;
      const addProc = (name: string, proc: ProcSpec | undefined) => {
        if (!proc) return;
        const chStr = proc.chance !== undefined && proc.chance < 100 ? ` (${proc.chance}%)` : "";
        const effStr = proc.effect ? ` ${proc.effect.kind} ${proc.effect.duration}t` : "";
        const dmgStr = proc.damage !== undefined ? (proc.damage < 0 ? ` heal ${-proc.damage}` : ` dmg ${proc.damage}`) : "";
        procLines.push(`${def.name}: ${name}→${proc.target}${chStr}${effStr}${dmgStr}`);
      };
      addProc("on_hit",    w.on_hit);
      addProc("on_damage", w.on_damage);
      addProc("on_kill",   w.on_kill);
      addProc("on_cast",   w.on_cast);
      if (w.aura) {
        procLines.push(`${def.name}: aura ${w.aura.kind}${w.aura.magnitude !== undefined ? ` ×${w.aura.magnitude}` : ""}`);
      }
    }
    if (procLines.length) {
      const efxH = document.createElement("h3");
      efxH.textContent = "Proc effects";
      col.appendChild(efxH);
      const ul = document.createElement("ul");
      ul.className = "inv-perm";
      for (const s of procLines) {
        const li = document.createElement("li");
        li.textContent = s;
        ul.appendChild(li);
      }
      col.appendChild(ul);
    }
  }

  function renderSlotCell(defId: string | null, label: string): HTMLElement {
    const cell = document.createElement("button");
    cell.className = "inv-cell";
    cell.type = "button";
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
    if (!editable) cell.disabled = true;
    return cell;
  }

  function renderEquipSlot(slot: Slot, current: ItemInstance | null, hero: Actor): HTMLElement {
    const def = current ? ITEMS[current.defId] : undefined;
    const cell = renderSlotCell(current?.defId ?? null, def?.name ?? slot);
    cell.title = def ? `${def.name} (${slot})` : `Empty ${slot}`;
    cell.addEventListener("click", () => {
      if (!editable) return;
      const defs = Object.values(ITEMS).filter(d => d.kind === "equipment" && d.slot === slot);
      const options = [
        { label: "— Empty —", defId: null },
        ...defs.map(d => ({ label: d.name, defId: d.id })),
      ];
      openPicker(cell, options, (defId) => {
        const inv = ensureInventory(hero);
        inv.equipped[slot] = defId
          ? { id: nextInstanceId(defId), defId }
          : null;
        render();
      });
    });
    return cell;
  }

  function renderBagSlot(idx: number, current: ItemInstance | null, hero: Actor): HTMLElement {
    const def = current ? ITEMS[current.defId] : undefined;
    const cell = renderSlotCell(current?.defId ?? null, def?.name ?? `Slot ${idx + 1}`);
    cell.title = def ? def.name : `Empty slot ${idx + 1}`;
    cell.addEventListener("click", () => {
      if (!editable) return;
      const defs = Object.values(ITEMS).filter(d => d.kind === "consumable");
      const options = [
        { label: "— Empty —", defId: null },
        ...defs.map((d: ItemDef) => ({ label: d.name, defId: d.id })),
      ];
      openPicker(cell, options, (defId) => {
        const inv = ensureInventory(hero);
        if (defId) {
          inv.consumables[idx] = { id: nextInstanceId(defId), defId };
        } else {
          inv.consumables.splice(idx, 1);
        }
        render();
      });
    });
    return cell;
  }

  render();
  return {
    refresh: render,
    setEditable: (yes) => { editable = yes; closePicker(); render(); },
  };
}
