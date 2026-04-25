// Phase 10: run-state machine tests. State-machine-only — no DOM assertions.

import { describe, it, expect } from "vitest";
import { RunController, inspectorTabEnabled, helpTabEnabled } from "../../src/ui/run-state.js";
import { generateRoom } from "../../src/content/rooms.js";
import type { RoomSetup } from "../../src/engine.js";

function ctrl(): RunController {
  return new RunController({ generate: (level) => generateRoom(level) });
}

describe("RunController", () => {
  it("starts in prep at level 1, attempts 1, no snapshot", () => {
    const c = ctrl();
    const s = c.getState();
    expect(s.phase).toBe("prep");
    expect(s.level).toBe(1);
    expect(s.attempts).toBe(1);
    expect(s.snapshot).toBeNull();
    expect(s.current.actors.length).toBeGreaterThan(0);
  });

  it("startRun snapshots the current setup and enters running", () => {
    const c = ctrl();
    const before = c.getState().current;
    c.startRun();
    const s = c.getState();
    expect(s.phase).toBe("running");
    expect(s.snapshot).not.toBeNull();
    // Snapshot is a structural clone (different ref, same shape).
    expect(s.snapshot).not.toBe(before);
    expect(s.snapshot!.actors[0]!.id).toBe(before.actors[0]!.id);
  });

  it("fail increments attempts exactly once and restores snapshot", () => {
    const c = ctrl();
    c.startRun();
    // Mutate the live current to prove restore swaps it back.
    const pre = c.getState().snapshot!;
    c.getState().current.actors[0]!.hp = 999;
    c.fail();
    const s = c.getState();
    expect(s.phase).toBe("prep");
    expect(s.attempts).toBe(2);
    expect(s.snapshot).toBeNull();
    expect(s.current).toBe(pre);
    expect(s.current.actors[0]!.hp).not.toBe(999);
  });

  it("fail increments attempts once per failed run, not per phase change", () => {
    const c = ctrl();
    c.startRun(); c.fail();            // attempts 1 → 2
    c.startRun(); c.pause(); c.fail(); // paused failure: 2 → 3
    expect(c.getState().attempts).toBe(3);
  });

  it("attempts does not increment on pause/resume cycles", () => {
    const c = ctrl();
    c.startRun();
    c.pause(); c.resume(); c.pause(); c.resume();
    expect(c.getState().attempts).toBe(1);
  });

  it("succeed moves to recap, drops snapshot, records turns; continue bumps level and resets attempts", () => {
    const c = ctrl();
    c.startRun(); c.fail();   // attempts → 2
    c.startRun();
    c.succeed(42);
    let s = c.getState();
    expect(s.phase).toBe("recap");
    expect(s.snapshot).toBeNull();
    expect(s.recap).toEqual({ level: 1, attempts: 2, turns: 42, outcome: "success" });

    c.continueAfterRecap();
    s = c.getState();
    expect(s.phase).toBe("prep");
    expect(s.level).toBe(2);
    expect(s.attempts).toBe(1);
    expect(s.recap).toBeNull();
  });

  it("skipRoom advances level by 1, resets attempts to 1, and regenerates current", () => {
    const c = ctrl();
    c.startRun(); c.fail();   // attempts → 2
    const prevRoom = c.getState().current;
    c.skipRoom();
    const s = c.getState();
    expect(s.phase).toBe("prep");
    expect(s.level).toBe(2);
    expect(s.attempts).toBe(1);
    expect(s.current).not.toBe(prevRoom);
  });

  it("resetAll returns to level 1 / attempts 1 in prep from any phase", () => {
    const c = ctrl();
    c.startRun();
    c.succeed(1);
    c.continueAfterRecap();     // level 2
    c.startRun(); c.fail();     // level 2, attempts 2
    c.resetAll();
    const s = c.getState();
    expect(s.phase).toBe("prep");
    expect(s.level).toBe(1);
    expect(s.attempts).toBe(1);
    expect(s.snapshot).toBeNull();
    expect(s.recap).toBeNull();
  });

  it("listeners fire on every state change", () => {
    const c = ctrl();
    let count = 0;
    c.on(() => count++);
    c.startRun(); c.pause(); c.resume(); c.fail();
    expect(count).toBe(4);
  });

  it("transitions are gated: startRun is a no-op outside prep", () => {
    const c = ctrl();
    c.startRun();
    // Second startRun while running must not create a new snapshot.
    const snap = c.getState().snapshot;
    c.startRun();
    expect(c.getState().snapshot).toBe(snap);
    expect(c.getState().phase).toBe("running");
  });

  it("continueAfterRecap is a no-op outside recap", () => {
    const c = ctrl();
    c.continueAfterRecap();
    expect(c.getState().level).toBe(1);
    expect(c.getState().phase).toBe("prep");
  });

  it("generator is called on init, skipRoom, continueAfterRecap, resetAll — not on fail", () => {
    let calls = 0;
    const gen = (lvl: number): RoomSetup => { calls++; return generateRoom(lvl); };
    const c = new RunController({ generate: gen });
    expect(calls).toBe(1);           // init
    c.startRun(); c.fail();
    expect(calls).toBe(1);           // fail restores, does not regenerate
    c.skipRoom();
    expect(calls).toBe(2);
    c.startRun(); c.succeed(0); c.continueAfterRecap();
    expect(calls).toBe(3);
    c.resetAll();
    expect(calls).toBe(4);
  });
});

describe("tab enablement", () => {
  it("help tab enabled only during prep", () => {
    expect(helpTabEnabled("prep")).toBe(true);
    expect(helpTabEnabled("running")).toBe(false);
    expect(helpTabEnabled("paused")).toBe(false);
    expect(helpTabEnabled("recap")).toBe(false);
  });

  it("inspector tab enabled only during paused", () => {
    expect(inspectorTabEnabled("prep")).toBe(false);
    expect(inspectorTabEnabled("running")).toBe(false);
    expect(inspectorTabEnabled("paused")).toBe(true);
    expect(inspectorTabEnabled("recap")).toBe(false);
  });
});
