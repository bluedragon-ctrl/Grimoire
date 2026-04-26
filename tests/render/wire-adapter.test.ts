import { describe, it, expect } from "vitest";
import { WireRendererAdapter, type WireDeps } from "../../src/render/wire-adapter.js";
import type { Actor, GameEvent, Room } from "../../src/types.js";

// Inject no-op deps so the adapter never touches a real canvas or RAF.
// Tests drive state via apply() and observe getState() directly.
function makeAdapter() {
  const renders: unknown[] = [];
  const deps: Partial<WireDeps> = {
    init: () => {},
    render: (s) => { renders.push(s); },
    schedule: () => 0,
    cancel: () => {},
    runFrameLoop: false,
  };
  const adapter = new WireRendererAdapter(deps);
  return { adapter, renders };
}

const room: Room = { w: 8, h: 6, doors: [{ dir: "E", pos: { x: 7, y: 3 } }], chests: [] };

function hero(pos = { x: 1, y: 1 }): Actor {
  return { id: "hero", kind: "hero", isHero: true, hp: 10, maxHp: 10, speed: 1, energy: 0, pos,
           script: { main: [], handlers: [], funcs: [] }, alive: true };
}
function goblin(id: string, pos: { x: number; y: number }): Actor {
  return { id, kind: "goblin", hp: 6, maxHp: 6, speed: 1, energy: 0, pos,
           script: { main: [], handlers: [], funcs: [] }, alive: true };
}

function mount(adapter: WireRendererAdapter, actors: Actor[]) {
  const el = document.createElement("div");
  adapter.mount(el, room, actors);
  // Spawn animations (glitch_pulse + materialize) are tested in presets.test.ts.
  // Clear them so these event-focused tests start with an empty effects list.
  adapter.getState()!.activeEffects.splice(0);
  return el;
}

describe("WireRendererAdapter — scripted runs", () => {
  it("run 1: approach + attack — produces one move per step and a strike effect on hit", () => {
    const { adapter } = makeAdapter();
    mount(adapter, [hero({ x: 1, y: 1 }), goblin("g1", { x: 4, y: 1 })]);

    const events: GameEvent[] = [
      { type: "Moved", actor: "hero", from: { x: 1, y: 1 }, to: { x: 2, y: 1 } },
      { type: "Moved", actor: "hero", from: { x: 2, y: 1 }, to: { x: 3, y: 1 } },
      { type: "Attacked", attacker: "hero", defender: "g1", damage: 3 },
      { type: "Hit", actor: "g1", attacker: "hero", damage: 3 },
    ];
    events.forEach(e => adapter.apply(e));

    const s = adapter.getState()!;
    expect(s.player!.x).toBe(3);
    expect(s.player!.y).toBe(1);
    // Two effect pushes (Attacked + Hit). Both are 'explosion' areas at goblin's tile.
    expect(s.activeEffects.map(e => [e.kind, e.name])).toEqual([
      ["area", "explosion"], ["area", "explosion"],
    ]);
    expect(s.activeEffects[0]!.at).toEqual({ x: 4, y: 1 });
  });

  it("run 2: missed attack via ActionFailed — emits no visual effect", () => {
    const { adapter } = makeAdapter();
    mount(adapter, [hero(), goblin("g1", { x: 5, y: 1 })]);

    adapter.apply({ type: "ActionFailed", actor: "hero", action: "attack", reason: "out_of_range" });
    adapter.apply({ type: "Missed", actor: "hero", reason: "out_of_range" });

    expect(adapter.getState()!.activeEffects).toEqual([]);
  });

  it("run 3: heal — pushes a 'healing' overlay attached to the actor", () => {
    const { adapter } = makeAdapter();
    mount(adapter, [hero()]);

    adapter.apply({ type: "Healed", actor: "hero", amount: 5 });

    const effs = adapter.getState()!.activeEffects;
    expect(effs).toHaveLength(1);
    expect(effs[0]!.kind).toBe("overlay");
    expect(effs[0]!.name).toBe("healing");
    expect(effs[0]!.attachTo).toBe("hero");
  });

  it("run 4: cast bolt at target — pushes a 'bolt' projectile from source to target", () => {
    const { adapter } = makeAdapter();
    mount(adapter, [hero({ x: 2, y: 2 }), goblin("g1", { x: 5, y: 2 })]);

    adapter.apply({ type: "Cast", actor: "hero", spell: "bolt", target: "g1", amount: 4 });

    const [eff, ...rest] = adapter.getState()!.activeEffects;
    expect(rest).toEqual([]);
    expect(eff!.kind).toBe("projectile");
    expect(eff!.name).toBe("bolt");
    expect(eff!.from).toEqual({ x: 2, y: 2 });
    expect(eff!.to).toEqual({ x: 5, y: 2 });
  });

  it("run 5: death — marks dead, pushes deathBurst, corpse pruned after grace", () => {
    const { adapter } = makeAdapter();
    mount(adapter, [hero(), goblin("g1", { x: 3, y: 1 })]);

    adapter.apply({ type: "Died", actor: "g1" });

    const sAfterDeath = adapter.getState()!;
    const corpse = sAfterDeath.monsters.find(m => m.id === "g1")!;
    expect(corpse.dead).toBe(true);
    expect(sAfterDeath.activeEffects.map(e => e.name)).toEqual(["deathBurst"]);

    // Step frames until the deathBurst drains and grace expires — the corpse drops.
    for (let i = 0; i < 60; i++) {
      adapter.stepFrame();
      // Bump tick forward so the grace window (tick - deadAt < 2) elapses too.
      (adapter.getState() as { tick: number }).tick += 1;
    }
    expect(adapter.getState()!.monsters.find(m => m.id === "g1")).toBeUndefined();
  });

  it("run 6: hero exits — pushes a 'sparkling' overlay on the hero", () => {
    const { adapter } = makeAdapter();
    mount(adapter, [hero()]);

    adapter.apply({ type: "HeroExited", actor: "hero", door: "E" });

    const effs = adapter.getState()!.activeEffects;
    expect(effs).toHaveLength(1);
    expect(effs[0]!.name).toBe("sparkling");
    expect(effs[0]!.attachTo).toBe("hero");
  });

  it("teardown clears state and removes the canvas from the host", () => {
    const { adapter } = makeAdapter();
    const host = mount(adapter, [hero()]);
    expect(host.querySelector("canvas")).not.toBeNull();

    adapter.teardown();
    expect(host.querySelector("canvas")).toBeNull();
    expect(adapter.getState()).toBeNull();
  });

  it("Moved on a monster updates the monster slot, not the player", () => {
    const { adapter } = makeAdapter();
    mount(adapter, [hero({ x: 1, y: 1 }), goblin("g1", { x: 4, y: 4 })]);

    adapter.apply({ type: "Moved", actor: "g1", from: { x: 4, y: 4 }, to: { x: 4, y: 3 } });

    const s = adapter.getState()!;
    expect(s.player!.x).toBe(1);
    expect(s.monsters[0]!.x).toBe(4);
    expect(s.monsters[0]!.y).toBe(3);
  });
});

describe("WireRendererAdapter — Phase 5/6/7 events", () => {
  it("Cast with visual='beam_frost' picks the frost beam preset", () => {
    const { adapter } = makeAdapter();
    mount(adapter, [hero({ x: 1, y: 1 }), goblin("g1", { x: 4, y: 1 })]);

    adapter.apply({ type: "Cast", actor: "hero", spell: "frost", target: "g1", amount: 3, visual: "beam_frost" });

    const eff = adapter.getState()!.activeEffects[0]!;
    expect(eff.kind).toBe("projectile");
    expect(eff.name).toBe("beam");
    expect(eff.colors?.color).toBe("#66ccff");
  });

  it("Cast with element='fire' falls back through ELEMENT_DEFAULTS", () => {
    const { adapter } = makeAdapter();
    mount(adapter, [hero({ x: 1, y: 1 }), goblin("g1", { x: 4, y: 1 })]);

    adapter.apply({ type: "Cast", actor: "hero", spell: "fireball", target: "g1", amount: 3, element: "fire" });

    const eff = adapter.getState()!.activeEffects[0]!;
    expect(eff.name).toBe("bolt");
    expect(eff.colors?.color).toBe("#ff6622");
  });

  it("EffectApplied spawns overlay; EffectExpired drops matching overlay", () => {
    const { adapter } = makeAdapter();
    mount(adapter, [hero()]);

    adapter.apply({ type: "EffectApplied", actor: "hero", kind: "burning" });
    adapter.apply({ type: "EffectApplied", actor: "hero", kind: "haste" });

    let effs = adapter.getState()!.activeEffects;
    expect(effs).toHaveLength(2);
    expect(effs.map(e => e.name).sort()).toEqual(["burning", "sparkling"]);

    adapter.apply({ type: "EffectExpired", actor: "hero", kind: "burning" });
    effs = adapter.getState()!.activeEffects;
    expect(effs).toHaveLength(1);
    expect(effs[0]!.name).toBe("sparkling");
  });

  it("CloudSpawned adds to state.clouds; CloudExpired removes it", () => {
    const { adapter } = makeAdapter();
    mount(adapter, [hero()]);

    adapter.apply({ type: "CloudSpawned", id: "c1", pos: { x: 3, y: 2 }, kind: "fire", visual: "cloud_fire" });
    let clouds = adapter.getState()!.clouds;
    expect(clouds).toHaveLength(1);
    expect(clouds[0]!.kind).toBe("fire");
    expect(clouds[0]!.tiles).toEqual([{ x: 3, y: 2 }]);

    adapter.apply({ type: "CloudExpired", id: "c1" });
    clouds = adapter.getState()!.clouds;
    expect(clouds).toHaveLength(0);
  });

  it("VisualBurst pushes an area effect at the requested position", () => {
    const { adapter } = makeAdapter();
    mount(adapter, [hero()]);

    adapter.apply({ type: "VisualBurst", pos: { x: 5, y: 6 }, visual: "burst_frost", element: "frost" });

    const eff = adapter.getState()!.activeEffects[0]!;
    expect(eff.kind).toBe("area");
    expect(eff.at).toEqual({ x: 5, y: 6 });
    expect(eff.colors?.color).toBe("#66ccff");
  });

  it("ItemUsed sparkles the actor; OnHitTriggered bursts at defender", () => {
    const { adapter } = makeAdapter();
    mount(adapter, [hero({ x: 1, y: 1 }), goblin("g1", { x: 3, y: 3 })]);

    adapter.apply({ type: "ItemUsed", actor: "hero", item: "p1", defId: "health_potion" });
    adapter.apply({ type: "OnHitTriggered", attacker: "hero", defender: "g1", item: "d1", defId: "venom_dagger" });

    const effs = adapter.getState()!.activeEffects;
    expect(effs[0]!.name).toBe("sparkling");
    expect(effs[0]!.attachTo).toBe("hero");
    expect(effs[1]!.kind).toBe("area");
    expect(effs[1]!.at).toEqual({ x: 3, y: 3 });
  });

  it("Cast heal with visual='bolt_green' pushes a green bolt preset", () => {
    const { adapter } = makeAdapter();
    mount(adapter, [hero({ x: 1, y: 1 }), goblin("g1", { x: 2, y: 1 })]);

    adapter.apply({ type: "Cast", actor: "hero", spell: "heal", target: "g1", amount: 5, visual: "bolt_green" });

    const eff = adapter.getState()!.activeEffects[0]!;
    expect(eff.kind).toBe("projectile");
    expect(eff.name).toBe("bolt");
    expect(eff.colors?.color).toBe("#44cc66");
  });

  it("Cast bless with visual='bolt_gold' pushes a gold bolt preset", () => {
    const { adapter } = makeAdapter();
    mount(adapter, [hero({ x: 1, y: 1 }), goblin("g1", { x: 2, y: 1 })]);

    adapter.apply({ type: "Cast", actor: "hero", spell: "bless", target: "g1", amount: 0, visual: "bolt_gold" });

    const eff = adapter.getState()!.activeEffects[0]!;
    expect(eff.kind).toBe("projectile");
    expect(eff.name).toBe("bolt");
    expect(eff.colors?.color).toBe("#ffcc00");
  });

  it("EffectApplied regen pushes a 'healing' overlay with green colors", () => {
    const { adapter } = makeAdapter();
    mount(adapter, [hero()]);

    adapter.apply({ type: "EffectApplied", actor: "hero", kind: "regen" });

    const eff = adapter.getState()!.activeEffects[0]!;
    expect(eff.name).toBe("healing");
    expect(eff.colors?.color).toBe("#66ff99");
  });

  it("EffectApplied poison pushes a 'dripping' overlay", () => {
    const { adapter } = makeAdapter();
    mount(adapter, [hero()]);

    adapter.apply({ type: "EffectApplied", actor: "hero", kind: "poison" });

    const eff = adapter.getState()!.activeEffects[0]!;
    expect(eff.name).toBe("dripping");
    expect(eff.effectKind).toBe("poison");
  });
});
