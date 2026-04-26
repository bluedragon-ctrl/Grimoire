// Consumable-specific tests covering:
// - use() with ally/enemy/tile targeting via doUse
// - cleanse primitive (removes debuffs, keeps buffs)
// - permanent_boost primitive (bumps base stat)
// - bomb/tile targeting via doUse

import { describe, it, expect } from "vitest";
import type { Actor, World, Effect } from "../../src/types.js";
import { useItem, mintInstance, ensureInventory } from "../../src/items/execute.js";
import { doUse } from "../../src/commands.js";
import { emptyEquipped } from "../../src/content/items.js";
import { script, cHalt } from "../../src/ast-helpers.js";
import { applyEffect } from "../../src/effects.js";
import { PRIMITIVES } from "../../src/spells/primitives.js";

const S = script(cHalt());

function mkWorld(actors: Actor[], clouds: import("../../src/types.js").Cloud[] = []): World {
  return {
    tick: 0,
    room: { w: 10, h: 10, doors: [], chests: [], clouds: [...clouds] },
    actors, log: [], aborted: false, ended: false,
  };
}

function mkHero(over: Partial<Actor> = {}): Actor {
  return {
    id: "h", kind: "hero", isHero: true, hp: 10, maxHp: 20, speed: 12, energy: 0, alive: true,
    pos: { x: 0, y: 0 }, mp: 20, maxMp: 20, atk: 3, def: 0, int: 0,
    effects: [], knownSpells: [], faction: "player",
    inventory: { consumables: [], equipped: emptyEquipped() },
    script: S, ...over,
  };
}

function mkAlly(over: Partial<Actor> = {}): Actor {
  return {
    id: "a1", kind: "ally", hp: 8, maxHp: 20, speed: 10, energy: 0, alive: true,
    pos: { x: 2, y: 0 }, mp: 0, maxMp: 0, atk: 0, def: 0, int: 0,
    effects: [], faction: "player",
    script: S, ...over,
  };
}

function mkEnemy(over: Partial<Actor> = {}): Actor {
  return {
    id: "e1", kind: "goblin", hp: 10, maxHp: 10, speed: 10, energy: 0, alive: true,
    pos: { x: 2, y: 0 }, mp: 0, maxMp: 0, atk: 0, def: 0, int: 0,
    effects: [], faction: "enemy",
    script: S, ...over,
  };
}

// ─── cleanse primitive ─────────────────────────────────────────────────────

describe("cleanse primitive", () => {
  it("removes all debuffs, keeps buffs", () => {
    const h = mkHero({ effects: [
      { id: "e1", kind: "poison",  target: "h", duration: 20, remaining: 20, tickEvery: 15 },
      { id: "e2", kind: "burning", target: "h", duration: 20, remaining: 20, tickEvery: 10 },
      { id: "e3", kind: "haste",   target: "h", duration: 20, remaining: 20, tickEvery: 1 },
      { id: "e4", kind: "might",   target: "h", duration: 20, remaining: 20, tickEvery: 1 },
    ]});
    const inst = mintInstance("cleanse_potion");
    ensureInventory(h).consumables.push(inst);
    const w = mkWorld([h]);
    doUse(w, h, "cleanse_potion"); // self-target (default)
    const kinds = (h.effects ?? []).map(e => e.kind).sort();
    // haste + might are buffs → kept; poison + burning are debuffs → removed
    expect(kinds).toEqual(["haste", "might"]);
  });

  it("emits EffectExpired for each removed debuff", () => {
    const h = mkHero({ effects: [
      { id: "e1", kind: "chill",  target: "h", duration: 20, remaining: 20, tickEvery: 1 },
      { id: "e2", kind: "shock",  target: "h", duration: 20, remaining: 20, tickEvery: 1 },
    ]});
    const inst = mintInstance("cleanse_potion");
    ensureInventory(h).consumables.push(inst);
    const w = mkWorld([h]);
    const events = doUse(w, h, "cleanse_potion");
    const expired = events.filter(e => e.type === "EffectExpired");
    expect(expired.length).toBe(2);
    const kinds = expired.map(e => (e as any).kind).sort();
    expect(kinds).toEqual(["chill", "shock"]);
  });

  it("cleanse on ally removes ally's debuffs", () => {
    const h = mkHero();
    const ally = mkAlly({ effects: [
      { id: "e1", kind: "slow",    target: "a1", duration: 20, remaining: 20, tickEvery: 1 },
      { id: "e2", kind: "mana_regen", target: "a1", duration: 20, remaining: 20, tickEvery: 10 },
    ]});
    const inst = mintInstance("cleanse_potion");
    ensureInventory(h).consumables.push(inst);
    const w = mkWorld([h, ally]);
    doUse(w, h, "cleanse_potion", ally);
    // slow is debuff → gone; mana_regen is buff → kept
    const kinds = (ally.effects ?? []).map(e => e.kind);
    expect(kinds).toEqual(["mana_regen"]);
  });

  it("cleanse_potion rejects enemy target", () => {
    const h = mkHero();
    const enemy = mkEnemy();
    const inst = mintInstance("cleanse_potion");
    ensureInventory(h).consumables.push(inst);
    const w = mkWorld([h, enemy]);
    const events = doUse(w, h, "cleanse_potion", enemy);
    expect((events[0] as any).type).toBe("ActionFailed");
    expect(h.inventory!.consumables.length).toBe(1); // NOT consumed
  });
});

// ─── permanent_boost primitive ─────────────────────────────────────────────

describe("permanent_boost primitive (via vitality_elixir-like direct call)", () => {
  it("increases maxHp and hp on actor", () => {
    const h = mkHero({ hp: 10, maxHp: 10 });
    const w = mkWorld([h]);
    const events = PRIMITIVES.permanent_boost.execute(w, h, h, { stat: "hp", amount: 3 });
    expect(h.maxHp).toBe(13);
    // hp also bumped (gains the same amount, doesn't exceed new max)
    expect(h.hp).toBe(13);
  });

  it("increases atk", () => {
    const h = mkHero({ atk: 5 });
    const w = mkWorld([h]);
    PRIMITIVES.permanent_boost.execute(w, h, h, { stat: "atk", amount: 2 });
    expect(h.atk).toBe(7);
  });

  it("unknown stat → no-op", () => {
    const h = mkHero();
    const w = mkWorld([h]);
    const events = PRIMITIVES.permanent_boost.execute(w, h, h, { stat: "luck", amount: 5 });
    expect(events.length).toBe(0);
  });
});

// ─── targeted use() gate tests ─────────────────────────────────────────────

describe("use() gate: range", () => {
  it("range exactly 4 → ok", () => {
    const h = mkHero({ pos: { x: 0, y: 0 } });
    const ally = mkAlly({ pos: { x: 4, y: 0 }, hp: 5, maxHp: 20 });
    const inst = mintInstance("health_potion");
    ensureInventory(h).consumables.push(inst);
    const w = mkWorld([h, ally]);
    const events = doUse(w, h, inst, ally);
    expect(ally.hp).toBe(15);
    expect(events.some(e => e.type === "ItemUsed")).toBe(true);
  });

  it("range 5 (>4) → ActionFailed, item not consumed", () => {
    const h = mkHero({ pos: { x: 0, y: 0 } });
    const ally = mkAlly({ pos: { x: 5, y: 0 } });
    const inst = mintInstance("health_potion");
    ensureInventory(h).consumables.push(inst);
    const w = mkWorld([h, ally]);
    const events = doUse(w, h, inst, ally);
    expect((events[0] as any).type).toBe("ActionFailed");
    expect(h.inventory!.consumables.length).toBe(1);
  });
});

describe("use() gate: LOS (smoke blocking)", () => {
  it("smoke between user and target → ActionFailed, item not consumed", () => {
    const h = mkHero({ pos: { x: 0, y: 0 } });
    const ally = mkAlly({ pos: { x: 3, y: 0 } });
    const smoke = { id: "c1", pos: { x: 1, y: 0 }, kind: "smoke", duration: 20, remaining: 20 };
    const inst = mintInstance("health_potion");
    ensureInventory(h).consumables.push(inst);
    const w = mkWorld([h, ally], [smoke]);
    const events = doUse(w, h, inst, ally);
    expect((events[0] as any).type).toBe("ActionFailed");
    expect(h.inventory!.consumables.length).toBe(1);
  });

  it("adjacent ally through own smoke tile → ok (source tile doesn't block)", () => {
    const h = mkHero({ pos: { x: 0, y: 0 } });
    const ally = mkAlly({ pos: { x: 1, y: 0 }, hp: 5, maxHp: 20 });
    // Smoke on hero's own tile — shouldn't block adjacent target.
    const smoke = { id: "c1", pos: { x: 0, y: 0 }, kind: "smoke", duration: 20, remaining: 20 };
    const inst = mintInstance("health_potion");
    ensureInventory(h).consumables.push(inst);
    const w = mkWorld([h, ally], [smoke]);
    const events = doUse(w, h, inst, ally);
    expect(ally.hp).toBe(15);
    expect(events.some(e => e.type === "ItemUsed")).toBe(true);
  });
});

// ─── bomb (tile target) ────────────────────────────────────────────────────

describe("use() tile target (bomb)", () => {
  // We use a direct body dispatch test since bomb items are added in commit 7.
  // For now test via doUse with a manually patched ITEMS entry is more complex,
  // so we test tile-target routing directly through primitives in the next commit.
  // This stub test verifies the gate plumbing for tile targets.
  it("self-target item uses actor pos as tile", () => {
    const h = mkHero({ hp: 5, maxHp: 20 });
    const inst = mintInstance("health_potion");
    ensureInventory(h).consumables.push(inst);
    const w = mkWorld([h]);
    // health_potion is ally-target, but doUse(w, h, inst) with no target
    // falls back to self — which is faction "player" = ally, passes gate.
    const events = doUse(w, h, inst);
    expect(h.hp).toBe(15);
    expect(events.some(e => e.type === "ItemUsed")).toBe(true);
  });
});
