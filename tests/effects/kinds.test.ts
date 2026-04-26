// Concrete effect kinds: passive stat modifiers, shield mechanic, mana effects.

import { describe, it, expect } from "vitest";
import type { Actor, GameEvent, Room } from "../../src/types.js";
import { applyEffect, effectiveStats, tickEffects } from "../../src/effects.js";
import { doAttack } from "../../src/commands.js";
import { runRoom } from "../../src/engine.js";
import { script, cHalt, while_, lit, cWait } from "../../src/ast-helpers.js";

function emptyRoom(): Room {
  return { w: 10, h: 10, doors: [], items: [], chests: [] };
}

function makeActor(over: Partial<Actor> = {}): Actor {
  return {
    id: "a", kind: "hero", hp: 20, maxHp: 20, speed: 10, energy: 0,
    pos: { x: 0, y: 0 }, alive: true,
    mp: 20, maxMp: 20, atk: 5, def: 0, int: 5,
    effects: [],
    script: script(cHalt()),
    ...over,
  };
}

function makeWorld(actors: Actor[]) {
  return { tick: 0, room: emptyRoom(), actors, log: [], aborted: false, ended: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// Passive stat effects
// ─────────────────────────────────────────────────────────────────────────────

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
    applyEffect(w, "a", "chill", 20, { magnitude: 40 });
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
    applyEffect(w, "a", "shock", 80, { magnitude: 8 });
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
    applyEffect(w, "a", "chill", 30, { magnitude: 20 });
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

// ─────────────────────────────────────────────────────────────────────────────
// Shield mechanic
// ─────────────────────────────────────────────────────────────────────────────

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

describe("shield — damage absorption in doAttack", () => {
  it("shield absorbs damage before hp, partial absorption leaves overflow in hp", () => {
    const attacker = makeActor({ id: "att", atk: 8, pos: { x: 0, y: 0 } });
    const defender = makeActor({ id: "def", hp: 20, pos: { x: 1, y: 0 } });
    const w = makeWorld([attacker, defender]);
    applyEffect(w, "def", "shield", 50, { magnitude: 5 });

    const events = doAttack(w, attacker, defender);
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
    expect(defender.hp).toBe(20);
    expect(defender.shieldHp).toBe(7);

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
    expect(attacked.damage).toBe(10);
  });

  it("shield exhaustion — subsequent hit lands fully on hp", () => {
    const attacker = makeActor({ id: "att", atk: 5, pos: { x: 0, y: 0 } });
    const defender = makeActor({ id: "def", hp: 20, pos: { x: 1, y: 0 } });
    const w = makeWorld([attacker, defender]);
    applyEffect(w, "def", "shield", 50, { magnitude: 3 });

    doAttack(w, attacker, defender);
    expect(defender.shieldHp).toBe(0);

    doAttack(w, attacker, defender);
    expect(defender.hp).toBe(13);
  });

  it("shield does not prevent death when overflow is lethal", () => {
    const attacker = makeActor({ id: "att", atk: 15, pos: { x: 0, y: 0 } });
    const defender = makeActor({ id: "def", hp: 5, pos: { x: 1, y: 0 } });
    const w = makeWorld([attacker, defender]);
    applyEffect(w, "def", "shield", 50, { magnitude: 3 });

    const events = doAttack(w, attacker, defender);
    expect(defender.alive).toBe(false);
    expect(events.some(e => e.type === "Died")).toBe(true);
  });
});

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

describe("shield — stacking (pool semantics)", () => {
  it("re-applying larger shield tops up shieldHp to new magnitude", () => {
    const actor = makeActor();
    const w = makeWorld([actor]);
    applyEffect(w, "a", "shield", 50, { magnitude: 10 });
    actor.shieldHp = 3;

    applyEffect(w, "a", "shield", 50, { magnitude: 15 });
    expect(actor.shieldHp).toBe(15);
    expect(actor.effects![0]!.magnitude).toBe(15);
    expect(actor.effects!.length).toBe(1);
  });

  it("re-applying smaller shield does not top up pool", () => {
    const actor = makeActor();
    const w = makeWorld([actor]);
    applyEffect(w, "a", "shield", 50, { magnitude: 10 });
    actor.shieldHp = 3;

    applyEffect(w, "a", "shield", 50, { magnitude: 5 });
    expect(actor.shieldHp).toBe(3);
    expect(actor.effects![0]!.magnitude).toBe(10);
  });

  it("duration refreshes to max regardless of magnitude", () => {
    const actor = makeActor();
    const w = makeWorld([actor]);
    applyEffect(w, "a", "shield", 20, { magnitude: 10 });
    applyEffect(w, "a", "shield", 80, { magnitude: 5 });
    expect(actor.effects![0]!.remaining).toBe(80); // max(20,80)
    expect(actor.shieldHp).toBe(10);               // pool unchanged (new mag < existing)
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Mana effects
// ─────────────────────────────────────────────────────────────────────────────

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
    onTick: (w: any) => {
      if (!applied) { applyFn(w); applied = true; }
    },
  });
}

function manaChangedEvents(log: { event: GameEvent }[]): GameEvent[] {
  return log.map(l => l.event).filter(e => e.type === "ManaChanged");
}

describe("mana_regen", () => {
  it("restores mp per tick, emits ManaChanged", () => {
    const h = waiter({ mp: 0, maxMp: 10 });
    const { log, world } = applyThenRun(
      h, (w) => applyEffect(w, "h", "mana_regen", 50, { magnitude: 2 }),
      { maxTicks: 200 },
    );
    const manaEvs = manaChangedEvents(log);
    expect(manaEvs.length).toBeGreaterThan(0);
    expect(manaEvs.every(e => (e as any).amount > 0)).toBe(true);
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
    const exps = log.filter(l => l.event.type === "EffectExpired" && (l.event as any).kind === "mana_regen");
    expect(exps.length).toBe(1);
  });

  it("mana_regen does not exceed maxMp", () => {
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
    const h = waiter({ mp: 10, maxMp: 10 });
    const { log } = applyThenRun(
      h, (w) => applyEffect(w, "h", "mana_regen", 10),
      { maxTicks: 100 },
    );
    expect(log.some(l => l.event.type === "EffectExpired" && (l.event as any).kind === "mana_regen")).toBe(true);
  });
});

describe("mana_burn", () => {
  it("drains mp per tick, emits ManaChanged with negative amount", () => {
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
    const h = waiter({ mp: 0, maxMp: 20 });
    const { log } = applyThenRun(
      h, (w) => applyEffect(w, "h", "mana_burn", 10),
      { maxTicks: 100 },
    );
    expect(log.some(l => l.event.type === "EffectExpired" && (l.event as any).kind === "mana_burn")).toBe(true);
  });
});
