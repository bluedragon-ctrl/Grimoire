// Damage types — enum + validator.
//
// Every damage packet in the engine carries a type from this list. DEF
// applies flat to all damage; a defender's resistances[type] subtracts an
// additional (possibly negative → vulnerability) amount on top of DEF.
//
// `true` damage is the escape hatch for sources that must not be resistible
// (scripted damage, future traps/falls, self-harm). Nothing resists it —
// resistances[type] is ignored for 'true'.
//
// To add a type: add it here, give it a one-line purpose, add a help entry
// in `help damagetypes`. Nothing else in the engine needs to know.

export const DAMAGE_TYPES = Object.freeze({
  PHYSICAL:  'physical',    // melee, arrows, thrown rocks — default for non-spell sources
  ARCANE:    'arcane',      // raw magic force — default for spells with no elemental flavor
  FIRE:      'fire',        // firebolt, fireball, burn DoT
  FROST:     'frost',       // frostbolt, cold clouds, slow ticks
  LIGHTNING: 'lightning',   // chain lightning, shock DoT — reserved for future spells
  POISON:    'poison',      // poison DoT, poison clouds, acid. Biological — NOT in 'magical'.
  TRUE:      'true',        // bypasses resistances (not DEF). Escape hatch for scripted damage.
});

/**
 * Each damage type belongs to its own singleton category plus any umbrella
 * categories that apply. When computing mitigation, a defender's resistance
 * is summed over ALL categories the incoming damage's type belongs to — so
 * `resistances: { fire: 5, magical: 3 }` gives 8 total mitigation vs firebolt.
 *
 * Design notes on the `magical` group:
 *   - Covers the four wizard schools (arcane, fire, frost, lightning).
 *   - Poison excluded on purpose — poison is biological/chemical, not a
 *     magic school. A "spell ward" shouldn't block a snake bite.
 *   - Physical is its own singleton. A "physical ward" would use resist.physical.
 *   - `true` has NO categories — bypasses the whole system by design.
 *
 * Add a new umbrella by appending the category key to each member type's list.
 * Expect `elemental = fire|frost|lightning` to appear here later if content
 * needs a non-arcane magic group.
 */
export const TYPE_CATEGORIES = Object.freeze({
  physical:  Object.freeze(['physical']),
  arcane:    Object.freeze(['arcane',    'magical']),
  fire:      Object.freeze(['fire',      'magical']),
  frost:     Object.freeze(['frost',     'magical']),
  lightning: Object.freeze(['lightning', 'magical']),
  poison:    Object.freeze(['poison']),
  true:      Object.freeze([]),
});

const VALID = new Set(Object.values(DAMAGE_TYPES));

export function isValidDamageType(t) {
  return typeof t === 'string' && VALID.has(t);
}

/** Throws on invalid. Use at config-load boundaries (spells, clouds). */
export function validateDamageType(t, context = '') {
  if (!isValidDamageType(t)) {
    const where = context ? ` (${context})` : '';
    throw new Error(`Invalid damage type: ${JSON.stringify(t)}${where}. Valid: ${[...VALID].join(', ')}`);
  }
}
