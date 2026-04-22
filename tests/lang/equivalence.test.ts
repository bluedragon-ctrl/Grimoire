// Integration gate: Phase 1 behaviour must be reproducible by writing the
// hero script as source and parsing it. Event logs are compared by type +
// actor id to keep the test robust to minor position-diff changes.

import { describe, it, expect } from "vitest";
import { parse } from "../../src/lang/index.js";
import { runRoom } from "../../src/engine.js";
import { demoSetup } from "../../src/demo.js";

const HERO_SOURCE = [
  "while enemies().length > 0:",
  "  approach(enemies()[0])",
  "  attack(enemies()[0])",
  "while me.pos.x != doors()[0].pos.x or me.pos.y != doors()[0].pos.y:",
  "  approach(doors()[0])",
  "exit(\"N\")",
  "halt",
  "",
].join("\n");

describe("source → AST → engine equivalence", () => {
  it("parsed hero script produces the same event log as the hardcoded one", () => {
    const a = demoSetup();
    const b = demoSetup();
    // Replace hero's hardcoded script with the parsed one on one copy.
    const parsed = parse(HERO_SOURCE);
    b.actors[0]!.script = parsed;

    const ra = runRoom(a, { maxTicks: 2000 });
    const rb = runRoom(b, { maxTicks: 2000 });

    const shape = (log: typeof ra.log) => log.map(entry => {
      const ev = entry.event as any;
      return [ev.type, ev.actor ?? ev.attacker ?? ""].join(":");
    });

    expect(shape(rb.log)).toEqual(shape(ra.log));
    expect(rb.world.ended).toBe(ra.world.ended);
    expect(rb.world.tick).toBe(ra.world.tick);
  });
});
