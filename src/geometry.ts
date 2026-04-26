// Pure geometric helpers shared across the engine, dungeon generator, and
// renderer. Depends only on the Pos type — no World, no Actor, no I/O.
//
// Distance metric for actor-to-actor checks is Chebyshev (matches the
// 8-directional one-tile-per-tick movement of approach/flee). Manhattan is
// kept for floor-item proximity sorting.

import type { Pos, World } from "./types.js";

export function chebyshev(a: Pos, b: Pos): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

export function manhattan(a: Pos, b: Pos): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function adjacent(a: Pos, b: Pos): boolean {
  return chebyshev(a, b) === 1;
}

export function inBounds(world: World, p: Pos): boolean {
  return p.x >= 0 && p.y >= 0 && p.x < world.room.w && p.y < world.room.h;
}
