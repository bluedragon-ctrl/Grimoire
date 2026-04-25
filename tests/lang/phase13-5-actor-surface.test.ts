// Phase 13.5: actor dot-walk surface — me.hp, me.is_hero, me.distance_to(),
// me.adjacent_to(), me.has_effect(), me.summoner, etc.

import { describe, it, expect } from "vitest";
import type { Actor, Room } from "../../src/types.js";
import { startRoom } from "../../src/engine.js";
import { parse } from "../../src/lang/parser.js";
import { mkRoom, mkHero, mkGoblin } from "../helpers.js";

function runUntilWait(actors: Actor[], room?: Partial<Room>) {
  const h = startRoom({ room: mkRoom(room), actors });
  h.step();
  return h;
}

function heroWith(src: string, over: Partial<Actor> = {}): Actor {
  return mkHero({ ...over, script: parse(src) });
}

describe("actor surface — fields", () => {
  it("me.hp / me.maxHp / me.mp expose live stats", () => {
    const hero = heroWith(`
hp_now = me.hp
mp_now = me.mp
max_hp = me.maxHp
wait()
halt
`, { hp: 13, maxHp: 17, mp: 9 });
    const h = runUntilWait([hero]);
    const snap = h.inspect("h")!;
    expect(snap.locals.hp_now).toBe(13);
    expect(snap.locals.mp_now).toBe(9);
    expect(snap.locals.max_hp).toBe(17);
  });

  it("me.is_hero is true for the player", () => {
    const hero = heroWith(`
is_hero = me.is_hero
wait()
halt
`);
    const h = runUntilWait([hero]);
    expect(h.inspect("h")!.locals.is_hero).toBe(true);
  });

  it("monster.is_hero is false, monster.is_summoned reads owner status", () => {
    const hero = heroWith(`
foe = enemies()[0]
foe_is_hero = foe.is_hero
foe_summoned = foe.is_summoned
wait()
halt
`);
    const gob = mkGoblin({ id: "g", pos: { x: 3, y: 0 } });
    const h = runUntilWait([hero, gob]);
    const snap = h.inspect("h")!;
    expect(snap.locals.foe_is_hero).toBe(false);
    expect(snap.locals.foe_summoned).toBe(false);
  });

  it("me.summoner is null for non-summoned actors", () => {
    const hero = heroWith(`
owner = me.summoner
wait()
halt
`);
    const h = runUntilWait([hero]);
    expect(h.inspect("h")!.locals.owner).toBeNull();
  });

  it("summoned.summoner resolves to owner Actor", () => {
    const hero = mkHero({ pos: { x: 0, y: 0 } });
    const minion = mkGoblin({
      id: "m", pos: { x: 2, y: 0 }, owner: "h", summoned: true,
      script: parse(`
boss = me.summoner
boss_id = boss.id
wait()
halt
`),
    });
    const h = runUntilWait([hero, minion]);
    const snap = h.inspect("m")!;
    expect((snap.locals.boss as any)?.id).toBe("h");
    expect(snap.locals.boss_id).toBe("h");
  });
});

describe("actor surface — distance methods", () => {
  it("me.distance_to(other) is Chebyshev tiles", () => {
    const hero = heroWith(`
foe = enemies()[0]
d_diag = me.distance_to(foe)
wait()
halt
`, { pos: { x: 0, y: 0 } });
    const gob = mkGoblin({ id: "g", pos: { x: 3, y: 3 } });
    const h = runUntilWait([hero, gob]);
    expect(h.inspect("h")!.locals.d_diag).toBe(3);
  });

  it("me.distance_to(self) is 0", () => {
    const hero = heroWith(`
d = me.distance_to(me)
wait()
halt
`);
    const h = runUntilWait([hero]);
    expect(h.inspect("h")!.locals.d).toBe(0);
  });

  it("me.adjacent_to(other) is true for diagonal neighbour", () => {
    const hero = heroWith(`
foe = enemies()[0]
adj = me.adjacent_to(foe)
wait()
halt
`, { pos: { x: 2, y: 2 } });
    const gob = mkGoblin({ id: "g", pos: { x: 3, y: 3 } });
    const h = runUntilWait([hero, gob]);
    expect(h.inspect("h")!.locals.adj).toBe(true);
  });

  it("me.adjacent_to(other) is false at distance 2", () => {
    const hero = heroWith(`
foe = enemies()[0]
adj = me.adjacent_to(foe)
wait()
halt
`, { pos: { x: 0, y: 0 } });
    const gob = mkGoblin({ id: "g", pos: { x: 2, y: 0 } });
    const h = runUntilWait([hero, gob]);
    expect(h.inspect("h")!.locals.adj).toBe(false);
  });

  it("me.adjacent_to(self) is false (distance 0 isn't adjacent)", () => {
    const hero = heroWith(`
adj = me.adjacent_to(me)
wait()
halt
`);
    const h = runUntilWait([hero]);
    expect(h.inspect("h")!.locals.adj).toBe(false);
  });

  it("me.distance_to accepts bare {pos:{x,y}} objects (door-like)", () => {
    const hero = heroWith(`
door = doors()[0]
d = me.distance_to(door)
wait()
halt
`, { pos: { x: 0, y: 0 } });
    const room = { doors: [{ dir: "N" as const, pos: { x: 4, y: 0 } }] };
    const h = runUntilWait([hero], room);
    expect(h.inspect("h")!.locals.d).toBe(4);
  });
});

describe("actor surface — effect introspection", () => {
  it("me.has_effect returns true when effect present", () => {
    const hero = heroWith(`
on_fire = me.has_effect("burning")
wait()
halt
`, {
      effects: [{ id: "e1", kind: "burning", target: "h", magnitude: 1, duration: 50, remaining: 50, tickEvery: 10 }],
    });
    const h = runUntilWait([hero]);
    expect(h.inspect("h")!.locals.on_fire).toBe(true);
  });

  it("me.has_effect returns false for absent effect", () => {
    const hero = heroWith(`
chilled = me.has_effect("chill")
wait()
halt
`);
    const h = runUntilWait([hero]);
    expect(h.inspect("h")!.locals.chilled).toBe(false);
  });

  it("me.effect_remaining reports duration left", () => {
    const hero = heroWith(`
left = me.effect_remaining("burning")
wait()
halt
`, {
      effects: [{ id: "e1", kind: "burning", target: "h", magnitude: 1, duration: 50, remaining: 30, tickEvery: 10 }],
    });
    const h = runUntilWait([hero]);
    expect(h.inspect("h")!.locals.left).toBe(30);
  });

  it("me.effect_remaining returns 0 for missing effect", () => {
    const hero = heroWith(`
left = me.effect_remaining("burning")
wait()
halt
`);
    const h = runUntilWait([hero]);
    expect(h.inspect("h")!.locals.left).toBe(0);
  });

  it("me.effect_magnitude returns the magnitude (or 0)", () => {
    const hero = heroWith(`
mag = me.effect_magnitude("burning")
mag_missing = me.effect_magnitude("chill")
wait()
halt
`, {
      effects: [{ id: "e1", kind: "burning", target: "h", magnitude: 4, duration: 50, remaining: 50, tickEvery: 10 }],
    });
    const h = runUntilWait([hero]);
    const snap = h.inspect("h")!;
    expect(snap.locals.mag).toBe(4);
    expect(snap.locals.mag_missing).toBe(0);
  });

  it("me.list_effects returns a Collection of kind strings", () => {
    const hero = heroWith(`
effs = me.list_effects()
n = len(effs)
wait()
halt
`, {
      effects: [
        { id: "e1", kind: "burning", target: "h", magnitude: 1, duration: 50, remaining: 50, tickEvery: 10 },
        { id: "e2", kind: "chill",   target: "h", magnitude: 1, duration: 50, remaining: 50, tickEvery: 10 },
      ],
    });
    const h = runUntilWait([hero]);
    expect(h.inspect("h")!.locals.n).toBe(2);
  });
});

describe("actor surface — can_cast / in_los", () => {
  it("me.can_cast true when conditions met", () => {
    const hero = heroWith(`
foe = enemies()[0]
ok = me.can_cast("bolt", foe)
wait()
halt
`);
    const gob = mkGoblin({ id: "g", pos: { x: 3, y: 0 } });
    const h = runUntilWait([hero, gob]);
    expect(h.inspect("h")!.locals.ok).toBe(true);
  });

  it("me.can_cast false on unknown spell", () => {
    const hero = heroWith(`
foe = enemies()[0]
ok = me.can_cast("nope", foe)
wait()
halt
`);
    const gob = mkGoblin({ id: "g", pos: { x: 1, y: 0 } });
    const h = runUntilWait([hero, gob]);
    expect(h.inspect("h")!.locals.ok).toBe(false);
  });

  it("me.in_los true on empty map between hero and goblin", () => {
    const hero = heroWith(`
foe = enemies()[0]
sees = me.in_los(foe)
wait()
halt
`);
    const gob = mkGoblin({ id: "g", pos: { x: 3, y: 0 } });
    const h = runUntilWait([hero, gob]);
    expect(h.inspect("h")!.locals.sees).toBe(true);
  });
});
