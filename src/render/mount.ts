// Playback controller — paces engine events through a RendererAdapter.
//
// Engine runs synchronously and produces handle.log up front. Playback then
// walks the log one event per speedMs using setTimeout, calling adapter.apply
// for each. Pause freezes the queue; resume continues from the same index;
// stop tears the adapter down.
//
// We deliberately use setTimeout (not RAF) so Vitest fake timers can drive
// the test deterministically. Smooth per-frame animation is the adapter's
// responsibility, not ours.

import type { EngineHandle } from "../engine.js";
import type { RendererAdapter } from "./adapter.js";
import type { GameEvent } from "../types.js";

export type PlaybackStatus = "idle" | "playing" | "paused" | "stopped";

export interface PlaybackOpts {
  speedMs: number;
  /** Called each time an event is applied — wire up an event-log panel here. */
  onEvent?: (event: GameEvent, index: number) => void;
  /** Called when the last event drains. */
  onComplete?: () => void;
}

export interface Playback {
  play(): void;
  pause(): void;
  resume(): void;
  stop(): void;
  setSpeed(ms: number): void;
  status(): PlaybackStatus;
  cursor(): number;
}

export function createPlayback(
  handle: EngineHandle,
  adapter: RendererAdapter,
  opts: PlaybackOpts,
): Playback {
  let speedMs = Math.max(1, opts.speedMs);
  let index = 0;
  let status: PlaybackStatus = "idle";
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clearTimer = () => {
    if (timer !== null) { clearTimeout(timer); timer = null; }
  };

  const tick = () => {
    timer = null;
    if (status !== "playing") return;
    if (index >= handle.log.length) {
      status = "idle";
      opts.onComplete?.();
      return;
    }
    const entry = handle.log[index]!;
    index += 1;
    // Apply synchronously — adapter.apply may return a Promise but for Phase 3
    // we treat all events as instant and just schedule the next one on its own
    // timer. If an adapter needs async gating later, await-chain here.
    adapter.apply(entry.event);
    opts.onEvent?.(entry.event, index - 1);
    if (status === "playing") {
      timer = setTimeout(tick, speedMs);
    }
  };

  return {
    play() {
      if (status === "playing") return;
      status = "playing";
      clearTimer();
      timer = setTimeout(tick, speedMs);
    },
    pause() {
      if (status !== "playing") return;
      status = "paused";
      clearTimer();
    },
    resume() {
      if (status !== "paused") return;
      status = "playing";
      clearTimer();
      timer = setTimeout(tick, speedMs);
    },
    stop() {
      status = "stopped";
      clearTimer();
      adapter.teardown();
    },
    setSpeed(ms: number) {
      speedMs = Math.max(1, ms);
      // If currently between events, reschedule with the new delay.
      if (status === "playing") {
        clearTimer();
        timer = setTimeout(tick, speedMs);
      }
    },
    status() { return status; },
    cursor() { return index; },
  };
}
