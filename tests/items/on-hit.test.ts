import { describe, it, expect } from "vitest";
import type { Actor, World } from "../../src/types.js";
import { doAttack } from "../../src/commands.js";
import { equipItem, mintInstance, ensureInventory } from "../../src/items/execute.js";
import { emptyEquipped } from "../../src/content/items.js";
import { script, cHalt } from "../../src/ast-helpers.js";

function mkWorld(actors: Actor[]): World {
  return { tick: 0, room: { w: 5, h: 5, doors: [], items: [], chests: [], clouds: [] }, actors, log: [], aborted: false, ended: false, rngSeed: 42 };
}
function mkHero(over: Partial<Actor> = {}): Actor {
  return {
    id: "h", kind: "hero", hp: 20, maxHp: 20, speed: 12, energy: 0, alive: true,
    pos: { x: 0, y: 0 }, mp: 10, maxMp: 20, atk: 3, def: 0, int: 0,
    effects: [], knownSpells: [],
    inventory: { consumables: [], equipped: emptyEquipped() },
    script: script(cHalt()), ...over,
  };
}
function mkGoblin(over: Partial<Actor> = {}): Actor {
  return {
    id: "g", kind: "goblin", hp: 10, maxHp: 10, speed: 10, energy: 0, alive: true,
    pos: { x: 1, y: 0 }, mp: 0, maxMp: 0, atk: 1, def: 0, int: 0,
    effects: [], knownSpells: [],
    script: script(cHalt()), ...over,
  };
}

describe("onHitHook", () => {
  it("venom_dagger on_hit inflicts poison after attack", () => {
    const h = mkHero();
    const g = mkGoblin();
    const dagger = mintInstance("venom_dagger");
    ensureInventory(h).consumables.push(dagger);
    equipItem(mkWorld([h, g]), h, dagger);
    const w = mkWorld([h, g]);
    const events = doAttack(w, h, g);
    expect(events.some(e => e.type === "Hit")).toBe(true);
    expect(events.some(e => e.type === "OnHitTriggered")).toBe(true);
    expect(g.effects!.some(e => e.kind === "poison")).toBe(true);
  });

  it("fire_staff on_hit inflicts burning", () => {
    const h = mkHero();
    const g = mkGoblin();
    const staff = mintInstance("fire_staff");
    ensureInventory(h).consumables.push(staff);
    equipItem(mkWorld([h, g]), h, staff);
    const w = mkWorld([h, g]);
    const events = doAttack(w, h, g);
    expect(events.some(e => e.type === "OnHitTriggered")).toBe(true);
    expect(g.effects!.some(e => e.kind === "burning")).toBe(true);
  });

  it("no equipment → no on-hit proc", () => {
    const h = mkHero();
    const g = mkGoblin();
    const events = doAttack(mkWorld([h, g]), h, g);
    expect(events.some(e => e.type === "OnHitTriggered")).toBe(false);
  });

  it("bone_dagger (no on_hit) → no proc emitted", () => {
    const h = mkHero();
    const g = mkGoblin();
    const dagger = mintInstance("bone_dagger");
    ensureInventory(h).consumables.push(dagger);
    equipItem(mkWorld([h, g]), h, dagger);
    const events = doAttack(mkWorld([h, g]), h, g);
    expect(events.some(e => e.type === "OnHitTriggered")).toBe(false);
  });

  it("on-hit skipped when defender dies from the strike", () => {
    const h = mkHero();
    const g = mkGoblin({ hp: 1, def: 0 });
    const dagger = mintInstance("venom_dagger");
    ensureInventory(h).consumables.push(dagger);
    equipItem(mkWorld([h, g]), h, dagger);
    const events = doAttack(mkWorld([h, g]), h, g);
    expect(events.some(e => e.type === "Died")).toBe(true);
    expect(events.some(e => e.type === "OnHitTriggered")).toBe(false);
  });
});
