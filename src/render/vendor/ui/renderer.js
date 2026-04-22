// Canvas renderer — wireframe dungeon aesthetic.
// Reads game state, draws to canvas. No state mutation.

import { getTile, isVisible, isExplored, isAlive } from '../engine/game-state.js';
import { TILE, C, setCanvas, getCanvas, getCtx } from './render-context.js';
import { drawTile } from './render-tiles.js';
import { drawMage, drawItem, drawMonster } from './render-entities.js';
import { drawObject } from './render-objects.js';
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

// ── Public API ──────────────────────────────────────────────

export function initRenderer(canvasElement) {
  setCanvas(canvasElement);
  resizeCanvas();
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

  // Update camera to center on player
  const targetCamX = player.x * TILE - canvas.width / 2 + TILE / 2;
  const targetCamY = player.y * TILE - canvas.height / 2 + TILE / 2;
  cameraX += (targetCamX - cameraX) * CAMERA_DAMPING;
  cameraY += (targetCamY - cameraY) * CAMERA_DAMPING;

  // Clear
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.translate(-Math.round(cameraX), -Math.round(cameraY));

  // Determine visible tile range (with margin)
  const startCol = Math.max(0, Math.floor(cameraX / TILE) - VISIBILITY_MARGIN);
  const endCol = Math.min(state.width, Math.ceil((cameraX + canvas.width) / TILE) + VISIBILITY_MARGIN);
  const startRow = Math.max(0, Math.floor(cameraY / TILE) - VISIBILITY_MARGIN);
  const endRow = Math.min(state.height, Math.ceil((cameraY + canvas.height) / TILE) + VISIBILITY_MARGIN);

  // Draw tiles — respect visibility
  for (let y = startRow; y < endRow; y++) {
    for (let x = startCol; x < endCol; x++) {
      const visible = isVisible(state, x, y);
      const explored = isExplored(state, x, y);

      if (!visible && !explored) continue;

      if (!visible) ctx.globalAlpha = EXPLORED_ALPHA;

      const tile = getTile(state, x, y);
      drawTile(ctx, tile, x, y);

      if (!visible) ctx.globalAlpha = 1.0;
    }
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
  drawOverlaysFor(ctx, overlaysByAttach.get('player'), px, py);

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
