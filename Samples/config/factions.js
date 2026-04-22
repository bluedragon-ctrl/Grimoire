// Faction relations — drives the `enemies` / `allies` selectors and any
// future hostility logic. Keyed by faction string (see PLAYER_TEMPLATE and
// MONSTER_TEMPLATES for the `faction` field).
//
// Relation values:
//   'allied'   — same side. Included by `allies`, excluded by `enemies`.
//   'hostile'  — fight on sight. Included by `enemies`.
//   'neutral'  — non-combatant (reserved). Excluded by both selectors today,
//                i.e. "don't attack, don't defend." No shipped entity uses
//                this yet — wandering traders / lore NPCs will.
//
// Symmetry is NOT required by the schema: A[B] = 'hostile' means A treats B
// as an enemy, independent of B's view of A. All shipped entries today are
// symmetric — no predator/prey asymmetry yet, but the shape leaves room.

export const FACTION_RELATIONS = {
  player:  { player: 'allied',  monster: 'hostile', undead: 'hostile' },
  monster: { player: 'hostile', monster: 'allied',  undead: 'hostile' },
  undead:  { player: 'hostile', monster: 'hostile', undead: 'allied'  },
};

// Unknown faction pairs default to 'hostile' — safer than 'allied' when a
// new faction lands without full table coverage, and matches the default
// "everything is an enemy" assumption the game started from.
export function factionRelation(a, b) {
  return FACTION_RELATIONS[a]?.[b] ?? 'hostile';
}
