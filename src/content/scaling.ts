// Single tunable knob for INT-based magnitude scaling. Primitives import this
// and apply it to damage, amount, and duration args — never to range or mpCost.

export function scale(base: number, int: number): number {
  return Math.floor(base * (1 + int / 10));
}

// Radius scaling uses a slower curve so high-INT casters gain reach
// without making every AoE spell trivially room-wide.
export function scaleRadius(base: number, int: number): number {
  return base + Math.floor(int / 8);
}

// Phase 14: monster level scaling. Applied to hp/maxHp/mp/maxMp/atk/def/int
// at spawn time. Speed and immunities/family do NOT scale.
// Templates store the stats at level 1 baseline.
export function scaleByLevel(base: number, level: number): number {
  return Math.floor(base * (1 + 0.15 * (level - 1)));
}
