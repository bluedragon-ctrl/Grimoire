// Geometry helpers — shape flood-fills used by clouds and visual effects.
// Pure functions: no imports from state, no side effects.

/**
 * Flood-fill outward from (cx, cy) up to Euclidean distance `radius`, stopping
 * at tiles where `isWallFn(x, y)` returns true. Returns an array of {x, y}.
 *
 * Uses an index cursor instead of Array.shift to keep the BFS O(n) even on
 * large shapes — shift is O(n) and turned big clouds into an O(n²) hot path.
 */
export function floodCircle(cx, cy, radius, isWallFn) {
  const result = [];
  const seen = new Set();
  const key = (x, y) => x + ',' + y;
  const r2 = radius * radius;
  const queue = [{ x: cx, y: cy }];
  seen.add(key(cx, cy));
  let head = 0;
  while (head < queue.length) {
    const { x, y } = queue[head++];
    if (isWallFn(x, y)) continue;
    result.push({ x, y });
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx, ny = y + dy;
        if (seen.has(key(nx, ny))) continue;
        seen.add(key(nx, ny));
        const ddx = nx - cx, ddy = ny - cy;
        if (ddx * ddx + ddy * ddy > r2) continue;
        if (isWallFn(nx, ny)) continue;
        queue.push({ x: nx, y: ny });
      }
    }
  }
  return result;
}

/** Stable "x,y" string key for tile sets. */
export function tileKey(x, y) {
  return x + ',' + y;
}
