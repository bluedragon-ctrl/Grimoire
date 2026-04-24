// Phase 10: run-state machine. Source of truth for the gameplay loop phase,
// the room/attempt counters, and the pre-run snapshot. Engine-free — this
// module never touches the scheduler, the World, or any GameEvent.
//
// Phases:
//   prep     — editable script + inventory; room hidden. Snapshot is null.
//   running  — simulation is playing. Snapshot holds the pre-run RoomSetup.
//   paused   — engine halted mid-run. Snapshot still held.
//   recap    — success modal showing. Snapshot dropped.
//
// Transitions (driven by UI button clicks in main.ts):
//   prep     --startRun-->     running   (snapshot pre-run state)
//   running  --pause-->        paused
//   paused   --resume-->       running
//   running|paused --fail-->   prep      (restore snapshot, attempts++)
//   running|paused --succeed-> recap     (drop snapshot, record turns)
//   recap    --continue-->     prep      (level++, attempts=1, new room)
//   prep     --skipRoom-->     prep      (same level, attempts=1, new room)
//   *        --resetAll-->     prep      (level=1, attempts=1, new room)

import type { RoomSetup } from "../engine.js";

export type Phase = "prep" | "running" | "paused" | "recap";

export interface RecapInfo {
  level: number;
  attempts: number;
  turns: number;
}

export interface RunState {
  phase: Phase;
  level: number;
  attempts: number;
  /** The RoomSetup the hero enters on Run. Rebuilt on success/skip/reset/fail. */
  current: RoomSetup;
  /** Pre-run snapshot used to restore on failure. Null in prep/recap. */
  snapshot: RoomSetup | null;
  /** Populated only while phase === "recap". */
  recap: RecapInfo | null;
}

export interface RunControllerOptions {
  /** Produce a fresh RoomSetup for a given level. Called for init/skip/reset/continue. */
  generate: (level: number) => RoomSetup;
}

type Listener = (state: Readonly<RunState>) => void;

export class RunController {
  private state: RunState;
  private readonly opts: RunControllerOptions;
  private readonly listeners = new Set<Listener>();

  constructor(opts: RunControllerOptions) {
    this.opts = opts;
    this.state = {
      phase: "prep",
      level: 1,
      attempts: 1,
      current: opts.generate(1),
      snapshot: null,
      recap: null,
    };
  }

  getState(): Readonly<RunState> { return this.state; }

  on(cb: Listener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(): void {
    for (const cb of this.listeners) cb(this.state);
  }

  /** prep → running. Deep-clones current into snapshot. */
  startRun(): void {
    if (this.state.phase !== "prep") return;
    this.state.snapshot = structuredClone(this.state.current);
    this.state.phase = "running";
    this.emit();
  }

  pause(): void {
    if (this.state.phase !== "running") return;
    this.state.phase = "paused";
    this.emit();
  }

  resume(): void {
    if (this.state.phase !== "paused") return;
    this.state.phase = "running";
    this.emit();
  }

  /** running|paused → prep. Restore snapshot and increment attempts. */
  fail(): void {
    if (this.state.phase !== "running" && this.state.phase !== "paused") return;
    if (this.state.snapshot) this.state.current = this.state.snapshot;
    this.state.snapshot = null;
    this.state.attempts += 1;
    this.state.phase = "prep";
    this.emit();
  }

  /** running|paused → recap. Drop snapshot; caller passes `turns` from world.tick. */
  succeed(turns: number): void {
    if (this.state.phase !== "running" && this.state.phase !== "paused") return;
    this.state.recap = {
      level: this.state.level,
      attempts: this.state.attempts,
      turns,
    };
    this.state.snapshot = null;
    this.state.phase = "recap";
    this.emit();
  }

  /** recap → prep. level++, attempts=1, new room. */
  continueAfterRecap(): void {
    if (this.state.phase !== "recap") return;
    this.state.level += 1;
    this.state.attempts = 1;
    this.state.current = this.opts.generate(this.state.level);
    this.state.recap = null;
    this.state.phase = "prep";
    this.emit();
  }

  /** prep → prep at level+1. Advances past the current room without running it. */
  // TODO: cost — skipping should cost something (gold? attempts budget?) once
  // those systems exist.
  skipRoom(): void {
    if (this.state.phase !== "prep") return;
    this.state.level += 1;
    this.state.attempts = 1;
    this.state.current = this.opts.generate(this.state.level);
    this.emit();
  }

  /** Full teardown to level 1 / attempts 1 / fresh room in prep. */
  resetAll(): void {
    this.state.level = 1;
    this.state.attempts = 1;
    this.state.snapshot = null;
    this.state.recap = null;
    this.state.current = this.opts.generate(1);
    this.state.phase = "prep";
    this.emit();
  }
}

// ── Phase-derived UI helpers ────────────────────────────────────────────────
// Kept here so both the UI and the tests agree on the tab-enablement rules.

export function inspectorTabEnabled(phase: Phase): boolean {
  return phase === "paused";
}

export function helpTabEnabled(phase: Phase): boolean {
  return phase === "prep";
}
