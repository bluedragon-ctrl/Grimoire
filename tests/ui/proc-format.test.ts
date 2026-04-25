// Tests for the shared wearable proc formatter (src/ui/proc-format.ts).

import { describe, it, expect } from "vitest";
import {
  formatAura,
  formatOnHit,
  formatOnDamage,
  formatOnKill,
  formatOnCast,
  formatItemProcs,
} from "../../src/ui/proc-format.js";
import type { ItemDef } from "../../src/types.js";

// ── formatAura ─────────────────────────────────────────────────────────────

describe("formatAura", () => {
  it("shows magnitude=1 as +1/turn", () => {
    expect(formatAura({ kind: "regen", magnitude: 1 })).toBe("While equipped: regen +1/turn");
  });
  it("shows magnitude=2 as +2/turn", () => {
    expect(formatAura({ kind: "haste", magnitude: 2 })).toBe("While equipped: haste +2/turn");
  });
  it("defaults to +1/turn when magnitude omitted", () => {
    expect(formatAura({ kind: "mana_regen" })).toBe("While equipped: mana_regen +1/turn");
  });
});

// ── formatOnHit ────────────────────────────────────────────────────────────

describe("formatOnHit", () => {
  it("100% chance: no chance prefix", () => {
    expect(formatOnHit({ target: "victim", effect: { kind: "burning", duration: 20 } }))
      .toBe("On melee hit: inflict burning (20 turns)");
  });
  it("partial chance: shows percentage", () => {
    expect(formatOnHit({ target: "victim", chance: 30, effect: { kind: "burning", duration: 15 } }))
      .toBe("On melee hit: 30% chance to inflict burning (15 turns)");
  });
  it("heal on hit (damage < 0)", () => {
    expect(formatOnHit({ target: "self", damage: -4 }))
      .toBe("On melee hit: heal 4");
  });
});

// ── formatOnDamage ─────────────────────────────────────────────────────────

describe("formatOnDamage", () => {
  it("self-gain (iron-skin on hit)", () => {
    expect(formatOnDamage({ target: "self", effect: { kind: "might", duration: 5 } }))
      .toBe("When hit: gain might (5 turns)");
  });
  it("applies to attacker", () => {
    expect(formatOnDamage({ target: "attacker", effect: { kind: "poison", duration: 15 } }))
      .toBe("When hit: applies poison (15 turns) to attacker");
  });
  it("25% chance self-shield", () => {
    expect(formatOnDamage({ target: "self", chance: 25, effect: { kind: "shield", duration: 10 } }))
      .toBe("When hit: 25% chance to gain shield (10 turns)");
  });
  it("gain HP (negative damage)", () => {
    expect(formatOnDamage({ target: "self", damage: -3 }))
      .toBe("When hit: gain 3 HP");
  });
});

// ── formatOnKill ───────────────────────────────────────────────────────────

describe("formatOnKill", () => {
  it("heal on kill", () => {
    expect(formatOnKill({ target: "self", damage: -4 })).toBe("On kill: heal 4");
  });
  it("gain mana_regen on kill", () => {
    expect(formatOnKill({ target: "self", effect: { kind: "mana_regen", duration: 15 } }))
      .toBe("On kill: gain mana_regen (15 turns)");
  });
});

// ── formatOnCast ───────────────────────────────────────────────────────────

describe("formatOnCast", () => {
  it("heal on cast", () => {
    expect(formatOnCast({ target: "self", damage: -1 })).toBe("On cast: heal 1");
  });
  it("20% chance to gain might", () => {
    expect(formatOnCast({ target: "self", chance: 20, effect: { kind: "might", duration: 5 } }))
      .toBe("On cast: 20% chance to gain might (5 turns)");
  });
});

// ── formatItemProcs ────────────────────────────────────────────────────────

describe("formatItemProcs", () => {
  it("pure-stat wearable returns no proc lines", () => {
    const item: ItemDef = {
      id: "wooden_staff", name: "Wooden Staff", description: "...",
      kind: "equipment", level: 1, slot: "staff",
      bonuses: { int: 3 },
    };
    expect(formatItemProcs(item)).toEqual([]);
  });

  it("consumable returns no proc lines", () => {
    const item: ItemDef = {
      id: "health_potion", name: "Health Potion", description: "...",
      kind: "consumable", level: 1, useTarget: "ally", range: 4,
      body: [{ op: "heal", args: { amount: 10 } }],
    };
    expect(formatItemProcs(item)).toEqual([]);
  });

  it("Crown of Ages: aura line", () => {
    const item: ItemDef = {
      id: "crown_of_ages", name: "Crown of Ages", description: "...",
      kind: "equipment", level: 1, slot: "hat",
      bonuses: { int: 5 },
      aura: { kind: "regen", magnitude: 1 },
    };
    expect(formatItemProcs(item)).toEqual(["While equipped: regen +1/turn"]);
  });

  it("Wild Dagger: on_hit with chance", () => {
    const item: ItemDef = {
      id: "wild_dagger", name: "Wild Dagger", description: "...",
      kind: "equipment", level: 1, slot: "dagger",
      bonuses: { atk: 4 },
      on_hit: { target: "victim", chance: 30, effect: { kind: "burning", duration: 15 } },
    };
    const lines = formatItemProcs(item);
    expect(lines).toEqual(["On melee hit: 30% chance to inflict burning (15 turns)"]);
  });

  it("item with all proc fields produces all lines in order", () => {
    const item: ItemDef = {
      id: "test_item", name: "Test Item", description: "...",
      kind: "equipment", level: 1, slot: "focus",
      bonuses: {},
      aura:      { kind: "regen", magnitude: 1 },
      on_hit:    { target: "victim", effect: { kind: "burning", duration: 10 } },
      on_damage: { target: "attacker", effect: { kind: "poison", duration: 5 } },
      on_kill:   { target: "self", damage: -2 },
      on_cast:   { target: "self", damage: -1 },
    };
    const lines = formatItemProcs(item);
    expect(lines).toEqual([
      "While equipped: regen +1/turn",
      "On melee hit: inflict burning (10 turns)",
      "When hit: applies poison (5 turns) to attacker",
      "On kill: heal 2",
      "On cast: heal 1",
    ]);
  });
});
