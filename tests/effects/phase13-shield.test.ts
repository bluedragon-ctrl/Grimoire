// Phase 13 shield mechanic: damage absorption pool, expiry, stacking.

import { describe, it, expect } from "vitest";
import type { Actor, GameEvent, Room, World } from "../../src/types.js";
import { applyEffect, tickEffects } from "../../src/effects.js";
import { doAttack } from "../../src/commands.js";
import { script, cHalt } from "../../src/ast-helpers.js";

function emptyRoom(): Room {
  return { w: 10, h: 10, doors: [], items: [], chests: [] };
}

function makeActor(over: Partial<Actor> = {}): Actor {
  return {
    id: "a", kind: "hero", hp: 20, maxHp: 20, speed: 10, energy: 0,
    pos: { x: 0, y: 0 }, alive: true,
    mp: 10, maxMp: 10, atk: 5, def: 0,
    effects: [],
    script: script(cHalt()),
    ...over,
  };
}

function makeWorld(actors: Actor[]): World {
  return { tick: 0, room: emptyRoom(), actors, log: [], aborted: false, ended: false };
}

// ── apply / pool management ────────────────────────────────────────────────────

describe("shield — apply", () => {
  it("applyEffect sets shieldHp to magnitude", () => {
    const actor = makeActor();
    const w = makeWorld([actor]);
    applyEffect(w, "a", "shield", 50, { magnitude: 10 });
    expect(actor.shieldHp).toBe(10);
    expect(actor.effects!.length).toBe(1);
    expect(actor.effects![0]!.kind).toBe("shield");
  });

  it("emits EffectApplied on first apply", () => {
    const actor = makeActor();
    const w = makeWorld([actor]);
    const evs = applyEffect(w, "a", "shield", 50, { magnitude: 10 });
    expect(evs.some(e => e.type === "EffectApplied" && (e as any).kind === "shield")).toBe(true);
  });
});

// ── damage absorption ──────────────────────────────────────────────────────────

describe("shield — damage absorption in doAttack", () => {
  it("shield absorbs damage before hp, partial absorption leaves overflow in hp", () => {
    const attacker = makeActor({ id: "att", atk: 8, pos: { x: 0, y: 0 } });
    const defender = makeActor({ id: "def", hp: 20, pos: { x: 1, y: 0 } });
    const w = makeWorld([attacker, defender]);
    applyEffect(w, "def", "shield", 50, { magnitude: 5 });

    const events = doAttack(w, attacker, defender);
    // 8 dmg, 5 shield → 5 absorbed, 3 hits hp
    expect(defender.shieldHp).toBe(0);
    expect(defender.hp).toBe(17);

    const hit = events.find(e => e.type === "Hit") as Extract<GameEvent, { type: "Hit" }> | undefined;
    expect(hit).toBeDefined();
    expect(hit!.damage).toBe(3);
    expect(hit!.shieldAbsorbed).toBe(5);
  });

  it("shield fully absorbs small hit — no hp damage", () => {
    const attacker = makeActor({ id: "att", atk: 3, pos: { x: 0, y: 0 } });
    const defender = makeActor({ id: "def", hp: 20, pos: { x: 1, y: 0 } });
    const w = makeWorld([attacker, defender]);
    applyEffect(w, "def", "shield", 50, { magnitude: 10 });

    const events = doAttack(w, attacker, defender);
    expect(defender.hp).toBe(20);       // untouched
    expect(defender.shieldHp).toBe(7);  // 10 - 3

    const hit = events.find(e => e.type === "Hit") as any;
    expect(hit.damage).toBe(0);
    expect(hit.shieldAbsorbed).toBe(3);
  });

  it("no shieldAbsorbed field on Hit when no shield is active", () => {
    const attacker = makeActor({ id: "att", atk: 5, pos: { x: 0, y: 0 } });
    const defender = makeActor({ id: "def", hp: 20, pos: { x: 1, y: 0 } });
    const w = makeWorld([attacker, defender]);

    const events = doAttack(w, attacker, defender);
    const hit = events.find(e => e.type === "Hit") as any;
    expect(hit.shieldAbsorbed).toBeUndefined();
    expect(hit.damage).toBe(5);
  });

  it("attacked.damage carries full raw hit (pre-shield) for log accuracy", () => {
    const attacker = makeActor({ id: "att", atk: 10, pos: { x: 0, y: 0 } });
    const defender = makeActor({ id: "def", hp: 50, pos: { x: 1, y: 0 } });
    const w = makeWorld([attacker, defender]);
    applyEffect(w, "def", "shield", 50, { magnitude: 4 });

    const events = doAttack(w, attacker, defender);
    const attacked = events.find(e => e.type === "Attacked") as any;
    expect(attacked.damage).toBe(10); // full raw, before shield
  });

  it("shield exhaustion — subsequent hit lands fully on hp", () => {
    const attacker = makeActor({ id: "att", atk: 5, pos: { x: 0, y: 0 } });
    const defender = makeActor({ id: "def", hp: 20, pos: { x: 1, y: 0 } });
    const w = makeWorld([attacker, defender]);
    applyEffect(w, "def", "shield", 50, { magnitude: 3 });

    doAttack(w, attacker, defender); // 5 dmg: 3 absorbed, 2 to hp → hp=18
    expect(defender.shieldHp).toBe(0);

    doAttack(w, attacker, defender); // shield empty → 5 fully to hp → hp=13
    expect(defender.hp).toBe(13);
  });

  it("shield does not prevent death when overflow is lethal", () => {
    const attacker = makeActor({ id: "att", atk: 15, pos: { x: 0, y: 0 } });
    const defender = makeActor({ id: "def", hp: 5, pos: { x: 1, y: 0 } });
    const w = makeWorld([attacker, defender]);
    applyEffect(w, "def", "shield", 50, { magnitude: 3 });

    // 15 dmg, 3 shield → 3 absorbed, 12 to hp (hp was 5 → -7)
    const events = doAttack(w, attacker, defender);
    expect(defender.alive).toBe(false);
    expect(events.some(e => e.type === "Died")).toBe(true);
  });
});

// ── expiry ─────────────────────────────────────────────────────────────────────

describe("shield — expiry", () => {
  it("expiry zeroes shieldHp and removes effect", () => {
    const actor = makeActor();
    const w = makeWorld([actor]);
    applyEffect(w, "a", "shield", 2, { magnitude: 10 });
    expect(actor.shieldHp).toBe(10);

    for (let i = 0; i < 5; i++) tickEffects(w, actor);
    expect(actor.shieldHp).toBe(0);
    expect(actor.effects!.length).toBe(0);
  });

  it("expiry emits EffectExpired", () => {
    const actor = makeActor();
    const w = makeWorld([actor]);
    applyEffect(w, "a", "shield", 1, { magnitude: 10 });
    const out: GameEvent[] = [];
    for (let i = 0; i < 5; i++) out.push(...tickEffects(w, actor));
    expect(out.some(e => e.type === "EffectExpired" && (e as any).kind === "shield")).toBe(true);
  });
});

// ── stacking ──────────────────────────────────────────────────────────────────

describe("shield — stacking (pool semantics)", () => {
  it("re-applying larger shield tops up shieldHp to new magnitude", () => {
    const actor = makeActor();
    const w = makeWorld([actor]);
    applyEffect(w, "a", "shield", 50, { magnitude: 10 });
    actor.shieldHp = 3; // partially drained

    applyEffect(w, "a", "shield", 50, { magnitude: 15 });
    expect(actor.shieldHp).toBe(15);         // topped up
    expect(actor.effects![0]!.magnitude).toBe(15); // magnitude updated
    expect(actor.effects!.length).toBe(1);   // still one effect
  });

  it("re-applying smaller shield does not top up pool", () => {
    const actor = makeActor();
    const w = makeWorld([actor]);
    applyEffect(w, "a", "shield", 50, { magnitude: 10 });
    actor.shieldHp = 3;

    applyEffect(w, "a", "shield", 50, { magnitude: 5 }); // smaller — no top-up
    expect(actor.shieldHp).toBe(3);          // unchanged
    expect(actor.effects![0]!.magnitude).toBe(10); // original magnitude kept
  });

  it("duration refreshes to max regardless of magnitude", () => {
    const actor = makeActor();
    const w = makeWorld([actor]);
    applyEffect(w, "a", "shield", 20, { magnitude: 10 });
    applyEffect(w, "a", "shield", 80, { magnitude: 5 }); // longer duration, smaller mag
    expect(actor.effects![0]!.remaining).toBe(80); // max(20,80)
    expect(actor.shieldHp).toBe(10);               // pool unchanged (new mag < existing)
  });
});
