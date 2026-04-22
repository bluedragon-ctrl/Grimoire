// Room archetypes — phase 9 fills this in.
//
// Each archetype will declare populate rules (monsters, objects, loot)
// and placement constraints (weight, maxPerFloor, minDepth, sizeHints).
//
// Target shape (phase 9):
//   empty:    { weight: 40, populate: {} }
//   guards:   { weight: 20, populate: { group: 'skeleton_patrol' } }
//   treasure: { weight: 10, maxPerFloor: 1, populate: { objects: ['chest'], group: 'skeleton_patrol' } }
//   shrine:   { weight: 8,  maxPerFloor: 1, populate: { objects: ['shrine'] } }
//   ...

export const ROOM_ARCHETYPES = {};

/**
 * Pick an archetype for a room. Stub — always returns null.
 * Phase 9 replaces this with weighted selection respecting depth,
 * room size, and per-floor caps.
 */
export function pickArchetype(/* room, depth, rng, floorState */) {
  return null;
}
