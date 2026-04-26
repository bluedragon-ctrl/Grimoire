import { describe, it, expect } from "vitest";
import type { Actor, Room, GameEvent } from "../../src/types.js";
import { runRoom } from "../../src/engine.js";
import {
  script, ident, call, lit, while_, bin, member, index, exprStmt, if_, onEvent,
  cApproach, cAttack, cCast, cExit, cHalt, cWait,
} from "../../src/ast-helpers.js";

function emptyRoom(overrides: Partial<Room> = {}): Room {
  return {
    w: 10, h: 10, doors: [], chests: [],
    ...overrides,
  };
}

function makeActor(over: Partial<Actor> & Pick<Actor, "id" | "kind" | "pos" | "script">): Actor {
  const defaults = over.kind === "hero"
    ? { hp: 20, maxHp: 20, speed: 12 }
    : { hp: 5, maxHp: 5, speed: 10 };
  return {
    hp: defaults.hp, maxHp: defaults.maxHp, speed: defaults.speed,
    energy: 0, alive: true,
    isHero: over.kind === "hero",
    ...over,
  };
}

function types(log: { event: GameEvent }[]): string[] {
  return log.map(l => l.event.type);
}

// ──────────────────────────────────────────────────────────────

describe("engine", () => {
  it("goblin alone idles (halt ends script, no further events)", () => {
    const gob = makeActor({
      id: "g", kind: "goblin", pos: { x: 1, y: 1 },
      script: script(cHalt()),
    });
    const { log } = runRoom({ room: emptyRoom(), actors: [gob] }, { maxTicks: 50 });
    expect(types(log)).toEqual(["Halted"]);
  });

  it("hero kills goblin via approach→attack loop", () => {
    const hero = makeActor({
      id: "h", kind: "hero", pos: { x: 0, y: 0 },
      script: script(
        while_(
          bin(">", member(call("enemies"), "length"), lit(0)),
          [
            cApproach(index(call("enemies"), lit(0))),
            cAttack(index(call("enemies"), lit(0))),
          ],
        ),
        cHalt(),
      ),
    });
    const gob = makeActor({
      id: "g", kind: "goblin", pos: { x: 2, y: 0 },
      script: script(cHalt()),
    });
    const { log, world } = runRoom({ room: emptyRoom(), actors: [hero, gob] }, { maxTicks: 200 });

    const gobDied = log.some(l => l.event.type === "Died" && l.event.actor === "g");
    expect(gobDied).toBe(true);
    expect(world.actors.find(a => a.id === "g")!.alive).toBe(false);
    // Sequence: at least one Moved by hero, followed by at least one Attacked.
    const movedIdx = log.findIndex(l => l.event.type === "Moved");
    const attackedIdx = log.findIndex(l => l.event.type === "Attacked");
    expect(movedIdx).toBeGreaterThanOrEqual(0);
    expect(attackedIdx).toBeGreaterThan(movedIdx);
  });

  it("speed 12 vs speed 6 produces correct wait cadence over 60 ticks", () => {
    const mk = (id: string, speed: number) => makeActor({
      id, kind: "goblin", pos: { x: 0, y: 0 }, speed,
      script: script(while_(lit(true), [cWait()])),
    });
    const fast = mk("fast", 12);
    const slow = mk("slow", 6);
    slow.pos = { x: 5, y: 5 };
    const { log } = runRoom({ room: emptyRoom(), actors: [fast, slow] }, { maxTicks: 60 });

    const fastWaits = log.filter(l => l.event.type === "Waited" && l.event.actor === "fast").length;
    const slowWaits = log.filter(l => l.event.type === "Waited" && l.event.actor === "slow").length;

    // Rate = speed/cost. speed 12, cost 5 → 2.4 fires/tick → 144 / 60.
    // speed 6, cost 5 → 1.2 fires/tick → 72 / 60.
    expect(fastWaits).toBe(144);
    expect(slowWaits).toBe(72);
  });

  it("on hit handler fires on attack; main resumes after", () => {
    // Target actor waits forever; on hit, it attacks back once.
    const hero = makeActor({
      id: "h", kind: "hero", pos: { x: 0, y: 0 },
      script: script(
        cAttack(index(call("enemies"), lit(0))),
        cHalt(),
      ),
    });
    const gob = makeActor({
      id: "g", kind: "goblin", pos: { x: 1, y: 0 }, hp: 99, maxHp: 99, speed: 10,
      script: script(
        while_(lit(true), [cWait()]),
        onEvent("hit", [cAttack(ident("attacker"))], "attacker"),
      ),
    });
    const { log } = runRoom({ room: emptyRoom(), actors: [hero, gob] }, { maxTicks: 50 });

    // Hero attacks once → hit on gob → gob's handler attacks hero back.
    const heroHitCount = log.filter(l => l.event.type === "Hit" && l.event.actor === "h").length;
    expect(heroHitCount).toBeGreaterThanOrEqual(1);
    // And goblin was hit by hero.
    const gobHit = log.some(l => l.event.type === "Hit" && l.event.actor === "g" && l.event.attacker === "h");
    expect(gobHit).toBe(true);
    // Goblin is still doing waits after the handler → main resumed.
    const waitsAfterHit = log
      .slice(log.findIndex(l => l.event.type === "Hit" && l.event.actor === "g"))
      .some(l => l.event.type === "Waited" && l.event.actor === "g");
    expect(waitsAfterHit).toBe(true);
  });

  it('cast("heal", me) raises hp, clamped at maxHp', () => {
    const hero = makeActor({
      id: "h", kind: "hero", pos: { x: 0, y: 0 }, hp: 3, maxHp: 10,
      script: script(
        cCast("heal", ident("me")),
        cCast("heal", ident("me")),
        cCast("heal", ident("me")),
        cHalt(),
      ),
    });
    const { log, world } = runRoom({ room: emptyRoom(), actors: [hero] }, { maxTicks: 50 });
    expect(world.actors.find(a => a.id === "h")!.hp).toBe(10);
    const heals = log.filter(l => l.event.type === "Healed");
    expect(heals.length).toBe(3);
    // First heal: 3 → 8 (+5). Second: 8 → 10 (+2). Third: 10 → 10 (+0).
    expect((heals[0]!.event as any).amount).toBe(5);
    expect((heals[1]!.event as any).amount).toBe(2);
    expect((heals[2]!.event as any).amount).toBe(0);
  });

  it("exit on correct tile ends room; wrong tile logs ActionFailed", () => {
    const room = emptyRoom({ doors: [{ dir: "N", pos: { x: 3, y: 3 } }] });
    const heroOn = makeActor({
      id: "h", kind: "hero", pos: { x: 3, y: 3 },
      script: script(cExit("N"), cHalt()),
    });
    const r1 = runRoom({ room, actors: [heroOn] }, { maxTicks: 20 });
    expect(r1.log.some(l => l.event.type === "HeroExited")).toBe(true);
    expect(r1.world.ended).toBe(true);

    const heroOff = makeActor({
      id: "h", kind: "hero", pos: { x: 0, y: 0 },
      script: script(cExit("N"), cHalt()),
    });
    const r2 = runRoom({ room, actors: [heroOff] }, { maxTicks: 20 });
    const fails = r2.log.filter(l => l.event.type === "ActionFailed");
    expect(fails.length).toBeGreaterThanOrEqual(1);
    expect((fails[0]!.event as any).action).toBe("exit");
    expect(r2.log.some(l => l.event.type === "HeroExited")).toBe(false);
  });

  it("attack on non-adjacent logs ActionFailed, no damage", () => {
    const hero = makeActor({
      id: "h", kind: "hero", pos: { x: 0, y: 0 },
      script: script(cAttack(index(call("enemies"), lit(0))), cHalt()),
    });
    const gob = makeActor({
      id: "g", kind: "goblin", pos: { x: 5, y: 5 },
      script: script(cHalt()),
    });
    const { log, world } = runRoom({ room: emptyRoom(), actors: [hero, gob] }, { maxTicks: 20 });
    expect(log.some(l => l.event.type === "ActionFailed" && (l.event as any).action === "attack")).toBe(true);
    expect(log.some(l => l.event.type === "Attacked")).toBe(false);
    expect(world.actors.find(a => a.id === "g")!.hp).toBe(5);
  });

  it("halt() ends script; actor idles", () => {
    const hero = makeActor({
      id: "h", kind: "hero", pos: { x: 0, y: 0 },
      script: script(cWait(), cHalt(), cWait(), cWait()),
    });
    const { log } = runRoom({ room: emptyRoom(), actors: [hero] }, { maxTicks: 30 });
    const waits = log.filter(l => l.event.type === "Waited").length;
    // Only the wait() before halt should have fired.
    expect(waits).toBe(1);
    expect(log.some(l => l.event.type === "Halted")).toBe(true);
  });

  it("external abort() stops scheduler and flushes log", () => {
    const actor = makeActor({
      id: "a", kind: "goblin", pos: { x: 0, y: 0 },
      script: script(while_(lit(true), [cWait()])),
    });
    // onTick receives the world; setting world.aborted simulates an external
    // abort mid-run. (The public `handle.abort()` does the same thing; in a
    // synchronous run, there's no outside caller to invoke it during the loop.)
    const handle = runRoom(
      { room: emptyRoom(), actors: [actor] },
      { maxTicks: 1000, onTick: (w) => { if (w.tick >= 5) w.aborted = true; } },
    );
    expect(handle.world.aborted).toBe(true);
    expect(handle.log.length).toBeGreaterThan(0);
    expect(handle.world.tick).toBeLessThan(1000);
  });
});
