// Phase 15: run-state machine. Models the procedural-dungeon lifecycle:
//   loadout → running → (paused) → running ... → death_recap → loadout
//                                                          ↘ quit_confirm → final_review → loadout
// Successful exit() regenerates the next-depth room within the same attempt
// (no per-room modal). HP/MP persist across consecutive rooms.

import type { RoomSetup } from "../engine.js";
import type { Actor, PersistentRun, Slot } from "../types.js";
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
  /** Per-attempt loadout selection — fixed length 4; `null` = empty slot. */
  loadout: Array<string | null>;
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
    const setup = opts.generate(1, run, []);
    // Replace the generator's default-hero with one mirroring run.equipped /
    // run.knownSpells / run.knownGear so the prep panel reflects persistent state.
    const heroPos = setup.actors[0]?.pos ?? { x: 1, y: 1 };
    const liveHero = buildAttemptHero(run, [], heroPos);
    setup.actors[0] = liveHero;
    this.state = {
      phase: "loadout",
      depth: 1,
      attempts: 1,
      current: setup,
      run,
      recap: null,
      loadout: [null, null, null, null],
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

  /** Set the consumable in slot `idx` (0..3). Pass `null` to clear. */
  setLoadoutSlot(idx: number, defId: string | null): void {
    if (this.state.phase !== "loadout") return;
    if (idx < 0 || idx >= MAX_LOADOUT) return;
    this.state.loadout[idx] = defId;
    this.emit();
  }

  /** Legacy toggle helper retained for tests. Adds to the first empty slot,
   *  or clears the first slot containing this defId if present. */
  toggleLoadout(defId: string): void {
    if (this.state.phase !== "loadout") return;
    const existing = this.state.loadout.indexOf(defId);
    if (existing >= 0) {
      this.state.loadout[existing] = null;
      this.emit();
      return;
    }
    const empty = this.state.loadout.indexOf(null);
    if (empty >= 0) {
      this.state.loadout[empty] = defId;
      this.emit();
    }
  }

  // ── attempt lifecycle ──────────────────────────────────────────────────

  /** loadout → running. Syncs prep-panel edits to run, pulls loadout consumables. */
  startAttempt(): void {
    if (this.state.phase !== "loadout") return;
    const previewHero = this.state.current.actors[0];
    if (previewHero?.inventory) {
      // Sync any equipment changes the user made in the prep panel back into
      // the persistent run (knownGear-driven picker mutates hero.inventory.equipped).
      for (const slot of Object.keys(this.state.run.equipped) as Slot[]) {
        const inst = previewHero.inventory.equipped[slot];
        this.state.run.equipped[slot] = inst ? { id: inst.id, defId: inst.defId } : null;
      }
    }
    const heroPos = previewHero?.pos ?? { x: 1, y: 1 };
    const hero = buildAttemptHero(this.state.run, this.state.loadout, heroPos);
    this.state.current.actors[0] = hero;
    this.state.run.stats.attempts = Math.max(this.state.run.stats.attempts, this.state.attempts);
    this.state.loadout = [null, null, null, null];
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
    this.state.loadout = [null, null, null, null];
    const setup = this.opts.generate(1, this.state.run, []);
    setup.actors[0] = buildAttemptHero(this.state.run, [], setup.actors[0]?.pos ?? { x: 1, y: 1 });
    this.state.current = setup;
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
    this.state.loadout = [null, null, null, null];
    this.state.finalSnapshot = null;
    const setup = this.opts.generate(1, run, []);
    setup.actors[0] = buildAttemptHero(run, [], setup.actors[0]?.pos ?? { x: 1, y: 1 });
    this.state.current = setup;
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
