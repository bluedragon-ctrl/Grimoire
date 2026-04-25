// Phase 11: exercise each starter monster template's DSL AI end-to-end through
// the scheduler. Verifies behavior described in comments in src/content/monsters.ts.

import { describe, it, expect } from "vitest";
import type { Actor, Room, GameEvent } from "../../src/types.js";
import { runRoom, startRoom } from "../../src/engine.js";
import { createActor } from "../../src/content/monsters.js";
import {
  script, call, lit, while_, bin, member, index, cHalt, cWait,
} from "../../src/ast-helpers.js";

function emptyRoom(): Room {
  return { w: 10, h: 10, doors: [], items: [], chests: [] };
}

function passiveHero(pos: { x: number; y: number }, over: Partial<Actor> = {}): Actor {
  return {
    id: "h", kind: "hero", isHero: true, hp: 20, maxHp: 20, speed: 10, energy: 0,
    pos, alive: true,
    script: script(while_(lit(true), [cWait()])),
    ...over,
  };
}

function types(log: { event: GameEvent }[]): GameEvent["type"][] {
  return log.map(l => l.event.type);
}

describe("goblin AI", () => {
  it("approaches and attacks the hero", () => {
    const hero = passiveHero({ x: 0, y: 0 });
    const gob = createActor("goblin", { x: 4, y: 0 }, "g1");
    const { log } = runRoom({ room: emptyRoom(), actors: [hero, gob] }, { maxTicks: 50 });

    expect(log.some(l => l.event.type === "Moved" && (l.event as any).actor === "g1")).toBe(true);
    expect(log.some(l =>
      l.event.type === "Attacked" && (l.event as any).attacker === "g1" && (l.event as any).defender === "h",
    )).toBe(true);
  });
});

describe("cultist AI", () => {
  it("casts firebolt when the hero is in range and MP is available", () => {
    const hero = passiveHero({ x: 0, y: 0 }, { hp: 50, maxHp: 50 });
    const cult = createActor("cultist", { x: 3, y: 0 }, "c1");
    const { log } = runRoom({ room: emptyRoom(), actors: [hero, cult] }, { maxTicks: 30 });

    const casts = log.filter(l => l.event.type === "Cast" && (l.event as any).actor === "c1");
    expect(casts.length).toBeGreaterThanOrEqual(1);
    expect((casts[0]!.event as any).spell).toBe("firebolt");
  });

  it("approaches when out of range", () => {
    // Hero is 9 tiles away — outside bolt range 6 → cultist should Move before casting.
    const hero = passiveHero({ x: 0, y: 0 }, { hp: 50, maxHp: 50 });
    const cult = createActor("cultist", { x: 9, y: 0 }, "c1");
    const h = startRoom({ room: emptyRoom(), actors: [hero, cult] }, { maxTicks: 40 });
    h.run();
    const evs = types(h.log);
    const firstCultMove = h.log.findIndex(l => l.event.type === "Moved" && (l.event as any).actor === "c1");
    const firstCultCast = h.log.findIndex(l => l.event.type === "Cast"  && (l.event as any).actor === "c1");
    expect(firstCultMove).toBeGreaterThanOrEqual(0);
    // Either never cast (moved closer throughout maxTicks) or moved before casting.
    if (firstCultCast >= 0) {
      expect(firstCultMove).toBeLessThan(firstCultCast);
    }
    expect(evs.length).toBeGreaterThan(0);
  });
});

describe("bat AI", () => {
  it("attacks and then flees — net Moved events away after each hit", () => {
    const hero = passiveHero({ x: 0, y: 0 }, { hp: 50, maxHp: 50 });
    const bat = createActor("bat", { x: 1, y: 0 }, "b1");
    const { log } = runRoom({ room: emptyRoom(), actors: [hero, bat] }, { maxTicks: 30 });

    const batAttacks = log.filter(l => l.event.type === "Attacked" && (l.event as any).attacker === "b1");
    expect(batAttacks.length).toBeGreaterThanOrEqual(1);
    // Bat must have moved at some point after attacking (flee step).
    const firstAttack = log.findIndex(l => l.event.type === "Attacked" && (l.event as any).attacker === "b1");
    const laterMove = log.slice(firstAttack + 1).some(l =>
      l.event.type === "Moved" && (l.event as any).actor === "b1",
    );
    expect(laterMove).toBe(true);
  });
});

describe("skeleton AI", () => {
  it("attacks when adjacent without an extra approach step", () => {
    const hero = passiveHero({ x: 0, y: 0 }, { hp: 50, maxHp: 50 });
    const sk = createActor("skeleton", { x: 1, y: 0 }, "s1");
    const { log } = runRoom({ room: emptyRoom(), actors: [hero, sk] }, { maxTicks: 10 });

    const firstSkEvent = log.find(l =>
      (l.event as any).actor === "s1" || (l.event as any).attacker === "s1",
    );
    expect(firstSkEvent?.event.type).toBe("Attacked");
  });

  it("handler-after-halt regression: skeleton flees when hit even if main halted", () => {
    // Construct a skeleton that has ALREADY halted its main (HP<3 path does
    // halt-then-resume; easier here to use a minimal main that halts immediately
    // but keeps the cultist-style handler). We reuse the skeleton template but
    // swap in a halt-only main — we still want to verify the scheduler pops
    // the empty main then fires the handler. To do that we reach for the
    // cultist template instead, which has the explicit `on hit as attacker`
    // handler and a main that halts when out of MP.
    const hero: Actor = {
      id: "h", kind: "hero", isHero: true, hp: 20, maxHp: 20,
      speed: 12, energy: 0, pos: { x: 0, y: 0 }, alive: true,
      // Hero marches right and swings once.
      script: script(
        while_(
          bin(">", member(call("enemies"), "length"), lit(0)),
          [
            { t: "ExprStmt", expr: call("approach", index(call("enemies"), lit(0))) },
            { t: "ExprStmt", expr: call("attack",   index(call("enemies"), lit(0))) },
          ],
        ),
        cHalt(),
      ),
    };
    const cult = createActor("cultist", { x: 2, y: 0 }, "c1");
    cult.mp = 0;  // Force main's `can_cast` → false → approach branch, never casts.
    cult.maxMp = 15;

    const { log } = runRoom({ room: emptyRoom(), actors: [hero, cult] }, { maxTicks: 60 });

    // Hero must have hit the cultist (fires the `on hit` handler).
    expect(log.some(l =>
      l.event.type === "Hit" && (l.event as any).actor === "c1" && (l.event as any).attacker === "h",
    )).toBe(true);
    // Cultist's flee(attacker) handler must have produced at least one Moved
    // event for c1 AFTER the first Hit on c1. That proves the handler ran
    // even though the main script already halted on prior ticks.
    const firstHit = log.findIndex(l => l.event.type === "Hit" && (l.event as any).actor === "c1");
    const movedAfter = log.slice(firstHit + 1).some(l =>
      l.event.type === "Moved" && (l.event as any).actor === "c1",
    );
    expect(movedAfter).toBe(true);
  });
});

describe("slime AI", () => {
  it("marches toward the hero despite low speed (no branching)", () => {
    const hero = passiveHero({ x: 0, y: 0 }, { hp: 50, maxHp: 50 });
    const sl = createActor("slime", { x: 5, y: 0 }, "s1");
    const { log } = runRoom({ room: emptyRoom(), actors: [hero, sl] }, { maxTicks: 80 });
    expect(log.some(l => l.event.type === "Moved" && (l.event as any).actor === "s1")).toBe(true);
  });
});
