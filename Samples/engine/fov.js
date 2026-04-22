// Field of View / Line of Sight — pure functions.
// Uses recursive shadowcasting (no gaps, O(visible tiles)).

import { blocksSight } from '../config/tiles.js';

// Eight octants — each defined by (dx_row, dy_row, dx_col, dy_col).
// "row" = distance from origin, "col" = lateral sweep within that row.
const OCTANTS = [
  [ 1,  0,  0,  1],   // E  → SE
  [ 0,  1,  1,  0],   // S  → SE
  [ 0,  1, -1,  0],   // S  → SW
  [-1,  0,  0,  1],   // W  → SW
  [-1,  0,  0, -1],   // W  → NW
  [ 0, -1, -1,  0],   // N  → NW
  [ 0, -1,  1,  0],   // N  → NE
  [ 1,  0,  0, -1],   // E  → NE
];

/**
 * Compute all visible tiles from a given origin within a radius.
 * Uses recursive shadowcasting — gap-free and fast.
 * @param {string[][]} map - The dungeon map grid
 * @param {number} ox - Origin x
 * @param {number} oy - Origin y
 * @param {number} radius - Vision radius in tiles
 * @returns {Set<string>} Set of "x,y" strings for visible tiles
 */
export function computeFOV(map, ox, oy, radius, extraOpaque = null) {
  const visible = new Set();
  visible.add(`${ox},${oy}`);

  const height = map.length;
  const width = map[0].length;

  for (const oct of OCTANTS) {
    scanOctant(map, ox, oy, radius, width, height, visible, oct, 1, 0.0, 1.0, extraOpaque);
  }

  return visible;
}

/**
 * Recursively scan one octant row by row.
 * @param {number} row - Current distance from origin
 * @param {number} startSlope - Left edge of visible arc (0..1)
 * @param {number} endSlope - Right edge of visible arc (0..1)
 */
function scanOctant(map, ox, oy, radius, w, h, visible, oct, row, startSlope, endSlope, extraOpaque) {
  if (startSlope >= endSlope) return;

  const [dxRow, dyRow, dxCol, dyCol] = oct;
  const r2 = radius * radius;

  let blocked = false;
  let nextStart = startSlope;

  for (let dist = row; dist <= radius && !blocked; dist++) {
    const minCol = Math.round(dist * startSlope);
    const maxCol = Math.ceil(dist * endSlope);

    for (let col = minCol; col <= maxCol; col++) {
      const x = ox + dxRow * dist + dxCol * col;
      const y = oy + dyRow * dist + dyCol * col;

      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      if (dist * dist + col * col > r2) continue;

      // Slopes for this cell's edges
      const leftSlope  = (col - 0.5) / (dist + 0.5);
      const rightSlope = (col + 0.5) / (dist - 0.5 || 0.001);

      if (rightSlope < startSlope) continue;
      if (leftSlope > endSlope) continue;

      // This tile is visible
      visible.add(`${x},${y}`);

      const opaque = isOpaque(map, x, y) || (extraOpaque && extraOpaque.has(`${x},${y}`));

      if (blocked) {
        // Previous cell was opaque
        if (opaque) {
          // Still blocked — shrink the start slope
          nextStart = (col + 0.5) / (dist + 0.5);
        } else {
          // Transition from blocked → open
          blocked = false;
          startSlope = nextStart;
        }
      } else if (opaque && dist < radius) {
        // Transition from open → blocked — recurse for the open arc so far
        blocked = true;
        scanOctant(map, ox, oy, radius, w, h, visible, oct, dist + 1, startSlope, (col - 0.5) / (dist + 0.5), extraOpaque);
        nextStart = (col + 0.5) / (dist + 0.5);
      }
    }

    if (blocked) break;
  }
}

/**
 * Check if there is line of sight between two points.
 * Uses Bresenham-style line walk.
 * @param {string[][]} map
 * @param {number} x1 - From x
 * @param {number} y1 - From y
 * @param {number} x2 - To x
 * @param {number} y2 - To y
 * @returns {boolean}
 */
export function isInLOS(map, x1, y1, x2, y2) {
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  const sx = x1 < x2 ? 1 : -1;
  const sy = y1 < y2 ? 1 : -1;
  let err = dx - dy;
  let cx = x1;
  let cy = y1;

  while (cx !== x2 || cy !== y2) {
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      cx += sx;
    }
    if (e2 < dx) {
      err += dx;
      cy += sy;
    }

    if (cx === x2 && cy === y2) return true;
    if (isOpaque(map, cx, cy)) return false;
  }

  return true;
}

/**
 * Manhattan distance between two points.
 */
export function distance(x1, y1, x2, y2) {
  return Math.abs(x2 - x1) + Math.abs(y2 - y1);
}

// ── Internal ────────────────────────────────────────────────

function isOpaque(map, x, y) {
  if (y < 0 || y >= map.length || x < 0 || x >= map[0].length) return true;
  return blocksSight(map[y][x]);
}
