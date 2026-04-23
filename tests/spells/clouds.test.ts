import { describe, it, expect } from "vitest";
import type { Actor, World, Cloud } from "../../src/types.js";
import { tickClouds } from "../../src/clouds.js";
import { hasEffect, effectiveStats } from "../../src/effects.js";
import { script, cHalt } from "../../src/ast-helpers.js";

function mkWorld(actors: Actor[], clouds: Cloud[] = []): World {
  return {
    tick: 0,
    room: { w: 10, h: 10, doors: [], items: [], chests: [], clouds },
    actors, log: [], aborted: false, ended: false,
  };
}
function mkActor(over: Partial<Actor> & Pick<Actor, "id" | "kind" | "pos">): Actor {
  return {
    hp: 20, maxHp: 20, speed: 10, energy: 0, alive: true,
    script: script(cHalt()),
    mp: 0, maxMp: 0, atk: 1, def: 0, int: 0, effects: [], knownSpells: [],
    ...over,
  };
}

describe("clouds", () => {
  it("fire cloud applies burning to actor on tile", () => {
    const a = mkActor({ id: "a", kind: "hero", pos: { x: 3, y: 3 } });
    const cloud: Cloud = { id: "c1", pos: { x: 3, y: 3 }, kind: "fire", duration: 20, remaining: 20 };
    const w = mkWorld([a], [cloud]);
    const ev = tickClouds(w);
    expect(hasEffect(a, "burning")).toBe(true);
    expect(ev.some(e => e.type === "CloudTicked" && (e as any).appliedTo.includes("a"))).toBe(true);
    // Move off — cloud still ticks but doesn't re-apply.
    a.pos = { x: 5, y: 5 };
    const ev2 = tickClouds(w);
    expect(ev2.some(e => e.type === "CloudTicked")).toBe(false);
  });

  it("frost cloud applies slow; speed halves while on tile", () => {
    const a = mkActor({ id: "a", kind: "hero", pos: { x: 1, y: 1 }, speed: 10 });
    const cloud: Cloud = { id: "c2", pos: { x: 1, y: 1 }, kind: "frost", duration: 10, remaining: 10 };
    const w = mkWorld([a], [cloud]);
    tickClouds(w);
    expect(hasEffect(a, "slow")).toBe(true);
    expect(effectiveStats(a).speed).toBe(5); // 10 * 0.5
  });

  it("cloud expires after remaining reaches 0; emits CloudExpired", () => {
    const a = mkActor({ id: "a", kind: "hero", pos: { x: 0, y: 0 } });
    const cloud: Cloud = { id: "c3", pos: { x: 9, y: 9 }, kind: "fire", duration: 2, remaining: 2 };
    const w = mkWorld([a], [cloud]);
    tickClouds(w);                 // remaining 2 → 1
    expect(w.room.clouds!.length).toBe(1);
    const ev = tickClouds(w);      // remaining 1 → 0 → expire
    expect(w.room.clouds!.length).toBe(0);
    expect(ev.some(e => e.type === "CloudExpired" && (e as any).id === "c3")).toBe(true);
  });

  it("two clouds on same tile both tick and apply independently", () => {
    const a = mkActor({ id: "a", kind: "hero", pos: { x: 2, y: 2 } });
    const cFire: Cloud = { id: "cf", pos: { x: 2, y: 2 }, kind: "fire", duration: 10, remaining: 10 };
    const cFrost: Cloud = { id: "cc", pos: { x: 2, y: 2 }, kind: "frost", duration: 10, remaining: 10 };
    const w = mkWorld([a], [cFire, cFrost]);
    const ev = tickClouds(w);
    expect(hasEffect(a, "burning")).toBe(true);
    expect(hasEffect(a, "slow")).toBe(true);
    const ticks = ev.filter(e => e.type === "CloudTicked");
    expect(ticks.length).toBe(2);
  });
});
