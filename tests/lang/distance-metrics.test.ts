// Distance metrics decouple by purpose —
//   actor-to-actor distance is Chebyshev (8-directional, diagonals = 1 tile),
//   AoE inclusion is Euclidean (round blasts; corners drop out at R≥2).

import { describe, it, expect } from "vitest";
import { startRoom } from "../../src/engine.js";
import { parse } from "../../src/lang/parser.js";
import { PRIMITIVES } from "../../src/spells/primitives.js";
import { mkRoom, mkHero, mkActor, mkWorld } from "../helpers.js";

describe("actor-to-actor distance — Chebyshev", () => {
  it("diagonal foe at (3,3) is distance 3 (max(|dx|,|dy|))", () => {
    const hero = mkHero({
      pos: { x: 0, y: 0 },
      script: parse(`
foe = enemies()[0]
d = me.distance_to(foe)
wait()
halt
`),
    });
    const gob = mkActor({ id: "g", kind: "goblin", pos: { x: 3, y: 3 } });
    const h = startRoom({ room: mkRoom(), actors: [hero, gob] });
    h.step();
    expect(h.inspect("h")!.locals.d).toBe(3);
  });

  it("knight-move foe at (4,2) is distance 4 — not Manhattan, not Euclidean", () => {
    const hero = mkHero({
      pos: { x: 0, y: 0 },
      script: parse(`
foe = enemies()[0]
d = me.distance_to(foe)
wait()
halt
`),
    });
    const gob = mkActor({ id: "g", kind: "goblin", pos: { x: 4, y: 2 } });
    const h = startRoom({ room: mkRoom(), actors: [hero, gob] });
    h.step();
    // Manhattan would be 6; Euclidean ≈ 4.47; Chebyshev = 4.
    expect(h.inspect("h")!.locals.d).toBe(4);
  });

  it("adjacent_to is true on diagonal neighbour (Chebyshev = 1)", () => {
    const hero = mkHero({
      pos: { x: 5, y: 5 },
      script: parse(`
foe = enemies()[0]
adj = me.adjacent_to(foe)
wait()
halt
`),
    });
    const gob = mkActor({ id: "g", kind: "goblin", pos: { x: 6, y: 6 } });
    const h = startRoom({ room: mkRoom(), actors: [hero, gob] });
    h.step();
    expect(h.inspect("h")!.locals.adj).toBe(true);
  });
});

describe("AoE inclusion — Euclidean (round blast)", () => {
  it("R=1 covers the full 3×3 square (Chebyshev 1 == Euclidean 1.5²)", () => {
    // At R=1 the metrics coincide because r²=2.25 admits the diagonals (2 ≤ 2.25).
    const caster = mkActor({ id: "c", kind: "hero", pos: { x: 0, y: 0 }, int: 0 });
    const diag = mkActor({ id: "d", kind: "goblin", pos: { x: 4, y: 4 }, hp: 20, maxHp: 20 });
    const w = mkWorld([caster, diag]);
    PRIMITIVES.explode.execute(w, caster, { x: 3, y: 3 }, { radius: 1, damage: 5 });
    expect(diag.hp).toBe(15);
  });

  it("R=2 EXCLUDES the four corner tiles (±2, ±2) — diverges from Chebyshev", () => {
    // r² = 6.25; corner dist² = 8. 8 > 6.25 → corner is outside the blast.
    const caster = mkActor({ id: "c", kind: "hero", pos: { x: 0, y: 0 }, int: 0 });
    const corner = mkActor({ id: "k", kind: "goblin", pos: { x: 7, y: 7 }, hp: 20, maxHp: 20 });
    const w = mkWorld([caster, corner], { w: 10, h: 10 });
    PRIMITIVES.explode.execute(w, caster, { x: 5, y: 5 }, { radius: 2, damage: 5 });
    // Corner is Chebyshev 2 from blast (5,5)→(7,7) — would be hit under Chebyshev,
    // but Euclidean (round blast) excludes it.
    expect(corner.hp).toBe(20);
  });

  it("R=2 INCLUDES axis tiles at (±2, 0) — these stay inside the round blast", () => {
    // dx²+dy² = 4 ≤ 6.25 → included.
    const caster = mkActor({ id: "c", kind: "hero", pos: { x: 0, y: 0 }, int: 0 });
    const axis = mkActor({ id: "a", kind: "goblin", pos: { x: 7, y: 5 }, hp: 20, maxHp: 20 });
    const w = mkWorld([caster, axis], { w: 10, h: 10 });
    PRIMITIVES.explode.execute(w, caster, { x: 5, y: 5 }, { radius: 2, damage: 5 });
    expect(axis.hp).toBe(15);
  });

  it("R=3 EXCLUDES (±3, ±3) corners but INCLUDES (±3, ±2)/(±2, ±3) edges", () => {
    // r² = 12.25.
    //   (3,3): 18 > 12.25 → excluded.
    //   (3,2): 13 > 12.25 → excluded as well (the implementation comment names
    //          37 tiles for R=3, which subtracts the 4 corners + 8 near-corners).
    //   (2,2): 8 ≤ 12.25 → included.
    const caster = mkActor({ id: "c", kind: "hero", pos: { x: 0, y: 0 }, int: 0 });
    const corner = mkActor({ id: "k", kind: "goblin", pos: { x: 8, y: 8 }, hp: 20, maxHp: 20 });
    const inner = mkActor({ id: "i", kind: "goblin", pos: { x: 7, y: 7 }, hp: 20, maxHp: 20 });
    const w = mkWorld([caster, corner, inner], { w: 10, h: 10 });
    PRIMITIVES.explode.execute(w, caster, { x: 5, y: 5 }, { radius: 3, damage: 5 });
    expect(corner.hp).toBe(20); // (3,3)-offset → outside round blast
    expect(inner.hp).toBe(15);  // (2,2)-offset → inside
  });
});
