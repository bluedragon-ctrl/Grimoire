// Tests for the notify DSL command pipeline.
// Verifies: command callable from script, Notified event emitted,
// zero energy cost, correct payload fields.

import { describe, it, expect } from "vitest";
import { runRoom } from "../../src/engine.js";
import { parse } from "../../src/lang/index.js";
import { emptyEquipped } from "../../src/content/items.js";
import type { Actor, Room } from "../../src/types.js";

function makeRoom(): Room {
  return {
    w: 5, h: 5,
    doors: [{ dir: "N", pos: { x: 2, y: 0 } }],
    items: [], chests: [],
  };
}

function makeHero(source: string): Actor {
  return {
    id: "hero", kind: "hero", isHero: true, hp: 20, maxHp: 20,
    speed: 10, energy: 0, pos: { x: 2, y: 2 },
    script: parse(source), alive: true,
    inventory: { consumables: [], equipped: emptyEquipped() },
  };
}

describe("notify command", () => {
  it("emits Notified event when called from a script", () => {
    const hero = makeHero(`notify("hello")\nhalt\n`);
    const { log } = runRoom({ room: makeRoom(), actors: [hero] }, { maxTicks: 50 });
    const ev = log.find(e => e.event.type === "Notified");
    expect(ev).toBeDefined();
    expect(ev!.event.type).toBe("Notified");
    if (ev!.event.type === "Notified") {
      expect(ev!.event.text).toBe("hello");
    }
  });

  it("Notified event carries style when provided", () => {
    const hero = makeHero(`notify("low hp", "warning")\nhalt\n`);
    const { log } = runRoom({ room: makeRoom(), actors: [hero] }, { maxTicks: 50 });
    const ev = log.find(e => e.event.type === "Notified");
    expect(ev).toBeDefined();
    if (ev!.event.type === "Notified") {
      expect(ev!.event.style).toBe("warning");
    }
  });

  it("Notified event carries duration when provided", () => {
    const hero = makeHero(`notify("msg", "info", 5)\nhalt\n`);
    const { log } = runRoom({ room: makeRoom(), actors: [hero] }, { maxTicks: 50 });
    const ev = log.find(e => e.event.type === "Notified");
    expect(ev).toBeDefined();
    if (ev!.event.type === "Notified") {
      expect(ev!.event.duration).toBe(5);
    }
  });

  it("notify has zero energy cost — script continues immediately without energy drain", () => {
    // Two notifies + halt. If notify drained energy the hero would stall.
    const hero = makeHero(`notify("a")\nnotify("b")\nhalt\n`);
    const { log } = runRoom({ room: makeRoom(), actors: [hero] }, { maxTicks: 50 });
    const notified = log.filter(e => e.event.type === "Notified");
    expect(notified.length).toBe(2);
    // Both should fire on tick 0 (no energy needed, no waiting).
    expect(notified[0]!.t).toBe(0);
    expect(notified[1]!.t).toBe(0);
  });

  it("multiple notifies from same script all appear in the log", () => {
    const hero = makeHero(`notify("one")\nnotify("two")\nnotify("three")\nhalt\n`);
    const { log } = runRoom({ room: makeRoom(), actors: [hero] }, { maxTicks: 50 });
    const texts = log
      .filter(e => e.event.type === "Notified")
      .map(e => (e.event as { type: "Notified"; text: string }).text);
    expect(texts).toEqual(["one", "two", "three"]);
  });
});
