// Phase 15: localStorage IO for the persistent run.
//
// Single key — `grimoire.run.v1`. Reads/writes are best-effort: a missing or
// malformed payload yields a fresh seeded state. Writes only happen at safe
// boundaries (room clear, attempt end, attempt start, quit).

import type { ItemInstance, PersistentRun, Slot } from "./types.js";
import { ITEMS, emptyEquipped } from "./content/items.js";

export const STORAGE_KEY = "grimoire.run.v1";

// Phase 13.7-era starter inventory and gear.
const STARTING_INVENTORY: { defId: string; count: number }[] = [
  { defId: "health_potion", count: 2 },
  { defId: "mana_crystal", count: 1 },
];
const STARTER_KNOWN_SPELLS = ["bolt", "heal"];
const STARTER_KNOWN_GEAR = ["wooden_staff", "bone_dagger"];
const STARTER_EQUIPPED: Partial<Record<Slot, string>> = {
  staff: "wooden_staff",
  dagger: "bone_dagger",
};

let _seq = 0;
function mintId(defId: string): string {
  return `r${++_seq}_${defId}`;
}

export function freshRun(): PersistentRun {
  const depot: ItemInstance[] = [];
  for (const e of STARTING_INVENTORY) {
    for (let i = 0; i < e.count; i++) depot.push({ id: mintId(e.defId), defId: e.defId });
  }
  const equipped: Record<Slot, ItemInstance | null> = emptyEquipped();
  for (const [slot, defId] of Object.entries(STARTER_EQUIPPED) as [Slot, string][]) {
    equipped[slot] = { id: mintId(defId), defId };
  }
  return {
    depot,
    equipped,
    knownSpells: [...STARTER_KNOWN_SPELLS],
    knownGear: [...STARTER_KNOWN_GEAR],
    stats: { attempts: 0, deepestDepth: 0, totalKills: 0, totalItemsCollected: 0 },
    schemaVersion: 1,
  };
}

function safeStorage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function loadRun(): PersistentRun {
  const ls = safeStorage();
  if (!ls) return freshRun();
  const raw = ls.getItem(STORAGE_KEY);
  if (!raw) return freshRun();
  try {
    const parsed = JSON.parse(raw) as PersistentRun;
    if (!parsed || parsed.schemaVersion !== 1) return freshRun();
    return validateAndPatch(parsed);
  } catch {
    return freshRun();
  }
}

function validateAndPatch(run: PersistentRun): PersistentRun {
  const out: PersistentRun = {
    depot: Array.isArray(run.depot)
      ? run.depot.filter(i => i && typeof i.defId === "string" && ITEMS[i.defId])
      : [],
    equipped: emptyEquipped(),
    knownSpells: Array.isArray(run.knownSpells) ? run.knownSpells.filter(s => typeof s === "string") : [...STARTER_KNOWN_SPELLS],
    knownGear: Array.isArray(run.knownGear) ? run.knownGear.filter(s => typeof s === "string") : [...STARTER_KNOWN_GEAR],
    stats: {
      attempts: run.stats?.attempts ?? 0,
      deepestDepth: run.stats?.deepestDepth ?? 0,
      totalKills: run.stats?.totalKills ?? 0,
      totalItemsCollected: run.stats?.totalItemsCollected ?? 0,
    },
    schemaVersion: 1,
  };
  if (run.equipped) {
    for (const slot of Object.keys(out.equipped) as Slot[]) {
      const inst = run.equipped[slot];
      if (inst && typeof inst.defId === "string" && ITEMS[inst.defId]) {
        out.equipped[slot] = { id: inst.id, defId: inst.defId };
      }
    }
  }
  return out;
}

export function saveRun(run: PersistentRun): void {
  const ls = safeStorage();
  if (!ls) return;
  try {
    ls.setItem(STORAGE_KEY, JSON.stringify(run));
  } catch {
    // Quota exhausted or storage unavailable — silent fail; gameplay still works.
  }
}

export function wipeRun(): void {
  const ls = safeStorage();
  if (!ls) return;
  try { ls.removeItem(STORAGE_KEY); } catch { /* noop */ }
}

// ──────────────────────────── attempt-end auto-routing ────────────────────────────

import type { Actor } from "./types.js";

/**
 * Mutates `run` to merge what the hero was carrying at attempt end:
 *  - inventory wearables → equip into empty slots, overflow to depot
 *  - inventory consumables → depot
 *  - keys → discarded
 *  - equipped wearables → stay on `run.equipped` (already there from attempt start)
 *  - knownSpells already merged via processScrolls during exit (or carry from hero)
 */
export function routeInventoryToRun(hero: Actor, run: PersistentRun): void {
  const inv = hero.inventory;
  if (!inv) return;
  // Promote any inventory wearables to empty slots, otherwise to depot.
  for (const inst of inv.consumables) {
    const def = ITEMS[inst.defId];
    if (!def) continue;
    if (def.id === "key") continue;     // discarded
    if (def.kind === "scroll") continue; // already auto-learned at room clear
    if (def.kind === "equipment" && def.slot) {
      if (run.equipped[def.slot] === null) {
        run.equipped[def.slot] = { id: inst.id, defId: inst.defId };
      } else {
        run.depot.push({ id: inst.id, defId: inst.defId });
      }
      continue;
    }
    run.depot.push({ id: inst.id, defId: inst.defId });
  }
  // Equipped wearables on the hero are kept as-is (run.equipped already
  // mirrors them at attempt start; if the hero's equipment changed mid-attempt
  // — Phase 16 — sync from hero.inventory.equipped here).
  for (const slot of Object.keys(run.equipped) as Slot[]) {
    const live = inv.equipped[slot];
    if (live) run.equipped[slot] = { id: live.id, defId: live.defId };
  }
  // Merge any hero knownSpells/knownGear discoveries.
  if (hero.knownSpells) {
    for (const s of hero.knownSpells) {
      if (!run.knownSpells.includes(s)) run.knownSpells.push(s);
    }
  }
  if (hero.knownGear) {
    for (const g of hero.knownGear) {
      if (!run.knownGear.includes(g)) run.knownGear.push(g);
    }
  }
}

/**
 * Build a hero Actor mirroring the persistent run state.
 *
 * If `loadoutDefIds` is non-empty the matching instances are pulled out of
 * the depot into the hero's inventory (consuming them); pass an empty array
 * to build a "loadout-preview" hero whose equipment reflects run.equipped
 * but whose inventory is empty (the prep panel mutates this hero, then
 * startAttempt syncs back).
 */
export function buildAttemptHero(
  run: PersistentRun, loadoutDefIds: ReadonlyArray<string | null>, pos: { x: number; y: number },
): Actor {
  // Pull selected items from the depot in order.
  const consumables: ItemInstance[] = [];
  const remaining: ItemInstance[] = [...run.depot];
  for (const defId of loadoutDefIds) {
    if (!defId) continue;
    const idx = remaining.findIndex(i => i.defId === defId);
    if (idx < 0) continue;
    consumables.push(remaining[idx]!);
    remaining.splice(idx, 1);
  }
  run.depot = remaining;

  const equipped: Record<Slot, ItemInstance | null> = emptyEquipped();
  for (const slot of Object.keys(equipped) as Slot[]) {
    const e = run.equipped[slot];
    if (e) equipped[slot] = { id: e.id, defId: e.defId };
  }

  // Build a hero Actor; the engine will fill defaults for missing fields.
  const hero: Actor = {
    id: "hero", kind: "hero", isHero: true,
    hp: 20, maxHp: 20,
    speed: 12, energy: 0,
    pos: { ...pos },
    script: { main: [], handlers: [], funcs: [] },
    alive: true,
    knownSpells: [...run.knownSpells],
    knownGear: [...run.knownGear],
    inventory: { consumables, equipped },
  };
  return hero;
}

/**
 * Phase 15: count depot consumables (excluding scrolls + keys, which are not
 * loadout-pickable). Returns a Map<defId, instances> used by the prep panel
 * to render the picker grouped by defId with counts.
 */
export function depotConsumableInstances(run: PersistentRun): Map<string, ItemInstance[]> {
  const out = new Map<string, ItemInstance[]>();
  for (const inst of run.depot) {
    const def = ITEMS[inst.defId];
    if (!def || def.kind !== "consumable" || def.id === "key") continue;
    if (!out.has(inst.defId)) out.set(inst.defId, []);
    out.get(inst.defId)!.push(inst);
  }
  return out;
}
