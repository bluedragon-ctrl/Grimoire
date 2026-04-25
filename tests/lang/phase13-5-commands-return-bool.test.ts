// Phase 13.5: commands return a bool — `if attack(foe):`, `if cast(...):`,
// etc. The script gets back true on success / false on ActionFailed.

import { describe, it, expect } from "vitest";
import type { Actor } from "../../src/types.js";
import { startRoom } from "../../src/engine.js";
import { parse } from "../../src/lang/parser.js";
import { mkRoom, mkHero, mkGoblin } from "../helpers.js";

function heroWith(src: string, over: Partial<Actor> = {}): Actor {
  return mkHero({ ...over, script: parse(src) });
}

// Each script ends with `while true: wait()` so the hero parks on a wait
// PendingAction with stable locals. The goblin fires its halt at cost-0
// first, so we step several times to drive past that and let the hero's
// command(s) resolve and reach the parked wait.
function runUntilWaitPark(actors: Actor[]) {
  const h = startRoom({ room: mkRoom(), actors });
  for (let i = 0; i < 6; i++) h.step();
  return h;
}

describe("commands return bool — success", () => {
  it("attack(adjacent foe) returns true", () => {
    const hero = heroWith(`
foe = enemies()[0]
ok = attack(foe)
while true:
  wait()
`, { pos: { x: 0, y: 0 } });
    const gob = mkGoblin({ id: "g", pos: { x: 1, y: 0 } });
    const h = runUntilWaitPark([hero, gob]);
    expect(h.inspect("h")!.locals.ok).toBe(true);
  });

  it("approach(foe) returns true", () => {
    const hero = heroWith(`
foe = enemies()[0]
ok = approach(foe)
while true:
  wait()
`, { pos: { x: 0, y: 0 } });
    const gob = mkGoblin({ id: "g", pos: { x: 5, y: 0 } });
    const h = runUntilWaitPark([hero, gob]);
    expect(h.inspect("h")!.locals.ok).toBe(true);
  });

  it("wait() returns true", () => {
    const hero = heroWith(`
ok = wait()
while true:
  wait()
`);
    const h = runUntilWaitPark([hero]);
    expect(h.inspect("h")!.locals.ok).toBe(true);
  });
});

describe("commands return bool — failure", () => {
  it("attack(non-adjacent foe) returns false", () => {
    const hero = heroWith(`
foe = enemies()[0]
ok = attack(foe)
while true:
  wait()
`, { pos: { x: 0, y: 0 } });
    const gob = mkGoblin({ id: "g", pos: { x: 5, y: 5 } });
    const h = runUntilWaitPark([hero, gob]);
    expect(h.inspect("h")!.locals.ok).toBe(false);
  });

  it("cast(unknown spell) returns false", () => {
    const hero = heroWith(`
foe = enemies()[0]
ok = cast("nope", foe)
while true:
  wait()
`);
    const gob = mkGoblin({ id: "g", pos: { x: 2, y: 0 } });
    const h = runUntilWaitPark([hero, gob]);
    expect(h.inspect("h")!.locals.ok).toBe(false);
  });

  it("use(empty bag) returns false", () => {
    const hero = heroWith(`
ok = use("health_potion")
while true:
  wait()
`);
    const h = runUntilWaitPark([hero]);
    expect(h.inspect("h")!.locals.ok).toBe(false);
  });
});

describe("commands return bool — branching on result", () => {
  it("`if attack(foe):` branch fires only on hit", () => {
    const hero = heroWith(`
foe = enemies()[0]
hit = 0
miss = 0
if attack(foe):
  hit = 1
else:
  miss = 1
while true:
  wait()
`, { pos: { x: 0, y: 0 } });
    const gob = mkGoblin({ id: "g", pos: { x: 1, y: 0 } });
    const h = runUntilWaitPark([hero, gob]);
    const snap = h.inspect("h")!;
    expect(snap.locals.hit).toBe(1);
    expect(snap.locals.miss).toBe(0);
  });

  it("`if not attack(foe):` triggers fallback when out of range", () => {
    const hero = heroWith(`
foe = enemies()[0]
moved = 0
if not attack(foe):
  moved = 1
while true:
  wait()
`, { pos: { x: 0, y: 0 } });
    const gob = mkGoblin({ id: "g", pos: { x: 5, y: 5 } });
    const h = runUntilWaitPark([hero, gob]);
    expect(h.inspect("h")!.locals.moved).toBe(1);
  });
});
