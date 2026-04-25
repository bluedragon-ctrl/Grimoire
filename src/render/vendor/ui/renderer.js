// Canvas renderer — wireframe dungeon aesthetic.
// Reads game state, draws to canvas. No state mutation.

import { getTile, isVisible, isExplored, isAlive } from '../engine/game-state.js';
import { TILE, C, setCanvas, getCanvas, getCtx } from './render-context.js';
import { drawTile } from '../../tiles.ts';
import { drawMage, drawMonster } from '../../monsters.ts';
import { drawItem } from '../../items.ts';
import { drawObject } from '../../objects.ts';
import { drawEffect } from './render-effects.js';
import { hasActiveEffectFor } from '../engine/effects.js';
import { CLOUD_DEFS } from '../config/clouds.js';

// ── Animation State ────────────────────────────────────────

let animTime = 0;
let cameraX = 0;
let cameraY = 0;

const CAMERA_DAMPING = 0.2;
const FRAME_TIME = 0.016;
const VISIBILITY_MARGIN = 1;
const EXPLORED_ALPHA = 0.12;

// ── Room construction phase ────────────────────────────────
// On every mount, the dungeon "loads": tiles reveal at random delays with a
// brief amber-noise flash; entities are held back until the floor is built;
// a final scanline sweeps top→bottom as the "lock-in" beat.
const ROOM_CONSTRUCTION_S = 0.9;
const ROOM_DECONSTRUCTION_S = 0.9;
const TILE_REVEAL_S = 0.18;
const TILE_DELAY_MAX_FRAC = 0.55; // delays span [0, 0.55] of construction
let constructionStart = null;
let deconstructionStart = null;

/** Begin the room dissolve sequence — call when the hero exits or dies. */
export function startRoomDeconstruction() {
  if (deconstructionStart === null) deconstructionStart = animTime;
}

function hash01(n) {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

// ── Public API ──────────────────────────────────────────────

export function initRenderer(canvasElement) {
  setCanvas(canvasElement);
  resizeCanvas();
  // Reset construction/deconstruction so each new room "loads in" from scratch.
  constructionStart = null;
  deconstructionStart = null;
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', resizeCanvas);
  }
}

export function render(state) {
  const canvas = getCanvas();
  const ctx = getCtx();
  if (!canvas || !ctx || !state?.player) return;

  animTime += FRAME_TIME;
  const player = state.player;

  // Group overlays by attach-target so drawOverlaysFor is O(1) per entity
  // instead of scanning the whole activeEffects array per draw call.
  const overlaysByAttach = new Map();
  if (state.activeEffects?.length) {
    for (const e of state.activeEffects) {
      if (e.kind !== 'overlay') continue;
      if (!e.attachTo) continue;
      let list = overlaysByAttach.get(e.attachTo);
      if (!list) { list = []; overlaysByAttach.set(e.attachTo, list); }
      list.push(e);
    }
  }

  // Update camera to center on player, clamped to world bounds.
  // When the world is smaller than the canvas, center the world instead
  // of tracking the player — keeps the whole room visible with no
  // black bleed past the edges.
  const worldPxW = state.width  * TILE;
  const worldPxH = state.height * TILE;
  let targetCamX, targetCamY;
  if (worldPxW <= canvas.width) {
    targetCamX = (worldPxW - canvas.width) / 2;
  } else {
    targetCamX = player.x * TILE - canvas.width / 2 + TILE / 2;
    targetCamX = Math.max(0, Math.min(targetCamX, worldPxW - canvas.width));
  }
  if (worldPxH <= canvas.height) {
    targetCamY = (worldPxH - canvas.height) / 2;
  } else {
    targetCamY = player.y * TILE - canvas.height / 2 + TILE / 2;
    targetCamY = Math.max(0, Math.min(targetCamY, worldPxH - canvas.height));
  }
  cameraX += (targetCamX - cameraX) * CAMERA_DAMPING;
  cameraY += (targetCamY - cameraY) * CAMERA_DAMPING;

  // Clear
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.translate(-Math.round(cameraX), -Math.round(cameraY));

  // Construction-phase progress: starts on first frame after mount.
  if (constructionStart === null) constructionStart = animTime;
  const constT = Math.min(1, (animTime - constructionStart) / ROOM_CONSTRUCTION_S);
  const tileRevealT = TILE_REVEAL_S / ROOM_CONSTRUCTION_S;

  // Deconstruction progress: 0 until startRoomDeconstruction is called.
  const deconT = deconstructionStart === null
    ? 0
    : Math.min(1, (animTime - deconstructionStart) / ROOM_DECONSTRUCTION_S);
  const tileDissolveT = TILE_REVEAL_S / ROOM_DECONSTRUCTION_S;

  // Determine visible tile range (with margin)
  const startCol = Math.max(0, Math.floor(cameraX / TILE) - VISIBILITY_MARGIN);
  const endCol = Math.min(state.width, Math.ceil((cameraX + canvas.width) / TILE) + VISIBILITY_MARGIN);
  const startRow = Math.max(0, Math.floor(cameraY / TILE) - VISIBILITY_MARGIN);
  const endRow = Math.min(state.height, Math.ceil((cameraY + canvas.height) / TILE) + VISIBILITY_MARGIN);

  // Draw tiles — respect visibility and the per-tile construction reveal.
  for (let y = startRow; y < endRow; y++) {
    for (let x = startCol; x < endCol; x++) {
      const visible = isVisible(state, x, y);
      const explored = isExplored(state, x, y);

      if (!visible && !explored) continue;

      // Per-tile reveal: deterministic delay from coords + brief flash.
      const tileSeed = hash01(x * 73.13 + y * 131.7);
      const tileDelay = tileSeed * TILE_DELAY_MAX_FRAC;
      const tileLocalT = (constT - tileDelay) / tileRevealT;
      if (tileLocalT <= 0) continue; // not yet revealed

      // Per-tile dissolve: same seeded delay, mirrored — tiles fade out
      // back to noise. dissolveT 0 → 1 over (delay → delay + reveal).
      const dissolveLocalT = deconstructionStart === null
        ? 0
        : (deconT - tileDelay) / tileDissolveT;
      if (dissolveLocalT >= 1) continue; // fully dissolved

      const baseAlpha = visible ? 1.0 : EXPLORED_ALPHA;
      const tile = getTile(state, x, y);

      // The tile alpha is the lower of "constructed-in" and "not-yet-dissolved".
      const constructedAlpha = Math.min(1, tileLocalT);
      const dissolveAlpha = Math.max(0, 1 - Math.max(0, dissolveLocalT));
      const tileAlpha = constructedAlpha * dissolveAlpha;

      if (tileAlpha < 1) {
        // Fading (in or out) + amber noise sprinkle inside tile bounds.
        ctx.save();
        ctx.globalAlpha = baseAlpha * tileAlpha;
        drawTile(ctx, tile, x, y);
        ctx.restore();

        const tx = x * TILE;
        const ty = y * TILE;
        // Noise density driven by whichever fade is active.
        const noiseDensity = Math.max(1 - constructedAlpha, 1 - dissolveAlpha);
        const dotCount = Math.floor(18 * noiseDensity);
        ctx.save();
        ctx.fillStyle = '#ffb040';
        ctx.shadowColor = '#ffb040';
        ctx.shadowBlur = 2;
        for (let i = 0; i < dotCount; i++) {
          const seed = (x * 31 + y * 17 + i) * 7.3 + animTime * 60;
          const px = tx + hash01(seed) * TILE;
          const py = ty + hash01(seed + 0.5) * TILE;
          ctx.globalAlpha = noiseDensity * (0.4 + hash01(seed + 1.1) * 0.5);
          const ps = 1 + Math.floor(hash01(seed + 2.0) * 2);
          ctx.fillRect(Math.floor(px), Math.floor(py), ps, ps);
        }
        ctx.restore();
      } else {
        if (!visible) ctx.globalAlpha = EXPLORED_ALPHA;
        drawTile(ctx, tile, x, y);
        if (!visible) ctx.globalAlpha = 1.0;
      }
    }
  }

  // Final lock-in scanline sweep — bright amber bar travels top→bottom over
  // the last 25% of the construction window.
  const worldW = state.width * TILE;
  const worldH = state.height * TILE;
  if (constT > 0.75 && constT < 1) {
    const sweepProg = (constT - 0.75) / 0.25; // 0 → 1
    const sweepY = sweepProg * worldH;
    const sweepA = Math.max(0, 1 - Math.abs(sweepProg - 0.5) * 1.6);
    ctx.save();
    ctx.globalAlpha = sweepA * 0.85;
    ctx.fillStyle = '#ffb040';
    ctx.shadowColor = '#ffb040';
    ctx.shadowBlur = 12;
    ctx.fillRect(0, sweepY - 1, worldW, 2);
    ctx.restore();
  }

  // Deconstruction wipe — bright amber bar travels bottom→top over the
  // first 25% of the dissolve window, then tiles fade out behind it.
  if (deconstructionStart !== null && deconT < 0.25) {
    const sweepProg = deconT / 0.25; // 0 → 1
    const sweepY = (1 - sweepProg) * worldH;
    const sweepA = Math.max(0, 1 - Math.abs(sweepProg - 0.5) * 1.6);
    ctx.save();
    ctx.globalAlpha = sweepA * 0.85;
    ctx.fillStyle = '#ffb040';
    ctx.shadowColor = '#ffb040';
    ctx.shadowBlur = 12;
    ctx.fillRect(0, sweepY - 1, worldW, 2);
    ctx.restore();
  }

  // Hold all entity rendering until the floor is built — they'll then
  // animate in via their own materialize/spawn effects.
  if (constT < 1) {
    ctx.restore();
    return;
  }
  // Once deconstruction starts, entities fade out alongside their tiles.
  // Past deconT >= 0.5, drop them entirely — actor death/exit visuals will
  // have completed by then, and the room is mostly noise.
  if (deconstructionStart !== null && deconT >= 0.5) {
    ctx.restore();
    return;
  }

  // Draw visible dungeon objects (tiles → objects → items → monsters → player)
  for (const obj of (state.floorObjects || [])) {
    if (isVisible(state, obj.x, obj.y) && !obj.hidden) {
      const visualType = obj.type === 'door'
        ? (obj.state?.open ? 'door_open' : 'door_closed')
        : obj.type;
      drawObject(ctx, obj.x * TILE + TILE / 2, obj.y * TILE + TILE / 2, visualType, animTime, obj.colors);
    }
  }

  // Draw visible floor items
  for (const item of state.floorItems) {
    if (isVisible(state, item.x, item.y)) {
      drawItem(ctx, item.x * TILE + TILE / 2, item.y * TILE + TILE / 2, item.type, animTime, item.colors);
    }
  }

  // Draw monsters — live ones at full alpha, recently-dead corpses dimmed
  // while any projectile / death burst / grace window still covers them.
  // Selectors still filter by isAlive; this only affects rendering.
  const CORPSE_GRACE_TICKS = 1;
  for (const m of state.monsters) {
    if (!isVisible(state, m.x, m.y)) continue;
    const mx = m.x * TILE + TILE / 2;
    const my = m.y * TILE + TILE / 2;
    if (isAlive(m)) {
      drawMonster(ctx, mx, my, m.type, animTime, m.colors, m.baseVisual);
      drawOverlaysFor(ctx, overlaysByAttach.get(m.id), mx, my);
    } else {
      const graceLeft = state.tick - (m.deadAt ?? state.tick) < CORPSE_GRACE_TICKS;
      const held = hasActiveEffectFor(state, m.id);
      if (!graceLeft && !held) continue;
      ctx.save();
      ctx.globalAlpha = 0.5;
      drawMonster(ctx, mx, my, m.type, animTime, m.colors, m.baseVisual);
      ctx.restore();
    }
  }

  // Draw player + overlays
  const px = player.x * TILE + TILE / 2;
  const py = player.y * TILE + TILE / 2;
  drawMage(ctx, px, py, animTime, player.colors);
  drawOverlaysFor(ctx, overlaysByAttach.get(player.id), px, py);

  // Draw clouds (first-class game entities) — per-tile, FOV-aware
  drawClouds(ctx, state);

  // Draw projectiles and area effects on top
  drawProjectileAndAreaEffects(ctx, state);

  ctx.restore();
}

function drawClouds(ctx, state) {
  if (!state.clouds?.length) return;
  for (const cloud of state.clouds) {
    const def = CLOUD_DEFS[cloud.kind];
    if (!def) continue;
    const fade = cloud.maxDuration ? Math.min(1, cloud.duration / Math.max(1, cloud.maxDuration)) : 1;
    // Soft fade in the final turn so dissipation reads visually.
    const alpha = cloud.duration <= 1 ? 0.45 : Math.max(0.55, fade);
    ctx.save();
    ctx.globalAlpha = alpha;
    for (const tile of cloud.tiles) {
      if (!isVisible(state, tile.x, tile.y)) continue;
      drawEffect(ctx, def.render, {
        cx: tile.x * TILE + TILE / 2,
        cy: tile.y * TILE + TILE / 2,
        tileX: tile.x,
        tileY: tile.y,
      }, animTime, def.colors);
    }
    ctx.restore();
  }
}

function drawOverlaysFor(ctx, overlays, cx, cy) {
  if (!overlays || !overlays.length) return;
  for (const e of overlays) {
    if (e.delay > 0) continue;
    const t = e.duration > 0 ? e.elapsed / e.duration : e.elapsed;
    drawEffect(ctx, e.name, { cx, cy }, t, e.colors);
  }
}

function drawProjectileAndAreaEffects(ctx, state) {
  if (!state.activeEffects?.length) return;
  for (const e of state.activeEffects) {
    if (e.delay > 0) continue;
    const t = e.duration > 0 ? Math.min(1, e.elapsed / e.duration) : e.elapsed;
    if (e.kind === 'projectile' && e.from && e.to) {
      drawEffect(ctx, e.name, {
        x1: e.from.x * TILE + TILE / 2,
        y1: e.from.y * TILE + TILE / 2,
        x2: e.to.x * TILE + TILE / 2,
        y2: e.to.y * TILE + TILE / 2,
      }, t, e.colors);
    } else if (e.kind === 'area' && e.at) {
      drawEffect(ctx, e.name, {
        cx: e.at.x * TILE + TILE / 2,
        cy: e.at.y * TILE + TILE / 2,
        radius: e.radius ?? 1,
        text: e.text,
      }, t, e.colors);
    } else if (e.kind === 'tileCloud' && e.tiles?.length) {
      // Per-tile render — skip tiles outside FOV so clouds don't leak behind walls.
      for (const tile of e.tiles) {
        if (!isVisible(state, tile.x, tile.y)) continue;
        drawEffect(ctx, e.name, {
          cx: tile.x * TILE + TILE / 2,
          cy: tile.y * TILE + TILE / 2,
          tileX: tile.x,
          tileY: tile.y,
        }, e.elapsed, e.colors);
      }
    }
  }
}

// ── Resize ──────────────────────────────────────────────────

function resizeCanvas() {
  const canvas = getCanvas();
  if (!canvas?.parentElement) return;
  const rect = canvas.parentElement.getBoundingClientRect();
  // Size to the immediate parent (#game-view in Grimoire). No outer layout
  // dependency — host is responsible for giving the parent a height.
  canvas.width  = Math.max(1, Math.floor(rect.width));
  canvas.height = Math.max(1, Math.floor(rect.height));
}
