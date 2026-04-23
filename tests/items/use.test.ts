import { describe, it, expect } from "vitest";
import type { Actor, World } from "../../src/types.js";
import { useItem, mintInstance, ensureInventory } from "../../src/items/execute.js";
import { emptyEquipped } from "../../src/content/items.js";
import { script, cHalt } from "../../src/ast-helpers.js";

function mkWorld(actors: Actor[]): World {
  return { tick: 0, room: { w: 5, h: 5, doors: [], items: [], chests: [], clouds: [] }, actors, log: [], aborted: false, ended: false };
}
function mkHero(over: Partial<Actor> = {}): Actor {
  return {
    id: "h", kind: "hero", hp: 10, maxHp: 20, speed: 12, energy: 0, alive: true,
    pos: { x: 0, y: 0 }, mp: 5, maxMp: 20, atk: 3, def: 0, int: 0,
    effects: [], knownSpells: ["bolt", "heal"],
    inventory: { consumables: [], equipped: emptyEquipped() },
    script: script(cHalt()), ...over,
  };
}

describe("useItem", () => {
  it("restores mp, removes from bag, emits ItemUsed", () => {
    const h = mkHero({ mp: 5, maxMp: 20 });
    const inst = mintInstance("mana_crystal");
    ensureInventory(h).consumables.push(inst);
    const w = mkWorld([h]);
    const events = useItem(w, h, inst);
    expect(h.mp).toBe(15);
    expect(h.inventory!.consumables.length).toBe(0);
    expect(events.some(e => e.type === "ItemUsed")).toBe(true);
  });
  it("apply regen via potion", () => {
    const h = mkHero();
    const inst = mintInstance("health_potion");
    ensureInventory(h).consumables.push(inst);
    const w = mkWorld([h]);
    const events = useItem(w, h, inst);
    expect(events.some(e => e.type === "EffectApplied" && (e as any).kind === "regen")).toBe(true);
    expect(h.effects!.some(e => e.kind === "regen")).toBe(true);
  });
  it("cleanse removes matching effects", () => {
    const h = mkHero({ effects: [
      { id: "e1", kind: "poison",  target: "h", duration: 20, remaining: 20, tickEvery: 15 },
      { id: "e2", kind: "burning", target: "h", duration: 20, remaining: 20, tickEvery: 10 },
      { id: "e3", kind: "haste",   target: "h", duration: 20, remaining: 20, tickEvery: 1 },
    ]});
    const inst = mintInstance("cleanse_potion");
    ensureInventory(h).consumables.push(inst);
    const w = mkWorld([h]);
    useItem(w, h, inst);
    const kinds = h.effects!.map(e => e.kind).sort();
    expect(kinds).toEqual(["haste"]);
  });
  it("failed: item not in bag → ActionFailed, bag unchanged", () => {
    const h = mkHero();
    const inst = mintInstance("health_potion");
    const w = mkWorld([h]);
    const events = useItem(w, h, inst);
    expect(events.length).toBe(1);
    expect((events[0] as any).type).toBe("ActionFailed");
    expect((events[0] as any).action).toBe("use");
  });
  it("wearable via use() → fails", () => {
    const h = mkHero();
    const inst = mintInstance("wooden_staff");
    ensureInventory(h).consumables.push(inst);
    const w = mkWorld([h]);
    const events = useItem(w, h, inst);
    expect((events[0] as any).type).toBe("ActionFailed");
  });

  it("use() via script builtin: costs 15 energy, runs through engine", async () => {
    const { runRoom } = await import("../../src/engine.js");
    const { call, lit, exprStmt } = await import("../../src/ast-helpers.js");
    const inst = mintInstance("mana_crystal");
    const hero: Actor = {
      id: "h", kind: "hero", hp: 20, maxHp: 20, speed: 12, energy: 0, alive: true,
      pos: { x: 0, y: 0 }, mp: 0, maxMp: 20, knownSpells: [],
      effects: [], inventory: { consumables: [inst], equipped: emptyEquipped() },
      script: script(
        exprStmt(call("use", lit("mana_crystal"))),
        cHalt(),
      ),
    } as any;
    const { log, world } = runRoom({
      room: { w: 5, h: 5, doors: [], items: [], chests: [] },
      actors: [hero],
    }, { maxTicks: 100 });
    const used = log.find(l => l.event.type === "ItemUsed");
    expect(used).toBeTruthy();
    const h2 = world.actors.find(a => a.id === "h")!;
    expect(h2.mp).toBe(10);
    expect(h2.inventory!.consumables.length).toBe(0);
  });

  it("failed use() refunds energy (mirror cast policy)", async () => {
    const { runRoom } = await import("../../src/engine.js");
    const { call, lit, exprStmt } = await import("../../src/ast-helpers.js");
    const hero: Actor = {
      id: "h", kind: "hero", hp: 20, maxHp: 20, speed: 12, energy: 0, alive: true,
      pos: { x: 0, y: 0 }, mp: 0, maxMp: 20, knownSpells: [],
      effects: [], inventory: { consumables: [], equipped: emptyEquipped() },
      script: script(
        exprStmt(call("use", lit("health_potion"))),
        exprStmt(call("use", lit("health_potion"))),
        exprStmt(call("use", lit("health_potion"))),
        cHalt(),
      ),
    } as any;
    const { log } = runRoom({
      room: { w: 5, h: 5, doors: [], items: [], chests: [] },
      actors: [hero],
    }, { maxTicks: 200 });
    const fails = log.filter(l => l.event.type === "ActionFailed" && (l.event as any).action === "use");
    expect(fails.length).toBe(3);
    const first = fails[0]!.t, last = fails[fails.length - 1]!.t;
    expect(last - first).toBeLessThan(5);
  });
});
