// Tests for Phase 13.7 visual presets: glitch_pulse, materialize, dematerialize.
// Verifies: registered in EFFECT_KIND/EFFECT_RENDERERS, correct durations,
// hero spawn pushes both preset effects, SPAWN_HOLD_MS constant.

import { describe, it, expect } from "vitest";
import {
  EFFECT_KIND,
  EFFECT_DURATION,
  EFFECT_RENDERERS,
  glitch_pulse,
  materialize,
  dematerialize,
} from "../../src/render/effects.js";
import { WireRendererAdapter, type WireDeps } from "../../src/render/wire-adapter.js";
import type { Actor, Room } from "../../src/types.js";

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

function hero(): Actor {
  return {
    id: "hero", kind: "hero", isHero: true,
    hp: 20, maxHp: 20, speed: 1, energy: 0, pos: { x: 4, y: 3 },
    script: { main: [], handlers: [], funcs: [] }, alive: true,
  };
}

// ── EFFECT_KIND registration ──────────────────────────────────────────────────

describe("preset EFFECT_KIND registration", () => {
  it("glitch_pulse is registered as 'area' kind", () => {
    expect(EFFECT_KIND.glitch_pulse).toBe("area");
  });

  it("materialize is registered as 'overlay' kind", () => {
    expect(EFFECT_KIND.materialize).toBe("overlay");
  });

  it("dematerialize is registered as 'overlay' kind", () => {
    expect(EFFECT_KIND.dematerialize).toBe("overlay");
  });
});

// ── EFFECT_DURATION values ────────────────────────────────────────────────────

describe("preset EFFECT_DURATION values", () => {
  it("glitch_pulse duration is 0.1s (~6 frames)", () => {
    expect(EFFECT_DURATION.glitch_pulse).toBe(0.1);
  });

  it("materialize duration is 0.5s", () => {
    expect(EFFECT_DURATION.materialize).toBe(0.5);
  });

  it("dematerialize duration is 0.5s", () => {
    expect(EFFECT_DURATION.dematerialize).toBe(0.5);
  });
});

// ── EFFECT_RENDERERS membership ───────────────────────────────────────────────

describe("preset EFFECT_RENDERERS membership", () => {
  it("glitch_pulse is in EFFECT_RENDERERS", () => {
    expect(typeof EFFECT_RENDERERS.glitch_pulse).toBe("function");
  });

  it("materialize is in EFFECT_RENDERERS", () => {
    expect(typeof EFFECT_RENDERERS.materialize).toBe("function");
  });

  it("dematerialize is in EFFECT_RENDERERS", () => {
    expect(typeof EFFECT_RENDERERS.dematerialize).toBe("function");
  });

  it("glitch_pulse renderer is the exported glitch_pulse function", () => {
    expect(EFFECT_RENDERERS.glitch_pulse).toBe(glitch_pulse);
  });

  it("materialize renderer is the exported materialize function", () => {
    expect(EFFECT_RENDERERS.materialize).toBe(materialize);
  });

  it("dematerialize renderer is the exported dematerialize function", () => {
    expect(EFFECT_RENDERERS.dematerialize).toBe(dematerialize);
  });
});

// ── Hero spawn animation ──────────────────────────────────────────────────────

describe("hero spawn fires glitch_pulse + materialize", () => {
  it("mount() pushes at least two active effects", () => {
    const adapter = makeAdapter();
    const el = document.createElement("div");
    adapter.mount(el, room, [hero()]);

    const effs = adapter.getState()!.activeEffects;
    expect(effs.length).toBeGreaterThanOrEqual(2);
  });

  it("glitch_pulse area effect is pushed on mount", () => {
    const adapter = makeAdapter();
    const el = document.createElement("div");
    adapter.mount(el, room, [hero()]);

    const effs = adapter.getState()!.activeEffects;
    const pulse = effs.find(e => e.name === "glitch_pulse");
    expect(pulse).toBeDefined();
    expect(pulse!.kind).toBe("area");
  });

  it("materialize overlay is pushed and attached to the hero on mount", () => {
    const adapter = makeAdapter();
    const el = document.createElement("div");
    adapter.mount(el, room, [hero()]);

    const effs = adapter.getState()!.activeEffects;
    const mat = effs.find(e => e.name === "materialize");
    expect(mat).toBeDefined();
    expect(mat!.kind).toBe("overlay");
    expect(mat!.attachTo).toBe("hero");
  });

  it("materialize effect has the correct duration (0.8s)", () => {
    const adapter = makeAdapter();
    const el = document.createElement("div");
    adapter.mount(el, room, [hero()]);

    const effs = adapter.getState()!.activeEffects;
    const mat = effs.find(e => e.name === "materialize");
    expect(mat!.duration).toBe(0.8);
  });
});

// ── Scheduler hold constant ───────────────────────────────────────────────────

describe("WireRendererAdapter.SPAWN_HOLD_MS", () => {
  it("is defined as a static readonly constant", () => {
    expect(typeof WireRendererAdapter.SPAWN_HOLD_MS).toBe("number");
  });

  it("is at least 1700ms to cover room construction + materialize", () => {
    expect(WireRendererAdapter.SPAWN_HOLD_MS).toBeGreaterThanOrEqual(1700);
  });

  it("equals 1700ms as specified", () => {
    expect(WireRendererAdapter.SPAWN_HOLD_MS).toBe(1700);
  });
});
