// Line-of-sight helpers. Kept in a standalone module so both commands.ts and
// spells/cast.ts can import without a circular dependency.
//
// Current opacity model: smoke clouds (kind === "smoke") block LOS for their
// lifetime. Structural wall tiles are not yet modelled (no wall map on Room).
//
// Convention: the source tile is never opaque (you can see from where you stand
// regardless of local cloud cover). Adjacency (Chebyshev 1) always has LOS.

import type { Pos, World } from "./types.js";

export function hasLineOfSight(world: World, from: Pos, to: Pos): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  if (steps <= 1) return true; // adjacent — always clear

  const clouds = world.room.clouds ?? [];
  const smoke = new Set(
    clouds
      .filter(c => c.kind === "smoke" && c.remaining > 0)
      .map(c => `${c.pos.x},${c.pos.y}`),
  );
  if (smoke.size === 0) return true;

  // Walk tiles from from+1 step to to (inclusive), skipping from itself.
  for (let i = 1; i <= steps; i++) {
    const px = Math.round(from.x + dx * i / steps);
    const py = Math.round(from.y + dy * i / steps);
    if (smoke.has(`${px},${py}`)) return false;
  }
  return true;
}

/** True if any smoke cloud covers the given tile. */
export function tileHasSmoke(world: World, pos: Pos): boolean {
  const clouds = world.room.clouds ?? [];
  return clouds.some(c => c.kind === "smoke" && c.remaining > 0 && c.pos.x === pos.x && c.pos.y === pos.y);
}
