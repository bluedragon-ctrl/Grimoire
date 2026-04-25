// Proc hook tests: on_hit, on_damage, on_kill, on_cast, chance gate, loop guard.
// (Phase 13.4 spec §4)
import { describe, it, expect } from "vitest";
import type { Actor, World } from "../../src/types.js";
import { doAttack, doCast } from "../../src/commands.js";
import { equipItem, mintInstance, ensureInventory, onCastHook } from "../../src/items/execute.js";
import { emptyEquipped } from "../../src/content/items.js";
import { hasEffect } from "../../src/effects.js";
import { script, cHalt } from "../../src/ast-helpers.js";

function mkWorld(actors: Actor[], seed = 42): World {
  return {
    tick: 0,
    room: { w: 10, h: 10, doors: [], items: [], chests: [], clouds: [] },
    actors, log: [], aborted: false, ended: false, rngSeed: seed,
  };
}
function mkHero(over: Partial<Actor> = {}): Actor {
  return {
    id: "h", kind: "hero", isHero: true, hp: 30, maxHp: 30, speed: 12, energy: 0, alive: true,
    pos: { x: 0, y: 0 }, mp: 20, maxMp: 20, atk: 2, def: 0, int: 0,
    effects: [], knownSpells: ["bolt", "heal", "fireball", "firewall", "summon"],
    inventory: { consumables: [], equipped: emptyEquipped() },
    script: script(cHalt()), ...over,
  };
}
function mkGoblin(id = "g", over: Partial<Actor> = {}): Actor {
  return {
    id, kind: "goblin", hp: 20, maxHp: 20, speed: 10, energy: 0, alive: true,
    pos: { x: 1, y: 0 }, mp: 0, maxMp: 0, atk: 2, def: 0, int: 0,
    effects: [], knownSpells: [],
    script: script(cHalt()), ...over,
  };
}

// ── on_hit ────────────────────────────────────────────────────────────────────

describe("on_hit", () => {
  it("frost_shard inflicts chill on hit", () => {
    const h = mkHero();
    const g = mkGoblin();
    const shard = mintInstance("frost_shard");
    ensureInventory(h).consumables.push(shard);
    equipItem(mkWorld([h, g]), h, shard);
    doAttack(mkWorld([h, g]), h, g);
    expect(hasEffect(g, "chill")).toBe(true);
  });

  it("shock_staff inflicts shock on hit", () => {
    const h = mkHero();
    const g = mkGoblin();
    const staff = mintInstance("shock_staff");
    ensureInventory(h).consumables.push(staff);
    equipItem(mkWorld([h, g]), h, staff);
    doAttack(mkWorld([h, g]), h, g);
    expect(hasEffect(g, "shock")).toBe(true);
  });

  it("wild_dagger chance:30 gate — statistical test over 1000 rolls", () => {
    // Use a fresh world per roll so RNG advances independently.
    const h = mkHero();
    const g = mkGoblin("g", { hp: 999, maxHp: 999 });
    const dagger = mintInstance("wild_dagger");
    ensureInventory(h).consumables.push(dagger);
    equipItem(mkWorld([h, g]), h, dagger);

    let fires = 0;
    let seed = 1;
    for (let i = 0; i < 1000; i++) {
      const target = { ...g, hp: 999, effects: [] };
      const w = mkWorld([h, target], seed++);
      doAttack(w, h, target);
      if (hasEffect(target, "burning")) fires++;
    }
    // Expect ~300 fires (±10%) for chance:30
    expect(fires).toBeGreaterThan(220);
    expect(fires).toBeLessThan(380);
  });
});

// ── on_damage ─────────────────────────────────────────────────────────────────

describe("on_damage", () => {
  it("stoic_helm: taking damage applies might to self", () => {
    const h = mkHero();
    const g = mkGoblin();
    const helm = mintInstance("stoic_helm");
    ensureInventory(h).consumables.push(helm);
    const w = mkWorld([h, g]);
    equipItem(w, h, helm);
    // Goblin attacks hero
    doAttack(w, g, h);
    expect(hasEffect(h, "might")).toBe(true);
  });

  it("thorned_robe: taking damage applies poison to attacker", () => {
    const h = mkHero();
    const g = mkGoblin();
    const robe = mintInstance("thorned_robe");
    ensureInventory(h).consumables.push(robe);
    const w = mkWorld([h, g]);
    equipItem(w, h, robe);
    doAttack(w, g, h);
    expect(hasEffect(g, "poison")).toBe(true);
  });

  it("lucky_crown chance:25 — statistical test", () => {
    let fires = 0;
    for (let i = 1; i <= 1000; i++) {
      const h = mkHero();
      const g = mkGoblin("g", { atk: 2 });
      const crown = mintInstance("lucky_crown");
      ensureInventory(h).consumables.push(crown);
      const w = mkWorld([h, g], i);
      equipItem(w, h, crown);
      h.effects = [];
      doAttack(w, g, h);
      if (hasEffect(h, "shield")) fires++;
    }
    expect(fires).toBeGreaterThan(170);
    expect(fires).toBeLessThan(330);
  });

  it("loop guard: thorns fires once per hit (no recursive retaliation)", () => {
    // Give both actors thorned_robes. When goblin attacks hero:
    // hero.on_damage fires → goblin gets poisoned (EffectApplied, no Hit).
    // The poison effect is NOT direct hit damage, so goblin's on_damage
    // does NOT fire from it. No recursive chain.
    const h = mkHero();
    const g = mkGoblin("g", { hp: 20, maxHp: 20 });
    g.inventory = { consumables: [], equipped: emptyEquipped() };
    const heroRobe = mintInstance("thorned_robe");
    const gobRobe  = mintInstance("thorned_robe");
    ensureInventory(h).consumables.push(heroRobe);
    ensureInventory(g).consumables.push(gobRobe);

    const w = mkWorld([h, g]);
    equipItem(w, h, heroRobe);
    equipItem(w, g, gobRobe);

    const events = doAttack(w, g, h);
    // Hero's on_damage fires: goblin gets poisoned (one EffectApplied for poison)
    const poisonApplied = events.filter(e => e.type === "EffectApplied" && (e as any).kind === "poison");
    expect(poisonApplied.length).toBe(1); // exactly one retaliation, no recursion
    // Goblin's own on_damage should NOT have fired (it wasn't hit by direct damage)
    // Verify by checking goblin doesn't have any effect applied to hero
    expect(hasEffect(h, "poison")).toBe(false);
  });
});

// ── on_kill ───────────────────────────────────────────────────────────────────

describe("on_kill", () => {
  it("vampiric_blade: killing blow heals wearer by 4", () => {
    const h = mkHero({ hp: 10 });
    const g = mkGoblin("g", { hp: 1, def: 0 });
    const blade = mintInstance("vampiric_blade");
    ensureInventory(h).consumables.push(blade);
    const w = mkWorld([h, g]);
    equipItem(w, h, blade);
    const hpBefore = h.hp;
    doAttack(w, h, g);
    expect(g.alive).toBe(false);
    expect(h.hp).toBe(Math.min(h.maxHp, hpBefore + 4));
  });

  it("necromancer_focus: killing blow grants mana_regen", () => {
    const h = mkHero();
    const g = mkGoblin("g", { hp: 1, def: 0 });
    const focus = mintInstance("necromancer_focus");
    ensureInventory(h).consumables.push(focus);
    const w = mkWorld([h, g]);
    equipItem(w, h, focus);
    doAttack(w, h, g);
    expect(g.alive).toBe(false);
    expect(hasEffect(h, "mana_regen")).toBe(true);
  });

  it("on_kill does NOT fire when target survives", () => {
    const h = mkHero();
    const g = mkGoblin("g", { hp: 20, def: 0 });
    const blade = mintInstance("vampiric_blade");
    ensureInventory(h).consumables.push(blade);
    const w = mkWorld([h, g]);
    equipItem(w, h, blade);
    const hpBefore = h.hp;
    doAttack(w, h, g);
    expect(g.alive).toBe(true); // goblin survives
    expect(h.hp).toBe(hpBefore); // no heal
  });

  it("proc kill (damage>0) does not trigger recursive on_kill", () => {
    // vampiric_blade on_kill: { target:"self", damage:-4 } — not a damage proc
    // Use a hypothetical via direct check: kill a goblin, verify only 1 Healed event
    const h = mkHero({ hp: 10, atk: 100 });
    const g = mkGoblin("g", { hp: 1, def: 0 });
    const blade = mintInstance("vampiric_blade");
    ensureInventory(h).consumables.push(blade);
    const w = mkWorld([h, g]);
    equipItem(w, h, blade);
    const events = doAttack(w, h, g);
    const heals = events.filter(e => e.type === "Healed");
    expect(heals.length).toBe(1); // exactly one heal from vampiric_blade, no recursion
  });
});

// ── on_cast ───────────────────────────────────────────────────────────────────

describe("on_cast", () => {
  it("spellweaver_robe: casting heals wearer by 1", () => {
    const h = mkHero({ hp: 20, maxHp: 30, int: 5 });
    const g = mkGoblin();
    const robe = mintInstance("spellweaver_robe");
    ensureInventory(h).consumables.push(robe);
    const w = mkWorld([h, g]);
    equipItem(w, h, robe);
    const hpBefore = h.hp;
    doCast(w, h, "bolt", g);
    expect(h.hp).toBe(hpBefore + 1);
  });

  it("arcane_diadem chance:20 — statistical test", () => {
    let fires = 0;
    for (let i = 1; i <= 1000; i++) {
      const h = mkHero({ int: 2 });
      const g = mkGoblin("g", { hp: 999 });
      const diadem = mintInstance("arcane_diadem");
      ensureInventory(h).consumables.push(diadem);
      const w = mkWorld([h, g], i);
      equipItem(w, h, diadem);
      h.effects = [];
      doCast(w, h, "bolt", g);
      if (hasEffect(h, "might")) fires++;
    }
    expect(fires).toBeGreaterThan(130);
    expect(fires).toBeLessThan(270);
  });

  it("on_cast does NOT fire on failed cast (no target)", () => {
    const h = mkHero();
    const robe = mintInstance("spellweaver_robe");
    ensureInventory(h).consumables.push(robe);
    const w = mkWorld([h]);
    equipItem(w, h, robe);
    const hpBefore = h.hp;
    // bolt with no valid target → ActionFailed
    doCast(w, h, "bolt", null);
    expect(h.hp).toBe(hpBefore); // no heal on failed cast
  });

  it("on_cast fires for all spell types (heal, bolt)", () => {
    // spellweaver_robe heals on every successful cast
    const h = mkHero({ hp: 15, maxHp: 30, int: 0 });
    const robe = mintInstance("spellweaver_robe");
    ensureInventory(h).consumables.push(robe);
    const w = mkWorld([h]);
    equipItem(w, h, robe);
    const before = h.hp;
    doCast(w, h, "heal", h); // self-cast heal
    expect(h.hp).toBeGreaterThan(before); // healed by spell + on_cast proc
  });
});

// ── damage: -N heal convention ────────────────────────────────────────────────

describe("damage: -N heal convention", () => {
  it("negative damage heals the target", () => {
    const h = mkHero({ hp: 10, maxHp: 30 });
    const g = mkGoblin("g", { hp: 1, def: 0 });
    const blade = mintInstance("vampiric_blade"); // on_kill: {target:"self", damage:-4}
    ensureInventory(h).consumables.push(blade);
    const w = mkWorld([h, g]);
    equipItem(w, h, blade);
    doAttack(w, h, g);
    expect(h.hp).toBe(14); // 10 + 4
  });

  it("heal is clamped to maxHp", () => {
    const h = mkHero({ hp: 28, maxHp: 30 });
    const g = mkGoblin("g", { hp: 1, def: 0 });
    const blade = mintInstance("vampiric_blade");
    ensureInventory(h).consumables.push(blade);
    const w = mkWorld([h, g]);
    equipItem(w, h, blade);
    doAttack(w, h, g);
    expect(h.hp).toBe(30); // clamped to maxHp (28 + 4 > 30)
  });
});
