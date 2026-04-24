import { describe, it, expect } from "vitest";
import type { Actor, GameEvent, Room } from "../../src/types.js";
import { runRoom } from "../../src/engine.js";
import { applyEffect } from "../../src/effects.js";
import { script, while_, lit, cWait, cHalt } from "../../src/ast-helpers.js";

function emptyRoom(): Room {
  return { w: 10, h: 10, doors: [], items: [], chests: [] };
}

function hero(over: Partial<Actor> = {}): Actor {
  return {
    id: "h", kind: "hero", isHero: true, hp: 20, maxHp: 20, speed: 10, energy: 0,
    pos: { x: 0, y: 0 }, alive: true,
    script: script(while_(lit(true), [cWait()])),
    ...over,
  };
}

function types(log: { event: GameEvent }[]): string[] {
  return log.map(l => l.event.type);
}

// Helper: inject effect before scheduler starts by using onTick to fire once
// at tick 1. Cleaner: apply via a pre-run hook.
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

describe("effects — tick", () => {
  it("burning 50/10/1: exactly 5 EffectTick + 1 EffectExpired, hp -5", () => {
    const h = hero();
    const { log, world } = applyThenRun(
      h, (w) => applyEffect(w, "h", "burning", 50),
      { maxTicks: 200 },
    );
    const ticks = log.filter(l => l.event.type === "EffectTick" && (l.event as any).kind === "burning");
    const exps = log.filter(l => l.event.type === "EffectExpired" && (l.event as any).kind === "burning");
    expect(ticks.length).toBe(5);
    expect(exps.length).toBe(1);
    expect(world.actors[0]!.hp).toBe(15);
  });

  it("regen at full HP: no EffectTick events (SKIP design choice)", () => {
    const h = hero({ hp: 20, maxHp: 20 });
    const { log } = applyThenRun(
      h, (w) => applyEffect(w, "h", "regen", 50),
      { maxTicks: 200 },
    );
    const ticks = log.filter(l => l.event.type === "EffectTick" && (l.event as any).kind === "regen");
    expect(ticks.length).toBe(0);
    // But it still expires.
    const exps = log.filter(l => l.event.type === "EffectExpired");
    expect(exps.length).toBe(1);
  });

  it("regen brings hp back up over time, clamped at maxHp", () => {
    // hp=5 maxHp=10, magnitude=2, tickEvery=10, duration=50 → 10,20,30,40,50.
    // Ticks: 5→7→9→10 (clamp, healed=1)→skip→skip. 3 events, final hp=10.
    const h = hero({ hp: 5, maxHp: 10 });
    const { log, world } = applyThenRun(
      h, (w) => applyEffect(w, "h", "regen", 50),
      { maxTicks: 200 },
    );
    expect(world.actors[0]!.hp).toBe(10);
    const regenTicks = log.filter(l => l.event.type === "EffectTick" && (l.event as any).kind === "regen");
    expect(regenTicks.length).toBe(3);
    expect((regenTicks[0]!.event as any).magnitude).toBe(2);
    expect((regenTicks[1]!.event as any).magnitude).toBe(2);
    expect((regenTicks[2]!.event as any).magnitude).toBe(1);
  });

  it("burning can kill; remaining ticks don't fire after Died", () => {
    const h = hero({ hp: 3, maxHp: 10 });
    const { log } = applyThenRun(
      h, (w) => applyEffect(w, "h", "burning", 50),
      { maxTicks: 200 },
    );
    const burnTicks = log.filter(l => l.event.type === "EffectTick" && (l.event as any).kind === "burning");
    expect(burnTicks.length).toBe(3); // ticks 10, 20, 30 — then dies.
    expect(log.some(l => l.event.type === "Died" && (l.event as any).actor === "h")).toBe(true);
    expect(log.some(l => l.event.type === "HeroDied")).toBe(true);
    // No EffectExpired after death (effect still on actor but inert).
    const exps = log.filter(l => l.event.type === "EffectExpired");
    expect(exps.length).toBe(0);
  });

  it("burning + regen coexist: net damage per shared cadence", () => {
    // burning magnitude 1, regen magnitude 2, both tickEvery 10, duration 50.
    // Each tick 10/20/30/40/50: hp -1 then +2 (net +1) until clamp.
    // hp=15 maxHp=20: 15→16→17→18→19→20. End hp=20.
    const h = hero({ hp: 15, maxHp: 20 });
    const { world, log } = applyThenRun(
      h,
      (w) => {
        applyEffect(w, "h", "burning", 50);
        applyEffect(w, "h", "regen", 50);
      },
      { maxTicks: 200 },
    );
    expect(world.actors[0]!.hp).toBe(20);
    const burns = log.filter(l => l.event.type === "EffectTick" && (l.event as any).kind === "burning");
    const regens = log.filter(l => l.event.type === "EffectTick" && (l.event as any).kind === "regen");
    expect(burns.length).toBe(5);
    expect(regens.length).toBeGreaterThanOrEqual(1);
  });
});
