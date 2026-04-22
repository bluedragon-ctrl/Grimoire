// Pathfinding — A* algorithm for monster movement. Pure function.

import { blocksMove } from '../config/tiles.js';

const MAX_SEARCH_NODES = 2000;

// ── Minimal binary min-heap keyed by `.f`. ────────────────
// Self-contained so the A* helper stays in-file. Keeps `open` pops O(log n)
// instead of O(n) — avoids the linear scan + Array.splice + `open.some()`
// triple threat that showed up on big floors.
class MinHeap {
  constructor() { this.data = []; }
  get size() { return this.data.length; }
  push(node) {
    const d = this.data;
    d.push(node);
    let i = d.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (d[parent].f <= d[i].f) break;
      [d[parent], d[i]] = [d[i], d[parent]];
      i = parent;
    }
  }
  pop() {
    const d = this.data;
    if (d.length === 0) return undefined;
    const top = d[0];
    const last = d.pop();
    if (d.length > 0) {
      d[0] = last;
      let i = 0;
      const n = d.length;
      for (;;) {
        const l = 2 * i + 1, r = 2 * i + 2;
        let smallest = i;
        if (l < n && d[l].f < d[smallest].f) smallest = l;
        if (r < n && d[r].f < d[smallest].f) smallest = r;
        if (smallest === i) break;
        [d[smallest], d[i]] = [d[i], d[smallest]];
        i = smallest;
      }
    }
    return top;
  }
}

/**
 * Find shortest path from (sx, sy) to (gx, gy) on the map.
 * Avoids walls and optionally occupied tiles.
 * @param {string[][]} map
 * @param {number} sx - Start x
 * @param {number} sy - Start y
 * @param {number} gx - Goal x
 * @param {number} gy - Goal y
 * @param {Set<string>} blocked - Set of "x,y" strings for occupied tiles to avoid
 * @returns {Array<{x: number, y: number}>|null} Path (excluding start), or null if unreachable
 */
export function findPath(map, sx, sy, gx, gy, blocked = new Set()) {
  const h = map.length;
  const w = map[0].length;

  if (sx === gx && sy === gy) return [];

  const open = new MinHeap();
  const closed = new Set();
  const gScore = new Map();
  const parent = new Map();

  const startKey = `${sx},${sy}`;
  const goalKey = `${gx},${gy}`;

  gScore.set(startKey, 0);
  open.push({ x: sx, y: sy, f: heuristic(sx, sy, gx, gy) });

  const dirs = [
    { dx: 0, dy: -1 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 },
  ];

  while (open.size > 0) {
    const current = open.pop();
    const curKey = `${current.x},${current.y}`;

    // Heap can hold stale entries (we push a better-f copy rather than
    // decrease-key the existing node). Skip any we've already closed.
    if (closed.has(curKey)) continue;

    if (curKey === goalKey) {
      return reconstructPath(parent, curKey);
    }

    closed.add(curKey);

    for (const d of dirs) {
      const nx = current.x + d.dx;
      const ny = current.y + d.dy;
      const nKey = `${nx},${ny}`;

      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (blocksMove(map[ny][nx])) continue;
      if (closed.has(nKey)) continue;
      // Allow walking onto the goal tile even if "blocked" (it's the target)
      if (blocked.has(nKey) && nKey !== goalKey) continue;

      const tentG = gScore.get(curKey) + 1;

      if (!gScore.has(nKey) || tentG < gScore.get(nKey)) {
        gScore.set(nKey, tentG);
        parent.set(nKey, curKey);
        const f = tentG + heuristic(nx, ny, gx, gy);
        open.push({ x: nx, y: ny, f });
      }
    }

    // Safety: limit search to prevent hanging on huge maps
    if (closed.size > MAX_SEARCH_NODES) return null;
  }

  return null; // No path found
}

function heuristic(x1, y1, x2, y2) {
  return Math.abs(x2 - x1) + Math.abs(y2 - y1);
}

function reconstructPath(parent, endKey) {
  const path = [];
  let key = endKey;
  while (parent.has(key)) {
    const [x, y] = key.split(',').map(Number);
    path.unshift({ x, y });
    key = parent.get(key);
  }
  return path;
}
