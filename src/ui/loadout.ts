// Phase 15: pre-attempt loadout screen.
//
// Renders the depot's consumables and lets the player pick up to 4 items to
// seed the new attempt. Wearables and scrolls are excluded from the picker
// (auto-managed at attempt-end and room-clear respectively). A BREACH button
// commits the selection and advances to running.

import type { ItemInstance } from "../types.js";
import { ITEMS } from "../content/items.js";
import type { RunController } from "./run-state.js";
import { MAX_LOADOUT } from "./run-state.js";

export interface LoadoutController {
  refresh: () => void;
}

export function mountLoadoutPanel(
  container: HTMLElement,
  ctl: RunController,
  onBreach: () => void,
): LoadoutController {
  function render(): void {
    const s = ctl.getState();
    container.innerHTML = "";

    const root = document.createElement("div");
    root.className = "loadout-panel";

    const heading = document.createElement("h2");
    heading.textContent = `LOADOUT — Attempt ${s.attempts}`;
    root.appendChild(heading);

    const sub = document.createElement("div");
    sub.className = "loadout-sub";
    sub.textContent = `Pick up to ${MAX_LOADOUT} items from your depot. Wearables auto-equip; spells auto-learn.`;
    root.appendChild(sub);

    // Selection area — slot grid showing currently picked items.
    const sel = document.createElement("div");
    sel.className = "loadout-selection";
    for (let i = 0; i < MAX_LOADOUT; i++) {
      const cell = document.createElement("div");
      cell.className = "loadout-slot";
      const defId = s.loadout[i];
      if (defId) {
        const def = ITEMS[defId];
        cell.textContent = def?.name ?? defId;
        cell.classList.add("filled");
      } else {
        cell.textContent = `slot ${i + 1}`;
        cell.classList.add("empty");
      }
      sel.appendChild(cell);
    }
    root.appendChild(sel);

    // Depot listing — consumables only.
    const depotH = document.createElement("h3");
    depotH.textContent = "DEPOT";
    root.appendChild(depotH);

    const list = document.createElement("ul");
    list.className = "loadout-depot";

    const consumables = s.run.depot.filter(i => {
      const def = ITEMS[i.defId];
      return def && def.kind === "consumable" && def.id !== "key";
    });
    if (consumables.length === 0) {
      const empty = document.createElement("li");
      empty.className = "loadout-empty";
      empty.textContent = "(empty)";
      list.appendChild(empty);
    }

    // Group by defId for display so "3× Health Potion" reads tidy. Selection
    // operates on defIds — the controller pulls one matching instance per pick.
    const counts = new Map<string, { def: typeof consumables[number]; count: number; firstId: string }>();
    for (const inst of consumables) {
      const cur = counts.get(inst.defId);
      if (cur) cur.count += 1;
      else counts.set(inst.defId, { def: inst, count: 1, firstId: inst.id });
    }
    for (const [defId, group] of counts) {
      const def = ITEMS[defId]!;
      const li = document.createElement("li");
      const selectedCount = s.loadout.filter(d => d === defId).length;
      const remaining = group.count - selectedCount;
      li.className = "loadout-row";
      const name = document.createElement("span");
      name.textContent = `${def.name} × ${remaining}`;
      li.appendChild(name);
      const desc = document.createElement("small");
      desc.textContent = def.description;
      li.appendChild(desc);
      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.textContent = "+";
      addBtn.disabled = remaining <= 0 || s.loadout.length >= MAX_LOADOUT;
      addBtn.addEventListener("click", () => { ctl.toggleLoadout(defId); render(); });
      li.appendChild(addBtn);
      const remBtn = document.createElement("button");
      remBtn.type = "button";
      remBtn.textContent = "−";
      remBtn.disabled = selectedCount <= 0;
      remBtn.addEventListener("click", () => { ctl.toggleLoadout(defId); render(); });
      li.appendChild(remBtn);
      list.appendChild(li);
    }
    root.appendChild(list);

    const breach = document.createElement("button");
    breach.type = "button";
    breach.className = "loadout-breach";
    breach.textContent = "BREACH";
    breach.addEventListener("click", () => onBreach());
    root.appendChild(breach);

    container.appendChild(root);
  }

  return { refresh: render };
}
