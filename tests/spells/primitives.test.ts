import { describe, it, expect } from "vitest";
import type { Actor, Room, World, GameEvent } from "../../src/types.js";
import { PRIMITIVES } from "../../src/spells/primitives.js";
import { hasEffect } from "../../src/effects.js";
import { script, cHalt } from "../../src/ast-helpers.js";

function mkWorld(actors: Actor[], room?: Partial<Room>): World {
  return {
    tick: 0,
    room: { w: 10, h: 10, doors: [], items: [], chests: [], clouds: [], ...room },
    actors, log: [], aborted: false, ended: false,
  };
}

function mkActor(over: Partial<Actor> & Pick<Actor, "id" | "kind" | "pos">): Actor {
  return {
    hp: over.hp ?? 20, maxHp: over.maxHp ?? 20, speed: 10, energy: 0,
    alive: true, script: script(cHalt()),
    mp: 20, maxMp: 20, atk: 1, def: 0, int: 0, effects: [],
    knownSpells: [],
    ...over,
  };
}

describe("primitives", () => {
  it("project scales damage with caster int", () => {
    const caster0 = mkActor({ id: "c0", kind: "hero", pos: { x: 0, y: 0 }, int: 0 });
    const caster5 = mkActor({ id: "c5", kind: "hero", pos: { x: 0, y: 0 }, int: 5 });
    const t0 = mkActor({ id: "t0", kind: "goblin", pos: { x: 1, y: 0 }, hp: 100, maxHp: 100 });
    const t5 = mkActor({ id: "t5", kind: "goblin", pos: { x: 1, y: 0 }, hp: 100, maxHp: 100 });
    const w0 = mkWorld([caster0, t0]);
    const w5 = mkWorld([caster5, t5]);
    PRIMITIVES.project.execute(w0, caster0, t0, { damage: 4 });
    PRIMITIVES.project.execute(w5, caster5, t5, { damage: 4 });
    expect(100 - t0.hp).toBe(4);   // int=0 → 4
    expect(100 - t5.hp).toBe(6);   // int=5 → floor(4*1.5)=6
  });

  it("inflict scales duration and shows via has_effect", () => {
    const caster = mkActor({ id: "c", kind: "hero", pos: { x: 0, y: 0 }, int: 10 });
    const tgt = mkActor({ id: "t", kind: "goblin", pos: { x: 1, y: 0 } });
    const w = mkWorld([caster, tgt]);
    PRIMITIVES.inflict.execute(w, caster, tgt, { kind: "burning", duration: 10 });
    expect(hasEffect(tgt, "burning")).toBe(true);
    const eff = (tgt.effects ?? []).find(e => e.kind === "burning")!;
    expect(eff.duration).toBe(20); // scale(10,10)
  });

  it("heal scales amount, clamped at maxHp", () => {
    const caster = mkActor({ id: "c", kind: "hero", pos: { x: 0, y: 0 }, int: 5 });
    const tgt = mkActor({ id: "t", kind: "hero", pos: { x: 0, y: 0 }, hp: 5, maxHp: 10 });
    const w = mkWorld([caster, tgt]);
    const events = PRIMITIVES.heal.execute(w, caster, tgt, { amount: 4 });
    // scale(4,5)=6; hp 5→10 (clamp), actual amount = 5
    expect(tgt.hp).toBe(10);
    const healed = events.find(e => e.type === "Healed") as any;
    expect(healed.amount).toBe(5);
  });

  it("spawn_cloud adds a cloud and emits CloudSpawned", () => {
    const caster = mkActor({ id: "c", kind: "hero", pos: { x: 0, y: 0 }, int: 0 });
    const w = mkWorld([caster]);
    const events = PRIMITIVES.spawn_cloud.execute(w, caster, { x: 3, y: 3 }, {
      kind: "fire", duration: 20, visual: "cloud_fire", element: "fire",
    });
    expect(w.room.clouds!.length).toBe(1);
    const c = w.room.clouds![0]!;
    expect(c.kind).toBe("fire");
    expect(c.pos).toEqual({ x: 3, y: 3 });
    expect(c.duration).toBe(20);
    const ev = events[0] as any;
    expect(ev.type).toBe("CloudSpawned");
    expect(ev.visual).toBe("cloud_fire");
    expect(ev.element).toBe("fire");
  });

  it("explode emits VisualBurst and hits actors in radius, no ActionFailed", () => {
    const caster = mkActor({ id: "c", kind: "hero", pos: { x: 0, y: 0 }, int: 0 });
    const victim = mkActor({ id: "v", kind: "goblin", pos: { x: 2, y: 2 }, hp: 20, maxHp: 20 });
    const w = mkWorld([caster, victim]);
    const events = PRIMITIVES.explode.execute(w, caster, { x: 2, y: 2 }, {
      radius: 2, damage: 5, visual: "explosion_fire", element: "fire",
    });
    expect(events.find(e => e.type === "ActionFailed")).toBeUndefined();
    const burst = events.find(e => e.type === "VisualBurst") as any;
    expect(burst.visual).toBe("explosion_fire");
    expect(burst.pos).toEqual({ x: 2, y: 2 });
    expect(events.find(e => e.type === "Hit")).toBeDefined();
    expect(victim.hp).toBe(15); // scale(5, 0)=5
  });

  it("compound sequencing: project + inflict runs in order", () => {
    // Simulate firebolt's body manually.
    const caster = mkActor({ id: "c", kind: "hero", pos: { x: 0, y: 0 }, int: 0 });
    const tgt = mkActor({ id: "t", kind: "goblin", pos: { x: 1, y: 0 }, hp: 10, maxHp: 10 });
    const w = mkWorld([caster, tgt]);
    const e1 = PRIMITIVES.project.execute(w, caster, tgt, { damage: 3 });
    const e2 = PRIMITIVES.inflict.execute(w, caster, tgt, { kind: "burning", duration: 30 });
    expect(tgt.hp).toBe(7);
    expect(hasEffect(tgt, "burning")).toBe(true);
    // Hit before EffectApplied.
    const all: GameEvent[] = [...e1, ...e2];
    const iHit = all.findIndex(e => e.type === "Hit");
    const iApp = all.findIndex(e => e.type === "EffectApplied");
    expect(iHit).toBeLessThan(iApp);
  });
});
