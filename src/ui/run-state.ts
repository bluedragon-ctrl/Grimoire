// Phase 15: run-state machine. Models the procedural-dungeon lifecycle:
//   loadout → running → (paused) → running ... → death_recap → loadout
//                                                          ↘ quit_confirm → final_review → loadout
// Successful exit() regenerates the next-depth room within the same attempt
// (no per-room modal). HP/MP persist across consecutive rooms.

import type { RoomSetup } from "../engine.js";
import type { PersistentRun } from "../types.js";
import { freshRun, loadRun, saveRun, wipeRun, buildAttemptHero, routeInventoryToRun } from "../persistence.js";

export type Phase =
  | "loadout"        // pre-attempt screen
  | "running"
  | "paused"
  | "death_recap"
  | "quit_confirm"
  | "final_review";

export interface RecapInfo {
  depth: number;
  attempts: number;
  turns: number;
  outcome: "death";
  cause?: string;
}

export interface RunState {
  phase: Phase;
  /** Current depth within the active attempt. */
  depth: number;
  /** Number of attempts started so far (1 = first attempt). */
  attempts: number;
  /** The RoomSetup the hero enters on Run. Rebuilt on advance/restart. */
  current: RoomSetup;
  /** Persistent meta-state — depot, equipped, knownSpells, lifetime stats. */
  run: PersistentRun;
  /** Death-recap payload (death_recap phase only). */
  recap: RecapInfo | null;
  /** Per-attempt loadout selection (depot defIds the player picked). */
  loadout: string[];
  /** Snapshot of the run state for the final-review screen. */
  finalSnapshot: PersistentRun | null;
}

export interface RunControllerOptions {
  /** Produce a fresh RoomSetup for a (depth, run, loadout) triple. */
  generate: (depth: number, run: PersistentRun, loadout: string[]) => RoomSetup;
  /** Initial run state (defaults to loadRun()). */
  initialRun?: PersistentRun;
}

type Listener = (state: Readonly<RunState>) => void;

export const MAX_LOADOUT = 4;

export class RunController {
  private state: RunState;
  private readonly opts: RunControllerOptions;
  private readonly listeners = new Set<Listener>();

  constructor(opts: RunControllerOptions) {
    this.opts = opts;
    const run = opts.initialRun ?? loadRun();
    this.state = {
      phase: "loadout",
      depth: 1,
      attempts: 1,
      current: opts.generate(1, run, []),
      run,
      recap: null,
      loadout: [],
      finalSnapshot: null,
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

  // ── loadout helpers ────────────────────────────────────────────────────

  toggleLoadout(defId: string): void {
    if (this.state.phase !== "loadout") return;
    const idx = this.state.loadout.indexOf(defId);
    if (idx >= 0) {
      this.state.loadout.splice(idx, 1);
    } else if (this.state.loadout.length < MAX_LOADOUT) {
      this.state.loadout.push(defId);
    }
    this.emit();
  }

  // ── attempt lifecycle ──────────────────────────────────────────────────

  /** loadout → running. Pulls selected items from depot into hero inventory. */
  startAttempt(): void {
    if (this.state.phase !== "loadout") return;
    const heroPos = this.state.current.actors[0]?.pos ?? { x: 1, y: 1 };
    const hero = buildAttemptHero(this.state.run, this.state.loadout, heroPos);
    // Replace hero in current setup (preserves AI's monsters in current).
    this.state.current.actors[0] = hero;
    this.state.run.stats.attempts = Math.max(this.state.run.stats.attempts, this.state.attempts);
    this.state.loadout = [];
    saveRun(this.state.run);
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

  /** Successful exit() — advance depth in the same attempt, regenerate room. */
  advanceDepth(carryHero: import("../types.js").Actor): void {
    if (this.state.phase !== "running" && this.state.phase !== "paused") return;
    this.state.depth += 1;
    this.state.run.stats.deepestDepth = Math.max(this.state.run.stats.deepestDepth, this.state.depth);
    saveRun(this.state.run);
    // Build the next room; carry the live hero (with hp/mp/inventory) into it.
    const next = this.opts.generate(this.state.depth, this.state.run, []);
    next.actors[0] = carryHero;
    next.actors[0].pos = { ...next.actors[0].pos };
    this.state.current = next;
    this.state.phase = "running";
    this.emit();
  }

  /** Hero died — route inventory, increment attempts, show death recap. */
  die(turns: number, hero: import("../types.js").Actor, cause?: string): void {
    if (this.state.phase !== "running" && this.state.phase !== "paused") return;
    routeInventoryToRun(hero, this.state.run);
    this.state.recap = {
      depth: this.state.depth,
      attempts: this.state.attempts,
      turns,
      outcome: "death",
      cause,
    };
    saveRun(this.state.run);
    this.state.phase = "death_recap";
    this.emit();
  }

  /** TRY AGAIN button — bump attempts, depth=1, regenerate, show loadout. */
  tryAgain(): void {
    if (this.state.phase !== "death_recap") return;
    this.state.attempts += 1;
    this.state.depth = 1;
    this.state.recap = null;
    this.state.loadout = [];
    this.state.current = this.opts.generate(1, this.state.run, []);
    this.state.phase = "loadout";
    saveRun(this.state.run);
    this.emit();
  }

  /** QUIT button (from death recap) — open the confirm dialog. */
  requestQuit(): void {
    if (this.state.phase !== "death_recap") return;
    this.state.phase = "quit_confirm";
    this.emit();
  }

  /** Cancel the QUIT confirm — return to death recap. */
  cancelQuit(): void {
    if (this.state.phase !== "quit_confirm") return;
    this.state.phase = "death_recap";
    this.emit();
  }

  /** Confirm QUIT — snapshot for final review, the ack will reset state. */
  confirmQuit(): void {
    if (this.state.phase !== "quit_confirm") return;
    this.state.finalSnapshot = JSON.parse(JSON.stringify(this.state.run)) as PersistentRun;
    this.state.phase = "final_review";
    this.emit();
  }

  /** Acknowledge final review — wipe storage and reseed a fresh run. */
  acknowledgeFinal(): void {
    if (this.state.phase !== "final_review") return;
    wipeRun();
    const run = freshRun();
    this.state.run = run;
    this.state.depth = 1;
    this.state.attempts = 1;
    this.state.recap = null;
    this.state.loadout = [];
    this.state.finalSnapshot = null;
    this.state.current = this.opts.generate(1, run, []);
    this.state.phase = "loadout";
    this.emit();
  }
}

// ── Phase-derived UI helpers ────────────────────────────────────────────────

export function inspectorTabEnabled(phase: Phase): boolean {
  return phase === "paused";
}

export function helpTabEnabled(phase: Phase): boolean {
  return phase === "loadout";
}
