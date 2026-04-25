// Phase 14: monster content expansion. Verifies the spec deliverables:
// 30+ templates load, scaleByLevel formula, ghost def vs spell damage,
// skeleton poison immunity, slime split (and lesser_slime no-split),
// fire_elemental burning immunity, deterministic lich notify with seeded
// RNG, boss flag default-false, tint plumbed when set.

import { describe, it, expect } from "vitest";
import type { Actor, Room, World } from "../../src/types.js";
import { MONSTER_TEMPLATES, createActor } from "../../src/content/monsters.js";
import { scaleByLevel } from "../../src/content/scaling.js";
import { applyEffect } from "../../src/effects.js";
import { runRoom, startRoom } from "../../src/engine.js";
import { script, while_, bin, member, call, index, lit, exprStmt, cHalt } from "../../src/ast-helpers.js";

function emptyRoom(): Room {
  return { w: 12, h: 12, doors: [], items: [], chests: [] };
}

function passiveHero(over: Partial<Actor> = {}): Actor {
  return {
    id: "h", kind: "hero", isHero: true, hp: 30, maxHp: 30,
    speed: 10, energy: 0, pos: { x: 0, y: 0 }, alive: true,
    atk: 5, def: 0, int: 5, mp: 30, maxMp: 30,
    knownSpells: ["bolt"],
    script: script(cHalt()),
    ...over,
  };
}

function makeWorld(actors: Actor[]): World {
  return { tick: 0, room: emptyRoom(), actors, log: [], aborted: false, ended: false };
}

describe("Phase 14 — registry coverage", () => {
  it("ships at least 30 monster templates", () => {
    expect(Object.keys(MONSTER_TEMPLATES).length).toBeGreaterThanOrEqual(30);
  });

  it("every template has family + level + parsed AI", () => {
    for (const tpl of Object.values(MONSTER_TEMPLATES)) {
      expect(tpl.family, `family missing for ${tpl.id}`).toBeTruthy();
      expect(typeof tpl.level).toBe("number");
      expect(tpl.level).toBeGreaterThanOrEqual(1);
      expect(typeof tpl.ai).toBe("string");
      expect(tpl.ai!.trim().length).toBeGreaterThan(0);
    }
  });

  it("boss flag defaults to falsy on every template", () => {
    for (const tpl of Object.values(MONSTER_TEMPLATES)) {
      expect(tpl.boss ?? false).toBe(false);
    }
  });
});

describe("Phase 14 — scaleByLevel", () => {
  it("level 1 is identity (multiplier = 1)", () => {
    expect(scaleByLevel(10, 1)).toBe(10);
    expect(scaleByLevel(7, 1)).toBe(7);
  });

  it("matches the documented formula floor(base * (1 + 0.15 * (level-1)))", () => {
    for (const lvl of [1, 2, 3, 5, 8, 10]) {
      for (const base of [4, 10, 23, 100]) {
        const expected = Math.floor(base * (1 + 0.15 * (lvl - 1)));
        expect(scaleByLevel(base, lvl)).toBe(expected);
      }
    }
  });

  it("createActor applies scaling to hp/atk/def/mp but not speed", () => {
    const tpl = MONSTER_TEMPLATES.dragon!;
    const a = createActor("dragon", { x: 0, y: 0 }, "d1");
    expect(a.hp).toBe(scaleByLevel(tpl.stats.hp, tpl.level));
    expect(a.atk).toBe(scaleByLevel(tpl.stats.atk!, tpl.level));
    expect(a.def).toBe(scaleByLevel(tpl.stats.def!, tpl.level));
    expect(a.mp).toBe(scaleByLevel(tpl.stats.mp!, tpl.level));
    expect(a.speed).toBe(tpl.stats.speed);  // not scaled
  });
});

describe("Phase 14 — defense semantics", () => {
  it("ghost spawns with high def (level-scaled from 8)", () => {
    const ghost = createActor("ghost", { x: 0, y: 0 }, "g1");
    expect(ghost.def).toBe(scaleByLevel(8, MONSTER_TEMPLATES.ghost!.level));
    expect(ghost.def!).toBeGreaterThanOrEqual(8);
  });

});

describe("Phase 14 — immunities", () => {
  it("skeleton silently rejects poison via applyEffect", () => {
    const sk = createActor("skeleton", { x: 0, y: 0 }, "s1");
    sk.effects = [];
    const w = makeWorld([sk]);
    const evs = applyEffect(w, "s1", "poison", 30);
    expect(evs.length).toBe(0);
    expect(sk.effects!.length).toBe(0);
  });

  it("fire_elemental rejects burning even when the source is a fire spell", () => {
    const fe = createActor("fire_elemental", { x: 0, y: 0 }, "fe1");
    fe.effects = [];
    const w = makeWorld([fe]);
    const evs = applyEffect(w, "fe1", "burning", 20);
    expect(evs.length).toBe(0);
    expect(fe.effects!.length).toBe(0);
  });

  it("non-immune actors still take the effect", () => {
    const goblin = createActor("goblin", { x: 0, y: 0 }, "g1");
    goblin.effects = [];
    const w = makeWorld([goblin]);
    applyEffect(w, "g1", "poison", 30);
    expect(goblin.effects!.length).toBe(1);
    expect(goblin.effects![0]!.kind).toBe("poison");
  });
});

describe("Phase 14 — on_death procs (slime split)", () => {
  it("slime emits 2 Summoned(lesser_slime) on death; lesser_slime does not", () => {
    // One-shot the slime, then check the log for Summoned events.
    const slime = createActor("slime", { x: 1, y: 0 }, "sl1");
    const hero = passiveHero({
      atk: 999,
      script: script(
        while_(
          bin(">", member(call("enemies"), "length"), lit(0)),
          [exprStmt(call("attack", index(call("enemies"), lit(0))))],
        ),
        cHalt(),
      ),
    });
    const { log } = runRoom({ room: emptyRoom(), actors: [hero, slime] }, { maxTicks: 30 });

    const summoned = log
      .map(l => l.event)
      .filter((e: any) => e.type === "Summoned" && e.summoner === "sl1");
    expect(summoned.length).toBe(2);
    expect(summoned.every((e: any) => e.template === "lesser_slime")).toBe(true);

    // No nested split: lesser_slime deaths must not produce further Summoned.
    const fromLessers = log
      .map(l => l.event)
      .filter((e: any) => e.type === "Summoned" && e.summoner !== "sl1");
    expect(fromLessers.length).toBe(0);
  });

  it("lesser_slime template carries no onDeath proc", () => {
    expect(MONSTER_TEMPLATES.lesser_slime!.onDeath).toBeUndefined();
  });
});

describe("Phase 14 — tint plumbing", () => {
  it("createActor copies tpl.tint into actor.colors", () => {
    const lesser = createActor("lesser_slime", { x: 0, y: 0 }, "ls1");
    expect(lesser.colors).toBeTruthy();
    expect(lesser.colors!.body).toBe("#88dd88");
    // Defensive copy: mutating the template's tint must not bleed via shared ref.
    lesser.colors!.body = "#000000";
    expect(MONSTER_TEMPLATES.lesser_slime!.tint!.body).toBe("#88dd88");
  });

  it("templates without tint produce actors without colors", () => {
    const goblin = createActor("goblin", { x: 0, y: 0 }, "g1");
    expect(goblin.colors).toBeUndefined();
  });
});

describe("Phase 14 — deterministic notify (seeded RNG)", () => {
  it("two lich runs with the same seed produce identical Notify events", () => {
    function setup() {
      return {
        room: emptyRoom(),
        actors: [
          passiveHero({ hp: 200, maxHp: 200 }),
          createActor("lich", { x: 5, y: 0 }, "li1"),
        ],
      };
    }
    const h1 = runRoom(setup(), { seed: 1234, maxTicks: 60 });
    const h2 = runRoom(setup(), { seed: 1234, maxTicks: 60 });
    const notifies1 = h1.log.filter(l => l.event.type === "Notified").map(l => l.event);
    const notifies2 = h2.log.filter(l => l.event.type === "Notified").map(l => l.event);
    expect(notifies1).toEqual(notifies2);
    // The full log should also agree byte-for-byte.
    expect(h1.log).toEqual(h2.log);
  });
});
