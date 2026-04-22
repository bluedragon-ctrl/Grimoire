// Level transitions — descend/ascend stairs, fresh floor generation.

import { generateLevel } from './dungeon-gen.js';
import { updateVisibility, applyLevel } from './game-state.js';
import { spawnMonsters, spawnItems, spawnObjects, makeSeedRng } from './spawning.js';

// ── Floor Loading ──────────────────────────────────────────

/**
 * Generate and populate a floor at `depth`, attaching it to `state`. Shared by
 * descend/ascend and (indirectly) createInitialState. Clears per-floor
 * transient state so overlays/effects/pendingKills from the previous floor
 * don't leak across the transition.
 */
export function loadFloor(state, depth) {
  // Generate a per-floor seed from Math.random so spawn results are
  // reproducible when the same seed is reused (devtools: state.seed = N; newRun()).
  state.seed = (Math.random() * 0xFFFFFFFF) >>> 0;
  const rng = makeSeedRng(state.seed);

  const level = generateLevel(depth);
  state.depth = depth;
  applyLevel(state, {
    ...level,
    monsters: [],
    floorItems: [],
  });
  if (state.player) {
    state.player.x = level.spawnPoint.x;
    state.player.y = level.spawnPoint.y;
  }
  state.monsters    = spawnMonsters(state, depth, rng);
  state.floorItems  = spawnItems(state, depth, rng);
  state.floorObjects = spawnObjects(state);

  // Per-floor transient state: drop effects/kills/clouds that referenced the
  // previous floor's monsters. Player's own statuses persist.
  state.activeEffects = [];
  state.pendingKills = [];
  state.clouds = [];
  state.nextCloudId = state.nextCloudId || 1;

  // Status overlays pinned to now-absent monsters are implicitly handled:
  // activeEffects was just cleared, and monster statuses travel with monsters
  // (which are themselves replaced). Player.statuses is untouched on purpose.

  updateVisibility(state);
  return level;
}

// ── Public API ─────────────────────────────────────────────

/**
 * Descend to the next level.
 * Checks that the player is standing on a stairs_down object.
 * descend/ascend always act on state.player (not on script self) since
 * they are player-only actions that the onInteract script delegates to.
 * @returns {{ success: boolean, message: string }}
 */
export function descendStairs(state) {
  const p = state.player;
  const onStairs = (state.floorObjects || []).find(
    o => o.type === 'stairs_down' && o.x === p.x && o.y === p.y
  );

  if (!onStairs) {
    return { success: false, message: 'There are no stairs down here.' };
  }

  state.levelCache = {};
  loadFloor(state, state.depth + 1);
  return { success: true, message: `You descend to depth ${state.depth}...` };
}

/**
 * Ascend to the previous level.
 * Checks that the player is standing on a stairs_up object.
 * @returns {{ success: boolean, message: string }}
 */
export function ascendStairs(state) {
  const p = state.player;
  const onStairs = (state.floorObjects || []).find(
    o => o.type === 'stairs_up' && o.x === p.x && o.y === p.y
  );

  if (!onStairs) {
    return { success: false, message: 'There are no stairs up here.' };
  }

  if (state.depth <= 1) {
    return { success: false, message: 'You cannot leave the dungeon. There is only darkness above.' };
  }

  state.levelCache = {};
  loadFloor(state, state.depth - 1);
  return { success: true, message: `You ascend to depth ${state.depth}...` };
}
