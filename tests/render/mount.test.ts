import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createPlayback } from "../../src/render/mount.js";
import { FakeRendererAdapter } from "../../src/render/adapter.js";
import type { EngineHandle } from "../../src/engine.js";
import type { GameEvent, World, EventLog } from "../../src/types.js";

function makeLog(n: number): EventLog {
  const log: EventLog = [];
  for (let i = 0; i < n; i++) {
    const ev: GameEvent = { type: "Waited", actor: `a${i}` };
    log.push({ t: i, event: ev });
  }
  return log;
}

function makeHandle(log: EventLog): EngineHandle {
  const world = {} as World; // mount.ts never touches world
  return { log, world, abort() {} };
}

describe("createPlayback — setTimeout-paced event delivery", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("delivers every event exactly once, in order, at the configured speed", () => {
    const log = makeLog(5);
    const fake = new FakeRendererAdapter();
    const pb = createPlayback(makeHandle(log), fake, { speedMs: 50 });

    pb.play();
    expect(fake.appliedEvents()).toEqual([]); // first tick is deferred by speedMs

    vi.advanceTimersByTime(50); expect(fake.appliedEvents()).toHaveLength(1);
    vi.advanceTimersByTime(50); expect(fake.appliedEvents()).toHaveLength(2);
    vi.advanceTimersByTime(200); // drain the rest
    expect(fake.appliedEvents()).toHaveLength(5);
    expect(fake.appliedEvents()).toEqual(log.map(l => l.event));
    expect(pb.status()).toBe("idle");
  });

  it("pause/resume — events 1..K arrive before pause, K+1..N after, with no dupes or drops", () => {
    const N = 10, K = 4;
    const log = makeLog(N);
    const fake = new FakeRendererAdapter();
    const pb = createPlayback(makeHandle(log), fake, { speedMs: 50 });

    pb.play();
    vi.advanceTimersByTime(50 * K);           // deliver K events
    expect(fake.appliedEvents()).toHaveLength(K);

    pb.pause();
    vi.advanceTimersByTime(10_000);            // no events while paused
    expect(fake.appliedEvents()).toHaveLength(K);

    pb.resume();
    vi.advanceTimersByTime(50 * (N - K));     // deliver the rest
    expect(fake.appliedEvents()).toHaveLength(N);
    expect(fake.appliedEvents()).toEqual(log.map(l => l.event));
  });

  it("stop aborts pending delivery and tears the adapter down", () => {
    const log = makeLog(10);
    const fake = new FakeRendererAdapter();
    const pb = createPlayback(makeHandle(log), fake, { speedMs: 50 });

    pb.play();
    vi.advanceTimersByTime(50 * 3);
    pb.stop();
    const before = fake.appliedEvents().length;
    vi.advanceTimersByTime(10_000);
    expect(fake.appliedEvents().length).toBe(before);
    expect(fake.calls[fake.calls.length - 1]!.kind).toBe("teardown");
    expect(pb.status()).toBe("stopped");
  });

  it("setSpeed takes effect for subsequent events", () => {
    const log = makeLog(6);
    const fake = new FakeRendererAdapter();
    const pb = createPlayback(makeHandle(log), fake, { speedMs: 100 });

    pb.play();
    vi.advanceTimersByTime(200);              // 2 @ 100ms
    expect(fake.appliedEvents()).toHaveLength(2);

    pb.setSpeed(25);
    vi.advanceTimersByTime(100);              // 4 more @ 25ms → all drained
    expect(fake.appliedEvents()).toHaveLength(6);
  });

  it("onEvent fires in sync with adapter.apply", () => {
    const log = makeLog(3);
    const fake = new FakeRendererAdapter();
    const logged: Array<{ ev: GameEvent; idx: number }> = [];
    const pb = createPlayback(makeHandle(log), fake, {
      speedMs: 10,
      onEvent: (ev, idx) => logged.push({ ev, idx }),
    });

    pb.play();
    vi.advanceTimersByTime(30);
    expect(logged.map(x => x.idx)).toEqual([0, 1, 2]);
    expect(logged.map(x => x.ev)).toEqual(fake.appliedEvents());
  });

  it("onComplete fires once the log drains", () => {
    const log = makeLog(2);
    const fake = new FakeRendererAdapter();
    const onComplete = vi.fn();
    const pb = createPlayback(makeHandle(log), fake, { speedMs: 10, onComplete });

    pb.play();
    vi.advanceTimersByTime(100);
    expect(onComplete).toHaveBeenCalledOnce();
    expect(pb.status()).toBe("idle");
  });
});
