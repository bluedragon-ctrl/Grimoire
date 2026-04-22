// Combat engine — pure functions for damage calculation and range checks.

import { distance, isInLOS } from './fov.js';
import { clearEffectsFor } from './effects.js';
import { pruneEnteredOnDeath } from './clouds.js';
import { MELEE_SCALING } from '../config/commands.js';
import { DAMAGE_TYPES, TYPE_CATEGORIES } from '../config/damage-types.js';
import { fireOnDamaged, fireOnKill, fireEquipmentOnHit } from './hooks.js';
import { effectiveStat } from './game-state.js';
import { noteDamage as catalogNoteDamage, noteKill as catalogNoteKill } from './catalog.js';

/**
 * Sum a defender's resistance over every category the incoming type belongs
 * to. E.g. fire damage vs `{ fire: 5, magical: 3 }` → 8. Unknown types have
 * no categories and resolve to 0. `true` has an empty category list → 0.
 */
function totalResist(defender, type) {
  if (!defender || !defender.resistances) return 0;
  const cats = TYPE_CATEGORIES[type];
  if (!cats) return 0;
  let sum = 0;
  for (const cat of cats) sum += (defender.resistances[cat] || 0);
  return sum;
}

/**
 * Linear per-level scaling, floored.
 * scaleValue(10, 3, 0.25) = floor(10 * (1 + 0.5)) = 15
 * Missing rate (0/undefined) returns base unchanged.
 */
export function scaleValue(base, level, rate) {
  if (!rate) return base;
  const l = level || 1;
  return Math.floor(base * (1 + rate * (l - 1)));
}

/**
 * Calculate damage from attacker to defender.
 *
 * Damage type resolution (Phase 1 — all sources default to physical):
 *   - explicit `type` arg wins (used by DSL `harm`, status DoTs, clouds)
 *   - else spell.damageType if a spell was passed
 *   - else physical (melee default)
 *
 * Formula: damage = max(1, floor(base − def − resist[type]))
 *   - DEF is universal flat subtraction against all types.
 *   - resist[type] stacks on DEF; negative values = vulnerability.
 *   - `true` damage bypasses resistances but NOT def (by design).
 *   - Minimum 1 damage always lands.
 *
 * @param {object} attacker
 * @param {object} defender
 * @param {object|null} spell
 * @param {string|null} type - Explicit damage type; overrides spell.damageType.
 * @returns {{ damage: number, type: string, isCrit: boolean }}
 */
export function calculateDamage(attacker, defender, spell = null, type = null) {
  const level = attacker.level || 1;
  let baseDmg;

  if (spell) {
    baseDmg = (spell.baseDamage || 0) + effectiveStat(attacker, 'int') * (spell.intScaling || 0);
    baseDmg = scaleValue(baseDmg, level, spell.scaling && spell.scaling.damage);
  } else {
    baseDmg = scaleValue(effectiveStat(attacker, 'atk'), level, MELEE_SCALING.damage);
  }

  const resolvedType = type || (spell && spell.damageType) || DAMAGE_TYPES.PHYSICAL;
  const resist = totalResist(defender, resolvedType);

  const damage = Math.max(1, Math.floor(baseDmg - effectiveStat(defender, 'def') - resist));
  return { damage, type: resolvedType, isCrit: false };
}

/**
 * Reduce an already-computed damage amount by the defender's resistance to
 * the given type. Used by non-attack damage sources (DoT ticks, cloud ticks,
 * DSL `harm` with a type arg) that already have a final "intended damage"
 * but still want type-based mitigation.
 *
 * DEF is NOT applied here — DoTs and clouds represent ongoing effects, not
 * physical blows. Only `calculateDamage` (melee/spell) subtracts DEF. Keeps
 * "armor stops hits, resistance stops types" clean and independent.
 *
 * `true` damage bypasses resistances entirely. Minimum 1 damage always lands.
 */
export function reduceByResist(amount, defender, type) {
  if (type === DAMAGE_TYPES.TRUE || !type) return Math.max(1, Math.floor(amount));
  return Math.max(1, Math.floor(amount - totalResist(defender, type)));
}

// Re-export so callers outside the engine (commands modules) can fold
// equipment bonuses into range/cap reads without pulling game-state.
export { effectiveStat };

/**
 * Check if target is in range AND has line of sight.
 * @param {string[][]} map
 * @param {number} fromX
 * @param {number} fromY
 * @param {number} toX
 * @param {number} toY
 * @param {number} range - Maximum Manhattan distance
 * @returns {boolean}
 */
export function isInRange(map, fromX, fromY, toX, toY, range) {
  const dist = distance(fromX, fromY, toX, toY);
  if (dist > range) return false;
  return isInLOS(map, fromX, fromY, toX, toY);
}

/**
 * Resolve an entity's death state: clamp HP at 0 and produce a standard
 * death message. Single source of truth for "what happens when HP <= 0".
 * Any damage source (attack, spell, harm, future traps/onDeath hooks) should
 * funnel through here so death reporting stays consistent.
 * @param {object} entity
 * @returns {{ killed: boolean, message: string }}
 */
export function checkDeath(entity) {
  if (entity.hp > 0) return { killed: false, message: '' };
  entity.hp = 0;
  return { killed: true, message: `${entity.id} is destroyed!` };
}

/**
 * Apply damage to a target entity, returning a result object.
 * Mutates the target's hp.
 * @param {object} attacker
 * @param {object} target
 * @param {object|null} spell
 * @returns {{ damage: number, killed: boolean, message: string }}
 */
export function applyAttack(state, attacker, target, spell = null, type = null) {
  const result = calculateDamage(attacker, target, spell, type);
  const { damage, type: resolvedType } = result;
  target.hp -= damage;
  target.lastAttacker = (attacker && attacker.id) || null;

  // Catalog reveal — player-on-monster interactions promote the monster-
  // type entry to at least 'partial'. Player-as-target: attacker revealed.
  // Player-as-attacker killing a monster: victim type revealed + kill counted.
  if (state.player && target === state.player && attacker && attacker.type) {
    catalogNoteDamage(attacker.type, state.depth);
  }

  // onDamaged fires BEFORE death resolution — a heal-on-damage hook can
  // restore hp and survive the killing blow by the time checkDeath runs.
  fireOnDamaged(state, target, (attacker && attacker.id) || null, damage, resolvedType);

  // Equipment onHit hooks fire for melee attacks only (spell=null), after
  // damage lands, before death resolution so the target is still a valid ref.
  if (!spell && attacker && attacker.equipment) {
    fireEquipmentOnHit(state, attacker, target);
  }

  const death = checkDeath(target);
  if (death.killed && attacker && attacker !== target) {
    fireOnKill(state, attacker, target.id, resolvedType);
    if (state.player && attacker === state.player && target.type) {
      catalogNoteKill(target.type, state.depth);
    }
  }

  const verb = spell ? spell.name : 'attacks';
  const message = death.killed
    ? `${attacker.id} ${verb} ${target.id} for ${damage} damage. ${death.message}`
    : `${attacker.id} ${verb} ${target.id} for ${damage} damage. (${target.hp}/${target.maxHp} HP)`;

  return { damage, killed: death.killed, message };
}

/**
 * Centralized death hook. Call at every site where an entity's hp reaches 0
 * to keep side-effects (effect cleanup, future XP/corpse/onDeath) in one place.
 */
export function onEntityDeath(state, entity) {
  clearEffectsFor(state, entity.id);
  pruneEnteredOnDeath(state, entity.id);
}
