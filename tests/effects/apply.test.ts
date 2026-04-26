import { describe, it, expect } from "vitest";
import type { Actor, Room, World } from "../../src/types.js";
import { applyEffect, tickEffects } from "../../src/effects.js";
import { script, cHalt } from "../../src/ast-helpers.js";

function emptyRoom(): Room {
  return { w: 10, h: 10, doors: [], chests: [] };
}

function makeHero(over: Partial<Actor> = {}): Actor {
  return {
    id: "h", kind: "hero", hp: 20, maxHp: 20, speed: 10, energy: 0,
    pos: { x: 0, y: 0 }, alive: true,
    mp: 20, maxMp: 20, atk: 3, def: 0, int: 5,
    effects: [],
    script: script(cHalt()),
    ...over,
  };
}

function makeWorld(actors: Actor[]): World {
  return { tick: 0, room: emptyRoom(), actors, log: [], aborted: false, ended: false };
}

describe("effects — apply", () => {
  it("applyEffect emits EffectApplied and adds effect", () => {
    const hero = makeHero();
    const w = makeWorld([hero]);
    const evs = applyEffect(w, "h", "burning", 30);
    expect(evs.some(e => e.type === "EffectApplied" && e.kind === "burning")).toBe(true);
    expect(hero.effects!.length).toBe(1);
    expect(hero.effects![0]!.kind).toBe("burning");
    expect(hero.effects![0]!.remaining).toBe(30);
  });

  it("re-applying same kind refreshes duration to max of existing and new", () => {
    const hero = makeHero();
    const w = makeWorld([hero]);
    applyEffect(w, "h", "burning", 50);
    // Shorter new + longer existing → unchanged.
    applyEffect(w, "h", "burning", 20);
    expect(hero.effects!.length).toBe(1);
    expect(hero.effects![0]!.remaining).toBe(50);

    // Longer new → refresh.
    applyEffect(w, "h", "burning", 100);
    expect(hero.effects![0]!.remaining).toBe(100);
  });

  it("different kinds stack independently", () => {
    const hero = makeHero();
    const w = makeWorld([hero]);
    applyEffect(w, "h", "burning", 30);
    applyEffect(w, "h", "regen", 40);
    applyEffect(w, "h", "haste", 50);
    expect(hero.effects!.map(e => e.kind).sort()).toEqual(["burning", "haste", "regen"]);
  });

  it("applying to dead actor is a no-op", () => {
    const hero = makeHero({ alive: false, hp: 0 });
    const w = makeWorld([hero]);
    const evs = applyEffect(w, "h", "burning", 30);
    expect(evs).toEqual([]);
    expect(hero.effects!.length).toBe(0);
  });

  it("permanent effect (Infinity) never expires across 1000 ticks", () => {
    const hero = makeHero();
    const w = makeWorld([hero]);
    applyEffect(w, "h", "haste", Infinity);
    for (let i = 0; i < 1000; i++) tickEffects(w, hero);
    expect(hero.effects!.length).toBe(1);
    expect(hero.effects![0]!.kind).toBe("haste");
  });
});
