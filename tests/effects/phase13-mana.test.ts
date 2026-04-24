// Phase 13 mana effects: mana_regen, mana_burn.

import { describe, it, expect } from "vitest";
import type { Actor, GameEvent, Room } from "../../src/types.js";
import { runRoom } from "../../src/engine.js";
import { applyEffect } from "../../src/effects.js";
import { script, while_, lit, cWait } from "../../src/ast-helpers.js";

function emptyRoom(): Room {
  return { w: 10, h: 10, doors: [], items: [], chests: [] };
}

function waiter(over: Partial<Actor> = {}): Actor {
  return {
    id: "h", kind: "hero", isHero: true, hp: 20, maxHp: 20, speed: 10, energy: 0,
    pos: { x: 0, y: 0 }, alive: true,
    mp: 5, maxMp: 20,
    script: script(while_(lit(true), [cWait()])),
    ...over,
  };
}


function applyThenRun(
  actor: Actor,
  applyFn: (world: any) => void,
  opts: { maxTicks: number },
) {
  let applied = false;
  return runRoom({ room: emptyRoom(), actors: [actor] }, {
    maxTicks: opts.maxTicks,
    onTick: (w) => {
      if (!applied) { applyFn(w); applied = true; }
    },
  });
}

function manaChangedEvents(log: { event: GameEvent }[]): GameEvent[] {
  return log.map(l => l.event).filter(e => e.type === "ManaChanged");
}

// ── mana_regen ────────────────────────────────────────────────────────────────

describe("mana_regen", () => {
  it("restores mp per tick, emits ManaChanged", () => {
    const h = waiter({ mp: 0, maxMp: 10 });
    const { log, world } = applyThenRun(
      h, (w) => applyEffect(w, "h", "mana_regen", 50, { magnitude: 2 }),
      { maxTicks: 200 },
    );
    const manaEvs = manaChangedEvents(log);
    expect(manaEvs.length).toBeGreaterThan(0);
    // All ManaChanged amounts are positive (mana gained)
    expect(manaEvs.every(e => (e as any).amount > 0)).toBe(true);
    // Final mp is clamped at maxMp
    expect(world.actors[0]!.mp).toBeLessThanOrEqual(10);
    expect(world.actors[0]!.mp).toBe(10);
  });

  it("mana_regen at full mp: no EffectTick events", () => {
    const h = waiter({ mp: 10, maxMp: 10 });
    const { log } = applyThenRun(
      h, (w) => applyEffect(w, "h", "mana_regen", 50),
      { maxTicks: 200 },
    );
    const ticks = log.filter(l => l.event.type === "EffectTick" && (l.event as any).kind === "mana_regen");
    expect(ticks.length).toBe(0);
    // But the effect still expires
    const exps = log.filter(l => l.event.type === "EffectExpired" && (l.event as any).kind === "mana_regen");
    expect(exps.length).toBe(1);
  });

  it("mana_regen does not exceed maxMp", () => {
    // mp=18, maxMp=20, magnitude=5 → first tick: +2 (clamped), then full → skip
    const h = waiter({ mp: 18, maxMp: 20 });
    const { world } = applyThenRun(
      h, (w) => applyEffect(w, "h", "mana_regen", 50, { magnitude: 5 }),
      { maxTicks: 200 },
    );
    expect(world.actors[0]!.mp).toBe(20);
  });

  it("stacking refreshes duration", () => {
    const h = waiter({ mp: 0, maxMp: 10 });
    const w = { tick: 0, room: emptyRoom(), actors: [h], log: [], aborted: false, ended: false };
    applyEffect(w, "h", "mana_regen", 50);
    applyEffect(w, "h", "mana_regen", 20);
    expect(h.effects!.length).toBe(1);
    expect(h.effects![0]!.remaining).toBe(50); // max(50, 20)
  });

  it("expires and emits EffectExpired", () => {
    const h = waiter({ mp: 10, maxMp: 10 }); // full mp so no ticks, just expiry
    const { log } = applyThenRun(
      h, (w) => applyEffect(w, "h", "mana_regen", 10),
      { maxTicks: 100 },
    );
    expect(log.some(l => l.event.type === "EffectExpired" && (l.event as any).kind === "mana_regen")).toBe(true);
  });
});

// ── mana_burn ─────────────────────────────────────────────────────────────────

describe("mana_burn", () => {
  it("drains mp per tick, emits ManaChanged with negative amount", () => {
    // mp=10, magnitude=2, duration=50, tickEvery=10 → 5 ticks × 2 = 10 drained → 0
    const h = waiter({ mp: 10, maxMp: 20 });
    const { log, world } = applyThenRun(
      h, (w) => applyEffect(w, "h", "mana_burn", 50, { magnitude: 2 }),
      { maxTicks: 200 },
    );
    const manaEvs = manaChangedEvents(log);
    expect(manaEvs.length).toBeGreaterThan(0);
    expect(manaEvs.every(e => (e as any).amount < 0)).toBe(true);
    expect(world.actors[0]!.mp).toBe(0);
  });

  it("mana_burn at mp=0: no EffectTick events", () => {
    const h = waiter({ mp: 0, maxMp: 20 });
    const { log } = applyThenRun(
      h, (w) => applyEffect(w, "h", "mana_burn", 50),
      { maxTicks: 200 },
    );
    const ticks = log.filter(l => l.event.type === "EffectTick" && (l.event as any).kind === "mana_burn");
    expect(ticks.length).toBe(0);
    const exps = log.filter(l => l.event.type === "EffectExpired" && (l.event as any).kind === "mana_burn");
    expect(exps.length).toBe(1);
  });

  it("mana_burn never drains mp below 0", () => {
    const h = waiter({ mp: 3, maxMp: 20 });
    const { world } = applyThenRun(
      h, (w) => applyEffect(w, "h", "mana_burn", 50, { magnitude: 10 }),
      { maxTicks: 200 },
    );
    expect(world.actors[0]!.mp).toBe(0);
  });

  it("stacking refreshes duration", () => {
    const h = waiter({ mp: 10, maxMp: 10 });
    const w = { tick: 0, room: emptyRoom(), actors: [h], log: [], aborted: false, ended: false };
    applyEffect(w, "h", "mana_burn", 50);
    applyEffect(w, "h", "mana_burn", 80);
    expect(h.effects!.length).toBe(1);
    expect(h.effects![0]!.remaining).toBe(80); // max(50, 80)
  });

  it("expires and emits EffectExpired", () => {
    const h = waiter({ mp: 0, maxMp: 20 }); // no ticks, just expiry
    const { log } = applyThenRun(
      h, (w) => applyEffect(w, "h", "mana_burn", 10),
      { maxTicks: 100 },
    );
    expect(log.some(l => l.event.type === "EffectExpired" && (l.event as any).kind === "mana_burn")).toBe(true);
  });
});
