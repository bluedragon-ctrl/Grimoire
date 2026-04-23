// Visual effects — projectiles, areas, tile-based clouds, entity overlays.
// Ported from Samples/ui/render-effects.js.
//
// ── Contract ──────────────────────────────────────────────
// Every renderer has the signature:    drawFn(ctx, params, t, colors)
//   - ctx:    2D canvas context. Renderers may mutate transforms/alpha/shadow
//             but must restore state via ctx.save()/restore() if they use them.
//   - params: pixel-space geometry. Shape depends on kind.
//   - t:      normalized progress for one-shot effects (0..1) or elapsed seconds
//             for persistent effects (overlays, tile clouds).
//   - colors: { color, color2? } hex strings. `color` is required by convention.
//
// Effects are purely visual. They never read or mutate game state.

import { C, wire, lighten, darken } from "./context.js";

type Ctx = CanvasRenderingContext2D;

export type ProjectileParams = { x1: number; y1: number; x2: number; y2: number };
export type AreaParams = { cx: number; cy: number; radius?: number };
export type TileCloudParams = { cx: number; cy: number; tileX?: number; tileY?: number };
export type OverlayParams = { cx: number; cy: number };
export type EffectColors = { color?: string; color2?: string };

/** Effect kind — drives how params are interpreted in the renderer. */
export const EFFECT_KIND = {
  beam:          "projectile",
  bolt:          "projectile",
  arrow:         "projectile",
  zigzag:        "projectile",
  orbs:          "projectile",
  thrown:        "projectile",
  explosion:     "area",
  blobExplosion: "area",
  deathBurst:    "area",
  cloudWavy:     "tileCloud",
  burning:       "overlay",
  sparkling:     "overlay",
  dripping:      "overlay",
  healing:       "overlay",
  barrier:       "overlay",
} as const;

export type EffectKind = keyof typeof EFFECT_KIND;

/** Default lifetimes (seconds) — engine may override. */
export const EFFECT_DURATION: Record<EffectKind, number> = {
  beam: 0.35,
  bolt: 0.45,
  arrow: 0.35,
  zigzag: 0.45,
  orbs: 0.6,
  thrown: 0.6,
  explosion: 0.55,
  blobExplosion: 0.7,
  deathBurst: 0.4,
  cloudWavy: 0,
  burning: 0,
  sparkling: 0,
  dripping: 0,
  healing: 0,
  barrier: 0,
};

/** Dispatch draw by name — noop if unknown. */
export function drawEffect(
  ctx: Ctx,
  name: string,
  params: ProjectileParams | AreaParams | TileCloudParams | OverlayParams,
  t = 0,
  colors: EffectColors = {},
): void {
  const fn = (EFFECT_RENDERERS as Record<string, (c: Ctx, p: unknown, t: number, col: EffectColors) => void>)[name];
  if (!fn) return;
  fn(ctx, params, t, colors);
}

// ── Helpers ───────────────────────────────────────────────

function hash01(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

// ═══════════════════════════════════════════════════════════
// PROJECTILES  — params: { x1, y1, x2, y2 }
// ═══════════════════════════════════════════════════════════

export function beam(ctx: Ctx, { x1, y1, x2, y2 }: ProjectileParams, t: number, { color = C.mage }: EffectColors = {}): void {
  const alpha = Math.sin(t * Math.PI);
  const core = lighten(color, 0.5);

  ctx.globalAlpha = alpha * 0.35;
  wire(ctx, color, 16);
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();

  ctx.globalAlpha = alpha;
  wire(ctx, core, 10);
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();

  ctx.globalAlpha = 1;
}

export function bolt(ctx: Ctx, { x1, y1, x2, y2 }: ProjectileParams, t: number, { color = C.mage }: EffectColors = {}): void {
  const p = Math.min(1, t);
  const bx = x1 + (x2 - x1) * p;
  const by = y1 + (y2 - y1) * p;
  const trailN = 4;

  for (let i = 1; i <= trailN; i++) {
    const tp = Math.max(0, p - i * 0.06);
    const tx = x1 + (x2 - x1) * tp;
    const ty = y1 + (y2 - y1) * tp;
    ctx.globalAlpha = (1 - i / trailN) * 0.5;
    wire(ctx, darken(color, i * 0.15), 6);
    ctx.beginPath(); ctx.arc(tx, ty, 3 - i * 0.4, 0, Math.PI * 2); ctx.stroke();
  }

  ctx.globalAlpha = 1;
  wire(ctx, lighten(color, 0.4), 12);
  ctx.beginPath(); ctx.arc(bx, by, 4, 0, Math.PI * 2); ctx.stroke();
  wire(ctx, color, 6);
  ctx.beginPath(); ctx.arc(bx, by, 2, 0, Math.PI * 2); ctx.stroke();
}

export function arrow(ctx: Ctx, { x1, y1, x2, y2 }: ProjectileParams, t: number, { color = C.skeleton }: EffectColors = {}): void {
  const p = Math.min(1, t);
  const bx = x1 + (x2 - x1) * p;
  const by = y1 + (y2 - y1) * p;
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const cos = Math.cos(ang), sin = Math.sin(ang);

  const shaftLen = 14, headLen = 6, headW = 4;

  wire(ctx, color, 6);
  ctx.beginPath();
  ctx.moveTo(bx - cos * shaftLen, by - sin * shaftLen);
  ctx.lineTo(bx, by);
  ctx.stroke();

  wire(ctx, lighten(color, 0.3), 8);
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.lineTo(bx - cos * headLen - sin * headW, by - sin * headLen + cos * headW);
  ctx.lineTo(bx - cos * headLen + sin * headW, by - sin * headLen - cos * headW);
  ctx.closePath();
  ctx.stroke();

  wire(ctx, darken(color, 0.2), 4);
  const tx = bx - cos * shaftLen;
  const ty = by - sin * shaftLen;
  ctx.beginPath();
  ctx.moveTo(tx - sin * 3, ty + cos * 3);
  ctx.lineTo(tx + cos * 3, ty + sin * 3);
  ctx.moveTo(tx + sin * 3, ty - cos * 3);
  ctx.lineTo(tx + cos * 3, ty + sin * 3);
  ctx.stroke();
}

export function zigzag(ctx: Ctx, { x1, y1, x2, y2 }: ProjectileParams, t: number, { color = "#ffee66" }: EffectColors = {}): void {
  const alpha = Math.sin(t * Math.PI);
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 0.1) return;
  const nx = -dy / len, ny = dx / len;
  const segs = 10;
  const amp = 8;
  const jitterPhase = t * 40;

  const pts: [number, number][] = [];
  for (let i = 0; i <= segs; i++) {
    const f = i / segs;
    const bx = x1 + dx * f;
    const by = y1 + dy * f;
    if (i === 0 || i === segs) {
      pts.push([bx, by]);
    } else {
      const dir = (i % 2 === 0) ? 1 : -1;
      const jitter = (hash01(i + Math.floor(jitterPhase)) - 0.5) * 0.6;
      const a = amp * (dir + jitter);
      pts.push([bx + nx * a, by + ny * a]);
    }
  }

  ctx.globalAlpha = alpha * 0.4;
  wire(ctx, color, 16);
  ctx.lineWidth = 3;
  ctx.beginPath();
  pts.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
  ctx.stroke();

  ctx.globalAlpha = alpha;
  wire(ctx, lighten(color, 0.5), 8);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  pts.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
  ctx.stroke();

  ctx.globalAlpha = 1;
}

export function orbs(ctx: Ctx, { x1, y1, x2, y2 }: ProjectileParams, t: number, { color = "#aa66ff" }: EffectColors = {}): void {
  const count = 3;
  const stagger = 0.18;
  const bright = lighten(color, 0.4);
  for (let i = 0; i < count; i++) {
    const p = (t - i * stagger);
    if (p < 0 || p > 1) continue;
    const ox = x1 + (x2 - x1) * p;
    const oy = y1 + (y2 - y1) * p;
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const wob = Math.sin(t * 10 + i * 2) * 3;
    const ox2 = ox + nx * wob;
    const oy2 = oy + ny * wob;

    ctx.globalAlpha = 0.9;
    wire(ctx, bright, 12);
    ctx.beginPath(); ctx.arc(ox2, oy2, 3.5, 0, Math.PI * 2); ctx.stroke();
    wire(ctx, color, 6);
    ctx.beginPath(); ctx.arc(ox2, oy2, 1.5, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

export function thrown(ctx: Ctx, { x1, y1, x2, y2 }: ProjectileParams, t: number, { color = C.skeleton }: EffectColors = {}): void {
  const p = Math.min(1, t);
  const bx = x1 + (x2 - x1) * p;
  const dist = Math.hypot(x2 - x1, y2 - y1);
  const archHeight = Math.max(20, dist * 0.35);
  const by = y1 + (y2 - y1) * p - 4 * p * (1 - p) * archHeight;

  for (let i = 1; i <= 3; i++) {
    const tp = Math.max(0, p - i * 0.08);
    const tx = x1 + (x2 - x1) * tp;
    const ty = y1 + (y2 - y1) * tp - 4 * tp * (1 - tp) * archHeight;
    ctx.globalAlpha = (1 - i / 4) * 0.35;
    wire(ctx, darken(color, i * 0.15), 4);
    ctx.beginPath(); ctx.arc(tx, ty, 2.5 - i * 0.5, 0, Math.PI * 2); ctx.stroke();
  }

  ctx.globalAlpha = 1;
  wire(ctx, lighten(color, 0.3), 10);
  ctx.beginPath(); ctx.arc(bx, by, 4, 0, Math.PI * 2); ctx.stroke();
  const spin = t * 10;
  wire(ctx, color, 4);
  const s = 3;
  ctx.beginPath();
  ctx.moveTo(bx + Math.cos(spin) * s, by + Math.sin(spin) * s);
  ctx.lineTo(bx - Math.cos(spin) * s, by - Math.sin(spin) * s);
  ctx.moveTo(bx + Math.cos(spin + Math.PI / 2) * s, by + Math.sin(spin + Math.PI / 2) * s);
  ctx.lineTo(bx - Math.cos(spin + Math.PI / 2) * s, by - Math.sin(spin + Math.PI / 2) * s);
  ctx.stroke();
}

// ═══════════════════════════════════════════════════════════
// AREAS  — params: { cx, cy, radius }  (radius in tiles)
// ═══════════════════════════════════════════════════════════

const TILE_PX = 48;

export function explosion(ctx: Ctx, { cx, cy, radius = 1 }: AreaParams, t: number, { color = C.torch, color2 }: EffectColors = {}): void {
  const rpx = radius * TILE_PX * 0.9;
  const innerCol = color2 || lighten(color, 0.5);

  const ring = rpx * (0.2 + 0.8 * t);
  ctx.globalAlpha = Math.max(0, 1 - t);
  wire(ctx, color, 18);
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(cx, cy, ring, 0, Math.PI * 2); ctx.stroke();

  ctx.globalAlpha = Math.max(0, 1 - t * 2.2);
  wire(ctx, innerCol, 20);
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, cy, ring * 0.55, 0, Math.PI * 2); ctx.stroke();

  const fragments = 3;
  wire(ctx, innerCol, 10);
  ctx.lineWidth = 2;
  for (let i = 0; i < fragments; i++) {
    const startT = i * 0.12;
    const localT = (t - startT) / (1 - startT);
    if (localT <= 0 || localT >= 1) continue;
    const seed = hash01(i + 5);
    const seed2 = hash01(i + 41);
    const r = rpx * (0.25 + 0.85 * localT);
    const span = Math.PI * (0.35 + seed * 0.6);
    const startAng = seed2 * Math.PI * 2;
    ctx.globalAlpha = Math.max(0, 1 - localT) * 0.9;
    ctx.beginPath();
    ctx.arc(cx, cy, r, startAng, startAng + span);
    ctx.stroke();
  }

  ctx.globalAlpha = Math.max(0, 1 - t);
  wire(ctx, innerCol, 6);
  ctx.lineWidth = 1.5;
  const dashes = 3;
  for (let i = 0; i < dashes; i++) {
    const seed = hash01(i + 19);
    const a = seed * Math.PI * 2;
    const r0 = ring * (0.75 + hash01(i + 31) * 0.15);
    const r1 = r0 + 6 + seed * 6;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
  ctx.lineWidth = 1.5;
}

export function blobExplosion(ctx: Ctx, { cx, cy, radius = 1 }: AreaParams, t: number, { color = "#66ccaa", color2 }: EffectColors = {}): void {
  const rpx = radius * TILE_PX * 0.9;
  const coreCol = color2 || lighten(color, 0.35);
  const blobs = 7;

  ctx.globalAlpha = Math.max(0, 1 - t * 1.8);
  wire(ctx, coreCol, 14);
  ctx.lineWidth = 2;
  const coreR = rpx * 0.35 * (0.4 + t * 0.6);
  ctx.beginPath();
  const corePts = 8;
  for (let k = 0; k <= corePts; k++) {
    const ang = (k / corePts) * Math.PI * 2;
    const wob = Math.sin(t * 12 + k) * coreR * 0.25;
    const r = coreR + wob;
    const x = cx + Math.cos(ang) * r;
    const y = cy + Math.sin(ang) * r;
    if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();

  wire(ctx, color, 10);
  ctx.lineWidth = 1.5;
  for (let i = 0; i < blobs; i++) {
    const seed = hash01(i + 13);
    const seed2 = hash01(i + 37);
    const ang = seed * Math.PI * 2;
    const speed = 0.7 + seed2 * 0.5;
    const startDelay = hash01(i + 71) * 0.1;
    const localT = Math.max(0, t - startDelay);
    const travel = Math.min(1, localT * speed);
    const dist = rpx * 0.95 * travel;
    const curve = (seed2 - 0.5) * rpx * 0.2 * Math.sin(travel * Math.PI);
    const bx = cx + Math.cos(ang) * dist - Math.sin(ang) * curve;
    const by = cy + Math.sin(ang) * dist + Math.cos(ang) * curve;

    const blobR = rpx * 0.22 * (1 - travel * 0.55) * (0.7 + seed * 0.6);
    ctx.globalAlpha = Math.max(0, 1 - travel) * 0.9;

    const pts = 6;
    const morphPhase = t * 8 + i * 1.7;
    ctx.beginPath();
    for (let k = 0; k <= pts; k++) {
      const a = (k / pts) * Math.PI * 2;
      const wob = Math.sin(morphPhase + k * 1.3) * blobR * 0.25;
      const r = blobR + wob;
      const x = bx + Math.cos(a) * r;
      const y = by + Math.sin(a) * r;
      if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.globalAlpha = Math.max(0, 1 - travel) * 0.85;
    ctx.fillStyle = coreCol;
    ctx.shadowColor = coreCol;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(bx + Math.cos(ang) * blobR * 0.4, by + Math.sin(ang) * blobR * 0.4, 2, 0, Math.PI * 2);
    ctx.fill();
    wire(ctx, color, 10);
  }

  ctx.globalAlpha = 1;
  ctx.lineWidth = 1.5;
}

export function deathBurst(ctx: Ctx, { cx, cy, radius = 0.9 }: AreaParams, t: number, { color = "#ffcc66", color2 }: EffectColors = {}): void {
  const rpx = radius * TILE_PX * 0.9;
  const accent = color2 || lighten(color, 0.4);

  const ring = rpx * (0.15 + 0.85 * t);
  ctx.globalAlpha = Math.max(0, 1 - t) * 0.9;
  wire(ctx, color, 14);
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy, ring, 0, Math.PI * 2); ctx.stroke();

  const shards = 8;
  wire(ctx, accent, 8);
  ctx.lineWidth = 1.5;
  for (let i = 0; i < shards; i++) {
    const seed = hash01(i + 3);
    const ang = (i / shards) * Math.PI * 2 + seed * 0.3;
    const r0 = rpx * (0.15 + t * 0.55);
    const r1 = r0 + rpx * (0.22 + seed * 0.18);
    ctx.globalAlpha = Math.max(0, 1 - t) * (0.5 + seed * 0.4);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
    ctx.lineTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
    ctx.stroke();
  }

  ctx.globalAlpha = Math.max(0, 1 - t * 2.5);
  wire(ctx, accent, 14);
  ctx.lineWidth = 1.5;
  const flashR = rpx * 0.22 * (1 - t * 0.7);
  if (flashR > 0.5) {
    ctx.beginPath(); ctx.arc(cx, cy, flashR, 0, Math.PI * 2); ctx.stroke();
  }

  ctx.globalAlpha = 1;
  ctx.lineWidth = 1.5;
}

// ═══════════════════════════════════════════════════════════
// TILE CLOUDS  — params: { cx, cy }
// ═══════════════════════════════════════════════════════════

function colorWithAlpha(hex: string, a: number): string {
  const v = Math.max(0, Math.min(255, Math.round(a * 255)));
  return hex + v.toString(16).padStart(2, "0");
}

export function cloudWavy(ctx: Ctx, { cx, cy }: TileCloudParams, t: number, { color = "#88ccaa", color2 }: EffectColors = {}): void {
  const tileX0 = cx - TILE_PX / 2;
  const tileY0 = cy - TILE_PX / 2;
  const tileY1 = tileY0 + TILE_PX;
  const steps = 12;
  const PERIOD = 18;

  ctx.save();
  ctx.shadowBlur = 0;

  const nStart = Math.ceil(tileY0 / PERIOD);
  const nEnd   = Math.floor((tileY1 - 0.001) / PERIOD);

  for (let n = nStart; n <= nEnd; n++) {
    const seed  = hash01(n * 7.31 + 1.7);
    const seed2 = hash01(n * 13.9 + 0.3);
    const baseY = n * PERIOD + (seed - 0.5) * 6;
    const h     = 9 + seed * 6;
    const amp   = 3 + seed2 * 3;
    const freq  = 0.035 + seed2 * 0.02;
    const phase = t * (1.2 + seed * 1.4) + n * 1.7;
    const drift = t * (4 + seed2 * 6);
    const useColor = (color2 && (n & 1)) ? color2 : color;

    ctx.globalAlpha = 0.4 + seed * 0.2;
    const g = ctx.createLinearGradient(0, baseY - amp, 0, baseY + h + amp);
    g.addColorStop(0,   useColor + "00");
    g.addColorStop(0.5, colorWithAlpha(useColor, 0.85));
    g.addColorStop(1,   useColor + "00");
    ctx.fillStyle = g;

    ctx.beginPath();
    for (let k = 0; k <= steps; k++) {
      const x = tileX0 + (k / steps) * TILE_PX;
      const y = baseY + Math.sin((x + drift) * freq + phase) * amp;
      if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    for (let k = steps; k >= 0; k--) {
      const x = tileX0 + (k / steps) * TILE_PX;
      const y = baseY + h + Math.sin((x + drift) * freq + phase + 0.4) * amp;
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// ═══════════════════════════════════════════════════════════
// OVERLAYS  — params: { cx, cy }
// ═══════════════════════════════════════════════════════════

export function burning(ctx: Ctx, { cx, cy }: OverlayParams, t: number, { color = "#ff6622" }: EffectColors = {}): void {
  const base = cy + 16;
  const bright = lighten(color, 0.4);

  ctx.globalAlpha = 0.7;
  wire(ctx, color, 8);
  const flames = 5;
  for (let i = 0; i < flames; i++) {
    const off = (i - (flames - 1) / 2) * 5;
    const phase = t * 6 + i * 1.7;
    const height = 10 + Math.sin(phase) * 3;
    const sway = Math.sin(phase * 1.3) * 2;
    ctx.beginPath();
    ctx.moveTo(cx + off, base);
    ctx.quadraticCurveTo(cx + off + sway, base - height * 0.6, cx + off + sway * 0.4, base - height);
    ctx.stroke();
  }

  ctx.globalAlpha = 0.9;
  wire(ctx, bright, 6);
  for (let i = 0; i < flames; i++) {
    const off = (i - (flames - 1) / 2) * 5;
    const phase = t * 6 + i * 1.7;
    const h = 5 + Math.sin(phase) * 1.5;
    ctx.beginPath();
    ctx.moveTo(cx + off, base);
    ctx.lineTo(cx + off + Math.sin(phase) * 1, base - h);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

export function sparkling(ctx: Ctx, { cx, cy }: OverlayParams, t: number, { color = "#88ddff" }: EffectColors = {}): void {
  const bright = lighten(color, 0.4);
  const n = 6;
  for (let i = 0; i < n; i++) {
    const seed = hash01(i + 1);
    const phase = t * 2 + seed * Math.PI * 2;
    const a = phase + i * (Math.PI * 2 / n);
    const r = 14 + Math.sin(phase * 1.3) * 3;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r * 0.7 - 4;
    const twinkle = 0.4 + 0.6 * Math.abs(Math.sin(phase * 2 + seed * 6));
    ctx.globalAlpha = twinkle * 0.8;
    wire(ctx, bright, 6);
    const s = 1.2 + twinkle;
    ctx.beginPath();
    ctx.moveTo(x - s, y); ctx.lineTo(x + s, y);
    ctx.moveTo(x, y - s); ctx.lineTo(x, y + s);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

export function dripping(ctx: Ctx, { cx, cy }: OverlayParams, t: number, { color = "#66cc66" }: EffectColors = {}): void {
  const bright = lighten(color, 0.3);
  const drops = 3;
  for (let i = 0; i < drops; i++) {
    const seed = hash01(i + 7);
    const dx = (seed - 0.5) * 20;
    const phase = (t * 0.8 + seed) % 1;
    const y = cy - 6 + phase * 26;
    const size = 1.8 + Math.sin(phase * Math.PI) * 0.8;
    ctx.globalAlpha = Math.sin(phase * Math.PI) * 0.85;
    wire(ctx, color, 6);
    ctx.beginPath(); ctx.arc(cx + dx, y, size, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + dx, y - size);
    ctx.lineTo(cx + dx, y - size - 3);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.35;
  wire(ctx, bright, 8);
  ctx.beginPath(); ctx.arc(cx, cy - 4, 10, Math.PI * 0.15, Math.PI - 0.15); ctx.stroke();
  ctx.globalAlpha = 1;
}

export function healing(ctx: Ctx, { cx, cy }: OverlayParams, t: number, { color = "#66ff88" }: EffectColors = {}): void {
  const bright = lighten(color, 0.3);
  const n = 4;
  for (let i = 0; i < n; i++) {
    const seed = hash01(i + 3);
    const phase = (t * 0.7 + seed) % 1;
    const dx = (seed - 0.5) * 24;
    const y = cy + 14 - phase * 30;
    const alpha = Math.sin(phase * Math.PI) * 0.85;
    ctx.globalAlpha = alpha;
    wire(ctx, bright, 8);
    const s = 2 + Math.sin(phase * Math.PI) * 1.5;
    ctx.beginPath();
    ctx.moveTo(cx + dx - s, y); ctx.lineTo(cx + dx + s, y);
    ctx.moveTo(cx + dx, y - s); ctx.lineTo(cx + dx, y + s);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.18 + 0.1 * Math.sin(t * 3);
  wire(ctx, color, 14);
  ctx.beginPath(); ctx.arc(cx, cy, 18, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 1;
}

export function barrier(ctx: Ctx, { cx, cy }: OverlayParams, t: number, { color = "#ffcc66" }: EffectColors = {}): void {
  const bright = lighten(color, 0.4);
  const sides = 6;
  const radius = 19;
  const spin = t * 0.6;
  const pulse = 0.75 + 0.25 * Math.sin(t * 2);
  const yScale = 0.72;

  const pts: [number, number][] = [];
  for (let i = 0; i < sides; i++) {
    const a = spin + i * (Math.PI * 2 / sides);
    pts.push([cx + Math.cos(a) * radius, cy + Math.sin(a) * radius * yScale - 2]);
  }

  ctx.globalAlpha = 0.35 * pulse;
  wire(ctx, color, 14);
  ctx.lineWidth = 3;
  ctx.beginPath();
  pts.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
  ctx.closePath();
  ctx.stroke();

  ctx.globalAlpha = 0.9 * pulse;
  wire(ctx, bright, 8);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  pts.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
  ctx.closePath();
  ctx.stroke();

  ctx.globalAlpha = pulse;
  wire(ctx, bright, 6);
  for (const [x, y] of pts) {
    ctx.beginPath(); ctx.arc(x, y, 1.6, 0, Math.PI * 2); ctx.stroke();
  }

  ctx.globalAlpha = 1;
  ctx.lineWidth = 1.5;
}

export const EFFECT_RENDERERS = {
  beam, bolt, arrow, zigzag, orbs, thrown,
  explosion, blobExplosion, deathBurst,
  cloudWavy,
  burning, sparkling, dripping, healing, barrier,
} as const;
