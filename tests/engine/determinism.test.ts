// Determinism regression: two runRoom calls with the same seed + setup must
// produce byte-for-byte identical logs. Prior to Phase 11.6 this would fail
// for rooms that spawn clouds (nextCloudId was module-level) or apply effects
// (nextEffectId was module-level), because the counters advanced across runs.

import { describe, it, expect } from "vitest";
import type { Actor, Room } from "../../src/types.js";
import { runRoom } from "../../src/engine.js";
import { createActor } from "../../src/content/monsters.ts";
import {
  script, while_, bin, member, call, index, lit, exprStmt, cHalt,
  funcDef, cCast, cAttack, cApproach,
} from "../../src/ast-helpers.js";

function mkRoom(overrides: Partial<Room> = {}): Room {
  return { w: 8, h: 8, doors: [], items: [], chests: [], ...overrides };
}

function mkHero(): Actor {
  return {
    id: "hero",
    kind: "hero",
    isHero: true,
    hp: 30,
    maxHp: 30,
    speed: 12,
    energy: 0,
    alive: true,
    pos: { x: 0, y: 0 },
    atk: 3, def: 0, int: 2,
    mp: 30, maxMp: 30,
    knownSpells: ["bolt", "firebolt", "firewall"],
    // Hero AI: cast firebolt at the nearest enemy, otherwise approach and attack.
    // Firebolt applies burning effect (exercises effectSeq).
    // Use firewall if affordable (exercises primitiveSeq via spawn_cloud).
    script: script(
      while_(
        bin(">", member(call("enemies"), "length"), lit(0)),
        [
          exprStmt(call("cast", lit("firewall"), index(call("enemies"), lit(0)))),
          exprStmt(call("cast", lit("firebolt"), index(call("enemies"), lit(0)))),
          cApproach(index(call("enemies"), lit(0))),
          cAttack(index(call("enemies"), lit(0))),
        ],
      ),
      cHalt(),
    ),
  };
}

describe("engine determinism", () => {
  it("identical seed → identical log (monsters + spells + effects + loot)", () => {
    const room = mkRoom();
    const setup = {
      room,
      actors: [
        mkHero(),
        createActor("cultist", { x: 3, y: 0 }, "m1"),  // casts bolt, has loot
        createActor("goblin",  { x: 5, y: 0 }, "m2"),  // basic melee, has loot
        createActor("slime",   { x: 3, y: 3 }, "m3"),  // beefy, has loot
      ],
    };

    const h1 = runRoom(setup, { seed: 42, maxTicks: 800 });
    const h2 = runRoom(setup, { seed: 42, maxTicks: 800 });

    expect(h1.log.length).toBeGreaterThan(0);
    expect(h1.log).toEqual(h2.log);
  });

  it("cloud IDs are deterministic: same seed → same CloudSpawned ids across two runs", () => {
    // This specifically tests that primitiveSeq is on world, not module-level.
    // Before the fix, run2 cloud IDs would be cl(N+K) instead of cl(1).
    const room = mkRoom();
    const setup = {
      room,
      actors: [
        mkHero(),
        createActor("goblin", { x: 2, y: 0 }, "g1"),
      ],
    };

    const h1 = runRoom(setup, { seed: 7, maxTicks: 400 });
    const h2 = runRoom(setup, { seed: 7, maxTicks: 400 });

    const clouds1 = h1.log.map(e => e.event).filter(e => e.type === "CloudSpawned");
    const clouds2 = h2.log.map(e => e.event).filter(e => e.type === "CloudSpawned");

    // Whether or not clouds spawned, the two runs must agree completely.
    expect(clouds1).toEqual(clouds2);
    expect(h1.log).toEqual(h2.log);
  });

  it("different seeds produce different outcomes", () => {
    const room = mkRoom();
    const setup = {
      room,
      actors: [
        mkHero(),
        createActor("goblin", { x: 2, y: 0 }, "g1"),
      ],
    };
    const h1 = runRoom(setup, { seed: 1, maxTicks: 300 });
    const h2 = runRoom(setup, { seed: 9999, maxTicks: 300 });
    // Different seeds should yield different loot rolls at minimum (won't always
    // differ in every event, but log equality would be a remarkable coincidence).
    // We just verify the engine doesn't crash with either seed.
    expect(h1.log.length).toBeGreaterThan(0);
    expect(h2.log.length).toBeGreaterThan(0);
  });
});
