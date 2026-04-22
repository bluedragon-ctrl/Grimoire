// Cloud engine — first-class persistent area effects.
//
// Clouds occupy a tile set, linger for a turn-count duration, and run DSL
// scripts (onTick/onEnter) on any entity standing on one of their tiles.
// They are separate from the pure-visual tileCloud effect layer — the
// renderer draws them directly off state.clouds, not state.activeEffects.
//
// ── State shape ──────────────────────────────────────────
//   state.clouds       [{ id, kind, tiles, tileIndex, duration, maxDuration,
//                          source, power, level, entered: Set<entityId> }]
//   state.nextCloudId  monotonic counter, persisted across saves
//
//   tileIndex: Set<"x,y"> is maintained alongside tiles for O(1) membership
//   checks. Rebuild via `rebuildTileIndex(cloud)` whenever tiles change.
//
// ── Lifetime ─────────────────────────────────────────────
//   spawn  → tickClouds decrements duration each game turn
//          → pruned when duration <= 0
//   onTick runs for every entity standing in the cloud at tick time,
//   onEnter runs once per entity when it first steps onto any tile.

import { CLOUD_DEFS } from '../config/clouds.js';
import { interpret, createContext } from '../dsl/interpreter.js';
import { getCachedAST } from '../dsl/ast-cache.js';
import { floodCircle, tileKey } from './geometry.js';

export function initClouds(state) {
  if (!state.clouds) state.clouds = [];
  if (state.nextCloudId == null) state.nextCloudId = 1;
}

function rebuildTileIndex(cloud) {
  const idx = new Set();
  for (const t of cloud.tiles) idx.add(tileKey(t.x, t.y));
  cloud.tileIndex = idx;
}

/**
 * Spawn a cloud. `tiles` is an explicit array of {x,y}. The caller is
 * responsible for computing the shape (circle via flood-fill, line via
 * Bresenham). Source is an entity id or null.
 * @returns the created cloud record, or null if kind is unknown.
 */
export function spawnCloud(state, { kind, tiles, duration, power = 1, source = null, level = 1, friendlyFire }) {
  initClouds(state);
  const def = CLOUD_DEFS[kind];
  if (!def) return null;
  const cloud = {
    id: `cloud_${state.nextCloudId++}`,
    kind,
    tiles: tiles.map(t => ({ x: t.x, y: t.y })),
    tileIndex: null,
    duration,
    maxDuration: duration,
    source,
    power,
    level,
    friendlyFire: friendlyFire ?? def.friendlyFire ?? true,
    entered: new Set(),
  };
  rebuildTileIndex(cloud);
  state.clouds.push(cloud);
  return cloud;
}

/** Return every cloud currently covering (x, y). */
export function cloudsAt(state, x, y) {
  if (!state.clouds) return [];
  const key = tileKey(x, y);
  return state.clouds.filter(c => {
    if (!c.tileIndex) rebuildTileIndex(c);
    return c.tileIndex.has(key);
  });
}

/** True if any cloud at (x,y) blocks sight. */
export function cloudsBlockSight(state, x, y) {
  if (!state.clouds) return false;
  const key = tileKey(x, y);
  for (const c of state.clouds) {
    if (!CLOUD_DEFS[c.kind]?.blocksSight) continue;
    if (!c.tileIndex) rebuildTileIndex(c);
    if (c.tileIndex.has(key)) return true;
  }
  return false;
}

/** True if any cloud at (x,y) blocks movement. */
export function cloudsBlockMove(state, x, y) {
  if (!state.clouds) return false;
  const key = tileKey(x, y);
  for (const c of state.clouds) {
    if (!CLOUD_DEFS[c.kind]?.blocksMove) continue;
    if (!c.tileIndex) rebuildTileIndex(c);
    if (c.tileIndex.has(key)) return true;
  }
  return false;
}

/**
 * Age every cloud by one global tick. Decrement duration and drop expired
 * clouds. Does NOT apply onTick scripts — that's done per-entity-activation
 * via applyCloudEffects. Called once per global tick by the scheduler.
 * @returns {string[]} log messages (currently none — reserved for expiry FX)
 */
export function ageClouds(state) {
  if (!state.clouds || state.clouds.length === 0) return [];
  for (const cloud of state.clouds) {
    cloud.duration--;
  }
  state.clouds = state.clouds.filter(c => c.duration > 0);
  return [];
}

/**
 * Apply onTick scripts of every cloud covering `entity` to that entity.
 * Called once per entity activation by the scheduler. Lets fast entities
 * metabolize cloud damage faster (more hits per wall-clock tick).
 * @returns {string[]} log messages
 */
export function applyCloudEffects(state, entity) {
  if (!state.clouds || state.clouds.length === 0) return [];
  if (!entity || entity.hp <= 0) return [];
  const messages = [];
  const key = tileKey(entity.x, entity.y);
  for (const cloud of state.clouds) {
    const def = CLOUD_DEFS[cloud.kind];
    if (!def || !def.onTick) continue;
    if (!cloud.friendlyFire && cloud.source && entity.id === cloud.source) continue;
    if (!cloud.tileIndex) rebuildTileIndex(cloud);
    if (!cloud.tileIndex.has(key)) continue;
    const msg = runCloudScript(state, def.onTick, cloud, entity);
    if (msg) messages.push(msg);
    if (entity.hp <= 0) break;
  }
  return messages;
}

/**
 * Fire onEnter for the given entity if it just stepped onto a cloud tile it
 * wasn't standing on before. Idempotent per (cloud, entity) pair — the cloud
 * tracks which entity ids have already triggered.
 */
export function onEnterCloud(state, entity) {
  if (!state.clouds || state.clouds.length === 0) return [];
  const messages = [];
  const key = tileKey(entity.x, entity.y);
  for (const cloud of state.clouds) {
    const def = CLOUD_DEFS[cloud.kind];
    if (!def || !def.onEnter) continue;
    if (!cloud.tileIndex) rebuildTileIndex(cloud);
    const inside = cloud.tileIndex.has(key);
    if (!inside) {
      cloud.entered.delete(entity.id);
      continue;
    }
    if (cloud.entered.has(entity.id)) continue;
    cloud.entered.add(entity.id);
    if (!cloud.friendlyFire && cloud.source && entity.id === cloud.source) continue;
    const msg = runCloudScript(state, def.onEnter, cloud, entity);
    if (msg) messages.push(msg);
  }
  return messages;
}

/**
 * Called from onEntityDeath — purge a dead monster's id from every cloud's
 * `entered` set so their record doesn't linger. Cheap, and lets us reuse the
 * cloud across whatever might take the monster's id next (summoner cycles).
 */
export function pruneEnteredOnDeath(state, entityId) {
  if (!state.clouds || !entityId) return;
  for (const cloud of state.clouds) {
    cloud.entered.delete(entityId);
  }
}

function runCloudScript(state, script, cloud, entity) {
  try {
    const replaced = script
      .replace(/\$ENTITY/g, entity.id)
      .replace(/\$SOURCE/g, cloud.source || 'null');
    const ast = getCachedAST(replaced);
    // Run with the affected entity as `self` — that way `harm hp N` (which
    // always targets self) damages the entity in the cloud, and `inflict
    // <status> $ENTITY ...` still works via the $ENTITY string binding.
    const ctx = createContext(entity, 'script');
    ctx.statusTick = true;        // bypass knownCommands permission checks
    // Attribute any damage applied by this script (harm, inflict-driven DoTs)
    // to the cloud's originating entity — powers `self.lastAttacker`.
    ctx.damageSource = cloud.source || null;
    ctx.variables.set('power', cloud.power);
    ctx.variables.set('p', cloud.power); // also expose as $P for parity
    const result = interpret(ast, state, ctx);
    return result.message || null;
  } catch (e) {
    return `Cloud script error (${cloud.kind}): ${e.message}`;
  }
}

// ── Shape helpers (used by cast) ─────────────────────────

/** Circle flood-fill from center, stopping at walls. Euclidean radius. */
export function cloudTilesCircle(state, cx, cy, radius, isWallFn) {
  return floodCircle(cx, cy, radius, isWallFn);
}

/** Line from caster to target, extended to `length` tiles. Stops at walls. */
export function cloudTilesLine(state, fromX, fromY, toX, toY, length, isWallFn) {
  const dx = toX - fromX, dy = toY - fromY;
  const dist = Math.max(1, Math.hypot(dx, dy));
  const ux = dx / dist, uy = dy / dist;
  const result = [];
  const seen = new Set();
  // Start at i=1 — the caster's own tile is skipped. Line runs from the
  // first tile in the caster→target direction outward for `length` tiles.
  for (let i = 1; i <= length; i++) {
    const x = Math.round(fromX + ux * i);
    const y = Math.round(fromY + uy * i);
    const k = tileKey(x, y);
    if (seen.has(k)) continue;
    seen.add(k);
    if (isWallFn(x, y)) break;
    result.push({ x, y });
  }
  return result;
}
