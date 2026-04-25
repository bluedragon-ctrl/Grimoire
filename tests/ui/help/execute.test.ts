// A subset of help snippets — those small enough and free of room-shape
// dependencies — get *executed* in a stub world, not just parsed. This
// catches the class of regression where a snippet parses but fails at
// runtime (wrong arity, calling a method that no longer exists, etc.).
//
// Runtime failures don't throw — the scheduler converts them to a
// ScriptError log event (Phase 11.6). So the assertion is twofold:
// no thrown exception AND no ScriptError in the world log.
//
// The runner seeds a 10x10 room with one hero and one goblin so basic
// queries (`me`, `enemies()[0]`, `me.distance_to(...)`, etc.) resolve.
// Snippets that look at items / doors / inventory are filtered out by
// `isExecutable` in helpers.ts.

import { describe, it, expect } from "vitest";
import type { Actor } from "../../../src/types.js";
import { startRoom } from "../../../src/engine.js";
import { parse } from "../../../src/lang/index.js";
import { mkRoom, mkHero, mkGoblin } from "../../helpers.js";
import { collectSnippets, isExecutable } from "./helpers.js";

function runFew(actors: Actor[], steps = 4) {
  const h = startRoom({ room: mkRoom(), actors });
  for (let i = 0; i < steps; i++) h.step();
  return h;
}

describe("help snippets execute", () => {
  for (const s of collectSnippets()) {
    if (!isExecutable(s.code)) continue;
    it(`${s.path} [${s.kind} ${s.index}] runs cleanly`, () => {
      const hero = mkHero({ script: parse(s.code) });
      const gob = mkGoblin({ id: "g", pos: { x: 3, y: 0 } });
      const h = runFew([hero, gob]);
      const errors = h.log
        .filter(e => e.event.type === "ScriptError")
        .map(e => (e.event as { type: "ScriptError"; message: string }).message);
      expect(errors).toEqual([]);
    });
  }
});
