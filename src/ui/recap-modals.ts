// End-of-attempt and end-of-run modals built dynamically into <body>.
// - Quit confirm: Y/N when the player aborts mid-run.
// - Final review: aggregate stats + depot listing when the run ends.
// Both are appended on first show and toggled via `hidden` thereafter.

import type { PersistentRun } from "../types.js";
import { ITEMS } from "../content/items.js";

// ──────────────────────────── quit confirm ────────────────────────────

let quitModal: HTMLDivElement | null = null;

// Append a QUIT button to the death-recap modal's action row (idempotent).
// `onQuit` is invoked when the player clicks it.
export function ensureQuitButton(recapModal: HTMLElement, onQuit: () => void): void {
  const actions = recapModal.querySelector(".modal-actions");
  if (!actions) return;
  if (actions.querySelector("#btn-quit")) return;
  const btn = document.createElement("button");
  btn.id = "btn-quit";
  btn.type = "button";
  btn.textContent = "QUIT";
  btn.addEventListener("click", onQuit);
  actions.appendChild(btn);
}

export function showQuitConfirm(onConfirm: () => void, onCancel: () => void): void {
  if (quitModal) { quitModal.hidden = false; return; }
  quitModal = document.createElement("div");
  quitModal.className = "modal";
  quitModal.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-box" role="dialog" aria-modal="true">
      <h2>END THE RUN?</h2>
      <p>End the run permanently? Depot will be wiped. Y/N</p>
      <div class="modal-actions">
        <button id="btn-quit-yes" type="button">Yes</button>
        <button id="btn-quit-no"  type="button">No</button>
      </div>
    </div>
  `;
  document.body.appendChild(quitModal);
  quitModal.querySelector("#btn-quit-yes")!.addEventListener("click", onConfirm);
  quitModal.querySelector("#btn-quit-no")!.addEventListener("click", onCancel);
}

export function hideQuitConfirm(): void {
  if (quitModal) quitModal.hidden = true;
}

// ──────────────────────────── final review ────────────────────────────

let finalModal: HTMLDivElement | null = null;

export function showFinalReview(snap: PersistentRun, onAcknowledge: () => void): void {
  if (!finalModal) {
    finalModal = document.createElement("div");
    finalModal.className = "modal";
    finalModal.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-box" role="dialog" aria-modal="true">
        <h2>RUN COMPLETE</h2>
        <table class="recap-stats">
          <tr><td class="k">Attempts</td><td class="v" id="final-attempts">0</td></tr>
          <tr><td class="k">Deepest Depth</td><td class="v" id="final-depth">0</td></tr>
          <tr><td class="k">Monsters Slain</td><td class="v" id="final-kills">0</td></tr>
          <tr><td class="k">Items Collected</td><td class="v" id="final-items">0</td></tr>
        </table>
        <h3>Final Depot</h3>
        <ul id="final-depot" class="final-depot"></ul>
        <div class="modal-actions">
          <button id="btn-final-ok" type="button">OK</button>
        </div>
      </div>
    `;
    document.body.appendChild(finalModal);
    finalModal.querySelector("#btn-final-ok")!.addEventListener("click", onAcknowledge);
  }
  finalModal.hidden = false;
  (finalModal.querySelector("#final-attempts") as HTMLElement).textContent = String(snap.stats.attempts);
  (finalModal.querySelector("#final-depth") as HTMLElement).textContent = String(snap.stats.deepestDepth);
  (finalModal.querySelector("#final-kills") as HTMLElement).textContent = String(snap.stats.totalKills);
  (finalModal.querySelector("#final-items") as HTMLElement).textContent = String(snap.stats.totalItemsCollected);
  const list = finalModal.querySelector("#final-depot") as HTMLUListElement;
  list.innerHTML = "";
  if (snap.depot.length === 0) {
    const li = document.createElement("li");
    li.textContent = "(empty)";
    list.appendChild(li);
  } else {
    const counts = new Map<string, number>();
    for (const inst of snap.depot) counts.set(inst.defId, (counts.get(inst.defId) ?? 0) + 1);
    for (const [defId, n] of counts) {
      const li = document.createElement("li");
      li.textContent = `${ITEMS[defId]?.name ?? defId} × ${n}`;
      list.appendChild(li);
    }
  }
}

export function hideFinalReview(): void {
  if (finalModal) finalModal.hidden = true;
}
