// Tile drawing — floor, wall, doors, and all variants.
// drawStairs is exported for use by render-objects.js (stairs are dungeon objects).
// Each drawer takes (ctx, gx, gy, col?) where col is an optional partial color override.
// Defaults come from TILE_DEFS.defaultColors (config/tiles.js).
//
// Color convention (all tiles):
//   col1 — boundary / structure  (grid lines, border rect, wall outline)
//   col2 — decorative content    (cracks, moss, pattern, rune, rivets)
//   Background fill on floor tiles is always hardcoded black — not a color slot.

import { TILE, C, wire, lighten } from './render-context.js';
import { TILE_DEFS } from '../config/tiles.js';

const FLOOR_BG = '#0a0600';

// ── Base floor / wall ─────────────────────────────────────

export function drawFloorTile(ctx, gx, gy, col) {
  const col1 = col?.col1 ?? TILE_DEFS.floor.defaultColors.col1;
  const x = gx * TILE, y = gy * TILE;

  ctx.fillStyle = FLOOR_BG;
  ctx.fillRect(x, y, TILE, TILE);

  ctx.strokeStyle = col1;
  ctx.lineWidth = 0.5;
  ctx.shadowBlur = 0;
  ctx.strokeRect(x + 1, y + 1, TILE - 2, TILE - 2);

  ctx.fillStyle = col1;
  ctx.shadowBlur = 0;
  const pad = 5;
  [pad, TILE - pad].forEach(dx => [pad, TILE - pad].forEach(dy => {
    ctx.beginPath(); ctx.arc(x + dx, y + dy, 1, 0, Math.PI * 2); ctx.fill();
  }));
}

export function drawWallTile(ctx, gx, gy, col) {
  const col1 = col?.col1 ?? TILE_DEFS.wall.defaultColors.col1;
  const x = gx * TILE, y = gy * TILE;

  wire(ctx, col1, 3);
  ctx.strokeRect(x + 2, y + 2, TILE - 4, TILE - 4);

  ctx.beginPath();
  ctx.moveTo(x + 2, y + TILE / 2);
  ctx.lineTo(x + TILE - 2, y + TILE / 2);
  ctx.moveTo(x + TILE / 2, y + 2);
  ctx.lineTo(x + TILE / 2, y + TILE / 2);
  ctx.moveTo(x + TILE / 4, y + TILE / 2);
  ctx.lineTo(x + TILE / 4, y + TILE - 2);
  ctx.moveTo(x + TILE * 3 / 4, y + TILE / 2);
  ctx.lineTo(x + TILE * 3 / 4, y + TILE - 2);
  ctx.stroke();
}

// ── Floor variants ────────────────────────────────────────

export function drawFloorCracked(ctx, gx, gy, col) {
  const d = TILE_DEFS.floor_cracked.defaultColors;
  const col1 = col?.col1 ?? d.col1, col2 = col?.col2 ?? d.col2;
  const x = gx * TILE, y = gy * TILE;
  ctx.fillStyle = FLOOR_BG; ctx.fillRect(x, y, TILE, TILE);
  wire(ctx, col1, 2);
  ctx.beginPath(); ctx.rect(x + 1, y + 1, TILE - 2, TILE - 2); ctx.stroke();
  wire(ctx, col2, 3);
  const ox = x + 18, oy = y + 22;
  for (const pts of [[[ox, oy], [ox + 14, oy - 16], [ox + 20, oy - 24]], [[ox, oy], [ox - 10, oy + 12], [ox - 14, oy + 20]], [[ox, oy], [ox + 18, oy + 10]], [[ox, oy], [ox - 7, oy - 10]], [[ox, oy], [ox + 5, oy + 22]]]) {
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  }
}

export function drawFloorMosaic(ctx, gx, gy, col) {
  const d = TILE_DEFS.floor_mosaic.defaultColors;
  const col1 = col?.col1 ?? d.col1, col2 = col?.col2 ?? d.col2;
  const x = gx * TILE, y = gy * TILE;
  ctx.fillStyle = FLOOR_BG; ctx.fillRect(x, y, TILE, TILE);
  wire(ctx, col1, 2);
  ctx.beginPath(); ctx.rect(x + 1, y + 1, TILE - 2, TILE - 2); ctx.stroke();
  wire(ctx, col2, 1.5);
  const h = 8;
  for (let r = 0; r <= 2; r++) for (let c = 0; c <= 2; c++) {
    const cx = x + c * h * 2 + h + 2, cy = y + r * h * 2 + h + 2;
    ctx.beginPath(); ctx.moveTo(cx, cy - h + 2); ctx.lineTo(cx + h - 2, cy); ctx.lineTo(cx, cy + h - 2); ctx.lineTo(cx - h + 2, cy); ctx.closePath(); ctx.stroke();
  }
}

export function drawFloorDirt(ctx, gx, gy, col) {
  const d = TILE_DEFS.floor_dirt.defaultColors;
  const col1 = col?.col1 ?? d.col1, col2 = col?.col2 ?? d.col2;
  const x = gx * TILE, y = gy * TILE;
  ctx.fillStyle = FLOOR_BG; ctx.fillRect(x, y, TILE, TILE);
  wire(ctx, col1, 1.5);
  ctx.beginPath(); ctx.rect(x + 1, y + 1, TILE - 2, TILE - 2); ctx.stroke();
  wire(ctx, col2, 2);
  for (const [dx, dy] of [[8, 10], [18, 6], [30, 14], [40, 8], [12, 28], [24, 34], [38, 28], [14, 40], [32, 40], [6, 20], [42, 22]]) {
    ctx.beginPath(); ctx.arc(x + dx, y + dy, 1, 0, Math.PI * 2); ctx.stroke();
  }
}

export function drawFloorMossy(ctx, gx, gy, col) {
  const d = TILE_DEFS.floor_mossy.defaultColors;
  const col1 = col?.col1 ?? d.col1, col2 = col?.col2 ?? d.col2;
  const x = gx * TILE, y = gy * TILE;
  ctx.fillStyle = FLOOR_BG; ctx.fillRect(x, y, TILE, TILE);
  ctx.strokeStyle = col1; ctx.lineWidth = 0.5; ctx.shadowBlur = 0;
  ctx.strokeRect(x + 1, y + 1, TILE - 2, TILE - 2);
  ctx.fillStyle = col1;
  const pad = 5;
  [pad, TILE - pad].forEach(dx => [pad, TILE - pad].forEach(dy => { ctx.beginPath(); ctx.arc(x + dx, y + dy, 1, 0, Math.PI * 2); ctx.fill(); }));
  wire(ctx, col2, 4); ctx.globalAlpha = 0.65;
  ctx.beginPath();
  ctx.moveTo(x + 4, y + 8); ctx.bezierCurveTo(x + 10, y + 4, x + 16, y + 10, x + 14, y + 16); ctx.bezierCurveTo(x + 8, y + 18, x + 3, y + 14, x + 4, y + 8); ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + 30, y + 28); ctx.bezierCurveTo(x + 38, y + 26, x + 44, y + 32, x + 42, y + 40); ctx.bezierCurveTo(x + 36, y + 44, x + 28, y + 40, x + 30, y + 28); ctx.closePath();
  ctx.stroke();
  wire(ctx, lighten(col2, 0.3), 3); ctx.globalAlpha = 0.55;
  for (const [dx, dy] of [[24, 10], [36, 14], [10, 30], [22, 38]]) {
    ctx.beginPath(); ctx.arc(x + dx, y + dy, 2, 0, Math.PI * 2); ctx.stroke();
  }
  wire(ctx, col2, 2); ctx.globalAlpha = 0.5;
  ctx.beginPath(); ctx.moveTo(x + 6, y + 12); ctx.lineTo(x + 2, y + 16); ctx.moveTo(x + 14, y + 14); ctx.lineTo(x + 18, y + 18); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + 34, y + 32); ctx.lineTo(x + 38, y + 36); ctx.moveTo(x + 40, y + 30); ctx.lineTo(x + 44, y + 26); ctx.stroke();
  ctx.globalAlpha = 1;
}

export function drawFloorRune(ctx, gx, gy, col) {
  const d = TILE_DEFS.floor_rune.defaultColors;
  const col1 = col?.col1 ?? d.col1, col2 = col?.col2 ?? d.col2;
  const x = gx * TILE, y = gy * TILE;
  ctx.fillStyle = FLOOR_BG; ctx.fillRect(x, y, TILE, TILE);
  wire(ctx, col1, 2);
  ctx.beginPath(); ctx.rect(x + 1, y + 1, TILE - 2, TILE - 2); ctx.stroke();
  ctx.fillStyle = col1; ctx.shadowBlur = 0;
  const pad = 5;
  [pad, TILE - pad].forEach(dx => [pad, TILE - pad].forEach(dy => { ctx.beginPath(); ctx.arc(x + dx, y + dy, 1, 0, Math.PI * 2); ctx.fill(); }));
  const rx = x + TILE / 2, ry = y + TILE / 2;
  wire(ctx, col2, 3); ctx.globalAlpha = 0.6;
  ctx.beginPath(); ctx.arc(rx, ry, 12, 0, Math.PI * 2); ctx.stroke();
  wire(ctx, col2, 2); ctx.globalAlpha = 0.75;
  ctx.beginPath();
  [0, 2, 4, 1, 3].forEach((i, idx) => {
    const a = -Math.PI / 2 + i * Math.PI * 2 / 5;
    const px = rx + Math.cos(a) * 11, py = ry + Math.sin(a) * 11;
    idx === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  });
  ctx.closePath(); ctx.stroke();
  ctx.globalAlpha = 1;
}

// ── Wall variants ────────────────────────────────────────

export function drawWallRough(ctx, gx, gy, col) {
  const col1 = col?.col1 ?? TILE_DEFS.wall_rough.defaultColors.col1;
  const x = gx * TILE, y = gy * TILE;
  wire(ctx, col1, 4);
  ctx.beginPath(); ctx.rect(x + 1, y + 1, TILE - 2, TILE - 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + 2, y + TILE / 2); ctx.lineTo(x + TILE - 2, y + TILE / 2); ctx.stroke();
  wire(ctx, col1, 3);
  ctx.beginPath(); ctx.moveTo(x + 15, y + 2); ctx.lineTo(x + 13, y + TILE / 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + 34, y + 2); ctx.lineTo(x + 36, y + TILE / 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + 8, y + TILE / 2); ctx.lineTo(x + 10, y + TILE - 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + 22, y + TILE / 2); ctx.lineTo(x + 20, y + TILE - 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + 38, y + TILE / 2); ctx.lineTo(x + 40, y + TILE - 2); ctx.stroke();
}

export function drawWallReinforced(ctx, gx, gy, col) {
  const d = TILE_DEFS.wall_reinforced.defaultColors;
  const col1 = col?.col1 ?? d.col1, col2 = col?.col2 ?? d.col2;
  const x = gx * TILE, y = gy * TILE;
  wire(ctx, col1, 4);
  ctx.beginPath(); ctx.rect(x + 1, y + 1, TILE - 2, TILE - 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + 2, y + TILE / 2); ctx.lineTo(x + TILE - 2, y + TILE / 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + TILE / 2, y + 2); ctx.lineTo(x + TILE / 2, y + TILE / 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + TILE / 4, y + TILE / 2); ctx.lineTo(x + TILE / 4, y + TILE - 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + TILE * 3 / 4, y + TILE / 2); ctx.lineTo(x + TILE * 3 / 4, y + TILE - 2); ctx.stroke();
  wire(ctx, col2, 6);
  ctx.beginPath(); ctx.moveTo(x + 2, y + TILE / 2); ctx.lineTo(x + TILE - 2, y + TILE / 2); ctx.stroke();
  const rp = 5;
  for (const [dx, dy] of [[rp, rp], [TILE - rp, rp], [rp, TILE - rp], [TILE - rp, TILE - rp]]) {
    ctx.beginPath(); ctx.arc(x + dx, y + dy, 2.5, 0, Math.PI * 2); ctx.stroke();
  }
}

export function drawWallMossy(ctx, gx, gy, col) {
  const d = TILE_DEFS.wall_mossy.defaultColors;
  const col1 = col?.col1 ?? d.col1, col2 = col?.col2 ?? d.col2;
  const x = gx * TILE, y = gy * TILE;
  wire(ctx, col1, 4);
  ctx.beginPath(); ctx.rect(x + 1, y + 1, TILE - 2, TILE - 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + 2, y + TILE / 2); ctx.lineTo(x + TILE - 2, y + TILE / 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + TILE / 2, y + 2); ctx.lineTo(x + TILE / 2, y + TILE / 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + TILE / 4, y + TILE / 2); ctx.lineTo(x + TILE / 4, y + TILE - 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + TILE * 3 / 4, y + TILE / 2); ctx.lineTo(x + TILE * 3 / 4, y + TILE - 2); ctx.stroke();
  wire(ctx, col2, 4); ctx.globalAlpha = 0.65;
  ctx.beginPath(); ctx.moveTo(x + 2, y + 10); ctx.bezierCurveTo(x + 8, y + 6, x + 16, y + 14, x + 24, y + 9); ctx.bezierCurveTo(x + 30, y + 5, x + 38, y + 12, x + 46, y + 8); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + 4, y + 30); ctx.bezierCurveTo(x + 12, y + 26, x + 22, y + 34, x + 30, y + 28); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + 28, y + 40); ctx.bezierCurveTo(x + 36, y + 36, x + 42, y + 42, x + 46, y + 38); ctx.stroke();
  ctx.globalAlpha = 1;
}

export function drawWallCyclopean(ctx, gx, gy, col) {
  const col1 = col?.col1 ?? TILE_DEFS.wall_cyclopean.defaultColors.col1;
  const x = gx * TILE, y = gy * TILE;
  wire(ctx, col1, 4);
  ctx.beginPath(); ctx.rect(x + 1, y + 1, TILE - 2, TILE - 2); ctx.stroke();
  const split = Math.round(TILE * 0.55);
  ctx.beginPath(); ctx.moveTo(x + 2, y + split); ctx.lineTo(x + TILE - 2, y + split); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + 28, y + 2); ctx.lineTo(x + 28, y + split); ctx.stroke();
}

export function drawWallCave(ctx, gx, gy, col) {
  const col1 = col?.col1 ?? TILE_DEFS.wall_cave.defaultColors.col1;
  const x = gx * TILE, y = gy * TILE;
  wire(ctx, col1, 4);
  ctx.beginPath();
  ctx.moveTo(x + 4, y + 2); ctx.lineTo(x + 30, y + 1); ctx.lineTo(x + 46, y + 8); ctx.lineTo(x + 47, y + 34);
  ctx.lineTo(x + 44, y + 46); ctx.lineTo(x + 18, y + 47); ctx.lineTo(x + 2, y + 40); ctx.lineTo(x + 1, y + 16);
  ctx.closePath(); ctx.stroke();
  wire(ctx, col1, 2);
  ctx.beginPath(); ctx.moveTo(x + 12, y + 2); ctx.lineTo(x + 8, y + 22); ctx.lineTo(x + 18, y + 38); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + 32, y + 2); ctx.lineTo(x + 38, y + 18); ctx.lineTo(x + 44, y + 34); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + 8, y + 22); ctx.lineTo(x + 28, y + 18); ctx.lineTo(x + 38, y + 18); ctx.stroke();
}

// ── Stairs ───────────────────────────────────────────────

/** Draw stairs centered at pixel (cx, cy). direction: 'down' | 'up'. */
export function drawStairs(ctx, cx, cy, direction, col) {
  const col1 = col?.col1 ?? (direction === 'down' ? C.stairsDown : C.stairsUp);
  const sign = direction === 'down' ? 1 : -1;
  const outerR = 21, innerR = 3, rayCount = 16;

  wire(ctx, col1, 5);
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
  ctx.stroke();

  for (let i = 0; i < rayCount; i++) {
    const angle = (i / rayCount) * Math.PI * 2;
    const frac = i / (rayCount - 1);
    const alpha = 1.0 - frac * 0.8;
    const glow = 8 - frac * 6;

    wire(ctx, col1, glow);
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * innerR, cy + Math.sin(angle) * innerR);
    ctx.lineTo(cx + Math.cos(angle) * outerR, cy + Math.sin(angle) * outerR);
    ctx.stroke();
  }

  wire(ctx, col1, 10);
  ctx.globalAlpha = 1.0;
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.stroke();

  wire(ctx, col1, 6);
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  ctx.moveTo(cx - 4, cy + sign * 1); ctx.lineTo(cx, cy + sign * 5); ctx.lineTo(cx + 4, cy + sign * 1);
  ctx.moveTo(cx - 4, cy + sign * 5); ctx.lineTo(cx, cy + sign * 9); ctx.lineTo(cx + 4, cy + sign * 5);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// ── Doors ────────────────────────────────────────────────

/** Closed door body — draws at (cx, cy) pixel center, no floor underneath. */
export function drawDoorBody(ctx, cx, cy, col) {
  const d = TILE_DEFS.door.defaultColors;
  const col1 = col?.col1 ?? d.col1, col2 = col?.col2 ?? d.col2;
  wire(ctx, col1, 4);
  ctx.beginPath(); ctx.moveTo(cx - 10, cy + 16); ctx.lineTo(cx - 10, cy - 12); ctx.lineTo(cx + 10, cy - 12); ctx.lineTo(cx + 10, cy + 16); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy - 12, 10, Math.PI, 0); ctx.stroke();
  wire(ctx, lighten(col1, 0.2), 2);
  ctx.beginPath(); ctx.moveTo(cx, cy - 20); ctx.lineTo(cx, cy + 16); ctx.moveTo(cx - 6, cy - 16); ctx.lineTo(cx - 6, cy + 16); ctx.moveTo(cx + 6, cy - 16); ctx.lineTo(cx + 6, cy + 16); ctx.stroke();
  wire(ctx, col2, 3);
  ctx.beginPath(); ctx.moveTo(cx - 10, cy - 4); ctx.lineTo(cx + 10, cy - 4); ctx.moveTo(cx - 10, cy + 8); ctx.lineTo(cx + 10, cy + 8); ctx.stroke();
  wire(ctx, lighten(col2, 0.3), 6);
  ctx.beginPath(); ctx.arc(cx + 5, cy + 2, 2, 0, Math.PI * 2); ctx.stroke();
}

/** Open door body — draws at (cx, cy) pixel center, no floor underneath. */
export function drawDoorOpenBody(ctx, cx, cy, col) {
  const d = TILE_DEFS.door_open.defaultColors;
  const col1 = col?.col1 ?? d.col1, col2 = col?.col2 ?? d.col2;
  ctx.fillStyle = col2;
  ctx.beginPath(); ctx.moveTo(cx - 9, cy + 16); ctx.lineTo(cx - 9, cy - 12); ctx.lineTo(cx + 9, cy - 12); ctx.lineTo(cx + 9, cy + 16); ctx.closePath(); ctx.fill();
  wire(ctx, lighten(col1, 0.15), 4);
  ctx.globalAlpha = 0.5;
  ctx.beginPath(); ctx.moveTo(cx - 10, cy + 16); ctx.lineTo(cx - 10, cy - 12); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + 10, cy - 12); ctx.lineTo(cx + 10, cy + 16); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy - 12, 10, Math.PI, 0); ctx.stroke();
  ctx.globalAlpha = 1;
}

/** Closed door tile — draws floor then body. */
export function drawDoorTile(ctx, gx, gy, col) {
  drawFloorTile(ctx, gx, gy);
  drawDoorBody(ctx, gx * TILE + TILE / 2, gy * TILE + TILE / 2, col);
}

/** Open door tile — draws floor then body. */
export function drawDoorOpenTile(ctx, gx, gy, col) {
  drawFloorTile(ctx, gx, gy);
  drawDoorOpenBody(ctx, gx * TILE + TILE / 2, gy * TILE + TILE / 2, col);
}

// ── Dispatch map ─────────────────────────────────────────
// Keyed by tile string. Each entry draws the tile at (gx, gy) with optional per-cell color override.

export const TILE_RENDERERS = {
  floor:           (ctx, gx, gy, col) => drawFloorTile(ctx, gx, gy, col),
  floor_cracked:   (ctx, gx, gy, col) => drawFloorCracked(ctx, gx, gy, col),
  floor_mosaic:    (ctx, gx, gy, col) => drawFloorMosaic(ctx, gx, gy, col),
  floor_dirt:      (ctx, gx, gy, col) => drawFloorDirt(ctx, gx, gy, col),
  floor_mossy:     (ctx, gx, gy, col) => drawFloorMossy(ctx, gx, gy, col),
  floor_rune:      (ctx, gx, gy, col) => drawFloorRune(ctx, gx, gy, col),

  wall:            (ctx, gx, gy, col) => drawWallTile(ctx, gx, gy, col),
  wall_rough:      (ctx, gx, gy, col) => drawWallRough(ctx, gx, gy, col),
  wall_reinforced: (ctx, gx, gy, col) => drawWallReinforced(ctx, gx, gy, col),
  wall_mossy:      (ctx, gx, gy, col) => drawWallMossy(ctx, gx, gy, col),
  wall_cyclopean:  (ctx, gx, gy, col) => drawWallCyclopean(ctx, gx, gy, col),
  wall_cave:       (ctx, gx, gy, col) => drawWallCave(ctx, gx, gy, col),

  door:            (ctx, gx, gy, col) => drawDoorTile(ctx, gx, gy, col),
  door_open:       (ctx, gx, gy, col) => drawDoorOpenTile(ctx, gx, gy, col),
};

/** Draw any tile by its string key. Falls back to floor for unknowns. */
export function drawTile(ctx, tile, gx, gy, col) {
  const fn = TILE_RENDERERS[tile];
  if (fn) { fn(ctx, gx, gy, col); return; }
  drawFloorTile(ctx, gx, gy, col);
}
