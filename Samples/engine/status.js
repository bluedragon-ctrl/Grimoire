// Status engine — apply, tick, and remove status effects.

import { STATUS_DEFS } from '../config/statuses.js';
import { interpret, createContext } from '../dsl/interpreter.js';
import { getCachedAST } from '../dsl/ast-cache.js';
import { spawnEffect, removeEffect } from './effects.js';

/**
 * Apply a status effect to an entity.
 * If already active, refreshes duration (no stacking).
 * @param {number} [power] — optional power parameter, available as $P in scripts
 */
export function applyStatus(state, entity, statusId, duration, power, source = '') {
  const def = STATUS_DEFS[statusId];
  if (!def) {
    return { success: false, message: `Unknown status: ${statusId}` };
  }

  if (!entity.statuses) entity.statuses = [];

  const p = power ?? def.defaultPower ?? 0;

  // Refresh existing — don't stack
  const existing = entity.statuses.find(s => s.id === statusId);
  if (existing) {
    existing.duration = Math.max(existing.duration, duration);
    if (p > existing.power) {
      // Apply only the power delta so onExpire fully reverses the stat change.
      // Without this, onApply-based statuses (haste/shield/slow) leak stat drift.
      if (def.onApply) {
        runStatusScript(def.onApply, entity, state, p - existing.power);
      }
      existing.power = p;
    }
    return { success: true, message: `${def.name} refreshed (${existing.duration}t).` };
  }

  const newStatus = { id: statusId, duration, power: p, source };
  entity.statuses.push(newStatus);

  // Spawn persistent overlay tied to this status, if any
  if (def.visual?.overlay) {
    const fx = spawnEffect(state, {
      name: def.visual.overlay,
      attachTo: entity.id,
      duration: 0,
      colors: def.visual.colors,
    });
    if (fx) newStatus.effectId = fx.id;
  }

  // Run onApply script
  if (def.onApply) {
    runStatusScript(def.onApply, entity, state, p);
  }

  return { success: true, message: `${def.name} applied (${duration}t, power ${p}).` };
}

/**
 * Tick all status effects on an entity.
 * Runs onTick scripts, decrements durations, removes expired.
 */
export function tickStatuses(state, entity) {
  if (!entity.statuses || entity.statuses.length === 0) return [];

  const messages = [];
  const expired = [];

  for (const status of entity.statuses) {
    const def = STATUS_DEFS[status.id];
    if (!def) continue;

    // Run onTick script
    if (def.onTick) {
      const result = runStatusScript(def.onTick, entity, state, status.power, status.source);
      if (result.message) messages.push(result.message);
    }

    status.duration--;
    if (status.duration <= 0) {
      expired.push(status);
    }
  }

  // Remove expired, run onExpire
  for (const status of expired) {
    const def = STATUS_DEFS[status.id];
    if (def && def.onExpire) {
      const result = runStatusScript(def.onExpire, entity, state, status.power);
      if (result.message) messages.push(result.message);
    }
    if (status.effectId != null) removeEffect(state, status.effectId);
    messages.push(`${def ? def.name : status.id} expired.`);
  }

  entity.statuses = entity.statuses.filter(s => s.duration > 0);
  return messages;
}

/**
 * Remove a specific status from an entity. Runs onExpire if present.
 */
export function removeStatus(state, entity, statusId) {
  if (!entity.statuses) return [];

  const messages = [];
  const status = entity.statuses.find(s => s.id === statusId);
  if (status) {
    const def = STATUS_DEFS[statusId];
    if (def && def.onExpire) {
      const result = runStatusScript(def.onExpire, entity, state, status.power);
      if (result.message) messages.push(result.message);
    }
    if (status.effectId != null) removeEffect(state, status.effectId);
    entity.statuses = entity.statuses.filter(s => s.id !== statusId);
    messages.push(`${def ? def.name : statusId} removed.`);
  }
  return messages;
}

// ── Internal ──────────────────────────────────────────────

function runStatusScript(script, entity, state, power = 0, source = null) {
  try {
    const ast = getCachedAST(script);
    const ctx = createContext(entity, 'script');
    ctx.statusTick = true;  // Bypasses permission checks on restore/learn/apply
    // Attribute any damage applied by this script to the status's originator —
    // powers `self.lastAttacker` for DoT ticks (poison, burn, bleed, etc.).
    ctx.damageSource = source || null;
    // NB: parser lowercases variable names, so keys must be lowercase to match $P / $NP lookups.
    ctx.variables.set('p', power);   // $P available in status scripts
    ctx.variables.set('np', -power); // $NP = negative $P, for onExpire reversal
    return interpret(ast, state, ctx);
  } catch (e) {
    return { message: `Status script error: ${e.message}`, type: 'error' };
  }
}
