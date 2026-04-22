// Death phase — single place that reacts to "hp <= 0 on some entity".
//
// Called by the scheduler after every activation (and after any global tick
// that may have damaged things, e.g. cloud aging). Responsibilities:
//   - Roll each monster's loot table and drop results onto the floor.
//   - Run the centralized onEntityDeath hook (effect cleanup, etc).
//   - Stamp `deadAt` so we only process each death once.
//   - Record the kill into state.pendingKills so the main loop can emit a
//     tidy "N monsters destroyed." summary after a player activation.
//
// Dead monsters stay in state.monsters — existing consumers filter via
// isAlive. They are cleared naturally on floor change.

import { isAlive, isDead } from './game-state.js';
import { onEntityDeath } from './combat.js';
import { spawnEffect } from './effects.js';
import { MONSTER_TEMPLATES } from '../config/entities.js';
import { ITEM_DEFS } from '../config/items.js';
import { rollMonsterLoot } from '../config/loot-tables.js';
import { tokenize } from '../dsl/lexer.js';
import { parse } from '../dsl/parser.js';
import { interpret, createContext } from '../dsl/interpreter.js';

const DEFAULT_DEATH_COLOR = '#ffcc66';

/**
 * Longest remaining duration of any projectile effect targeting `entityId`.
 * Used to defer a deathBurst until the causing projectile visually lands, so
 * the dissolve doesn't start playing while the fireball is still mid-flight.
 * Bursts, overlays, and other kinds don't contribute — a burst IS the impact,
 * so the dissolve should start in sync with it.
 */
function projectileArrivalDelay(state, entityId) {
  if (!state.activeEffects?.length) return 0;
  let maxRemaining = 0;
  for (const e of state.activeEffects) {
    if (e.kind !== 'projectile') continue;
    const aimed = e.targetId === entityId || e.targetIds?.includes(entityId);
    if (!aimed) continue;
    if (!e.duration) continue;
    const remaining = Math.max(0, e.duration - e.elapsed - (e.delay || 0));
    if (remaining > maxRemaining) maxRemaining = remaining;
  }
  return maxRemaining;
}

/**
 * Find newly-dead monsters (hp <= 0 and not yet flagged) and finalize them.
 * Returns log messages for inventory drops.
 */
export function resolveDeaths(state) {
  const messages = [];
  if (!state.pendingKills) state.pendingKills = [];

  // Owner-death cascade — if the player just died and hasn't cascaded yet,
  // mark every monster they summoned as dead. Processed in the same pass
  // below so onDeath scripts still fire for the summons.
  if (state.player && isDead(state.player) && !state.player._summonCascade) {
    state.player._summonCascade = true;
    for (const s of state.monsters) {
      if (s.ownerId === state.player.id && !isDead(s)) s.hp = 0;
    }
  }

  // Snapshot-style loop — we may mark additional monsters dead mid-pass
  // (cascade from a summoner's death). Iterate until nothing new turns up
  // so we don't leave orphaned summons alive for a frame.
  const MAX_DEATH_ITERATIONS = Math.max(50, state.monsters.length * 3);
  let iterations = 0;
  let changed = true;
  while (changed) {
    changed = false;
    for (const m of state.monsters) {
      if (!isDead(m)) continue;
      if (m.deadAt !== undefined) continue;
      finalizeMonsterDeath(state, m, messages);
      changed = true;
    }
    iterations++;
    if (iterations > MAX_DEATH_ITERATIONS) {
      if (typeof console !== 'undefined') {
        console.warn(`resolveDeaths: cascade exceeded ${MAX_DEATH_ITERATIONS} iterations — aborting`);
      }
      break;
    }
  }

  return messages;
}

function finalizeMonsterDeath(state, m, messages) {
    m.deadAt = state.tick;
    onEntityDeath(state, m);

    const template = MONSTER_TEMPLATES[m.type];
    // deathBurst disabled for now — see DESIGN.md Death Handling.
    // const deathColor = template?.deathColor || DEFAULT_DEATH_COLOR;
    // spawnEffect(state, {
    //   name: 'deathBurst',
    //   at: { x: m.x, y: m.y },
    //   radius: 0.9,
    //   colors: { color: deathColor },
    //   targetId: m.id,
    //   delay: projectileArrivalDelay(state, m.id),
    // });

    if (template?.onDeath) {
      runOnDeath(state, m, template.onDeath);
    }

    const dropped = rollMonsterDrops(state, m, template);
    if (dropped.length > 0) {
      messages.push(`${m.id} dropped: ${dropped.join(', ')}`);
    }

    state.pendingKills.push({ id: m.id, type: m.type, tick: state.tick });

    // Cascade — if this monster owned any summons, despawn them too.
    // We just set hp=0; the outer while(changed) loop in resolveDeaths
    // picks them up and runs their onDeath scripts as normal deaths.
    for (const s of state.monsters) {
      if (s === m) continue;
      if (s.ownerId !== m.id) continue;
      if (isDead(s)) continue;
      s.hp = 0;
    }
}

/**
 * Emit and clear any kill summary accumulated since the last flush. Called
 * at the end of a player activation. Individual kill lines are already
 * printed by the attack/cast handlers — this adds a one-line summary only
 * when three or more monsters died inside a single activation.
 * @returns {string[]} summary messages (may be empty)
 */
export function flushKillSummary(state) {
  if (!state.pendingKills || state.pendingKills.length === 0) return [];
  const out = [];
  if (state.pendingKills.length >= 3) {
    out.push(`${state.pendingKills.length} monsters destroyed.`);
  }
  state.pendingKills = [];
  return out;
}

/**
 * Collapse a run of identical consecutive log lines into a "N× line" form.
 * Keeps monster spam tidy when many activations happen between player turns.
 */
export function collapseConsecutive(messages) {
  if (!messages || messages.length === 0) return [];
  const out = [];
  let prev = null;
  let count = 0;
  const flush = () => {
    if (prev == null) return;
    out.push(count > 1 ? `${count}× ${prev}` : prev);
  };
  for (const msg of messages) {
    if (msg === prev) {
      count++;
    } else {
      flush();
      prev = msg;
      count = 1;
    }
  }
  flush();
  return out;
}

/**
 * Roll the monster's loot table and drop results onto the floor.
 * Summons (ownerId set) always drop nothing. Bosses and explicit null tables
 * also drop nothing. Falls back to 'monster_default' if dropTable is omitted.
 * Uses Math.random — state.rng not yet plumbed to death resolution (Phase 8).
 * @returns {string[]} display names of dropped items
 */
function rollMonsterDrops(state, m, template) {
  if (!template) return [];
  if (m.ownerId) return [];
  const tableName = template.dropTable === null
    ? null
    : (template.dropTable ?? 'monster_default');
  if (!tableName) return [];

  const drops = rollMonsterLoot(tableName, Math.random);
  const dropped = [];
  for (const itemType of drops) {
    const def = ITEM_DEFS[itemType];
    if (!def) continue;
    state.nextItemId = (state.nextItemId || 0) + 1;
    state.floorItems.push({
      id: `${itemType}_${state.nextItemId}`,
      type: itemType,
      level: 1,
      x: m.x,
      y: m.y,
      colors: def.colors ? { ...def.colors } : undefined,
    });
    dropped.push(def.name || itemType);
  }
  return dropped;
}

/**
 * Run a dying entity's optional onDeath DSL script. Permission-locked context
 * (same shape as statusTick): bypasses knownCommands, executes synchronously
 * with the dying entity as `self`. Script errors are logged and swallowed so
 * a broken onDeath never blocks the death itself.
 *
 * Stub for the future onDeath phase — no shipped entity uses it yet.
 */
function runOnDeath(state, entity, script) {
  // The entity already has hp<=0 and deadAt stamped when this runs.
  // Temporarily restore hp so findTargetEntity's isAlive check passes when the
  // script targets `self`, and give enough mp so spell-cost checks don't abort.
  const savedHp = entity.hp;
  const savedMp = entity.mp;
  entity.hp = 1;
  entity.mp = 999;
  try {
    const tokens = tokenize(script);
    const ast = parse(tokens);
    const ctx = createContext(entity, 'script');
    ctx.statusTick = true;
    ctx.onDeath = true;
    interpret(ast, state, ctx);
  } catch (e) {
    if (typeof console !== 'undefined') {
      console.warn(`onDeath script failed for ${entity.id}:`, e);
    }
  } finally {
    entity.hp = savedHp;
    entity.mp = savedMp;
  }
}

// Re-export for convenience (some consumers may want the predicate here).
export { isAlive, isDead };
