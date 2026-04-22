// WireRendererAdapter — translates Grimoire GameEvents into the vendored
// wire renderer's state-snapshot format, then drives its per-frame draw.
//
// Design:
//   - apply(event) mutates a local VisualState that matches the shape
//     Samples/ui/renderer.js reads (player, monsters, activeEffects, …).
//   - A frame loop (default: requestAnimationFrame) advances effect timers
//     and calls the vendor render(state) at ~60 Hz so camera damping and
//     effect animation stay smooth — independent of the setTimeout-driven
//     event pacing in mount.ts.
//   - Every collaborator is injectable so adapter tests can run headless
//     without a real canvas, a real RAF clock, or a real render().

import type { Actor, GameEvent, Pos, Room } from "../types.js";
import type { RendererAdapter } from "./adapter.js";
import { initRenderer as vendorInit, render as vendorRender } from "./vendor/ui/renderer.js";

// ── VisualState shape (mirrors what the vendor renderer reads) ──────────

export interface VisualEntity {
  id: string;
  x: number;
  y: number;
  type?: string;          // monster sprite key in MONSTER_RENDERERS; omitted for player
  baseVisual?: string;    // optional fallback sprite
  colors?: Record<string, string>;
  hp?: number;
  dead?: boolean;
  deadAt?: number;
}

export type VisualEffectKind = "overlay" | "projectile" | "area" | "tileCloud";

export interface VisualEffect {
  kind: VisualEffectKind;
  name: string;
  delay: number;
  duration: number;
  elapsed: number;
  colors?: { color?: string; color2?: string };
  attachTo?: string;
  from?: Pos;
  to?: Pos;
  at?: Pos;
  radius?: number;
  tiles?: Pos[];
}

export interface VisualState {
  player: VisualEntity | null;
  monsters: VisualEntity[];
  floorItems: unknown[];
  floorObjects: unknown[];
  clouds: unknown[];
  activeEffects: VisualEffect[];
  width: number;
  height: number;
  tick: number;
  map: string[][];
}

// ── Event → effect mapping ─────────────────────────────────────────────
// Durations in seconds; the vendor renderer's render() advances an internal
// time by FRAME_TIME each call. Our own per-frame tick increments `elapsed`.

const D_STRIKE = 0.30;
const D_HEAL   = 0.55;
const D_CAST   = 0.40;
const D_DEATH  = 0.45;
const D_EXIT   = 0.60;

function spriteForKind(kind: Actor["kind"]): string {
  switch (kind) {
    case "hero":   return "mage";      // rendered via player slot, not MONSTER_RENDERERS
    case "goblin": return "skeleton";  // goblin sprite not in MONSTER_RENDERERS; skeleton is the safe fallback
    default:       return "skeleton";
  }
}

function buildMap(room: Room): string[][] {
  const map: string[][] = [];
  for (let y = 0; y < room.h; y++) {
    const row: string[] = [];
    for (let x = 0; x < room.w; x++) {
      const onEdge = x === 0 || y === 0 || x === room.w - 1 || y === room.h - 1;
      row.push(onEdge ? "wall" : "floor");
    }
    map.push(row);
  }
  // Doors punch through the wall.
  for (const d of room.doors) {
    const row = map[d.pos.y];
    if (row && d.pos.x >= 0 && d.pos.x < row.length) row[d.pos.x] = "floor";
  }
  return map;
}

// ── Adapter dependencies (injectable for tests) ────────────────────────

export interface WireDeps {
  init: (canvas: HTMLCanvasElement) => void;
  render: (state: unknown) => void;
  /** Schedules a frame. Returns a cancel handle. Default: requestAnimationFrame. */
  schedule: (cb: () => void) => number;
  cancel: (handle: number) => void;
  /** Frame-tick delta in seconds (advances effect `elapsed`). Default: 1/60. */
  frameDt: number;
  /** If false, skip starting the frame loop on mount (useful in tests). */
  runFrameLoop: boolean;
}

const DEFAULT_DEPS: WireDeps = {
  init:     vendorInit,
  render:   vendorRender,
  schedule: (cb) => (typeof requestAnimationFrame !== "undefined" ? requestAnimationFrame(cb) : 0),
  cancel:   (h)  => { if (typeof cancelAnimationFrame !== "undefined") cancelAnimationFrame(h); },
  frameDt:  1 / 60,
  runFrameLoop: true,
};

// ── Adapter ────────────────────────────────────────────────────────────

export class WireRendererAdapter implements RendererAdapter {
  private deps: WireDeps;
  private state: VisualState | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private host: HTMLElement | null = null;
  private frameHandle = 0;
  private running = false;

  constructor(deps: Partial<WireDeps> = {}) {
    this.deps = { ...DEFAULT_DEPS, ...deps };
  }

  mount(el: HTMLElement, room: Room, actors: Actor[]): void {
    this.host = el;
    this.canvas = document.createElement("canvas");
    this.canvas.style.display = "block";
    el.replaceChildren(this.canvas);
    this.deps.init(this.canvas);

    const player = actors.find(a => a.kind === "hero");
    const monsters = actors.filter(a => a.kind !== "hero");

    this.state = {
      player: player ? { id: player.id, x: player.pos.x, y: player.pos.y, hp: player.hp } : null,
      monsters: monsters.map(m => ({
        id: m.id,
        x: m.pos.x, y: m.pos.y,
        type: spriteForKind(m.kind),
        hp: m.hp,
      })),
      floorItems: [], floorObjects: [], clouds: [], activeEffects: [],
      width: room.w, height: room.h, tick: 0,
      map: buildMap(room),
    };

    if (this.deps.runFrameLoop) this.startFrameLoop();
  }

  apply(event: GameEvent): void {
    const s = this.state;
    if (!s) return;

    switch (event.type) {
      case "Moved": {
        const e = this.findEntity(event.actor);
        if (e) { e.x = event.to.x; e.y = event.to.y; }
        break;
      }
      case "Attacked": {
        const target = this.findEntity(event.defender);
        if (target) this.pushEffect({
          kind: "area", name: "explosion", duration: D_STRIKE, elapsed: 0, delay: 0,
          at: { x: target.x, y: target.y }, radius: 0.6,
        });
        break;
      }
      case "Hit": {
        const target = this.findEntity(event.actor);
        if (target) this.pushEffect({
          kind: "area", name: "explosion", duration: D_STRIKE, elapsed: 0, delay: 0,
          at: { x: target.x, y: target.y }, radius: 0.5,
        });
        break;
      }
      case "Cast": {
        const src = this.findEntity(event.actor);
        const tgt = event.target ? this.findEntity(event.target) : undefined;
        if (src && tgt) {
          this.pushEffect({
            kind: "projectile", name: "bolt", duration: D_CAST, elapsed: 0, delay: 0,
            from: { x: src.x, y: src.y }, to: { x: tgt.x, y: tgt.y },
            colors: { color: "#ff6622", color2: "#ffdd66" },
          });
        } else if (src) {
          this.pushEffect({
            kind: "overlay", name: "sparkling", duration: D_CAST, elapsed: 0, delay: 0,
            attachTo: src.id,
          });
        }
        break;
      }
      case "Healed": {
        const e = this.findEntity(event.actor);
        if (e) this.pushEffect({
          kind: "overlay", name: "healing", duration: D_HEAL, elapsed: 0, delay: 0,
          attachTo: e.id,
        });
        break;
      }
      case "Died":
      case "HeroDied": {
        const e = this.findEntity(event.actor);
        if (e) {
          e.dead = true;
          e.deadAt = s.tick;
          this.pushEffect({
            kind: "area", name: "deathBurst", duration: D_DEATH, elapsed: 0, delay: 0,
            at: { x: e.x, y: e.y }, radius: 0.9,
          });
        }
        break;
      }
      case "HeroExited": {
        if (s.player) this.pushEffect({
          kind: "overlay", name: "sparkling", duration: D_EXIT, elapsed: 0, delay: 0,
          attachTo: s.player.id,
        });
        break;
      }
      // ── No-visual events (logged by the event panel only) ──
      case "Missed":
      case "Waited":
      case "Halted":
      case "Idled":
      case "ActionFailed":
      case "See":
        break;
    }
    s.tick++;
  }

  teardown(): void {
    this.running = false;
    if (this.frameHandle) this.deps.cancel(this.frameHandle);
    this.frameHandle = 0;
    if (this.canvas && this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
    this.canvas = null;
    this.state = null;
    this.host = null;
  }

  // ── Test/introspection helpers ──

  /** Expose the internal VisualState (tests only — do not mutate). */
  getState(): Readonly<VisualState> | null { return this.state; }

  /** Manually step one frame (tests only). Advances timers + calls render. */
  stepFrame(): void { this.tickFrame(); }

  // ── Internal ──

  private findEntity(id: string): VisualEntity | undefined {
    const s = this.state;
    if (!s) return undefined;
    if (s.player?.id === id) return s.player;
    return s.monsters.find(m => m.id === id);
  }

  private pushEffect(eff: VisualEffect): void {
    this.state?.activeEffects.push(eff);
  }

  private startFrameLoop(): void {
    if (this.running) return;
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      this.tickFrame();
      this.frameHandle = this.deps.schedule(loop);
    };
    this.frameHandle = this.deps.schedule(loop);
  }

  private tickFrame(): void {
    const s = this.state;
    if (!s) return;
    // Advance effect timers; drop finished ones.
    if (s.activeEffects.length) {
      const keep: VisualEffect[] = [];
      for (const e of s.activeEffects) {
        if (e.delay > 0) { e.delay -= this.deps.frameDt; keep.push(e); continue; }
        e.elapsed += this.deps.frameDt;
        if (e.duration === 0 || e.elapsed < e.duration) keep.push(e);
      }
      s.activeEffects = keep;
    }
    // Prune dead monsters once no effect still attaches to them.
    s.monsters = s.monsters.filter(m => {
      if (!m.dead) return true;
      const held = s.activeEffects.some(e => e.attachTo === m.id);
      const graceLeft = s.tick - (m.deadAt ?? s.tick) < 2;
      return held || graceLeft;
    });
    this.deps.render(s);
  }
}
