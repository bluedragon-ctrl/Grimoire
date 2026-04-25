import { describe, it, expect } from "vitest";
import { runRoom } from "../../src/engine.js";
import {
  script, onEvent, cHalt, cFlee, ident, exprStmt, call, index, lit,
} from "../../src/ast-helpers.js";
import { mkRoom, mkWorld, mkHero, mkGoblin } from "../helpers.js";

describe("monster event handlers dispatch", () => {
  it("goblin's on-hit handler fires after hero attacks it", () => {
    const heroScript = script(
      exprStmt(call("attack", index(call("enemies"), lit(0)))),
      cHalt(),
    );
    const hero = mkHero({ id: "h", pos: { x: 1, y: 1 }, script: heroScript });
    const goblin = mkGoblin({
      id: "g",
      pos: { x: 2, y: 1 },
      hp: 20, maxHp: 20,
      script: script(
        onEvent("hit", [cFlee(ident("attacker"))], "attacker"),
      ),
    });
    const { world, log } = runRoom(
      { room: mkRoom(), actors: [hero, goblin] },
      { maxTicks: 100 },
    );
    const g = world.actors.find(a => a.id === "g")!;
    expect(g.pos.x !== 2 || g.pos.y !== 1).toBe(true);
    const dx = Math.abs(g.pos.x - 1);
    const dy = Math.abs(g.pos.y - 1);
    expect(Math.max(dx, dy)).toBeGreaterThan(1);
    expect(log.some(l => l.event.type === "Hit" && l.event.actor === "g")).toBe(true);
  });

  it("handler fires even after the monster's main has halted", () => {
    const heroScript = script(
      exprStmt(call("attack", index(call("enemies"), lit(0)))),
      exprStmt(call("attack", index(call("enemies"), lit(0)))),
      cHalt(),
    );
    const hero = mkHero({ id: "h", pos: { x: 1, y: 1 }, script: heroScript });
    const goblin = mkGoblin({
      id: "g", pos: { x: 2, y: 1 }, hp: 50, maxHp: 50,
      script: script(
        cHalt(),
        onEvent("hit", [cFlee(ident("attacker"))], "attacker"),
      ),
    });
    const { world } = runRoom({ room: mkRoom(), actors: [hero, goblin] }, { maxTicks: 100 });
    const g = world.actors.find(a => a.id === "g")!;
    expect(g.pos.x !== 2 || g.pos.y !== 1).toBe(true);
  });
});
