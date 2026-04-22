// Visual effects engine — spawn, age, and cull transient effects.
//
// Real-time driven, fire-and-forget. Pure visual layer — never blocks gameplay.
// Effects live in state.activeEffects; updateEffects() ages them each render
// frame (called from the renderer, not from turn logic). Persistent effects
// (duration 0) live until explicitly removed via removeEffect() or
// clearEffectsFor(entityId).
//
// ── Data flow ─────────────────────────────────────────────
//   Gameplay code             spawnEffect(state, spec)
//        │                          │
//        │ (during turn)            ▼
//        │                   state.activeEffects  ◀── updateEffects (every frame)
//        │                          │
//        ▼                          ▼
//   damage/status etc.       renderer iterates list,
//   (independent of          FOV-culls tile clouds, draws
//   animation timing)        each effect via drawEffect()
//
// ── Effect record fields ──────────────────────────────────
//   id, name, kind, colors, duration, elapsed
//   projectile:   from {x,y}, to {x,y}          (tile coords)
//   area:         at {x,y}, radius              (tile coords, radius in tiles)
//   tileCloud:    tiles [{x,y}, ...]            (expanded at spawn via flood-fill)
//   overlay:      attachTo                      (entity id — renderer follows position)
//
// ── Lifetime ──────────────────────────────────────────────
//   duration > 0  → one-shot; culled when elapsed >= duration
//   duration = 0  → persistent; lives until removeEffect / clearEffectsFor
//
// tileClouds are typically persistent (a poison cloud lingers in the room).
// The caller passes a duration in seconds if the cloud should auto-dissipate.

import { EFFECT_KIND, EFFECT_DURATION } from '../ui/render-effects.js';
import { blocksMove } from '../config/tiles.js';
import { getTile } from './game-state.js';
import { floodCircle } from './geometry.js';

/** Ensure state has the active effects list. Idempotent — safe to call anytime. */
export function initEffects(state) {
  if (!state.activeEffects) state.activeEffects = [];
  if (state.nextEffectId == null) state.nextEffectId = 0;
}

/**
 * Spawn a visual effect. Non-blocking — returns the effect record (or null on
 * unknown name). Never consumes a turn.
 *
 * @param state - game state
 * @param spec  - effect spec. Shape depends on kind (see EFFECT_KIND in render-effects.js):
 *   Common:
 *     name                      registered effect name
 *     colors = { color, color2? }   hex strings; color2 is accent where supported
 *     duration                  seconds; omit for default from EFFECT_DURATION.
 *                               0 = persistent (lives until removeEffect)
 *   Projectile:
 *     from: { x, y }, to: { x, y }   tile coords
 *   Area (one-shot burst):
 *     at: { x, y }, radius           tile coords, radius in tiles
 *   Target association (optional, any kind):
 *     targetId                  entity id this effect is aimed at. While the
 *                               effect is alive, it keeps that target's corpse
 *                               on-screen if the target dies — the renderer
 *                               scans active effects to decide when to stop
 *                               drawing a dead entity.
 *     targetIds                 array of ids — same, for multi-target effects.
 *   Spawn-time delay (optional, any kind):
 *     delay                     seconds to wait before the effect starts aging.
 *                               While delay > 0 the effect is inert: renderer
 *                               skips it, updateEffects decrements delay instead
 *                               of elapsed. Used to defer a kill's deathBurst
 *                               until the causing projectile has landed.
 *   TileCloud (persistent AoE, FOV-aware, flood-filled):
 *     at: { x, y }, radius           expanded to tile list at spawn, stopping at walls
 *     tiles: [{x,y}, ...]            OR pass an explicit tile list (skips flood-fill)
 *   Overlay (attached to an entity):
 *     attachTo                  entity id — 'player' or monster.id.
 *                               Renderer reads the entity's current position each frame,
 *                               so overlays follow movement automatically.
 */
export function spawnEffect(state, spec) {
  initEffects(state);
  const kind = EFFECT_KIND[spec.name];
  if (!kind) return null;

  const duration = spec.duration ?? EFFECT_DURATION[spec.name] ?? 0;
  const effect = {
    id: state.nextEffectId++,
    name: spec.name,
    kind,
    colors: spec.colors || {},
    duration,
    elapsed: 0,
    from: spec.from,
    to: spec.to,
    at: spec.at,
    radius: spec.radius,
    attachTo: spec.attachTo,
    targetId: spec.targetId,
    targetIds: spec.targetIds,
    delay: spec.delay ?? 0,
  };

  // Expand tileCloud effects to a concrete tile list at spawn time.
  // Accept either explicit `tiles` or compute from `at` + `radius` via flood-fill
  // so clouds respect walls (a cloud can't cross a wall into the next room).
  if (kind === 'tileCloud') {
    effect.tiles = spec.tiles ?? cloudTilesFromCenter(state, spec.at, spec.radius ?? 1);
  }

  state.activeEffects.push(effect);
  return effect;
}

/** Flood-fill outward from `center` up to Euclidean distance `radius`, stopping at walls. */
function cloudTilesFromCenter(state, center, radius) {
  if (!center || !state?.map) return [];
  return floodCircle(center.x, center.y, radius, (x, y) => blocksMove(getTile(state, x, y)));
}

/** Advance all active effects by `dt` seconds, drop expired ones. */
export function updateEffects(state, dt) {
  if (!state.activeEffects?.length) return;
  const out = [];
  for (const e of state.activeEffects) {
    // Held off until its causing visual finishes (e.g. deathBurst waiting for
    // a projectile to land). The effect is kept alive but doesn't age or draw.
    if (e.delay > 0) {
      e.delay -= dt;
      out.push(e);
      continue;
    }
    e.elapsed += dt;
    // Persistent effects (duration 0) live until explicitly removed.
    if (e.duration > 0 && e.elapsed >= e.duration) continue;
    out.push(e);
  }
  state.activeEffects = out;
}

/** Remove an effect by id (used for stopping persistent overlays). */
export function removeEffect(state, id) {
  if (!state.activeEffects) return;
  state.activeEffects = state.activeEffects.filter(e => e.id !== id);
}

/** Remove all persistent overlays attached to an entity (e.g. on death). */
export function clearEffectsFor(state, entityId) {
  if (!state.activeEffects) return;
  state.activeEffects = state.activeEffects.filter(e => e.attachTo !== entityId);
}

/**
 * True if any live effect is "about" this entity — either aimed at it
 * (targetId / targetIds) or attached to it (attachTo). Used by the renderer
 * to keep a recently-dead entity on-screen while its projectile / death
 * animation plays out.
 */
export function hasActiveEffectFor(state, entityId) {
  if (!state.activeEffects?.length) return false;
  for (const e of state.activeEffects) {
    if (e.targetId === entityId) return true;
    if (e.attachTo === entityId) return true;
    if (e.targetIds && e.targetIds.includes(entityId)) return true;
  }
  return false;
}
