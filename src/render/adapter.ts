// Renderer-adapter contract: the one seam between the engine's event log and
// whatever visual backend we plug in. Phase 3 has two implementations:
//
//   FakeRendererAdapter — records apply() calls. Used in tests (esp. the
//                         mount.ts timing test) where we just need to verify
//                         sequencing, not pixels.
//   WireRendererAdapter — translates events into the vendored wire renderer's
//                         state snapshot and asks it to draw. Lives in
//                         wire-adapter.ts.
//
// The engine stays headless. Adapters never drive engine state — they only
// consume `GameEvent`s from handle.log.

import type { Actor, GameEvent, Room } from "../types.js";

export interface RendererAdapter {
  /** Attach the adapter to a host element and seed initial scene. */
  mount(el: HTMLElement, room: Room, actors: Actor[]): void;
  /** Apply one engine event to the visual state. May be async if the
   *  concrete adapter wants to await an animation; mount.ts awaits it. */
  apply(event: GameEvent): void | Promise<void>;
  /** Detach, stop any internal frame loop, clear the host element. */
  teardown(): void;
}

// ── FakeRendererAdapter ─────────────────────────────────────────
// Trivial recorder. mount.ts tests use it to assert sequencing/pausing.

export interface FakeCall {
  kind: "mount" | "apply" | "teardown";
  event?: GameEvent;
  actorIds?: string[];
}

export class FakeRendererAdapter implements RendererAdapter {
  public calls: FakeCall[] = [];
  public mountedEl: HTMLElement | null = null;

  mount(el: HTMLElement, _room: Room, actors: Actor[]): void {
    this.mountedEl = el;
    this.calls.push({ kind: "mount", actorIds: actors.map(a => a.id) });
  }

  apply(event: GameEvent): void {
    this.calls.push({ kind: "apply", event });
  }

  teardown(): void {
    this.calls.push({ kind: "teardown" });
    this.mountedEl = null;
  }

  /** Convenience — just the events that were applied, in order. */
  appliedEvents(): GameEvent[] {
    return this.calls.filter(c => c.kind === "apply").map(c => c.event!);
  }
}
