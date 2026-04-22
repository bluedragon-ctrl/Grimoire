import { describe, it, expect } from "vitest";
import { FakeRendererAdapter } from "../../src/render/adapter.js";
import type { Actor, GameEvent, Room } from "../../src/types.js";

const emptyRoom: Room = { w: 5, h: 5, doors: [], items: [], chests: [] };
const hero = (): Actor => ({
  id: "h1", kind: "hero", hp: 10, maxHp: 10, speed: 1, energy: 0,
  pos: { x: 1, y: 1 }, script: { main: [], handlers: [], funcs: [] }, alive: true,
});

describe("FakeRendererAdapter", () => {
  it("records mount, applies, and teardown in order", () => {
    const el = document.createElement("div");
    const fake = new FakeRendererAdapter();
    const ev1: GameEvent = { type: "Moved", actor: "h1", from: { x: 1, y: 1 }, to: { x: 2, y: 1 } };
    const ev2: GameEvent = { type: "Waited", actor: "h1" };

    fake.mount(el, emptyRoom, [hero()]);
    fake.apply(ev1);
    fake.apply(ev2);
    fake.teardown();

    expect(fake.calls.map(c => c.kind)).toEqual(["mount", "apply", "apply", "teardown"]);
    expect(fake.appliedEvents()).toEqual([ev1, ev2]);
    expect(fake.mountedEl).toBeNull();
  });
});
