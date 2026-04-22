// Reaction hooks — optional DSL scripts an entity runs in response to events.
//
// Supported hooks:
//   onDamaged     fires after the entity takes HP damage, before death
//                 resolution. Bindings: $SOURCE, $AMOUNT, $TYPE. Lets
//                 heal-on-damage / shield-refresh / revenge scripts react.
//   onTurnStart   fires at the start of the entity's activation, before
//                 the main `script`. No bindings. Useful for phase checks.
//   onKill        fires on the attacker when it lands a killing blow.
//                 Bindings: $TARGET (slain entity id), $TYPE (damage type).
//
// Hooks are reactive: they do NOT consume the entity's action budget.
// Errors are logged and swallowed, matching `onDeath`. Re-entrance is
// guarded per (entity, hook) — a hook that triggers another occurrence of
// itself (e.g. onDamaged → harm → onDamaged) will not recurse.
//
// Lookup: entity[hookName] takes precedence over the monster template's
// field — letting per-instance overrides (or the player) define hooks
// without touching the shared template.
//
// See also: js/engine/deaths.js (onDeath, which predates this file).
//
// Hooks share the permission-locked context used by statusTick/onDeath
// scripts — they bypass knownCommands so monsters can run engine commands
// the player hasn't yet learned.

import { MONSTER_TEMPLATES } from '../config/entities.js';
import { interpret, createContext } from '../dsl/interpreter.js';
import { getCachedAST } from '../dsl/ast-cache.js';

function getHookScript(entity, hookName) {
  if (!entity) return null;
  if (entity[hookName]) return entity[hookName];
  const tpl = MONSTER_TEMPLATES[entity.type];
  return (tpl && tpl[hookName]) || null;
}

/**
 * Run a reaction hook on `entity` if it has one. Bindings are exposed as
 * lowercase DSL variables (parser lowercases $VAR lookups).
 * No-op when the entity has no such hook, or when the hook is already
 * running for this entity (re-entrance guard).
 */
export function runHook(state, entity, hookName, bindings = {}) {
  if (!entity) return;
  const script = getHookScript(entity, hookName);
  if (!script) return;

  if (!entity._hookStack) entity._hookStack = new Set();
  if (entity._hookStack.has(hookName)) return;
  entity._hookStack.add(hookName);

  try {
    const ast = getCachedAST(script);
    const ctx = createContext(entity, 'script');
    ctx.statusTick = true;
    ctx.hook = hookName;
    for (const [key, value] of Object.entries(bindings)) {
      ctx.variables.set(String(key).toLowerCase(), value);
    }
    interpret(ast, state, ctx);
  } catch (e) {
    if (typeof console !== 'undefined') {
      console.warn(`${hookName} script failed for ${entity.id}:`, e);
    }
  } finally {
    entity._hookStack.delete(hookName);
  }
}

/**
 * Fire `onDamaged` on the victim. `source` may be null for untracked /
 * environmental damage; `type` should be a canonical damage-type string.
 */
export function fireOnDamaged(state, target, source, amount, type) {
  if (!target || !(amount > 0)) return;
  runHook(state, target, 'onDamaged', {
    SOURCE: source ?? null,
    AMOUNT: amount,
    TYPE: type ?? null,
  });
}

/**
 * Fire `onTurnStart` on an entity at the very start of its activation.
 */
export function fireOnTurnStart(state, entity) {
  runHook(state, entity, 'onTurnStart');
}

/**
 * Fire `onKill` on the attacker after it lands a killing blow.
 */
export function fireOnKill(state, attacker, targetId, type) {
  if (!attacker) return;
  runHook(state, attacker, 'onKill', {
    TARGET: targetId ?? null,
    TYPE: type ?? null,
  });
}

/**
 * Fire all equipment onHit scripts registered on the attacker.
 * Called after a melee attack lands. Each entry in attacker.equipment.onHit
 * is `{ script, level }`. $TARGET and $L are bound for each script; the hook
 * context bypasses permission checks and does not cost a turn.
 */
export function fireEquipmentOnHit(state, attacker, target) {
  if (!attacker || !attacker.equipment) return;
  const hooks = attacker.equipment.onHit;
  if (!Array.isArray(hooks) || hooks.length === 0) return;

  for (const entry of hooks) {
    const { script, level } = entry;
    if (!script) continue;
    try {
      const ast = getCachedAST(script);
      const ctx = createContext(attacker, 'script');
      ctx.hookScript = true;
      ctx.itemLevel = level;
      ctx.variables.set('target', target.id);
      ctx.variables.set('l', level);
      interpret(ast, state, ctx);
    } catch (e) {
      if (typeof console !== 'undefined') {
        console.warn(`equipment onHit script failed for ${attacker.id}:`, e);
      }
    }
  }
}
