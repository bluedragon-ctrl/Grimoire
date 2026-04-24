// One smoke test per spell: legal cast from a valid source + target
// yields a Cast event (no ActionFailed) and the expected broad event shape.

import { describe, it, expect } from "vitest";
import type { Actor, Room, World } from "../../src/types.js";
import { castSpell } from "../../src/spells/cast.js";
import { SPELLS } from "../../src/content/spells.js";
import { script, cHalt } from "../../src/ast-helpers.js";

const ALL_SPELLS = Object.keys(SPELLS);

function mkWorld(actors: Actor[], room?: Partial<Room>): World {
  return {
    tick: 0,
    room: { w: 10, h: 10, doors: [], items: [], chests: [], clouds: [], ...room },
    actors, log: [], aborted: false, ended: false,
  };
}

function hero(pos = { x: 0, y: 0 }, int = 0): Actor {
  return {
    id: "h", kind: "hero", isHero: true,
    hp: 50, maxHp: 50, speed: 12, energy: 0, alive: true,
    script: script(cHalt()),
    mp: 40, maxMp: 40, atk: 3, def: 0, int, effects: [],
    knownSpells: ALL_SPELLS,
    pos,
  };
}

function enemy(id: string, pos: { x: number; y: number }): Actor {
  return {
    id, kind: "goblin", hp: 30, maxHp: 30, speed: 10, energy: 0, alive: true,
    script: script(cHalt()),
    mp: 0, maxMp: 0, atk: 1, def: 0, int: 0, effects: [], knownSpells: [], pos,
  };
}

function ally(id: string, pos: { x: number; y: number }, hp = 20): Actor {
  return {
    id, kind: "hero", isHero: true,
    hp, maxHp: 20, speed: 12, energy: 0, alive: true,
    script: script(cHalt()),
    mp: 0, maxMp: 0, atk: 1, def: 0, int: 0, effects: [], knownSpells: [], pos,
  };
}

function assertCast(events: ReturnType<typeof castSpell>, spell: string): void {
  const failed = events.find(e => e.type === "ActionFailed") as any;
  if (failed) throw new Error(`${spell}: unexpected ActionFailed — ${failed.reason}`);
  expect(events.find(e => e.type === "Cast")).toBeDefined();
}

describe("spell smoke tests — all 20 spells", () => {
  // ── Single-target damage ────────────────────────────────────────────────────
  it("bolt: Cast + Hit", () => {
    const h = hero();
    const e = enemy("e", { x: 3, y: 0 });
    const events = castSpell(mkWorld([h, e]), h, "bolt", e);
    assertCast(events, "bolt");
    expect(events.find(ev => ev.type === "Hit")).toBeDefined();
  });

  it("firebolt: Cast + Hit + burning EffectApplied", () => {
    const h = hero();
    const e = enemy("e", { x: 3, y: 0 });
    const events = castSpell(mkWorld([h, e]), h, "firebolt", e);
    assertCast(events, "firebolt");
    expect(events.find(ev => ev.type === "Hit")).toBeDefined();
    const ea = events.find(ev => ev.type === "EffectApplied") as any;
    expect(ea?.kind).toBe("burning");
  });

  it("frost_lance: Cast + Hit + chill EffectApplied", () => {
    const h = hero();
    const e = enemy("e", { x: 3, y: 0 });
    const events = castSpell(mkWorld([h, e]), h, "frost_lance", e);
    assertCast(events, "frost_lance");
    expect(events.find(ev => ev.type === "Hit")).toBeDefined();
    const ea = events.find(ev => ev.type === "EffectApplied") as any;
    expect(ea?.kind).toBe("chill");
  });

  it("shock_bolt: Cast + Hit + shock EffectApplied", () => {
    const h = hero();
    const e = enemy("e", { x: 3, y: 0 });
    const events = castSpell(mkWorld([h, e]), h, "shock_bolt", e);
    assertCast(events, "shock_bolt");
    expect(events.find(ev => ev.type === "Hit")).toBeDefined();
    const ea = events.find(ev => ev.type === "EffectApplied") as any;
    expect(ea?.kind).toBe("shock");
  });

  it("venom_dart: Cast + Hit + poison EffectApplied", () => {
    const h = hero();
    const e = enemy("e", { x: 3, y: 0 });
    const events = castSpell(mkWorld([h, e]), h, "venom_dart", e);
    assertCast(events, "venom_dart");
    expect(events.find(ev => ev.type === "Hit")).toBeDefined();
    const ea = events.find(ev => ev.type === "EffectApplied") as any;
    expect(ea?.kind).toBe("poison");
  });

  it("curse: Cast + expose EffectApplied on enemy", () => {
    const h = hero();
    const e = enemy("e", { x: 2, y: 0 });
    const events = castSpell(mkWorld([h, e]), h, "curse", e);
    assertCast(events, "curse");
    const ea = events.find(ev => ev.type === "EffectApplied") as any;
    expect(ea?.kind).toBe("expose");
  });

  it("mana_leech: Cast + mana_burn EffectApplied on enemy", () => {
    const h = hero();
    const e = enemy("e", { x: 2, y: 0 });
    const events = castSpell(mkWorld([h, e]), h, "mana_leech", e);
    assertCast(events, "mana_leech");
    const ea = events.find(ev => ev.type === "EffectApplied") as any;
    expect(ea?.kind).toBe("mana_burn");
  });

  // ── AoE ─────────────────────────────────────────────────────────────────────
  it("fireball: Cast + VisualBurst + Hit on enemy in blast", () => {
    const h = hero();
    const e = enemy("e", { x: 3, y: 0 });
    const events = castSpell(mkWorld([h, e]), h, "fireball", { x: 3, y: 0 });
    assertCast(events, "fireball");
    expect(events.find(ev => ev.type === "VisualBurst")).toBeDefined();
    expect(events.find(ev => ev.type === "Hit")).toBeDefined();
  });

  it("frost_nova: Cast + VisualBurst, hits nearby enemy, caster untouched", () => {
    const h = hero({ x: 3, y: 3 });
    const e = enemy("e", { x: 4, y: 3 });
    const events = castSpell(mkWorld([h, e]), h, "frost_nova", h);
    assertCast(events, "frost_nova");
    expect(events.find(ev => ev.type === "VisualBurst")).toBeDefined();
    expect(h.hp).toBe(50);
    const ea = events.find(ev => ev.type === "EffectApplied") as any;
    expect(ea?.kind).toBe("chill");
  });

  it("thunderclap: Cast + VisualBurst, hits nearby enemy, caster untouched", () => {
    const h = hero({ x: 3, y: 3 });
    const e = enemy("e", { x: 4, y: 3 });
    const events = castSpell(mkWorld([h, e]), h, "thunderclap", h);
    assertCast(events, "thunderclap");
    expect(h.hp).toBe(50);
    const ea = events.find(ev => ev.type === "EffectApplied") as any;
    expect(ea?.kind).toBe("shock");
  });

  it("meteor: Cast + VisualBurst + Hit", () => {
    const h = hero();
    const e = enemy("e", { x: 3, y: 0 });
    const events = castSpell(mkWorld([h, e]), h, "meteor", { x: 3, y: 0 });
    assertCast(events, "meteor");
    expect(events.find(ev => ev.type === "VisualBurst")).toBeDefined();
    expect(events.find(ev => ev.type === "Hit")).toBeDefined();
  });

  // ── Clouds ───────────────────────────────────────────────────────────────────
  it("firewall: Cast + CloudSpawned with kind=fire", () => {
    const h = hero();
    const events = castSpell(mkWorld([h]), h, "firewall", { x: 2, y: 0 });
    assertCast(events, "firewall");
    const cs = events.find(ev => ev.type === "CloudSpawned") as any;
    expect(cs?.kind).toBe("fire");
  });

  it("poison_cloud: Cast + CloudSpawned with kind=poison", () => {
    const h = hero();
    const events = castSpell(mkWorld([h]), h, "poison_cloud", { x: 2, y: 0 });
    assertCast(events, "poison_cloud");
    const cs = events.find(ev => ev.type === "CloudSpawned") as any;
    expect(cs?.kind).toBe("poison");
  });

  // ── Buffs ─────────────────────────────────────────────────────────────────────
  it("bless: Cast + haste EffectApplied on ally", () => {
    const h = hero();
    const a = ally("a", { x: 1, y: 0 });
    const events = castSpell(mkWorld([h, a]), h, "bless", a);
    assertCast(events, "bless");
    const ea = events.find(ev => ev.type === "EffectApplied") as any;
    expect(ea?.kind).toBe("haste");
  });

  it("might: Cast + might EffectApplied on caster", () => {
    const h = hero();
    const events = castSpell(mkWorld([h]), h, "might", h);
    assertCast(events, "might");
    const ea = events.find(ev => ev.type === "EffectApplied") as any;
    expect(ea?.kind).toBe("might");
  });

  it("iron_skin: Cast + iron_skin EffectApplied", () => {
    const h = hero();
    const events = castSpell(mkWorld([h]), h, "iron_skin", h);
    assertCast(events, "iron_skin");
    const ea = events.find(ev => ev.type === "EffectApplied") as any;
    expect(ea?.kind).toBe("iron_skin");
  });

  it("mind_spark: Cast + power EffectApplied", () => {
    const h = hero();
    const events = castSpell(mkWorld([h]), h, "mind_spark", h);
    assertCast(events, "mind_spark");
    const ea = events.find(ev => ev.type === "EffectApplied") as any;
    expect(ea?.kind).toBe("power");
  });

  it("focus: Cast + mana_regen EffectApplied", () => {
    const h = hero();
    const events = castSpell(mkWorld([h]), h, "focus", h);
    assertCast(events, "focus");
    const ea = events.find(ev => ev.type === "EffectApplied") as any;
    expect(ea?.kind).toBe("mana_regen");
  });

  it("shield: Cast + shield EffectApplied", () => {
    const h = hero();
    const events = castSpell(mkWorld([h]), h, "shield", h);
    assertCast(events, "shield");
    const ea = events.find(ev => ev.type === "EffectApplied") as any;
    expect(ea?.kind).toBe("shield");
  });

  // ── Heal ─────────────────────────────────────────────────────────────────────
  it("heal: Cast + Healed event on wounded ally", () => {
    const h = hero();
    const a = ally("a", { x: 1, y: 0 }, 10); // hp=10, needs healing
    const events = castSpell(mkWorld([h, a]), h, "heal", a);
    assertCast(events, "heal");
    expect(events.find(ev => ev.type === "Healed")).toBeDefined();
  });
});
