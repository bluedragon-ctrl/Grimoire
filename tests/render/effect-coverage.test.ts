// Confirms every EffectKind produces a renderable overlay when applied via the
// adapter, and every spell in SPELLS resolves to a non-undefined projectile
// (or at least a named fallback) when its Cast event reaches the adapter.

import { describe, it, expect } from "vitest";
import { WireRendererAdapter, type WireDeps } from "../../src/render/wire-adapter.js";
import { SPELLS } from "../../src/content/spells.js";
import { EFFECT_OVERLAY_PRESETS } from "../../src/content/visuals.js";
import type { Actor, GameEvent, Room } from "../../src/types.js";

function makeAdapter() {
  const deps: Partial<WireDeps> = {
    init: () => {},
    render: () => {},
    schedule: () => 0,
    cancel: () => {},
    runFrameLoop: false,
  };
  return new WireRendererAdapter(deps);
}

const room: Room = { w: 8, h: 6, doors: [], items: [], chests: [] };

function hero(pos = { x: 1, y: 1 }): Actor {
  return {
    id: "hero", kind: "hero", isHero: true,
    hp: 20, maxHp: 20, speed: 1, energy: 0, pos,
    script: { main: [], handlers: [], funcs: [] }, alive: true,
  };
}

function goblin(id: string, pos = { x: 5, y: 3 }): Actor {
  return {
    id, kind: "goblin", hp: 6, maxHp: 6, speed: 1, energy: 0, pos,
    script: { main: [], handlers: [], funcs: [] }, alive: true,
  };
}

// ── EffectKind → overlay coverage ────────────────────────────────────────────

describe("effect overlay coverage", () => {
  // All EffectKind values registered in EFFECT_OVERLAY_PRESETS.
  const effectKinds = Object.keys(EFFECT_OVERLAY_PRESETS) as (keyof typeof EFFECT_OVERLAY_PRESETS)[];

  it("EFFECT_OVERLAY_PRESETS covers all five EffectKind values", () => {
    const expected = ["burning", "poison", "regen", "haste", "slow"].sort();
    expect(effectKinds.sort()).toEqual(expected);
  });

  for (const kind of effectKinds) {
    it(`EffectApplied(kind='${kind}') pushes a named overlay onto the actor`, () => {
      const adapter = makeAdapter();
      const el = document.createElement("div");
      adapter.mount(el, room, [hero()]);

      adapter.apply({ type: "EffectApplied", actor: "hero", kind });

      const effs = adapter.getState()!.activeEffects;
      expect(effs).toHaveLength(1);
      expect(effs[0]!.kind).toBe("overlay");
      expect(effs[0]!.name).toBeTruthy();
      expect(effs[0]!.effectKind).toBe(kind);
      expect(effs[0]!.colors?.color).toBeTruthy();
    });
  }
});

// ── Spell Cast → preset resolution ───────────────────────────────────────────

describe("spell Cast visual resolution", () => {
  const spellIds = Object.keys(SPELLS);

  for (const spellId of spellIds) {
    const spell = SPELLS[spellId]!;

    it(`spell '${spellId}' Cast event resolves a named effect in the adapter`, () => {
      const adapter = makeAdapter();
      const el = document.createElement("div");
      const g = goblin("g1");
      adapter.mount(el, room, [hero(), g]);

      // Construct a synthetic Cast event mimicking what castSpell() would emit.
      // Pull visual/element from the first op's args so we match the real signal.
      const firstOp = spell.body[0]!;
      const castEvent: GameEvent = {
        type: "Cast",
        actor: "hero",
        spell: spellId,
        target: spell.targetType !== "tile" && spell.targetType !== "self" ? "g1" : undefined,
        amount: 0,
        ...(typeof firstOp.args.visual  === "string" ? { visual:  firstOp.args.visual  } : {}),
        ...(typeof firstOp.args.element === "string" ? { element: firstOp.args.element } : {}),
      };
      adapter.apply(castEvent);

      const effs = adapter.getState()!.activeEffects;
      expect(effs.length).toBeGreaterThan(0);
      // The pushed effect must have a name — no empty/undefined name slips through.
      const pushed = effs[0]!;
      expect(pushed.name).toBeTruthy();
    });
  }
});

// ── monster sprite resolution ────────────────────────────────────────────────

describe("monster sprite resolution", () => {
  it("goblin actor resolves to a non-empty sprite string", () => {
    const adapter = makeAdapter();
    const el = document.createElement("div");
    const gob: Actor = {
      id: "g1", kind: "goblin", hp: 5, maxHp: 5, speed: 10, energy: 0,
      pos: { x: 3, y: 3 },
      script: { main: [], handlers: [], funcs: [] }, alive: true,
      visual: "skeleton",
    };
    adapter.mount(el, room, [hero(), gob]);

    const s = adapter.getState()!;
    const monsterEnt = s.monsters.find(m => m.id === "g1")!;
    expect(monsterEnt.type).toBeTruthy();
  });

  it("skeleton actor resolves to 'skeleton' sprite", () => {
    const adapter = makeAdapter();
    const el = document.createElement("div");
    const skel: Actor = {
      id: "s1", kind: "skeleton", hp: 8, maxHp: 8, speed: 10, energy: 0,
      pos: { x: 4, y: 2 },
      script: { main: [], handlers: [], funcs: [] }, alive: true,
      visual: "skeleton",
    };
    adapter.mount(el, room, [hero(), skel]);

    const s = adapter.getState()!;
    expect(s.monsters[0]!.type).toBe("skeleton");
  });

  it("cultist actor resolves to 'dark_wizard' sprite", () => {
    const adapter = makeAdapter();
    const el = document.createElement("div");
    const cultist: Actor = {
      id: "c1", kind: "cultist", hp: 4, maxHp: 4, speed: 10, energy: 0,
      pos: { x: 5, y: 2 },
      script: { main: [], handlers: [], funcs: [] }, alive: true,
      visual: "dark_wizard",
    };
    adapter.mount(el, room, [hero(), cultist]);

    const s = adapter.getState()!;
    expect(s.monsters[0]!.type).toBe("dark_wizard");
  });
});
