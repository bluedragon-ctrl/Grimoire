// Scheduler — energy-accumulation turn system.
//
// Every global tick grants each live entity `entity.spd` energy. When an
// entity reaches ENERGY_THRESHOLD it activates once and pays 10. The player
// activation yields control back to the main loop for input; monster
// activations run their AI script synchronously.
//
// Tie-break within a tick: higher energy goes first, then id ascending for
// determinism.
//
// The scheduler does NOT handle player input — it just advances the world
// until the player is the next entity that should act, then returns. The
// caller (main.js) waits for input, executes the player's command, deducts
// the player's energy and re-enters the scheduler.

import { computeFOV } from './fov.js';
import { addLog, buildCloudSightSet, buildObjectSightSet, isAlive, isDead, effectiveStat } from './game-state.js';
import { tickStatuses } from './status.js';
import { ageClouds, applyCloudEffects } from './clouds.js';
import { resolveDeaths } from './deaths.js';
import { fireOnTurnStart } from './hooks.js';
import { tokenize } from '../dsl/lexer.js';
import { parse } from '../dsl/parser.js';
import { interpret, createContext } from '../dsl/interpreter.js';

// ── World Phase ────────────────────────────────────────────

/**
 * Drain the pending trigger queue and execute each object script.
 * Runs after the monster phase, once per player turn.
 * Object scripts have no action budget — they never cost a turn.
 * Triggers queued by these scripts are deferred to the next world phase.
 */
export function runWorldPhase(state) {
  if (!state.pendingTriggers || state.pendingTriggers.length === 0) return [];

  const messages = [];
  // Snapshot and clear before executing so newly queued triggers defer correctly.
  const triggers = state.pendingTriggers.slice().sort((a, b) =>
    a.objectId < b.objectId ? -1 : a.objectId > b.objectId ? 1 : 0
  );
  state.pendingTriggers = [];

  for (const { objectId, trigger, interactor } of triggers) {
    const obj = state.floorObjects?.find(o => o.id === objectId);
    if (!obj) continue;

    const script = obj.triggers?.[trigger];
    if (!script) continue;

    // Traps reveal themselves when they fire — stepping on one shows it.
    if (trigger === 'onStep' && obj.hidden) obj.hidden = false;

    try {
      const context = createContext(obj, 'script');
      if (interactor) context.variables.set('interactor', interactor);

      const tokens = tokenize(script);
      const ast = parse(tokens);
      const result = interpret(ast, state, context);

      if (result.message) messages.push(result.message);
    } catch (e) {
      addLog(state, `World phase error (${objectId}): ${e.message}`, 'error');
    }
  }

  return messages;
}

export const ENERGY_THRESHOLD = 10;

/**
 * Advance the world until the player is ready to act, running any monster
 * activations along the way. Returns accumulated log messages.
 *
 * Safety cap: a single call processes at most MAX_MONSTER_ACTIVATIONS monster
 * activations. If the player never becomes ready (e.g. SPD somehow 0), we bail
 * out rather than spin forever.
 */
const MAX_MONSTER_ACTIVATIONS = 500;

export function runScheduler(state) {
  const messages = [];
  let monsterActivations = 0;

  while (isAlive(state.player)) {
    // Dispatch anyone already ready this pass. Process in priority order.
    const ready = collectReady(state);
    let playerYielded = false;

    for (const e of ready) {
      if (!isAlive(e)) continue;
      if (e === state.player) { playerYielded = true; break; }

      const msgs = runMonsterActivation(state, e);
      messages.push(...msgs);
      monsterActivations++;

      if (isDead(state.player)) return messages;
      if (monsterActivations >= MAX_MONSTER_ACTIVATIONS) return messages;
    }

    if (playerYielded) {
      // World phase: drain pending triggers (traps, object scripts) queued
      // this turn by player/monster movement. Runs after all monster activations
      // in this batch, before yielding to player input.
      const worldMsgs = runWorldPhase(state);
      messages.push(...worldMsgs);
      // Start-of-turn upkeep for the player — run right before we yield,
      // so DoTs / cloud ticks land before the terminal accepts input.
      const upkeepMsgs = runPlayerUpkeep(state);
      messages.push(...upkeepMsgs);
      return messages;
    }

    // Nobody ready — advance one global tick.
    state.tick++;
    grantEnergy(state);
    ageClouds(state);
    resolveDeaths(state);
  }

  return messages;
}

function collectReady(state) {
  const list = [];
  if (isAlive(state.player) && state.player.energy >= ENERGY_THRESHOLD) {
    list.push(state.player);
  }
  for (const m of state.monsters) {
    if (isAlive(m) && m.energy >= ENERGY_THRESHOLD) list.push(m);
  }
  // Plain Array.sort on the ready list — fine at current scales (a floor has
  // at most ~30 monsters, and collectReady runs once per tick), so the
  // O(n log n) cost is negligible. If we ever push monster counts into the
  // hundreds, consider a priority heap keyed on (energy, id).
  list.sort((a, b) => {
    if (b.energy !== a.energy) return b.energy - a.energy;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return list;
}

function grantEnergy(state) {
  if (isAlive(state.player)) state.player.energy += effectiveStat(state.player, 'spd');
  for (const m of state.monsters) {
    if (isAlive(m)) m.energy += effectiveStat(m, 'spd');
  }
}

/**
 * Run one monster's activation in this order:
 *   1. Cloud tick (onTick for every cloud covering the monster)
 *   2. Status tick (DoTs; onExpire for expired statuses)
 *   3. Script (AI action)
 *   4. Pay energy
 *   5. Resolve any deaths caused above
 *
 * Upkeep runs *before* the action — a DoT or cloud that kills the monster
 * at start-of-turn prevents its script from running. No "last gasp" step.
 * This is symmetric with the player's activation (see runScheduler's yield
 * path, which ticks player upkeep the moment the player becomes ready).
 */
function runMonsterActivation(state, monster) {
  const messages = [];

  // 1-2. Start-of-turn upkeep.
  const cloudMsgs = applyCloudEffects(state, monster);
  messages.push(...cloudMsgs);

  if (isAlive(monster)) {
    const statusMsgs = tickStatuses(state, monster);
    messages.push(...statusMsgs);
    regenManaFromInt(monster);
  }

  // 3. Summon duration tick — timed summons decrement per activation and
  //    despawn when they hit zero. Marked as hp=0 so resolveDeaths below
  //    runs the normal death path (drops, onDeath script, owner cascade
  //    if this summon itself owned anything).
  if (isAlive(monster) && monster.duration != null) {
    monster.duration -= 1;
    if (monster.duration <= 0) {
      monster.hp = 0;
    }
  }

  // 4. onTurnStart hook fires before the main script. Reactive — doesn't
  //    cost an action. Useful for phase transitions and buff refresh.
  if (isAlive(monster)) {
    fireOnTurnStart(state, monster);
  }

  // 4. Script (only if still alive after upkeep).
  if (isAlive(monster)) {
    const scriptMsg = executeMonsterScript(state, monster);
    if (scriptMsg) messages.push(scriptMsg);
  }

  // 4. Pay the activation's energy regardless — a dead monster won't be
  //    scheduled again, but this keeps the bookkeeping consistent.
  monster.energy -= ENERGY_THRESHOLD;

  // 5. Finalize any deaths from upkeep or the script.
  const deathMsgs = resolveDeaths(state);
  messages.push(...deathMsgs);

  return messages;
}

/**
 * Run start-of-turn upkeep on the player: cloud tick then status tick.
 * Mirrors the monster order above. Called at the scheduler yield point so
 * damage lands *before* the player types their next command.
 *
 * Returns accumulated messages; main.js is responsible for the death check
 * and printing the death reason.
 */
function runPlayerUpkeep(state) {
  const messages = [];
  const player = state.player;

  const cloudMsgs = applyCloudEffects(state, player);
  messages.push(...cloudMsgs);
  const deathDrops = resolveDeaths(state);
  messages.push(...deathDrops);

  if (isAlive(player)) {
    const statusMsgs = tickStatuses(state, player);
    messages.push(...statusMsgs);
    regenManaFromInt(player);
    // Player onTurnStart runs right before we yield to input — symmetric
    // with the monster path above.
    fireOnTurnStart(state, player);
  }

  return messages;
}

/**
 * Passive MP regeneration tied to INT. Fires once per entity activation
 * (right after status ticks), symmetric for player and monsters. An entity
 * with INT < 4 regens nothing; every +4 INT adds 1 MP/turn. Clamped at maxMp.
 */
function regenManaFromInt(entity) {
  if (!entity || typeof entity.int !== 'number') return;
  if (typeof entity.mp !== 'number' || typeof entity.maxMp !== 'number') return;
  const rate = Math.floor(effectiveStat(entity, 'int') / 4);
  if (rate <= 0) return;
  entity.mp = Math.min(effectiveStat(entity, 'maxMp'), entity.mp + rate);
}

/**
 * Execute a single monster's AI script through the DSL pipeline.
 */
function executeMonsterScript(state, monster) {
  const p = state.player;
  if (isDead(p)) return null;

  const cloudOpaque = buildCloudSightSet(state);
  const objOpaque = buildObjectSightSet(state);
  let extraOpaque = null;
  if (cloudOpaque && objOpaque) {
    extraOpaque = new Set([...cloudOpaque, ...objOpaque]);
  } else {
    extraOpaque = cloudOpaque || objOpaque;
  }
  // Store computed FOV on the monster so selectors (enemies, allies, etc.)
  // can use per-monster visibility instead of the player's FOV.
  monster._fov = computeFOV(state.map, monster.x, monster.y, monster.fovRadius, extraOpaque);

  if (!monster.script) { monster._fov = null; return null; }

  try {
    // Cache the parsed AST on the monster. Invalidate when monster.script
    // changes (e.g., future behavior mutation). Tokenize + parse is O(n) in
    // script length and runs every activation otherwise; at 10+ monsters per
    // level this dominates scheduler cost.
    if (monster._astFor !== monster.script) {
      monster._ast = parse(tokenize(monster.script));
      monster._astFor = monster.script;
    }
    const context = createContext(monster, 'script');

    const result = interpret(monster._ast, state, context);

    if (result.message && result.type !== 'error') {
      return result.message;
    }
  } catch (e) {
    addLog(state, `Script error (${monster.id}): ${e.message}`, 'error');
  } finally {
    monster._fov = null;
  }

  return null;
}
