// Phase 13 passive stat effects: chill, shock, expose, might, iron_skin, power.
// These are all modifier-only effects (no onTick) — effectiveStats folds them
// in, and expose is applied at damage-resolve time in doAttack.

import { describe, it, expect } from "vitest";
import type { Actor, Room, World } from "../../src/types.js";
import { applyEffect, effectiveStats, tickEffects } from "../../src/effects.js";
import { doAttack } from "../../src/commands.js";
import { script, cHalt } from "../../src/ast-helpers.js";

function emptyRoom(): Room {
  return { w: 10, h: 10, doors: [], items: [], chests: [] };
}

function makeActor(over: Partial<Actor> = {}): Actor {
  return {
    id: "a", kind: "hero", hp: 20, maxHp: 20, speed: 10, energy: 0,
    pos: { x: 0, y: 0 }, alive: true,
    mp: 20, maxMp: 20, atk: 5, def: 3, int: 5,
    effects: [],
    script: script(cHalt()),
    ...over,
  };
}

function makeWorld(actors: Actor[]): World {
  return { tick: 0, room: emptyRoom(), actors, log: [], aborted: false, ended: false };
}

// ── chill ─────────────────────────────────────────────────────────────────────

describe("chill", () => {
  it("reduces atk and speed by magnitude%", () => {
    const actor = makeActor({ atk: 10, speed: 10 });
    const w = makeWorld([actor]);
    applyEffect(w, "a", "chill", 30, { magnitude: 20 }); // 20% reduction
    const s = effectiveStats(actor);
    expect(s.atk).toBe(8);   // floor(10 * 0.8)
    expect(s.speed).toBe(8); // floor(10 * 0.8)
  });

  it("40% chill clamps atk via floor", () => {
    const actor = makeActor({ atk: 5, speed: 10 });
    const w = makeWorld([actor]);
    applyEffect(w, "a", "chill", 30, { magnitude: 40 });
    const s = effectiveStats(actor);
    expect(s.atk).toBe(3);   // floor(5 * 0.6)
    expect(s.speed).toBe(6); // floor(10 * 0.6)
  });

  it("stacking refreshes duration; first-write-wins on magnitude", () => {
    const actor = makeActor({ atk: 10, speed: 10 });
    const w = makeWorld([actor]);
    applyEffect(w, "a", "chill", 50, { magnitude: 20 });
    applyEffect(w, "a", "chill", 20, { magnitude: 40 }); // shorter new, smaller wins
    expect(actor.effects!.length).toBe(1);
    expect(actor.effects![0]!.remaining).toBe(50); // max(50,20)
    expect(actor.effects![0]!.magnitude).toBe(20); // first-write-wins
  });

  it("expires and effect is removed", () => {
    const actor = makeActor();
    const w = makeWorld([actor]);
    applyEffect(w, "a", "chill", 2, { magnitude: 20 });
    for (let i = 0; i < 5; i++) tickEffects(w, actor);
    expect(actor.effects!.length).toBe(0);
  });

  it("chill + haste: multipliers compose", () => {
    // haste ×1.5, chill ×0.8 → ×1.2, floor(10 × 1.2) = 12
    const actor = makeActor({ speed: 10 });
    const w = makeWorld([actor]);
    applyEffect(w, "a", "chill", 30, { magnitude: 20 });
    applyEffect(w, "a", "haste", 30);
    const s = effectiveStats(actor);
    expect(s.speed).toBe(12);
  });
});

// ── shock ─────────────────────────────────────────────────────────────────────

describe("shock", () => {
  it("reduces def by magnitude flat", () => {
    const actor = makeActor({ def: 10 });
    const w = makeWorld([actor]);
    applyEffect(w, "a", "shock", 30, { magnitude: 4 });
    const s = effectiveStats(actor);
    expect(s.def).toBe(6);
  });

  it("shock beyond def clamps at 0", () => {
    const actor = makeActor({ def: 3 });
    const w = makeWorld([actor]);
    applyEffect(w, "a", "shock", 30, { magnitude: 10 });
    const s = effectiveStats(actor);
    expect(s.def).toBe(0);
  });

  it("stacking refreshes duration; first-write-wins on magnitude", () => {
    const actor = makeActor({ def: 10 });
    const w = makeWorld([actor]);
    applyEffect(w, "a", "shock", 50, { magnitude: 4 });
    applyEffect(w, "a", "shock", 80, { magnitude: 8 }); // longer new duration
    expect(actor.effects!.length).toBe(1);
    expect(actor.effects![0]!.remaining).toBe(80); // max(50,80)
    expect(actor.effects![0]!.magnitude).toBe(4);  // first-write-wins
  });

  it("expires and effect is removed", () => {
    const actor = makeActor();
    const w = makeWorld([actor]);
    applyEffect(w, "a", "shock", 2, { magnitude: 4 });
    for (let i = 0; i < 5; i++) tickEffects(w, actor);
    expect(actor.effects!.length).toBe(0);
  });
});

// ── might ─────────────────────────────────────────────────────────────────────

describe("might", () => {
  it("adds flat atk bonus", () => {
    const actor = makeActor({ atk: 5 });
    const w = makeWorld([actor]);
    applyEffect(w, "a", "might", 30, { magnitude: 4 });
    const s = effectiveStats(actor);
    expect(s.atk).toBe(9);
  });

  it("might stacks atk on top of equipment bonus before chill-mul", () => {
    const actor = makeActor({ atk: 10 });
    const w = makeWorld([actor]);
    applyEffect(w, "a", "might", 30, { magnitude: 5 });
    applyEffect(w, "a", "chill", 30, { magnitude: 20 }); // 20% reduction
    const s = effectiveStats(actor);
    // atk = floor((10 + 5) * 0.8) = floor(12) = 12
    expect(s.atk).toBe(12);
  });

  it("stacking refreshes duration; first-write-wins on magnitude", () => {
    const actor = makeActor();
    const w = makeWorld([actor]);
    applyEffect(w, "a", "might", 50, { magnitude: 4 });
    applyEffect(w, "a", "might", 50, { magnitude: 10 });
    expect(actor.effects![0]!.magnitude).toBe(4);
  });
});

// ── iron_skin ─────────────────────────────────────────────────────────────────

describe("iron_skin", () => {
  it("adds flat def bonus", () => {
    const actor = makeActor({ def: 2 });
    const w = makeWorld([actor]);
    applyEffect(w, "a", "iron_skin", 30, { magnitude: 5 });
    const s = effectiveStats(actor);
    expect(s.def).toBe(7);
  });

  it("iron_skin and shock compose: deltas sum before clamp", () => {
    const actor = makeActor({ def: 5 });
    const w = makeWorld([actor]);
    applyEffect(w, "a", "iron_skin", 30, { magnitude: 3 });
    applyEffect(w, "a", "shock", 30, { magnitude: 6 });
    const s = effectiveStats(actor);
    // def = max(0, 5 + 3 - 6) = 2
    expect(s.def).toBe(2);
  });
});

// ── power ─────────────────────────────────────────────────────────────────────

describe("power", () => {
  it("adds flat int bonus", () => {
    const actor = makeActor({ int: 5 });
    const w = makeWorld([actor]);
    applyEffect(w, "a", "power", 30, { magnitude: 4 });
    const s = effectiveStats(actor);
    expect(s.int).toBe(9);
  });

  it("stacking refreshes duration; first-write-wins on magnitude", () => {
    const actor = makeActor();
    const w = makeWorld([actor]);
    applyEffect(w, "a", "power", 50, { magnitude: 4 });
    applyEffect(w, "a", "power", 50, { magnitude: 10 });
    expect(actor.effects![0]!.magnitude).toBe(4);
  });
});

// ── expose ────────────────────────────────────────────────────────────────────

describe("expose", () => {
  it("multiplies incoming physical damage in doAttack", () => {
    const attacker = makeActor({ id: "att", atk: 10, pos: { x: 0, y: 0 } });
    const defender = makeActor({ id: "def", hp: 100, def: 0, pos: { x: 1, y: 0 } });
    const w = makeWorld([attacker, defender]);
    applyEffect(w, "def", "expose", 30, { magnitude: 25 }); // +25%
    doAttack(w, attacker, defender);
    // floor(10 * 1.25) = 12
    expect(defender.hp).toBe(88);
  });

  it("expose 50% doubles damage", () => {
    const attacker = makeActor({ id: "att", atk: 6, pos: { x: 0, y: 0 } });
    const defender = makeActor({ id: "def", hp: 100, def: 0, pos: { x: 1, y: 0 } });
    const w = makeWorld([attacker, defender]);
    applyEffect(w, "def", "expose", 30, { magnitude: 50 });
    doAttack(w, attacker, defender);
    // floor(6 * 1.5) = 9
    expect(defender.hp).toBe(91);
  });

  it("no expose: normal damage", () => {
    const attacker = makeActor({ id: "att", atk: 8, pos: { x: 0, y: 0 } });
    const defender = makeActor({ id: "def", hp: 100, def: 0, pos: { x: 1, y: 0 } });
    const w = makeWorld([attacker, defender]);
    doAttack(w, attacker, defender);
    expect(defender.hp).toBe(92);
  });

  it("expose emits EffectApplied on apply, expires after duration", () => {
    const actor = makeActor();
    const w = makeWorld([actor]);
    const evs = applyEffect(w, "a", "expose", 3, { magnitude: 25 });
    expect(evs.some(e => e.type === "EffectApplied")).toBe(true);
    for (let i = 0; i < 10; i++) tickEffects(w, actor);
    expect(actor.effects!.length).toBe(0);
  });
});
