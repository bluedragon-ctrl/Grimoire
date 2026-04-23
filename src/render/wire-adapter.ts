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

import type { Actor, EffectKind, GameEvent, Pos, Room } from "../types.js";
import type { RendererAdapter } from "./adapter.js";
import { initRenderer as vendorInit, render as vendorRender } from "./vendor/ui/renderer.js";
import { TILE } from "./context.js";
import {
  PROJECTILE_PRESETS, BURST_PRESETS, CLOUD_PRESETS, ELEMENT_DEFAULTS,
  type ProjectilePreset, type BurstPreset,
} from "../content/visuals.js";

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
  /** Present on overlays spawned by EffectApplied — matched on EffectExpired. */
  effectKind?: EffectKind;
}

export interface VisualCloud {
  id: string;
  kind: string;                 // CLOUD_DEFS key (fire/frost/…)
  tiles: Pos[];                 // per-cell positions
  duration: number;             // ticks remaining
  maxDuration: number;          // ticks at spawn
  colors?: { color: string; color2: string };
}

export interface VisualState {
  player: VisualEntity | null;
  monsters: VisualEntity[];
  floorItems: unknown[];
  floorObjects: unknown[];
  clouds: VisualCloud[];
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
const D_BURST  = 0.45;
const D_ITEM   = 0.55;
const D_ONHIT  = 0.35;
// Overlay durations for status effects are open-ended; the adapter drops them
// on EffectExpired. Use a long nominal duration so elapsed/duration stays <1
// for the whole effect lifetime.
const D_STATUS = 999;

/** Resolve a Cast event's visual/element fields to a projectile preset. */
function resolveProjectile(visual?: string, element?: string): ProjectilePreset | undefined {
  if (visual && PROJECTILE_PRESETS[visual]) return PROJECTILE_PRESETS[visual];
  if (element) {
    const name = ELEMENT_DEFAULTS[element];
    if (name && PROJECTILE_PRESETS[name]) return PROJECTILE_PRESETS[name];
  }
  return undefined;
}

/** Resolve a VisualBurst event's visual to a burst preset. */
function resolveBurst(visual?: string, element?: string): BurstPreset | undefined {
  if (visual && BURST_PRESETS[visual]) return BURST_PRESETS[visual];
  if (element) {
    // Map element → canonical burst name.
    const map: Record<string, string> = { fire: "burst_ember", frost: "burst_frost", arcane: "burst_arcane" };
    const name = map[element];
    if (name && BURST_PRESETS[name]) return BURST_PRESETS[name];
  }
  return undefined;
}

/** Map an EffectKind to the overlay renderer name + fallback colors. */
function overlayForEffect(kind: EffectKind): { name: string; colors?: { color: string; color2: string } } | undefined {
  switch (kind) {
    case "burning": return { name: "burning",   colors: { color: "#ff6622", color2: "#ffcc33" } };
    case "poison":  return { name: "dripping",  colors: { color: "#33aa55", color2: "#aaff88" } };
    case "regen":   return { name: "healing",   colors: { color: "#66ff99", color2: "#ccffcc" } };
    case "haste":   return { name: "sparkling", colors: { color: "#ffff99", color2: "#ffffff" } };
    case "slow":    return { name: "cloudWavy", colors: { color: "#6688aa", color2: "#aaccee" } };
    default:        return undefined;
  }
}

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
  private resizeObs: ResizeObserver | null = null;

  constructor(deps: Partial<WireDeps> = {}) {
    this.deps = { ...DEFAULT_DEPS, ...deps };
  }

  mount(el: HTMLElement, room: Room, actors: Actor[]): void {
    this.host = el;
    // Two-level mount: the host (#game-view) can scroll; the inner wrapper
    // is at-least world-size so the canvas never shrinks below the full
    // room. On wide screens the wrapper fills 100% and the canvas expands
    // to fit; on narrow screens the wrapper forces a minimum and the host
    // shows amber scrollbars.
    const worldW = room.w * TILE;
    const worldH = room.h * TILE;
    const wrap = document.createElement("div");
    wrap.className = "game-canvas-wrap";
    wrap.style.minWidth = `${worldW}px`;
    wrap.style.minHeight = `${worldH}px`;
    wrap.style.width = "100%";
    wrap.style.height = "100%";
    this.canvas = document.createElement("canvas");
    this.canvas.style.display = "block";
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    wrap.appendChild(this.canvas);
    el.replaceChildren(wrap);
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

    // The vendor renderer only resizes its canvas on window-resize events.
    // Our layout toggles (inventory show/hide, inspector show/hide) change
    // the container size without firing window-resize, which stretches the
    // canvas bitmap. Observe the host and dispatch a resize on change.
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObs = new ResizeObserver(() => {
        if (typeof window !== "undefined") window.dispatchEvent(new Event("resize"));
      });
      this.resizeObs.observe(el);
    }

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
        const preset = resolveProjectile(event.visual, event.element);
        const name = preset?.projectile ?? "bolt";
        const colors = preset?.colors ?? { color: "#ff6622", color2: "#ffdd66" };
        if (src && tgt) {
          this.pushEffect({
            kind: "projectile", name, duration: D_CAST, elapsed: 0, delay: 0,
            from: { x: src.x, y: src.y }, to: { x: tgt.x, y: tgt.y },
            colors,
          });
        } else if (src) {
          this.pushEffect({
            kind: "overlay", name: "sparkling", duration: D_CAST, elapsed: 0, delay: 0,
            attachTo: src.id, colors,
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
      case "EffectApplied": {
        const target = this.findEntity(event.actor);
        const ov = overlayForEffect(event.kind);
        if (target && ov) {
          // Tag the effect with effectKind so EffectExpired can drop the match.
          this.pushEffect({
            kind: "overlay", name: ov.name, duration: D_STATUS, elapsed: 0, delay: 0,
            attachTo: target.id, colors: ov.colors, effectKind: event.kind,
          });
        }
        break;
      }
      case "EffectExpired": {
        s.activeEffects = s.activeEffects.filter(
          e => !(e.attachTo === event.actor && e.effectKind === event.kind),
        );
        break;
      }
      case "EffectTick":
        // Per-tick pulse is handled by the overlay itself; no new effect spawned.
        break;
      case "CloudSpawned": {
        const preset = event.visual ? CLOUD_PRESETS[event.visual] : undefined;
        this.addCloud({
          id: event.id,
          kind: event.kind,
          tiles: [{ x: event.pos.x, y: event.pos.y }],
          duration: 1,      // refined by CloudTicked; vendor fades when duration<=1
          maxDuration: 1,
          colors: preset?.colors,
        });
        break;
      }
      case "CloudTicked":
        // Engine drives per-tick remaining; adapter tracks via CloudExpired.
        // Could decrement here if payload included it, but current payload only
        // lists affected actors — safe no-op.
        break;
      case "CloudExpired": {
        this.removeCloud(event.id);
        break;
      }
      case "VisualBurst": {
        const preset = resolveBurst(event.visual, event.element);
        this.pushEffect({
          kind: "area", name: "blobExplosion", duration: D_BURST, elapsed: 0, delay: 0,
          at: { x: event.pos.x, y: event.pos.y }, radius: 0.9,
          colors: preset?.colors,
        });
        break;
      }
      case "ItemUsed": {
        const e = this.findEntity(event.actor);
        if (e) this.pushEffect({
          kind: "overlay", name: "sparkling", duration: D_ITEM, elapsed: 0, delay: 0,
          attachTo: e.id,
        });
        break;
      }
      case "OnHitTriggered": {
        const d = this.findEntity(event.defender);
        if (d) this.pushEffect({
          kind: "area", name: "blobExplosion", duration: D_ONHIT, elapsed: 0, delay: 0,
          at: { x: d.x, y: d.y }, radius: 0.55,
        });
        break;
      }
      // ── Equip changes ripple through the inventory panel, not the canvas ──
      case "ItemEquipped":
      case "ItemUnequipped":
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
    if (this.resizeObs) { this.resizeObs.disconnect(); this.resizeObs = null; }
    // Clear the host; this also drops the canvas wrapper we inserted on mount.
    if (this.host) this.host.replaceChildren();
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

  private addCloud(cloud: VisualCloud): void {
    const s = this.state;
    if (!s) return;
    // Replace if id already present (CloudSpawned is idempotent on re-emit).
    const idx = s.clouds.findIndex(c => c.id === cloud.id);
    if (idx >= 0) s.clouds[idx] = cloud;
    else s.clouds.push(cloud);
  }

  private removeCloud(id: string): void {
    const s = this.state;
    if (!s) return;
    s.clouds = s.clouds.filter(c => c.id !== id);
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
