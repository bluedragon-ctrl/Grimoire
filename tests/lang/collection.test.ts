// Pythonic list semantics on Collection — len/indexing/iteration,
// truthiness, .filter / .sorted_by / .first / .last / .min_by / .max_by, plus
// the min() / max() builtins.

import { describe, it, expect } from "vitest";
import type { Actor } from "../../src/types.js";
import { startRoom } from "../../src/engine.js";
import { parse } from "../../src/lang/parser.js";
import { mkRoom, mkHero, mkGoblin } from "../helpers.js";

function heroWith(src: string, over: Partial<Actor> = {}): Actor {
  return mkHero({ ...over, script: parse(src) });
}

function runOnce(actors: Actor[]) {
  const h = startRoom({ room: mkRoom(), actors });
  h.step();
  return h;
}

describe("Collection — basics", () => {
  it("len([1,2,3]) is 3", () => {
    const hero = heroWith(`
xs = [1, 2, 3]
n = len(xs)
wait()
halt
`);
    const h = runOnce([hero]);
    expect(h.inspect("h")!.locals.n).toBe(3);
  });

  it("indexing returns element at i", () => {
    const hero = heroWith(`
xs = [10, 20, 30]
mid = xs[1]
wait()
halt
`);
    const h = runOnce([hero]);
    expect(h.inspect("h")!.locals.mid).toBe(20);
  });

  it("for-loop iterates Collection elements in order", () => {
    const hero = heroWith(`
xs = [1, 2, 3, 4]
total = 0
for v in xs:
  total = total + v
wait()
halt
`);
    const h = runOnce([hero]);
    expect(h.inspect("h")!.locals.total).toBe(10);
  });

  it("empty Collection is falsy", () => {
    const hero = heroWith(`
xs = []
got = "no"
if xs:
  got = "yes"
wait()
halt
`);
    const h = runOnce([hero]);
    expect(h.inspect("h")!.locals.got).toBe("no");
  });

  it("non-empty Collection is truthy", () => {
    const hero = heroWith(`
xs = [0]
got = "no"
if xs:
  got = "yes"
wait()
halt
`);
    const h = runOnce([hero]);
    expect(h.inspect("h")!.locals.got).toBe("yes");
  });

  it("len() of query result works (enemies())", () => {
    const hero = heroWith(`
n = len(enemies())
wait()
halt
`);
    const g1 = mkGoblin({ id: "g1", pos: { x: 2, y: 0 } });
    const g2 = mkGoblin({ id: "g2", pos: { x: 3, y: 0 } });
    const h = runOnce([hero, g1, g2]);
    expect(h.inspect("h")!.locals.n).toBe(2);
  });
});

describe("Collection — chainable methods", () => {
  it(".filter(pred) keeps matching items", () => {
    const hero = heroWith(`
xs = [1, 2, 3, 4, 5]
evens = xs.filter(lambda v: v % 2 == 0)
n = len(evens)
first_even = evens[0]
wait()
halt
`);
    const h = runOnce([hero]);
    expect(h.inspect("h")!.locals.n).toBe(2);
    expect(h.inspect("h")!.locals.first_even).toBe(2);
  });

  it(".sorted_by(key) returns ascending order", () => {
    const hero = heroWith(`
xs = [3, 1, 4, 1, 5, 9, 2, 6]
sorted = xs.sorted_by(lambda v: v)
top = sorted[0]
last = sorted[len(sorted) - 1]
wait()
halt
`);
    const h = runOnce([hero]);
    expect(h.inspect("h")!.locals.top).toBe(1);
    expect(h.inspect("h")!.locals.last).toBe(9);
  });

  it(".first() returns first element", () => {
    const hero = heroWith(`
xs = [7, 8, 9]
f = xs.first()
wait()
halt
`);
    const h = runOnce([hero]);
    expect(h.inspect("h")!.locals.f).toBe(7);
  });

  it(".last() returns last element", () => {
    const hero = heroWith(`
xs = [7, 8, 9]
l = xs.last()
wait()
halt
`);
    const h = runOnce([hero]);
    expect(h.inspect("h")!.locals.l).toBe(9);
  });

  it(".min_by / .max_by pick by key", () => {
    const hero = heroWith(`
xs = [10, 3, 7, 1, 8]
lo = xs.min_by(lambda v: v)
hi = xs.max_by(lambda v: v)
wait()
halt
`);
    const h = runOnce([hero]);
    expect(h.inspect("h")!.locals.lo).toBe(1);
    expect(h.inspect("h")!.locals.hi).toBe(10);
  });

  it(".filter on enemies() yields a chainable Collection", () => {
    const hero = heroWith(`
weak = enemies().filter(lambda e: e.hp < 5)
n = len(weak)
wait()
halt
`);
    const g1 = mkGoblin({ id: "g1", pos: { x: 2, y: 0 }, hp: 3, maxHp: 3 });
    const g2 = mkGoblin({ id: "g2", pos: { x: 3, y: 0 }, hp: 9, maxHp: 9 });
    const g3 = mkGoblin({ id: "g3", pos: { x: 4, y: 0 }, hp: 2, maxHp: 2 });
    const h = runOnce([hero, g1, g2, g3]);
    expect(h.inspect("h")!.locals.n).toBe(2);
  });
});

describe("min() / max() builtins", () => {
  it("min(coll) returns smallest with default identity key", () => {
    const hero = heroWith(`
m = min([5, 2, 8, 3])
wait()
halt
`);
    const h = runOnce([hero]);
    expect(h.inspect("h")!.locals.m).toBe(2);
  });

  it("max(enemies(), key) uses the key function", () => {
    const hero = heroWith(`
toughest = max(enemies(), lambda e: e.hp)
top_id = toughest.id
wait()
halt
`);
    const g1 = mkGoblin({ id: "g1", pos: { x: 2, y: 0 }, hp: 3, maxHp: 3 });
    const g2 = mkGoblin({ id: "g2", pos: { x: 3, y: 0 }, hp: 12, maxHp: 12 });
    const g3 = mkGoblin({ id: "g3", pos: { x: 4, y: 0 }, hp: 7, maxHp: 7 });
    const h = runOnce([hero, g1, g2, g3]);
    expect(h.inspect("h")!.locals.top_id).toBe("g2");
  });

  it("min/max return null on empty input", () => {
    const hero = heroWith(`
empty = []
m = min(empty)
M = max(empty)
wait()
halt
`);
    const h = runOnce([hero]);
    expect(h.inspect("h")!.locals.m).toBeNull();
    expect(h.inspect("h")!.locals.M).toBeNull();
  });
});
