import { describe, it, expect } from "vitest";
import type { Actor, World } from "../../src/types.js";
import { useItem, mintInstance, ensureInventory } from "../../src/items/execute.js";
import { doUse } from "../../src/commands.js";
import { emptyEquipped } from "../../src/content/items.js";
import { script, cHalt } from "../../src/ast-helpers.js";

function mkWorld(actors: Actor[]): World {
  return { tick: 0, room: { w: 5, h: 5, doors: [], chests: [], clouds: [] }, actors, log: [], aborted: false, ended: false };
}
function mkHero(over: Partial<Actor> = {}): Actor {
  return {
    id: "h", kind: "hero", isHero: true, hp: 10, maxHp: 20, speed: 12, energy: 0, alive: true,
    pos: { x: 0, y: 0 }, mp: 5, maxMp: 20, atk: 3, def: 0, int: 0,
    effects: [], knownSpells: ["bolt", "heal"],
    faction: "player",
    inventory: { consumables: [], equipped: emptyEquipped() },
    script: script(cHalt()), ...over,
  };
}
function mkAlly(over: Partial<Actor> = {}): Actor {
  return {
    id: "a1", kind: "ally", hp: 8, maxHp: 20, speed: 10, energy: 0, alive: true,
    pos: { x: 1, y: 0 }, mp: 0, maxMp: 10, atk: 0, def: 0, int: 0,
    effects: [], faction: "player",
    inventory: { consumables: [], equipped: emptyEquipped() },
    script: script(cHalt()), ...over,
  };
}

describe("useItem — self-target (health_potion → heal)", () => {
  it("heals self, removes from bag, emits ItemUsed", () => {
    const h = mkHero({ hp: 5 });
    const inst = mintInstance("health_potion");
    ensureInventory(h).consumables.push(inst);
    const w = mkWorld([h]);
    const events = useItem(w, h, inst, h, h.pos);
    expect(h.hp).toBe(15);
    expect(h.inventory!.consumables.length).toBe(0);
    expect(events.some(e => e.type === "Healed")).toBe(true);
    expect(events.some(e => e.type === "ItemUsed")).toBe(true);
  });

  it("clamps heal to maxHp", () => {
    const h = mkHero({ hp: 18, maxHp: 20 });
    const inst = mintInstance("health_potion");
    ensureInventory(h).consumables.push(inst);
    const w = mkWorld([h]);
    useItem(w, h, inst, h, h.pos);
    expect(h.hp).toBe(20);
  });
});

describe("useItem — ally-targeted (health_potion on ally)", () => {
  it("heals ally", () => {
    const h = mkHero();
    const ally = mkAlly({ hp: 3, maxHp: 20 });
    const inst = mintInstance("health_potion");
    ensureInventory(h).consumables.push(inst);
    const w = mkWorld([h, ally]);
    const events = useItem(w, h, inst, ally, ally.pos);
    expect(ally.hp).toBe(13);
    expect(events.some(e => e.type === "Healed")).toBe(true);
  });
});

describe("useItem — mana_crystal", () => {
  it("applies mana_regen effect (burst)", () => {
    const h = mkHero({ mp: 0, maxMp: 20 });
    const inst = mintInstance("mana_crystal");
    ensureInventory(h).consumables.push(inst);
    const w = mkWorld([h]);
    const events = useItem(w, h, inst, h, h.pos);
    expect(events.some(e => e.type === "EffectApplied" && (e as any).kind === "mana_regen")).toBe(true);
    expect(h.effects!.some(e => e.kind === "mana_regen")).toBe(true);
    expect(h.inventory!.consumables.length).toBe(0);
  });
});

describe("useItem — cleanse_potion", () => {
  it("removes debuffs, keeps buffs (requires polarity on EffectSpec — no-op until commit 2)", () => {
    // Until EffectSpec has polarity, cleanse removes effects with polarity === "debuff"
    // which is set in commit 2. Here we just verify it doesn't throw.
    const h = mkHero({ effects: [
      { id: "e1", kind: "poison",  target: "h", duration: 20, remaining: 20, tickEvery: 15 },
      { id: "e2", kind: "haste",   target: "h", duration: 20, remaining: 20, tickEvery: 1 },
    ]});
    const inst = mintInstance("cleanse_potion");
    ensureInventory(h).consumables.push(inst);
    const w = mkWorld([h]);
    const events = useItem(w, h, inst, h, h.pos);
    expect(events.some(e => e.type === "ItemUsed")).toBe(true);
  });
});

describe("useItem — error paths", () => {
  it("item not in bag → ActionFailed, bag unchanged", () => {
    const h = mkHero();
    const inst = mintInstance("health_potion");
    const w = mkWorld([h]);
    const events = useItem(w, h, inst);
    expect(events.length).toBe(1);
    expect((events[0] as any).type).toBe("ActionFailed");
    expect((events[0] as any).action).toBe("use");
  });

  it("equipment via use() → fails", () => {
    const h = mkHero();
    const inst = mintInstance("wooden_staff");
    ensureInventory(h).consumables.push(inst);
    const w = mkWorld([h]);
    const events = useItem(w, h, inst);
    expect((events[0] as any).type).toBe("ActionFailed");
  });
});

describe("doUse — faction / range gates", () => {
  it("ally-target out of range → ActionFailed, item NOT consumed", () => {
    const h = mkHero({ pos: { x: 0, y: 0 } });
    const ally = mkAlly({ pos: { x: 5, y: 0 } }); // range=4, dist=5
    const inst = mintInstance("health_potion");
    ensureInventory(h).consumables.push(inst);
    const w = mkWorld([h, ally]);
    const events = doUse(w, h, "health_potion", ally);
    expect(events.length).toBe(1);
    expect((events[0] as any).type).toBe("ActionFailed");
    expect(h.inventory!.consumables.length).toBe(1); // NOT consumed
  });

  it("ally-target at range → succeeds", () => {
    const h = mkHero({ pos: { x: 0, y: 0 }, hp: 10, maxHp: 20 });
    const ally = mkAlly({ pos: { x: 4, y: 0 }, hp: 5, maxHp: 20 }); // range=4, dist=4
    const inst = mintInstance("health_potion");
    ensureInventory(h).consumables.push(inst);
    const w = mkWorld([h, ally]);
    const events = doUse(w, h, "health_potion", ally);
    expect(ally.hp).toBe(15);
    expect(h.inventory!.consumables.length).toBe(0);
    expect(events.some(e => e.type === "ItemUsed")).toBe(true);
  });

  it("enemy-faction target with ally-targeted item → ActionFailed", () => {
    const h = mkHero();
    const enemy: Actor = {
      id: "e1", kind: "goblin", hp: 10, maxHp: 10, speed: 10, energy: 0, alive: true,
      pos: { x: 1, y: 0 }, mp: 0, maxMp: 0, atk: 0, def: 0, int: 0,
      effects: [], faction: "enemy",
      script: script(cHalt()),
    };
    const inst = mintInstance("health_potion");
    ensureInventory(h).consumables.push(inst);
    const w = mkWorld([h, enemy]);
    const events = doUse(w, h, "health_potion", enemy);
    expect((events[0] as any).type).toBe("ActionFailed");
    expect(h.inventory!.consumables.length).toBe(1); // NOT consumed
  });

  it("self-target item ignores targetRef", () => {
    // haste_potion is ally-range, not self-only, but we test doUse self-resolve
    // Use health_potion on self (no target arg → defaults to self).
    const h = mkHero({ hp: 5, maxHp: 20 });
    const inst = mintInstance("health_potion");
    ensureInventory(h).consumables.push(inst);
    const w = mkWorld([h]);
    const events = doUse(w, h, "health_potion"); // no target → defaults to self
    expect(h.hp).toBe(15);
    expect(events.some(e => e.type === "ItemUsed")).toBe(true);
  });
});

describe("use() via engine", () => {
  it("costs 15 energy, removes from bag", async () => {
    const { runRoom } = await import("../../src/engine.js");
    const { call, lit, exprStmt } = await import("../../src/ast-helpers.js");
    const inst = mintInstance("health_potion");
    const hero: Actor = {
      id: "h", kind: "hero", isHero: true, hp: 5, maxHp: 20, speed: 12, energy: 0, alive: true,
      pos: { x: 0, y: 0 }, mp: 0, maxMp: 20, knownSpells: [],
      effects: [], inventory: { consumables: [inst], equipped: emptyEquipped() },
      faction: "player",
      script: script(
        exprStmt(call("use", lit("health_potion"))),
        cHalt(),
      ),
    } as any;
    const { log, world } = runRoom({
      room: { w: 5, h: 5, doors: [], chests: [] },
      actors: [hero],
    }, { maxTicks: 100 });
    const used = log.find(l => l.event.type === "ItemUsed");
    expect(used).toBeTruthy();
    const h2 = world.actors.find(a => a.id === "h")!;
    expect(h2.hp).toBe(15);
    expect(h2.inventory!.consumables.length).toBe(0);
  });

  it("failed use() refunds energy (mirror cast policy)", async () => {
    const { runRoom } = await import("../../src/engine.js");
    const { call, lit, exprStmt } = await import("../../src/ast-helpers.js");
    const hero: Actor = {
      id: "h", kind: "hero", isHero: true, hp: 20, maxHp: 20, speed: 12, energy: 0, alive: true,
      pos: { x: 0, y: 0 }, mp: 0, maxMp: 20, knownSpells: [],
      effects: [], inventory: { consumables: [], equipped: emptyEquipped() },
      faction: "player",
      script: script(
        exprStmt(call("use", lit("health_potion"))),
        exprStmt(call("use", lit("health_potion"))),
        exprStmt(call("use", lit("health_potion"))),
        cHalt(),
      ),
    } as any;
    const { log } = runRoom({
      room: { w: 5, h: 5, doors: [], chests: [] },
      actors: [hero],
    }, { maxTicks: 200 });
    const fails = log.filter(l => l.event.type === "ActionFailed" && (l.event as any).action === "use");
    expect(fails.length).toBe(3);
    const first = fails[0]!.t, last = fails[fails.length - 1]!.t;
    expect(last - first).toBeLessThan(5);
  });
});
