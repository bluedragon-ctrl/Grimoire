import { describe, it, expect } from "vitest";
import type { Actor } from "../../src/types.js";
import { castSpell } from "../../src/spells/cast.js";
import { script, cHalt } from "../../src/ast-helpers.js";
import { mkWorld, mkHero, mkGoblin } from "../helpers.js";

describe("castSpell validation", () => {
  it("unknown spell → ActionFailed with did-you-mean; no mana deducted", () => {
    const h = mkHero({ id: "h", pos: { x: 0, y: 0 } });
    const g = mkGoblin({ id: "g", pos: { x: 1, y: 0 } });
    const w = mkWorld([h, g]);
    const events = castSpell(w, h, "bolr", g);
    expect(events.length).toBe(1);
    const f = events[0] as any;
    expect(f.type).toBe("ActionFailed");
    expect(f.reason).toContain("Unknown spell 'bolr'");
    expect(f.reason).toContain("bolt");
    expect(h.mp).toBe(20);
  });

  it("unlearned spell → ActionFailed; no mana deducted", () => {
    const h = mkHero({ id: "h", pos: { x: 0, y: 0 }, knownSpells: ["heal"] });
    const g = mkGoblin({ id: "g", pos: { x: 1, y: 0 } });
    const w = mkWorld([h, g]);
    const events = castSpell(w, h, "bolt", g);
    expect((events[0] as any).reason).toContain("haven't learned");
    expect(h.mp).toBe(20);
  });

  it("wrong target type: bolt on ally / heal on enemy fail", () => {
    const h = mkHero({ id: "h", pos: { x: 0, y: 0 }, knownSpells: ["bolt", "heal"] });
    const ally = mkHero({ id: "h2", pos: { x: 1, y: 0 } });
    const g = mkGoblin({ id: "g", pos: { x: 1, y: 0 } });
    const w = mkWorld([h, ally, g]);
    const e1 = castSpell(w, h, "bolt", ally);
    expect((e1[0] as any).type).toBe("ActionFailed");
    const e2 = castSpell(w, h, "heal", g);
    expect((e2[0] as any).type).toBe("ActionFailed");
    expect(h.mp).toBe(20);
  });

  it("out of range → ActionFailed", () => {
    const h = mkHero({ id: "h", pos: { x: 0, y: 0 } });
    const g = mkGoblin({ id: "g", pos: { x: 9, y: 9 } }); // cheb=9, bolt range=6
    const w = mkWorld([h, g]);
    const events = castSpell(w, h, "bolt", g);
    expect((events[0] as any).reason).toContain("out of range");
    expect(h.mp).toBe(20);
  });

  it("insufficient mana → ActionFailed", () => {
    const h = mkHero({ id: "h", pos: { x: 0, y: 0 }, mp: 3, maxMp: 20 });
    const g = mkGoblin({ id: "g", pos: { x: 1, y: 0 } });
    const w = mkWorld([h, g]);
    const events = castSpell(w, h, "bolt", g);
    expect((events[0] as any).reason).toContain("Not enough mana");
    expect(h.mp).toBe(3);
  });

  it("successful bolt: deducts mana, deals damage, emits Cast + Hit", () => {
    const h = mkHero({ id: "h", pos: { x: 0, y: 0 } });
    const g = mkGoblin({ id: "g", pos: { x: 1, y: 0 } });
    const w = mkWorld([h, g]);
    const events = castSpell(w, h, "bolt", g);
    expect(h.mp).toBe(15);
    expect(g.hp).toBe(6); // int=0 → damage 4
    const types = events.map(e => e.type);
    expect(types).toContain("Cast");
    expect(types).toContain("Hit");
  });

  it("successful heal: restores hp, clamped at maxHp", () => {
    const h = mkHero({ id: "h", pos: { x: 0, y: 0 }, hp: 8, maxHp: 10 });
    const w = mkWorld([h]);
    const events = castSpell(w, h, "heal", h);
    expect(h.hp).toBe(10);
    const healed = events.find(e => e.type === "Healed") as any;
    expect(healed.amount).toBe(2);
    expect(h.mp).toBe(15);
  });

  it("failed cast does not cost energy (runs through engine)", async () => {
    const { runRoom } = await import("../../src/engine.js");
    const { call, lit, ident, exprStmt, while_ } = await import("../../src/ast-helpers.js");
    const hero: Actor = {
      id: "h", kind: "hero", isHero: true, hp: 20, maxHp: 20, speed: 12, energy: 0, alive: true,
      pos: { x: 0, y: 0 }, mp: 100, maxMp: 100, int: 0,
      knownSpells: ["bolt", "heal"],
      script: script(
        exprStmt(call("cast", lit("nope"), ident("me"))),
        exprStmt(call("cast", lit("nope"), ident("me"))),
        exprStmt(call("cast", lit("nope"), ident("me"))),
        cHalt(),
      ),
      effects: [],
    };
    const gob: Actor = {
      id: "g", kind: "goblin", hp: 5, maxHp: 5, speed: 10, energy: 0, alive: true,
      pos: { x: 5, y: 5 }, script: script(cHalt()), knownSpells: [], effects: [],
    };
    const { log } = runRoom({
      room: { w: 10, h: 10, doors: [], items: [], chests: [] },
      actors: [hero, gob],
    }, { maxTicks: 200 });
    const fails = log.filter(l => l.event.type === "ActionFailed" && (l.event as any).action === "cast");
    expect(fails.length).toBe(3);
    const firstFailTick = fails[0]!.t;
    const lastFailTick = fails[fails.length - 1]!.t;
    expect(lastFailTick - firstFailTick).toBeLessThan(5);
  });
});

// ─── blinded gate ──────────────────────────────────────────────────────────────

function withBlinded(a: Actor): Actor {
  a.effects = [...(a.effects ?? []), {
    id: "blinded-test", kind: "blinded", target: a.id,
    duration: 1, remaining: 1, tickEvery: 1,
  }];
  return a;
}

describe("blinded gate in castSpell", () => {
  it("blinded caster can still cast at adjacent target (Chebyshev 1)", () => {
    const h = withBlinded(mkHero({ id: "h", pos: { x: 0, y: 0 } }));
    const g = mkGoblin({ id: "g", pos: { x: 1, y: 0 } });
    const w = mkWorld([h, g]);
    const events = castSpell(w, h, "bolt", g);
    expect(events.some(e => e.type === "Hit")).toBe(true);
  });

  it("blinded caster cannot cast at target Chebyshev > 1", () => {
    const h = withBlinded(mkHero({ id: "h", pos: { x: 0, y: 0 } }));
    const g = mkGoblin({ id: "g", pos: { x: 3, y: 0 } });
    const w = mkWorld([h, g]);
    const events = castSpell(w, h, "bolt", g);
    expect(events[0]).toMatchObject({ type: "ActionFailed" });
    expect((events[0] as any).reason).toContain("blinded");
    expect(h.mp).toBe(20); // no mana spent
  });

  it("non-blinded caster can cast at range", () => {
    const h = mkHero({ id: "h", pos: { x: 0, y: 0 } });
    const g = mkGoblin({ id: "g", pos: { x: 3, y: 0 } });
    const w = mkWorld([h, g]);
    const events = castSpell(w, h, "bolt", g);
    expect(events.some(e => e.type === "Hit")).toBe(true);
  });
});

// ─── smoke LOS gate ────────────────────────────────────────────────────────────

describe("smoke LOS gate in castSpell", () => {
  it("smoke between caster and target blocks spell", () => {
    const h = mkHero({ id: "h", pos: { x: 0, y: 0 } });
    const g = mkGoblin({ id: "g", pos: { x: 3, y: 0 } });
    const smoke = { id: "c1", pos: { x: 1, y: 0 }, kind: "smoke" as const, duration: 20, remaining: 20 };
    const w = mkWorld([h, g], { clouds: [smoke] });
    const events = castSpell(w, h, "bolt", g);
    expect((events[0] as any).type).toBe("ActionFailed");
    expect((events[0] as any).reason).toContain("line of sight");
    expect(h.mp).toBe(20);
  });

  it("adjacent target is never blocked by smoke", () => {
    const h = mkHero({ id: "h", pos: { x: 0, y: 0 } });
    const g = mkGoblin({ id: "g", pos: { x: 1, y: 0 } });
    const smoke = { id: "c1", pos: { x: 1, y: 0 }, kind: "smoke" as const, duration: 20, remaining: 20 };
    const w = mkWorld([h, g], { clouds: [smoke] });
    const events = castSpell(w, h, "bolt", g);
    expect(events.some(e => e.type === "Hit")).toBe(true);
  });

  it("smoke on caster's own tile does not block ranged cast", () => {
    const h = mkHero({ id: "h", pos: { x: 0, y: 0 } });
    const g = mkGoblin({ id: "g", pos: { x: 3, y: 0 } });
    const smoke = { id: "c1", pos: { x: 0, y: 0 }, kind: "smoke" as const, duration: 20, remaining: 20 };
    const w = mkWorld([h, g], { clouds: [smoke] });
    const events = castSpell(w, h, "bolt", g);
    expect(events.some(e => e.type === "Hit")).toBe(true);
  });

  it("self-targeted spell ignores smoke", () => {
    const h = mkHero({ id: "h", pos: { x: 0, y: 0 }, hp: 5, knownSpells: ["heal"] });
    const smoke = { id: "c1", pos: { x: 1, y: 0 }, kind: "smoke" as const, duration: 20, remaining: 20 };
    const w = mkWorld([h], { clouds: [smoke] });
    const events = castSpell(w, h, "heal", h);
    expect(events.some(e => e.type === "Healed")).toBe(true);
  });
});
