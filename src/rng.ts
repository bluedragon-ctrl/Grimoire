// Deterministic RNG — mulberry32.
//
// The engine threads a single uint32 seed through the World so every random
// decision (loot rolls for now; future: crit/miss, monster-AI choices) is
// reproducible given the same setup + seed. No caller reaches for
// Math.random.

import type { World } from "./types.js";

// Advance `state` and return the next uint32. Mulberry32 passes basic tests
// and fits in a single integer, which keeps World serializable.
function mulberry32(state: number): { state: number; value: number } {
  let t = (state + 0x6D2B79F5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0);
  return { state: (state + 0x6D2B79F5) | 0, value };
}

// Uniform float in [0, 1). Mutates world.rngSeed (initialising to 1 if the
// caller built a bare World without threading a seed — tests do this).
export function worldRandom(world: World): number {
  const r = mulberry32(world.rngSeed ?? 1);
  world.rngSeed = r.state;
  return r.value / 0x100000000;
}

// Uniform integer in [lo, hi] inclusive.
export function worldRandInt(world: World, lo: number, hi: number): number {
  if (hi <= lo) return lo;
  return lo + Math.floor(worldRandom(world) * (hi - lo + 1));
}
